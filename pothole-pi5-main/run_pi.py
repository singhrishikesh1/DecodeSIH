#!/usr/bin/env python3
"""
Raspberry Pi 5 — Pothole Detection & Measurement Runner

Full pipeline:
    Camera → Detection → Segmentation → Measurement → GPS → Report

Usage:
    python run_pi.py                         # Default camera, default model
    python run_pi.py --model weights/pi/pothole_int8.onnx  # Use quantized model
    python run_pi.py --camera 1 --width 640 --height 480   # USB camera
    python run_pi.py --image /path/to/photo.jpg             # Process single image
    python run_pi.py --video /path/to/video.mp4             # Process video file
    python run_pi.py --gps /dev/ttyUSB0                     # Enable GPS

Hardware:
    - Raspberry Pi 5 (4GB or 8GB recommended)
    - Pi Camera Module v2/v3 (CSI) or USB webcam
    - Optional: GPS module on UART
    - Optional: Intel RealSense for depth
"""
import os
import sys
import time
import json
import argparse
import logging
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.utils import load_config
from src.measurement import PotholeMeasurement
from src.severity import SeverityClassifier
from src.tracking import IoUTracker

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("run_pi")


def load_model(model_path):
    """Load ONNX model using onnxruntime."""
    import onnxruntime as ort

    # Check available providers
    available = ort.get_available_providers()
    providers = ["CPUExecutionProvider"]
    logger.info(f"ONNX Runtime providers: {available}")

    session = ort.InferenceSession(model_path, providers=providers)
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    logger.info(f"Model loaded: {model_path}")
    logger.info(f"Input: {input_name}, shape: {input_shape}")
    return session, input_name


def preprocess(frame, input_size=(640, 640)):
    """Preprocess frame for YOLO inference."""
    img = cv2.resize(frame, input_size)
    img = img[:, :, ::-1].astype(np.float32) / 255.0  # BGR→RGB, normalize
    img = np.transpose(img, (2, 0, 1))  # HWC→CHW
    return np.expand_dims(img, axis=0)  # NCHW


def postprocess(output, orig_h, orig_w, conf_threshold=0.3, input_size=640):
    """Parse YOLOv8 output into detections."""
    predictions = output[0]
    if len(predictions.shape) == 3:
        predictions = predictions[0]

    # Transpose if needed: YOLOv8 outputs (features, N) → want (N, features)
    if predictions.ndim == 2 and predictions.shape[0] < predictions.shape[1]:
        det = predictions.T
    else:
        det = predictions

    detections = []
    if det.ndim != 2 or det.shape[1] < 6:
        return detections

    for i in range(det.shape[0]):
        conf = float(det[i, 4])
        if conf < conf_threshold:
            continue

        cx, cy, w, h = det[i, 0], det[i, 1], det[i, 2], det[i, 3]
        x1 = (cx - w / 2) / input_size * orig_w
        y1 = (cy - h / 2) / input_size * orig_h
        x2 = (cx + w / 2) / input_size * orig_w
        y2 = (cy + h / 2) / input_size * orig_h

        detections.append({
            "bbox": [max(0, int(x1)), max(0, int(y1)),
                     min(orig_w, int(x2)), min(orig_h, int(y2))],
            "confidence": conf,
        })

    # Simple NMS
    if len(detections) > 1:
        detections = simple_nms(detections, iou_threshold=0.5)

    return detections


def simple_nms(detections, iou_threshold=0.5):
    """Non-maximum suppression."""
    if not detections:
        return []

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    keep = []

    for det in detections:
        if all(iou(det["bbox"], k["bbox"]) < iou_threshold for k in keep):
            keep.append(det)

    return keep


