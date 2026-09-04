
"""
Camera calibration and pixel-to-ground-plane geometry.
- CameraCalibrator: checkerboard calibration
- GroundScaleFactor: meters-per-pixel at given height
- PixelToGroundConverter: high-level pixel->meter conversion
"""
import json
import logging
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("pothole_drone_ai.calibration")


class CameraCalibrator:
    """Checkerboard-based camera calibration."""

    def __init__(self, checkerboard_size=(9, 6), square_size_m=0.025):
        self.checkerboard_size = checkerboard_size
        self.square_size_m = square_size_m
        self.camera_matrix = None
        self.dist_coeffs = None
        self.reprojection_error = 0.0

    def calibrate_from_images(self, image_paths, image_size=None):
        import cv2
        objp = np.zeros((self.checkerboard_size[0] * self.checkerboard_size[1], 3), np.float32)
        objp[:, :2] = np.mgrid[0:self.checkerboard_size[0], 0:self.checkerboard_size[1]].T.reshape(-1, 2) * self.square_size_m
        obj_points, img_points = [], []
        detected_size = None
        for path in image_paths:
            img = cv2.imread(path)
            if img is None:
                continue
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            if detected_size is None:
                detected_size = (gray.shape[1], gray.shape[0])
            ret, corners = cv2.findChessboardCorners(gray, self.checkerboard_size, None)
            if ret:
                criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
                corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
                obj_points.append(objp)
                img_points.append(corners)
                logger.info(f"Detected corners in {Path(path).name}")
        if len(obj_points) < 3:
            raise ValueError(f"Need >= 3 calibration images, got {len(obj_points)}")
        if image_size is None:
            image_size = detected_size
        ret, camera_matrix, dist_coeffs, _, _ = cv2.calibrateCamera(obj_points, img_points, image_size, None, None)
        self.camera_matrix = camera_matrix
        self.dist_coeffs = dist_coeffs
        self.reprojection_error = ret
        logger.info(f"Calibration done: error={ret:.4f}px, fx={camera_matrix[0,0]:.1f}")
        return {"camera_matrix": camera_matrix.tolist(), "distortion_coefficients": dist_coeffs.tolist(),
                "reprojection_error": float(ret), "image_width": image_size[0], "image_height": image_size[1]}

    def save_calibration(self, filepath):
        if self.camera_matrix is None:
            raise RuntimeError("No calibration data")
        with open(filepath, "w") as f:
            json.dump({"camera_matrix": self.camera_matrix.tolist(),
                        "distortion_coefficients": self.dist_coeffs.tolist(),
                        "reprojection_error": self.reprojection_error}, f, indent=2)

    def load_calibration(self, filepath):
        with open(filepath, "r") as f:
            data = json.load(f)
        self.camera_matrix = np.array(data["camera_matrix"], dtype=np.float64)
        self.dist_coeffs = np.array(data["distortion_coefficients"], dtype=np.float64)
        self.reprojection_error = data.get("reprojection_error", 0.0)

    def undistort_image(self, image):
        import cv2
        h, w = image.shape[:2]
        new_mtx, _ = cv2.getOptimalNewCameraMatrix(self.camera_matrix, self.dist_coeffs, (w, h), 1, (w, h))
        return cv2.undistort(image, self.camera_matrix, self.dist_coeffs, None, new_mtx)

    def undistort_points(self, points):
        import cv2
        pts = points.reshape(-1, 1, 2).astype(np.float32)
        undist = cv2.undistortPoints(pts, self.camera_matrix, self.dist_coeffs, P=self.camera_matrix)
        return undist.reshape(-1, 2)


class GroundScaleFactor:
    """Meters-per-pixel at a given drone altitude."""
    def __init__(self, camera_matrix, dist_coeffs):
        self.K = camera_matrix
        self.D = dist_coeffs
        self.fx = camera_matrix[0, 0]
        self.fy = camera_matrix[1, 1]

    def get_scale_at_center(self, height_m):
        return height_m / self.fx, height_m / self.fy

    def get_scale_at_pixel(self, pixel_x, pixel_y, height_m, pitch_deg=90.0):
        from .utils import pixel_to_ground_plane
        X0, _ = pixel_to_ground_plane(pixel_x, pixel_y, self.K, self.D, height_m, pitch_deg)
        X1, _ = pixel_to_ground_plane(pixel_x + 1, pixel_y, self.K, self.D, height_m, pitch_deg)
        _, Y0 = pixel_to_ground_plane(pixel_x, pixel_y, self.K, self.D, height_m, pitch_deg)
        _, Y1 = pixel_to_ground_plane(pixel_x, pixel_y + 1, self.K, self.D, height_m, pitch_deg)
        return abs(X1 - X0), abs(Y1 - Y0)

    def get_pixel_area_m2(self, pixel_x, pixel_y, height_m, pitch_deg=90.0):
        sx, sy = self.get_scale_at_pixel(pixel_x, pixel_y, height_m, pitch_deg)
        return sx * sy

    def compute_ground_dimensions(self, pixel_width, pixel_height, height_m, pitch_deg=90.0):
        if abs(pitch_deg - 90.0) < 1e-3:
            return pixel_width * height_m / self.fx, pixel_height * height_m / self.fy
        from .utils import pixel_to_ground_plane
        w_m = abs(pixel_to_ground_plane(pixel_width, pixel_height//2, self.K, self.D, height_m, pitch_deg)[0]
                 - pixel_to_ground_plane(0, pixel_height//2, self.K, self.D, height_m, pitch_deg)[0])
        h_m = abs(pixel_to_ground_plane(pixel_width//2, pixel_height, self.K, self.D, height_m, pitch_deg)[1]
                 - pixel_to_ground_plane(pixel_width//2, 0, self.K, self.D, height_m, pitch_deg)[1])
        return w_m, h_m


class PixelToGroundConverter:
    """High-level pixel-to-ground-meter conversion."""
    def __init__(self, calibration, height_m, pitch_deg=90.0):
        self.calibration = calibration
        self.height_m = height_m
        self.pitch_deg = pitch_deg

    def pixels_to_ground(self, points):
        from .utils import compute_homography
        H = compute_homography(self.calibration.camera_matrix, self.calibration.dist_coeffs,
                               self.height_m, self.pitch_deg)
        pts = np.hstack([points, np.ones((len(points), 1))]).T
        ground = H @ pts
        return (ground[:2] / ground[2:3]).T

    def single_pixel_to_ground(self, px, py):
        from .utils import pixel_to_ground_plane
        return pixel_to_ground_plane(px, py, self.calibration.camera_matrix,
                                     self.calibration.dist_coeffs, self.height_m, self.pitch_deg)

    def pixel_distance_to_ground_m(self, px1, py1, px2, py2):
        X1, Y1 = self.single_pixel_to_ground(px1, py1)
        X2, Y2 = self.single_pixel_to_ground(px2, py2)
        return float(np.sqrt((X2-X1)**2 + (Y2-Y1)**2))

    def pixel_area_to_ground_m2(self, pixel_area, center_x, center_y):
        gsf = GroundScaleFactor(self.calibration.camera_matrix, self.calibration.dist_coeffs)
        sx, sy = gsf.get_scale_at_pixel(center_x, center_y, self.height_m, self.pitch_deg)
        return pixel_area * sx * sy
