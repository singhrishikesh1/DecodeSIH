"""3D Measurement Engine."""
import logging, numpy as np, cv2
from typing import Dict, Optional

logger = logging.getLogger("pothole_drone_ai.measurement")


class PotholeMeasurement:
    def __init__(self, calibration_matrix, dist_coeffs, height_m, pitch_deg=90.0):
        self.K = np.array(calibration_matrix, dtype=np.float64)
        self.D = np.array(dist_coeffs, dtype=np.float64)
        self.height_m, self.pitch_deg = height_m, pitch_deg
        self.fx, self.fy = self.K[0,0], self.K[1,1]
        self.cx, self.cy = self.K[0,2], self.K[1,2]

    def _pixel_to_ground(self, px, py):
        pts = np.array([[[px, py]]], dtype=np.float32)
        undist = cv2.undistortPoints(pts, self.K, self.D, P=self.K)
        xu, yu = undist[0, 0]
        ray = np.array([(xu-self.cx)/self.fx, (yu-self.cy)/self.fy, 1.0])
        p = np.radians(self.pitch_deg)
        cam_z = np.array([0.0, np.cos(p), -np.sin(p)])
        cam_x = np.array([1.0, 0.0, 0.0])
        cam_y = np.cross(cam_z, cam_x)
        cam_y = cam_y / np.linalg.norm(cam_y)
        R = np.column_stack([cam_x, cam_y, cam_z])
        rw = R @ ray
        if abs(rw[2]) < 1e-6: return None, None
        t = -self.height_m / rw[2]
        gp = t * rw
        return float(gp[0]), float(gp[1])

    def _contour_to_ground(self, contour):
        pts = contour.reshape(-1, 2).astype(np.float64)
        gpts = []
        for px, py in pts:
            X, Y = self._pixel_to_ground(px, py)
            if X is not None: gpts.append([X, Y])
        return np.array(gpts) if len(gpts) >= 3 else None

    def measure_length_width(self, contour):
        gp = self._contour_to_ground(contour)
        if gp is None: return None, None, None, None
        c = gp - np.mean(gp, axis=0)
        _, evecs = np.linalg.eigh(np.cov(c.T))
        evecs = evecs[:, ::-1]
        L = float(np.max(c @ evecs[:,0]) - np.min(c @ evecs[:,0]))
        W = float(np.max(c @ evecs[:,1]) - np.min(c @ evecs[:,1]))
        if W > L: L, W = W, L
        angle = np.degrees(np.arctan2(evecs[0,1], evecs[0,0]))
        _, (rw, rh), _ = cv2.minAreaRect(gp.astype(np.float32))
        rl, rr = max(rw, rh), min(rw, rh)
        if L < 0.01: L, W = rl, rr
        methods = {"pca": (L, W), "rect": (rl, rr)}
        return float(L*100), float(W*100), float(angle), methods

    def measure_surface_area(self, contour):
        gp = self._contour_to_ground(contour)
        if gp is None or len(gp) < 3: return None
        x, y = gp[:,0], gp[:,1]
        return float(0.5 * abs(np.dot(x, np.roll(y,-1)) - np.dot(y, np.roll(x,-1))) * 10000)

    def measure_equivalent_diameter(self, area_cm2):
        if area_cm2 is None or area_cm2 <= 0: return None
        return float(2 * np.sqrt((area_cm2/10000)/np.pi) * 100)

    def measure_all(self, contour, depth_stats=None, depth_confidence=0.0):
        r = {}
        lw = self.measure_length_width(contour)
        r["length_cm"], r["width_cm"], r["orientation_deg"] = lw[0], lw[1], lw[2]
        area = self.measure_surface_area(contour)
        r["surface_area_cm2"] = area
        r["equivalent_diameter_cm"] = self.measure_equivalent_diameter(area)
        if depth_stats:
            r["max_depth_cm"] = float(depth_stats["max_depth_m"]*100)
            r["average_depth_cm"] = float(depth_stats["mean_depth_m"]*100)
            r["median_depth_cm"] = float(depth_stats["median_depth_m"]*100)
            r["depth_confidence"] = depth_confidence
            r["has_depth_data"] = True
            r["volume_cm3"] = depth_stats.get("volume_cm3", float(area*depth_stats["mean_depth_m"]*100) if area else None)
            r["volume_liters"] = r["volume_cm3"]/1000 if r.get("volume_cm3") else None
        else:
            for k in ["max_depth_cm","average_depth_cm","median_depth_cm"]: r[k] = None
            r["depth_confidence"] = 0.0; r["has_depth_data"] = False
            r["volume_cm3"] = None; r["volume_liters"] = None
        r["measurement_confidence"] = self._conf(r, contour)
        r["measurement_status"] = "OK" if r["measurement_confidence"] > 0.5 else "LOW_CONFIDENCE"
        return r

    def _conf(self, r, contour):
        s = []
        a, p = cv2.contourArea(contour), cv2.arcLength(contour, True)
        if a > 0 and p > 0: s.append(min(4*np.pi*a/(p*p), 1.0))
        gp = self._contour_to_ground(contour)
        if gp is not None: s.append(min(len(gp)/100, 1.0))
        s.append(r["depth_confidence"]*0.5+0.5 if r["has_depth_data"] else 0.2)
        s.append(max(0, 1.0-(self.height_m-1.0)/10.0))
        return float(np.mean(s)) if s else 0.0


class MeasurementEngine:
    def __init__(self, config):
        self.unit = config.get("unit", "cm")
    def create_measurer(self, K, D, h, pitch=90.0):
        return PotholeMeasurement(K, D, h, pitch)
    def validate_measurement(self, r):
        issues = []
        if r["length_cm"] is None: issues.append("no_length")
        if r["surface_area_cm2"] is None: issues.append("no_area")
        if not r["has_depth_data"]: issues.append("no_depth")
        if r["measurement_confidence"] < 0.3: issues.append("low_conf")
        return len(issues)==0, issues