def iou(box1, box2):
    """Intersection over Union between two [x1,y1,x2,y2] boxes."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0


def contour_from_bbox(bbox):
    """Convert bounding box to contour for measurement."""
    x1, y1, x2, y2 = bbox
    return np.array([
        [x1, y1], [x2, y1], [x2, y2], [x1, y2]
    ], dtype=np.float32).reshape(-1, 1, 2)


def draw_detection(frame, bbox, measurement, pothole_id, color):
    """Draw bounding box, label, and measurement on frame."""
    x1, y1, x2, y2 = bbox

    # Bounding box
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    # Label background
    lines = [f"{pothole_id}"]
    if measurement.get("length_cm") and measurement.get("width_cm"):
        lines.append(f"{measurement['length_cm']:.0f}x{measurement['width_cm']:.0f}cm")
    lines.append(f"Severity: {measurement.get('severity', 'N/A')}")

    y_off = y1 - 5
    for line in lines:
        (tw, th), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        if y_off - th - 8 < 0:
            y_off = y2 + th + 10
        cv2.rectangle(frame, (x1, y_off - th - 8), (x1 + tw + 8, y_off), color, -1)
        cv2.putText(frame, line, (x1 + 4, y_off - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        y_off -= th + 10


def process_single_image(args):
    """Process a single image file."""
    frame = cv2.imread(args.image)
    if frame is None:
        print(f"Error: Cannot read {args.image}")
        return

    config = load_config(args.config)
    session, input_name = load_model(args.model)
    measurer = PotholeMeasurement(
        np.array(config["camera"]["camera_matrix"]),
        np.array(config["camera"]["distortion_coefficients"]),
        config["camera"]["mount"]["height_m"],
    )
    sev = SeverityClassifier(config["severity"])

    # Run detection
    t0 = time.time()
    blob = preprocess(frame)
    output = session.run(None, {input_name: blob})[0]
    detections = postprocess(output, frame.shape[0], frame.shape[1], args.confidence)
    infer_time = (time.time() - t0) * 1000

    # Measure each pothole
    colors = {"LOW": (0, 255, 0), "MEDIUM": (0, 255, 255),
              "HIGH": (0, 165, 255), "CRITICAL": (0, 0, 255)}

    print(f"\nDetected {len(detections)} potholes in {infer_time:.0f}ms")
    print("-" * 60)

    results = []
    for i, det in enumerate(detections):
        contour = contour_from_bbox(det["bbox"])
        meas = measurer.measure_all(contour)
        meas["severity"] = sev.classify(meas)

        pid = f"P{i+1:03d}"
        color = colors.get(meas["severity"], (255, 255, 255))
        draw_detection(frame, det["bbox"], meas, pid, color)

        print(f"{pid}: {det['confidence']:.0%} conf | "
              f"{meas.get('length_cm', 0):.1f} x {meas.get('width_cm', 0):.1f} cm | "
              f"Severity: {meas['severity']}")

        results.append({
            "id": pid,
            "confidence": det["confidence"],
            **{k: v for k, v in meas.items() if v is not None},
        })

    print("-" * 60)

    # Save result
    out_path = args.image.replace(".", "_detected.", 1) if "." in args.image else args.image + "_detected"
    cv2.imwrite(out_path, frame)
    print(f"Saved: {out_path}")

    # Save JSON
    json_path = out_path.rsplit(".", 1)[0] + ".json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"Saved: {json_path}")

    return results


def process_camera_stream(args):
    """Live camera detection loop for Raspberry Pi 5."""
    from src.camera_pi import PiCamera

    config = load_config(args.config)
    session, input_name = load_model(args.model)
    measurer = PotholeMeasurement(
        np.array(config["camera"]["camera_matrix"]),
        np.array(config["camera"]["distortion_coefficients"]),
        config["camera"]["mount"]["height_m"],
    )
    sev = SeverityClassifier(config["severity"])
    tracker = IoUTracker(iou_threshold=0.3, max_age=30)

    colors = {"LOW": (0, 255, 0), "MEDIUM": (0, 255, 255),
              "HIGH": (0, 165, 255), "CRITICAL": (0, 0, 255)}

    # GPS (optional)
    gps_reader = None
    if args.gps:
        from src.gps import GPSReader
        gps_reader = GPSReader(port=args.gps)

    # Open camera
    camera = PiCamera(width=args.width, height=args.height, fps=args.fps,
                      camera_id=args.camera)
    if not camera.open():
        print("Error: Cannot open camera")
        return

    camera.start_capture()
    print(f"\n{'=' * 60}")
    print("  POHOLE DETECTION — LIVE CAMERA")
    print(f"  Model: {args.model}")
    print(f"  Camera: {args.width}x{args.height}")
    print(f"  Press 'q' to quit, 's' to save frame")
    print(f"{'=' * 60}\n")

    # Output directory
    save_dir = Path("outputs/detections")
    save_dir.mkdir(parents=True, exist_ok=True)

    frame_count = 0
    total_detections = 0
    fps_display = 0
    last_fps_time = time.time()
    fps_frame_count = 0

    try:
        while True:
            frame = camera.read()
            if frame is None:
                time.sleep(0.01)
                continue

            frame_count += 1
            fps_frame_count += 1

            # FPS counter
            now = time.time()
            if now - last_fps_time >= 1.0:
                fps_display = fps_frame_count / (now - last_fps_time)
                fps_frame_count = 0
                last_fps_time = now

            # Run detection
            t0 = time.time()
            blob = preprocess(frame)
            output = session.run(None, {input_name: blob})[0]
            detections = postprocess(output, frame.shape[0], frame.shape[1],
                                     args.confidence)
            infer_time = (time.time() - t0) * 1000

            # Track potholes across frames
            boxes = [d["bbox"] for d in detections]
            tracked = tracker.update(boxes)

            # Measure and draw
            for det, track_id in zip(detections, tracked):
                contour = contour_from_bbox(det["bbox"])
                meas = measurer.measure_all(contour)
                meas["severity"] = sev.classify(meas)

                pid = f"P{track_id:03d}"
                color = colors.get(meas["severity"], (255, 255, 255))
                draw_detection(frame, det["bbox"], meas, pid, color)
                total_detections += 1

            # HUD
            hud_y = 30
            cv2.putText(frame, f"FPS: {fps_display:.1f}", (10, hud_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Inference: {infer_time:.0f}ms", (10, hud_y + 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Potholes: {len(detections)}", (10, hud_y + 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Frame: {frame_count}", (10, hud_y + 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            if gps_reader:
                gps = gps_reader.read()
                if gps:
                    cv2.putText(frame, f"GPS: {gps['latitude']:.5f}, {gps['longitude']:.5f}",
                                (10, hud_y + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                                (255, 255, 0), 2)

            # Display
            cv2.imshow("Pothole Detection", frame)

            # Keyboard
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("s"):
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                path = save_dir / f"detection_{ts}.jpg"
                cv2.imwrite(str(path), frame)
                print(f"Saved: {path}")

    except KeyboardInterrupt:
        print("\nStopped by user")
    finally:
        camera.stop()
        cv2.destroyAllWindows()

        # Summary
        print(f"\n{'=' * 60}")
        print(f"  SUMMARY")
        print(f"  Frames processed:    {frame_count}")
        print(f"  Total detections:    {total_detections}")
        print(f"  Average FPS:         {fps_display:.1f}")
        print(f"{'=' * 60}")


def process_video(args):
    """Process a video file."""
    config = load_config(args.config)
    session, input_name = load_model(args.model)
    measurer = PotholeMeasurement(
        np.array(config["camera"]["camera_matrix"]),
        np.array(config["camera"]["distortion_coefficients"]),
        config["camera"]["mount"]["height_m"],
    )
    sev = SeverityClassifier(config["severity"])

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"Error: Cannot open video {args.video}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"Video: {args.video} ({total_frames} frames @ {fps:.1f}fps)")

    colors = {"LOW": (0, 255, 0), "MEDIUM": (0, 255, 255),
              "HIGH": (0, 165, 255), "CRITICAL": (0, 0, 255)}

    out_path = args.video.rsplit(".", 1)[0] + "_detected.mp4"
    writer = None

    frame_num = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_num += 1
        blob = preprocess(frame)
        output = session.run(None, {input_name: blob})[0]
        detections = postprocess(output, frame.shape[0], frame.shape[1],
                                 args.confidence)

        for i, det in enumerate(detections):
            contour = contour_from_bbox(det["bbox"])
            meas = measurer.measure_all(contour)
            meas["severity"] = sev.classify(meas)
            color = colors.get(meas["severity"], (255, 255, 255))
            draw_detection(frame, det["bbox"], meas, f"P{i+1:03d}", color)

        if writer is None:
            h, w = frame.shape[:2]
            writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                                     fps, (w, h))

        writer.write(frame)

        if frame_num % 100 == 0:
            print(f"  Frame {frame_num}/{total_frames}")

    cap.release()
    if writer:
        writer.release()
    print(f"Done. Output: {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Pothole Detection — Raspberry Pi 5")

    # Model
    parser.add_argument("--model", default="weights/pretrained/best.pt",
                        help="ONNX or PT model path")
    parser.add_argument("--config", default="config/config.yaml",
                        help="Config file path")
    parser.add_argument("--confidence", type=float, default=0.3,
                        help="Detection confidence threshold")

    # Camera
    parser.add_argument("--camera", type=int, default=0,
                        help="Camera device ID (0=CSI, 1+=USB)")
    parser.add_argument("--width", type=int, default=640,
                        help="Camera width")
    parser.add_argument("--height", type=int, default=480,
                        help="Camera height")
    parser.add_argument("--fps", type=int, default=30,
                        help="Camera FPS")

    # Input modes
    parser.add_argument("--image", help="Process single image file")
    parser.add_argument("--video", help="Process video file")
    parser.add_argument("--gps", help="GPS serial port (e.g. /dev/ttyUSB0)")

    args = parser.parse_args()

    if args.image:
        process_single_image(args)
    elif args.video:
        process_video(args)
    else:
        process_camera_stream(args)


if __name__ == "__main__":
    main()
