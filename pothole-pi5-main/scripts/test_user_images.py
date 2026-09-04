"""Test the model on the user's own images and show detailed results."""
import cv2
import numpy as np
import os
import base64
import time
import sys
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ultralytics import YOLO


def main():
    base = os.path.join(os.path.dirname(__file__), '..')

    with open(os.path.join(base, 'config', 'config.yaml')) as f:
        config = yaml.safe_load(f)

    K = np.array(config['camera']['camera_matrix'], dtype=np.float64)
    height_m = config['camera']['mount']['height_m']

    from src.severity import SeverityClassifier
    sev_cls = SeverityClassifier(config['severity'])

    model_path = os.path.join(base, 'weights', 'pretrained', 'best.onnx')
    model = YOLO(model_path)
    print(f'Model loaded: {model_path}\n')

    img_dir = os.path.join(base, 'my_images')
    images = sorted([f for f in os.listdir(img_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.jfif', '.bmp', '.webp'))])

    print(f'Testing {len(images)} of your images...\n')

    # Build HTML
    html = '''<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Your Images - Pothole Detection Results</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0a0a1a;color:#eee}
.hdr{background:linear-gradient(135deg,#0f3460,#16213e);padding:30px;text-align:center;border-bottom:3px solid #00d4ff}
.hdr h1{font-size:28px;color:#00d4ff}
.hdr p{color:#888;margin-top:8px}
.stats{max-width:900px;margin:20px auto;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.stat{background:#16213e;padding:15px 20px;border-radius:12px;text-align:center;min-width:120px}
.stat .v{font-size:26px;font-weight:bold;color:#00d4ff}
.stat .l{font-size:11px;color:#888;margin-top:4px}
.crd{max-width:950px;margin:20px auto;background:#16213e;border-radius:12px;overflow:hidden}
.crd .rw{display:flex}
.crd .cl{flex:1;padding:5px}
.crd .cl p{text-align:center;color:#aaa;font-size:13px;padding:8px}
.crd img{width:100%;display:block}
.dt{padding:12px 16px;margin:8px;background:#0f3460;border-radius:8px;border-left:4px solid #00d4ff}
.dt.hi{border-left-color:#ff6b35}.dt.md{border-left-color:#ffaa00}.dt.lo{border-left-color:#44ff44}.dt.cr{border-left-color:#ff0000}
.dt .rw{display:flex;justify-content:space-between;align-items:center}
.badge{padding:3px 10px;border-radius:12px;font-weight:bold;font-size:11px;color:#fff}
.badge-LOW{background:#27ae60}.badge-MEDIUM{background:#f39c12;color:#000}.badge-HIGH{background:#e67e22}.badge-CRITICAL{background:#e74c3c}
.nd{padding:15px;text-align:center;color:#666;font-style:italic}
.sum{max-width:900px;margin:30px auto;padding:25px;background:#16213e;border-radius:12px;text-align:center}
.sum h2{color:#00d4ff;margin-bottom:15px}
</style></head><body>
<div class="hdr"><h1>Your Images - Pothole Detection Results</h1>
<p>AI model tested on your uploaded road photos</p></div>
'''

    total_det = 0
    detected_count = 0
    all_det = []
    confidences = []

    for img_name in images:
        img_path = os.path.join(img_dir, img_name)
        img = cv2.imread(img_path)
        if img is None:
            print(f'Cannot read: {img_name}')
            continue
        h_orig, w_orig = img.shape[:2]

        t0 = time.time()
        results = model(img, verbose=False, conf=0.15)
        infer_ms = (time.time() - t0) * 1000

        r = results[0]
        n_det = len(r.boxes) if r.boxes is not None else 0
        total_det += n_det
        if n_det > 0:
            detected_count += 1

        status = f'{n_det} POthole(s)' if n_det > 0 else 'NONE'
        print(f'{img_name} ({w_orig}x{h_orig}): {status} detected ({infer_ms:.0f}ms)')

        # Annotate
        annotated = img.copy()
        if n_det > 0:
            for i in range(n_det):
                box = r.boxes.xyxy[i].cpu().numpy().astype(int)
                conf = float(r.boxes.conf[i])
                x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                w_px = x2 - x1
                h_px = y2 - y1

                pixel_area = w_px * h_px
                area_m2 = (pixel_area * height_m**2) / (float(K[0,0]) * float(K[1,1]))
                area_cm2 = area_m2 * 10000
                length_cm = (w_px * height_m * 100) / float(K[0,0])
                width_cm = (h_px * height_m * 100) / float(K[1,1])

                meas_dict = {'max_depth_cm': 5.0, 'surface_area_cm2': area_cm2, 'volume_cm3': area_cm2 * 5.0}
                severity = sev_cls.classify(meas_dict)
                confidences.append(conf)

                color = {'LOW': (0,255,0), 'MEDIUM': (0,255,255), 'HIGH': (0,165,255), 'CRITICAL': (0,0,255)}.get(severity, (255,255,255))
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 255), 2)
                cv2.rectangle(annotated, (x1, y1-25), (x1+200, y1), (0, 0, 0), -1)
                label = f'P{i+1} {length_cm:.0f}x{width_cm:.0f}cm {severity} {conf*100:.0f}%'
                cv2.putText(annotated, label, (x1+4, y1-8), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

                print(f'  -> Pothole {i+1}: {length_cm:.1f}x{width_cm:.1f}cm area={area_cm2:.0f}cm2 severity={severity} conf={conf*100:.0f}%')
                all_det.append({'img': img_name, 'conf': conf, 'severity': severity, 'length': length_cm, 'width': width_cm, 'area': area_cm2})

        # Encode images
        _, orig_b64 = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        _, annot_b64 = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
        orig_str = base64.b64encode(orig_b64).decode()
        annot_str = base64.b64encode(annot_b64).decode()

        html += f'<div class="crd"><div class="rw">'
        html += f'<div class="cl"><p>Original: {img_name}</p><img src="data:image/jpeg;base64,{orig_str}"></div>'
        html += f'<div class="cl"><p>Detection Result</p><img src="data:image/jpeg;base64,{annot_str}"></div>'
        html += '</div><div style="padding:10px 16px">'

        img_det = [d for d in all_det if d['img'] == img_name]
        if img_det:
            for j, d in enumerate(img_det):
                dc = {'LOW':'lo','MEDIUM':'md','HIGH':'hi','CRITICAL':'cr'}.get(d['severity'], 'md')
                html += f'<div class="dt {dc}"><div class="rw">'
                html += f'<span><b>Pothole {j+1}</b> — Confidence: {d["conf"]*100:.0f}%</span>'
                html += f'<span class="badge badge-{d["severity"]}">{d["severity"]}</span></div>'
                html += f'<div style="color:#ccc;font-size:13px;margin-top:4px">'
                html += f'Size: {d["length"]:.1f} x {d["width"]:.1f} cm | Area: {d["area"]:.0f} cm&sup2;</div></div>'
        else:
            html += '<div class="nd">No potholes detected in this image</div>'
        html += '</div></div>'

    # Summary
    avg_conf = sum(confidences)/len(confidences)*100 if confidences else 0
    sev_counts = {}
    for d in all_det:
        sev_counts[d['severity']] = sev_counts.get(d['severity'], 0) + 1

    html += '<div class="stats">'
    html += f'<div class="stat"><div class="v">{len(images)}</div><div class="l">Images Tested</div></div>'
    html += f'<div class="stat"><div class="v">{detected_count}</div><div class="l">With Potholes</div></div>'
    html += f'<div class="stat"><div class="v">{total_det}</div><div class="l">Total Detections</div></div>'
    html += f'<div class="stat"><div class="v">{avg_conf:.0f}%</div><div class="l">Avg Confidence</div></div>'
    html += '</div>'

    html += '<div class="sum"><h2>Detection Summary</h2>'
    for s in ['LOW','MEDIUM','HIGH','CRITICAL']:
        if s in sev_counts:
            html += f'<span class="badge badge-{s}" style="margin:4px;font-size:14px;padding:6px 14px">{s}: {sev_counts[s]}</span> '
    html += '</div></body></html>'

    report_path = os.path.join(base, 'verification_output', 'your_images_test.html')
    with open(report_path, 'w') as f:
        f.write(html)

    print(f'\n{"="*50}')
    print(f'RESULTS: {detected_count}/{len(images)} images had potholes detected')
    print(f'Total: {total_det} potholes | Avg confidence: {avg_conf:.0f}%')
    print(f'Report: {report_path}')
    print(f'{"="*50}')


if __name__ == '__main__':
    main()
