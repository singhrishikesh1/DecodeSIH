import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse
from defect_detector import DefectDetector

detector = DefectDetector()

class AIServiceHandler(BaseHTTPRequestHandler):
    
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "Drone AI Engine", "model": "YOLOv8 + Open3D"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path.startswith("/api/ai/analyze"):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            parsed_url = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed_url.query)
            asset_type = params.get("asset_type", ["road"])[0]

            try:
                # Handle JSON payload or raw image bytes
                if self.headers.get("Content-Type", "").startswith("application/json"):
                    body = json.loads(post_data.decode("utf-8"))
                    asset_type = body.get("asset_type", asset_type)
                    analysis = detector.analyze_frame(asset_type=asset_type)
                else:
                    analysis = detector.analyze_frame(image_bytes=post_data, asset_type=asset_type)

                response_bytes = json.dumps({"success": True, "data": analysis}).encode("utf-8")

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(response_bytes)

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def run(server_class=HTTPServer, handler_class=AIServiceHandler, port=5001):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"[Drone AI Engine]: Python Microservice listening on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == "__main__":
    run()
