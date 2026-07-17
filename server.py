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
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "db.json")
LOCK = threading.Lock()
PORT = int(os.environ.get("PORT", "8765"))


# ---------- Configuracion desde .env (sin dependencias externas) ----------
def load_dotenv(path):
    """Carga un .env sencillo en os.environ. Acepta 'CLAVE=valor' y 'CLAVE:valor'.
    Las variables ya presentes en el entorno tienen prioridad (no se sobrescriben)."""
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                idxs = [i for i in (line.find("="), line.find(":")) if i != -1]
                if not idxs:
                    continue
                sep = min(idxs)
                key = line[:sep].strip().upper().replace("-", "_")
                val = line[sep + 1:].strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception as e:
        sys.stderr.write("aviso: no se pudo leer .env: %s\n" % e)


load_dotenv(os.path.join(ROOT, ".env"))


def _envfirst(*names, **kw):
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return kw.get("default", "")


# Proveedor de IA del servidor: OpenCode Zen (API compatible con OpenAI, multi-modelo).
OPENCODE_KEY = _envfirst("OPENCODE_API", "OPENCODE_API_KEY", "OPENCODE_KEY")
# Endpoint "go" (zen/go/v1): el tier del usuario, con modelos abiertos y sin el saldo de zen/v1.
OPENCODE_BASE = _envfirst("OPENCODE_BASE_URL", default="https://opencode.ai/zen/go/v1").rstrip("/")
OPENCODE_MODEL = _envfirst("OPENCODE_MODEL", "AI_MODEL", default="qwen3.7-plus")
# Busqueda en internet: Tavily.
TAVILY_KEY = _envfirst("TAVILY", "TAVILY_API_KEY", "TAVILY_KEY")
TAVILY_BASE = _envfirst("TAVILY_BASE_URL", default="https://api.tavily.com").rstrip("/")
# Token Bearer para proteger los endpoints /api/*. Si esta vacio, no se exige (modo local).
AUTH_TOKEN = _envfirst("TUNOTA_TOKEN", "TUNOTA_BEARER", "API_TOKEN")
# Telegram (opcional): bot para enviar notas a un chat/grupo. TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
TELEGRAM_TOKEN = _envfirst("TELEGRAM_BOT_TOKEN", "TELEGRAM_TOKEN")
TELEGRAM_CHAT = _envfirst("TELEGRAM_CHAT_ID", "TELEGRAM_CHAT")
# Generacion de imagenes (opcional): endpoint compatible con OpenAI /images/generations.
# Solo se activa si hay una clave explicita (OpenCode Zen es solo texto).
IMAGE_KEY = _envfirst("IMAGE_API_KEY", "OPENAI_API_KEY")
IMAGE_BASE = _envfirst("IMAGE_BASE_URL", "OPENAI_BASE_URL", default="https://api.openai.com/v1").rstrip("/")
IMAGE_MODEL = _envfirst("IMAGE_MODEL", default="gpt-image-1")
# Modo publico: para publicar la herramienta a mucha gente sin que se pisen los datos.
# Con TUNOTA_PUBLIC=1, /api/data NO comparte ni guarda nada (cada navegador queda 100% local
# en su localStorage/IndexedDB); el servidor solo sirve estaticos + proxies (IA/CalDAV).
PUBLIC_MODE = bool(_envfirst("TUNOTA_PUBLIC", "PUBLIC_MODE", "TUNOTA_PUBLIC_MODE"))
# IA del servidor desactivada: con TUNOTA_DISABLE_AI=1 NUNCA se usan las claves del dueno
# (OpenCode/Tavily/imagenes). Los usuarios pueden seguir usando SU PROPIA clave (BYOK, override).
# Pensado para el despliegue de produccion sin gastar el limite de uso del dueno.
AI_DISABLED = bool(_envfirst("TUNOTA_DISABLE_AI", "TUNOTA_NO_SERVER_AI", "DISABLE_SERVER_AI"))
# Sincronizacion con Apple (CalDAV de iCloud): Apple ID + contrasena especifica de app.
# Las credenciales pueden venir del .env o del cliente (panel de Sincronizacion).
APPLE_ID = _envfirst("APPLE_ID", "ICLOUD_ID", "APPLE_EMAIL")
APPLE_APP_PASSWORD = _envfirst("APPLE_APP_PASSWORD", "ICLOUD_APP_PASSWORD", "APPLE_PASSWORD")
CALDAV_ROOT = _envfirst("APPLE_CALDAV_URL", default="https://caldav.icloud.com").rstrip("/")
# User-Agent para las llamadas salientes (algunos CDN rechazan el de urllib).
UPSTREAM_UA = "tuNota/1.0 (+https://tunota.fly.dev)"

