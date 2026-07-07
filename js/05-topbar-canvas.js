/* tuNota — Topbar, lienzo (tarjetas), cuerpos por tipo y dibujo a mano.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Render: Topbar ----------
function renderTopbar() {
  var bar = document.getElementById('topbar');
  bar.innerHTML = '';
  var note = ui.currentNoteId ? getNote(ui.currentNoteId) : null;
  var sec = note ? getSection(note.sectionId) : null;
  var nb = sec ? getNotebook(sec.notebookId) : null;

  var crumb = h('div', { class: 'crumb' });
  if (nb) crumb.appendChild(h('span', {}, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
  if (sec) {
    crumb.appendChild(h('span', { class: 'sep' }, '/'));
    crumb.appendChild(h('span', {}, sec.name));
  }

  var title;
  if (note) {
    title = editable(h('div', { class: 'note-title' }, note.title), note.title, function (v) { rename('note', note.id, v); });
  } else {
    title = h('div', { class: 'note-title is-muted' }, 'tuNota');
  }

  var sidebarBtn = h('button', { class: 'icon-btn tb-sidebar-btn', title: 'Mostrar/ocultar panel', onclick: toggleSidebar }, icon('panel'));
  var left = h('div', { class: 'tb-left' }, sidebarBtn, crumb, title);
  var hint = h('div', { class: 'hint' }, icon('cursor'), 'Doble clic: nota \u00b7 Alt: men\u00fa \u00b7 Teclas t/f/i/c/p: crear \u00b7 F2: renombrar \u00b7 Espacio: arrastrar');
  var searchBtn = h('button', { class: 'icon-btn', title: 'Buscar en todo (Ctrl+K)', onclick: openSearch }, icon('search'));
  var tplBtn = h('button', { class: 'icon-btn', title: 'Plantillas de canvas (BMC, DAFO, arquitectura…)', onclick: openTemplates }, icon('layout'));
  var graphBtn = h('button', { class: 'icon-btn', title: 'Mapa de conocimiento (grafo)', onclick: openGraph }, icon('graph'));
  var importBtn = h('button', { class: 'icon-btn', title: 'Importar Markdown (.md) o PDF', onclick: openImport }, icon('download'));
  var kanBtn = h('button', { class: 'icon-btn', title: 'Kanban de ideas', onclick: openKanban }, icon('board'));
  var histBtn = h('button', { class: 'icon-btn', title: 'Historial de cambios', onclick: openLog }, icon('clock'));
  var backupBtn = h('button', { class: 'icon-btn', title: 'Copias de seguridad', onclick: openBackups }, icon('shield'));
  var integBtn = h('button', { class: 'icon-btn', title: 'Integraciones y versiones', onclick: openIntegrations }, icon('info'));
  var helpBtn = h('button', { class: 'icon-btn', title: 'Atajos de teclado (?)', onclick: openShortcuts }, icon('help'));
  var themeBtn = h('button', { class: 'icon-btn', title: 'Personalizar colores', onclick: openTheme }, icon('palette'));
  var ai = h('button', { class: 'ai-btn' + (aiReady() ? ' ready' : ''), title: aiReady() ? 'Asistente IA' : 'Configurar IA (API key)', onclick: openAI }, icon('spark'), 'IA');
  bar.appendChild(left);
  bar.appendChild(hint);
  bar.appendChild(searchBtn);
  bar.appendChild(tplBtn);
  bar.appendChild(graphBtn);
  bar.appendChild(importBtn);
  bar.appendChild(kanBtn);
  bar.appendChild(histBtn);
  bar.appendChild(backupBtn);
  bar.appendChild(themeBtn);
  bar.appendChild(helpBtn);
  bar.appendChild(integBtn);
  bar.appendChild(ai);
}

// ---------- Render: Canvas ----------
var canvasContentEl = null;
var topZ = 10;
var selectedIds = {};
var lastMouse = { x: 0, y: 0, over: false };

function renderCanvas() {
  var wrap = document.getElementById('canvas');
  wrap.innerHTML = '';
  canvasContentEl = null;
  clearSelection();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) {
    wrap.appendChild(emptyState());
    return;
  }
  var content = h('div', { class: 'canvas-content' });
  content.addEventListener('mousemove', function (e) { lastMouse.x = e.clientX; lastMouse.y = e.clientY; lastMouse.over = true; });
  content.addEventListener('mouseleave', function () { lastMouse.over = false; });
  attachMarquee(content);
  content.addEventListener('dblclick', function (e) {
    if (e.target !== content) return;
    createAt(e.clientX, e.clientY, 'text'); // doble click = nota
  });
  canvasContentEl = content;
  if (linkMode) content.classList.add('link-mode');
  var linkLayer = document.createElementNS(SVGNS, 'svg');
  linkLayer.setAttribute('class', 'link-layer');
  content.appendChild(linkLayer);
  wrap.appendChild(content);
  blocksOf(ui.currentNoteId).forEach(function (b) { content.appendChild(card(b)); });
  drawLinks();
  refreshSelectionUI();
  wrap.appendChild(buildZoomControl());
  applyView();
}

function emptyState() {
  return h(
    'div',
    { class: 'empty-state' },
    h('div', { class: 'empty-ico' }, icon('leaf')),
    h('p', { class: 'empty-title' }, 'Selecciona o crea una nota'),
    h('p', { class: 'empty-sub' }, 'Tus ideas viven dentro de libros y secciones, como un cuaderno tranquilo.')
  );
}

function quickCreate(type) {
  if (!ui.currentNoteId || !canvasContentEl) return null;
  var cx, cy;
  if (lastMouse.over) { cx = lastMouse.x; cy = lastMouse.y; }
  else {
    var wrap = document.getElementById('canvas');
    var r = wrap ? wrap.getBoundingClientRect() : null;
    cx = r ? r.left + r.width / 2 : 300;
    cy = r ? r.top + r.height / 2 : 240;
  }
  return createAt(cx, cy, type);
}
function createAt(clientX, clientY, type) {
  if (!ui.currentNoteId || !canvasContentEl) return null;
  var p = toContent(clientX, clientY);
  var x = Math.max(0, p.x - 8);
  var y = Math.max(0, p.y - 8);
  var b = addBlock(ui.currentNoteId, type || 'text', x, y);
  var el = card(b);
  canvasContentEl.appendChild(el);
  if (b.type === 'markdown') el.classList.add('editing-md'); // empezar en modo edici\u00f3n
  var ta = el.querySelector('textarea');
  if (ta) ta.focus();
  return b;
}

function card(b) {
  var meta = typeMeta(b.type);
  var isText = b.type === 'text' || b.type === 'idea';
  var isImage = b.type === 'image';
  var isMd = b.type === 'markdown';
  var isPdf = b.type === 'pdf';
  var isMermaid = b.type === 'mermaid';
  var isFree = b.type === 'freetext';
  var isDraw = b.type === 'draw';
  var isMono = b.type === 'code' || b.type === 'json' || b.type === 'curl' || b.type === 'python';
  var hasMedia = isText || isImage;
  var el = h('div', {
    class: 'card' + (meta.cls ? ' ' + meta.cls : '') + (b.color ? ' card-c-' + b.color : '') + (selectedIds[b.id] ? ' selected' : '') + (b.reminder && !b.reminder.done ? ' reminder-on' : '') + (b.important ? ' important' : ''),
    'data-id': b.id,
    style: { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px', zIndex: String(++topZ) },
  });

  var del = h('button', { class: 'card-del', title: 'Eliminar', onclick: function (e) { e.stopPropagation(); delete selectedIds[b.id]; deleteBlock(b.id); el.remove(); updateSelInfo(); } }, icon('trash'));
  var remActive = b.reminder && !b.reminder.done;
  var menuBtn = h('button', { class: 'card-menu', title: 'Opciones: importante, recordatorio, Kanban', onclick: function (e) { e.stopPropagation(); openCardMenu(b, menuBtn); } }, icon('more'));
  var head = h('div', { class: 'card-head' },
    icon(meta.icon),
    h('span', { class: 'card-label' }, meta.label),
    h('span', { class: 'card-spacer' })
  );
  if (b.important) head.appendChild(h('span', { class: 'card-imp-badge', title: 'Importante' }, icon('star')));
  if (remActive) head.appendChild(h('span', { class: 'card-remind-badge', title: fmtWhen(b.reminder.at) }, icon('clock'), fmtShort(b.reminder.at)));
  if (b.kanban) head.appendChild(h('span', { class: 'card-kanban-badge k-' + b.kanban, title: 'Kanban: ' + kanbanLabel(b.kanban) }, icon('board')));
  if (b.color && CARD_COLOR_LABEL[b.color]) head.appendChild(h('span', { class: 'card-cat-badge cat-' + b.color, title: 'Categor\u00eda: ' + CARD_COLOR_LABEL[b.color] }, CARD_COLOR_LABEL[b.color]));
  if (hasMedia) {
    head.appendChild(h('span', { class: 'card-imgs' }));
    if (isText) head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formatear texto (listas, vi\u00f1etas, saltos de l\u00ednea)', onclick: function (e) { e.stopPropagation(); formatCardText(b, el); } }, icon('format')));
    head.appendChild(h('button', { class: 'card-img-btn', title: 'Insertar imagen (o pega con Ctrl+V)', onclick: function (e) { e.stopPropagation(); pickImagesFor(b, el); } }, icon('image')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMd) {
    head.appendChild(h('button', { class: 'card-md-edit', title: 'Editar / previsualizar Markdown', onclick: function (e) { e.stopPropagation(); toggleMdEdit(b, el); } }, icon('edit')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isPdf) {
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana (calidad completa)', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMermaid) {
    head.appendChild(h('button', { class: 'card-mmd-move', title: 'Modo interactivo: mover / escalar objetos, editar texto y zoom', onclick: function (e) { e.stopPropagation(); toggleMmdMove(b, el); } }, icon('move')));
    head.appendChild(h('button', { class: 'card-mmd-edit', title: 'Editar / ver diagrama', onclick: function (e) { e.stopPropagation(); toggleMmdEdit(b, el); } }, icon('edit')));
    head.appendChild(h('button', { class: 'card-mmd-dl', title: 'Descargar diagrama (PNG)', onclick: function (e) { e.stopPropagation(); downloadMermaid(b, el); } }, icon('download')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMono && b.type !== 'python') {
    head.appendChild(h('button', { class: 'card-pop', title: b.type === 'curl' ? 'Abrir en ventana (ejecutar cURL)' : 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isFree) {
    head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formato: tama\u00f1o, color, sombra, subrayado', onclick: function (e) { e.stopPropagation(); openFreeFormat(b, el); } }, icon('format')));
  }
  head.appendChild(menuBtn);
  head.appendChild(del);

  el.appendChild(head);
  if (b.type === 'table') appendChild(el, tableBody(b));
  else if (isMono) appendChild(el, monoBody(b));
  else if (isImage) appendChild(el, imageBody(b));
  else if (isMd) appendChild(el, markdownBody(b));
  else if (isPdf) appendChild(el, pdfBody(b));
  else if (isMermaid) appendChild(el, mermaidBody(b));
  else if (isFree) appendChild(el, freeTextBody(b));
  else if (isDraw) appendChild(el, drawBody(b));
  else appendChild(el, textBody(b));

  attachDragHandler(head, el, b);
  var anchor = h('button', { class: 'card-link-anchor', title: 'Arrastra hasta otro bloque para conectarlos' });
  anchor.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); startLinkDrag(b, e); });
  anchor.addEventListener('click', function (e) { e.stopPropagation(); });
  el.appendChild(anchor);
  if (hasMedia || isMd || isPdf || isMermaid || (isMono && b.type !== 'python')) {
    head.addEventListener('dblclick', function (e) {
      if (e.target.closest('.card-del') || e.target.closest('.card-pop') || e.target.closest('.card-menu') || e.target.closest('.card-md-edit') || e.target.closest('.card-mmd-edit') || e.target.closest('.card-mmd-dl') || e.target.closest('.card-mmd-move')) return;
      popOut(b.id);
    });
    if (hasMedia) updateCardMedia(el, b);
  }
  if (isImage) {
    var grip = h('span', { class: 'img-card-resize', title: 'Arrastra para redimensionar (mantiene proporci\u00f3n)' });
    grip.addEventListener('mousedown', function (e) { startImageCardResize(e, b, el); });
    el.appendChild(grip);
  }
  updateCardPoppedState(el, b);

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      if (!el.isConnected) return;
      b.width = el.offsetWidth;
      b.height = el.offsetHeight;
      debouncedSave();
      drawLinks();
    });
    ro.observe(el);
  }
  return el;
}

// ---------- Cuerpos por tipo ----------
function textBody(b) {
  var isIdea = b.type === 'idea';
  b.content = b.content || {};
  var ta = h('textarea', { class: 'card-ta', placeholder: isIdea ? 'Tu idea r\u00e1pida...' : 'Escribe...' });
  ta.value = b.content.text || '';
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange(isIdea ? 'Idea editada' : 'Nota editada', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) {
      e.preventDefault();
      var el = ta.closest('.card');
      addImagesToBlock(b, files, function () { if (el) updateCardMedia(el, b); });
    }
  });
  return [ta, h('div', { class: 'card-media' })];
}
function applyFreeStyle(ta, st) {
  st = st || {};
  ta.style.fontSize = (st.size || 20) + 'px';
  ta.style.color = st.color || '';
  ta.style.fontWeight = st.bold ? '700' : '400';
  ta.style.fontStyle = st.italic ? 'italic' : 'normal';
  ta.style.textDecoration = st.underline ? 'underline' : 'none';
  ta.style.textShadow = st.shadow ? '0 2px 6px rgba(0,0,0,0.35)' : 'none';
  ta.style.textAlign = st.align || 'left';
  ta.style.lineHeight = '1.3';
}
function autoGrowFree(ta) {
  var card = ta.closest('.card');
  ta.style.height = 'auto';
  var hh = Math.max(ta.scrollHeight, 28);
  ta.style.height = hh + 'px';
  if (card) { card.style.height = 'auto'; }
}
function freeTextBody(b) {
  b.content = b.content || {};
  if (!b.content.style) b.content.style = defaultFreeStyle();
  var ta = h('textarea', { class: 'card-ta free-ta', rows: '1', placeholder: 'Texto\u2026', spellcheck: 'false' });
  ta.value = b.content.text || '';
  applyFreeStyle(ta, b.content.style);
  ta.addEventListener('input', function () { b.content.text = ta.value; autoGrowFree(ta); touchNote(b.noteId); debouncedSave(); drawLinks(); });
  ta.addEventListener('change', function () { logChange('Texto editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  setTimeout(function () { autoGrowFree(ta); }, 0);
  return [ta];
}
function openFreeFormat(b, el) {
  closeCardMenu();
  var ta = el.querySelector('.free-ta');
  if (!ta) return;
  b.content.style = b.content.style || defaultFreeStyle();
  var st = b.content.style;
  var pop = h('div', { class: 'free-format-pop' });
  pop.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  function persist(logMsg) { applyFreeStyle(ta, st); autoGrowFree(ta); touchNote(b.noteId); if (logMsg) logChange(logMsg, ''); save(); drawLinks(); }
  // Tama\u00f1o
  var size = h('input', { type: 'range', min: '12', max: '72', step: '1', value: String(st.size || 20), class: 'free-size' });
  size.addEventListener('input', function () { st.size = +size.value; sizeLbl.textContent = size.value + 'px'; persist(); });
  var sizeLbl = h('span', { class: 'free-size-lbl' }, (st.size || 20) + 'px');
  pop.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Tama\u00f1o'), size, sizeLbl));
  // Color
  var color = h('input', { type: 'color', value: st.color ? toHex(st.color) : toHex(cssVarValue('--fg')), class: 'free-color' });
  color.addEventListener('input', function () { st.color = color.value; persist(); });
  var clearColor = h('button', { class: 'free-chip', title: 'Color por defecto', onclick: function () { st.color = ''; persist('Formato de texto'); } }, 'Auto');
  pop.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Color'), color, clearColor));
  // Toggles
  function toggle(label, key, title) {
    var btn = h('button', { class: 'free-chip' + (st[key] ? ' on' : ''), title: title }, label);
    btn.addEventListener('click', function () { st[key] = !st[key]; btn.classList.toggle('on', st[key]); persist('Formato de texto'); });
    return btn;
  }
  pop.appendChild(h('div', { class: 'free-row' },
    toggle('B', 'bold', 'Negrita'),
    toggle('i', 'italic', 'Cursiva'),
    toggle('U', 'underline', 'Subrayado'),
    toggle('S', 'shadow', 'Sombra')
  ));
  // Alineaci\u00f3n
  var aligns = ['left', 'center', 'right'];
  var alignRow = h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Alinear'));
  aligns.forEach(function (a) {
    var btn = h('button', { class: 'free-chip' + (st.align === a ? ' on' : ''), title: a }, a === 'left' ? '\u2190' : (a === 'center' ? '\u2194' : '\u2192'));
    btn.addEventListener('click', function () { st.align = a; alignRow.querySelectorAll('.free-chip').forEach(function (x) { x.classList.remove('on'); }); btn.classList.add('on'); persist('Formato de texto'); });
    alignRow.appendChild(btn);
  });
  pop.appendChild(alignRow);
  el.appendChild(pop);
  var close = function (ev) { if (!pop.contains(ev.target) && !ev.target.closest('.card-fmt-btn')) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(function () { document.addEventListener('mousedown', close, true); }, 0);
}
// ---------- Dibujo a mano (Apple Pencil / mouse / t\u00e1ctil) ----------
function drawBody(b) {
  b.content = b.content || {};
  if (!Array.isArray(b.content.strokes)) b.content.strokes = [];
  if (!b.content.color) b.content.color = '#33302b';
  if (!b.content.size) b.content.size = 3;
  var wrap = h('div', { class: 'draw-wrap' });
  var canvas = h('canvas', { class: 'draw-canvas' });
  var ctx = canvas.getContext('2d');
  var state = { drawing: false, cur: null, erase: false, dpr: window.devicePixelRatio || 1 };

  function resize() {
    var rect = wrap.getBoundingClientRect();
    var w = Math.max(20, rect.width), hh = Math.max(20, rect.height);
    state.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(hh * state.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = hh + 'px';
    redraw();
  }
  function drawStroke(s) {
    if (!s.points || s.points.length === 0) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = s.color;
    if (s.points.length === 1) {
      var p0 = s.points[0];
      ctx.beginPath(); ctx.fillStyle = s.color;
      ctx.arc(p0.x * canvas.width, p0.y * canvas.height, Math.max(0.5, (s.size * (p0.p || 1)) / 2) * state.dpr, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (var i = 1; i < s.points.length; i++) {
      var a = s.points[i - 1], c = s.points[i];
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.5, s.size * ((a.p || 1) + (c.p || 1)) / 2) * state.dpr;
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(c.x * canvas.width, c.y * canvas.height);
      ctx.stroke();
    }
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    b.content.strokes.forEach(drawStroke);
    if (state.cur) drawStroke(state.cur);
  }
  function ptFrom(e) {
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left) / rect.width;
    var py = (e.clientY - rect.top) / rect.height;
    var pr = (e.pointerType === 'pen') ? (e.pressure || 0.5) : (e.pressure && e.pressure !== 0.5 ? e.pressure : 1);
    return { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)), p: pr };
  }
  function down(e) {
    if (e.button != null && e.button !== 0) return;
    e.stopPropagation();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    state.drawing = true;
    state.erase = e.button === 2 || state.forceErase;
    if (state.erase) { eraseAt(ptFrom(e)); return; }
    state.cur = { color: b.content.color, size: b.content.size, points: [ptFrom(e)] };
    redraw();
  }
  function move(e) {
    if (!state.drawing) return;
    e.stopPropagation();
    var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    if (state.erase) { for (var k = 0; k < evs.length; k++) eraseAt(ptFrom(evs[k])); return; }
    for (var i = 0; i < evs.length; i++) state.cur.points.push(ptFrom(evs[i]));
    redraw();
  }
  function up(e) {
    if (!state.drawing) return;
    e.stopPropagation();
    state.drawing = false;
    if (state.cur && state.cur.points.length) { b.content.strokes.push(state.cur); }
    state.cur = null;
    touchNote(b.noteId); logChange('Dibujo actualizado', ''); save();
    redraw();
  }
  function eraseAt(pt) {
    var before = b.content.strokes.length;
    b.content.strokes = b.content.strokes.filter(function (s) {
      return !s.points.some(function (q) { return Math.hypot(q.x - pt.x, q.y - pt.y) < 0.03; });
    });
    if (b.content.strokes.length !== before) { redraw(); debouncedSave(); }
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.style.touchAction = 'none';

  // Barra de herramientas
  var colorInp = h('input', { type: 'color', class: 'draw-color', value: b.content.color, title: 'Color' });
  colorInp.addEventListener('input', function () { b.content.color = colorInp.value; debouncedSave(); });
  colorInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var sizeInp = h('input', { type: 'range', class: 'draw-size', min: '1', max: '24', value: String(b.content.size), title: 'Grosor' });
  sizeInp.addEventListener('input', function () { b.content.size = +sizeInp.value; debouncedSave(); });
  sizeInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var eraseBtn = h('button', { class: 'draw-tool', title: 'Borrador (o clic derecho)' }, icon('eraser'));
  eraseBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  eraseBtn.addEventListener('click', function (e) { e.stopPropagation(); state.forceErase = !state.forceErase; eraseBtn.classList.toggle('on', state.forceErase); });
  var clearBtn = h('button', { class: 'draw-tool', title: 'Limpiar todo' }, icon('trash'));
  clearBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  clearBtn.addEventListener('click', function (e) { e.stopPropagation(); if (!b.content.strokes.length) return; b.content.strokes = []; state.cur = null; redraw(); touchNote(b.noteId); logChange('Dibujo borrado', ''); save(); });
  var toolbar = h('div', { class: 'draw-toolbar' }, colorInp, sizeInp, eraseBtn, clearBtn);

  wrap.appendChild(canvas);
  wrap.appendChild(toolbar);
  if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (canvas.isConnected) resize(); }); ro.observe(wrap); }
  setTimeout(resize, 0);
  return [wrap];
}
function imageBody(b) {
  b.content = b.content || {};
  b.content.images = b.content.images || [];
  var media = h('div', { class: 'card-media img-media', tabindex: '0' });
  media.addEventListener('mousedown', function (e) { if (e.target === media) media.focus(); });
  media.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) {
      e.preventDefault(); e.stopPropagation();
      var el = media.closest('.card');
      addImagesToBlock(b, files, function () { if (el) { updateCardMedia(el, b); drawLinks(); } });
    }
  });
  return [media];
}
