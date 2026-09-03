"""Physical pothole identity in the persistence client.

The backend persistence layer is the single source of truth for the physical
pothole id (P001...). The client:
  - keeps the transient track_id -> physical pothole id mapping for this session,
  - forwards the shared physical-deduplication config to the backend,
  - never sends a second request for a transient track id it has already handled,
  - logs the NEW / ASSOCIATED / REJECTED decision with the reason returned by the
    backend (GPS distance in metres, or bbox IoU fallback).

Identity model:
  - transient track id  -> owned by the IoU tracker, reused across frames
  - physical pothole id -> one persistent DB record per real pothole
The backend deduplicates by GPS anchor (position_tolerance_m) with a conservative
image-space/bbox fallback when GPS is unavailable; it never invents coordinates.
"""
import base64
import logging
import json
import threading
import time
import urllib.request
import urllib.error

logger = logging.getLogger("drone_ai.persistence")


class PersistenceClient:
    def __init__(self, backend_url, drone_id, physical_dedup=None, lock=None):
        self.backend_url = backend_url.rstrip("/")
        self.drone_id = drone_id
        self.physical_dedup = physical_dedup or {}
        self._lock = lock if lock is not None else threading.RLock()
        # transient track_id -> physical pothole id (this session)
        self._track_to_physical = {}
        # physical pothole id -> {confidence, last_measurement} (this session)
        self._physical_meta = {}
        # set() of physical pothole ids the backend has confirmed so far
        self._physical_ids = set()

    @staticmethod
    def _dedup_payload(dedup):
        """Config shared with the backend (single source: config.yaml)."""
        return {
            "positionToleranceM": dedup.get("position_tolerance_m", 0.5),
            "bboxFallbackIouThreshold": dedup.get("bbox_fallback_iou_threshold", 0.7),
            "bboxFallbackWindowS": dedup.get("bbox_fallback_window_s", 30.0),
        }

    def _post_json(self, path, payload):
        url = self.backend_url + path
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            logger.error("Backend %s -> HTTP %s: %s", path, e.code, body)
            return None
        except Exception as e:  # noqa: BLE001
            logger.error("Backend %s request failed: %s", path, e)
            return None

    def already_persisted(self, track_id):
        return track_id in self._track_to_physical

    def persist_pothole(self, track, gps, meta):
        """Persist one confirmed pothole. Returns {pothole_id, ok} or None."""
        track_id = track["track_id"]
        with self._lock:
            if track_id in self._track_to_physical:
                pid = self._track_to_physical[track_id]
                logger.info(
                    "[TRACK] track %s already handled as %s (rejected duplicate)",
                    track_id, pid)
                return None

            bbox = track["bbox"]
            measurement = track.get("measurement") or {}
            severity = track.get("severity") or {}
            frame = track.get("best_frame")

            image_b64 = None
            if frame is not None:
                import cv2
                ok, buf = cv2.imencode(".jpg", frame)
                if ok:
                    image_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

            payload = {
                "droneId": self.drone_id,
                "confidence": track.get("confidence"),
                "bbox": {"x1": float(bbox[0]), "y1": float(bbox[1]),
                         "x2": float(bbox[2]), "y2": float(bbox[3])},
                "measurement": measurement,
                "severity": severity["severity"] if severity else "UNCLASSIFIED",
                "severityStatus": (severity.get("severity_status")
                                   if severity else "INSUFFICIENT_DATA"),
                "severityBasis": severity.get("severity_basis") if severity else None,
                "gps": gps,
                "trackId": track_id,
                "assetName": meta.get("asset_name"),
                "assetType": meta.get("asset_type"),
                "locationName": meta.get("location_name"),
                "imageBase64Jpeg": image_b64,
            }
            payload.update(self._dedup_payload(self.physical_dedup))

            result = self._post_json("/api/live/potholes", payload)
            if result and result.get("success") and result.get("pothole"):
                pothole = result["pothole"]
                physical_id = pothole.get("potholeId")
                self._track_to_physical[track_id] = physical_id
                self._physical_ids.add(physical_id)
                self._physical_meta.setdefault(physical_id, {})
                self._physical_meta[physical_id].update({
                    "confidence": track.get("confidence"),
                    "measurement": measurement,
                })

                if pothole.get("associated"):
                    method = pothole.get("method") or "bbox"
                    if method == "gps":
                        dist = pothole.get("distanceM")
                        logger.info(
                            "[TRACK] track %s matched existing %s by GPS distance %.2fm",
                            track_id, physical_id,
                            dist if dist is not None else 0.0)
                    else:
                        logger.info(
                            "[TRACK] track %s matched existing %s by bbox IoU fallback "
                            "(GPS unavailable)", track_id, physical_id)
                    logger.info(
                        "[PERSIST] existing %s updated; no duplicate record created",
                        physical_id)
                else:
                    logger.info("[PERSIST] NEW %s (track %s)",
                                physical_id, track_id)
                return pothole

            logger.warning("Persist failed for track %s: %s", track_id,
                           result.get("error") if result else "network error")
            return None