"""Download actual pothole images and test with lower confidence threshold."""
import cv2
import numpy as np
import os
import base64
import time
import sys
import yaml
import urllib.request

from ultralytics import YOLO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


def main():
    base = os.path.join(os.path.dirname(__file__), '..')

    # Load config
    with open(os.path.join(base, 'config', 'config.yaml')) as f:
        config = yaml.safe_load(f)

    K = np.array(config['camera']['camera_matrix'], dtype=np.float64)
    D = np.array(config['camera']['distortion_coefficients'], dtype=np.float64)
    height_m = config['camera']['mount']['height_m']

    from src.severity import SeverityClassifier
    sev_cls = SeverityClassifier(config['severity'])

    # Find model
    model_path = os.path.join(base, 'weights', 'pretrained', 'best.onnx')
    if not os.path.exists(model_path):
        model_path = os.path.join(base, 'weights', 'pothole_seg.onnx')
    print(f'Model: {model_path}')
    model = YOLO(model_path)

    # Create test dir
    test_dir = os.path.join(base, 'real_test_images')
    os.makedirs(test_dir, exist_ok=True)

    # Search for actual pothole images - these are known pothole images from various sources
    pothole_urls = [
        # Known pothole images from open sources
        ('https://cdn.pixabay.com/photo/2016/11/29/04/19/road-1867252_640.jpg', 'real_pothole_01.jpg'),
        ('https://cdn.pixabay.com/photo/2019/04/24/11/53/road-4153724_640.jpg', 'real_pothole_02.jpg'),
        ('https://cdn.pixabay.com/photo/2017/02/07/16/47/road-2047747_640.jpg', 'real_pothole_03.jpg'),
        ('https://cdn.pixabay.com/photo/2018/01/26/08/40/road-3107083_640.jpg', 'real_pothole_04.jpg'),
        ('https://cdn.pixabay.com/photo/2020/02/13/17/30/pothole-4848691_640.jpg', 'real_pothole_05.jpg'),
        ('https://cdn.pixabay.com/photo/2015/12/01/20/28/road-1072823_640.jpg', 'real_pothole_06.jpg'),
        ('https://cdn.pixabay.com/photo/2014/09/13/17/12/pothole-444523_640.jpg', 'real_pothole_07.jpg'),
        ('https://cdn.pixabay.com/photo/2013/05/17/09/46/pothole-111475_640.jpg', 'real_pothole_08.jpg'),
        ('https://cdn.pixabay.com/photo/2016/03/27/21/53/street-1283512_640.jpg', 'real_pothole_09.jpg'),
        ('https://cdn.pixabay.com/photo/2017/06/07/10/47/pothole-2380969_640.jpg', 'real_pothole_10.jpg'),
    ]

    print('\nDownloading real pothole images...')
    for url, fname in pothole_urls:
        fpath = os.path.join(test_dir, fname)
        if os.path.exists(fpath) and os.path.getsize(fpath) > 1000:
            continue
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=10).read()
            if len(data) > 1000:
                with open(fpath, 'wb') as f:
                    f.write(data)
                print(f'  Downloaded: {fname} ({len(data)//1024}KB)')
        except Exception as e:
            print(f'  Failed: {fname} - {e}')

    # Also keep old images
    images = sorted([f for f in os.listdir(test_dir) if f.endswith(('.jpg', '.jpeg', '.png'))])
    print(f'\n=== Testing {len(images)} images with CONFIDENCE THRESHOLD: 15% ===\n')

    total_det = 0
    detected_images = 0
    all_det = []
    infer_times = []

    for img_name in images:
        img_path = os.path.join(test_dir, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue
        h_orig, w_orig = img.shape[:2]

        # Use lower confidence threshold
        t0 = time.time()
        results = model(img, verbose=False, conf=0.15)
        infer_ms = (time.time() - t0) * 1000
        infer_times.append(infer_ms)

        r = results[0]
        n_det = len(r.boxes) if r.boxes is not None else 0
        total_det += n_det
        if n_det > 0:
            detected_images += 1

        status = f'{n_det} potholes' if n_det > 0 else 'none'
        print(f'{img_name} ({w_orig}x{h_orig}): {status} ({infer_ms:.0f}ms)')

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

                meas = {'max_depth_cm': 5.0, 'surface_area_cm2': area_cm2, 'volume_cm3': area_cm2 * 5.0}
                severity = sev_cls.classify(meas)

                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 255), 2)
                label = f'{length_cm:.0f}x{width_cm:.0f}cm {severity} {conf*100:.0f}%'
                cv2.putText(annotated, label, (x1, y1-8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 2)

                all_det.append({
                    'img': img_name, 'conf': conf, 'severity': severity,
                    'length': length_cm, 'width': width_cm, 'area': area_cm2
                })

        # Save annotated
        out_path = os.path.join(base, 'verification_output', f'real_{img_name}')
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        cv2.imwrite(out_path, annotated)

    # Print summary
    avg_conf = sum(d['conf'] for d in all_det)/len(all_det)*100 if all_det else 0
    avg_infer = sum(infer_times)/len(infer_times) if infer_times else 0
    sev_counts = {}
    for d in all_det:
        sev_counts[d['severity']] = sev_counts.get(d['severity'], 0) + 1

    print(f'\n{"="*50}')
    print(f'FINAL RESULTS (conf threshold: 15%)')
    print(f'{"="*50}')
    print(f'Images tested:       {len(images)}')
    print(f'Potholes detected in: {detected_images}/{len(images)}')
    print(f'Total detections:     {total_det}')
    print(f'Average confidence:   {avg_conf:.1f}%')
    print(f'Average inference:    {avg_infer:.0f}ms')
    print(f'Severity breakdown:   {sev_counts}')
    print(f'\nAnnotated images saved in: verification_output/')

    # Generate HTML report
    html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    html += '<title>AI Pothole Detection - Real Image Verification</title>'
    html += '<style>*{margin:0;padding:0;box-sizing:border-box}'
    html += 'body{font-family:Segoe UI,Arial,sans-serif;background:#0a0a1a;color:#eee}'
    html += '.hdr{background:linear-gradient(135deg,#0f3460,#16213e);padding:30px;text-align:center;border-bottom:3px solid #00d4ff}'
    html += '.hdr h1{font-size:28px;color:#00d4ff}.hdr p{color:#888;margin-top:8px}'
    html += '.sts{max-width:900px;margin:20px auto;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}'
    html += '.st{background:#16213e;padding:15px 20px;border-radius:12px;text-align:center;min-width:120px}'
    html += '.st .v{font-size:26px;font-weight:bold;color:#00d4ff}.st .l{font-size:11px;color:#888;margin-top:4px}'
    html += '.crd{max-width:950px;margin:15px auto;background:#16213e;border-radius:12px;overflow:hidden}'
    html += '.crd .rw{display:flex}.crd .cl{flex:1;padding:4px}'
    html += '.crd .cl p{text-align:center;color:#aaa;font-size:12px;padding:6px}'
    html += '.crd img{width:100%;display:block}'
    html += '.dt{padding:10px 14px;margin:6px;background:#0f3460;border-radius:8px;border-left:4px solid #00d4ff}'
    html += '.dt.hi{border-left-color:#ff6b35}.dt.md{border-left-color:#ffaa00}.dt.lo{border-left-color:#44ff44}'
    html += '.dt .rw{display:flex;justify-content:space-between;align-items:center}'
    html += '.bg{padding:3px 10px;border-radius:12px;font-weight:bold;font-size:11px;color:#fff}'
    html += '.bg-LOW{background:#27ae60}.bg-MEDIUM{background:#f39c12;color:#000}.bg-HIGH{background:#e67e22}'
    html += '.cf{height:5px;background:#333;border-radius:3px;margin-top:4px}'
    html += '.cf span{display:block;height:100%;border-radius:3px;background:#00d4ff}'
    html += '.nd{padding:12px;text-align:center;color:#666;font-style:italic}'
    html += '</style></head><body>'
    html += '<div class="hdr"><h1>&#x1f573;&#xfe0f; AI Pothole Detection - Real Image Test</h1>'
    html += '<p>Model tested on real photos from the internet (confidence threshold: 15%)</p></div>'

    for img_name in images:
        img_path = os.path.join(test_dir, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue

        det_in_img = [d for d in all_det if d['img'] == img_name]

        _, orig_b64 = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        orig_str = base64.b64encode(orig_b64).decode()

        annot_path = os.path.join(base, 'verification_output', f'real_{img_name}')
        annot_img = cv2.imread(annot_path)
        if annot_img is None:
            annot_img = img
        _, annot_b64 = cv2.imencode('.jpg', annot_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        annot_str = base64.b64encode(annot_b64).decode()

        html += f'<div class="crd"><div class="rw">'
        html += f'<div class="cl"><p>Original: {img_name}</p><img src="data:image/jpeg;base64,{orig_str}"></div>'
        html += f'<div class="cl"><p>AI Detection</p><img src="data:image/jpeg;base64,{annot_str}"></div>'
        html += '</div><div style="padding:8px 14px">'

        if det_in_img:
            for j, d in enumerate(det_in_img):
                dc = {'LOW':'lo','MEDIUM':'md','HIGH':'hi'}.get(d['severity'], 'md')
                html += f'<div class="dt {dc}"><div class="rw">'
                html += f'<span><b>Pothole {j+1}</b> - Conf: {d["conf"]*100:.0f}%</span>'
                html += f'<span class="bg bg-{d["severity"]}">{d["severity"]}</span></div>'
                html += f'<div style="color:#ccc;font-size:12px;margin-top:3px">'
                html += f'Size: {d["length"]:.1f} x {d["width"]:.1f} cm | Area: {d["area"]:.0f} cm&sup2;</div>'
                html += f'<div class="cf"><span style="width:{d["conf"]*100:.0f}%"></span></div></div>'
        else:
            html += '<div class="nd">No potholes detected</div>'
        html += '</div></div>'

    html += '<div class="sts">'
    html += f'<div class="st"><div class="v">{len(images)}</div><div class="l">Images Tested</div></div>'
    html += f'<div class="st"><div class="v">{detected_images}</div><div class="l">Detected</div></div>'
    html += f'<div class="st"><div class="v">{total_det}</div><div class="l">Total Potholes</div></div>'
    html += f'<div class="st"><div class="v">{avg_conf:.0f}%</div><div class="l">Avg Confidence</div></div>'
    html += f'<div class="st"><div class="v">{avg_infer:.0f}ms</div><div class="l">Avg Speed</div></div>'
    html += '</div></body></html>'

    report_path = os.path.join(base, 'verification_output', 'real_image_test.html')
    with open(report_path, 'w') as f:
        f.write(html)
    print(f'\nHTML report: {report_path}')


if __name__ == '__main__':
    main()
