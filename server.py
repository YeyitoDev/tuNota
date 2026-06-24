#!/usr/bin/env python3
# tuNota - servidor estatico + base de datos JSON persistente (solo libreria estandar).
# Uso:  py server.py   (luego abre http://localhost:8765)
import json
import os
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "db.json")
LOCK = threading.Lock()
PORT = int(os.environ.get("PORT", "8765"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # --- helpers ---
    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_db(self):
        if not os.path.exists(DB):
            return {}
        try:
            with open(DB, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _write_db(self, data):
        tmp = DB + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DB)

    # --- routes ---
    def do_GET(self):
        if self.path.split("?")[0] == "/api/data":
            with LOCK:
                data = self._read_db()
            return self._send_json(data)
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] == "/api/data":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b"{}"
                data = json.loads(raw.decode("utf-8"))
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            with LOCK:
                self._write_db(data)
            return self._send_json({"ok": True})
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Mas silencioso: solo errores de API
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s - %s\n" % (self.command, self.path))


class DualStackServer(ThreadingHTTPServer):
    # Escucha IPv6 e IPv4 a la vez para que tanto http://localhost (::1)
    # como http://127.0.0.1 respondan en Windows.
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def main():
    try:
        httpd = DualStackServer(("", PORT), Handler)
    except OSError as e:
        print("No se pudo abrir el puerto %d: %s" % (PORT, e))
        print("Seguramente ya hay otro servidor en ese puerto. Cierralo o usa otro: $env:PORT=9000; py server.py")
        sys.exit(1)
    print("tuNota en http://localhost:%d   (DB persistente: db.json)" % PORT)
    print("Ctrl+C para detener.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
