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
- Calidad de imagen (`fileToScaledDataURL`, js/07): por defecto se guarda el ARCHIVO ORIGINAL sin
  recomprimir (captura PNG → PNG idéntico, resolución nativa) para conservar nitidez en Retina/
  multi-monitor. Solo se reescala por encima de `MAX_IMG_DIM=4096` (o `SOFT_MAX_CHARS`≈17 MB),
  conservando formato (PNG sin pérdida, JPEG 0.92); GIF/SVG/AVIF nunca se rasterizan. Afecta a TODAS
  las vías (pegar, captura, importar, arrastrar) porque todas pasan por `addImagesToBlock`. Nota: solo
  aplica a imágenes NUEVAS; las ya guardadas con el pipeline viejo (JPEG 0.82 @1400) siguen degradadas.
- Selectores útiles: `.card`, `.img-media img`, `iframe.pdf-frame`, `#saveBanner`,
  `.backup-panel`, `.kanban-panel`, `.log-panel`, `.card[data-id="<id>"]`,
  `.tpl-panel`/`.tpl-card` (plantillas), `.search-panel`/`.search-input`/`.search-row`,
  `.shortcut-panel`, `.cm-ai .cm-chip` (acciones IA del menú de tarjeta), `.app-toast`,
  `.card-mmd-type` → `.diagram-pop`/`.dg-type`/`.dg-shapes`/`.dg-ai-input` (herramienta de diagramas),
  `.sel-fmt-bar`/`.sel-fmt-btn` (barra flotante de formato que aparece al enfocar/seleccionar en
  una nota o idea; `applyLineTransform` formatea solo las líneas seleccionadas).
- Legibilidad: `ui.autoText` (por defecto true) da color de texto en contraste con el fondo de la
  tarjeta (`refreshAutoText`/`applyAutoTextAll`); solo sobreescribe cuando `--fg` no se lee sobre ese
  fondo (p. ej. tarjeta de categoría clara en tema oscuro). La barra superior usa la variable de tema
  `--topbar` (editable en "Personalizar colores"; los presets oscuros la fijan).
- El tour se auto-inicia en perfiles nuevos: `.tour-catch` intercepta clics. Cierra con
  `page.evaluate(() => { ui.tourSeen = true; endTour(); })` antes de interactuar.
- Listas: la numeración RESPETA el número inicial (`outlineParse` guarda `num`; `outlineRender` siembra
  `counters[0]`), así "4." → Enter → "5." (antes reiniciaba en 1). Conexiones: clic selecciona (`selectLink`,
  `selectedLinkId`, clase `.link-selected`); Supr/Retroceso borra el enlace seleccionado si no hay bloques
  seleccionados. Marquee: `selectInRect` usa el tamaño REAL del elemento (`cardEl().offset*`), no el guardado,
  para que la selección coincida con lo visible (la geometría del rectángulo ya era correcta a cualquier zoom).
- PWA en el DEPLOY: el `Dockerfile` DEBE copiar `manifest.json` y `sw.js` (usa COPY explícito, no `COPY .`);
  iconos PNG `public/icon-192.png`/`icon-512.png` (generados rasterizando `app-icon.svg` con Chromium) en
  el manifest (any + maskable) para que el botón "Instalar" salga seguro. Fly da https (`force_https`), así
  que la PWA es instalable en tunota.fly.dev. Probar simulando el deploy: sandbox solo con los archivos que
  copia el Dockerfile → curl a manifest.json/sw.js/icon-*.png y `navigator.serviceWorker.getRegistration()`.
- PWA (instalable + sin conexión): `manifest.json` (iconos PNG 192/512 + `app-icon.svg`), `sw.js`
  (network-first para archivos propios, salta `/api/` y orígenes externos), registrado desde index.html.
  Probar con `navigator.serviceWorker.getRegistration()` y `fetch('manifest.json')`.
