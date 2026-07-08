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
];

function templateBlockContent(spec) {
  if (spec.type === 'table') return { table: { rows: spec.rows || [['', ''], ['', '']] } };
  if (spec.type === 'freetext') {
    var st = defaultFreeStyle();
    if (spec.style) Object.keys(spec.style).forEach(function (k) { st[k] = spec.style[k]; });
    return { text: spec.text || '', style: st };
  }
  if (spec.type === 'mermaid') return { text: spec.text || '' };
  if (spec.type === 'idea') return { text: spec.text || '' };
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

function insertTemplate(tpl) {
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre una nota primero.'); return; }
  pushUndo('Insertar plantilla');
  var o = templateOrigin(tpl);
  var t = now();
  var made = tpl.blocks.map(function (spec) {
    var b = {
      id: uid(),
      noteId: ui.currentNoteId,
      type: spec.type,
      x: Math.round(o.x + spec.x),
      y: Math.round(o.y + spec.y),
      width: spec.w,
      height: spec.h,
      content: templateBlockContent(spec),
      createdAt: t,
      updatedAt: t,
    };
    if (spec.color) b.color = spec.color;
    data.blocks.push(b);
    return b;
  });
  (tpl.links || []).forEach(function (pair) {
    var a = made[pair[0]], b = made[pair[1]];
    if (a && b) data.links.push({ id: uid(), noteId: a.noteId, a: a.id, b: b.id, createdAt: t });
  });
  touchNote(ui.currentNoteId);
  logChange('Plantilla insertada', tpl.name);
  save();
  renderCanvas();
  centerViewOnTemplate(made);
  // Entrada escalonada de los bloques de la plantilla.
  made.forEach(function (nb, i) { cardEnterAnim(cardEl(nb.id), i * 45); });
  closeTemplates();
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

function openTemplates() {
  closeTemplates();
  var overlay = h('div', { class: 'overlay', id: 'tplOverlay', onclick: function (e) { if (e.target === overlay) closeTemplates(); } });
  var panel = h('div', { class: 'log-panel tpl-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('layout'), 'Plantillas de canvas'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeTemplates }, icon('x'))
  );
  var grid = h('div', { class: 'tpl-grid' });
  CANVAS_TEMPLATES.forEach(function (tpl) {
    grid.appendChild(h('button', { class: 'tpl-card', onclick: function () { insertTemplate(tpl); } },
      h('div', { class: 'tpl-icon' }, icon(tpl.icon)),
      h('div', { class: 'tpl-name' }, tpl.name),
      h('div', { class: 'tpl-desc' }, tpl.desc)
    ));
  });
  var body = h('div', { class: 'log-body' },
    h('p', { class: 'tpl-hint' }, 'Se insertan como bloques normales en la nota actual: muévelos, edítalos y conéctalos como quieras.'),
    grid
  );
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
