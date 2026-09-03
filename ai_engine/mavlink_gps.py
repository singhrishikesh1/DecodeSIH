"""MAVLink GPS_RAW_INT receiver (pymavlink).

Real hardware flow:
  GPS -> Flight Controller -> MAVLink (57600 baud) -> RPi -> UDP:14550 -> laptop

The Raspberry Pi forwards the raw MAVLink byte stream over UDP to the laptop.
This module binds a UDP socket, feeds every datagram into the pymavlink parser,
and extracts GPS_RAW_INT messages (and, as a bonus, HEARTBEAT for link status).

Graceful GPS loss:
  - No crash. Detection continues.
  - Coordinates are returned as None when there is no valid fix or the link is
    stale; stale GPS is never reused indefinitely (stale_after_s).
"""
import logging
import socket
import threading
import time

logger = logging.getLogger("drone_ai.gps")


class MavlinkGpsReceiver:
    def __init__(self, host, port, min_fix_type=3, stale_after_s=3.0, baud=57600):
        self.host = host
        self.port = port
        self.min_fix_type = int(min_fix_type)
        self.stale_after_s = float(stale_after_s)
        self.baud = baud
        self._sock = None
        self._lock = threading.Lock()
        self._last_fix = None      # (timestamp, dict)
        self._last_heartbeat = None
        self._parser = None
        self._running = False
        self._thread = None

    def _make_parser(self):
        # Use pymavlink's MAVLink parser directly so we control the wire source.
        from pymavlink.dialects.v20 import ardupilotmega as mav
        from pymavlink import mavutil
        try:
            return mav.MAVLink(None)
        except Exception:  # noqa: BLE001
            return None

    def start(self):
        from pymavlink.dialects.v20 import ardupilotmega as mav
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.settimeout(0.5)
        self._parser = mav.MAVLink(None)
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="mavlink-gps")
        self._thread.start()
        logger.info("MAVLink GPS_RAW_INT receiver on %s:%s (min_fix=%s)",
                    self.host, self.port, self.min_fix_type)
        return True

    def _loop(self):
        while self._running:
            try:
                data, _addr = self._sock.recvfrom(65535)
            except socket.timeout:
                continue
            except Exception:  # noqa: BLE001
                if not self._running:
                    break
                continue
            if not data:
                continue
            try:
                msgs = self._parser.parse_buffer(data)
                if msgs:
                    for m in msgs:
                        self._handle(m)
            except Exception as e:  # noqa: BLE001
                logger.debug("MAVLink parse error: %s", e)

    def _handle(self, msg):
        t = time.time()
        if msg.get_type() == "GPS_RAW_INT":
            fix = int(msg.fix_type) if msg.fix_type is not None else 0
            lat_ok = msg.lat is not None and msg.lat != 0
            lon_ok = msg.lon is not None and msg.lon != 0
            if fix >= self.min_fix_type and lat_ok and lon_ok:
                with self._lock:
                    self._last_fix = (t, {
                        "latitude": msg.lat / 1e7,
                        "longitude": msg.lon / 1e7,
                        "altitude_m": (msg.alt / 1000.0) if msg.alt is not None else None,
                        "eph": msg.eph if msg.eph is not None else None,
                        "fix_type": fix,
                        "satellites_visible": getattr(msg, "satellites_visible", None),
                        "source": "GPS_RAW_INT (MAVLink)",
                        "timestamp": t,
                    })
        elif msg.get_type() == "HEARTBEAT":
            self._last_heartbeat = t

    def get_fix(self):
        """Return latest valid fix or None. Never returns stale/0,0 coordinates."""
        with self._lock:
            if self._last_fix is None:
                return None
            ts, fix = self._last_fix
            if time.time() - ts > self.stale_after_s:
                return None
            return fix

    def is_link_up(self):
        if self._last_heartbeat is None:
            return self.get_fix() is not None
        return (time.time() - self._last_heartbeat) < self.stale_after_s

    def stop(self):
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2)
        if self._sock is not None:
            try:
                self._sock.close()
            except Exception:  # noqa: BLE001
                pass
