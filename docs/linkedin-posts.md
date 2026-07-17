# tuNota — Posts para LinkedIn

Tres borradores listos para publicar, más sugerencias de imágenes y consejos de
publicación. App: https://tunota.fly.dev

---

## Post A — Lanzamiento personal / historia

Durante meses tuve el mismo problema: mis ideas vivían repartidas entre apps de notas,
pizarras online y documentos sueltos. Las herramientas visuales que me gustaban eran caras,
pesadas o pedían cuenta hasta para probar.

Así que decidí construir la mía. Solo, en mis horas libres, y apoyándome mucho en IA como
copiloto de desarrollo.

El resultado es tuNota: un lienzo infinito donde cada idea es un bloque que puedes mover,
conectar y organizar. Tiene diagramas con conectores, plantillas como Business Model Canvas
o DAFO, kanban, recordatorios y un asistente de IA integrado. Y algo que para mí no era
negociable: tus notas se guardan en tu navegador, no en mis servidores.

No hay registro, no hay plan de pago, no hay letra pequeña. Es gratis y se sostiene con
donaciones (Yape): si te sirve y quieres apoyar, genial; si no, úsala igual.

Acabo de publicarla y me encantaría que la pruebes y me digas qué mejorarías. El enlace
está en el primer comentario.

#buildinpublic #indiedev #productividad #notasvisuales #desarrolloweb

---

## Post B — Lanzamiento de producto / features

Lancé tuNota: notas visuales en un lienzo infinito, gratis y sin registro.

Lo que puedes hacer:

🗺️ Lienzo infinito con pan, zoom y minimapa: cada idea es un bloque que mueves y conectas
📐 Diagramas tipo Visio/Lucidchart: formas, conectores con flecha y etiqueta, guías de
alineación con snap
🤖 IA integrada: resumir, mejorar, generar ideas y buscar en la web con fuentes citadas
🧩 Plantillas listas: Business Model Canvas, Lean Canvas, DAFO, lluvia de ideas
📋 Kanban para llevar tus tareas sin salir del lienzo
🕸️ Mapa de conocimiento: un grafo de todas tus notas y sus relaciones
📲 Sin instalar nada: funciona en el navegador y se puede añadir como PWA
🔒 Privacidad primero: tus notas se quedan en tu navegador

Es gratis, financiada por donaciones. Pruébala y cuéntame qué te parece 👇

👉 https://tunota.fly.dev

#lanzamiento #productividad #notas #buildinpublic

---

## Post C — Técnico / dev

Construí una app de notas en lienzo infinito sin framework. Vanilla JS, sin bundler, sin
paso de build: index.html carga los módulos en orden y todos comparten el ámbito global.
Sonará a herejía, pero para un proyecto en solitario el ciclo editar → recargar sin
tooling es oro.

Algunas decisiones técnicas:

- Canvas propio: pan/zoom, snap con guías inteligentes, conectores SVG con ruteo
  curvo/recto/ortogonal y minimapa, todo hecho a mano.
- PWA con service worker y manifest: se instala y arranca al instante.
- IA multi-proveedor "trae tu propia clave": OpenAI, Anthropic, Gemini, Groq, OpenRouter y
  más, con proxy en el servidor para esquivar CORS.
- Mermaid para diagramas, con un puente que "explota" un flowchart a formas nativas del
  lienzo (y el camino inverso).
- tesseract.js para OCR e imágenes, y Pyodide para ejecutar Python en el propio navegador.
- Persistencia local: localStorage + IndexedDB para blobs. Backend opcional en Python puro
  (solo stdlib).

Está en https://tunota.fly.dev, gratis. Si eres dev y la destripas, tu feedback me
interesa muchísimo.

#javascript #vanillajs #webdev #pwa #buildinpublic

---

## Imágenes sugeridas

**Post A (historia):** vista general del lienzo con una nota real de trabajo: varios
bloques conectados (nota, idea, markdown) y el panel lateral de libros/secciones visible.
Composición: tema claro "Cozy", zoom que muestre 5-7 bloques legibles, sin paneles de
ajustes abiertos — que transmita "espacio de trabajo personal", no demo técnica. Sirve de
base `docs/screenshots/01-vista-general.png`.

**Post B (features):** collage de 4 capturas en cuadrícula 2x2: (1) flujograma con formas y
conectores etiquetados, (2) plantilla Business Model Canvas rellena, (3) mapa de
conocimiento en grafo, (4) panel de IA con una respuesta. Composición: mismo tema en las
cuatro, bordes redondeados y un pequeño rótulo por captura; en móvil se lee mejor que una
sola imagen densa.

**Post C (técnico):** pantalla dividida: a la izquierda un bloque Python con código y su
salida ejecutada (Pyodide), a la derecha un bloque Mermaid junto a sus formas "explotadas"
en el lienzo. Composición: tema oscuro "Pizarra" (estética dev), zoom suficiente para que
el código sea legible en el feed. Alternativa: captura del DevTools con el service worker
activo como segunda imagen del carrusel.

---

## Consejos de publicación

- Publica entre martes y jueves, de 8 a 10 de la mañana hora local de tu audiencia; evita
  viernes por la tarde y fines de semana.
- No pongas el enlace en el cuerpo del post: el algoritmo penaliza el alcance de posts con
  links externos. Ponlo en el primer comentario y dilo en el post ("enlace en comentarios").
- Responde todos los comentarios en las primeras 2 horas: la conversación temprana es lo
  que más empuja el alcance.
- Espacia los tres posts: A primero (la historia conecta más), B a los 3-5 días, C una
  semana después apuntando a tu red de developers.
- Formato escaneable: primera línea con gancho (es lo único visible antes del "ver más"),
  párrafos de 1-3 líneas y máximo 3-5 hashtags.
- Etiqueta solo a personas que de verdad participaron o te dieron feedback; el etiquetado
  masivo resta credibilidad y LinkedIn lo penaliza.
