import cv2
from onnx_detector import OnnxPotholeDetector
from config_loader import load_config

cfg = load_config()

image_path = r"..\backend\uploads\potholes\pothole_P026.jpg"

frame = cv2.imread(image_path)

if frame is None:
    raise RuntimeError(f"Could not read: {image_path}")

detector = OnnxPotholeDetector(
    model_path=cfg["detection"]["model_path"],
    input_size=cfg["detection"].get("input_size", 640),
    conf_threshold=0.0,
    nms_threshold=cfg["detection"].get("nms_threshold", 0.45),
    classes=cfg["detection"].get("classes", ["pothole"]),
)

detections = detector.detect(frame)

print("\n===== RAW MODEL TEST =====")
print("Image:", image_path)
print("Detections:", len(detections))

for i, d in enumerate(detections):
    print(
        f"{i}: class={d['class_name']} "
        f"confidence={d['confidence']:.4f} "
        f"bbox={d['bbox']}"
    )