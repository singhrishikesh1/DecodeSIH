"""Inspection report generation: JSON + Markdown."""
import os
import logging
from typing import Dict, List
from datetime import datetime
from .utils import save_json, ensure_dir

logger = logging.getLogger("pothole_drone_ai.report")


class ReportGenerator:
    def __init__(self, output_dir="outputs/reports"):
        self.output_dir = output_dir
        ensure_dir(output_dir)

    def generate(self, detections: List[Dict], frame_metadata: Dict = None) -> Dict:
        report = {
            "report_title": "Pothole Inspection Report",
            "generated_at": datetime.now().isoformat(),
            "total_potholes": len(detections),
            "summary": self._compute_summary(detections),
            "potholes": [],
        }
        for det in detections:
            m = det.get("measurement", {}) or {}
            pothole_entry = {
                "pothole_id": det.get("pothole_id", "P000"),
                "confidence": det.get("confidence", 0),
                "length_cm": m.get("length_cm"),
                "width_cm": m.get("width_cm"),
                "equivalent_diameter_cm": m.get("equivalent_diameter_cm"),
                "surface_area_cm2": m.get("surface_area_cm2"),
                "max_depth_cm": m.get("max_depth_cm"),
                "average_depth_cm": m.get("average_depth_cm"),
                "volume_cm3": m.get("volume_cm3"),
                "volume_liters": m.get("volume_liters"),
                "severity": det.get("severity", "UNKNOWN"),
                "measurement_confidence": m.get("measurement_confidence", 0),
                "latitude": det.get("latitude"),
                "longitude": det.get("longitude"),
                "timestamp": det.get("timestamp"),
            }
            report["potholes"].append(pothole_entry)
        if frame_metadata:
            report["frame_metadata"] = frame_metadata
        return report

    def _compute_summary(self, detections):
        s = {"small": 0, "medium": 0, "large": 0, "critical": 0}
        depths, areas, volumes = [], [], []
        for det in detections:
            sev = det.get("severity", "UNKNOWN")
            if sev == "CRITICAL": s["critical"] += 1
            m = det.get("measurement", {}) or {}
            if m.get("surface_area_cm2"):
                area = m["surface_area_cm2"]
                if area < 500: s["small"] += 1
                elif area < 1500: s["medium"] += 1
                else: s["large"] += 1
            if m.get("max_depth_cm"): depths.append(m["max_depth_cm"])
            if m.get("surface_area_cm2"): areas.append(m["surface_area_cm2"])
            if m.get("volume_cm3"): volumes.append(volumes[-1] + m["volume_cm3"]) if volumes else volumes.append(m["volume_cm3"])
        import numpy as np
        s["total_volume_cm3"] = float(np.sum(volumes)) if volumes else 0
        s["average_depth_cm"] = float(np.mean(depths)) if depths else None
        s["max_depth_cm"] = float(np.max(depths)) if depths else None
        s["severity_distribution"] = {}
        for det in detections:
            sev = det.get("severity", "UNKNOWN")
            s["severity_distribution"][sev] = s["severity_distribution"].get(sev, 0) + 1
        return s

    def save_json_report(self, report, filepath=None):
        if filepath is None:
            filepath = os.path.join(self.output_dir, f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        save_json(report, filepath)
        logger.info(f"JSON report saved: {filepath}")
        return filepath

    def save_markdown_report(self, report, filepath=None):
        if filepath is None:
            filepath = os.path.join(self.output_dir, f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md")
        s = report["summary"]
        lines = [
            f"# {report['report_title']}",
            f"**Generated:** {report['generated_at']}",
            f"",
            f"## Summary",
            f"- Total potholes detected: **{report['total_potholes']}**",
            f"- Small: {s.get('small', 0)} | Medium: {s.get('medium', 0)} | Large: {s.get('large', 0)} | Critical: {s.get('critical', 0)}",
            f"- Average depth: {s.get('average_depth_cm', 'N/A')}" + (" cm" if s.get('average_depth_cm') else ""),
            f"- Maximum depth: {s.get('max_depth_cm', 'N/A')}" + (" cm" if s.get('max_depth_cm') else ""),
            f"- Total estimated volume: {s.get('total_volume_cm3', 0):.1f} cm³ ({s.get('total_volume_cm3', 0)/1000:.3f} L)",
            f"",
            f"## Pothole Details",
            f"",
            f"| ID | GPS | Length (cm) | Width (cm) | Depth (cm) | Area (cm²) | Volume (cm³) | Severity | Confidence |",
            f"|---|---|---|---|---|---|---|---|---|",
        ]
        for p in report["potholes"]:
            gps = f"{p.get('latitude','N/A')},{p.get('longitude','N/A')}" if p.get("latitude") else "N/A"
            lines.append(
                f"| {p['pothole_id']} | {gps} | {p.get('length_cm','N/A')} | {p.get('width_cm','N/A')} | "
                f"{p.get('max_depth_cm','N/A')} | {p.get('surface_area_cm2','N/A')} | "
                f"{p.get('volume_cm3','N/A')} | {p.get('severity','N/A')} | {p.get('confidence',0):.0%} |"
            )
        with open(filepath, "w") as f:
            f.write("\n".join(lines))
        logger.info(f"Markdown report saved: {filepath}")
        return filepath
