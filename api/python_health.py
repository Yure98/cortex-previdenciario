"""Smoke test do runtime Python da Vercel.

O diagnostico CNIS e o motor DOCX entram apenas nas Fases 2 e 3.
"""

import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - interface exigida pelo runtime
        payload = json.dumps({"service": "cortex-python", "status": "ok"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
