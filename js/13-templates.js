/* tuNota — Plantillas de canvas: conjuntos de bloques prediseñados (Business Model
   Canvas, Lean Canvas, DAFO, brainstorming, arquitectura de software, idea→despliegue).
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// Cada plantilla: bloques con posiciones relativas + enlaces opcionales por índice.
// type admite: text, idea, freetext, mermaid, table.
var CANVAS_TEMPLATES = [
  {
    key: 'bmc',
    name: 'Business Model Canvas',
    desc: 'Los 9 bloques clásicos para diseñar un modelo de negocio.',
    icon: 'board',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 640, h: 52, text: 'Business Model Canvas', style: { size: 30, bold: true } },
      { type: 'text', x: 0, y: 0, w: 250, h: 320, color: 'i', text: '🤝 Socios clave\n\n• ¿Qué aliados estratégicos necesitas?\n• ¿Qué proveedores son críticos?' },
      { type: 'text', x: 266, y: 0, w: 250, h: 152, color: 'i', text: '⚙️ Actividades clave\n\n• ¿Qué debes hacer muy bien cada día?' },
      { type: 'text', x: 266, y: 168, w: 250, h: 152, color: 'i', text: '🧰 Recursos clave\n\n• Personas, tecnología, marca, capital…' },
      { type: 'text', x: 532, y: 0, w: 250, h: 320, color: 'n', text: '🎁 Propuesta de valor\n\n• ¿Qué problema resuelves?\n• ¿Por qué tú y no otro?' },
      { type: 'text', x: 798, y: 0, w: 250, h: 152, color: 'a', text: '💬 Relación con clientes\n\n• ¿Cómo captas, retienes y creces?' },
      { type: 'text', x: 798, y: 168, w: 250, h: 152, color: 'a', text: '📣 Canales\n\n• ¿Por dónde llegas al cliente?' },
      { type: 'text', x: 1064, y: 0, w: 250, h: 320, color: 'q', text: '👥 Segmentos de clientes\n\n• ¿Para quién creas valor?\n• ¿Quién es tu cliente ideal?' },
      { type: 'text', x: 0, y: 336, w: 641, h: 140, color: 'p', text: '💸 Estructura de costes\n\n• Costes fijos y variables más importantes.' },
      { type: 'text', x: 673, y: 336, w: 641, h: 140, color: 'p', text: '💰 Fuentes de ingresos\n\n• ¿Cómo y cuánto paga cada segmento?' },
    ],
  },
  {
    key: 'lean',
    name: 'Lean Canvas',
    desc: 'La variante para startups: problema, solución y ventaja injusta.',
    icon: 'bulb',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 520, h: 52, text: 'Lean Canvas', style: { size: 30, bold: true } },
      { type: 'text', x: 0, y: 0, w: 250, h: 320, color: 'q', text: '🔥 Problema\n\n• Top 3 problemas del cliente.\n• Alternativas que usa hoy.' },
      { type: 'text', x: 266, y: 0, w: 250, h: 152, color: 'i', text: '🛠 Solución\n\n• Una solución por problema.' },
      { type: 'text', x: 266, y: 168, w: 250, h: 152, color: 'i', text: '📏 Métricas clave\n\n• ¿Qué números demuestran que funciona?' },
      { type: 'text', x: 532, y: 0, w: 250, h: 320, color: 'n', text: '💎 Propuesta de valor única\n\n• Mensaje claro y diferente.\n• ¿Por qué comprarte a ti?' },
      { type: 'text', x: 798, y: 0, w: 250, h: 152, color: 'a', text: '🛡 Ventaja injusta\n\n• Lo que no pueden copiarte fácil.' },
      { type: 'text', x: 798, y: 168, w: 250, h: 152, color: 'a', text: '📣 Canales\n\n• Camino hasta el cliente.' },
      { type: 'text', x: 1064, y: 0, w: 250, h: 320, color: 'q', text: '👥 Segmentos\n\n• Clientes objetivo.\n• Early adopters.' },
      { type: 'text', x: 0, y: 336, w: 641, h: 140, color: 'p', text: '💸 Costes\n\n• Adquisición, infraestructura, personas…' },
      { type: 'text', x: 673, y: 336, w: 641, h: 140, color: 'p', text: '💰 Ingresos\n\n• Modelo de ingresos, precio, margen.' },
    ],
  },
  {
    key: 'dafo',
    name: 'DAFO',
    desc: 'Fortalezas, debilidades, oportunidades y amenazas.',
    icon: 'fit',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 400, h: 52, text: 'Análisis DAFO', style: { size: 30, bold: true } },
      { type: 'text', x: 0, y: 0, w: 320, h: 230, color: 'a', text: '💪 Fortalezas (interno)\n\n• ¿Qué haces mejor que nadie?' },
      { type: 'text', x: 336, y: 0, w: 320, h: 230, color: 'p', text: '🩹 Debilidades (interno)\n\n• ¿Dónde flojeas hoy?' },
      { type: 'text', x: 0, y: 246, w: 320, h: 230, color: 'i', text: '🌱 Oportunidades (externo)\n\n• Tendencias y huecos del mercado.' },
      { type: 'text', x: 336, y: 246, w: 320, h: 230, color: 'q', text: '⛈ Amenazas (externo)\n\n• Competencia, regulación, riesgos.' },
    ],
  },
  {
    key: 'brainstorm',
    name: 'Lluvia de ideas',
    desc: 'Tema central con ramas enlazadas para divergir rápido.',
    icon: 'spark',
    blocks: [
      { type: 'idea', x: 380, y: 210, w: 260, h: 120, color: 'n', text: '💡 Tema central\n¿Sobre qué queremos generar ideas?' },
      { type: 'idea', x: 40, y: 0, w: 230, h: 110, text: 'Idea 1…' },
      { type: 'idea', x: 400, y: -40, w: 230, h: 110, text: 'Idea 2…' },
      { type: 'idea', x: 760, y: 0, w: 230, h: 110, text: 'Idea 3…' },
      { type: 'idea', x: 40, y: 430, w: 230, h: 110, text: 'Idea 4…' },
      { type: 'idea', x: 400, y: 470, w: 230, h: 110, text: 'Idea 5…' },
      { type: 'idea', x: 760, y: 430, w: 230, h: 110, text: 'Idea 6…' },
    ],
    links: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]],
  },
  {
    key: 'arch',
    name: 'Arquitectura de software',
    desc: 'Diagrama editable de componentes + decisiones y riesgos.',
    icon: 'code',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 620, h: 52, text: 'Arquitectura del sistema', style: { size: 30, bold: true } },
      {
        type: 'mermaid', x: 0, y: 0, w: 620, h: 440,
        text: 'flowchart LR\n  U[Usuario] --> W[Web / App]\n  W --> G[API Gateway]\n  G --> A[Auth]\n  G --> S[Servicio principal]\n  S --> D[(Base de datos)]\n  S --> C{{Cache}}\n  S --> Q[[Cola]]\n  Q --> K[Workers]\n  K --> E[Servicios externos]',
      },
      { type: 'text', x: 650, y: 0, w: 320, h: 210, color: 'i', text: '📐 Decisiones (ADR)\n\n• Decisión: …\n  Contexto: …\n  Consecuencias: …' },
      { type: 'text', x: 650, y: 230, w: 320, h: 210, color: 'q', text: '⚠️ Riesgos técnicos\n\n• Cuellos de botella, acoplamientos, deuda…' },
    ],
  },
  {
    key: 'mvp',
    name: 'De la idea al despliegue',
    desc: 'Pipeline de MVP: descubrir, validar, construir, medir y lanzar.',
    icon: 'play',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 680, h: 52, text: 'De la idea al despliegue', style: { size: 30, bold: true } },
      {
        type: 'mermaid', x: 0, y: 0, w: 680, h: 360,
        text: 'flowchart LR\n  I[Idea] --> D[Descubrimiento]\n  D --> V{Validado}\n  V -->|No| I\n  V -->|Si| M[Definir MVP]\n  M --> B[Construir]\n  B --> T[Medir]\n  T --> L{Aprendizaje}\n  L -->|Pivotar| I\n  L -->|Perseverar| R[Lanzamiento]\n  R --> O[Despliegue y monitorizacion]',
      },
      { type: 'text', x: 710, y: 0, w: 320, h: 170, color: 'n', text: '🎯 Definición de éxito\n\n• ¿Qué métrica valida el MVP?\n• ¿En cuánto tiempo?' },
      {
        type: 'table', x: 710, y: 190, w: 380, h: 220,
        rows: [['Hito', 'Fecha', 'Estado'], ['Entrevistas hechas', '', 'Por hacer'], ['MVP en producción', '', 'Por hacer'], ['Primeros 10 usuarios', '', 'Por hacer']],
      },
      { type: 'text', x: 0, y: 390, w: 680, h: 140, color: 'p', text: '🧪 Hipótesis a validar\n\n• Creemos que [usuario] tiene [problema] y pagaría por [solución].' },
    ],
  },
  {
    key: 'flow',
    name: 'Flujograma',
    desc: 'Proceso paso a paso con una decisión (inicio, pasos, sí/no, fin).',
    icon: 'flow',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 420, h: 52, text: 'Flujograma', style: { size: 28, bold: true } },
      { type: 'shape', x: 160, y: 0, w: 150, h: 60, shape: 'pill', text: 'Inicio' },
      { type: 'shape', x: 145, y: 130, w: 180, h: 72, shape: 'round', text: 'Primer paso' },
      { type: 'shape', x: 155, y: 270, w: 160, h: 110, shape: 'diamond', text: '¿Se cumple?' },
      { type: 'shape', x: 0, y: 450, w: 175, h: 72, shape: 'rect', text: 'Acción si SÍ' },
      { type: 'shape', x: 300, y: 450, w: 195, h: 72, shape: 'rect', text: 'Acción si NO' },
      { type: 'shape', x: 160, y: 580, w: 150, h: 60, shape: 'pill', text: 'Fin' },
    ],
    links: [[1, 2], [2, 3], { a: 3, b: 4, label: 'Sí', type: 'flow' }, { a: 3, b: 5, label: 'No', type: 'flow' }, [4, 6], [5, 6]],
  },
  {
    key: 'concept',
    name: 'Mapa conceptual',
    desc: 'Tema central con conceptos enlazados por relaciones con etiqueta.',
    icon: 'graph',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 460, h: 52, text: 'Mapa conceptual', style: { size: 28, bold: true } },
      { type: 'shape', x: 360, y: 250, w: 220, h: 104, shape: 'ellipse', text: 'Tema central', color: 'n' },
      { type: 'shape', x: 40, y: 40, w: 190, h: 92, shape: 'ellipse', text: 'Concepto A' },
      { type: 'shape', x: 710, y: 40, w: 190, h: 92, shape: 'ellipse', text: 'Concepto B' },
      { type: 'shape', x: 20, y: 470, w: 190, h: 92, shape: 'ellipse', text: 'Concepto C' },
      { type: 'shape', x: 730, y: 470, w: 190, h: 92, shape: 'ellipse', text: 'Concepto D' },
    ],
    links: [{ a: 1, b: 2, label: 'incluye' }, { a: 1, b: 3, label: 'incluye' }, { a: 1, b: 4, label: 'se relaciona' }, { a: 1, b: 5, label: 'se relaciona' }],
  },
  {
    key: 'rootcause',
    name: 'Causa–raíz (Ishikawa)',
    desc: 'Problema central y sus categorías de causa (espina de pescado).',
    icon: 'fit',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 500, h: 52, text: 'Análisis causa–raíz', style: { size: 28, bold: true } },
      { type: 'shape', x: 360, y: 250, w: 230, h: 104, shape: 'rect', text: '⚠️ Problema a resolver', color: 'q' },
      { type: 'shape', x: 40, y: 40, w: 190, h: 70, shape: 'round', text: '👥 Personas' },
      { type: 'shape', x: 40, y: 250, w: 190, h: 70, shape: 'round', text: '⚙️ Proceso' },
      { type: 'shape', x: 40, y: 460, w: 190, h: 70, shape: 'round', text: '🧰 Materiales' },
      { type: 'shape', x: 720, y: 40, w: 190, h: 70, shape: 'round', text: '🌡️ Entorno' },
      { type: 'shape', x: 720, y: 250, w: 190, h: 70, shape: 'round', text: '💻 Tecnología' },
      { type: 'shape', x: 720, y: 460, w: 190, h: 70, shape: 'round', text: '📏 Medición' },
    ],
    links: [{ a: 2, b: 1 }, { a: 3, b: 1 }, { a: 4, b: 1 }, { a: 5, b: 1 }, { a: 6, b: 1 }, { a: 7, b: 1 }],
  },
  {
    key: 'productq',
    name: 'Preguntas de producto',
    desc: 'Valida la idea de un producto respondiendo las preguntas clave: problema, cliente, competencia, momento, dinero y riesgo.',
    icon: 'bulb',
    blocks: [
      { type: 'freetext', x: 0, y: -64, w: 620, h: 52, text: 'Preguntas sobre la idea de producto', style: { size: 28, bold: true } },
      { type: 'shape', x: 310, y: 0, w: 300, h: 96, shape: 'ellipse', color: 'n', text: '💡 Mi idea de producto\n(escríbela en una frase)' },
      // Cada pregunta (forma) con su nota de respuesta debajo, conectadas en flujo.
      { type: 'shape', x: 20, y: 220, w: 270, h: 64, shape: 'round', text: '¿Qué problema resuelve?' },
      { type: 'text', x: 20, y: 315, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 325, y: 220, w: 270, h: 64, shape: 'round', text: '¿Para quién es? (cliente ideal)' },
      { type: 'text', x: 325, y: 315, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 630, y: 220, w: 270, h: 64, shape: 'round', text: '¿Cómo lo resuelven hoy? (competencia)' },
      { type: 'text', x: 630, y: 315, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 20, y: 480, w: 270, h: 64, shape: 'round', text: '¿Por qué ahora?' },
      { type: 'text', x: 20, y: 575, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 325, y: 480, w: 270, h: 64, shape: 'round', text: '¿Cómo gana dinero?' },
      { type: 'text', x: 325, y: 575, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 630, y: 480, w: 270, h: 64, shape: 'round', text: '¿Cuál es el mayor riesgo?' },
      { type: 'text', x: 630, y: 575, w: 270, h: 92, text: 'Respuesta…' },
      { type: 'shape', x: 350, y: 760, w: 220, h: 110, shape: 'diamond', text: '¿Vale la pena construirla?' },
      { type: 'shape', x: 90, y: 940, w: 280, h: 64, shape: 'pill', text: 'Sí → valida barato (landing + 10 entrevistas)' },
      { type: 'shape', x: 550, y: 940, w: 280, h: 64, shape: 'pill', text: 'No → pivota o aparca la idea', color: 'q' },
    ],
    links: [
      { a: 1, b: 2, label: 'problema', type: 'flow' }, [2, 3],
      { a: 1, b: 4, label: 'cliente', type: 'flow' }, [4, 5],
      { a: 1, b: 6, label: 'competencia', type: 'flow' }, [6, 7],
      { a: 1, b: 8, label: 'momento', type: 'flow' }, [8, 9],
      { a: 1, b: 10, label: 'negocio', type: 'flow' }, [10, 11],
      { a: 1, b: 12, label: 'riesgo', type: 'flow' }, [12, 13],
      { a: 1, b: 14, label: 'tras responder' },
      { a: 14, b: 15, label: 'Sí', type: 'flow' },
      { a: 14, b: 16, label: 'No', type: 'flow' },
    ],
  },
];

// Clona el contenido de un bloque para una plantilla, re-guardando los blobs (imágenes/PDF/
// resultado) para que la plantilla sea autónoma y no dependa del bloque original.
function cloneTplContent(content) {
  var c = JSON.parse(JSON.stringify(content || {}));
  var reBlob = function (ref) { return (typeof isBlobRef === 'function' && isBlobRef(ref)) ? storeBlob(resolveSrc(ref)) : ref; };
  if (c.images) c.images = c.images.map(function (it) { return typeof it === 'string' ? reBlob(it) : Object.assign({}, it, { src: reBlob(it.src) }); });
  if (c.pdf) c.pdf = reBlob(c.pdf);
  if (c.result && c.result.img) c.result.img = reBlob(c.result.img);
  return c;
}
function templateBlockContent(spec) {
  if (spec.content) return cloneTplContent(spec.content); // plantilla de usuario: contenido capturado
  if (spec.type === 'table') return { table: { rows: spec.rows || [['', ''], ['', '']] } };
  if (spec.type === 'freetext') {
    var st = defaultFreeStyle();
    if (spec.style) Object.keys(spec.style).forEach(function (k) { st[k] = spec.style[k]; });
    return { text: spec.text || '', style: st };
  }
  if (spec.type === 'mermaid') return { text: spec.text || '' };
  if (spec.type === 'idea') return { text: spec.text || '', rank: 'idea' };
  if (spec.type === 'shape') return { text: spec.text || '', shape: spec.shape || 'rect' };
  return { text: spec.text || '', images: [] };
}

// Coloca la plantilla debajo del contenido existente de la nota actual.
function templateOrigin(tpl) {
  var minY = 0;
  tpl.blocks.forEach(function (s) { if (s.y < minY) minY = s.y; });
  var maxY = 0, any = false;
  blocksOf(ui.currentNoteId).forEach(function (b) {
    any = true;
    if (b.y + (b.height || 0) > maxY) maxY = b.y + (b.height || 0);
  });
  return { x: 60, y: (any ? maxY + 110 : 90) - minY };
}

function insertTemplate(tpl, aiDesc) {
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre una nota primero.'); return; }
  pushUndo('Insertar plantilla');
  var o = templateOrigin(tpl);
  var t = now();
  var made = tpl.blocks.map(function (spec) {
    var b = {
      id: uid(),
      noteId: ui.currentNoteId,
      type: spec.type === 'idea' ? 'text' : spec.type,   // 'idea' pasa a nota clasificada como idea
      x: Math.round(o.x + spec.x),
      y: Math.round(o.y + spec.y),
      width: spec.w,
      height: spec.h,
      content: templateBlockContent(spec),
      createdAt: t,
      updatedAt: t,
    };
    if (spec.color) b.color = spec.color;
    if (spec.title) b.title = spec.title;
    data.blocks.push(b);
    return b;
  });
  (tpl.links || []).forEach(function (pair) {
    var ai, bi, extra = null;
    if (Array.isArray(pair)) { ai = pair[0]; bi = pair[1]; }             // built-in: [i, j]
    else if (pair && typeof pair === 'object') { ai = pair.a; bi = pair.b; extra = pair; } // usuario: {a,b,label,type,style}
    var a = made[ai], b = made[bi];
    if (!a || !b) return;
    var lnk = { id: uid(), noteId: a.noteId, a: a.id, b: b.id, createdAt: t };
    if (extra) { if (extra.label) lnk.label = extra.label; if (extra.type) lnk.type = extra.type; if (extra.style) lnk.style = extra.style; }
    data.links.push(lnk);
  });
  touchNote(ui.currentNoteId);
  logChange('Plantilla insertada', tpl.name);
  save();
  renderCanvas();
  centerViewOnTemplate(made);
  // Entrada escalonada de los bloques de la plantilla.
  made.forEach(function (nb, i) { cardEnterAnim(cardEl(nb.id), i * 45); });
  closeTemplates();
  if (aiDesc && aiDesc.trim()) aiFillTemplate(tpl, made, aiDesc.trim());
}

function centerViewOnTemplate(blocks) {
  if (!blocks.length) return;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  blocks.forEach(function (b) {
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  });
  var wrap = document.getElementById('canvas');
  if (!wrap) return;
  var r = wrap.getBoundingClientRect();
  var v = getView();
  // Ajusta el zoom para que quepa entera (con margen), sin pasar de 100%.
  var z = Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY));
  v.zoom = Math.max(0.2, z);
  v.x = (r.width - (minX + maxX) * v.zoom) / 2;
  v.y = (r.height - (minY + maxY) * v.zoom) / 2;
  applyView();
  saveViewDebounced();
}

// Convierte "🤝 Socios clave\n…" en "Socios clave" (clave estable para la IA).
function tplBoxTitle(text) {
  var first = (text || '').split('\n')[0] || '';
  return first.replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ¿¡]+/, '').trim();
}
// Rellena las cajas de texto de una plantilla recién insertada con contenido
// generado por IA a partir de la descripción del proyecto.
function aiFillTemplate(tpl, made, desc) {
  if (!aiReady()) { toast('Configura la IA (botón IA del topbar) para rellenar plantillas.', 'warn'); return; }
  var boxes = made.filter(function (b) {
    return (b.type === 'text' || b.type === 'idea') && b.content && (b.content.text || '').trim();
  });
  if (!boxes.length) { toast('Esta plantilla no tiene cajas de texto que rellenar.', 'warn'); return; }
  var titles = boxes.map(function (b) { return tplBoxTitle(b.content.text); });
  boxes.forEach(function (b) { var el = cardEl(b.id); if (el) el.classList.add('ai-busy'); });
  function clearBusy() { boxes.forEach(function (b) { var el = cardEl(b.id); if (el) el.classList.remove('ai-busy'); }); }
  toast('La IA está rellenando “' + tpl.name + '”…');
  callAI([
    { role: 'system', content: 'Rellenas plantillas de trabajo (canvas de negocio, DAFO, brainstorming…). Respondes SOLO con un objeto JSON válido, sin fences ni comentarios.' },
    { role: 'user', content: 'Plantilla: ' + tpl.name + '\nProyecto: ' + desc + '\n\nDevuelve un objeto JSON cuyas claves sean EXACTAMENTE estas: ' + JSON.stringify(titles) + '. El valor de cada clave: contenido concreto y específico para esa caja (2 a 4 líneas, cada una empezando por "• "), en el idioma de la descripción del proyecto. Nada genérico: usa el proyecto descrito.' },
  ]).then(function (res) {
    clearBusy();
    res = String(res || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    var map = null;
    try { map = JSON.parse(res); } catch (e) {
      var m = /\{[\s\S]*\}/.exec(res);
      if (m) { try { map = JSON.parse(m[0]); } catch (e2) {} }
    }
    if (!map || typeof map !== 'object') { toast('La IA no devolvió un JSON válido; la plantilla queda con las guías.', 'warn'); return; }
    var norm = {};
    Object.keys(map).forEach(function (k) { norm[k.toLowerCase().trim()] = map[k]; });
    pushUndo('IA: rellenar plantilla');
    var filled = 0;
    boxes.forEach(function (b) {
      var v = norm[tplBoxTitle(b.content.text).toLowerCase()];
      if (typeof v !== 'string' || !v.trim()) return;
      var firstLine = (b.content.text || '').split('\n')[0];
      b.content.text = firstLine + '\n\n' + v.trim();
      b.updatedAt = now();
      filled++;
    });
    if (!filled) { toast('La IA no encajó con las cajas de la plantilla.', 'warn'); return; }
    touchNote(boxes[0].noteId);
    logChange('IA: plantilla rellenada', tpl.name + ' · ' + filled + ' cajas');
    save();
    renderCanvas();
    toast('“' + tpl.name + '” rellenada (' + filled + ' cajas). Ctrl+Z para deshacer.', 'ok');
  }).catch(function (e) {
    clearBusy();
    toast('IA: ' + ((e && e.message) || e), 'warn');
  });
}

// ---------- Plantillas de usuario: guardar la selección para reutilizarla ----------
// Captura los bloques seleccionados (tipo, posición relativa, tamaño, color, título y
// contenido) y sus conexiones internas, y los guarda como plantilla en data.userTemplates.
function saveSelectionAsTemplate(idsArg) {
  var ids = ((idsArg && idsArg.length) ? idsArg : Object.keys(selectedIds)).filter(function (id) { return getBlockById(id); });
  if (!ids.length) { toast('Selecciona al menos un bloque para guardarlo como plantilla.', 'warn'); return; }
  var blocks = ids.map(getBlockById);
  var minX = Infinity, minY = Infinity;
  blocks.forEach(function (b) { if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y; });
  var idx = {}; ids.forEach(function (id, i) { idx[id] = i; });
  var specs = blocks.map(function (b) {
    var el = cardEl(b.id);
    var spec = {
      type: b.type,
      x: Math.round(b.x - minX),
      y: Math.round(b.y - minY),
      w: b.width || (el ? el.offsetWidth : 220),
      h: b.height || (el ? el.offsetHeight : 120),
      content: cloneTplContent(b.content),
    };
    if (b.color) spec.color = b.color;
    if (b.title) spec.title = b.title;
    return spec;
  });
  var noteId = blocks[0].noteId;
  var links = (data.links || []).filter(function (l) {
    return l.noteId === noteId && idx[l.a] != null && idx[l.b] != null; // solo conexiones internas a la selección
  }).map(function (l) {
    var o = { a: idx[l.a], b: idx[l.b] };
    if (l.label) o.label = l.label;
    if (l.type) o.type = l.type;
    if (l.style) o.style = l.style;
    return o;
  });
  // Nombre por defecto a partir del primer título o texto (renombrable luego en el panel).
  var base = '';
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].title) { base = blocks[i].title; break; }
    var tx = blocks[i].content && blocks[i].content.text;
    if (tx && tx.trim()) { base = tplBoxTitle(tx) || tx.split('\n')[0].trim(); break; }
  }
  var name = (base || 'Mi plantilla').trim().slice(0, 42);
  var tpl = {
    key: 'u_' + uid(), name: name, user: true, icon: 'layout',
    desc: blocks.length + (blocks.length === 1 ? ' bloque' : ' bloques') + (links.length ? ' · ' + links.length + (links.length === 1 ? ' conexión' : ' conexiones') : ''),
    blocks: specs, links: links, createdAt: now(),
  };
  data.userTemplates = data.userTemplates || [];
  data.userTemplates.push(tpl);
  logChange('Plantilla guardada', tpl.name + ' (' + blocks.length + ' bloques)');
  save();
  toastAction('Plantilla «' + tpl.name + '» guardada.', 'Abrir plantillas', function () { openTemplates(); }, 'ok');
}
// Guarda todos los bloques de un grupo como plantilla reutilizable.
function saveGroupAsTemplate(g) {
  if (!g || !(g.blockIds || []).length) { toast('El grupo está vacío.', 'warn'); return; }
  saveSelectionAsTemplate(g.blockIds.slice());
}
function deleteUserTemplate(tpl) {
  data.userTemplates = (data.userTemplates || []).filter(function (x) { return x.key !== tpl.key; });
  logChange('Plantilla eliminada', tpl.name);
  save();
  openTemplates(); // re-pinta el panel
}
function renameUserTemplateInline(tpl, nameEl) {
  var inp = h('input', { class: 'tpl-rename-input', value: tpl.name });
  inp.addEventListener('click', function (e) { e.stopPropagation(); });
  inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = tpl.name; inp.blur(); } });
  inp.addEventListener('blur', function () {
    tpl.name = inp.value.trim() || tpl.name;
    nameEl.textContent = tpl.name;
    if (inp.parentNode) inp.replaceWith(nameEl);
    save();
  });
  nameEl.replaceWith(inp); inp.focus(); inp.select();
}

function openTemplates() {
  closeTemplates();
  var overlay = h('div', { class: 'overlay', id: 'tplOverlay', onclick: function (e) { if (e.target === overlay) closeTemplates(); } });
  var panel = h('div', { class: 'log-panel tpl-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('layout'), 'Plantillas de canvas'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeTemplates }, icon('x'))
  );
  var aiDesc = h('input', {
    class: 'tpl-ai-input',
    placeholder: aiReady() ? 'Opcional: describe tu proyecto y la IA rellena las cajas…' : 'Configura la IA (botón IA) para rellenar plantillas automáticamente',
  });
  if (!aiReady()) aiDesc.disabled = true;
  var grid = h('div', { class: 'tpl-grid' });
  CANVAS_TEMPLATES.forEach(function (tpl) {
    grid.appendChild(h('button', { class: 'tpl-card', onclick: function () { insertTemplate(tpl, aiDesc.value); } },
      h('div', { class: 'tpl-icon' }, icon(tpl.icon)),
      h('div', { class: 'tpl-name' }, tpl.name),
      h('div', { class: 'tpl-desc' }, tpl.desc)
    ));
  });
  var body = h('div', { class: 'log-body' });
  body.appendChild(h('p', { class: 'tpl-hint' }, 'Se insertan como bloques normales en la nota actual: muévelos, edítalos y conéctalos como quieras. Guarda las tuyas seleccionando bloques → «Plantilla».'));
  var userTpls = data.userTemplates || [];
  if (userTpls.length) {
    body.appendChild(h('div', { class: 'tpl-sec-title' }, icon('star'), 'Mis plantillas'));
    var ug = h('div', { class: 'tpl-grid' });
    userTpls.slice().reverse().forEach(function (tpl) {
      var nameEl = h('div', { class: 'tpl-name' }, tpl.name);
      var tools = h('div', { class: 'tpl-tools' },
        h('button', { class: 'tpl-tool', title: 'Renombrar', onclick: function (e) { e.stopPropagation(); renameUserTemplateInline(tpl, nameEl); } }, icon('edit')),
        h('button', { class: 'tpl-tool tpl-del', title: 'Eliminar esta plantilla', onclick: function (e) { e.stopPropagation(); deleteUserTemplate(tpl); } }, icon('trash'))
      );
      ug.appendChild(h('div', { class: 'tpl-card tpl-user', title: 'Insertar en la nota actual', onclick: function () { insertTemplate(tpl, ''); } },
        tools,
        h('div', { class: 'tpl-icon' }, icon(tpl.icon || 'layout')),
        nameEl,
        h('div', { class: 'tpl-desc' }, tpl.desc || 'Plantilla propia')
      ));
    });
    body.appendChild(ug);
    body.appendChild(h('div', { class: 'tpl-sec-title' }, icon('layout'), 'Plantillas de canvas'));
  }
  body.appendChild(h('div', { class: 'tpl-ai-row' }, icon('spark'), aiDesc));
  body.appendChild(grid);
  panel.appendChild(head);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseTemplates);
}
function escCloseTemplates(e) { if (e.key === 'Escape') closeTemplates(); }
function closeTemplates() {
  var o = document.getElementById('tplOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseTemplates);
}
