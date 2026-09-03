"""Continuous laptop AI detection pipeline.

Threads/processes (do not block each other):
  1. UDP RTP/H.264 video receiver  -> latest-frame buffer (no unbounded queue)
  2. MAVLink GPS_RAW_INT receiver   -> latest valid fix / None when stale

Inference loop (runs continuously, always on the newest available frame):
  YOLOv8 detection -> measurement -> severity -> tracker -> GPS association ->
  persistence (once per confirmed pothole) -> push live view to backend.

There is NO artificial 2-second delay. Frames are processed as fast as the CPU
allows; old unprocessed frames are discarded via the latest-frame buffer.
"""
import logging
import os
import threading
import time

from config_loader import load_config
from onnx_detector import OnnxPotholeDetector
from measurement import MeasurementEngine
from severity import SeverityClassifier
from tracking import IoUTracker
from mavlink_gps import MavlinkGpsReceiver
from video_receiver import LatestFrameBuffer, create_receiver
from persistence import PersistenceClient
from live_state import LiveStateClient

logger = logging.getLogger("drone_ai")


class DetectionPipeline:
    def __init__(self, config):
        self.cfg = config
        self.measure = MeasurementEngine(config["measurement"])
        self.severity = SeverityClassifier(config["severity"])
        self.tracker = IoUTracker(config["tracking"])
        self.detector = OnnxPotholeDetector(
            model_path=config["detection"]["model_path"],
            input_size=config["detection"].get("input_size", 640),
            conf_threshold=config["detection"].get("confidence_threshold", 0.30),
            nms_threshold=config["detection"].get("nms_threshold", 0.45),
            classes=config["detection"].get("classes", ["pothole"]),
        )
        self.frame_buffer = LatestFrameBuffer(max_age_s=config["video"].get("frame_max_age_s", 0.5))
        self.persistence = PersistenceClient(
            config["persistence"]["backend_url"],
            config["persistence"].get("drone_id"),
            physical_dedup=config["persistence"].get("physical_dedup", {}),
        )
        self.live = LiveStateClient(config["persistence"]["backend_url"])
        self.meta = config["live"]
        self.detections_last = []
        self.last_live_push = 0.0
        self._running = False

    def start_receivers(self):
        self.gps = MavlinkGpsReceiver(
            self.cfg["gps"]["host"], self.cfg["gps"]["port"],
            min_fix_type=self.cfg["gps"].get("min_fix_type", 3),
            stale_after_s=self.cfg["gps"].get("stale_after_s", 3.0),
        )
        self.gps.start()

        vhost = self.cfg["video"]["host"]
        vport = self.cfg["video"]["port"]
        vw = self.cfg["video"].get("width", 640)
        vh = self.cfg["video"].get("height", 480)
        self.video = create_receiver("gst", vhost, vport, width=vw, height=vh)
        self.video.open()
        self._video_thread = threading.Thread(target=self._video_loop,
                                              daemon=True, name="udp-video")
        self._video_thread.start()
        logger.info("Video receiver started on %s:%s (%sx%s)", vhost, vport, vw, vh)

    def _video_loop(self):
        try:
            self.video.read_frames(self.frame_buffer)
        except Exception as e:  # noqa: BLE001
            logger.error("Video receiver error: %s", e)

    def detect_once(self):
        """Run one detection pass on the newest frame. Returns bool (had frame)."""
        frame = self.frame_buffer.get(require_fresh=True)
        if frame is None:
            return False

        detections = self.detector.detect(frame)
        processed = []
        for d in detections:
            m = self.measure.measure_bbox(d["bbox"])
            s = self.severity.classify(m)
            processed.append({
                "bbox": d["bbox"],
                "confidence": d["confidence"],
                "class_name": d["class_name"],
                "measurement": m,
                "severity": s,
            })

        confirmed = self.tracker.update(processed, frame=frame)

        # Attach severity + measurement to confirmed tracks
        by_conf = {}
        for d in processed:
            by_conf[tuple(round(v, 1) for v in d["bbox"])] = d
        for tr in confirmed:
            tr["measurement"] = tr.get("measurement") or {}
            key = tuple(round(v, 1) for v in tr["bbox"])
            src = by_conf.get(key)
            if src:
                tr["severity"] = src["severity"]
                tr["measurement"] = src["measurement"]

        gps = self.gps.get_fix()

        # Persist newly confirmed potholes (once each)
        for tr in confirmed:
            if not self.persistence.already_persisted(tr["track_id"]):
                self.persistence.persist_pothole(tr, gps, self.meta)

        # Live view snapshot
        cls_name = self.cfg["detection"].get("classes", ["pothole"])[0] if self.cfg.get("detection") else "pothole"
        self.detections_last = [{
            "trackId": t["track_id"],
            "bbox": list(t["bbox"]),
            "confidence": t.get("confidence"),
            "conf": t.get("confidence"),
            "cls": cls_name,
            "label": cls_name,
            "labelText": f"{cls_name.capitalize()} #{t['track_id']} ({int((t.get('confidence') or 0) * 100)}%)",
            "severity": (t.get("severity") or {}).get("severity", "UNCLASSIFIED"),
            "frames_detected": t.get("frames_detected"),
        } for t in confirmed]

        now = time.time()
        if now - self.last_live_push >= self.cfg["live"].get("push_interval_s", 1.0):
            self.last_live_push = now
            self.live.push(self.frame_buffer, self.detections_last, gps,
                           self.detector, self.gps)
        return True

    def run(self):
        self._running = True
        no_frame_count = 0
        logger.info("Starting detection loop. Waiting for video frames...")
        while self._running:
            had = self.detect_once()
            if not had:
                no_frame_count += 1
                time.sleep(0.02)  # tiny sleep only when no frame; no 2s delay
            # When frames ARE available, loop immediately (continuous inference).

    def stop(self):
        self._running = False
        try:
            self.gps.stop()
        except Exception:  # noqa: BLE001
            pass
        try:
            self.video.close()
        except Exception:  # noqa: BLE001
            pass
