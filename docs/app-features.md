# tuNota — Guía de funcionalidades

> ¿Buscas una **guía visual con capturas** de cada feature? Mira
> [`guia-features.md`](guia-features.md) (22 pantallas comentadas). Este documento es la
> referencia técnica de dónde vive cada cosa en el código.

Referencia viva de lo que hace la app y dónde vive cada cosa en el código. Pensada para
entender el producto de un vistazo y para saber qué fichero tocar. La app es **JS vanilla
sin build**: `index.html` carga en orden los módulos `js/01…14`, `note.js` y `styles.css`,
todos comparten el ámbito global. `server.py` sirve los estáticos y una pequeña API.

## Arquitectura en una frase

Un lienzo infinito (pan/zoom) donde cada idea es un **bloque** (tarjeta) que vive dentro de
una jerarquía **Libro → Sección → Nota**. Todo se guarda en `localStorage` y, si hay
servidor, también en `db.json` vía `/api/data`. Las imágenes/PDF grandes van a IndexedDB
(`tunota-blobs`) y en los datos solo quedan referencias `blob:<id>`.

## Módulos (js/)

| Fichero | Responsabilidad |
|---|---|
| `01-storage.js` | localStorage protegido (`writeLS`), IndexedDB de blobs, GC, banner de cuota |
| `02-state.js` | Estado global `data`/`ui`, `save()`, deshacer, **API backend (`apiFetch`, token, `BACKEND`, `loadBackendConfig`)** |
| `03-dom.js` | Helpers de DOM (`h`, `icon`), edición inline |
| `04-sidebar-theme-ai.js` | Sidebar (árbol), temas/colores, **panel de IA, `callAI`, búsqueda web (`webSearch`)** |
| `05-topbar-canvas.js` | Barra superior, render del lienzo, `createAt`/`quickCreate`, tarjetas, dibujo |
| `06-markdown-mermaid.js` | Markdown, diagramas Mermaid y herramienta de diagramas |
| `07-media.js` | Imágenes y PDF (importar, mostrar, ajustar) |
| `08-text-exec.js` | Ejecutar código y **cURL** (vía `/api/curl`), formateo de texto |
| `09-interactions.js` | Arrastre, marquee, conexiones, **zoom/pan, menú radial** |
| `10-sync-panels.js` | Sync entre ventanas, `serverLoad`/`serverSave`, historial, copias, grafo, `renderAll` |
| `11-features.js` | Atajos de teclado, recordatorios, kanban, ayuda |
| `12-boot.js` | Arranque: hidrata blobs → carga servidor → descubre backend → pinta |
| `13-templates.js` | Plantillas de lienzo |
| `14-search.js` | Búsqueda global (Ctrl+K) |
| `15-tour.js` | Tour visual guiado (coach marks), a demanda (`startTour`) |

## Bloques del lienzo

`text` (nota), `freetext` (texto libre), `idea`, `table`, `code`, `python`, `json`, `curl`,
`image`, `aiimage` (**Imagen IA**: buscar/generar), `shape` (**Forma/stencil**), `markdown`,
`mermaid`, `draw` (dibujo a mano). Se crean con doble clic (nota) o con el **menú radial**.

**Formas / stencils (`shape`)**: rectángulo, redondeado, elipse, rombo (decisión), píldora
(inicio/fin) y proceso (paralelogramo). Se insertan desde el botón de **Formas** de la barra
superior (`openShapePalette`) y se cambia el tipo con el botón de la tarjeta
(`openShapePicker`/`setShapeType`). Render en `shapeBody`; formas por CSS (`clip-path`).
- **Conexión rápida**: al pasar el ratón por una forma aparecen 4 manijas **+** en los
  costados (`.qc-handle`); un clic abre un menú (`openQuickConnect`) para crear un bloque
  **conectado** en esa dirección — Paso (rect), Decisión (rombo), Subproceso, Inicio/Fin, o
  **Fin del proceso (rojo)**. Lo hace `quickConnect` (crea forma + conector `flow`). Las
  formas se redimensionan con su propia manija (`startBlockResize`) y se pueden **colorear
  por categoría** (nodos rojos/verdes/etc. vía `b.color` → `.card.card-c-* .shape-box`).

