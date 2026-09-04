"""
Pothole Detection Web App
- Upload an image, see detections with physical measurements
- Works locally AND on Render.com

Run locally:
    python web_app.py

Deploy to Render:
    Push to GitHub, connect repo at render.com, it auto-detects render.yaml
"""
import os, sys, base64, time
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.utils import load_config
from src.measurement import PotholeMeasurement
from src.severity import SeverityClassifier

# ── Load model ──────────────────────────────────────────────────────────────
import urllib.request
from ultralytics import YOLO

MODEL_URL = "https://huggingface.co/gooofy/yolov8-pothole/resolve/main/best.pt"


def download_model(dest="weights/pretrained/best.pt"):
    """Download model from Hugging Face if not present locally."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"Downloading model from {MODEL_URL}...")
    urllib.request.urlretrieve(MODEL_URL, dest)
    print(f"Model saved to {dest}")
    return dest


def find_model():
    """Search for the best available model, download if missing."""
    search_paths = [
        os.environ.get("MODEL_PATH", ""),
        "weights/pretrained/best.pt",
        "weights/pretrained/best.onnx",
        "weights/pothole_seg.onnx",
    ]
    for p in search_paths:
        if p and os.path.exists(p):
            return p
    # Auto-download from Hugging Face
    print("No local model found. Downloading pre-trained model...")
    try:
        return download_model()
    except Exception as e:
        print(f"Download failed: {e}")
        # Fall back to training a small model
        print("Training a quick model from scratch...")
        from ultralytics import YOLO
        model = YOLO("yolov8n.pt")  # nano model, ~6MB
        return "yolov8n.pt"

MODEL_PATH = find_model()
if not MODEL_PATH:
    print("ERROR: No model found.")
    sys.exit(1)

print(f"Loading model: {MODEL_PATH}")
model = YOLO(MODEL_PATH)

# ── Load config ─────────────────────────────────────────────────────────────
config = load_config()
K = np.array(config["camera"]["camera_matrix"], dtype=np.float64)
D = np.array(config["camera"]["distortion_coefficients"], dtype=np.float64)
height_m = config["camera"]["mount"]["height_m"]
measurer = PotholeMeasurement(K, D, height_m)
sev_classifier = SeverityClassifier(config["severity"])
COLORS = {"LOW": (0, 255, 0), "MEDIUM": (0, 255, 255),
          "HIGH": (0, 165, 255), "CRITICAL": (0, 0, 255)}

# ── Flask ───────────────────────────────────────────────────────────────────
from flask import Flask, render_template_string, request, jsonify

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

HTML_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pothole Detection AI</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a1a; color: #eee; min-height: 100vh; }
.header { background: linear-gradient(135deg, #0f3460, #16213e); padding: 30px; text-align: center; border-bottom: 3px solid #00d4ff; }
.header h1 { font-size: 32px; color: #00d4ff; }
.header p { color: #888; margin-top: 8px; }
.container { max-width: 1000px; margin: 30px auto; padding: 0 20px; }
.uz { border: 3px dashed #0f3460; border-radius: 16px; padding: 60px 40px; text-align: center; cursor: pointer; transition: all 0.3s; background: #16213e; }
.uz:hover { border-color: #00d4ff; background: #1a2744; }
.uz.drag { border-color: #00d4ff; transform: scale(1.02); }
.uz h2 { color: #00d4ff; font-size: 24px; margin: 10px 0; }
.uz p { color: #888; }
.uz .icon { font-size: 60px; }
#fi { display: none; }
.ld { display: none; text-align: center; padding: 40px; }
.ld.show { display: block; }
.sp { border: 4px solid #0f3460; border-top: 4px solid #00d4ff; border-radius: 50%; width: 50px; height: 50px; animation: sp 1s linear infinite; margin: 0 auto 15px; }
@keyframes sp { to { transform: rotate(360deg); } }
.res { display: none; margin-top: 30px; }
.res.show { display: block; }
.st { font-size: 20px; color: #ff6b35; margin: 20px 0 10px; }
.ic { border-radius: 12px; overflow: hidden; background: #000; }
.ic img { width: 100%; display: block; }
.sr { display: flex; gap: 12px; flex-wrap: wrap; margin: 15px 0; }
.sb { background: #0f3460; padding: 10px 18px; border-radius: 10px; text-align: center; min-width: 100px; }
.sb .v { font-size: 24px; font-weight: bold; color: #00d4ff; }
.sb .l { font-size: 11px; color: #aaa; }
.pc { background: #16213e; border-radius: 10px; padding: 12px 16px; margin: 8px 0; border-left: 4px solid #00d4ff; }
.pc.hi { border-left-color: #ff6b35; } .pc.md { border-left-color: #ffaa00; } .pc.lo { border-left-color: #44ff44; } .pc.cr { border-left-color: #ff0000; }
.pc h3 { color: #00d4ff; font-size: 16px; }
.pc .d { color: #ccc; font-size: 13px; margin: 3px 0; }
.pc .d b { color: #fff; }
.bg { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; color: #fff; }
.bg-HIGH { background: #ff6b35; } .bg-MEDIUM { background: #ffaa00; color: #000; } .bg-LOW { background: #44ff44; color: #000; } .bg-CRITICAL { background: #ff0000; }
.np { background: #1a3a1a; border: 1px solid #44ff44; border-radius: 10px; padding: 20px; text-align: center; color: #44ff44; font-size: 18px; }
.btn { display: inline-block; margin-top: 15px; padding: 10px 24px; background: #00d4ff; color: #000; border-radius: 8px; cursor: pointer; font-weight: bold; border: none; font-size: 14px; }
.btn:hover { background: #00b8d9; }
</style>
</head>
<body>
<div class="header">
    <h1>🕳️ Pothole Detection AI</h1>
    <p>Upload a road photo — AI detects and measures potholes in centimeters</p>
</div>
<div class="container">
    <div class="uz" id="dz" onclick="document.getElementById('fi').click()">
        <div class="icon">📷</div>
        <h2>Drop your image here</h2>
        <p>or click to browse — JPG, PNG, BMP</p>
        <input type="file" id="fi" accept="image/*" onchange="go(this)">
    </div>
    <div class="ld" id="ld"><div class="sp"></div><p>Analyzing image... detecting potholes...</p></div>
    <div class="res" id="res">
        <div class="st">Detection Result</div>
        <div class="ic"><img id="ri"></div>
        <div class="sr" id="st2"></div>
        <div id="pc"></div>
        <div style="text-align:center"><button class="btn" onclick="reset()">Upload Another</button></div>
    </div>
</div>
<script>
const dz=document.getElementById('dz'),fi=document.getElementById('fi');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');if(e.dataTransfer.files.length){fi.files=e.dataTransfer.files;go(fi)}});
function go(inp){
  if(!inp.files||!inp.files[0])return;
  const fd=new FormData();fd.append('image',inp.files[0]);
  document.getElementById('ld').classList.add('show');
  document.getElementById('res').classList.remove('show');
  dz.style.display='none';
  fetch('/detect',{method:'POST',body:fd})
  .then(r=>r.json()).then(d=>{
    document.getElementById('ld').classList.remove('show');
    if(d.error){alert('Error: '+d.error);dz.style.display='block';return}
    document.getElementById('res').classList.add('show');
    document.getElementById('ri').src='data:image/png;base64,'+d.annotated_image;
    document.getElementById('st2').innerHTML=`<div class="sb"><div class="v">${d.total_potholes}</div><div class="l">Potholes</div></div><div class="sb"><div class="v">${d.processing_time}ms</div><div class="l">Time</div></div><div class="sb"><div class="v">${d.image_size}</div><div class="l">Size</div></div>`;
    const pc=document.getElementById('pc');pc.innerHTML='';
    if(!d.potholes||d.potholes.length===0)pc.innerHTML='<div class="np">✅ No potholes detected — road looks good!</div>';
    else d.potholes.forEach(p=>{
      const cls=p.severity.toLowerCase();
      const sz=p.length_cm&&p.width_cm?p.length_cm+' × '+p.width_cm+' cm':'N/A';
      pc.innerHTML+=`<div class="pc ${cls==='high'?'hi':cls==='critical'?'cr':cls==='medium'?'md':'lo'}"><h3>${p.id} <span class="bg bg-${p.severity}">${p.severity}</span></h3><div class="d">Size: <b>${sz}</b></div><div class="d">Area: <b>${p.area_cm2?p.area_cm2+' cm²':'N/A'}</b></div><div class="d">Diameter: <b>${p.diameter_cm?p.diameter_cm+' cm':'N/A'}</b></div><div class="d">Depth: <b>${p.depth_cm?p.depth_cm+' cm':'N/A (no depth sensor)'}</b></div><div class="d">Confidence: <b>${(p.confidence*100).toFixed(0)}%</b></div></div>`;
    });
  }).catch(e=>{document.getElementById('ld').classList.remove('show');alert('Error: '+e.message);dz.style.display='block'});
}
function reset(){document.getElementById('res').classList.remove('show');document.getElementById('ld').classList.remove('show');dz.style.display='block';fi.value='';}
</script>
</body>
</html>"""


