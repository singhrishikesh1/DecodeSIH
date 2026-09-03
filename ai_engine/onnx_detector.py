"""YOLOv8 object-detection inference wrapper (ONNX Runtime).

Model: weights/pretrained/best.onnx
Input : images [1, 3, 640, 640]  float32 (NCHW, RGB, /255)
Output: output0 [1, 5, 8400]  float32

VERIFIED OUTPUT LAYOUT (2026-09-02, inspected raw tensor values):
  output0 is channel-major: [1, 5, 8400]  -> 5 rows, 8400 anchor predictions.
  For every anchor the 5 channels are:
    row 0: cx      center-x of the box, in the RESIZED 640x640 space (0..640)
    row 1: cy      center-y of the box, in the RESIZED 640x640 space (0..640)
    row 2: w       box width  in pixels (0..640)
    row 3: h       box height in pixels (0..640)
    row 4: pothole class probability (ALREADY a sigmoid applied by the export,
           in [0, 1]; background anchors sit at <1e-5, which is impossible for
           raw logits - a 0.0 logit would sigmoid to ~0.5, and ~5800 anchors
           are <1e-5, so the export applied sigmoid inside the graph)
  8400 anchors == 80*80 + 40*40 + 20*20 (three YOLOv8 strides 8/16/32).
  There is NO separate objectness channel and NO multi-class vector in this
  single-class export: the fifth value IS the confidence to compare against
  the threshold.

The previous decoder already read these channels correctly (cx,cy,w,h,conf,
pixel coords, sigmoid probability). The apparent "1260 detections at conf=0.0"
is EXPECTED behaviour when the threshold is literally 0: every anchor with a
non-zero score passes the filter and NMS keeps the survivors. The threshold's
job is exactly to skip those near-zero anchors; the production threshold is
0.30. What the raw inspection DID prove is that the model itself fires a
high-confidence false positive on pothole_P026.jpg (top confidence 0.6125 in
the top-right region), which no correct decoder can remove.

This is a DETECTION (bbox) model. There is no segmentation-mask output in this
export, so geometry is derived from the bounding box only.
"""
import logging
import os

import numpy as np

logger = logging.getLogger("drone_ai.detector")

# Output channels per anchor: (cx, cy, w, h, prob)
N_BBOX_CHANNELS = 4
SCORE_CHANNEL = 4

# Enable detailed per-frame decode logging with either:
#   detector = OnnxPotholeDetector(..., debug=True)
#   or env var DRONE_AI_DETECTOR_DEBUG=1
_DEBUG_ENV = "DRONE_AI_DETECTOR_DEBUG"


def nms(boxes, scores, threshold):
    """Non-maximum suppression. Inputs (N,4) float, (N,) float. Returns indices."""
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while len(order) > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou_val = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[np.where(iou_val <= threshold)[0] + 1]
    return keep


