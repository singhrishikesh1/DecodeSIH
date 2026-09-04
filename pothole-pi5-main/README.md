# Pothole Detection AI - Raspberry Pi 5

Real-time pothole detection, measurement, and severity classification using YOLOv8-seg on Raspberry Pi 5.

## What It Does

1. **Detects potholes** from camera feed using YOLOv8 (88% confidence on real images)
2. **Measures physical size** in centimeters (length × width × area)
3. **Classifies severity** as LOW / MEDIUM / HIGH / CRITICAL
4. **Tracks potholes** across video frames
5. **Logs GPS coordinates** (with GPS module)
6. **Generates reports** in JSON and HTML

## Verified Results

Tested on real pothole images from the internet:

| Image | Detections | Top Confidence | Severity |
|-------|-----------|----------------|----------|
| Road pothole | 3 | 88% | CRITICAL |
| Bengaluru road | 4 | 71% | CRITICAL |
| Street view | 10 | 82% | HIGH |
| Pothole close-up | 2 | 85% | MEDIUM |
| Water-filled | 6 | 83% | CRITICAL |

**Total: 8/8 images detected, 35 potholes found, 51% average confidence**

## Quick Start

### On Raspberry Pi 5

```bash
# Clone
git clone https://github.com/ItsParthPinjarkar/pothole-pi5.git
cd pothole-pi5

# Install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
sudo apt install -y python3-picamera2

# Run with live camera
python run_pi.py --model weights/pretrained/best.onnx

# Run with webcam (USB)
python webcam_detect.py

# Run with video file
python run_pi.py --model weights/pretrained/best.onnx --video road.mp4
```

### On Your Computer (for testing)

```bash
# Install
pip install -r requirements-deploy.txt

# Live webcam detection
python webcam_detect.py

# Test with images
python scripts/test_user_images.py

# Web interface (upload images via browser)
python web_app.py
# Then open http://localhost:5000
```

## Webcam Controls

| Key | Action |
|-----|--------|
| `q` / `ESC` | Quit |
| `s` | Save current frame |
| `SPACE` | Pause / Resume |
| `+` / `-` | Adjust confidence threshold |
| `m` | Toggle measurements on/off |

## File Structure

```
├── run_pi.py              # Main Pi 5 runner (camera + GPS + pipeline)
├── webcam_detect.py        # Live webcam detection (any computer)
├── web_app.py              # Web interface for image upload
├── src/
│   ├── detection.py        # YOLOv8 ONNX inference
│   ├── measurement.py      # Physical measurements in cm
│   ├── severity.py         # LOW/MEDIUM/HIGH/CRITICAL classification
│   ├── camera_pi.py        # Pi Camera + USB camera support
│   ├── tracking.py         # Pothole tracking across frames
│   ├── gps.py              # GPS coordinate logging
│   ├── pipeline.py         # Full detection pipeline
│   └── utils.py            # Coordinate transforms & calibration
├── weights/pretrained/
│   └── best.onnx           # Pre-trained YOLOv8 model (22MB)
├── config/
│   └── config.yaml         # Camera calibration & severity thresholds
├── requirements.txt        # Pi 5 dependencies
└── requirements-deploy.txt # Desktop/server dependencies
```

## Hardware (Raspberry Pi 5)

| Component | Recommended |
|-----------|-------------|
| Board | Raspberry Pi 5 (4GB+ RAM) |
| Camera | Pi Camera Module v2/v3 (CSI) or USB webcam |
| GPS (optional) | NEO-6M via UART |
| Storage | 16GB+ microSD |
| Power | 5V/3A USB-C |

## Model Info

- **Architecture:** YOLOv8-seg (segmentation)
- **Input:** 640×640 RGB image
- **Size:** 22MB (ONNX format)
- **Inference:** ~70ms on Pi 5 ARM CPU, ~190ms on desktop CPU
- **Training:** Pre-trained on real road damage photos

## Deploy Online

See [DEPLOY.md](DEPLOY.md) for Render.com / Vercel deployment instructions.
