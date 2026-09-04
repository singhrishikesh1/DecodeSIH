#!/usr/bin/env python3
"""
Raspberry Pi 5 Camera Module — async capture with picamera2.

Supports:
- Pi Camera Module v2/v3/IR
- USB webcams as fallback
- Adjustable resolution and FPS
- Non-blocking frame capture via threading

Hardware setup:
    Pi Camera → CSI port (ribbon cable)
    OR USB Camera → any USB port

Enable camera:
    sudo raspi-config → Interface → Camera → Enable
    sudo apt install -y python3-picamera2
"""
import time
import logging
import threading
import numpy as np
from typing import Optional, Tuple

logger = logging.getLogger("pothole_drone_ai.camera")


class PiCamera:
    """
    Async camera capture for Raspberry Pi 5.

    Captures frames in a background thread so the main pipeline
    never waits for the camera.
    """

    def __init__(self, width=1280, height=720, fps=30, camera_id=0):
        """
        Args:
            width:  Capture width in pixels (1280 for Pi Camera v2)
            height: Capture height in pixels (720 for Pi Camera v2)
            fps:    Target frames per second
            camera_id: Camera device ID (0=CSI, 1+=USB)
        """
        self.width = width
        self.height = height
        self.fps = fps
        self.camera_id = camera_id
        self._camera = None
        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._backend = None  # "picamera2" or "opencv"

    def open(self) -> bool:
        """Open camera. Returns True if successful."""
        # Try picamera2 first (native Pi camera)
        if self._try_picamera2():
            return True
        # Fallback to OpenCV (USB cameras)
        if self._try_opencv():
            return True
        logger.error("No camera found! Check connections.")
        return False

    def _try_picamera2(self) -> bool:
        """Try to use picamera2 (Raspberry Pi native)."""
        try:
            from picamera2 import Picamera2
            from libcamera import controls

            picam2 = Picamera2(self.camera_id)
            config = picam2.create_preview_configuration(
                main={"size": (self.width, self.height), "format": "RGB888"},
                controls={"FrameRate": self.fps},
            )
            picam2.configure(config)
            picam2.start()
            time.sleep(0.5)  # Let auto-exposure settle

            self._camera = picam2
            self._backend = "picamera2"
            logger.info(f"picamera2 opened: {self.width}x{self.height} @ {self.fps}fps")
            return True
        except ImportError:
            logger.debug("picamera2 not installed")
            return False
        except Exception as e:
            logger.debug(f"picamera2 failed: {e}")
            return False

    def _try_opencv(self) -> bool:
        """Fallback: OpenCV VideoCapture (works with USB cameras)."""
        try:
            import cv2
            cap = cv2.VideoCapture(self.camera_id)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_FPS, self.fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency

            if not cap.isOpened():
                return False

            # Test capture
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.release()
                return False

            self._camera = cap
            self._backend = "opencv"
            logger.info(f"OpenCV camera opened: {self.width}x{self.height}")
            return True
        except Exception as e:
            logger.debug(f"OpenCV camera failed: {e}")
            return False

    def start_capture(self):
        """Start async frame capture in background thread."""
        if self._camera is None:
            logger.error("Camera not opened")
            return

        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("Async capture started")

    def _capture_loop(self):
        """Background thread: continuously grab latest frame."""
        while self._running:
            try:
                frame = self.read_raw()
                if frame is not None:
                    with self._lock:
                        self._frame = frame
                time.sleep(1.0 / (self.fps * 2))  # Capture faster than needed
            except Exception as e:
                logger.error(f"Capture error: {e}")
                time.sleep(0.1)

    def read(self) -> Optional[np.ndarray]:
        """Get latest frame (non-blocking). Returns BGR numpy array or None."""
        with self._lock:
            if self._frame is not None:
                return self._frame.copy()
        return None

    def read_raw(self) -> Optional[np.ndarray]:
        """Read a frame directly from camera (blocking)."""
        try:
            if self._backend == "picamera2":
                frame = self._camera.capture_array()
                # picamera2 returns RGB, convert to BGR for OpenCV
                import cv2
                return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            elif self._backend == "opencv":
                # Flush buffer to get latest frame
                self._camera.grab()
                ret, frame = self._camera.read()
                return frame if ret else None
        except Exception as e:
            logger.error(f"Frame read error: {e}")
        return None

    def read_with_timestamp(self) -> Tuple[Optional[np.ndarray], float]:
        """Get latest frame with timestamp."""
        with self._lock:
            if self._frame is not None:
                return self._frame.copy(), time.time()
        return None, time.time()

    def stop(self):
        """Stop capture and release camera."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
        if self._camera:
            try:
                if self._backend == "picamera2":
                    self._camera.stop()
                    self._camera.close()
                elif self._backend == "opencv":
                    self._camera.release()
            except Exception:
                pass
            self._camera = None
        logger.info("Camera stopped")

    def __enter__(self):
        self.open()
        self.start_capture()
        return self

    def __exit__(self, *args):
        self.stop()

    def __del__(self):
        self.stop()


class USBCamera:
    """Simple USB camera wrapper for testing on non-Pi systems."""

    def __init__(self, camera_id=0, width=1280, height=720):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self._cap = None

    def open(self) -> bool:
        import cv2
        self._cap = cv2.VideoCapture(self.camera_id)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        return self._cap.isOpened()

    def read(self):
        if self._cap:
            ret, frame = self._cap.read()
            return frame if ret else None
        return None

    def stop(self):
        if self._cap:
            self._cap.release()
            self._cap = None
