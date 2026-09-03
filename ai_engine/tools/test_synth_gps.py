"""
LOCAL TEST ONLY: synthesize MAVLink GPS_RAW_INT on UDP:14550 (the laptop receiver),
mimicking the RPi forwarder. Lets you validate the laptop pymavlink GPS parsing
without a real flight controller.
"""
import argparse
import socket
import sys
import time

try:
    from pymavlink.dialects.v20 import ardupilotmega as mav
except ImportError:
    mav = None


def main():
    ap = argparse.ArgumentParser(description="Synthetic MAVLink GPS_RAW_INT sender (test)")
    ap.add_argument("--host", default="127.0.0.1", help="laptop receiver IP")
    ap.add_argument("--port", type=int, default=14550, help="laptop UDP port")
    ap.add_argument("--lat", type=float, default=18.5204)
    ap.add_argument("--lon", type=float, default=73.8567)
    ap.add_argument("--fix", type=int, default=3)
    ap.add_argument("--duration", type=float, default=0.0, help="0=forever")
    args = ap.parse_args()

    if mav is None:
        print("pymavlink not installed", file=sys.stderr)
        return 1

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    master = mav.MAVLink(None)

    def send():
        m = master.gps_raw_int_encode(
            time_usec=0, fix_type=args.fix,            lat=int(args.lat * 1e7), lon=int(args.lon * 1e7), alt=0,
            eph=100, epv=100, vel=0, cog=0, satellites_visible=12)
        m.pack(master)
        sock.sendto(m.get_msgbuf(), (args.host, args.port))

    print(f"Sending GPS_RAW_INT to {args.host}:{args.port} (fix={args.fix}) ...", flush=True)
    start = time.time()
    try:
        while True:
            if args.duration and (time.time() - start) > args.duration:
                break
            send()
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        sock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
