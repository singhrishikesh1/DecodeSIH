"""
Configurable severity classification.
"""
import logging
from typing import Dict

logger = logging.getLogger("pothole_drone_ai.severity")


class SeverityClassifier:
    def __init__(self, config: Dict):
        self.thresholds = config.get("thresholds", {
            "low": {"max_depth_cm": 3.0, "max_area_cm2": 500.0, "max_volume_cm3": 1500.0},
            "medium": {"max_depth_cm": 5.0, "max_area_cm2": 1500.0, "max_volume_cm3": 5000.0},
            "high": {"max_depth_cm": 8.0, "max_area_cm2": 4000.0, "max_volume_cm3": 15000.0},
        })

    def classify(self, m: Dict) -> str:
        d = m.get("max_depth_cm") or 0
        a = m.get("surface_area_cm2") or 0
        v = m.get("volume_cm3") or 0
        t = self.thresholds
        if d > t.get("high",{}).get("max_depth_cm",8) or a > t.get("high",{}).get("max_area_cm2",4000) or v > t.get("high",{}).get("max_volume_cm3",15000):
            return "CRITICAL"
        if d > t.get("medium",{}).get("max_depth_cm",5) or a > t.get("medium",{}).get("max_area_cm2",1500) or v > t.get("medium",{}).get("max_volume_cm3",5000):
            return "HIGH"
        if d > t.get("low",{}).get("max_depth_cm",3) or a > t.get("low",{}).get("max_area_cm2",500) or v > t.get("low",{}).get("max_volume_cm3",1500):
            return "MEDIUM"
        return "LOW"

    def get_severity_score(self, m: Dict) -> float:
        d = m.get("max_depth_cm") or 0
        a = m.get("surface_area_cm2") or 0
        v = m.get("volume_cm3") or 0
        t = self.thresholds.get("high", {})
        return float(min(d/t.get("max_depth_cm",8),1.0)*0.4 + min(a/t.get("max_area_cm2",4000),1.0)*0.3 + min(v/t.get("max_volume_cm3",15000),1.0)*0.3)
