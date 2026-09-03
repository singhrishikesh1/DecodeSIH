"""Configuration loader: YAML + environment-variable overrides.

Follows the project's YAML-config convention (pothole-detection-web) and allows
the key pipeline settings to be overridden via environment variables without
hardcoding paths throughout the code:
  AI_MODEL_PATH, AI_CONFIDENCE_THRESHOLD, AI_IOU_THRESHOLD, AI_IMAGE_SIZE,
  AI_VIDEO_PORT, AI_GPS_PORT, AI_BACKEND_URL, AI_DRONE_ID
"""
import logging
import os

import yaml

logger = logging.getLogger("drone_ai.config")

DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")


def _f(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return val


def load_config(config_path=None):
    path = config_path or os.environ.get("AI_CONFIG_PATH") or DEFAULT_CONFIG_PATH
    path = os.path.abspath(path)
    config_dir = os.path.dirname(path)
    with open(path, "r") as f:
        cfg = yaml.safe_load(f)

    # Resolve filesystem paths relative to the config file directory (not CWD)
    def _resolve(p):
        if not p:
            return p
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(config_dir, p))

    cfg["detection"]["model_path"] = _resolve(cfg["detection"].get("model_path"))
    cfg["persistence"]["evidence_image_dir"] = _resolve(
        cfg["persistence"].get("evidence_image_dir"))

    # Env overrides ----------------------------------------------------------
    if os.environ.get("AI_MODEL_PATH"):
        cfg["detection"]["model_path"] = os.environ["AI_MODEL_PATH"]
    if os.environ.get("AI_CONFIDENCE_THRESHOLD"):
        cfg["detection"]["confidence_threshold"] = float(os.environ["AI_CONFIDENCE_THRESHOLD"])
    if os.environ.get("AI_IOU_THRESHOLD"):
        cfg["tracking"]["iou_threshold"] = float(os.environ["AI_IOU_THRESHOLD"])
    if os.environ.get("AI_IMAGE_SIZE"):
        cfg["detection"]["input_size"] = int(os.environ["AI_IMAGE_SIZE"])
    if os.environ.get("AI_VIDEO_PORT"):
        cfg["video"]["port"] = int(os.environ["AI_VIDEO_PORT"])
    if os.environ.get("AI_GPS_PORT"):
        cfg["gps"]["port"] = int(os.environ["AI_GPS_PORT"])
    if os.environ.get("AI_BACKEND_URL"):
        cfg["persistence"]["backend_url"] = os.environ["AI_BACKEND_URL"]
    if os.environ.get("AI_DRONE_ID"):
        cfg["persistence"]["drone_id"] = os.environ["AI_DRONE_ID"]

    logger.info("Loaded config: model=%s video=%s gps=%s backend=%s",
                cfg["detection"]["model_path"],
                cfg["video"]["port"],
                cfg["gps"]["port"],
                cfg["persistence"]["backend_url"])
    return cfg
