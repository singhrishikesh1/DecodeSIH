"""ONNX inference wrapper for YOLO-seg pothole detection model."""
import logging
import numpy as np
from typing import Dict, List, Optional

logger = logging.getLogger("pothole_drone_ai.detection")


class PotholeDetector:
    """ONNX Runtime inference for YOLO-seg pothole model."""

    def __init__(self, config):
        self.model_path = config.get("model_path", "weights/pothole_seg.onnx")
        self.input_size = tuple(config.get("input_size", [640, 640]))
        self.conf_threshold = config.get("confidence_threshold", 0.45)
        self.nms_threshold = config.get("nms_threshold", 0.5)
        self.providers = config.get("providers", ["CPUExecutionProvider"])
        self.num_classes = config.get("num_classes", 1)
        self.session = None
        self._load_model()

    def _load_model(self):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(self.model_path, providers=self.providers)
            self.input_name = self.session.get_inputs()[0].name
            logger.info(f"Loaded ONNX model: {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.session = None

    def _preprocess(self, image):
        import cv2
        img = cv2.resize(image, self.input_size)
        img = img[:, :, ::-1].astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        return np.expand_dims(img, axis=0)

    def _postprocess(self, output, orig_h, orig_w):
        """Parse YOLO output into detections with masks.

        YOLOv8-seg output shape: (1, num_classes+4+32, num_detections)
        Rows: cx, cy, w, h, class_scores..., mask_coeffs...
        """
        predictions = output[0]
        # YOLOv8-seg output: (1, 4+num_classes+32, num_detections)
        if len(predictions.shape) == 3:
            predictions = predictions[0]  # (4+num_classes+32, N)

        # Transpose to (N, 4+num_classes+32) for easier row access
        if predictions.ndim == 2 and predictions.shape[0] < predictions.shape[1]:
            det = predictions.T  # Now (N, features)
        else:
            det = predictions

        boxes = []
        scores = []

        # Extract class scores: rows 4..4+num_classes-1
        num_features = det.shape[1] if det.ndim == 2 else 0
        if det.ndim == 2 and num_features > 5:
            class_scores = det[:, 4:4 + self.num_classes] if hasattr(self, 'num_classes') else det[:, 4:5]
            max_scores = class_scores.max(axis=1)
            for i in range(det.shape[0]):
                conf = float(max_scores[i])
                if conf < self.conf_threshold:
                    continue
                cx, cy, w, h = det[i, 0], det[i, 1], det[i, 2], det[i, 3]
                x1 = (cx - w / 2) / self.input_size[0] * orig_w
                y1 = (cy - h / 2) / self.input_size[1] * orig_h
                x2 = (cx + w / 2) / self.input_size[0] * orig_w
                y2 = (cy + h / 2) / self.input_size[1] * orig_h
                boxes.append([x1, y1, x2, y2])
                scores.append(conf)

        if len(boxes) == 0:
            return [], [], []

        boxes_arr = np.array(boxes, dtype=np.float32)
        scores_arr = np.array(scores, dtype=np.float32)

        from .utils import nms
        keep = nms(boxes_arr, scores_arr, self.nms_threshold)

        return boxes_arr[keep], scores_arr[keep], keep

    def detect(self, image) -> List[Dict]:
        """
        Run inference on a single image.

        Returns list of detections: [{bbox, confidence, class_id}]
        """
        if self.session is None:
            logger.warning("No model loaded")
            return []

        orig_h, orig_w = image.shape[:2]
        blob = self._preprocess(image)
        outputs = self.session.run(None, {self.input_name: blob})
        boxes, scores, indices = self._postprocess(outputs, orig_h, orig_w)

        detections = []
        for i, (box, score) in enumerate(zip(boxes, scores)):
            detections.append({
                "bbox": tuple(box),
                "confidence": float(score),
                "class_id": 0,
                "class_name": "pothole",
            })

        logger.info(f"Detected {len(detections)} potholes")
        return detections

    def detect_with_masks(self, image) -> List[Dict]:
        """Run detection and return segmentation masks if available."""
        detections = self.detect(image)
        if self.session is None:
            return detections

        try:
            import cv2
            orig_h, orig_w = image.shape[:2]
            blob = self._preprocess(image)
            outputs = self.session.run(None, {self.input_name: blob})

            # YOLOv8-seg returns protos in the second output
            if len(outputs) >= 2:
                protos = outputs[1]  # (1, mask_h, mask_w, mask_coeffs)
                if protos.shape[0] == 1:
                    protos = protos[0]

                for det in detections:
                    x1, y1, x2, y2 = det["bbox"]
                    # Generate mask from model protos (simplified)
                    # Full implementation requires mask coefficients from output
                    h, w = int(y2 - y1), int(x2 - x1)
                    if h > 0 and w > 0:
                        mask = np.zeros((orig_h, orig_w), dtype=np.float32)
                        mask[int(y1):int(y2), int(x1):int(x2)] = 1.0
                        det["mask_prob"] = mask
        except Exception as e:
            logger.debug(f"Mask extraction failed: {e}")

        return detections
