"""Measurement engine.

STRICT RULE: physical (metric) measurement is ONLY reported when a camera
calibration matching the LIVE stream is configured. The live stream is 640x480;
the project's leftover calibration is 1280x720 and does not match, so physical
values default to uncalibrated (None) rather than being fabricated.

Pixel-space geometry (bbox width/height/area in pixels, aspect ratio) is ALWAYS
reported because it is a real, camera-resolution-dependent observation.
"""
import logging
import numpy as np

logger = logging.getLogger("drone_ai.measurement")


class MeasurementEngine:
    def __init__(self, cfg):
        self.calibrated = bool(cfg.get("calibrated", False))
        self.height_m = cfg.get("height_m")
        self.pitch_deg = cfg.get("pitch_angle_deg", 90.0)
        self.K = cfg.get("camera_matrix")
        self.D = cfg.get("distortion_coefficients")
        self.px_to_m = None
        if self.calibrated and self.K:
            self.K = np.array(self.K, dtype=np.float64)
            if self.D is None:
                self.D = np.zeros((1, 5), dtype=np.float64)
            else:
                self.D = np.array(self.D, dtype=np.float64).reshape(-1)

    def measure_bbox(self, bbox):
        """Return pixel-space + (possibly) physical measurements for a bbox."""
        x1, y1, x2, y2 = bbox
        w_px = float(x2) - float(x1)
        h_px = float(y2) - float(y1)
        area_px = w_px * h_px
        aspect = float(w_px / h_px) if h_px > 0 else None

        result = {
            "length_cm": None,
            "width_cm": None,
            "surface_area_cm2": None,
            "equivalent_diameter_cm": None,
            "max_depth_cm": None,
            "average_depth_cm": None,
            "volume_cm3": None,
            "has_depth_data": False,
            "measurement_status": "UNCALIBRATED",
            "calibrated": False,
            "pixel": {
                "width_px": float(w_px),
                "height_px": float(h_px),
                "area_px": float(area_px),
                "aspect_ratio": aspect,
            },
        }

        if self.calibrated and self.K is not None and self.height_m:
            result.update(self._physical_from_pixels(w_px, h_px))
            result["calibrated"] = True
            result["measurement_status"] = "OK"
        return result

    def _physical_from_pixels(self, w_px, h_px):
        fx = float(self.K[0, 0])
        fy = float(self.K[1, 1])
        h = float(self.height_m)
        # Nadir approximation: m-per-px = height / focal_length
        length_cm = (w_px * h / fx) * 100
        width_cm = (h_px * h / fy) * 100
        area_cm2 = length_cm * width_cm
        return {
            "length_cm": round(length_cm, 2),
            "width_cm": round(width_cm, 2),
            "surface_area_cm2": round(area_cm2, 2),
            # depth/volume require a real depth source -> never fabricated
            "max_depth_cm": None,
            "average_depth_cm": None,
            "volume_cm3": None,
            "has_depth_data": False,
        }
