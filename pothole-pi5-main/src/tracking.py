"""
Multi-object IoU tracker for persistent pothole IDs across video frames.
"""
import logging
import numpy as np
from typing import Dict, List
from .utils import bbox_iou

logger = logging.getLogger("pothole_drone_ai.tracking")


class Track:
    def __init__(self, track_id, bbox, measurement=None):
        self.track_id = track_id
        self.pothole_id = f"P{track_id:03d}"
        self.bbox = bbox
        self.hits = 1
        self.age = 0
        self.time_since_update = 0
        self.measurements = [measurement] if measurement else []
        self.best_measurement = measurement

    def update(self, bbox, measurement=None):
        self.bbox = bbox
        self.hits += 1
        self.time_since_update = 0
        if measurement:
            self.measurements.append(measurement)
            if self.best_measurement is None or measurement.get("measurement_confidence", 0) > self.best_measurement.get("measurement_confidence", 0):
                self.best_measurement = measurement

    def predict(self):
        self.age += 1
        self.time_since_update += 1

    def get_aggregated_measurement(self):
        if not self.measurements:
            return None
        valid = [m for m in self.measurements if m.get("measurement_confidence", 0) > 0.3]
        if not valid:
            return self.best_measurement
        return max(valid, key=lambda m: m.get("measurement_confidence", 0))


class IoUTracker:
    def __init__(self, config):
        self.max_age = config.get("max_age", 30)
        self.min_hits = config.get("min_hits", 3)
        self.iou_threshold = config.get("iou_threshold", 0.3)
        self.tracks = []
        self.next_id = 1

    def update(self, detections):
        for track in self.tracks:
            track.predict()
        if not detections:
            self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
            return self._get_active()
        matched = []
        unmatched_dets = list(range(len(detections)))
        unmatched_tracks = list(range(len(self.tracks)))
        if self.tracks:
            iou_matrix = np.zeros((len(self.tracks), len(detections)))
            for ti, track in enumerate(self.tracks):
                for di, det in enumerate(detections):
                    iou_matrix[ti, di] = bbox_iou(track.bbox, det["bbox"])
            used_t, used_d = set(), set()
            while iou_matrix.size > 0:
                idx = np.unravel_index(iou_matrix.argmax(), iou_matrix.shape)
                if iou_matrix[idx] < self.iou_threshold:
                    break
                t_idx, d_idx = idx
                matched.append((t_idx, d_idx))
                used_t.add(t_idx)
                used_d.add(d_idx)
                iou_matrix[t_idx, :] = 0
                iou_matrix[:, d_idx] = 0
            unmatched_tracks = [t for t in range(len(self.tracks)) if t not in used_t]
            unmatched_dets = [d for d in range(len(detections)) if d not in used_d]
        for t_idx, d_idx in matched:
            det = detections[d_idx]
            self.tracks[t_idx].update(det["bbox"], det.get("measurement"))
        for d_idx in unmatched_dets:
            det = detections[d_idx]
            track = Track(self.next_id, det["bbox"], det.get("measurement"))
            self.next_id += 1
            self.tracks.append(track)
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
        return self._get_active()

    def _get_active(self):
        active = []
        for track in self.tracks:
            if track.hits >= self.min_hits:
                active.append({
                    "pothole_id": track.pothole_id,
                    "track_id": track.track_id,
                    "bbox": track.bbox,
                    "confidence": track.hits / max(track.age, 1),
                    "frames_detected": track.hits,
                    "measurement": track.get_aggregated_measurement(),
                })
        return active

    def reset(self):
        self.tracks = []
        self.next_id = 1