@app.route("/")
def index():
    return render_template_string(HTML_PAGE)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_PATH})


@app.route("/detect", methods=["POST"])
def detect():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]
    img_bytes = file.read()
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"error": "Cannot read image"}), 400

    t0 = time.time()
    results = model(img, verbose=False)
    r = results[0]
    n = len(r.boxes)
    elapsed = int((time.time() - t0) * 1000)

    annotated = img.copy()
    potholes = []

    for j in range(n):
        box = r.boxes.xyxy[j].cpu().numpy()
        conf = float(r.boxes.conf[j])
        x1, y1, x2, y2 = [int(v) for v in box]

        # Get segmentation contour if available
        contour = None
        if r.masks is not None and j < len(r.masks):
            pts = r.masks.xy[j]
            if len(pts) >= 3:
                contour = np.array(pts, dtype=np.float32).reshape(-1, 1, 2)

        if contour is None:
            # Fall back to bounding box corners
            contour = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
                               dtype=np.float32).reshape(-1, 1, 2)

        # Physical measurements
        meas = measurer.measure_all(contour)
        meas["severity"] = sev_classifier.classify(meas)
        color = COLORS.get(meas["severity"], (255, 255, 255))

        # Draw detection
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.drawContours(annotated, [contour.astype(int)], -1, color, 2)

        pid = f"P{j+1:03d}"
        label_lines = [f"{pid} ({conf:.0%})"]
        if meas["length_cm"] and meas["width_cm"]:
            label_lines.append(f"{meas['length_cm']:.1f} x {meas['width_cm']:.1f} cm")
        label_lines.append(f"Severity: {meas['severity']}")

        y_off = y1 - 5
        for line in label_lines:
            (tw, th), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            if y_off - th - 6 < 0:
                break
            cv2.rectangle(annotated, (x1, y_off - th - 6), (x1 + tw + 6, y_off), color, -1)
            cv2.putText(annotated, line, (x1 + 3, y_off - 3),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
            y_off -= th + 8

        potholes.append({
            "id": pid,
            "confidence": round(conf, 3),
            "length_cm": round(meas["length_cm"], 1) if meas["length_cm"] else None,
            "width_cm": round(meas["width_cm"], 1) if meas["width_cm"] else None,
            "area_cm2": round(meas["surface_area_cm2"], 1) if meas["surface_area_cm2"] else None,
            "diameter_cm": round(meas["equivalent_diameter_cm"], 1) if meas["equivalent_diameter_cm"] else None,
            "depth_cm": round(meas["max_depth_cm"], 1) if meas.get("max_depth_cm") else None,
            "severity": meas["severity"],
        })

    _, buf = cv2.imencode(".png", annotated)
    b64 = base64.b64encode(buf).decode()

    return jsonify({
        "annotated_image": b64,
        "total_potholes": n,
        "potholes": potholes,
        "processing_time": elapsed,
        "image_size": f"{img.shape[1]}x{img.shape[0]}",
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  🕳️  Pothole Detection Web App")
    print(f"  Model: {MODEL_PATH}")
    print(f"  Open:  http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
