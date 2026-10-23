#!/usr/bin/env python3
"""
Custom development HTTP server with clean extensionless URL routing.
Automatically maps:
  /public     -> /public.html
  /login      -> /login.html
  /driver     -> /driver.html
  /operations -> /operations.html
"""
import os
import sys
import http.server
import socketserver
from pathlib import Path

PORT = 3000
BASE_DIR = Path(__file__).resolve().parent

class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _resolve_clean_path(self):
        clean_path = self.path.split("?")[0].split("#")[0]
        query = ("?" + self.path.split("?")[1]) if "?" in self.path else ""

        rel_path = clean_path.strip("/")
        if rel_path:
            candidate = BASE_DIR / (rel_path + ".html")
            if candidate.is_file():
                self.path = "/" + rel_path + ".html" + query

    def do_GET(self):
        self._resolve_clean_path()
        return super().do_GET()

    def do_HEAD(self):
        self._resolve_clean_path()
        return super().do_HEAD()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CleanURLHandler) as httpd:
        print(f"Serving {BASE_DIR} on http://127.0.0.1:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    main()