# Lista de modelos por defecto si no se puede consultar /models en vivo.
_MODELS_FALLBACK = [
    "qwen3.7-plus", "qwen3.7-max", "deepseek-v4-pro", "deepseek-v4-flash",
    "glm-5.2", "glm-5", "kimi-k2.6", "minimax-m3", "mimo-v2.5",
]
# Modelos que devuelven 400/500 (rotos): no ofrecerlos en el selector.
_MODELS_BLOCK = {"hy3-preview", "mimo-v2-omni", "mimo-v2-pro"}
_models_cache = {"ids": None}


def opencode_models():
    """Modelos disponibles en OpenCode Zen (consulta viva, cacheada; con fallback)."""
    if _models_cache["ids"] is not None:
        return _models_cache["ids"]
    ids = []
    if OPENCODE_KEY:
        try:
            req = urllib.request.Request(
                OPENCODE_BASE + "/models",
                headers={"Authorization": "Bearer " + OPENCODE_KEY, "User-Agent": UPSTREAM_UA},
            )
            with urllib.request.urlopen(req, timeout=8, context=ssl.create_default_context()) as r:
                d = json.loads(r.read().decode("utf-8"))
                arr = d.get("data", d) if isinstance(d, dict) else d
                ids = [(m.get("id") if isinstance(m, dict) else m) for m in (arr or [])]
                ids = [x for x in ids if x and x not in _MODELS_BLOCK]
        except Exception:
            ids = []
    _models_cache["ids"] = ids or list(_MODELS_FALLBACK)
    return _models_cache["ids"]


def post_json_upstream(url, headers, payload, timeout=60):
    """POST JSON a un servicio externo; devuelve (status, bytes_crudos)."""
    body = json.dumps(payload).encode("utf-8")
    # Cloudflare (delante de OpenCode Zen) bloquea el User-Agent por defecto de
    # urllib con 403; enviamos uno propio.
    hdrs = {"Content-Type": "application/json", "User-Agent": UPSTREAM_UA}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=body, method="POST", headers=hdrs)
    ctx = ssl.create_default_context() if url.startswith("https://") else None
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 502, json.dumps({"error": {"message": str(e)}}).encode("utf-8")


def private_host(url):
    """True si la URL apunta a un host local/privado (defensa SSRF para los proxies)."""
    try:
        host = (urllib.parse.urlsplit(url).hostname or "").lower()
    except Exception:
        return True
    if not host or host in ("localhost",) or host.endswith((".local", ".internal", ".localhost")):
        return True
    try:
        import ipaddress
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except ValueError:
        return False  # nombre de dominio público


# ---------- CalDAV: sincronizacion con Calendario y Recordatorios de iCloud ----------
def _ln(tag):
    """Nombre local de una etiqueta XML (sin el namespace)."""
    return tag.split("}", 1)[1] if "}" in tag else tag


def _abs_url(base, href):
    if href.startswith("http://") or href.startswith("https://"):
        return href
    parts = urllib.parse.urlsplit(base)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, href, "", ""))


