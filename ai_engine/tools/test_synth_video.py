"""
LOCAL TEST ONLY: synthesize H.264/RTP video to the laptop receiver on UDP:5000,
mimicking the Raspberry Pi sender. Use to validate the laptop pipeline without a
real drone camera.

Streams a single sample image (or a camera) as H.264 RTP payload-type 96.
"""
import argparse
import sys
import time

import cv2
import av


def main():
    ap = argparse.ArgumentParser(description="Synthetic H.264/RTP sender (test)")
    ap.add_argument("--host", default="127.0.0.1", help="laptop receiver IP")
    ap.add_argument("--port", type=int, default=5000, help="laptop UDP port")
    ap.add_argument("--image", default=None, help="sample image to stream")
    ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--duration", type=float, default=0.0, help="0=forever")
    args = ap.parse_args()

    if args.image:
        frame = cv2.imread(args.image)
        if frame is None:
            print("Cannot read image:", args.image, file=sys.stderr)
            return 1
        width, height = frame.shape[1], frame.shape[0]
    else:
        width, height = 640, 480
        frame = None

    # RTP output to the receiver
    out = av.open(f"rtp://{args.host}:{args.port}", format="rtp", mode="w")
    stream = out.add_stream("h264", rate=args.fps)
    stream.bit_rate = 2000000
    stream.thread_type = "AUTO"
    stream.gop_size = 15
    stream.max_b_frames = 0
    try:
        stream.codec_context = None
    except Exception:
        pass

    print(f"Streaming H.264 RTP to {args.host}:{args.port} @ {args.fps} fps ...", flush=True)
    start = time.time()
    i = 0
    try:
        while True:
            if args.duration and (time.time() - start) > args.duration:
                break
            if frame is not None:
                img = frame
                # animate jitter between two frames when available optionally
            else:
                import numpy as np
                img = np.zeros((height, width, 3), dtype=np.uint8)
                cv2.putText(img, str(i), (20, 240), cv2.FONT_HERSHEY_SIMPLEX, 2,
                            (0, 255, 0), 3)

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            vf = av.VideoFrame.from_ndarray(rgb, format="rgb24")
            vf.pts = i
            for packet in stream.encode(vf):
                out.mux(packet)
            i += 1
            time.sleep(1.0 / args.fps)
    except KeyboardInterrupt:
        pass
    finally:
        for packet in stream.encode():
            out.mux(packet)
        out.close()
    print("Done.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
