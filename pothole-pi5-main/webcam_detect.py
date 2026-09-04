"""
Real-time pothole detection via webcam.

Usage:
    python webcam_detect.py                  # Default webcam (0)
    python webcam_detect.py --camera 1       # Second camera
    python webcam_detect.py --conf 0.2       # Lower confidence threshold
    python webcam_detect.py --save           # Save detection frames
"""
import cv2
import numpy as np
import time
import os
import sys
import argparse
import yaml

from ultralytics import YOLO


def load_config():
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.yaml')
    with open(config_path) as f:
        return yaml.safe_load(f)


def find_model():
    candidates = [
        os.path.join('weights', 'pretrained', 'best.onnx'),
        os.path.join('weights', 'pothole_seg.onnx'),
        os.path.join('weights', 'pi', 'pothole_int8.onnx'),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def draw_hud(frame, fps, n_detections, infer_ms, frame_count):
    """Draw heads-up display overlay on frame."""
    h, w = frame.shape[:2]

    # Top bar - semi-transparent
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 40), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    # Title
    cv2.putText(frame, "POTHOLE DETECTION AI", (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

    # Stats on top right
    fps_text = f"FPS: {fps:.1f}"
    infer_text = f"Inference: {infer_ms:.0f}ms"
    det_text = f"Detections: {n_detections}"
    cv2.putText(frame, det_text, (w - 200, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
    cv2.putText(frame, infer_text, (w - 200, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

    # Bottom bar - detection status
    overlay2 = frame.copy()
    cv2.rectangle(overlay2, (0, h - 35), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay2, 0.6, frame, 0.4, 0, frame)

    if n_detections > 0:
        status = f"POTHOLE DETECTED!  ({n_detections} found)"
        color = (0, 0, 255)  # Red
    else:
        status = "Scanning... No potholes detected"
        color = (100, 100, 100)  # Gray

    cv2.putText(frame, status, (10, h - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

    # Frame counter bottom right
    cv2.putText(frame, f"Frame: {frame_count}", (w - 150, h - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)

    return frame


def draw_detection(frame, box, conf, severity, meas, pothole_id, color_map):
    """Draw a single detection with measurements."""
    x1, y1, x2, y2 = box
    color = color_map.get(severity, (255, 255, 255))

    # Bounding box with thick border
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

    # Corner markers
    corner_len = 15
    for (cx, cy) in [(x1, y1), (x2, y1), (x1, y2), (x2, y2)]:
        dx = corner_len if cx == x1 else -corner_len
        dy = corner_len if cy == y1 else -corner_len
        cv2.line(frame, (cx, cy), (cx + dx, cy), (0, 255, 255), 3)
        cv2.line(frame, (cx, cy), (cx, cy + dy), (0, 255, 255), 3)

    # Label background
    label = f"{pothole_id} | {conf*100:.0f}% | {severity}"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    cv2.rectangle(frame, (x1, y1 - th - 12), (x1 + tw + 8, y1), (0, 0, 0), -1)
    cv2.rectangle(frame, (x1, y1 - th - 12), (x1 + tw + 8, y1), color, 2)
    cv2.putText(frame, label, (x1 + 4, y1 - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    # Measurement box below detection
    if meas:
        length_cm = meas.get('length_cm', 0)
        width_cm = meas.get('width_cm', 0)
        area_cm2 = meas.get('area_cm2', 0)

        meas_lines = [
            f"Size: {length_cm:.1f} x {width_cm:.1f} cm",
            f"Area: {area_cm2:.0f} cm2",
        ]
        my = y2 + 5
        for line in meas_lines:
            (lw, lh), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            cv2.rectangle(frame, (x1, my), (x1 + lw + 8, my + lh + 6), (0, 0, 0), -1)
            cv2.putText(frame, line, (x1 + 4, my + lh + 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 255, 200), 1)
            my += lh + 8

    return frame


def main():
    parser = argparse.ArgumentParser(description='Real-time pothole detection via webcam')
    parser.add_argument('--camera', type=int, default=0, help='Camera device ID (default: 0)')
    parser.add_argument('--conf', type=float, default=0.25, help='Confidence threshold (default: 0.25)')
    parser.add_argument('--model', type=str, default=None, help='Path to ONNX model')
    parser.add_argument('--save', action='store_true', help='Save detection frames to folder')
    parser.add_argument('--width', type=int, default=640, help='Capture width (default: 640)')
    parser.add_argument('--height', type=int, default=480, help='Capture height (default: 480)')
    parser.add_argument('--no-measure', action='store_true', help='Skip physical measurements (faster)')
    args = parser.parse_args()

    # Find model
    model_path = args.model or find_model()
    if not model_path or not os.path.exists(model_path):
        print("ERROR: No model found. Run: python scripts/verify_model.py first")
        sys.exit(1)

    print(f"Loading model: {model_path}")
    model = YOLO(model_path)

    # Load config for measurements
    measurer = None
    sev_cls = None
    if not args.no_measure:
        try:
            config = load_config()
            from src.measurement import PotholeMeasurement
            from src.severity import SeverityClassifier
            K = np.array(config['camera']['camera_matrix'], dtype=np.float64)
            D = np.array(config['camera']['distortion_coefficients'], dtype=np.float64)
            height_m = config['camera']['mount']['height_m']
            measurer = PotholeMeasurement(K, D, height_m)
            sev_cls = SeverityClassifier(config['severity'])
        except Exception as e:
            print(f"Warning: Measurements disabled ({e})")

    # Open webcam
    print(f"Opening camera {args.camera}...")
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"ERROR: Cannot open camera {args.camera}")
        print("Available cameras:")
        for i in range(5):
            test_cap = cv2.VideoCapture(i)
            if test_cap.isOpened():
                print(f"  Camera {i}: AVAILABLE")
                test_cap.release()
            else:
                break
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Camera opened: {actual_w}x{actual_h}")

    # Save folder
    save_dir = os.path.join(os.path.dirname(__file__), 'detection_captures')
    if args.save:
        os.makedirs(save_dir, exist_ok=True)
        print(f"Saving detection frames to: {save_dir}")

    # Color map for severity
    color_map = {
        'LOW': (0, 200, 0),
        'MEDIUM': (0, 255, 255),
        'HIGH': (0, 165, 255),
        'CRITICAL': (0, 0, 255),
    }

    # Controls
    print("\n--- CONTROLS ---")
    print("  q / ESC  - Quit")
    print("  s        - Save current frame")
    print("  SPACE    - Pause/Resume")
    print("  +/-      - Adjust confidence threshold")
    print("  m        - Toggle measurements")
    print("---------------\n")

    paused = False
    frame_count = 0
    detections_total = 0
    fps_history = []
    show_measurements = not args.no_measure
    conf_threshold = args.conf

    window_name = "Pothole Detection AI - Live Feed"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, max(actual_w, 800), max(actual_h, 600))

    while True:
        if not paused:
            ret, frame = cap.read()
            if not ret:
                print("Failed to grab frame. Retrying...")
                time.sleep(0.1)
                continue
            frame_count += 1

        # Run detection
        t0 = time.time()
        results = model(frame, verbose=False, conf=conf_threshold)
        infer_ms = (time.time() - t0) * 1000

        r = results[0]
        n_det = len(r.boxes) if r.boxes is not None else 0

        # Calculate FPS
        fps_history.append(time.time())
        while fps_history and fps_history[0] < time.time() - 1.0:
            fps_history.pop(0)
        fps = len(fps_history)

        # Draw detections
        annotated = frame.copy()
        if n_det > 0:
            detections_total += n_det
            for i in range(n_det):
                box = r.boxes.xyxy[i].cpu().numpy().astype(int)
                conf = float(r.boxes.conf[i])
                x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])

                # Measurement
                meas = {}
                severity = 'UNKNOWN'
                if show_measurements and measurer:
                    w_px = x2 - x1
                    h_px = y2 - y1
                    pixel_area = w_px * h_px
                    K = measurer.K
                    height_m = measurer.height_m
                    area_m2 = (pixel_area * height_m**2) / (float(K[0,0]) * float(K[1,1]))
                    area_cm2 = area_m2 * 10000
                    length_cm = (w_px * height_m * 100) / float(K[0,0])
                    width_cm = (h_px * height_m * 100) / float(K[1,1])
                    meas = {'length_cm': length_cm, 'width_cm': width_cm, 'area_cm2': area_cm2}
                    if sev_cls:
                        meas_dict = {'max_depth_cm': 5.0, 'surface_area_cm2': area_cm2, 'volume_cm3': area_cm2 * 5.0}
                        severity = sev_cls.classify(meas_dict)

                pothole_id = f"P{i+1:03d}"
                annotated = draw_detection(annotated, [x1, y1, x2, y2], conf, severity, meas, pothole_id, color_map)

        # Draw HUD
        annotated = draw_hud(annotated, fps, n_det, infer_ms, frame_count)

        # Show
        cv2.imshow(window_name, annotated)

        # Key handling
        key = cv2.waitKey(1) & 0xFF
        if key in [ord('q'), 27]:  # q or ESC
            break
        elif key == ord('s'):
            save_path = os.path.join(save_dir, f'detection_{frame_count:06d}.jpg')
            cv2.imwrite(save_path, annotated)
            print(f"Saved: {save_path}")
        elif key == ord(' '):
            paused = not paused
            if paused:
                print("PAUSED (press SPACE to resume)")
        elif key in [ord('+'), ord('=')]:
            conf_threshold = max(0.05, conf_threshold - 0.05)
            print(f"Confidence threshold: {conf_threshold:.2f}")
        elif key in [ord('-'), ord('_')]:
            conf_threshold = min(0.95, conf_threshold + 0.05)
            print(f"Confidence threshold: {conf_threshold:.2f}")
        elif key == ord('m'):
            show_measurements = not show_measurements
            print(f"Measurements: {'ON' if show_measurements else 'OFF'}")

    # Cleanup
    cap.release()
    cv2.destroyAllWindows()

    print(f"\n--- SESSION SUMMARY ---")
    print(f"Frames processed:  {frame_count}")
    print(f"Total detections:  {detections_total}")
    print(f"Average FPS:       {fps}")
    if detections_total > 0:
        print(f"Detections saved:  {save_dir}")
    print("-----------------------")


if __name__ == '__main__':
    main()