- Layout en PWA/standalone (controles de "¿dónde estoy?"): `#app` usa `height: 100vh; height: 100dvh;`
  (dvh mide el área visible real; sin esto los controles de abajo quedan cortados en la app instalada).
  Viewport con `viewport-fit=cover` y los controles anclados abajo (`.zoom-ctl`, `.mini-map`, `.sel-bar`,
  `.float-chat-btn`) llevan `bottom: calc(Npx + env(safe-area-inset-bottom, 0px))` (el fallback `0px` los
  deja en Npx cuando no hay inset). Al cambiar CSS/JS cacheado, subir `CACHE` en `sw.js` (va por `v3`).
  Probar: viewport bajo (p.ej. 390×720), computar `getComputedStyle('#app').height ≈ innerHeight` y que
  `.zoom-ctl`/`.mini-map` tengan `getBoundingClientRect().bottom ≤ innerHeight`. Ojo: el minimapa solo
  aparece con contenido disperso (umbral), así que siembra varios bloques lejanos antes de comprobarlo.
- Modo público (`TUNOTA_PUBLIC=1` en server.py, `PUBLIC_MODE`): `/api/config` → `publicMode:true`;
  `/api/data` GET devuelve `{}` y POST no escribe (cada navegador 100% local, no se pisan). Cliente:
  `BACKEND.publicMode` → `serverSaveNow` sale sin enviar. Probar con curl a `/api/config` y `/api/data`.
- Lienzo sobre lienzo (bloque tipo `canvas`, portal): `TYPE_META.canvas`, `defaultContent`→`{noteRef}`,
  `canvasBody`/`updateCanvasPortal`. `newSubCanvas`/`createSubCanvas` crean una nota hija con
  `note.parentId` = nota actual y enlazan el portal; clic en `.portal-open` → `selectNote`. En el árbol,
  `sectionNode` lista solo notas de nivel superior y `noteRow` anida hijas (`.note-children`, recursivo).
  Acción en menú `⋯` "Nuevo sub-lienzo".
- Hipervínculos: `openHlinkPicker` ahora ofrece bloque / otro lienzo (nota) / **Libro** (`type:'notebook'`);
  `navigateHlink` a un libro abre su primer lienzo. Plantillas de usuario desde un grupo:
  `saveGroupAsTemplate(g)` (botón en cabecera de grupo y en la fila del árbol) → `saveSelectionAsTemplate(ids)`.
- Plantillas nuevas (`CANVAS_TEMPLATES`): `flow` (flujograma), `concept` (mapa conceptual), `rootcause`
  (Ishikawa) usando bloques `shape` + `links` con etiqueta; `templateBlockContent` ahora soporta `shape`.
- Navegación del lienzo (js/09): pan con Espacio+arrastrar o botón central (`spaceDown`/`wantPan`),
  rueda = pan 2D (`deltaX`/`deltaY`), **Shift+rueda = horizontal** (para ratón sin eje X), Ctrl/Cmd+rueda
  = zoom. Zoom manual mín 0.1 (`zoomAt`); "Ajustar todo" (`fitView`) baja hasta 0.05 para encuadrar
  contenido disperso. Ayudas: `centerView`, minimapa, "Volver al contenido" (`updateLostHint`).
  Nota de escalabilidad: la app es client-side (datos en localStorage/IndexedDB por navegador), pero
  `server.py` sirve un ÚNICO `db.json` compartido vía `/api/data` (multi-usuario en un mismo server se
  pisarían) y las claves de IA/búsqueda del `.env` son compartidas (coste/límites).
- Sincronización (js/16-sync.js + panel `⋯` → "Sincronización", `.sync-panel`):
  · Apple: server.py `/api/apple/sync` (CalDAV a iCloud): `caldav_request` (Basic auth, sigue 30x a mano),
    `apple_caldav_sync` descubre principal→calendar-home→colecciones (PROPFIND) y hace PUT de VEVENT
    (recordatorios con hora) / VTODO (tareas `- [ ]`). Creds del `.env` (`APPLE_ID`, `APPLE_APP_PASSWORD`)
    o del cliente (`ui.apple`). Front: `appleSyncNow`/`collectAllTodos`; auto-sync `scheduleAppleSync`
    enganchado en recordatorios y toggle de tareas. Probar con mock CalDAV (BaseHTTPRequestHandler con
    do_PROPFIND/do_PUT) monkeypatcheando `srv.CALDAV_ROOT`. NO probado contra iCloud real.
  · Google Drive: navegador (GIS + Drive REST, sin servidor). `driveBackupNow` sube multipart
    `tunota-backup.json` (data+blobs) con `Authorization: Bearer` del token de `initTokenClient`
    (scope drive.file); `driveRestore` → `applyBackupPayload`. Auto `scheduleDriveSync` en `save()`
    (debounce 90 s, solo si hay token). Probar con `ctx.route('**/gsi/client**', abort)` + `addInitScript`
    que mockea `window.google.accounts.oauth2` + `ctx.route('https://www.googleapis.com/**')`.
  · Apple Notes NO es posible (sin API pública).
