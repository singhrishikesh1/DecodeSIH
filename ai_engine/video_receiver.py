"""UDP H.264 RTP video receiver.

Real hardware flow:
  Drone camera -> RPi -> H.264/RTP over UDP:5000 -> laptop (this receiver)

Decoded frames are written to a single-slot latest-frame buffer. Old, unprocessed
frames are dropped so latency never grows (no unbounded queue). Handles temporary
video interruption and packet loss without crashing.

Backend: "gst" (default) launches a GStreamer pipeline that does the RTP
depacketization (rtph264depay) + H.264 decode exactly as the project verified, and
feeds raw BGR frames to this process over a pipe. "pyav" is an alternative using
FFmpeg via PyAV.
"""
import logging
import os
import shutil
import subprocess
import threading
import time
import numpy as np

logger = logging.getLogger("drone_ai.video")

PAYLOAD_TYPE = 96
CODEC = "h264"


class LatestFrameBuffer:
    """Thread-safe single-slot latest-frame buffer."""

    def __init__(self, max_age_s=0.5):
        self._lock = threading.Lock()
        self._frame = None
        self._timestamp = None
        self.max_age_s = max_age_s

    def set(self, frame):
        with self._lock:
            self._frame = frame
            self._timestamp = time.time()

    def get(self, require_fresh=True):
        with self._lock:
            if self._frame is None:
                return None
            if require_fresh and self._timestamp is not None:
                if time.time() - self._timestamp > self.max_age_s:
                    return None
            return self._frame

    def age_ms(self):
        with self._lock:
            if self._timestamp is None:
                return None
            return int((time.time() - self._timestamp) * 1000)


class GStreamerReceiver:
    """Decode RTP/H.264 via a GStreamer CLI pipeline in a subprocess.

    gst-launch decodes and writes fixed-size BGR frames to fd=1 (stdout); this
    process reads exactly W*H*3 bytes per frame from the pipe.
    """

    def __init__(self, host, port, width=640, height=480, payload_type=PAYLOAD_TYPE):
        self.host = host or "0.0.0.0"
        self.port = port
        self.width = width
        self.height = height
        self.payload_type = payload_type
        self.proc = None
        self.stopped = threading.Event()
        self._frame_bytes = width * height * 3

    def _binary(self):
        return shutil.which("gst-launch-1.0") or "gst-launch-1.0"

    def _pipeline(self):
        # NOTE: this GStreamer build requires the pipeline passed as separate argv
        # tokens (shell-split style); a single joined string with '!' is NOT parsed.
        return [
            "udpsrc",
            f"port={self.port}",
            f"caps=application/x-rtp,media=video,encoding-name=H264,payload={self.payload_type}",
            "!", "rtph264depay",
            "!", "h264parse",
            "!", "avdec_h264",
            "!", "videoconvert",
            "!", "videoscale",
            "!", f"video/x-raw,format=BGR,width={self.width},height={self.height}",
            "!", "fdsink", "fd=1", "sync=false",
        ]

    def _spawn(self):
        env = dict(os.environ)
        env["GST_DEBUG"] = "0"
        return subprocess.Popen(
            [self._binary(), "-q"] + self._pipeline(),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)

    def _drain_stderr(self):
        # Keep the stderr pipe drained so a full pipe can never block gst-launch.
        while self.proc is not None and not self.stopped.is_set():
            line = self.proc.stderr.readline()
            if not line:
                break
            self._stderr_tail = (self._stderr_tail + [line.decode(errors="replace").rstrip()])[-20:]

    def open(self):
        self._stderr_tail = []
        self.proc = self._spawn()
        self._stderr_thread = threading.Thread(target=self._drain_stderr,
                                               daemon=True, name="gst-stderr")
        self._stderr_thread.start()
        logger.info("GStreamer RTP receiver on udp://%s:%s (%sx%s)",
                    self.host, self.port, self.width, self.height)
        return True

    @property
    def last_stderr(self):
        return getattr(self, "_stderr_tail", [])

    def read_frames(self, buffer, on_frame=None):
        """Blocking loop; reads fixed-size BGR frames from the pipeline stdout."""
        total = self._frame_bytes
        frame = bytearray()
        while not self.stopped.is_set():
            if self.proc is None or self.proc.poll() is not None:
                logger.warning("GStreamer process exited unexpectedly; restarting in 2s")
                time.sleep(2)
                if self.stopped.is_set():
                    break
                self.proc = self._spawn()
                frame = bytearray()
                continue
            try:
                chunk = self.proc.stdout.read(total - len(frame))
            except Exception as e:  # noqa: BLE001
                logger.debug("GStreamer read error: %s", e)
                continue
            if not chunk:
                # no more output yet; keep any partial frame for next iteration
                time.sleep(0.01)
                continue
            frame.extend(chunk)
            if len(frame) < total:
                continue
            img = np.frombuffer(bytes(frame[:total]), dtype=np.uint8)
            img = img.reshape((self.height, self.width, 3))
            buffer.set(img)
            if on_frame:
                on_frame(img)
            frame = bytearray()

    def close(self):
        self.stopped.set()
        if self.proc is not None and self.proc.poll() is None:
            try:
                self.proc.terminate()
            except Exception:  # noqa: BLE001
                pass


def create_receiver(kind, host, port, width=640, height=480, payload_type=PAYLOAD_TYPE):
    if kind == "pyav":
        return PyAVReceiver(host, port, payload_type)
    return GStreamerReceiver(host, port, width=width, height=height,
                             payload_type=payload_type)


class PyAVReceiver:
    """Alternative FFmpeg (PyAV) based RTP receiver. Requires an active stream at
    open time (live source). Kept as an option; GStreamer is the default."""

    def __init__(self, host, port, payload_type=PAYLOAD_TYPE, sdp_dir=None):
        self.host = host
        self.port = port
        self.payload_type = payload_type
        self.sdp_path = os.path.join(
            sdp_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "sdp"),
            "video.sdp")
        self.container = None
        self.stream = None
        self.stopped = threading.Event()

    def open(self):
        import av
        os.makedirs(os.path.dirname(self.sdp_path), exist_ok=True)
        with open(self.sdp_path, "w") as f:
            f.write(_build_sdp(self.host, self.port, self.payload_type))
        self.container = av.open(self.sdp_path, format="rtp", mode="r")
        self.stream = self.container.streams.video[0]
        return True

    def read_frames(self, buffer, on_frame=None):
        import av
        for frame in self.container.decode(self.stream):
            if self.stopped.is_set():
                break
            img = frame.to_ndarray(format="bgr24")
            buffer.set(img)
            if on_frame:
                on_frame(img)

    def close(self):
        self.stopped.set()
        if self.container is not None:
            try:
                self.container.close()
            except Exception:  # noqa: BLE001
                pass


def _build_sdp(host, port, payload_type=PAYLOAD_TYPE, codec=CODEC):
    return (
        "v=0\n"
        f"o=- 0 0 IN IP4 {host}\n"
        "s=Drone RTP Stream\n"
        f"c=IN IP4 {host}\n"
        f"t=0 0\n"
        f"m=video {port} RTP/AVP {payload_type}\n"
        f"a=rtpmap:{payload_type} {codec}/90000\n"
    )
