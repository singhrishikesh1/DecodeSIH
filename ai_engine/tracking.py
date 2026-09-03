"""Multi-object IoU tracker for persistent pothole IDs across video frames.

The same physical pothole keeps the same in-session track ID across frames and
survives temporary missed detections. New potholes get new IDs. Confirmed tracks
(hits >= min_hits) are candidates for persistence.

Restart-safety: the FINAL persistent P001/P002... identifiers are allocated by the
backend's PotholeSequence (single source of truth), so a restarted session cannot
reuse an existing DB id. The in-session track id is only a local correlation key.
"""
import logging
import numpy as np

logger = logging.getLogger("drone_ai.tracking")


def bbox_iou(box_a, box_b):
    x1 = max(box_a[0], box_b[0]); y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2]); y2 = min(box_a[3], box_b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class _Track:
    def __init__(self, track_id, bbox):
        self.track_id = track_id
        self.bbox = bbox
        self.hits = 1
        self.age = 0
        self.time_since_update = 0
        self.best_conf = 0.0
        self.best_measurement = None
        self.best_frame = None

    def update(self, bbox, measurement=None, conf=0.0, frame=None):
        self.bbox = bbox
        self.hits += 1
        self.time_since_update = 0
        if conf > self.best_conf:
            self.best_conf = conf
            self.best_measurement = measurement
            self.best_frame = frame

    def predict(self):
        self.age += 1
        self.time_since_update += 1


class IoUTracker:
    def __init__(self, config):
        self.max_age = config.get("max_age", 30)
        self.min_hits = config.get("min_hits", 3)
        self.iou_threshold = config.get("iou_threshold", 0.30)
        self.tracks = []
        self.next_id = 1

    def update(self, detections, frame=None):
        """detections: list of dicts {bbox, confidence, measurement}. frame optional numpy.
        Returns list of confirmed active tracks:
        [{track_id, bbox, confidence, frames_detected, measurement}]
        """
        for t in self.tracks:
            t.predict()

        if not detections:
            self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
            return self._confirmed()

        matched = []
        unmatched_dets = list(range(len(detections)))
        unmatched_tracks = list(range(len(self.tracks)))
        if self.tracks:
            iou_matrix = np.zeros((len(self.tracks), len(detections)))
            for ti, t in enumerate(self.tracks):
                for di, det in enumerate(detections):
                    iou_matrix[ti, di] = bbox_iou(t.bbox, det["bbox"])
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
            self.tracks[t_idx].update(det["bbox"], det.get("measurement"),
                                      det.get("confidence", 0.0), frame)

        for d_idx in unmatched_dets:
            det = detections[d_idx]
            t = _Track(self.next_id, det["bbox"])
            t.update(det["bbox"], det.get("measurement"), det.get("confidence", 0.0), frame)
            self.next_id += 1
            self.tracks.append(t)

        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
        return self._confirmed()

    def _confirmed(self):
        out = []
        for t in self.tracks:
            if t.hits >= self.min_hits:
                out.append({
                    "track_id": t.track_id,
                    "bbox": t.bbox,
                    "confidence": t.best_conf,
                    "frames_detected": t.hits,
                    "measurement": t.best_measurement,
                    "best_frame": t.best_frame,
                })
        return out