- Vistas: (1) barra de pestañas `#noteTabs` (`.note-tabs`/`.note-tab`) con los lienzos recientes
  (`ui.recentNotes`, `pushRecentNote` en `selectNote`+boot, `renderNoteTabs` en `renderAll`); ojo:
  al mostrar hay que poner `display:'flex'` (el CSS base es `none`). (2) Relaciones entre hojas en el
  "Mapa de conocimiento": `noteRelations()` (portales `canvas.noteRef` + `parentId` + hlinks tipo note) y
  `renderGraph` dibuja aristas `.graph-rel` (con flecha) entre los nodos de nota.
- Organizar fotos: `organizePhotos` (menú `⋯`) coloca los bloques `image`/`freeimage` en una cuadrícula
  (celda = imagen más grande) debajo del contenido que no son fotos, sin solaparse; luego `fitView`.
- Auto-formato: (1) las notas texto/idea llevan clase `.note-auto` (CSS `height:auto!important`, textarea
  `flex:none`) y `autoGrowNote(ta)` ajusta el alto al contenido (input, render, y tras `applyLineTransform`);
  el tirador ajusta el ancho. (2) Auto-ordenar flujograma: `autoLayoutFlow(ids)`/`autoLayoutSelection`
  (js/09) coloca los bloques en niveles por camino más largo (Kahn) según los `links`, centrando cada
  nivel; botón `.sel-flow` "Ordenar" en la barra de selección (n≥2; con 1 usa `connectedComponent`).
  El auto-formato de TEXTO (limpiar/enumerar) ya existía en `formatTextContent`/sel-fmt bar.
- Editor de imágenes (doble clic sobre la imagen de un bloque `image` → `openImageEditor`/`buildImageEditor`
  en js/07): overlay `.imed-overlay` con `.imed-canvas` (a resolución nativa) y herramientas `.imed-tool`
  (draw, arrow, rect, ellipse, text, crop) + color/grosor + Recortar/Descargar/Duplicar/Aplicar. Las
  anotaciones se componen sobre la imagen y "Aplicar" guarda un PNG nuevo (`storeBlob`, `pushUndo`).
  Herramienta "Mover" (`✥`, primera): `hitAnno`/`annoBBox`/`moveAnno` permiten seleccionar y ARRASTRAR
  cualquier anotación ya colocada (texto, flecha, forma, dibujo); `st.sel` se resalta con caja punteada.
  Teclado propio (`_imedKey`: Esc cierra, Ctrl+Z deshace anotación); el handler global de Supr se salta
  si `#imgEditor` está abierto. Probar con page.mouse (genera pointer events) sobre `.imed-canvas` y
  comprobar píxeles del canvas / que `content.images[0].src` cambie tras Aplicar.
- Descripción al lado de la imagen: el bloque `image` renderiza `.img-row` = `.img-media` + `.img-desc`
  (textarea `.img-desc-ta`, guarda en `b.content.desc`). Botón `.card-desc-btn` (cabecera) → `toggleImageDesc`
  abre el panel al lado y lo enfoca; visible con `.card.image.has-desc`/`.desc-open`. Con descripción el
  redimensionado es libre (no bloquea proporción) y `fitImageCard` se salta el auto-ajuste.
