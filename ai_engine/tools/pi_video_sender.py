"""
Raspberry Pi side: H.264 video capture + RTP/UDP send to the laptop AI engine.

Runs the GStreamer pipeline (gst-launch-1.0) that the project verified:
  v4l2src device=/dev/video0 -> YUY2 640x480@30 -> videoconvert ->
  x264enc tune=zerolatency speed-preset=ultrafast bitrate=2000 key-int-max=15 ->
  h264parse -> rtph264pay config-interval=1 pt=96 ->
  udpsink host=<laptop> port=5000 sync=false async=false

Not part of the laptop AI engine; this only captures/sends. The encoder tuning
matches the laptop receiver (H.264 payload type 96).
"""
import argparse
import subprocess
import sys

DEFAULT_PIPELINE = (
    "v4l2src device={device} ! video/x-raw,width=640,height=480,framerate=30/1,"
    "format=YUY2 ! videoconvert ! video/x-raw,format=I420 ! "
    "x264enc tune=zerolatency speed-preset=ultrafast bitrate=2000 key-int-max=15 ! "
    "h264parse ! rtph264pay config-interval=1 pt=96 ! "
    "udpsink host={laptop} port={port} sync=false async=false"
)


def main():
    ap = argparse.ArgumentParser(description="RPi video -> H.264/RTP/UDP sender")
    ap.add_argument("--laptop", default="192.168.50.119", help="laptop IP to send to")
    ap.add_argument("--port", type=int, default=5000, help="laptop UDP port")
    ap.add_argument("--device", default="/dev/video0", help="v4l2 capture device")
    ap.add_argument("--dry-run", action="store_true", help="print pipeline and exit")
    args = ap.parse_args()

    pipeline = DEFAULT_PIPELINE.format(
        device=args.device, laptop=args.laptop, port=args.port)
    cmd = ["gst-launch-1.0", "-v", pipeline]

    print("Sending H.264/RTP", flush=True)
    print("  laptop :", args.laptop, "port", args.port)
    print("  device :", args.device)
    print("  cmd    :", " ".join(cmd))
    if args.dry_run:
        return 0

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"GStreamer exited with error {e.returncode}", file=sys.stderr)
        return e.returncode
    except FileNotFoundError:
        print("gst-launch-1.0 not found. Install GStreamer on the Pi.", file=sys.stderr)
        return 127
    return 0


if __name__ == "__main__":
    sys.exit(main())
