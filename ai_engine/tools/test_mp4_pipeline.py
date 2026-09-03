"""Offline MP4 pipeline test and replay tool.

Uses the EXACT production pipeline components:
  - OnnxPotholeDetector (ONNX model, input_size 640, conf 0.30, nms 0.45)
  - MeasurementEngine
  - SeverityClassifier
  - IoUTracker (min_hits=3, iou_threshold=0.30)
  - PersistenceClient (backend API / DB persistence)
  - LiveStateClient (live view backend stream)

Usage:
    python tools/test_mp4_pipeline.py input.mp4
    python tools/test_mp4_pipeline.py input.mp4 --no-persist
    python tools/test_mp4_pipeline.py input.mp4 --save-debug-video output.mp4
"""
import argparse
import logging
import os
import sys
import time
import cv2

# Ensure ai_engine is in sys.path when executed from tools/ or root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config_loader import load_config
from onnx_detector import OnnxPotholeDetector
from measurement import MeasurementEngine
from severity import SeverityClassifier
from tracking import IoUTracker
from persistence import PersistenceClient
from live_state import LiveStateClient


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)-8s %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def run_mp4_pipeline(mp4_path, config_path=None, no_persist=False, save_debug_video=None, fps_override=None):
    logger = logging.getLogger("drone_ai.mp4_test")
    cfg = load_config(config_path)

    if not os.path.exists(mp4_path):
        logger.error("MP4 file not found: %s", mp4_path)
        return 1

    cap = cv2.VideoCapture(mp4_path)
    if not cap.isOpened():
        logger.error("Failed to open video file: %s", mp4_path)
        return 1

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    logger.info("Processing MP4: %s (%dx%d @ %.1f fps, %d frames)",
                mp4_path, width, height, fps, total_frames)

    measure = MeasurementEngine(cfg["measurement"])
    severity_cls = SeverityClassifier(cfg["severity"])
    tracker = IoUTracker(cfg["tracking"])
    detector = OnnxPotholeDetector(
        model_path=cfg["detection"]["model_path"],
        input_size=cfg["detection"].get("input_size", 640),
        conf_threshold=cfg["detection"].get("confidence_threshold", 0.30),
        nms_threshold=cfg["detection"].get("nms_threshold", 0.45),
        classes=cfg["detection"].get("classes", ["pothole"]),
    )

    if not detector.is_loaded():
        logger.error("Failed to load ONNX detector from %s", cfg["detection"]["model_path"])
        return 1

    persistence = PersistenceClient(
        cfg["persistence"]["backend_url"],
        cfg["persistence"].get("drone_id"),
        physical_dedup=cfg["persistence"].get("physical_dedup", {}),
    )
    live = LiveStateClient(cfg["persistence"]["backend_url"])
    meta = cfg["live"]

    writer = None
    if save_debug_video:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(save_debug_video, fourcc, fps, (width, height))
        logger.info("Saving debug video to: %s", save_debug_video)

    frame_count = 0
    confirmed_total = 0
    persisted_total = 0
    last_live_push = 0.0

    class DummyBuffer:
        def __init__(self):
            self.frame = None
        def set(self, f):
            self.frame = f
        def get(self, require_fresh=False):
            return self.frame

    buf = DummyBuffer()

    start_time = time.time()
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            buf.set(frame)

            # 1. Detection
            detections = detector.detect(frame)

            # 2. Measurement & Severity
            processed = []
            for d in detections:
                m = measure.measure_bbox(d["bbox"])
                s = severity_cls.classify(m)
                processed.append({
                    "bbox": d["bbox"],
                    "confidence": d["confidence"],
                    "class_name": d["class_name"],
                    "measurement": m,
                    "severity": s,
                })

            # 3. Tracker
            confirmed = tracker.update(processed, frame=frame)

            # Attach measurement & severity to confirmed tracks
            by_conf = {tuple(round(v, 1) for v in d["bbox"]): d for d in processed}
            for tr in confirmed:
                tr["measurement"] = tr.get("measurement") or {}
                key = tuple(round(v, 1) for v in tr["bbox"])
                src = by_conf.get(key)
                if src:
                    tr["severity"] = src["severity"]
                    tr["measurement"] = src["measurement"]

            confirmed_total = max(confirmed_total, len(confirmed))

            # 4. GPS (optional offline placeholder)
            gps_fix = None

            # 5. Persistence
            for tr in confirmed:
                if not persistence.already_persisted(tr["track_id"]):
                    if no_persist:
                        logger.info("[NO-PERSIST] Track %s confirmed (conf=%.2f); persistence skipped",
                                    tr["track_id"], tr.get("confidence", 0.0))
                    else:
                        res = persistence.persist_pothole(tr, gps_fix, meta)
                        if res and res.get("potholeId"):
                            persisted_total += 1

            # 6. Live state update
            cls_name = cfg["detection"].get("classes", ["pothole"])[0] if cfg.get("detection") else "pothole"
            detections_last = [{
                "trackId": t["track_id"],
                "bbox": list(t["bbox"]),
                "confidence": t.get("confidence"),
                "conf": t.get("confidence"),
                "cls": cls_name,
                "label": cls_name,
                "labelText": f"{cls_name.capitalize()} #{t['track_id']} ({int((t.get('confidence') or 0) * 100)}%)",
                "severity": (t.get("severity") or {}).get("severity", "UNCLASSIFIED"),
                "frames_detected": t.get("frames_detected"),
            } for t in confirmed]

            now = time.time()
            if not no_persist and (now - last_live_push >= cfg["live"].get("push_interval_s", 1.0)):
                last_live_push = now
                live.push(buf, detections_last, gps_fix, detector, None)

            # Debug overlay
            if writer:
                vis_frame = frame.copy()
                for tr in confirmed:
                    x1, y1, x2, y2 = map(int, tr["bbox"])
                    cv2.rectangle(vis_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    label = f"Pothole #{tr['track_id']} ({tr.get('confidence', 0):.2f})"
                    cv2.putText(vis_frame, label, (x1, max(y1 - 8, 15)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                writer.write(vis_frame)

            if frame_count % 30 == 0 or frame_count == total_frames:
                logger.info("Frame %d/%d processed | Active confirmed tracks: %d",
                            frame_count, total_frames, len(confirmed))

    finally:
        cap.release()
        if writer:
            writer.release()

    elapsed = time.time() - start_time
    logger.info("=================================================")
    logger.info("MP4 Pipeline Processing Complete")
    logger.info("Frames processed: %d in %.2fs (%.1f FPS)", frame_count, elapsed, frame_count / max(elapsed, 0.001))
    logger.info("Confirmed pothole tracks: %d", confirmed_total)
    logger.info("Persisted potholes to backend: %d %s",
                persisted_total if not no_persist else 0, "(skipped)" if no_persist else "")
    logger.info("=================================================")
    return 0


def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="Run production AI detection pipeline on an MP4 file")
    parser.add_argument("mp4_file", help="Path to input MP4 video file")
    parser.add_argument("-c", "--config", default=None, help="Path to config.yaml")
    parser.add_argument("--no-persist", action="store_true", help="Disable backend HTTP persistence")
    parser.add_argument("--save-debug-video", default=None, help="Output MP4 path with rendered bounding boxes")
    parser.add_argument("--fps", type=float, default=None, help="FPS override")

    args = parser.parse_args()
    return run_mp4_pipeline(
        mp4_path=args.mp4_file,
        config_path=args.config,
        no_persist=args.no_persist,
        save_debug_video=args.save_debug_video,
        fps_override=args.fps,
    )


if __name__ == "__main__":
    sys.exit(main())
