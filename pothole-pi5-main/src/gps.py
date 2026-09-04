"""GPS integration - NEVER fabricates coordinates."""
import logging
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger("pothole_drone_ai.gps")


class GPSReader:
    def __init__(self, config):
        self.enabled = config.get("enabled", False)
        self.serial_port = config.get("serial_port", "/dev/ttyUSB0")
        self.baud_rate = config.get("baud_rate", 9600)
        self.min_satellites = config.get("min_satellites", 4)
        self._serial = None
        self._last_fix = None
        if self.enabled:
            try:
                import serial
                self._serial = serial.Serial(self.serial_port, self.baud_rate, timeout=1)
                logger.info(f"GPS opened on {self.serial_port}")
            except Exception as e:
                logger.warning(f"GPS not available: {e}")
                self.enabled = False

    def get_position(self):
        if not self.enabled or self._serial is None:
            return None
        try:
            import pynmea2
            line = self._serial.readline().decode("ascii", errors="ignore").strip()
            if not line.startswith("$"):
                return self._last_fix
            msg = pynmea2.parse(line)
            if isinstance(msg, pynmea2.types.talker.GGA):
                if msg.num_sats >= self.min_satellites and msg.latitude and msg.longitude:
                    self._last_fix = {
                        "latitude": float(msg.latitude),
                        "longitude": float(msg.longitude),
                        "altitude_m": float(msg.altitude) if msg.altitude else None,
                        "num_satellites": int(msg.num_sats),
                        "timestamp": datetime.now().isoformat(),
                    }
            return self._last_fix
        except Exception as e:
            logger.debug(f"GPS parse error: {e}")
            return self._last_fix

    def get_position_or_none(self):
        pos = self.get_position()
        if pos is None:
            logger.debug("No GPS fix available")
        return pos

    def cleanup(self):
        if self._serial:
            self._serial.close()