**Imagen IA (`aiimage`)**: bloque con dos modos — "Buscar" (imágenes de la web vía Tavily,
`include_images`; se elige una miniatura) y "Generar" (imagen por prompt vía `/api/image`,
solo si hay `IMAGE_API_KEY` en `.env`). La imagen elegida se guarda en el bloque
(`content.images`, misma forma que el bloque `image`). Código en `aiImageBody` (07-media.js)
+ `imageSearchWeb`/`imageGenerate` (04-sidebar-theme-ai.js).

## Interacciones del lienzo (09-interactions.js)

- **Doble clic** en zona vacía → crea una nota.
- **Menú radial**: `Alt` (mantener) o `Ctrl+clic` → anillo con los 14 tipos de bloque
  (incluida **Forma**). El
  radio se calcula según el nº de opciones para que no se solapen y se **reencuadra** para
  no salirse de la ventana cerca de los bordes.
- **Marquee**: arrastrar en vacío selecciona varias tarjetas.
- **Pan**: barra espaciadora + arrastrar, o botón central. **Zoom**: `Ctrl`+rueda o `Ctrl +/-`.
- **No perderse** (ayudas de navegación, en `09-interactions.js`): botón **Centrar**
  (`centerView`, zoom 100% + contenido centrado; también `Ctrl+0` y clic en el `%`),
  **Ajustar todo** (`fitView`, `Ctrl+1`), aviso flotante **"Volver al contenido"**
  (`updateLostHint`) cuando ningún bloque está a la vista, y **minimapa**
  (`updateMinimap`) abajo-izquierda con el rectángulo del viewport y clic para saltar a una
  zona (`centerOn`). El minimapa se muestra/oculta con su botón (persiste en `ui.hideMinimap`).
- El doble clic, el marquee y el `Alt` funcionan **también en los márgenes** (el área de
  `#canvas` que `.canvas-content` no cubre tras pan/zoom): los manejadores están sobre el
  wrap `#canvas`, no solo sobre `.canvas-content`.
- **Guías inteligentes + snap** (estilo Lucidchart/Visio): al arrastrar, el bloque engancha
  sus bordes/centro a los de otros bloques y a la rejilla de 20px, mostrando líneas guía
  (`snapDrag`/`drawSnapGuides`). El mismo desplazamiento se aplica a todo el grupo.
- **Z-order**: “Traer al frente / Enviar al fondo” en el menú de tarjeta (reordena
  `data.blocks`; `bringToFront`/`sendToBack`).
- **Duplicar**: en el menú de tarjeta, en la barra de selección (botón copiar) y con
  **Ctrl/⌘+D** (`duplicateBlock` / `duplicateSelected` — la selección múltiple duplica también
  los conectores internos y deja seleccionadas las copias).
- Conexiones: arrastrar desde el ancla de una tarjeta a otra crea un enlace (relación). Los
  conectores van **borde a borde** con **flecha direccional** (a→b) y pueden llevar
  **etiqueta**, un **tipo semántico con color** (relación/depende/bloquea/flujo → `lk.type`)
  y un **estilo de ruteo** (curvo/recto/ortogonal → `lk.style`). Un clic sobre el conector
  abre el menú `openLinkMenu` (etiqueta, tipo, estilo, eliminar); ya no borra de un solo
  clic. Dibujo en `drawLinks` (SVG `.link-layer`), ruteo en `linkPathD`.
- **Puente Mermaid ↔ lienzo**: "Explotar a formas del lienzo" (cabecera del bloque Mermaid y
  su menú) convierte un flowchart en **formas + conectores nativos** que sí siguen a las
  cajas al arrastrarlas; mapea las formas (`[]`→rect, `()`→round, `([])`→pill, `(())`→ellipse,
  `{}`→diamond, `[/ /]`→parallelogram) y conserva etiquetas de aristas (`mermaidToCanvas`).
  "A diagrama" en la barra de selección hace lo inverso: formas/notas + sus conexiones →
  bloque Mermaid (`selectionToMermaid`, en 06-markdown-mermaid.js).
