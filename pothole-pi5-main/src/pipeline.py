"""Main orchestration pipeline: detect -> segment -> depth -> measure -> track -> GPS -> report."""
import os
import logging
import time
import numpy as np
import cv2
from typing import Dict, List, Optional

logger = logging.getLogger("pothole_drone_ai.pipeline")


class InspectionPipeline:
    """End-to-end pothole inspection pipeline."""

    def __init__(self, config_path=None):
        from .utils import load_config
        self.config = load_config(config_path)
        self._init_modules()

    def _init_modules(self):
        from .detection import PotholeDetector
        from .depth_estimation import DepthProcessor
        from .road_plane import RoadPlaneEstimator
        from .measurement import MeasurementEngine
        from .severity import SeverityClassifier
        from .tracking import IoUTracker
        from .gps import GPSReader
        from .report import ReportGenerator
        from .calibration import CameraCalibrator

        cam = self.config["camera"]
        self.K = np.array(cam["camera_matrix"], dtype=np.float64)
        self.D = np.array(cam["distortion_coefficients"], dtype=np.float64)
        self.height_m = cam["mount"]["height_m"]
        self.pitch_deg = cam["mount"]["pitch_angle_deg"]
        self.image_size = (cam.get("image_width", 1280), cam.get("image_height", 720))

        self.detector = PotholeDetector(self.config["detection"])
        self.depth_processor = DepthProcessor(self.config["depth"])
        self.road_estimator = RoadPlaneEstimator(self.config["road_plane"])
        self.measurement_engine = MeasurementEngine(self.config["measurement"])
        self.measurer = self.measurement_engine.create_measurer(self.K, self.D, self.height_m, self.pitch_deg)
        self.severity = SeverityClassifier(self.config["severity"])
        self.tracker = IoUTracker(self.config["tracking"])
        self.gps = GPSReader(self.config["gps"])
        self.report_gen = ReportGenerator(os.path.join(self.config["output"]["output_dir"], "reports"))

        logger.info("Pipeline initialized successfully")

    def process_image(self, image, right_image=None, depth_frame=None, metadata=None):
        """Process a single image frame."""
        t_start = time.time()

        # 1. Detection
        detections = self.detector.detect(image)
        if not detections:
            return [], time.time() - t_start

        # 2. Depth map
        depth_map = self.depth_processor.get_depth_map(image, right_image, depth_frame)

        # 3. Process each detection
        results = []
        for det in detections:
            # Use mask_prob as segmentation if available, else use bbox
            if "mask_prob" in det:
                from .segmentation import process_segmentation_output
                seg_results = process_segmentation_output(det["mask_prob"], self.config["segmentation"])
                if seg_results:
                    seg = seg_results[0]
                else:
                    # Fallback: create mask from bbox
                    seg = self._bbox_to_seg(det, image.shape[:2])
            else:
                seg = self._bbox_to_seg(det, image.shape[:2])

            pothole_mask = seg.get("mask", np.zeros(image.shape[:2], dtype=np.uint8))
            contour = seg.get("contour", self._bbox_to_contour(det["bbox"]))

            # 4. Depth processing for this pothole
            depth_stats = None
            depth_confidence = 0.0
            pothole_depth_map = None
            if depth_map is not None:
                depth_stats_raw = self.depth_processor.get_depth_in_pothole(depth_map, pothole_mask)
                road_plane = self.road_estimator.estimate_plane(depth_map, pothole_mask, self.K)
                if depth_stats_raw and road_plane["road_surface_depth_m"] is not None:
                    pothole_depth_map = self.road_estimator.compute_pothole_depth_map(
                        depth_map, pothole_mask, road_plane)
                    depth_stats = self.road_estimator.compute_pothole_depth_stats(
                        pothole_depth_map, pothole_mask, pixel_area_m2=None)
                    depth_confidence = self.depth_processor.get_depth_confidence(
                        depth_stats_raw, seg.get("area_px", 0),
                        image.shape[0] * image.shape[1], self.height_m)
                elif depth_stats_raw:
                    depth_stats = depth_stats_raw
                    depth_confidence = depth_confidence

            # 5. Measurement
            measurement = self.measurer.measure_all(contour, depth_stats, depth_confidence)

            # 6. Severity
            measurement["severity"] = self.severity.classify(measurement)

            # GPS
            gps_pos = self.gps.get_position_or_none()

            results.append({
                "detection": det,
                "measurement": measurement,
                "contour": contour,
                "mask": pothole_mask,
                "depth_map": pothole_depth_map,
                "gps": gps_pos,
            })

        # 7. Tracking
        track_dets = [{"bbox": r["detection"]["bbox"], "measurement": r["measurement"],
                       "confidence": r["detection"]["confidence"]} for r in results]
        tracked = self.tracker.update(track_dets)

        # Merge tracked IDs with results
        for i, r in enumerate(results):
            if i < len(tracked):
                r["pothole_id"] = tracked[i]["pothole_id"]
                r["frames_detected"] = tracked[i]["frames_detected"]
                if tracked[i].get("measurement"):
                    r["measurement"] = tracked[i]["measurement"]
            else:
                r["pothole_id"] = f"P{i+1:03d}"

            if r.get("gps"):
                r["latitude"] = r["gps"].get("latitude")
                r["longitude"] = r["gps"].get("longitude")

        elapsed = time.time() - t_start
        logger.info(f"Processed frame: {len(results)} potholes in {elapsed:.3f}s")
        return results, elapsed

    def _bbox_to_seg(self, detection, image_shape):
        h, w = image_shape
        x1, y1, x2, y2 = [int(v) for v in detection["bbox"]]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        mask = np.zeros((h, w), dtype=np.uint8)
        mask[y1:y2, x1:x2] = 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contour = contours[0] if contours else np.array([[x1,y1],[x2,y1],[x2,y2],[x1,y2]])
        return {
            "mask": mask, "contour": contour,
            "area_px": float(cv2.contourArea(contour)),
            "bbox": (x1, y1, x2-x1, y2-y1),
            "center": ((x1+x2)//2, (y1+y2)//2),
        }

    def _bbox_to_contour(self, bbox):
        x1, y1, x2, y2 = [int(v) for v in bbox]
        return np.array([[x1,y1],[x2,y1],[x2,y2],[x1,y2]])

    def process_video(self, video_path, output_dir=None):
        """Process a video file frame by frame."""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Cannot open video: {video_path}")
            return []
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_skip = self.config["performance"].get("frame_skip", 2)
        all_results = []
        frame_idx = 0
        out_dir = output_dir or os.path.join(self.config["output"]["output_dir"], "detections")
        os.makedirs(out_dir, exist_ok=True)

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1
            if frame_idx % frame_skip != 0:
                continue

            results, elapsed = self.process_image(frame)
            all_results.append({"frame": frame_idx, "detections": results, "time": elapsed})

            if results and self.config["output"].get("save_annotated_images", True):
                from .visualization import draw_frame_detections
                vis_items = [{"detection": r["detection"], "measurement": r["measurement"],
                              "pothole_id": r.get("pothole_id", "P000")} for r in results]
                annotated = draw_frame_detections(frame, vis_items)
                out_path = os.path.join(out_dir, f"frame_{frame_idx:06d}.jpg")
                cv2.imwrite(out_path, annotated)
        cap.release()
        logger.info(f"Video done: {frame_idx} frames")
        return all_results

    def process_folder(self, folder_path, output_dir=None):
        out_dir = output_dir or os.path.join(self.config["output"]["output_dir"], "detections")
        os.makedirs(out_dir, exist_ok=True)
        all_results = []
        exts = {".jpg", ".jpeg", ".png", ".bmp"}
        files = sorted([f for f in os.listdir(folder_path) if os.path.splitext(f)[1].lower() in exts])
        for fname in files:
            image = cv2.imread(os.path.join(folder_path, fname))
            if image is None: continue
            results, elapsed = self.process_image(image)
            all_results.append({"file": fname, "detections": results, "time": elapsed})
            if results:
                from .visualization import draw_frame_detections
                vis = [{"detection": r["detection"], "measurement": r["measurement"],
                        "pothole_id": r.get("pothole_id","P000")} for r in results]
                annotated = draw_frame_detections(image, vis)
                cv2.imwrite(os.path.join(out_dir, f"annotated_{fname}"), annotated)
        return all_results

    def generate_report(self, all_results):
        flat = []
        for rs in all_results:
            for r in rs.get("detections", []):
                flat.append({
                    "pothole_id": r.get("pothole_id", "P000"),
                    "confidence": r["detection"]["confidence"],
                    "measurement": r.get("measurement"),
                    "severity": r.get("measurement", {}).get("severity", "UNKNOWN"),
                    "latitude": r.get("latitude"),
                    "longitude": r.get("longitude"),
                })
        report = self.report_gen.generate(flat)
        self.report_gen.save_json_report(report)
        self.report_gen.save_markdown_report(report)
        return report
