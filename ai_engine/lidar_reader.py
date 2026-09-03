"""LiDAR measurement reader (integration contract — hardware ABSENT).

STATUS: LiDAR hardware is NOT installed and NO LiDAR source exists anywhere in
this project (no WebSocket server/client, no UDP feed, no protocol). This module
is an explicit, honest integration point: it always reports the sensor as
unavailable and never fabricates a reading.

When a real LiDAR is added later, implement a concrete reader with this same
interface (start/get_reading/is_connected/stop) and wire it into
DetectionPipeline.start_receivers() and measurement. Until then the project
reports "LiDAR unavailable" end-to-end (frontend, pipeline, and persisted
pothole.lidar_status = 'unavailable').
"""

import logging

logger = logging.getLogger("drone_ai.lidar")


class LiDARReader:
    """Placeholder reader for a not-yet-present LiDAR sensor.

    Interface mirrors MavlinkGpsReceiver so a real source can drop in without
    changing the calling shape: start(), is_connected(), get_reading(), stop().
    """

    def __init__(self, config=None):
        self.config = config or {}
        self._running = False

    def start(self):
        """No-op: hardware absent. Kept for parity with other receivers."""
        self._running = True
        logger.info(
            "LiDAR reader: sensor not installed — reporting unavailable "
            "(no fake protocol or data)."
        )
        return True

    def is_connected(self):
        """Always False: no LiDAR hardware is present."""
        return False

    def get_reading(self):
        """Always None: no physical depth/area measurement can be produced."""
        return None

    def status(self):
        """Honest machine-readable status for downstream consumers."""
        return {
            "available": False,
            "status": "unavailable",
            "reason": "LiDAR hardware not installed; no source in this project",
            "reading": None,
        }

    def stop(self):
        self._running = False
