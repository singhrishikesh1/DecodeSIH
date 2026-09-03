"""Drone Infrastructure - Laptop AI Detection Pipeline entry point.

Usage:
    python main.py                # use ai_engine/config.yaml
    python main.py -c path.yaml   # custom config
    python main.py --self-test    # load model, verify config, then exit (no video)

Environment overrides (optional): AI_MODEL_PATH, AI_VIDEO_PORT, AI_GPS_PORT,
AI_BACKEND_URL, AI_DRONE_ID, AI_CONFIDENCE_THRESHOLD, AI_CONFIG_PATH ...
"""
import argparse
import logging
import os
import signal
import sys
import time

from config_loader import load_config, DEFAULT_CONFIG_PATH
from pipeline import DetectionPipeline


def setup_logging(level, log_file):
    handlers = [logging.StreamHandler()]
    if log_file:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(log_file)), exist_ok=True)
            handlers.append(logging.FileHandler(log_file))
        except Exception as e:  # noqa: BLE001
            print(f"Log file unavailable: {e}")
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="[%(asctime)s] %(levelname)-8s %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )


def self_test(cfg):
    from onnx_detector import OnnxPotholeDetector
    logging.getLogger("drone_ai").info("Running self-test...")
    det = OnnxPotholeDetector(
        model_path=cfg["detection"]["model_path"],
        input_size=cfg["detection"].get("input_size", 640),
        conf_threshold=cfg["detection"].get("confidence_threshold", 0.30),
        nms_threshold=cfg["detection"].get("nms_threshold", 0.45),
    )
    if not det.is_loaded():
        logging.getLogger("drone_ai").error("SELF-TEST FAILED: model did not load")
        return 1
    logging.getLogger("drone_ai").info("SELF-TEST OK: model loaded (detection), video=%s:%s gps=%s:%s",
                                       cfg["video"]["host"], cfg["video"]["port"],
                                       cfg["gps"]["host"], cfg["gps"]["port"])
    return 0


def main():
    parser = argparse.ArgumentParser(description="Drone AI Detection Pipeline (laptop)")
    parser.add_argument("-c", "--config", default=None, help="Path to config.yaml")
    parser.add_argument("--self-test", action="store_true",
                        help="Load model + print config, then exit (no video needed)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    lg = cfg["logging"]
    setup_logging(lg.get("level", "INFO"), lg.get("file"))

    if args.self_test:
        sys.exit(self_test(cfg))

    pipeline = DetectionPipeline(cfg)

    def _stop(*_a):
        logging.getLogger("drone_ai").info("Shutting down...")
        pipeline.stop()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logging.getLogger("drone_ai").info(
        "Starting AI pipeline. Waiting for UDP H.264 on %s:%s and MAVLink GPS on %s:%s",
        cfg["video"]["host"], cfg["video"]["port"], cfg["gps"]["host"], cfg["gps"]["port"])

    pipeline.start_receivers()
    try:
        pipeline.run()
    except KeyboardInterrupt:
        pipeline.stop()
    finally:
        pipeline.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
