# tuNota — Mejoras y nuevas funcionalidades

Lista viva de ideas, deudas y mejoras. Marca `[x]` al completar y añade la fecha. Ordenado
por prioridad aproximada dentro de cada bloque. Última revisión: 2026-07-08.

## Hecho recientemente

- [x] **2026-07-08** — Doble clic, marquee y menú radial funcionan en los **márgenes** del
  lienzo (manejadores movidos a `#canvas`, no solo a `.canvas-content`).
- [x] **2026-07-08** — Menú radial **sin solapes**: radio dinámico según nº de opciones +
  reencuadre para no salirse de la ventana.
- [x] **2026-07-08** — Integración de **backend de IA (OpenCode Zen, multi-modelo)** y
  **búsqueda web (Tavily)** con las claves del `.env`; proveedor "Servidor" en el panel.
- [x] **2026-07-08** — **Token Bearer** (`TUNOTA_TOKEN`) protegiendo `/api/*`; el navegador
  lo envía con `apiFetch`.
- [x] **2026-07-08** — **Token auto-provisto en local** (loopback vía `/api/config`): en el
  mismo equipo no hay que introducirlo; en remoto sigue exigiéndose. Arreglado el 401 de la
  búsqueda web. Orden de arranque `loadBackendConfig` → `serverLoad`.
- [x] **2026-07-08** — Acción de tarjeta **“🌐 Buscar en la web”** sobre el contenido del
  bloque (crea un bloque enlazado con fuentes).
- [x] **2026-07-08** — Nuevo bloque **“Imagen IA”** en el lienzo: buscar imágenes (Tavily) o
  generar por prompt (`/api/image`, si hay `IMAGE_API_KEY`).
- [x] **2026-07-08** — Diagramación estilo Lucidchart/Visio (lote 1): **guías inteligentes
  de alineación + snap** (a otros bloques y a rejilla de 20px) al arrastrar; **conectores
  borde-a-borde con flecha direccional y etiqueta** (clic en el conector → menú etiquetar/
  eliminar, ya no borra de golpe); **z-order** (traer al frente / enviar al fondo) en el
  menú de tarjeta.

Lote 10 (hecho 2026-07-10): **[hecho]** 12 mejoras — **Telegram** (compartir + bot opcional
`.env`), zoom siempre visible (z-index), **kanban muestra el libro**, **auto-enumeración**
al escribir (Enter continúa "2.", "-", "- [ ]"), **chat flotante del lienzo** con referencia
a bloque (🎯) y flujo **planner→agentes** (editor/juegos/lean/organizador/diagramador),
**estructurar ideas** con metodologías elegidas por IA (Design Thinking, Lean Startup, Game
Design, Marketing → fases numeradas + grupo), **personalización de formato** (enumerador
1./1)/a)/I., viñeta -/•/–/▸, espaciado), **vista vertical** (importantes primero),
**Shift+arrastrar** mueve todo lo conectado, **títulos de bloque** por doble clic,
**grupos/combinar** (área de color con nombre editable + pestañas de acceso rápido) y
**flechas direccionales** (curva/elbow según eje dominante — ya no quedan chuecas).

Lote 9 (hecho 2026-07-10): **[hecho]** recordatorios ampliados — exportar al **calendario**
(botones Google Calendar y Apple/.ics con VALARM en el panel de recordatorio), **sonidos de
aviso** (6, estándar "Campanilla", personalizables desde la alarma o el panel), **casillas
de tarea en Markdown** interactivas (clic marca/desmarca) con **campana por casilla**
(recordatorio con el texto de esa tarea), **Kanban→Pendiente** sugiere crear recordatorio
(toast con acción), **duplicar selección completa** desde el menú de tarjeta + **Ctrl/⌘+A**
(seleccionar todo), y **edición de texto**: menú de formato (enumerar 1./viñetas/casillas/
limpiar, sin IA) y **barra de formato Markdown** (B, I, tachado, código, H2, listas,
numeración, casilla, enlace).

Lote 8 (hecho 2026-07-09): **[hecho]** **IA de texto funcionando** — la clave era de
**OpenCode Go**; se cambió el endpoint del servidor a `https://opencode.ai/zen/go/v1` y el
modelo por defecto a `qwen3.7-plus` (verificado: chat y acciones responden de verdad, sin
CreditsError). `aiPickContent` maneja modelos de razonamiento (`<think>`, campo `reasoning`).
Además: arreglo del token de acceso antiguo (se sincroniza en loopback, no se borra al
guardar, y el error 401 del proxy se explica).

## Correcciones / robustez (deuda técnica)