def caldav_request(method, url, user, password, body=None, depth=None,
                   ctype="application/xml; charset=utf-8", timeout=30, _hops=0):
    """Peticion CalDAV con Basic auth; sigue redirecciones manualmente (urllib no lo hace
    para metodos como PROPFIND/PUT). Devuelve (status, bytes, url_final)."""
    data = body.encode("utf-8") if isinstance(body, str) else body
    tok = base64.b64encode((user + ":" + password).encode("utf-8")).decode("ascii")
    hdrs = {"User-Agent": UPSTREAM_UA, "Authorization": "Basic " + tok}
    if data is not None:
        hdrs["Content-Type"] = ctype
    if depth is not None:
        hdrs["Depth"] = str(depth)
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read(), resp.geturl()
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 307, 308) and _hops < 5:
            loc = e.headers.get("Location")
            if loc:
                return caldav_request(method, _abs_url(url, loc), user, password, body, depth, ctype, timeout, _hops + 1)
        return e.code, e.read(), url
    except Exception as e:
        return 0, str(e).encode("utf-8"), url


_PROP_PRINCIPAL = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>'
_PROP_HOME = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>'
_PROP_CALS = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>'


def _find_href_by_localname(xml_bytes, prop_localname):
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return None
    for el in root.iter():
        if _ln(el.tag) == prop_localname:
            for h in el.iter():
                if _ln(h.tag) == "href" and (h.text or "").strip():
                    return h.text.strip()
    return None


def _parse_collections(xml_bytes):
    """Lista [(href, displayname, {componentes})] de un PROPFIND Depth:1 sobre el home."""
    out = []
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return out
    for resp in root.iter():
        if _ln(resp.tag) != "response":
            continue
        href = None
        name = ""
        comps = set()
        for el in resp.iter():
            ln = _ln(el.tag)
            if ln == "href" and href is None:
                href = (el.text or "").strip()
            elif ln == "displayname" and (el.text or "").strip():
                name = el.text.strip()
            elif ln == "comp":
                c = el.get("name")
                if c:
                    comps.add(c.upper())
        if href:
            out.append((href, name, comps))
    return out


def _ics_dt(ms):
    import datetime
    return datetime.datetime.utcfromtimestamp(int(ms) / 1000.0).strftime("%Y%m%dT%H%M%SZ")


