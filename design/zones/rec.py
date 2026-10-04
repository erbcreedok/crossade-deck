#!/usr/bin/env python3
"""Приёмник записи сессии со стенда: страница шлёт пачки строк JSON, они ложатся в rec/<сессия>.jsonl.
    python3 design/zones/rec.py [порт]   (по умолчанию 9589)"""
import os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rec")
os.makedirs(HERE, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        sid = "".join(c for c in parse_qs(urlparse(self.path).query).get("sid", ["x"])[0] if c.isalnum() or c in "-_")[:40] or "x"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace")
        with open(os.path.join(HERE, sid + ".jsonl"), "a") as f:
            for line in body.splitlines():
                if line.strip(): f.write(line + "\n")
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(sys.argv[1]) if len(sys.argv) > 1 else 9589), H).serve_forever()
