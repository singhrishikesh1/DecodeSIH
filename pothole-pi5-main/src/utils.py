"""
Shared utilities for the Pothole Drone AI system.
Config loading, logging, JSON/image IO, coordinate transforms, NMS.
"""
import os, sys, json, logging, yaml
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def get_project_root() -> Path:
    return PROJECT_ROOT

_config_cache: Optional[Dict] = None

def load_config(config_path: Optional[str] = None) -> Dict:
    global _config_cache
    if _config_cache is not None and config_path is None:
        return _config_cache
    if config_path is None:
        config_path = PROJECT_ROOT / "config" / "config.yaml"
    else:
        config_path = Path(config_path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)
    if _config_cache is None:
        _config_cache = cfg
    return cfg

def get_config_section(section: str) -> Dict:
    cfg = load_config()
    if section not in cfg:
        raise KeyError(f"Config section '{section}' not found")
    return cfg[section]

def setup_logging(level: str = "INFO", log_file: Optional[str] = None) -> logging.Logger:
    _logger = logging.getLogger("pothole_drone_ai")
    if _logger.handlers:
        return _logger
    _logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    fmt = logging.Formatter("[%(asctime)s] %(levelname)-8s %(name)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    _logger.addHandler(ch)
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        fh = logging.FileHandler(log_file)
        fh.setFormatter(fmt)
        _logger.addHandler(fh)
    return _logger

logger = setup_logging()

def save_json(data: Any, filepath: str, indent: int = 2) -> None:
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=indent, default=str)

def load_json(filepath: str) -> Any:
    with open(filepath, "r") as f:
        return json.load(f)

def load_image(filepath: str) -> Optional[np.ndarray]:
    import cv2
    img = cv2.imread(filepath)
    if img is None:
        logger.warning(f"Failed to load image: {filepath}")
    return img

def save_image(image: np.ndarray, filepath: str) -> bool:
    import cv2
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    cv2.imwrite(filepath, image)
    return True

def polygon_to_bbox(polygon):
    pts = np.array(polygon)
    return float(pts[:,0].min()), float(pts[:,1].min()), float(pts[:,0].max()), float(pts[:,1].max())

def bbox_iou(box_a, box_b):
    x1 = max(box_a[0], box_b[0]); y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2]); y2 = min(box_a[3], box_b[3])
    inter = max(0, x2-x1) * max(0, y2-y1)
    area_a = (box_a[2]-box_a[0])*(box_a[3]-box_a[1])
    area_b = (box_b[2]-box_b[0])*(box_b[3]-box_b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0

def timestamp_str() -> str:
    return datetime.now().isoformat()

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def pixel_to_ground_plane(pixel_x, pixel_y, camera_matrix, dist_coeffs, height_m, pitch_deg=90.0, roll_deg=0.0):
    """Convert pixel to ground-plane coords via ray-plane intersection."""
    import cv2
    pts = np.array([[[pixel_x, pixel_y]]], dtype=np.float32)
    undist = cv2.undistortPoints(pts, camera_matrix, dist_coeffs, P=camera_matrix)
    xu, yu = undist[0, 0]
    fx, fy = camera_matrix[0,0], camera_matrix[1,1]
    cx, cy = camera_matrix[0,2], camera_matrix[1,2]
    ray_cam = np.array([(xu-cx)/fx, (yu-cy)/fy, 1.0])
    # pitch_deg=90 means looking straight down (nadir); pitch_deg=0 means horizontal
    # Camera optical axis (+Z in camera frame) maps to world frame as:
    #   cam_z_world = [0, cos(pitch_rad), -sin(pitch_rad)]
    # At pitch=90 (nadir): [0, 0, -1] (straight down)  
    # At pitch=0 (horizontal): [0, 1, 0] (forward along +Y)
    p = np.radians(pitch_deg)
    cam_z_world = np.array([0.0, np.cos(p), -np.sin(p)])
    cam_x_world = np.array([1.0, 0.0, 0.0])
    cam_y_world = np.cross(cam_z_world, cam_x_world)
    cam_y_world = cam_y_world / np.linalg.norm(cam_y_world)
    R = np.column_stack([cam_x_world, cam_y_world, cam_z_world])
    ray_world = R @ ray_cam
    if abs(ray_world[2]) < 1e-6:
        raise ValueError("Ray parallel to road plane")
    t = -height_m / ray_world[2]
    gp = t * ray_world
    return float(gp[0]), float(gp[1])

def compute_homography(camera_matrix, dist_coeffs, height_m, pitch_deg=90.0, image_width=1280, image_height=720):
    """Homography mapping image pixels to ground-plane meters."""
    import cv2
    fx, fy = camera_matrix[0,0], camera_matrix[1,1]
    cx, cy = camera_matrix[0,2], camera_matrix[1,2]
    if abs(pitch_deg - 90.0) < 1e-3:
        H = np.array([[height_m/fx, 0, -cx*height_m/fx],
                       [0, height_m/fy, -cy*height_m/fy],
                       [0, 0, 1]], dtype=np.float64)
    else:
        p = np.radians(pitch_deg)
        Rx = np.array([[1,0,0],[0,np.cos(p),np.sin(p)],[0,-np.sin(p),np.cos(p)]])
        t = np.array([[0],[0],[-height_m]])
        P = camera_matrix @ np.hstack([Rx, t])
        hs = height_m * 0.8
        gc = np.array([[-hs,-hs,0,1],[hs,-hs,0,1],[hs,hs,0,1],[-hs,hs,0,1]], dtype=np.float64).T
        ip = P @ gc; ip = ip[:2] / ip[2:3]
        H, _ = cv2.findHomography(ip.T, gc[:2].T)
    return H

def nms(boxes, scores, threshold):
    """Non-maximum suppression. Returns indices to keep."""
    if len(boxes) == 0: return []
    x1,y1,x2,y2 = boxes[:,0],boxes[:,1],boxes[:,2],boxes[:,3]
    areas = (x2-x1)*(y2-y1)
    order = scores.argsort()[::-1]; keep = []
    while len(order) > 0:
        i = order[0]; keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]]); yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]]); yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2-xx1)*np.maximum(0, yy2-yy1)
        iou_val = inter / (areas[i]+areas[order[1:]]-inter)
        order = order[np.where(iou_val <= threshold)[0]+1]
    return keep