- Grupos: se permiten grupos de 1 bloque (`createGroupFromSelection` ya no exige 2; botón `.sel-group`
  "Agrupar" visible con n≥1). Meter/sacar bloques: `addBlockToGroup`/`removeBlockFromGroup`/`groupOfBlock`
  (js/05); soltar un bloque dentro del área de un grupo lo une (`maybeJoinGroupOnDrop` en el mouseup de
  `attachDragHandler`); el menú de tarjeta tiene sección "Grupo" (Sacar de «X» / → «X» / ＋ Nuevo grupo).
  Un bloque pertenece a un solo grupo; el grupo se disuelve al quedar sin miembros.
- Grupos en el árbol lateral: aparecen anidados bajo su nota (`noteRow` → `.note-groups .group-row`);
  clic → `goToGroup(noteId, g)` (abre la nota si hace falta y `centerOnGroup`). `createGroupFromSelection`
  y `deleteGroup` ahora llaman `renderSidebar()`.
- Juntar (fusionar) grupos: botón `.group-merge` (icono `shapes`) en la cabecera del grupo y en la fila
  del árbol, SOLO si `groupsOf(noteId).length > 1`. Abre `openGroupMergePicker(g, anchor)` (patrón
  `card-menu-pop` + `positionPop` + `closeTopbarMenu`, backdrop id `topbarMenuBackdrop`) que lista los
  otros grupos; al elegir → `mergeGroups(target, source)`: los `blockIds` de source pasan a target (dedup),
  source se disuelve, sobrevive target (nombre/color). Es deshacible.
- Undo de grupos: `pushUndo` ahora incluye `data.groups` en el snapshot y `undo()` lo restaura + llama
  `renderSidebar()`. Así crear/disolver/juntar grupos son deshacibles (Ctrl+Z).
- IMPORTANTE cabecera de grupo (`.group-head`): ya NO es hija de `.group-area` (que crea contexto de
  apilado con z-index:0 y la dejaba DETRÁS de las tarjetas → botones no clicables si una tarjeta solapaba
  la franja del título). Ahora es hermano de las tarjetas, `position:absolute`, colocada por JS con
  `left/top/width = groupBounds` y `zIndex = topZ+1` (por encima de las tarjetas). `updateGroupRects`
  reposiciona área Y cabecera (`[data-ghead]`). Verificar accesibilidad con `document.elementFromPoint`
  en el centro del botón. OJO: la nota por defecto ya trae 2 tarjetas (en 80,80 y 392,130); cuenta esos
  bloques al montar escenarios de test.
- Hipervínculos de texto: en la barra de selección (`.sel-fmt-bar`) el botón 🔗 → `openHlinkPicker`
  (bloques de la nota + otras notas) → `b.content.hlinks[]`. Se pintan como chips `.card-hlinks .hlink-chip`
  bajo el textarea; clic → `navigateHlink` (`focusBlock`/`selectNote`).
- Editor de texto libre: `openFreeFormat` es un panel FLOTANTE `.free-fmt-pop` (backdrop `pop-backdrop`
  transparente) colocado al costado del bloque (`positionFreeFmtPop`), NO un modal de pantalla completa.
- Exportar a iOS: `exportNoteRemindersICS`/`collectNoteTodos` (menú `⋯` → "Recordatorios a iOS (.ics)")
  genera un .ics con VEVENT+VALARM (recordatorios con hora) y VTODO (tareas `- [ ]` sin marcar) de la
  nota actual, para abrir en el iPhone y añadir a Recordatorios/Calendario (sin OAuth).
- Conectores (`openLinkMenu` en js/09): clic en la flecha abre el menú con campo de texto en línea
  (`.link-label-input`), fila de Dirección (`.link-dir-chip`: → end / ← start / ↔ both / — none →
  `lk.dir`), Tipo y Estilo. `drawLinks` pone `marker-start`/`marker-end` según `lk.dir`; el marcador
  `#linkArrow` (orient `auto-start-reverse`, fill `context-stroke`) sirve para ambas puntas.
- Listas multinivel (`attachListAutoContinue` en js/03, motor `outlineApply`/`outlineParse`/
  `outlineRender`): Enter continúa, Tab anida (1. → 1.1. → 1.1.1.), Shift+Tab sube; viñetas cambian
  de símbolo por nivel y las casillas se anidan. En text/idea/freetext usa numeración con puntos
  (`dotted=true`); el editor Markdown pasa `dotted=false` (anida sin puntos: "1." en cada nivel).
