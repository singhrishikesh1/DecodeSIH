"""Annotated image and depth map visualization."""
import logging
import numpy as np
import cv2
from typing import Dict, List, Optional

logger = logging.getLogger("pothole_drone_ai.visualization")

SEVERITY_COLORS = {
    "LOW": (0, 255, 0),
    "MEDIUM": (0, 255, 255),
    "HIGH": (0, 165, 255),
    "CRITICAL": (0, 0, 255),
}


def draw_detection(image, detection, measurement=None, pothole_id="P001"):
    """Draw annotated pothole detection on image."""
    result = image.copy()
    bbox = detection["bbox"]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    severity = measurement.get("severity", "UNKNOWN") if measurement else "UNKNOWN"
    color = SEVERITY_COLORS.get(severity, (255, 255, 255))
    confidence = detection.get("confidence", 0)
    # Bounding box
    cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)
    # Label
    label = f"{pothole_id} ({confidence:.0%})"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
    cv2.rectangle(result, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
    cv2.putText(result, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    # Measurement text
    if measurement:
        lines = []
        if measurement.get("length_cm") and measurement.get("width_cm"):
            lines.append(f"{measurement['length_cm']:.1f} x {measurement['width_cm']:.1f} cm")
        if measurement.get("max_depth_cm") is not None:
            lines.append(f"Depth: {measurement['max_depth_cm']:.1f} cm")
        lines.append(f"Severity: {severity}")
        lines.append(f"Confidence: {confidence:.0%}")
        y_offset = y1 + 20
        for line in lines:
            cv2.putText(result, line, (x1 + 5, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
            y_offset += 18
    # Draw polygon/contour if available
    if "contour" in detection:
        cv2.drawContours(result, [detection["contour"]], -1, color, 2)
    elif "mask_prob" in detection:
        mask = detection["mask_prob"]
        if mask.max() > 0:
            contours, _ = cv2.findContours((mask > 0.5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(result, contours, -1, color, 2)
    return result


def draw_frame_detections(image, detections_with_measurements):
    """Draw all detections on a frame."""
    result = image.copy()
    for item in detections_with_measurements:
        result = draw_detection(
            result,
            item["detection"],
            item.get("measurement"),
            item.get("pothole_id", "P000"),
        )
    # Summary at top
    n = len(detections_with_measurements)
    cv2.putText(result, f"Potholes detected: {n}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 3)
    cv2.putText(result, f"Potholes detected: {n}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 1)
    return result


def create_depth_visualization(depth_map, pothole_mask=None):
    """Create color-coded depth visualization."""
    if depth_map is None:
        return None
    valid = depth_map > 0
    if not valid.any():
        return None
    d_min = depth_map[valid].min()
    d_max = depth_map[valid].max()
    if d_max > d_min:
        norm = ((depth_map - d_min) / (d_max - d_min) * 255).astype(np.uint8)
    else:
        norm = np.zeros_like(depth_map, dtype=np.uint8)
    color = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    color[~valid] = 0
    if pothole_mask is not None:
        contours, _ = cv2.findContours(pothole_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(color, contours, -1, (0, 255, 0), 1)
    return color


def save_annotated_image(image, filepath):
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    cv2.imwrite(filepath, image)
    logger.debug(f"Saved annotated image: {filepath}")


import os