- **Mapa de conocimiento** (grafo, botón en la barra): aristas curvas, auto-encuadre, zoom/
  ajuste, contador de notas/documentos y resaltado de vecinos al pasar el ratón
  (`renderGraph`/`setupGraphNav`/`highlightGraph` en 10-sync-panels.js).
- **Temas y colores**: 11 paletas con vista previa (`THEME_PRESETS`, panel `openTheme`) y 8
  categorías de color de tarjeta (`CARD_COLORS`: pregunta/respuesta/pendiente/info/
  destacado/idea/clave).

## IA (04-sidebar-theme-ai.js)

Panel de asistente (icono de chispa) + acciones sobre bloques (mejorar, resumir, insights,
expandir, accionables), síntesis de selección y título automático.

**Proveedores** (`AI_PROVIDERS`) — trae tu propia clave: `backend` (claves del servidor/.env),
**OpenCode Zen**, **OpenAI**, **Anthropic (Claude)**, **xAI (Grok)**, **Gemini**, **Groq**,
**OpenRouter** y **Personalizado (OpenAI-compat)**. Se elige en el panel (icono de llave), con
un botón **Probar** que valida proveedor+clave (`aiTestConnection`). Se puede escoger el
**modelo** (desplegable de los del servidor, o campo libre por proveedor) y el **esfuerzo**
de razonamiento (Auto/Mínimo/Bajo/Medio/Alto → `ui.ai.effort`), tanto en ajustes como en una
barra rápida sobre el chat. Con esfuerzo activo, `callAI` envía `reasoning_effort` y omite
`temperature` (los modelos de razonamiento la rechazan); el servidor lo reenvía. Las claves se guardan en
`localStorage` (`ui.ai`). `callAI(messages)` enruta según el `style`:
- **estilo OpenAI** (OpenCode/OpenAI/Grok/Groq/OpenRouter/custom): se enruta por el **proxy
  del servidor** `/api/ai` con `override:{baseUrl,key}` cuando hay servidor (evita el CORS de
  esos proveedores y añade `User-Agent`); si no hay servidor, intento directo.
- **anthropic** y **gemini**: llamada directa del navegador (permiten CORS). El servidor
  exige `https` en el `override` como salvaguarda.

- **Proveedor `backend`**: no pide clave en el navegador; llama a `/api/ai`, que en el
  servidor inyecta la clave de OpenCode Zen (multi-modelo, API compatible con OpenAI). Los
  modelos disponibles se descubren al arrancar (`loadBackendConfig` → `/api/config`).
- **Búsqueda web** (Tavily): chip “🌐 Buscar” en el panel; `webSearch()` llama a
  `/api/search`, y si hay IA, redacta una respuesta citando fuentes.
- **Buscar en la web sobre un bloque**: en el menú de tarjeta (⋯) → sección IA, la acción
  “🌐 Buscar en la web” (`aiWebSearchBlock`) usa el contenido del bloque como consulta y
  crea un bloque Markdown **enlazado** con el resumen y las fuentes.

## Backend / servidor (server.py)

Servidor de solo-stdlib. Carga `.env` (`OPENCODE-API`, `TAVILY`, `TUNOTA_TOKEN`) sin
sobreescribir variables de entorno ya presentes (para Fly.io se usan *secrets*).

Endpoints:

- `GET /api/data`, `POST /api/data` — leer/guardar `db.json` (persistencia).
- `POST /api/curl` — proxy de cURL para el bloque cURL.
- `GET /api/config` — capacidades del backend (IA/búsqueda/imágenes disponibles, si se
  exige token, modelo por defecto y **lista de modelos**). No expone las claves. **Abierto**
  (sin token). En **local (loopback)** incluye además el `token` para que el navegador no
  tenga que pedirlo; nunca lo entrega a clientes remotos.
