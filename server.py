#!/usr/bin/env python3
# tuNota - servidor estatico + base de datos JSON persistente (solo libreria estandar).
# Uso:  py server.py   (luego abre http://localhost:8765)
import base64
import gzip
import json
import os
import shlex
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "db.json")
LOCK = threading.Lock()
PORT = int(os.environ.get("PORT", "8765"))

# Flags de curl que no llevan valor y que podemos ignorar sin afectar la peticion.
_CURL_BOOL_IGNORE = {
    "--compressed", "-L", "--location", "-s", "--silent", "-S", "--show-error",
    "-i", "--include", "-v", "--verbose", "-g", "--globoff", "--fail", "-f",
    "-#", "--progress-bar", "--no-buffer", "-N",
}
# Flags que llevan un valor que ignoramos (no aplican en este proxy simple).
_CURL_VALUE_IGNORE = {
    "-o", "--output", "-w", "--write-out", "--connect-timeout", "--max-time",
    "-m", "--retry", "--cacert", "--cert", "--key", "--resolve",
}


def parse_curl(cmd):
    """Interpreta un comando curl y devuelve (method, url, headers, data, insecure, user)."""
    cmd = cmd.replace("\\\n", " ").replace("\\\r\n", " ").strip()
    tokens = shlex.split(cmd, posix=True)
    if tokens and tokens[0] == "curl":
        tokens = tokens[1:]
    method = None
    headers = {}
    data = None
    url = None
    insecure = False
    user = None
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if t in ("-X", "--request") and i + 1 < n:
            i += 1
            method = tokens[i]
        elif t in ("-H", "--header") and i + 1 < n:
            i += 1
            hv = tokens[i]
            if ":" in hv:
                k, v = hv.split(":", 1)
                headers[k.strip()] = v.strip()
        elif t in ("-d", "--data", "--data-raw", "--data-binary", "--data-ascii") and i + 1 < n:
            i += 1
            piece = tokens[i]
            data = piece if data is None else data + "&" + piece
        elif t == "--url" and i + 1 < n:
            i += 1
            url = tokens[i]
        elif t in ("-u", "--user") and i + 1 < n:
            i += 1
            user = tokens[i]
        elif t in ("-A", "--user-agent") and i + 1 < n:
            i += 1
            headers["User-Agent"] = tokens[i]
        elif t in ("-e", "--referer") and i + 1 < n:
            i += 1
            headers["Referer"] = tokens[i]
        elif t in ("-b", "--cookie") and i + 1 < n:
            i += 1
            headers["Cookie"] = tokens[i]
        elif t in ("-k", "--insecure"):
            insecure = True
        elif t in _CURL_BOOL_IGNORE:
            pass
        elif t in _CURL_VALUE_IGNORE:
            i += 1  # saltar su valor
        elif t.startswith("-"):
            pass  # flag desconocido: ignorar por seguridad
        else:
            if url is None:
                url = t
        i += 1
    if not method:
        method = "POST" if data is not None else "GET"
    return method.upper(), url, headers, data, insecure, user


def run_curl(cmd):
    """Ejecuta el comando curl interpretado y devuelve un dict serializable."""
    try:
        method, url, headers, data, insecure, user = parse_curl(cmd)
    except Exception as e:
        return {"ok": False, "error": "No se pudo interpretar el comando: %s" % e}
    if not url:
        return {"ok": False, "error": "No se encontro una URL en el comando."}
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "http://" + url

    body_bytes = data.encode("utf-8") if data is not None else None
    if body_bytes is not None and not any(k.lower() == "content-type" for k in headers):
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if user and not any(k.lower() == "authorization" for k in headers):
        headers["Authorization"] = "Basic " + base64.b64encode(user.encode("utf-8")).decode("ascii")

    req = urllib.request.Request(url, data=body_bytes, method=method, headers=headers)
    ctx = None
    if url.startswith("https://"):
        ctx = ssl.create_default_context()
        if insecure:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        raw = resp.read()
        status = resp.status
        reason = resp.reason
        resp_headers = dict(resp.getheaders())
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
        reason = e.reason
        try:
            resp_headers = dict(e.headers.items())
        except Exception:
            resp_headers = {}
    except Exception as e:
        return {"ok": False, "error": "%s" % e, "url": url, "method": method}
    ms = int((time.time() - t0) * 1000)

    enc = ""
    ctype = ""
    for k, v in resp_headers.items():
        kl = k.lower()
        if kl == "content-encoding":
            enc = (v or "").lower()
        elif kl == "content-type":
            ctype = v or ""
    if "gzip" in enc:
        try:
            raw = gzip.decompress(raw)
        except Exception:
            pass
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("latin-1", "replace")

    return {
        "ok": True,
        "status": status,
        "reason": reason,
        "headers": resp_headers,
        "body": text,
        "contentType": ctype,
        "timeMs": ms,
        "url": url,
        "method": method,
    }


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
        route = self.path.split("?")[0]
        if route == "/api/data":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b"{}"
                data = json.loads(raw.decode("utf-8"))
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            with LOCK:
                self._write_db(data)
            return self._send_json({"ok": True})
        if route == "/api/curl":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b"{}"
                payload = json.loads(raw.decode("utf-8"))
                cmd = (payload.get("command") or "").strip()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            if not cmd:
                return self._send_json({"ok": False, "error": "Comando cURL vacio."})
            return self._send_json(run_curl(cmd))
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
