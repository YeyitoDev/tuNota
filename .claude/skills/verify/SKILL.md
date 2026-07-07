---
name: verify
description: How to build, launch and drive tuNota (vanilla JS canvas app) to verify changes end-to-end.
---

# Verificar tuNota

La app real es `index.html` + `js/*.js` (12 módulos numerados cargados en orden, ámbito
global compartido, sin build) + `note.js` + `styles.css`. `src/` es un scaffold abandonado —
ignorarlo. `server.py` sirve estáticos + `/api/data` + `/api/curl`.
Regla de los módulos: el código de nivel superior NO debe tocar `data`/`ui` (se inicializan
en `initState()` desde `boot()` en `12-boot.js`); las funciones sí pueden referenciarse
entre ficheros porque todas son globales.

## Lanzar (aislado — NUNCA contra el repo)

`server.py` escribe `db.json` junto a sí mismo. Copia la app a un sandbox para no
pisar los datos reales del usuario:

```bash
SB=<scratchpad>/sandbox
mkdir -p $SB/public $SB/js
cp index.html note.js note.html styles.css server.py $SB/ && cp js/*.js $SB/js/ && cp public/* $SB/public/
cd $SB && PORT=8899 python3 server.py   # en background
```

## Conducir (Playwright)

No hay playwright en node_modules; instala `playwright-core` en el scratchpad y usa
el Chromium cacheado:

```
executablePath: ~/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

Gotchas aprendidos:
- `waitUntil: 'networkidle'` NUNCA se cumple (CDNs de fonts/mermaid cuelgan). Usa `'domcontentloaded'` + waitForSelector.
- Cada `browser.newContext()` tiene localStorage/IndexedDB VACÍOS. Con perfil nuevo,
  la app se auto-siembra y su `savedAt` (más reciente) SOBRESCRIBE el db.json del
  servidor. Haz todos los pasos en el mismo context.
- Importar imagen/PDF: `page.waitForEvent('filechooser')` + click en
  `button[title="Importar Markdown (.md) o PDF"]`; `setFiles` ignora el `accept`.
- Los `confirm()` del app: registra `page.on('dialog', d => d.accept())`.
- Guardado con debounce (300ms) + serverSave (500ms): espera ~1.2s antes de leer estado.
- Forzar error de cuota: `addInitScript` que haga throw de `QuotaExceededError` en
  `Storage.prototype.setItem` para las claves `tunota.*` y recarga.
- Blobs: IndexedDB `tunota-blobs`, stores `blobs` (id → data URL) y `backups` (snapshots).
- Selectores útiles: `.card`, `.img-media img`, `iframe.pdf-frame`, `#saveBanner`,
  `.backup-panel`, `.kanban-panel`, `.log-panel`, `.card[data-id="<id>"]`.

Script de referencia que ya cubre importar/recargar/migración/copias/cuota/pop-out:
ver `drive.js` del scratchpad de la sesión 2026-07-07 (reproducible desde este SKILL).
