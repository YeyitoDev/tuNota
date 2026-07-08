/* tuNota — Helper DOM h(), iconos SVG, colores de tarjeta, edición en línea y sidebar colapsable.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Helper DOM ----------
function h(tag, props) {
  var e = document.createElement(tag);
  if (props) {
    for (var k in props) {
      var v = props[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
  }
  for (var i = 2; i < arguments.length; i++) appendChild(e, arguments[i]);
  return e;
}
function appendChild(e, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) {
    c.forEach(function (x) { appendChild(e, x); });
    return;
  }
  e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
}

// ---------- Iconos ----------
var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
var I = {
  chevron: S + '<polyline points="9 18 15 12 9 6"/></svg>',
  chevronDown: S + '<polyline points="6 9 12 15 18 9"/></svg>',
  plus: S + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: S + '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  folderPlus: S + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
  file: S + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  bulb: S + '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  spark: S + '<path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2z"/></svg>',
  cursor: S + '<path d="M5 3l6 16 2-7 7-2z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 4C9.5 4 4 9.3 4 16.6c0 .9.1 1.8.4 2.6.6-3.6 2.6-7 7.2-9.7-3.7 3.3-5.5 6.8-6.1 10.7C13 21.2 20 16.4 20 8c0-1.5-.3-3-.9-4z"/></svg>',
  clock: S + '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  bell: S + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  bellRing: S + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M2.5 7a5 5 0 0 1 1.7-3.2"/><path d="M21.5 7a5 5 0 0 0-1.7-3.2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  star: S + '<polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.3 21 12 17.6 5.7 21 7 14.1 2 9.3 8.9 8.6 12 2"/></svg>',
  board: S + '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="5" height="7" rx="1"/></svg>',
  link: S + '<path d="M9 12a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M15 12a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
  book: S + '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  fit: S + '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  chevronL: S + '<polyline points="15 18 9 12 15 6"/></svg>',
  x: S + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  image: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>',
  popout: S + '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
  info: S + '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>',
  code: S + '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  braces: S + '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>',
  terminal: S + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  table: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
  format: S + '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
  download: S + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  eye: S + '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit: S + '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  panel: S + '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>',
  graph: S + '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="7" r="2.5"/><circle cx="12" cy="17" r="2.5"/><circle cx="12" cy="12" r="3"/><line x1="7" y1="7" x2="9.5" y2="10.5"/><line x1="17" y1="8" x2="14.5" y2="10.5"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="11" y1="14.5" x2="12" y2="15"/></svg>',
  move: S + '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  palette: S + '<circle cx="13.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.2" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.5 1.9-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/></svg>',
  type: S + '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  play: S + '<polygon points="6 4 20 12 6 20 6 4"/></svg>',
  python: S + '<path d="M12 3c-3 0-4 1.2-4 3v2h5v1H6c-1.8 0-3 1.2-3 4s1.2 4 3 4h2v-2.2c0-1.9 1.4-3.3 3.3-3.3h3.4c1.7 0 3-1.4 3-3.1V6c0-1.8-1-3-4-3z"/><circle cx="9.5" cy="6" r="0.8" fill="currentColor"/></svg>',
  key: S + '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l8-8"/><path d="M15.5 7.5l2 2"/><path d="M18 5l2 2"/></svg>',
  send: S + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  pencil: S + '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  shield: S + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  upload: S + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  eraser: S + '<path d="M20 20H7L3 16a2 2 0 0 1 0-3L13 3a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8"/><line x1="8" y1="20" x2="20" y2="20"/></svg>',
  layout: S + '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  flow: S + '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M10 6h7a1 1 0 0 1 1 1v8"/><polyline points="15.5 12.5 18 15 20.5 12.5"/></svg>',
  copy: S + '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  alignL: S + '<line x1="4" y1="3" x2="4" y2="21"/><rect x="8" y="6" width="11" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/></svg>',
  alignT: S + '<line x1="3" y1="4" x2="21" y2="4"/><rect x="6" y="8" width="4" height="11" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/></svg>',
  distH: S + '<line x1="4" y1="3" x2="4" y2="21"/><line x1="20" y1="3" x2="20" y2="21"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
  distV: S + '<line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="20" x2="21" y2="20"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
  search: S + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>',
  help: S + '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-2.9 2.6-2.9 4"/><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none"/></svg>',
};
function icon(name, cls) {
  return h('span', { class: 'icon' + (cls ? ' ' + cls : ''), html: I[name] || '' });
}
var TYPE_META = {
  text: { label: 'Nota', icon: 'grip', cls: '' },
  idea: { label: 'Idea', icon: 'bulb', cls: 'idea' },
  freetext: { label: 'Texto', icon: 'type', cls: 'freetext' },
  code: { label: 'C\u00f3digo', icon: 'code', cls: 'code' },
  json: { label: 'JSON', icon: 'braces', cls: 'code' },
  curl: { label: 'cURL', icon: 'terminal', cls: 'code' },
  python: { label: 'Python', icon: 'python', cls: 'code' },
  image: { label: 'Imagen', icon: 'image', cls: 'image' },
  markdown: { label: 'Markdown', icon: 'format', cls: 'md' },
  mermaid: { label: 'Mermaid', icon: 'graph', cls: 'mmd' },
  pdf: { label: 'PDF', icon: 'file', cls: 'pdf' },
  table: { label: 'Tabla', icon: 'table', cls: 'table' },
  draw: { label: 'Dibujo', icon: 'pencil', cls: 'draw' },
};
function typeMeta(t) { return TYPE_META[t] || TYPE_META.text; }
// Atajos de una tecla para crear bloques bajo el cursor
var QUICK_KEYS = {
  t: 'text', f: 'freetext', i: 'idea', b: 'table', c: 'code',
  p: 'python', j: 'json', u: 'curl', m: 'markdown', d: 'mermaid', x: 'image', k: 'draw',
};

// ---------- Colores / categor\u00edas de tarjeta ----------
var CARD_COLORS = [
  ['', 'Sin color'],
  ['q', 'Pregunta'],
  ['a', 'Respuesta'],
  ['p', 'Pendiente'],
  ['i', 'Info'],
  ['n', 'Destacado'],
];
var CARD_COLOR_LABEL = {};
CARD_COLORS.forEach(function (c) { if (c[0]) CARD_COLOR_LABEL[c[0]] = c[1]; });
function setCardColor(b, key) {
  b.color = key || '';
  touchNote(b.noteId);
  logChange('Color de tarjeta', key ? CARD_COLOR_LABEL[key] : 'Sin color');
  save();
  applyCardColor(b, document.querySelector('.card[data-id="' + b.id + '"]'));
}
function applyCardColor(b, el) {
  if (!el) return;
  el.className = el.className.replace(/\bcard-c-\w+\b/g, '').replace(/\s{2,}/g, ' ').trim();
  if (b.color) el.classList.add('card-c-' + b.color);
  var head = el.querySelector('.card-head');
  if (!head) return;
  var old = head.querySelector('.card-cat-badge');
  if (old) old.remove();
  if (b.color && CARD_COLOR_LABEL[b.color]) {
    var badge = h('span', { class: 'card-cat-badge cat-' + b.color, title: 'Categor\u00eda: ' + CARD_COLOR_LABEL[b.color] }, CARD_COLOR_LABEL[b.color]);
    var ref = head.querySelector('.card-kanban-badge') || head.querySelector('.card-remind-badge') || head.querySelector('.card-imp-badge') || head.querySelector('.card-spacer');
    if (ref) head.insertBefore(badge, ref.nextSibling); else head.appendChild(badge);
  }
}

// ---------- Edici\u00f3n en l\u00ednea ----------
function editable(node, value, onCommit) {
  node.title = 'Doble click para renombrar';
  node.addEventListener('dblclick', function (e) {
    e.stopPropagation();
    var input = h('input', { class: 'inline-edit', value: value });
    node.replaceWith(input);
    input.focus();
    input.select();
    var done = false;
    var commit = function () {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (input.isConnected) input.replaceWith(node);
      if (v && v !== value) onCommit(v);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('click', function (ev) { ev.stopPropagation(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        done = true;
        if (input.isConnected) input.replaceWith(node);
      }
    });
  });
  return node;
}

// ---------- Sidebar: colapsar / expandir ----------
function applySidebar() {
  var app = document.getElementById('app');
  if (app) app.classList.toggle('sidebar-collapsed', !!ui.sidebarCollapsed);
}
function toggleSidebar() {
  ui.sidebarCollapsed = !ui.sidebarCollapsed;
  writeLS(LS_UI, JSON.stringify(ui));
  applySidebar();
  drawLinks();
}

// Animación de entrada de una tarjeta recién creada (con retardo opcional
// para escalonar plantillas). Se limpia sola al terminar.
function cardEnterAnim(el, delayMs) {
  if (!el) return;
  if (delayMs) el.style.animationDelay = delayMs + 'ms';
  el.classList.add('card-enter');
  el.addEventListener('animationend', function () {
    el.classList.remove('card-enter');
    el.style.animationDelay = '';
  }, { once: true });
}

// ---------- Toast (aviso breve no bloqueante) ----------
function toast(msg, kind) {
  var old = document.getElementById('appToast');
  if (old) old.remove();
  var el = h('div', { class: 'app-toast' + (kind ? ' ' + kind : ''), id: 'appToast' }, msg);
  document.body.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 10);
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 300);
  }, 3400);
}