- `POST /api/ai` — proxy a OpenCode Zen `/chat/completions`.
- `POST /api/search` — proxy a Tavily `/search` (soporta `include_images`).
- `POST /api/image` — proxy a un endpoint compatible con OpenAI `/images/generations`
  (solo si hay `IMAGE_API_KEY`).

**Seguridad — token Bearer**: si `TUNOTA_TOKEN` está definido, todos los `/api/*` (salvo
`/api/config`) exigen `Authorization: Bearer <token>`. Sin él → `401`. Modelo de confianza:
- **Sistema de confianza = mismo equipo (loopback)**: el servidor entrega el token vía
  `/api/config` y el navegador lo auto-rellena → **no hay que introducirlo**.
- **Remoto/desplegado**: el token NO se entrega (nadie es loopback). Se aporta una vez y se
  guarda en `ui.token` (localStorage) → ese navegador queda "de confianza". Dos formas de
  aportarlo: el campo “Token servidor” del panel de IA, o un **enlace de confianza**
  `…/?token=<token>` (`applyUrlToken` lo guarda y limpia la URL al arrancar).
`apiFetch` adjunta el token a cada llamada. Si falta, la app degrada con elegancia: funciona
solo con `localStorage`. Orden de arranque: `applyUrlToken` → `loadBackendConfig` →
`serverLoad` → `maybeShowTokenGate`.
- **Puerta de acceso** (`showTokenGate`/`maybeShowTokenGate` en 04-sidebar-theme-ai.js): al
  entrar, si el servidor exige token y no se logró autenticar (`BACKEND.tokenRequired &&
  !SERVER`), aparece un modal que pide el token. Al validarlo reconecta y entra; se recuerda
  para no volver a pedirlo. En local no aparece (auto-token). Ideal para compartir la
  instancia protegida con otras personas.

**Teclado por plataforma**: `IS_MAC`/`MOD`/`ALTKEY` (03-dom.js) detectan Mac vs Windows/Linux
por `navigator.platform` y muestran ⌘/⌥ o Ctrl/Alt en atajos, tooltips y el tour.

Nota: las llamadas salientes usan un `User-Agent` propio porque Cloudflare (delante de
OpenCode Zen) rechaza el de urllib con `403`.

## Chat del lienzo y estructuración de ideas (IA)

- **Chat flotante** (botón 💬 abajo-derecha, `toggleFloatChat` en 04): referencia un bloque
  con 🎯 (clic en la tarjeta → queda como vínculo `fc-linked`) y pide un cambio. Flujo
  **planner→agente**: `FC_PLANNER_SYS` elige el mejor agente (`FC_AGENTS`: editor, diseñador
  de juegos, lean startup, organizador, diagramador, general) y redacta un prompt preciso;
  el agente lo ejecuta y el resultado **se aplica al bloque** (Ctrl+Z deshace) o crea un
  Mermaid enlazado si es el diagramador.
- **Estructurar idea** (`aiStructureIdea`, chip 🧭 en el menú de bloques idea): un planner
  clasifica la idea y elige metodología (`IDEA_METHODS`: Design Thinking, Lean Startup,
  Game Design, Marketing); un segundo agente desarrolla cada fase → bloques Markdown
  **numerados paso a paso**, enlazados en secuencia y **agrupados** con el nombre de la
  metodología.

## Grupos, vistas y compartir

- **Combinar selección** (botón "Combinar" en la barra de selección o `createGroupFromSelection`):
  crea un **área de color** detrás de los bloques (`data.groups`, render `renderGroups` en 05)
  con nombre editable (doble clic), color rotatorio y arrastre desde su cabecera (mueve a
  todos los miembros). **Pestañas de acceso rápido** (`buildGroupTabs`) arriba del lienzo →
  clic centra la vista en el grupo.
- **Vista vertical** (`openVerticalView`, menú ⋯): los bloques de la nota en lista,
  **importantes primero** y resaltados; clic lleva al bloque.
- **Telegram**: compartir el bloque (menú ⋯ de la tarjeta → ✈️, URL `t.me/share`) o la nota
  entera (menú ⋯ superior); con `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID` en `.env`, botón
  "🤖 Al grupo" que envía directo vía `/api/telegram`.
