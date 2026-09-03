"""Live-state push client - streams the current frame + detections to the backend.

Separates LIVE STATE (current frame, current detections/tracking ids, current GPS)
from PERSISTED DETECTION (the confirmed potholes written to the database once each).
The frontend polls the backend's live endpoint for a real-time view; it NEVER
receives thousands of duplicate DB rows.
"""
import base64
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger("drone_ai.live")


class LiveStateClient:
    def __init__(self, backend_url):
        self.backend_url = backend_url.rstrip("/")

    def push(self, frame_buffer, detections, gps, detector, gps_receiver):
        frame = frame_buffer.get(require_fresh=False)
        image_b64 = None
        if frame is not None:
            import cv2
            ok, buf = cv2.imencode(".jpg", frame)
            if ok:
                image_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

        payload = {
            "frameJpegBase64": image_b64,
            "detections": detections,
            "gps": gps,
            "modelLoaded": detector.is_loaded() if detector else False,
            "gpsLinkUp": gps_receiver.is_link_up() if gps_receiver else False,
            "gpsFixAge": gps_receiver.get_fix() is not None if gps_receiver else False,
            "timestamp": json.dumps(__import__("time").time()),
        }
        try:
            req = urllib.request.Request(
                self.backend_url + "/api/live/state",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp.read()
        except Exception as e:  # noqa: BLE001
            logger.debug("Live state push failed: %s", e)
