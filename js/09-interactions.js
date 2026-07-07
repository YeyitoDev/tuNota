/* tuNota — Interacciones del lienzo: arrastre, marquee, conexiones, zoom/pan y menú radial.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Arrastre (con grupo) ----------
function attachDragHandler(head, el, b) {
  head.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('.card-del') || e.target.closest('.card-pop') || e.target.closest('.card-menu')) return;
    e.preventDefault();
    el.style.zIndex = String(++topZ);
    if (!selectedIds[b.id]) {
      if (!e.shiftKey) clearSelection();
      selectedIds[b.id] = true;
      refreshSelectionUI();
    }
    var groupIds = Object.keys(selectedIds).filter(function (id) { return getBlockById(id); });
    if (groupIds.indexOf(b.id) < 0) groupIds.push(b.id);
    var single = groupIds.length <= 1;
    var starts = {};
    groupIds.forEach(function (id) { var blk = getBlockById(id); starts[id] = { x: blk.x, y: blk.y }; });
    var sx = e.clientX, sy = e.clientY, moved = false, dropEl = null;
    var findTarget = function (cx, cy) {
      el.style.pointerEvents = 'none';
      var under = document.elementFromPoint(cx, cy);
      el.style.pointerEvents = '';
      var c = under && under.closest ? under.closest('.card') : null;
      return c && c !== el ? c : null;
    };
    var move = function (ev) {
      moved = true;
      var z = getView().zoom || 1;
      var ddx = (ev.clientX - sx) / z, ddy = (ev.clientY - sy) / z;
      groupIds.forEach(function (id) {
        var blk = getBlockById(id); if (!blk) return;
        blk.x = Math.max(0, starts[id].x + ddx);
        blk.y = Math.max(0, starts[id].y + ddy);
        var cel = cardEl(id);
        if (cel) { cel.style.left = blk.x + 'px'; cel.style.top = blk.y + 'px'; }
      });
      drawLinks();
      if (single) {
        var t = findTarget(ev.clientX, ev.clientY);
        if (t !== dropEl) {
          if (dropEl) dropEl.classList.remove('merge-target');
          dropEl = t;
          if (dropEl) dropEl.classList.add('merge-target');
        }
      }
    };
    var up = function (ev) {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (dropEl) dropEl.classList.remove('merge-target');
      if (single && moved) {
        var target = findTarget(ev.clientX, ev.clientY);
        if (target && target.getAttribute('data-id')) { mergeBlocks(target.getAttribute('data-id'), b.id); return; }
      }
      groupIds.forEach(function (id) { var blk = getBlockById(id); if (blk) { blk.x = Math.round(blk.x); blk.y = Math.round(blk.y); } });
      save();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

// ---------- Selecci\u00f3n m\u00faltiple (marquee) ----------
function clearSelection() { selectedIds = {}; refreshSelectionUI(); }
function refreshSelectionUI() {
  if (canvasContentEl) {
    Array.prototype.forEach.call(canvasContentEl.querySelectorAll('.card'), function (el) {
      el.classList.toggle('selected', !!selectedIds[el.getAttribute('data-id')]);
    });
  }
  updateSelInfo();
}
function updateSelInfo() {
  var n = Object.keys(selectedIds).length;
  var bar = document.getElementById('selBar');
  if (n < 1) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = h('div', { id: 'selBar', class: 'sel-bar' },
      h('span', { class: 'sel-count' }, ''),
      h('button', { class: 'sel-del', title: 'Eliminar selecci\u00f3n', onclick: deleteSelected }, icon('trash'), 'Eliminar'));
    document.body.appendChild(bar);
  }
  bar.querySelector('.sel-count').textContent = n + (n > 1 ? ' seleccionados' : ' seleccionado');
}
function deleteSelected() {
  var ids = Object.keys(selectedIds);
  if (!ids.length) return;
  if (ids.length > 1 && !window.confirm('\u00bfEliminar ' + ids.length + ' elementos seleccionados?')) return;
  pushUndo('Eliminar selecci\u00f3n');
  ids.forEach(function (id) {
    data.blocks = data.blocks.filter(function (x) { return x.id !== id; });
    var cel = cardEl(id); if (cel) cel.remove();
  });
  dropLinksFor(ids);
  logChange('Selecci\u00f3n eliminada', ids.length + ' elementos');
  selectedIds = {};
  updateSelInfo();
  drawLinks();
  save();
}
function selectInRect(left, top, w, hgt, additive, base) {
  var rl = left, rt = top, rr = left + w, rb = top + hgt;
  var next = additive ? Object.assign({}, base) : {};
  blocksOf(ui.currentNoteId).forEach(function (b) {
    var bl = b.x, bt = b.y, br = b.x + (b.width || 200), bb = b.y + (b.height || 120);
    if (!(br < rl || bl > rr || bb < rt || bt > rb)) next[b.id] = true;
  });
  selectedIds = next;
  refreshSelectionUI();
}

// ---------- Conexiones entre bloques (relaciones) ----------
var SVGNS = 'http://www.w3.org/2000/svg';
var linkMode = false;
var linkDrag = null;
function setLinkMode(on) {
  if (linkMode === on) return;
  linkMode = on;
  if (canvasContentEl) canvasContentEl.classList.toggle('link-mode', on);
  var hint = document.getElementById('linkHint');
  if (on && !hint && ui.currentNoteId) {
    document.body.appendChild(h('div', { class: 'link-hint', id: 'linkHint' }, icon('link'), 'Conectar: arrastra desde el punto lateral de un bloque hasta otro'));
  } else if (!on && hint) {
    hint.remove();
  }
}
function centerOf(b) {
  var el = cardEl(b.id);
  var w = el ? el.offsetWidth : (b.width || 200);
  var hh = el ? el.offsetHeight : (b.height || 120);
  return { x: b.x + w / 2, y: b.y + hh / 2 };
}
function linkPathD(p1, p2) {
  var dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.4);
  return 'M' + p1.x + ',' + p1.y + ' C' + (p1.x + dx) + ',' + p1.y + ' ' + (p2.x - dx) + ',' + p2.y + ' ' + p2.x + ',' + p2.y;
}
function drawLinks() {
  if (!canvasContentEl) return;
  var svg = canvasContentEl.querySelector('.link-layer');
  if (!svg) return;
  var maxX = 600, maxY = 400;
  blocksOf(ui.currentNoteId).forEach(function (b) {
    var el = cardEl(b.id);
    maxX = Math.max(maxX, b.x + (el ? el.offsetWidth : (b.width || 200)));
    maxY = Math.max(maxY, b.y + (el ? el.offsetHeight : (b.height || 120)));
  });
  svg.setAttribute('width', String(maxX + 60));
  svg.setAttribute('height', String(maxY + 60));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  linksOf(ui.currentNoteId).forEach(function (lk) {
    var a = getBlockById(lk.a), b = getBlockById(lk.b);
    if (!a || !b) return;
    var d = linkPathD(centerOf(a), centerOf(b));
    var hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'link-hit');
    var ttl = document.createElementNS(SVGNS, 'title');
    ttl.textContent = 'Click para eliminar la conexi\u00f3n';
    hit.appendChild(ttl);
    hit.addEventListener('click', function (e) { e.stopPropagation(); removeLink(lk.id); });
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'link-path');
    svg.appendChild(hit);
    svg.appendChild(path);
  });
  if (linkDrag && linkDrag.from && linkDrag.to) {
    var dp = document.createElementNS(SVGNS, 'path');
    dp.setAttribute('d', linkPathD(centerOf(linkDrag.from), linkDrag.to));
    dp.setAttribute('class', 'link-path temp');
    svg.appendChild(dp);
  }
}
function createLink(aId, bId) {
  if (aId === bId || linkExists(aId, bId)) return;
  var a = getBlockById(aId), b = getBlockById(bId);
  if (!a || !b || a.noteId !== b.noteId) return;
  pushUndo('Conectar ideas');
  data.links.push({ id: uid(), noteId: a.noteId, a: aId, b: bId, createdAt: now() });
  logChange('Ideas conectadas', '');
  save();
  drawLinks();
}
function removeLink(id) {
  pushUndo('Eliminar conexi\u00f3n');
  data.links = (data.links || []).filter(function (l) { return l.id !== id; });
  logChange('Conexi\u00f3n eliminada', '');
  save();
  drawLinks();
}
function startLinkDrag(b, e) {
  if (!canvasContentEl) return;
  linkDrag = { from: b, to: toContent(e.clientX, e.clientY), overEl: null };
  drawLinks();
  var move = function (ev) {
    linkDrag.to = toContent(ev.clientX, ev.clientY);
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var c = under && under.closest ? under.closest('.card') : null;
    if (c && c.getAttribute('data-id') === b.id) c = null;
    if (c !== linkDrag.overEl) {
      if (linkDrag.overEl) linkDrag.overEl.classList.remove('link-target');
      linkDrag.overEl = c;
      if (linkDrag.overEl) linkDrag.overEl.classList.add('link-target');
    }
    drawLinks();
  };
  var up = function () {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    var target = linkDrag.overEl;
    if (target) target.classList.remove('link-target');
    var fromId = b.id;
    linkDrag = null;
    if (target && target.getAttribute('data-id')) createLink(fromId, target.getAttribute('data-id'));
    else drawLinks();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
function attachMarquee(content) {
  content.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || e.target !== content) return;
    if (radialEl || spaceDown) return;
    var startX = e.clientX, startY = e.clientY;
    var p1 = toContent(startX, startY);
    var ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey;
    var base = Object.assign({}, selectedIds);
    var rectEl = null, moved = false;
    var move = function (ev) {
      var ddx = ev.clientX - startX, ddy = ev.clientY - startY;
      if (!moved && Math.abs(ddx) < 4 && Math.abs(ddy) < 4) return;
      moved = true;
      if (!rectEl) { rectEl = h('div', { class: 'marquee' }); content.appendChild(rectEl); }
      var p2 = toContent(ev.clientX, ev.clientY);
      var left = Math.min(p1.x, p2.x), top = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), hgt = Math.abs(p2.y - p1.y);
      rectEl.style.left = left + 'px'; rectEl.style.top = top + 'px'; rectEl.style.width = w + 'px'; rectEl.style.height = hgt + 'px';
      selectInRect(left, top, w, hgt, shift, base);
    };
    var up = function () {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (rectEl) rectEl.remove();
      if (!moved) {
        if (ctrl) openRadial(startX, startY);
        else if (!shift) clearSelection();
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

// ---------- Zoom y desplazamiento (pan) del lienzo ----------
var spaceDown = false;
var navReady = false;
var viewSaveT = null;
function getView() {
  if (!ui.views) ui.views = {};
  var id = ui.currentNoteId || '_';
  if (!ui.views[id]) ui.views[id] = { zoom: 1, x: 0, y: 0 };
  return ui.views[id];
}
function saveView() { writeLS(LS_UI, JSON.stringify(ui)); }
function saveViewDebounced() { clearTimeout(viewSaveT); viewSaveT = setTimeout(saveView, 250); }
function updateZoomLabel() {
  var el = document.getElementById('zoomPct');
  if (el) el.textContent = Math.round(getView().zoom * 100) + '%';
}
function applyView() {
  if (!canvasContentEl) return;
  var v = getView();
  canvasContentEl.style.transformOrigin = '0 0';
  canvasContentEl.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.zoom + ')';
  var wrap = document.getElementById('canvas');
  if (wrap) {
    var gs = 20 * v.zoom;
    wrap.style.backgroundSize = gs + 'px ' + gs + 'px';
    wrap.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
  }
  updateZoomLabel();
}
function toContent(clientX, clientY) {
  var wrap = document.getElementById('canvas');
  var r = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
  var v = getView();
  return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
}
function zoomAt(sx, sy, nz) {
  var v = getView();
  nz = Math.min(3, Math.max(0.2, nz));
  var cx = (sx - v.x) / v.zoom, cy = (sy - v.y) / v.zoom;
  v.zoom = nz;
  v.x = sx - cx * nz;
  v.y = sy - cy * nz;
  applyView();
  saveViewDebounced();
}
function zoomBy(mult) {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var r = wrap.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, getView().zoom * mult);
}
function resetView() { var v = getView(); v.zoom = 1; v.x = 0; v.y = 0; applyView(); saveView(); }
function fitView() {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var r = wrap.getBoundingClientRect();
  var bs = blocksOf(ui.currentNoteId);
  if (!bs.length) { resetView(); return; }
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bs.forEach(function (b) {
    var el = cardEl(b.id);
    var w = el ? el.offsetWidth : (b.width || 200);
    var hh = el ? el.offsetHeight : (b.height || 120);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + w); maxY = Math.max(maxY, b.y + hh);
  });
  var pad = 80;
  var bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2;
  var z = Math.min(r.width / bw, r.height / bh, 1.5);
  z = Math.max(0.2, z);
  var v = getView();
  v.zoom = z;
  v.x = r.width / 2 - ((minX + maxX) / 2) * z;
  v.y = r.height / 2 - ((minY + maxY) / 2) * z;
  applyView();
  saveView();
}
function buildZoomControl() {
  return h('div', { class: 'zoom-ctl' },
    h('button', { class: 'zoom-btn', title: 'Alejar (Ctrl -)', onclick: function () { zoomBy(1 / 1.2); } }, '\u2212'),
    h('button', { class: 'zoom-pct', id: 'zoomPct', title: 'Restablecer zoom (Ctrl 0)', onclick: resetView }, '100%'),
    h('button', { class: 'zoom-btn', title: 'Acercar (Ctrl +)', onclick: function () { zoomBy(1.2); } }, '+'),
    h('span', { class: 'zoom-sep' }),
    h('button', { class: 'zoom-btn', title: 'Ajustar a contenido', onclick: fitView }, icon('fit'))
  );
}
function initCanvasNav() {
  if (navReady) return; navReady = true;
  var wrap = document.getElementById('canvas');
  if (!wrap) return;
  wrap.addEventListener('wheel', function (e) {
    if (!ui.currentNoteId || !canvasContentEl) return;
    if (!(e.ctrlKey || e.metaKey)) {
      var ta = e.target && e.target.closest ? e.target.closest('textarea, input') : null;
      if (ta && document.activeElement === ta) return; // deja desplazar el campo mientras se edita
    }
    e.preventDefault();
    var v = getView();
    var r = wrap.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX - r.left, e.clientY - r.top, v.zoom * Math.exp(-e.deltaY * 0.0018));
    } else {
      v.x -= e.deltaX; v.y -= e.deltaY;
      applyView(); saveViewDebounced();
    }
  }, { passive: false });
  var dragDepth = 0;
  var hasFiles = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; };
  wrap.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth++;
    if (ui.currentNoteId && getNote(ui.currentNoteId)) wrap.classList.add('drag-over');
  });
  wrap.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (er) {}
  });
  wrap.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) wrap.classList.remove('drag-over');
  });
  wrap.addEventListener('drop', function (e) {
    dragDepth = 0; wrap.classList.remove('drag-over');
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files, e.clientX, e.clientY);
  });
  // Evita que el navegador abra un archivo soltado fuera del lienzo.
  window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (hasFiles(e) && !wrap.contains(e.target)) e.preventDefault(); });
  document.addEventListener('mousedown', function (e) {
    if (!ui.currentNoteId) return;
    if (!wrap.contains(e.target)) return;
    var wantPan = (e.button === 1) || (spaceDown && e.button === 0);
    if (!wantPan) return;
    e.preventDefault(); e.stopPropagation();
    var v = getView();
    var sx = e.clientX, sy = e.clientY, ox = v.x, oy = v.y;
    document.body.classList.add('panning');
    var mv = function (ev) { v.x = ox + (ev.clientX - sx); v.y = oy + (ev.clientY - sy); applyView(); };
    var up = function () {
      document.removeEventListener('mousemove', mv, true);
      document.removeEventListener('mouseup', up, true);
      document.body.classList.remove('panning');
      saveView();
    };
    document.addEventListener('mousemove', mv, true);
    document.addEventListener('mouseup', up, true);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      var a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)) return;
      if (!spaceDown) { spaceDown = true; document.body.classList.add('space-pan'); }
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); resetView(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') { spaceDown = false; document.body.classList.remove('space-pan'); }
  });
}

// ---------- Men\u00fa radial (Alt) ----------
var radialEl = null;
function openRadial(cx, cy) {
  closeRadial();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) return;
  var opts = [
    { type: 'text', label: 'Nota', icon: 'grip' },
    { type: 'freetext', label: 'Texto', icon: 'type' },
    { type: 'idea', label: 'Idea', icon: 'bulb' },
    { type: 'table', label: 'Tabla', icon: 'table' },
    { type: 'code', label: 'C\u00f3digo', icon: 'code' },
    { type: 'python', label: 'Python', icon: 'python' },
    { type: 'json', label: 'JSON', icon: 'braces' },
    { type: 'curl', label: 'cURL', icon: 'terminal' },
    { type: 'image', label: 'Imagen', icon: 'image' },
    { type: 'markdown', label: 'Markdown', icon: 'format' },
    { type: 'mermaid', label: 'Mermaid', icon: 'graph' },
    { type: 'draw', label: 'Dibujo', icon: 'pencil' },
  ];
  radialEl = h('div', { class: 'radial', style: { left: cx + 'px', top: cy + 'px' } });
  var R = 86, n = opts.length;
  opts.forEach(function (o, i) {
    var ang = (-90 + (360 / n) * i) * Math.PI / 180;
    var px = Math.round(Math.cos(ang) * R), py = Math.round(Math.sin(ang) * R);
    var btn = h('button', {
      class: 'radial-item',
      title: 'Insertar ' + o.label,
      style: { transform: 'translate(' + px + 'px,' + py + 'px)' },
      onmousedown: function (ev) { ev.preventDefault(); ev.stopPropagation(); },
      onclick: function (ev) { ev.stopPropagation(); createAt(cx, cy, o.type); closeRadial(); },
    }, icon(o.icon), h('span', { class: 'radial-lbl' }, o.label));
    radialEl.appendChild(btn);
  });
  radialEl.appendChild(h('div', { class: 'radial-center', html: I.plus }));
  document.body.appendChild(radialEl);
}
function closeRadial() { if (radialEl) { radialEl.remove(); radialEl = null; } }