def _ics_esc(s):
    return str(s).replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def build_ics(item, uid):
    now_dt = _ics_dt(int(time.time() * 1000))
    title = _ics_esc(item.get("title") or "Recordatorio")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tuNota//iOS//ES", "CALSCALE:GREGORIAN"]
    if item.get("kind") == "todo":
        lines += ["BEGIN:VTODO", "UID:" + uid + "@tunota", "DTSTAMP:" + now_dt, "SUMMARY:" + title, "STATUS:NEEDS-ACTION"]
        if item.get("at"):
            lines.append("DUE:" + _ics_dt(item["at"]))
        lines.append("END:VTODO")
    else:
        at = int(item.get("at") or int(time.time() * 1000))
        lines += ["BEGIN:VEVENT", "UID:" + uid + "@tunota", "DTSTAMP:" + now_dt,
                  "DTSTART:" + _ics_dt(at), "DTEND:" + _ics_dt(at + 30 * 60000),
                  "SUMMARY:" + title, "DESCRIPTION:Recordatorio de tuNota",
                  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + title, "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def apple_caldav_sync(user, password, items, prefer_cal="", prefer_rem=""):
    """Descubre el Calendario/Recordatorios de iCloud y sube cada item (VEVENT/VTODO)."""
    root_url = CALDAV_ROOT + "/"
    st, body, _ = caldav_request("PROPFIND", root_url, user, password, _PROP_PRINCIPAL, depth=0)
    if st in (401, 403):
        return {"ok": False, "error": "Apple rechazo las credenciales (revisa el Apple ID y la contrasena de app)."}
    if st not in (200, 207):
        return {"ok": False, "error": "No se pudo contactar con iCloud CalDAV (HTTP %s)." % st}
    principal = _find_href_by_localname(body, "current-user-principal")
    if not principal:
        return {"ok": False, "error": "iCloud no devolvio el principal del usuario."}
    st, body, _ = caldav_request("PROPFIND", _abs_url(root_url, principal), user, password, _PROP_HOME, depth=0)
    home = _find_href_by_localname(body, "calendar-home-set")
    if not home:
        return {"ok": False, "error": "iCloud no devolvio el calendar-home-set."}
    home_url = _abs_url(_abs_url(root_url, principal), home)
    st, body, _ = caldav_request("PROPFIND", home_url, user, password, _PROP_CALS, depth=1)
    cols = _parse_collections(body)

    def pick(comp, prefer):
        cands = [c for c in cols if comp in c[2]]
        if prefer:
            for c in cands:
                if prefer.lower() in (c[1] or "").lower():
                    return c
        return cands[0] if cands else None

    ev_col = pick("VEVENT", prefer_cal)
    td_col = pick("VTODO", prefer_rem)
    results = []
    ok_count = 0
    for i, it in enumerate(items):
        comp = "VTODO" if it.get("kind") == "todo" else "VEVENT"
        col = td_col if comp == "VTODO" else ev_col
        if not col:
            results.append({"title": it.get("title"), "ok": False, "error": "Sin lista/calendario compatible (%s)." % comp})
            continue
        uid = it.get("uid") or ("tunota-" + str(i))
        put_url = _abs_url(home_url, col[0]).rstrip("/") + "/" + urllib.parse.quote(uid) + ".ics"
        pst, _pb, _ = caldav_request("PUT", put_url, user, password, build_ics(it, uid), ctype="text/calendar; charset=utf-8")
        good = pst in (200, 201, 204)
        ok_count += 1 if good else 0
        results.append({"title": it.get("title"), "ok": good, "status": pst, "kind": comp, "list": col[1] or col[0]})
    return {"ok": ok_count > 0 or not items, "synced": ok_count, "total": len(items),
            "calendar": (ev_col[1] if ev_col else None), "reminders": (td_col[1] if td_col else None),
            "results": results}


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

    def _send_raw(self, code, raw):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self):
        """True si no hay token configurado (modo local) o el Bearer coincide."""
        if not AUTH_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip() == AUTH_TOKEN
        return False

    def _is_local(self):
        """True si el cliente es loopback (mismo equipo). En Fly el proxy no es loopback."""
        host = self.client_address[0] if self.client_address else ""
        return host in ("127.0.0.1", "::1", "::ffff:127.0.0.1") or host.startswith("127.")

    def _guard(self):
        if not self._authorized():
            self._send_json({"ok": False, "error": "No autorizado (token Bearer requerido)."}, 401)
            return False
        return True

    def _read_body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

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

    # Archivos que nunca deben servirse por HTTP (datos, claves, código del servidor).
    _BLOCKED_EXACT = ("/db.json", "/server.py", "/fly.toml", "/Dockerfile", "/package.json", "/package-lock.json")
    _BLOCKED_PREFIX = ("/.", "/__pycache__", "/node_modules", "/tests", "/src", "/dist")

    def _blocked_path(self, route):
        low = route.rstrip("/")
        if low in self._BLOCKED_EXACT:
            return True
        return any(route.startswith(p) for p in self._BLOCKED_PREFIX)

    def do_HEAD(self):
        if self._blocked_path(self.path.split("?")[0]):
            self.send_response(404)
            self.end_headers()
            return
        super().do_HEAD()

    # --- routes ---
    def do_GET(self):
        route = self.path.split("?")[0]
        if self._blocked_path(route):
            self.send_response(404)
            self.end_headers()
            return
        if route == "/api/config":
            # Descubrimiento de capacidades del backend. NO expone las claves,
            # solo si estan disponibles y (para IA) la lista de modelos.
            cfg = {
                "aiAvailable": bool(OPENCODE_KEY) and not AI_DISABLED,
                "searchAvailable": bool(TAVILY_KEY) and not AI_DISABLED,
                "imageAvailable": bool(IMAGE_KEY) and not AI_DISABLED,
                "aiDisabled": AI_DISABLED,  # true => solo IA con clave propia del usuario (BYOK)
                "telegramAvailable": bool(TELEGRAM_TOKEN and TELEGRAM_CHAT),
                "appleAvailable": bool(APPLE_ID and APPLE_APP_PASSWORD),
                "publicMode": PUBLIC_MODE,
                "tokenRequired": bool(AUTH_TOKEN),
                "provider": "opencode",
                "defaultModel": OPENCODE_MODEL,
                "models": opencode_models() if OPENCODE_KEY else [],
            }
            # Comodidad en local: si el token se exige y la petición es del mismo
            # equipo (loopback), se entrega para que el navegador no tenga que
            # pedirlo. NUNCA se entrega a clientes remotos (p. ej. en Fly.io).
            if AUTH_TOKEN and self._is_local():
                cfg["token"] = AUTH_TOKEN
            return self._send_json(cfg)
        if route == "/api/data":
            if PUBLIC_MODE:
                # Sin base de datos compartida y sin exigir token: cada navegador es local.
                return self._send_json({})
            if not self._guard():
                return
            with LOCK:
                data = self._read_db()
            return self._send_json(data)
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        if route == "/api/data":
            if PUBLIC_MODE:
                return self._send_json({"ok": True, "public": True})  # no se guarda: evita que los usuarios se pisen
            if not self._guard():
                return
            try:
                data = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            with LOCK:
                self._write_db(data)
            return self._send_json({"ok": True})
        if route == "/api/curl":
            # Solo en local: en un despliegue público sería un proxy abierto (SSRF)
            # que permitiría lanzar peticiones arbitrarias desde nuestra IP.
            if not self._is_local():
                return self._send_json({"ok": False, "error": "El ejecutor cURL solo está disponible ejecutando tuNota en tu propio equipo."}, 403)
            if not self._guard():
                return
            try:
                payload = self._read_body_json()
                cmd = (payload.get("command") or "").strip()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            if not cmd:
                return self._send_json({"ok": False, "error": "Comando cURL vacio."})
            return self._send_json(run_curl(cmd))
        if route == "/api/ai":
            try:
                payload = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            ov = payload.get("override") or {}
            byok = bool((ov.get("key") or "").strip() and (ov.get("baseUrl") or "").strip())
            # Con clave propia del usuario (BYOK) no se exige el token del servidor:
            # no gasta nuestras claves y permite abrir la app al público.
            if not byok and not self._guard():
                return
            body = {
                "model": (payload.get("model") or OPENCODE_MODEL),
                "messages": payload.get("messages") or [],
            }
            if payload.get("temperature") is not None:
                body["temperature"] = payload["temperature"]
            if payload.get("max_tokens") is not None:
                body["max_tokens"] = payload["max_tokens"]
            if payload.get("reasoning_effort"):
                body["reasoning_effort"] = payload["reasoning_effort"]
            # "Trae tu propia clave": si el cliente envía override, proxy al proveedor
            # OpenAI-compatible que elija (evita el CORS de OpenAI/OpenCode y añade UA).
            ov = payload.get("override") or {}
            ov_key = (ov.get("key") or "").strip()
            ov_base = (ov.get("baseUrl") or "").strip().rstrip("/")
            if ov_key and ov_base:
                if not ov_base.startswith("https://") or private_host(ov_base):
                    return self._send_json({"ok": False, "error": {"message": "La URL base del proveedor debe ser https y un dominio público."}}, 400)
                headers = {"Authorization": "Bearer " + ov_key}
                for hk, hv in (ov.get("headers") or {}).items():
                    headers[str(hk)] = str(hv)
                status, raw = post_json_upstream(ov_base + "/chat/completions", headers, body)
                return self._send_raw(status, raw)
            # Sin clave propia: si la IA del servidor está desactivada, NO se usan las
            # claves del dueño (el usuario debe traer su propia clave).
            if AI_DISABLED:
                return self._send_json({"ok": False, "error": {"message": "La IA del servidor está desactivada. Configura tu propia clave de API en el panel de IA."}}, 403)
            if not OPENCODE_KEY:
                return self._send_json({"ok": False, "error": {"message": "El servidor no tiene OPENCODE-API en .env."}}, 400)
            status, raw = post_json_upstream(
                OPENCODE_BASE + "/chat/completions",
                {"Authorization": "Bearer " + OPENCODE_KEY}, body,
            )
            return self._send_raw(status, raw)
        if route == "/api/search":
            if AI_DISABLED:
                return self._send_json({"ok": False, "error": "La búsqueda web del servidor está desactivada en este despliegue."}, 403)
            if not self._guard():
                return
            if not TAVILY_KEY:
                return self._send_json({"ok": False, "error": "El servidor no tiene TAVILY en .env."}, 400)
            try:
                payload = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            q = (payload.get("query") or "").strip()
            if not q:
                return self._send_json({"ok": False, "error": "Consulta de busqueda vacia."}, 400)
            body = {
                "query": q,
                "max_results": payload.get("max_results", 5),
                "search_depth": payload.get("search_depth", "basic"),
                "include_answer": payload.get("include_answer", True),
            }
            for k in ("topic", "time_range", "days", "include_domains", "exclude_domains", "include_raw_content"):
                if k in payload:
                    body[k] = payload[k]
            status, raw = post_json_upstream(
                TAVILY_BASE + "/search",
                {"Authorization": "Bearer " + TAVILY_KEY}, body,
            )
            return self._send_raw(status, raw)
        if route == "/api/telegram":
            if not self._guard():
                return
            if not (TELEGRAM_TOKEN and TELEGRAM_CHAT):
                return self._send_json({"ok": False, "error": "Telegram no configurado (.env TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)."}, 400)
            try:
                payload = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            text = (payload.get("text") or "").strip()
            if not text:
                return self._send_json({"ok": False, "error": "Texto vacío."}, 400)
            status, raw = post_json_upstream(
                "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage",
                {}, {"chat_id": TELEGRAM_CHAT, "text": text[:4000]},
            )
            return self._send_raw(status, raw)
        if route == "/api/apple/sync":
            if not self._guard():
                return
            try:
                payload = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            user = (payload.get("appleId") or APPLE_ID or "").strip()
            pw = (payload.get("appPassword") or APPLE_APP_PASSWORD or "").strip()
            if not user or not pw:
                return self._send_json({"ok": False, "error": "Falta el Apple ID o la contrasena especifica de app."}, 400)
            items = payload.get("items") or []
            res = apple_caldav_sync(user, pw, items, payload.get("calendar") or "", payload.get("reminders") or "")
            return self._send_json(res, 200 if res.get("ok") else 502)
        if route == "/api/image":
            if AI_DISABLED:
                return self._send_json({"ok": False, "error": "La generación de imágenes del servidor está desactivada en este despliegue."}, 403)
            if not self._guard():
                return
            if not IMAGE_KEY:
                return self._send_json({"ok": False, "error": "El servidor no tiene generación de imágenes (.env IMAGE_API_KEY)."}, 400)
            try:
                payload = self._read_body_json()
            except Exception:
                return self._send_json({"ok": False, "error": "invalid json"}, 400)
            prompt = (payload.get("prompt") or "").strip()
            if not prompt:
                return self._send_json({"ok": False, "error": "Prompt de imagen vacío."}, 400)
            body = {
                "model": payload.get("model") or IMAGE_MODEL,
                "prompt": prompt,
                "n": 1,
                "size": payload.get("size", "1024x1024"),
                "response_format": "b64_json",
            }
            status, raw = post_json_upstream(
                IMAGE_BASE + "/images/generations",
                {"Authorization": "Bearer " + IMAGE_KEY}, body, timeout=120,
            )
            return self._send_raw(status, raw)
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
    print("  IA (OpenCode):   %s" % ("activa, modelo por defecto " + OPENCODE_MODEL if OPENCODE_KEY else "no configurada (.env OPENCODE-API)"))
    print("  Busqueda (Tavily): %s" % ("activa" if TAVILY_KEY else "no configurada (.env TAVILY)"))
    print("  Imagenes:        %s" % ("activas, modelo " + IMAGE_MODEL if IMAGE_KEY else "solo busqueda (sin .env IMAGE_API_KEY)"))
    print("  Token Bearer:    %s" % ("exigido en /api/* (autoentregado en local)" if AUTH_TOKEN else "no exigido (modo local)"))
    print("Ctrl+C para detener.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
