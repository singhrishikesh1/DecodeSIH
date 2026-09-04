"""
Visual verification - run trained model on test images and save annotated output.
Open the saved images to SEE the model working.
"""
import os, sys, csv, random
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src.utils import load_config


def verify():
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    os.makedirs("verification_output", exist_ok=True)

    # Find the trained model
    model_paths = [
        "runs/segment/models/pothole_seg_test/weights/best.pt",
        "models/pothole_seg_test/weights/best.pt",
    ]
    model_path = None
    for p in model_paths:
        if os.path.exists(p):
            model_path = p
            break
    if not model_path:
        print("ERROR: No trained model found. Run: python -m scripts.test_ml_pipeline")
        return
    print(f"Using model: {model_path}")

    from ultralytics import YOLO
    model = YOLO(model_path)

    # Get test images
    test_dir = "dataset/images/test"
    test_images = sorted([f for f in os.listdir(test_dir) if f.endswith(".png")])[:20]
    print(f"\nRunning model on {len(test_images)} test images...\n")

    config = load_config()
    K = np.array(config["camera"]["camera_matrix"], dtype=np.float64)
    D = np.array(config["camera"]["distortion_coefficients"], dtype=np.float64)
    height_m = config["camera"]["mount"]["height_m"]

    from src.measurement import PotholeMeasurement
    measurer = PotholeMeasurement(K, D, height_m)
    from src.severity import SeverityClassifier
    severity = SeverityClassifier(config["severity"])

    SEVERITY_COLORS = {"LOW": (0,255,0), "MEDIUM": (0,255,255),
                       "HIGH": (0,165,255), "CRITICAL": (0,0,255)}

    total_detections = 0
    for idx, fname in enumerate(test_images):
        img_path = os.path.join(test_dir, fname)
        img = cv2.imread(img_path)
        if img is None:
            continue

        # Run inference
        results = model(img, verbose=False)
        r = results[0]
        annotated = img.copy()

        n_detect = len(r.boxes)
        total_detections += n_detect

        if n_detect == 0:
            # Mark as "no detection"
            cv2.putText(annotated, "No potholes detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        else:
            for box_idx in range(n_detect):
                box = r.boxes.xyxy[box_idx].cpu().numpy()
                conf = float(r.boxes.conf[box_idx])
                x1, y1, x2, y2 = [int(v) for v in box]

                # Get segmentation mask if available
                contour = None
                if r.masks is not None and box_idx < len(r.masks):
                    mask_data = r.masks.xy[box_idx]
                    if len(mask_data) >= 3:
                        contour = np.array(mask_data, dtype=np.float32).reshape(-1, 1, 2)

                # If no mask, use bounding box as contour
                if contour is None:
                    contour = np.array([[x1,y1],[x2,y1],[x2,y2],[x1,y2]], dtype=np.float32).reshape(-1, 1, 2)

                # Measure
                meas = measurer.measure_all(contour)
                meas["severity"] = severity.classify(meas)
                color = SEVERITY_COLORS.get(meas["severity"], (255, 255, 255))

                # Draw bounding box
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                # Draw contour outline
                cv2.drawContours(annotated, [contour.astype(int)], -1, color, 2)

                # Build label
                pid = f"P{box_idx+1:03d}"
                label_lines = [f"{pid} ({conf:.0%})"]
                if meas["length_cm"] and meas["width_cm"]:
                    label_lines.append(f"{meas['length_cm']:.1f} x {meas['width_cm']:.1f} cm")
                if meas["max_depth_cm"] is not None:
                    label_lines.append(f"Depth: {meas['max_depth_cm']:.1f} cm")
                else:
                    label_lines.append("Depth: N/A (no depth sensor)")
                label_lines.append(f"Severity: {meas['severity']}")
                label_lines.append(f"Area: {meas['surface_area_cm2']:.0f} cm2" if meas["surface_area_cm2"] else "")

                # Draw labels
                y_offset = y1 - 10
                for line in label_lines:
                    if not line:
                        continue
                    (tw, th), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    cv2.rectangle(annotated, (x1, y_offset - th - 4), (x1 + tw + 4, y_offset), color, -1)
                    cv2.putText(annotated, line, (x1 + 2, y_offset - 2),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
                    y_offset -= th + 6

                # Print to console
                print(f"  {fname}: {pid} conf={conf:.0%} "
                      f"size={meas['length_cm']:.1f}x{meas['width_cm']:.1f}cm "
                      f"area={meas['surface_area_cm2']:.0f}cm2 "
                      f"severity={meas['severity']}")

        # Save annotated image
        out_path = os.path.join("verification_output", f"verified_{idx:03d}_{fname}")
        cv2.imwrite(out_path, annotated)

        # Side-by-side comparison
        h, w = img.shape[:2]
        comparison = np.zeros((h, w * 2 + 10, 3), dtype=np.uint8)
        comparison[:, :w] = img
        comparison[:, w+10:] = annotated
        cv2.putText(comparison, "ORIGINAL", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(comparison, "DETECTED", (w + 20, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        comp_path = os.path.join("verification_output", f"compare_{idx:03d}_{fname}")
        cv2.imwrite(comp_path, comparison)

    print(f"\n{'='*60}")
    print(f"  VERIFICATION COMPLETE")
    print(f"  Total detections across {len(test_images)} images: {total_detections}")
    print(f"  Output folder: verification_output/")
    print(f"  Open verified_*.jpg to see individual results")
    print(f"  Open compare_*.jpg to see side-by-side original vs detected")
    print(f"{'='*60}")


if __name__ == "__main__":
    verify()
