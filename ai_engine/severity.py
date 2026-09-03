"""Severity classification.

CSV of rules (from the AI project's severity.py) need physical geometry
(depth/area/volume). Without a validated physical calibration and without a real
depth source, severity cannot be legitimately determined, so it is reported as
unclassified ("INSUFFICIENT_DATA") rather than fabricated.

When a matching physical calibration is configured AND depth is available the
threshold rules are applied and the basis/method is recorded explicitly.
"""
import logging

logger = logging.getLogger("drone_ai.severity")


class SeverityClassifier:
    def __init__(self, cfg):
        t_cfg = cfg.get("thresholds", cfg)
        self.thresholds = {
            "LOW": t_cfg.get("LOW", {"max_depth_cm": 3.0, "max_area_cm2": 500.0, "max_volume_cm3": 1500.0}),
            "MEDIUM": t_cfg.get("MEDIUM", {"max_depth_cm": 5.0, "max_area_cm2": 1500.0, "max_volume_cm3": 5000.0}),
            "HIGH": t_cfg.get("HIGH", {"max_depth_cm": 8.0, "max_area_cm2": 4000.0, "max_volume_cm3": 15000.0}),
        }

    def classify(self, measurement):
        d = measurement.get("max_depth_cm")
        a = measurement.get("surface_area_cm2")
        v = measurement.get("volume_cm3")

        # No real physical geometry -> cannot classify
        if not measurement.get("calibrated") or (d is None and a is None and v is None):
            return {
                "severity": "UNCLASSIFIED",
                "severity_status": "INSUFFICIENT_DATA",
                "severity_basis": "Physical calibration or depth unavailable; severity not fabricated.",
                "severity_score": None,
            }

        d = d or 0
        a = a or 0
        v = v or 0
        t = self.thresholds
        if d > t["HIGH"]["max_depth_cm"] or a > t["HIGH"]["max_area_cm2"] or v > t["HIGH"]["max_volume_cm3"]:
            level = "CRITICAL"
        elif d > t["MEDIUM"]["max_depth_cm"] or a > t["MEDIUM"]["max_area_cm2"] or v > t["MEDIUM"]["max_volume_cm3"]:
            level = "HIGH"
        elif d > t["LOW"]["max_depth_cm"] or a > t["LOW"]["max_area_cm2"] or v > t["LOW"]["max_volume_cm3"]:
            level = "MEDIUM"
        else:
            level = "LOW"
        score = self._score(d, a, v)
        return {
            "severity": level,
            "severity_status": "CLASSIFIED",
            "severity_basis": "thresholds:depth/area/volume",
            "severity_score": round(float(score), 2),
        }

    def _score(self, d, a, v):
        h = self.thresholds["HIGH"]
        return min(d / h["max_depth_cm"], 1.0) * 0.4 + \
            min(a / h["max_area_cm2"], 1.0) * 0.3 + \
            min(v / h["max_volume_cm3"], 1.0) * 0.3
