"""
Raspberry Pi side: forward MAVLink telemetry from the Flight Controller to the
laptop AI engine over UDP.

Flow:
  GPS -> Flight Controller -> MAVLink on serial (57600 baud) -> RPi -> UDP:14550 -> laptop

This talks to the FC's MAVLink serial device (using pymavlink) and re-packetizes
every MAVLink byte onto a UDP socket bound to a laptop port. It does NOT parse or
modify anything - the laptop does the GPS_RAW_INT parsing (pymavlink). This keeps
the Pi side dumb and robust.
"""
import argparse
import socket
import sys
import time

try:
    from pymavlink import mavutil
except ImportError:
    mavutil = None


def main():
    ap = argparse.ArgumentParser(description="RPi MAVLink serial -> UDP forwarder")
    ap.add_argument("--device", default="/dev/ttyAMA0", help="FC serial device")
    ap.add_argument("--baud", type=int, default=57600, help="FC MAVLink baud")
    ap.add_argument("--laptop", default="192.168.50.119", help="laptop IP")
    ap.add_argument("--port", type=int, default=14550, help="laptop UDP port")
    args = ap.parse_args()

    if mavutil is None:
        print("pymavlink not installed on the Pi. pip install pymavlink", file=sys.stderr)
        return 1

    print(f"Opening FC MAVLink on {args.device} @ {args.baud} baud ...", flush=True)
    mav = mavutil.mavlink_connection(args.device, baud=args.baud)
    mav.wait_heartbeat()
    print("Heartbeat from FC received; forwarding to "
          f"{args.laptop}:{args.port} ...", flush=True)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        while True:
            msg = mav.recv_match(blocking=True, timeout=1)
            if msg is None:
                continue
            # Forward the RAW bytes of this message so the laptop can parse them
            # (best-effort; pymavlink's raw byte recovery).
            buf = msg.get_msgbuf()
            if buf:
                sock.sendto(buf, (args.laptop, args.port))
    except KeyboardInterrupt:
        print("Stopped.", flush=True)
    finally:
        sock.close()
        mav.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