- [ ] **Aviso al degradar en remoto sin token**: en un servidor desplegado y protegido, si
  falta el token la app cae a modo local en silencio. Mostrar un aviso ("servidor protegido:
  introduce el token en el panel de IA"). En local ya se auto-provee.
- [ ] **Persistir imágenes buscadas**: las imágenes elegidas por búsqueda se guardan como
  URL remota (`{src}`); si el origen cae o bloquea hotlinking, la imagen desaparece.
  Considerar descargarlas al servidor/IndexedDB (CORS lo complica desde el navegador).
- [ ] **Generación de imágenes real**: hoy `/api/image` está cableado pero sin `IMAGE_API_KEY`
  no funciona (OpenCode Zen es solo texto). Documentar/añadir un proveedor de imágenes.
- [ ] **Sincronizar bytes de blobs al servidor** (imágenes/PDF): hoy solo se guardan
  referencias; multi-dispositivo real requiere subir los blobs (Fase 4, aparcada).
- [ ] **Feedback de créditos/errores de IA**: cuando OpenCode devuelve `CreditsError` o
  Tavily `Unauthorized`, mostrar un mensaje claro y accionable (enlace a facturación / a
  configurar la clave) en lugar del error crudo.
- [ ] **`/api/config` cachea modelos para siempre**: si cambia el catálogo de OpenCode, hay
  que reiniciar el servidor. Añadir un TTL corto o refresco manual.
- [ ] **Streaming de respuestas de IA**: hoy se espera la respuesta completa; añadir SSE
  para ver el texto según llega.

## Inspiración Lucidchart / Visio (mapa a tuNota)

Puntos fuertes de esas herramientas y su encaje aquí. **[hecho]** ya está; el resto,
ordenado por relación valor/esfuerzo y por respetar el diseño acogedor.

Ya teníamos: conexiones entre bloques, alinear/distribuir selección, marquee, plantillas,
pan/zoom, exportar Mermaid a PNG.

Lote 1 (hecho 2026-07-08): **[hecho]** guías inteligentes + snap; conectores con flecha y
etiqueta; z-order (frente/fondo).

Lote 7 (hecho 2026-07-09): **[hecho]** **trae tu propia clave** de IA — proveedores OpenCode
Zen, OpenAI, Claude, **Grok (xAI)**, Gemini, Groq, OpenRouter y personalizado, con botón
**Probar**. Los de estilo OpenAI se enrutan por el **proxy del servidor** (`/api/ai` con
`override:{baseUrl,key}`) para evitar el CORS de OpenAI/OpenCode. Además, selección de
**modelo** y **esfuerzo de razonamiento** (`reasoning_effort`: Auto/Mín/Bajo/Medio/Alto) en
ajustes y en la barra rápida. También: región de Fly
movida a **dfw (US)** para que la búsqueda Tavily funcione en el servidor (gru daba 403).

Lote 6 (hecho 2026-07-09): **[hecho]** **conexión rápida** en formas (4 manijas + en los
costados → crear bloque conectado: Paso/Decisión/Subproceso/Inicio-Fin/**Fin rojo**),
formas **coloreables** por categoría y con manija de **redimensionar** propia; **duplicar**
reforzado (menú, barra de selección y **Ctrl/⌘+D**, con conectores internos en la selección
múltiple). Mejoras de IA: selector de modelo, formatear/enumerar/flujograma, respaldo de
búsqueda web. Nota: OpenCode sigue sin saldo; Tavily funciona en local pero 403 desde Fly.

Lote 5 (hecho 2026-07-09): **[hecho]** teclado por plataforma (⌘/⌥ en Mac, Ctrl/Alt en
Win/Linux: `IS_MAC`/`MOD`/`ALTKEY`), **enlace de confianza** `?token=…` (`applyUrlToken`) y
**puerta de acceso** (`showTokenGate`): modal que pide el token al entrar en la instancia
protegida (para compartir con otras personas); en local no aparece (auto-token).

Lote 4 (hecho 2026-07-09): **[hecho]** **tour visual guiado** (coach marks a demanda,
`js/15-tour.js`) y **página showcase dinámica** generada del Markdown de features
(`docs/build-showcase.cjs` → `docs/showcase.html`, con buscador, TOC scroll-spy y lightbox).
Ambos accesibles desde «⋯». El Dockerfile ahora incluye `docs/`.

Lote 3 (hecho 2026-07-09): **[hecho]** puente **Mermaid ↔ lienzo**: "Explotar a formas del
lienzo" convierte un flowchart en formas + conectores nativos (que **sí siguen** a las cajas
al arrastrarlas, resolviendo el viejo problema del modo interactivo); "A diagrama" en la
barra de selección hace la conversión inversa (formas/notas + conexiones → bloque Mermaid).
Mapea formas (rect/round/pill/ellipse/diamond/parallelogram) y conserva etiquetas de aristas.

Lote 2 (hecho 2026-07-08): **[hecho]** paleta de **formas/stencils** (rect, redondeado,
elipse, rombo, píldora, proceso) con selector de tipo; **tipos de conector** (relación/
depende/bloquea/flujo, color semántico) y **ruteo** (curvo/recto/ortogonal); **rediseño del
mapa de conocimiento** (aristas curvas, auto-encuadre, zoom, contador, resaltado al pasar el
ratón); **paletas de color** (11 temas con vista previa + 2 categorías de tarjeta nuevas).

Siguientes candidatos (encajan sin romper diseño):
- [ ] **Contenedores / marcos / swimlanes** (ver más abajo). Es el siguiente “gran” paso.
- [ ] **Anclas/puertos de conexión** por lado del bloque (arriba/abajo/izq/der) en vez de
  centro, para conectores aún más limpios. Medio.
- [ ] **Contenedores / marcos / swimlanes**: un bloque rectángulo con título que agrupa a
  los que tiene encima; al moverlo, mueve a sus hijos. Medio-alto (toca arrastre/selección).
- [ ] **Agrupar/desagrupar** selección para moverla como una unidad (Ctrl+G). Medio.
- [ ] **Tipos de conector**: recto / elbow (ortogonal) / curvo, y estilos (discontinuo,
  grosor, color/semántica: depende, bloquea, relaciona). Medio.
- [x] **2026-07-09** — **Ayudas de navegación** (no perderse): botón Centrar (zoom 100% +
  contenido centrado), Ajustar todo, aviso "Volver al contenido" cuando no hay bloques a la
  vista, y **minimapa** con viewport y clic para navegar.
- [ ] **Copiar/pegar formato** entre bloques (color, tamaño, estilo). Bajo.
- [ ] **Modo presentación**: recorrer bloques/enlaces a pantalla completa. Medio-alto.
- [ ] **Capas** (mostrar/ocultar/bloquear grupos de bloques). Alto.
- [ ] **Exportar el lienzo** completo a PNG/PDF/SVG (no solo Mermaid). Medio.
- [ ] **Regla/guías fijas** y **bloqueo de posición** de un bloque. Bajo.

## Nuevas funcionalidades (ideas)

- [ ] **Selector de modelo por conversación/acción**: elegir modelo rápido sin abrir ajustes
  (p. ej. un desplegable junto al input del chat con los modelos de `BACKEND.models`).
- [ ] **Búsqueda web como bloque**: insertar los resultados de Tavily como una tarjeta con
  fuentes enlazadas en el lienzo (no solo en el chat).
- [ ] **IA con contexto del lienzo completo**: permitir preguntar sobre toda la nota/sección,
  no solo el bloque seleccionado.
- [ ] **Historial de chat persistente** por nota (hoy `aiChat` es efímero por sesión).
- [ ] **Exportar nota** a Markdown/PDF con los bloques renderizados.
- [ ] **Colaboración / compartir** una nota de solo lectura (aprovechando el despliegue Fly).
- [ ] **Comandos rápidos de IA sobre selección múltiple** además de la síntesis actual.
- [ ] **Roles/uso del token**: distinguir token de solo-lectura vs escritura para compartir.

Ideas propias (ángulo notas + IA, más allá de copiar a Visio):
- [ ] **Auto-diagrama con IA**: seleccionar varias notas y pedir a la IA que proponga las
  conexiones y etiquetas entre ellas (genera enlaces, no solo texto).
- [ ] **Drill-down infinito**: un bloque que se abre en su propio sub-lienzo (notas dentro
  de notas) para no saturar un tablero.
- [ ] **Modo foco**: atenuar todo menos el bloque activo y sus conexiones directas.
- [ ] **Conexiones semánticas con color** por tipo de relación, filtrables.
- [ ] **Captura rápida** (sticky): atajo global para soltar una nota en el centro al vuelo.
- [ ] **Vista agenda/línea de tiempo** de los bloques con recordatorio.
- [ ] **Explicar esta conexión**: IA que redacta por qué A se relaciona con B.

## Seguridad / despliegue

- [ ] **Rotación del token**: documentar cómo cambiar `TUNOTA_TOKEN` (secreto de Fly) y que
  invalida los navegadores que tengan el anterior.
- [ ] **Rate limiting** básico en `/api/ai` y `/api/search` para no agotar créditos si el
  token se filtra.
- [ ] **CORS**: hoy same-origin; si se separa el front, definir orígenes permitidos.
- [ ] **Cabecera de seguridad** (CSP) en las respuestas estáticas.

## Cómo verificar cambios

`.claude/skills/verify` documenta cómo lanzar la app en un sandbox aislado y conducirla con
Playwright. Los scripts `verify.js` (lienzo/radial) y `verify-ai.js` (backend IA/búsqueda)
del scratchpad de 2026-07-08 son reproducibles desde ahí.