- Texto libre (freetext): `openFreeFormat` abre la ventana modal `.free-fmt-panel` ("Personalizar
  texto") con tipo de letra (`FREE_FONTS`: sans/serif/mono/system), negrita/cursiva/subrayado/tachado/
  sombra, alineación, color, sección "Caja" (Ancho → `b.width`, Fondo → `st.bg` callout, Relleno →
  `st.pad`) y tamaño/interlineado/espaciado. `defaultFreeStyle` incluye font, strike, lineHeight,
  letterSpacing, bg, pad, minH; `applyFreeStyle` los aplica al `.free-ta`.
- Redimensionar el cuadro de texto libre: asa `.free-resize` (esquina inferior derecha, `startFreeResize`)
  arrastra ancho y alto mínimo (`st.minH`); `autoGrowFree` fija el alto a `max(contenido, minH)`, así el
  texto que excede dinamiza la caja sin recortarse. Margen semi-visible: contorno punteado
  (`outline`+`outline-offset`) en `:hover`/`:focus-within`/`.selected` de `.card.freetext`.
- Doble clic en el lienzo: crea `ui.dblType` (por defecto `'freetext'` = texto translúcido);
  selector de tipo en el menú `⋯` (`.topbar-pop .cm-chip` con DBL_TYPES). El hint del topbar
  (`.hint`) refleja el tipo. Casillas de tarea clicables: `toggleTaskAtCaret` togglea `- [ ]`↔`- [x]`
  al hacer clic sobre el marcador dentro del textarea de nota/idea.
- Plantillas de usuario: botón `.sel-tpl` de la barra de selección → `saveSelectionAsTemplate`
  guarda la selección (bloques + conexiones internas) en `data.userTemplates`; aparecen en el panel
  de Plantillas bajo `.tpl-sec-title` "Mis plantillas" como `.tpl-user` (insertar al clic; `.tpl-tool`
  renombra/elimina). `eachBlobRef` ya recorre `userTemplates` para no perder blobs en `gcBlobs`.
- Probar acciones IA sin API real: en `page.evaluate`, fija
  `ui.ai = {provider:'openai', model:'m', apiKey:'k', baseUrl:'https://fake/v1'}` y
  reemplaza `window.fetch` por un mock que devuelva
  `{choices:[{message:{content:'…'}}]}`; luego llama `aiBlockAction(b, AI_BLOCK_ACTIONS[i])`.
- El doble clic de crear bloque exige `e.target === .canvas-content`: dispara el
  evento con `dispatchEvent(new MouseEvent('dblclick', {bubbles:true, clientX, clientY}))`
  sobre `.canvas-content` (los clicks de Playwright suelen caer en tarjetas o el SVG).
- Unit tests: `npm test` (Vitest, tests/ con arnés vm que carga js/ reales).
- Backend IA/búsqueda (desde 2026-07-08): server.py carga `.env` (`OPENCODE-API`,
  `TAVILY`, `TUNOTA_TOKEN`) y expone `/api/config` (abierto), `/api/ai` (proxy OpenCode Zen)
  y `/api/search` (proxy Tavily). Si `TUNOTA_TOKEN` está definido, todos los `/api/*` salvo
  `/api/config` exigen `Authorization: Bearer <token>` (sin él → 401). El front usa
  `apiFetch` (adjunta `ui.token`) y descubre capacidades con `loadBackendConfig` → `BACKEND`.
  Proveedor `backend` en el panel de IA = usa las claves del servidor (sin clave en el
  navegador). Para probar sin créditos/clave real: `page.route('**/api/ai'|'**/api/search')`
  y verifica la cabecera Authorization + el payload; el sandbox necesita una copia del `.env`.
  Las llamadas salientes del server llevan `User-Agent` propio (Cloudflare rechaza el de
  urllib con 403).

Scripts de referencia (scratchpad sesión 2026-07-07, reproducibles desde este SKILL):
`drive.js` (Fase 1: importar/recargar/migración/copias/cuota/pop-out),
`smoke.js` (13 tipos de bloque + paneles), `phase5.js` (plantillas, búsqueda,
atajos, IA con fetch simulado), `shots.js` (capturas).
