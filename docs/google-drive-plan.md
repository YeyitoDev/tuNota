# Planeamiento: Sincronización con Google Drive

Objetivo: guardar y sincronizar los datos de tuNota (`db.json` + imágenes/adjuntos) en Google Drive para tener las notas disponibles en todos los dispositivos, con resolución de conflictos y modo offline.

---

## 1. Alcance y estrategia

tuNota hoy persiste en:
- `localStorage` (claves `tunota.data.v1`, `tunota.ui.v1`) en el navegador.
- Opcionalmente `db.json` vía `server.py` (endpoints `/api/data`).

Estrategia recomendada: **Drive como capa de sincronización remota**, no como base de datos en vivo. El origen de verdad local sigue siendo `localStorage`/`db.json`; Drive se usa para hacer *push/pull* del snapshot completo (`db.json`) y de los blobs grandes (imágenes, PDFs).

Dos posibles arquitecturas:

### Opción A — Cliente puro (navegador, sin servidor)
- Usa **Google Identity Services (GIS)** + **Google Drive REST API** directamente desde `app.js`.
- Guarda el token OAuth en memoria (no en localStorage por seguridad).
- Ideal para el modo "sin servidor" (abrir `index.html` directo).
- Limitación: requiere popup de login y refrescar token; CORS lo permite en `googleapis.com`.

### Opción B — A través de `server.py` (recomendada para escritorio)
- El servidor Python guarda el `refresh_token` de forma segura en disco.
- Endpoints nuevos: `/api/drive/status`, `/api/drive/push`, `/api/drive/pull`, `/api/drive/auth`.
- El navegador solo llama a esos endpoints; el servidor habla con Drive.
- Ventaja: token persistente, sincronización en segundo plano, sin popups constantes.

> Recomendación: implementar **Opción B** como principal y dejar la A como fallback para uso 100% en navegador.

---

## 2. Configuración en Google Cloud

1. Crear proyecto en <https://console.cloud.google.com>.
2. Habilitar **Google Drive API**.
3. Crear **credenciales OAuth 2.0** (tipo *Desktop app* para Opción B, *Web app* para Opción A).
4. Configurar la **pantalla de consentimiento** (scopes mínimos).
5. Scope recomendado (mínimo privilegio): `https://www.googleapis.com/auth/drive.file`
   - Solo da acceso a los archivos creados por la propia app (no a todo el Drive del usuario).
6. Guardar `client_id` (y `client_secret` en el servidor para Opción B).

---

## 3. Modelo de datos en Drive

- Crear una carpeta dedicada: **`tuNota/`** (guardar su `fileId`).
- Dentro:
  - `db.json` — snapshot principal (mismo formato que el actual).
  - `meta.json` — `{ version, updatedAt, deviceId, checksum }` para conflictos.
  - `assets/` — imágenes/PDF por hash (deduplicados).
- Guardar el `fileId` de `db.json` localmente para actualizarlo (update en vez de crear).

---

## 4. Flujo de sincronización

### Push (subir cambios locales)
1. Serializar `data` actual → JSON.
2. Calcular `checksum` (p. ej. hash simple del contenido).
3. Si `meta.remoteUpdatedAt <= meta.localBaseUpdatedAt` → subir directo (update de `db.json` + `meta.json`).
4. Actualizar `meta.localBaseUpdatedAt`.

### Pull (bajar cambios remotos)
1. Leer `meta.json` remoto.
2. Si `remoteUpdatedAt > localBaseUpdatedAt` → descargar `db.json`, fusionar, aplicar.

### Resolución de conflictos
- **Nivel documento** (simple, primera versión): "el más reciente gana" usando `updatedAt`, con copia de seguridad del perdedor en `db.conflict-<fecha>.json`.
- **Nivel bloque** (mejor, siguiente iteración): fusionar por `block.id` comparando `updatedAt` de cada bloque; los borrados se marcan con *tombstones* (`deletedAt`) en lugar de eliminar.

> Para habilitar merge por bloque conviene añadir `deletedAt` a bloques/notas y no borrarlos físicamente hasta compactar.

---

## 5. Cambios necesarios en el código

### Frontend (`app.js`)
- Nuevo módulo `drive` con: `driveConnect()`, `drivePush()`, `drivePull()`, `driveStatus()`.
- UI: botón en el topbar (icono nube) → panel de estado ("Conectado como…", "Última sync", botones Sincronizar/Desconectar).
- Añadir a `ui` un objeto `ui.drive = { connected, email, lastSync, fileId, autoSync }`.
- Enganchar auto-sync: tras `save()` con *debounce* de ~5 s, llamar `drivePush()` (si `autoSync`).
- Al `boot()`, si `connected` → `drivePull()` antes de `renderAll()`.

### Backend (`server.py`) — Opción B
- Dependencia: `google-auth`, `google-auth-oauthlib`, `google-api-python-client` (o llamadas REST con `urllib`).
- Guardar `token.json` (refresh token) en disco con permisos restringidos.
- Endpoints:
  - `GET /api/drive/status` → `{ connected, email, lastSync }`
  - `POST /api/drive/auth` → inicia flujo OAuth (device/loopback).
  - `POST /api/drive/push` → sube `db.json` actual.
  - `POST /api/drive/pull` → devuelve `db.json` remoto (o lo fusiona).

---

## 6. Seguridad
- Nunca guardar `client_secret` en el frontend.
- Token OAuth solo en memoria (Opción A) o en disco del servidor con permisos (Opción B).
- Usar scope `drive.file` (mínimo privilegio).
- Cifrado opcional del `db.json` antes de subir (clave del usuario).

---

## 7. Plan por fases (implementación incremental)

1. **F1 — Base**: refactor de persistencia para exponer `exportData()`/`importData(json)` limpios.
2. **F2 — Auth**: conectar cuenta (Opción B) + guardar `fileId` de carpeta/`db.json`.
3. **F3 — Push/Pull manual**: botón "Sincronizar ahora" con estrategia "más reciente gana".
4. **F4 — Auto-sync**: debounce tras cambios + pull al iniciar.
5. **F5 — Assets**: subir imágenes/PDF a `assets/` por hash.
6. **F6 — Merge por bloque**: tombstones + fusión granular.
7. **F7 — Multi-dispositivo/offline**: cola de cambios pendientes y reintentos.

---

## 8. Alternativas a considerar
- **Dropbox / OneDrive**: APIs similares; misma arquitectura.
- **WebDAV / Nextcloud**: para autohospedaje.
- **Git backend**: versionado real (cada save = commit), buena para historial pero más pesado.
- **Supabase/Firebase**: sincronización en tiempo real si se quiere colaboración multiusuario (cambio mayor de arquitectura).