class OnnxPotholeDetector:
    def __init__(self, model_path, input_size=640, conf_threshold=0.30,
                 nms_threshold=0.45, classes=("pothole",), debug=None):
        self.model_path = model_path
        self.input_size = int(input_size)
        self.conf_threshold = float(conf_threshold)
        self.nms_threshold = float(nms_threshold)
        self.classes = list(classes)
        # Debug decode stats enabled via constructor flag or env var.
        if debug is None:
            debug = os.environ.get(_DEBUG_ENV, "") in ("1", "true", "True")
        self.debug = bool(debug)
        self.session = None
        self.input_name = None
        self._load()

    def _load(self):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(
                self.model_path, providers=ort.get_available_providers()
            )
            self.input_name = self.session.get_inputs()[0].name
            logger.info("Model loaded: %s (providers=%s, debug=%s)",
                        self.model_path, ort.get_available_providers(), self.debug)
        except Exception as e:  # noqa: BLE001
            logger.error("Failed to load ONNX model %s: %s", self.model_path, e)
            self.session = None

    def is_loaded(self):
        return self.session is not None

    def _preprocess(self, image):
        img = cv2.resize(image, (self.input_size, self.input_size))
        img = img[:, :, ::-1].astype(np.float32) / 255.0  # BGR -> RGB
        img = np.transpose(img, (2, 0, 1))                 # HWC -> CHW
        return np.expand_dims(img, axis=0)

    def _raw_candidates(self, out):
        """Decode the raw ONNX tensor into (xywh_px, scores).

        Accepts output shapes [1, 5, 8400] (channel-major, this model) or an
        already-transposed [8400, 5]. Returns None on unexpected shapes.
        """
        pred = out[0] if out.ndim == 3 else out
        if pred.ndim == 2 and pred.shape[0] < pred.shape[1]:
            pred = pred.T
        if pred.ndim != 2 or pred.shape[1] < 5:
            logger.error("Unexpected ONNX output shape %s; expected [1,5,8400]",
                         tuple(out.shape))
            return None
        xywh = pred[:, :N_BBOX_CHANNELS].astype(np.float32)
        scores = pred[:, SCORE_CHANNEL].astype(np.float32)
        return xywh, scores

    def _decode_debug(self, raw_shape, raw_scores, n_raw, n_pos_score,
                      n_filtered, n_nms, orig_w, orig_h):
        """Report decode statistics when debug logging is enabled."""
        dbg = self.debug
        dbg = dbg or os.environ.get(_DEBUG_ENV, "") in ("1", "true", "True")
        if not dbg:
            return
        if raw_scores.size:
            top = float(np.max(raw_scores))
            if top > 1.0:
                logger.warning(
                    "Raw scores exceed 1.0 (max %.3f) - model may not have a "
                    "sigmoid in the class branch; verify calibration.", top)
            logger.debug(
                "detector decode: raw_shape=%s n_raw=%d n_pos_score=%d "
                "conf[min=%.6f max=%.6f mean=%.6f] -> after_conf=%d "
                "-> after_nms=%d (frame %dx%d)",
                tuple(raw_shape), n_raw, n_pos_score,
                float(np.min(raw_scores)), top, float(np.mean(raw_scores)),
                n_filtered, n_nms, orig_w, orig_h)

    def detect(self, image):
        """Run inference. Returns list of dicts:
        [{bbox: (x1,y1,x2,y2) float, confidence: float, class_id: 0,
          class_name: str, box_pixels: (w,h), area_px: float}]
        """
        if self.session is None:
            logger.warning("Model not loaded; skipping detection")
            return []
        orig_h, orig_w = image.shape[:2]
        blob = self._preprocess(image)
        outputs = self.session.run(None, {self.input_name: blob})
        out = outputs[0]
        xywh, scores = self._raw_candidates(out)
        if xywh is None:
            return []

        n_raw = xywh.shape[0]
        raw_scores = scores

        # ---- 1) confidence filter BEFORE box decoding / NMS -----------------
        mask = scores >= self.conf_threshold
        xywh = xywh[mask]
        scores = scores[mask]
        n_filtered = int(mask.sum())

        # ---- 2) convert model (640x640) coords -> original frame ------------
        isz = self.input_size
        xs1 = (xywh[:, 0] - xywh[:, 2] / 2) / isz * orig_w
        ys1 = (xywh[:, 1] - xywh[:, 3] / 2) / isz * orig_h
        xs2 = (xywh[:, 0] + xywh[:, 2] / 2) / isz * orig_w
        ys2 = (xywh[:, 1] + xywh[:, 3] / 2) / isz * orig_h
        boxes = np.stack([xs1, ys1, xs2, ys2], axis=1).astype(np.float32)

        # ---- 3) NMS on the surviving high-confidence candidates -------------
        keep = nms(boxes, scores, self.nms_threshold) if n_filtered else []
        n_nms = len(keep)

        self._decode_debug(tuple(out.shape), raw_scores, n_raw,
                           int((raw_scores > 0).sum()), n_filtered,
                           n_nms, orig_w, orig_h)

        dets = []
        cls_name = self.classes[0] if self.classes else "pothole"
        for k in keep:
            x1, y1 = max(0.0, float(boxes[k][0])), max(0.0, float(boxes[k][1]))
            x2, y2 = min(float(orig_w), float(boxes[k][2])), min(float(orig_h), float(boxes[k][3]))
            w_px, h_px = x2 - x1, y2 - y1
            dets.append({
                "bbox": (x1, y1, x2, y2),
                "confidence": float(scores[k]),
                "class_id": 0,
                "class_name": cls_name,
                "box_pixels": (w_px, h_px),
                "area_px": float(w_px * h_px),
            })
        return dets


import cv2  # noqa: E402  (imported late to keep header clean)