- **Títulos de bloque**: doble clic en la etiqueta de la tarjeta (`b.title`).
- **Shift+arrastrar** una tarjeta mueve **todo su componente conectado** (`connectedComponent`).
- Conectores **direccionales**: curva/ortogonal según el eje dominante (`linkPathD`), la
  flecha entra recta al borde (ya no queda "chueca" en conexiones verticales).

## Recordatorios, calendario y tareas

- **Recordatorios por bloque** (menú ⋯ → Recordarme, o rápidos 15min/1h/3h). El panel
  (`openReminderPicker`, 11-features.js) permite fecha/hora, repetición, **sonido del aviso**
  y **exportar al calendario**: botón **Google Calendar** (URL template prellenada, sin
  OAuth — `openGoogleCalendar`) y **Apple/.ics** (archivo iCalendar con `VALARM`,
  `downloadICS`; lo abren Apple Calendar y Outlook). Repeticiones → `RRULE`.
- **Aviso en la página**: overlay de alarma + **sonido** (Web Audio, sin archivos):
  `ALARM_SOUNDS` (Campanilla estándar, Ding, Campana, Digital, Suave, Silencio), elegible en
  la propia alarma o el panel (persiste en `ui.alarmSound`). También notificación del
  navegador si hay permiso.
- **Casillas de tarea en Markdown**: `- [ ]` se renderiza como checkbox **clicable** (edita
  la línea fuente) con **campana por casilla** → recordatorio con el texto de esa tarea
  (`b.reminder.label`). Render en `renderMarkdown`, handler delegado en `markdownBody`.
- **Kanban → Pendiente**: al mover un bloque a "Pendiente" sin recordatorio, un toast con
  acción ofrece crear uno (`toastAction` en 03-dom.js; hook en `placeInColumn`).

## Edición de texto

- **Bloques de texto/idea**: el botón de formato abre un menú (`openTextFormatMenu`,
  08-text-exec.js) con Auto-formato, **Enumerar (1.)**, Viñetas, Casillas de tarea y Quitar
  marcadores — transformaciones locales instantáneas (`TEXT_TRANSFORMS`), sin IA.
- **Markdown**: al editar aparece una **barra de formato** (`.md-fmt-bar`): negrita,
  cursiva, tachado, código, H2, viñetas, numeración, casilla y enlace — envuelven la
  selección o prefijan las líneas (`mdWrapSel`/`mdPrefixLines`).
- **Selección**: **Ctrl/⌘+A** selecciona todos los bloques; **Ctrl/⌘+D** duplica la
  selección (también desde el menú de tarjeta: "Duplicar selección (N)").

## Ayuda: tour y showcase

- **Tour visual guiado** (`js/15-tour.js`): coach marks que resaltan la interfaz paso a
  paso. A demanda desde «⋯» → «Tour visual» o el botón del estado inicial (`startTour`).
- **Showcase** (`docs/showcase.html`): página dinámica generada del Markdown de features con
  `node docs/build-showcase.cjs` (buscador, TOC scroll-spy, lightbox). Se abre desde «⋯» →
  «Showcase de funcionalidades» (`window.open('docs/showcase.html')`). El Dockerfile copia
  `docs/`, así que también funciona en el despliegue (requiere re-desplegar).

## Despliegue

`Dockerfile` (python:3.12-alpine, copia explícita de ficheros — `.env` **no** entra en la
imagen) + `fly.toml` (`tunota.fly.dev`). En Fly.io: `fly secrets set OPENCODE_API=…
TAVILY=… TUNOTA_TOKEN=…`.

## Persistencia y estado

- `data`: `notebooks`, `sections`, `notes`, `blocks`, `links`, `log`, `savedAt`.
- `ui`: `currentNoteId`, expandidos, `views` (zoom/pan por nota), `theme`, `ai`, **`token`**.
- Claves de `localStorage`: `LS_DATA`, `LS_UI`. Blobs en IndexedDB `tunota-blobs`.
