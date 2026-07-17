/* tuNota — Interacciones del lienzo: arrastre, marquee, conexiones, zoom/pan y menú radial.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Guías inteligentes de alineación + snap (estilo Lucidchart/Visio) ----------
var SNAP_T = 6; // tolerancia de enganche en coordenadas de contenido
// Calcula el desplazamiento de enganche del bloque principal contra los demás
// (bordes izq/centro/der y arriba/centro/abajo) y, si no hay, a la rejilla de 20px.
// ---------- Caché de medidas para arrastre/selección fluidos ----------
// Durante un arrastre o un marco de selección, el tamaño de las tarjetas NO cambia.
// Medir el DOM (offsetWidth/Height) una sola vez al empezar evita reflujos sincrónicos
// repetidos por fotograma (la causa principal de los tirones). Mientras la caché está
// activa, cardEl() y blockRect() la usan en lugar de tocar el layout.
var _measureCache = null; // { id: { el, w, h } } o null cuando no hay interacción activa
function buildMeasureCache() {
  var c = {};
  if (canvasContentEl) Array.prototype.forEach.call(canvasContentEl.querySelectorAll('.card'), function (el) {
    var id = el.getAttribute('data-id');
    if (id) c[id] = { el: el, w: el.offsetWidth, h: el.offsetHeight };
  });
  _measureCache = c;
  return c;
}
function clearMeasureCache() { _measureCache = null; }
// Rectángulo {x,y,w,h} de un bloque; usa la caché si está activa (sin forzar layout).
function blockRect(b) {
  var c = _measureCache && _measureCache[b.id];
  if (c) return { x: b.x, y: b.y, w: c.w, h: c.h };
  var el = cardEl(b.id);
  return { x: b.x, y: b.y, w: el ? el.offsetWidth : (b.width || 200), h: el ? el.offsetHeight : (b.height || 120) };
}

function snapDrag(prim, others) {
  var res = { dx: 0, dy: 0, v: null, h: null };
  var pxs = [prim.x, prim.x + prim.w / 2, prim.x + prim.w];
  var pys = [prim.y, prim.y + prim.h / 2, prim.y + prim.h];
  var bestX = null, bestY = null;
  others.forEach(function (o) {
    [o.x, o.x + o.w / 2, o.x + o.w].forEach(function (ox) {
      pxs.forEach(function (px) {
        var diff = ox - px;
        if (Math.abs(diff) <= SNAP_T && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff: diff, at: ox, o: o };
      });
    });
    [o.y, o.y + o.h / 2, o.y + o.h].forEach(function (oy) {
      pys.forEach(function (py) {
        var diff = oy - py;
        if (Math.abs(diff) <= SNAP_T && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff: diff, at: oy, o: o };
      });
    });
  });
  if (bestX) { res.dx = bestX.diff; var ox = bestX.o; res.v = { at: bestX.at, y1: Math.min(prim.y, ox.y) - 8, y2: Math.max(prim.y + prim.h, ox.y + ox.h) + 8 }; }
  else { var gx = Math.round(prim.x / 20) * 20 - prim.x; if (Math.abs(gx) <= SNAP_T) res.dx = gx; }
  if (bestY) { res.dy = bestY.diff; var oy = bestY.o; res.h = { at: bestY.at, x1: Math.min(prim.x, oy.x) - 8, x2: Math.max(prim.x + prim.w, oy.x + oy.w) + 8 }; }
  else { var gy = Math.round(prim.y / 20) * 20 - prim.y; if (Math.abs(gy) <= SNAP_T) res.dy = gy; }
  return res;
}
function guidesEl() {
  if (!canvasContentEl) return null;
  var g = canvasContentEl.querySelector('.snap-guides');
  if (!g) { g = h('div', { class: 'snap-guides' }); canvasContentEl.appendChild(g); }
  return g;
}
function clearGuides() { var g = canvasContentEl && canvasContentEl.querySelector('.snap-guides'); if (g) g.innerHTML = ''; }
function drawSnapGuides(snap) {
  var g = guidesEl(); if (!g) return;
  g.innerHTML = '';
  if (snap.v) { var v = h('div', { class: 'snap-guide v' }); v.style.left = snap.v.at + 'px'; v.style.top = snap.v.y1 + 'px'; v.style.height = (snap.v.y2 - snap.v.y1) + 'px'; g.appendChild(v); }
  if (snap.h) { var hz = h('div', { class: 'snap-guide h' }); hz.style.top = snap.h.at + 'px'; hz.style.left = snap.h.x1 + 'px'; hz.style.width = (snap.h.x2 - snap.h.x1) + 'px'; g.appendChild(hz); }
}
// Orden de apilado (traer al frente / enviar al fondo) reordenando data.blocks.
function bringToFront(b) {
  var i = data.blocks.indexOf(b); if (i < 0) return;
  data.blocks.splice(i, 1); data.blocks.push(b);
  touchNote(b.noteId); logChange('Traer al frente', ''); save(); renderCanvas();
}
function sendToBack(b) {
  var i = data.blocks.indexOf(b); if (i < 0) return;
  data.blocks.splice(i, 1); data.blocks.unshift(b);
  touchNote(b.noteId); logChange('Enviar al fondo', ''); save(); renderCanvas();
}

// Componente conectado: el bloque y todo lo unido a él por conectores (BFS sobre links).
function connectedComponent(id) {
  var seen = {}; seen[id] = true;
  var queue = [id];
  while (queue.length) {
    var cur = queue.shift();
    (data.links || []).forEach(function (l) {
      var nxt = l.a === cur ? l.b : (l.b === cur ? l.a : null);
      if (nxt && !seen[nxt] && getBlockById(nxt)) { seen[nxt] = true; queue.push(nxt); }
    });
  }
  return Object.keys(seen);
}
// ---------- Auto-ordenar (flujograma): coloca los bloques en niveles según sus conexiones ----------
function autoLayoutFlow(ids) {
  ids = (ids || []).filter(getBlockById);
  if (ids.length < 2) { toast('Selecciona o conecta al menos 2 bloques para auto-ordenarlos.', 'warn'); return; }
  var inSet = {}; ids.forEach(function (id) { inSet[id] = true; });
  var links = (data.links || []).filter(function (l) { return inSet[l.a] && inSet[l.b] && l.a !== l.b; });
  var adj = {}, indeg = {};
  ids.forEach(function (id) { adj[id] = []; indeg[id] = 0; });
  links.forEach(function (l) { adj[l.a].push(l.b); indeg[l.b]++; });
  // Capa de cada bloque = camino más largo desde una raíz (orden topológico de Kahn).
  var layer = {}; ids.forEach(function (id) { layer[id] = 0; });
  var indeg2 = Object.assign({}, indeg);
  var queue = ids.filter(function (id) { return indeg2[id] === 0; });
  if (!queue.length) queue = [ids[0]]; // ciclo: arranca en el primero
  var seen = {}, guard = 0;
  while (queue.length && guard++ < ids.length * 6) {
    var cur = queue.shift();
    if (seen[cur]) continue; seen[cur] = true;
    adj[cur].forEach(function (n) { layer[n] = Math.max(layer[n], layer[cur] + 1); if (--indeg2[n] <= 0) queue.push(n); });
  }
  var byLayer = {};
  ids.forEach(function (id) { (byLayer[layer[id]] = byLayer[layer[id]] || []).push(id); });
  var Wd = function (id) { var el = cardEl(id); return el ? el.offsetWidth : (getBlockById(id).width || 180); };
  var Hd = function (id) { var el = cardEl(id); return el ? el.offsetHeight : (getBlockById(id).height || 110); };
  var vGap = 80, hGap = 56, minX = Infinity, minY = Infinity;
  ids.forEach(function (id) { var b = getBlockById(id); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); });
  var startX = Math.max(40, Math.round(minX)), startY = Math.max(40, Math.round(minY));
  var rows = Object.keys(byLayer).map(Number).sort(function (a, b) { return a - b; }).map(function (L) {
    var row = byLayer[L].slice().sort(function (a, b) { return getBlockById(a).x - getBlockById(b).x; });
    var totalW = row.reduce(function (s, id) { return s + Wd(id); }, 0) + Math.max(0, row.length - 1) * hGap;
    return { ids: row, totalW: totalW, rowH: Math.max.apply(null, row.map(Hd)) };
  });
  var maxW = Math.max.apply(null, rows.map(function (r) { return r.totalW; }));
  pushUndo('Auto-ordenar');
  var y = startY;
  rows.forEach(function (r) {
    var x = startX + Math.round((maxW - r.totalW) / 2); // centra cada nivel
    r.ids.forEach(function (id) { var b = getBlockById(id); b.x = Math.round(x); b.y = Math.round(y + (r.rowH - Hd(id)) / 2); x += Wd(id) + hGap; });
    y += r.rowH + vGap;
  });
  touchNote(getBlockById(ids[0]).noteId);
  logChange('Auto-ordenado', ids.length + ' bloques · ' + rows.length + ' niveles');
  save(); renderCanvas();
  toast('Auto-ordenado en ' + rows.length + ' nivel(es).', 'ok');
}
function autoLayoutSelection() {
  var ids = Object.keys(selectedIds).filter(getBlockById);
  if (ids.length === 1) ids = connectedComponent(ids[0]).filter(getBlockById); // 1 seleccionado → su flujo conectado entero
  autoLayoutFlow(ids);
}
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
    // Shift + arrastrar: mueve todo lo CONECTADO al bloque (el flujograma entero)
    // sin tener que seleccionarlo pieza a pieza.
    if (e.shiftKey) {
      connectedComponent(b.id).forEach(function (id) { if (groupIds.indexOf(id) < 0) groupIds.push(id); });
    }
    var single = groupIds.length <= 1;
    var starts = {};
    groupIds.forEach(function (id) { var blk = getBlockById(id); starts[id] = { x: blk.x, y: blk.y }; });
    var sx = e.clientX, sy = e.clientY, moved = false, dropEl = null;
    // Se miden una sola vez, al primer movimiento real (los tamaños no cambian al arrastrar).
    var primC = null, othersStatic = null, rafId = 0, lastEv = null;
    var findTarget = function (cx, cy) {
      el.style.pointerEvents = 'none';
      var under = document.elementFromPoint(cx, cy);
      el.style.pointerEvents = '';
      var c = under && under.closest ? under.closest('.card') : null;
      return c && c !== el ? c : null;
    };
    var doMove = function (ev) {
      if (!moved) {
        moved = true;
        buildMeasureCache();
        var pc = _measureCache[b.id];
        primC = pc ? { w: pc.w, h: pc.h } : { w: b.width || 200, h: b.height || 120 };
        // Los bloques NO seleccionados no se mueven: sus rectángulos son fijos durante el arrastre.
        othersStatic = blocksOf(ui.currentNoteId).filter(function (o) { return !selectedIds[o.id] && o.id !== b.id; }).map(blockRect);
      }
      var z = getView().zoom || 1;
      var ddx = (ev.clientX - sx) / z, ddy = (ev.clientY - sy) / z;
      // Guías inteligentes: engancha el bloque principal a los demás (y a la rejilla)
      // y aplica el mismo desplazamiento a todo el grupo.
      var prim = { x: Math.max(0, starts[b.id].x + ddx), y: Math.max(0, starts[b.id].y + ddy), w: primC.w, h: primC.h };
      var snap = snapDrag(prim, othersStatic);
      ddx += snap.dx; ddy += snap.dy;
      drawSnapGuides(snap);
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
    // Throttle: como máximo un recálculo por fotograma (~60fps), aunque el ratón dispare más.
    var move = function (ev) { lastEv = ev; if (rafId) return; rafId = requestAnimationFrame(function () { rafId = 0; if (lastEv) doMove(lastEv); }); };
    var up = function (ev) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      clearMeasureCache();
      clearGuides();
      if (dropEl) dropEl.classList.remove('merge-target');
      if (single && moved) {
        var target = findTarget(ev.clientX, ev.clientY);
        if (target && target.getAttribute('data-id')) { mergeBlocks(target.getAttribute('data-id'), b.id); return; }
      }
      groupIds.forEach(function (id) { var blk = getBlockById(id); if (blk) { blk.x = Math.round(blk.x); blk.y = Math.round(blk.y); } });
      // Soltar un bloque dentro de un área de grupo → se añade a ese grupo.
      var joined = false;
      if (moved) groupIds.forEach(function (id) { var blk = getBlockById(id); if (blk && maybeJoinGroupOnDrop(blk)) joined = true; });
      if (joined) return; // addBlockToGroup ya guardó y re-renderizó
      save();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

// ---------- Selecci\u00f3n m\u00faltiple (marquee) ----------
var selectedLinkId = null;
// Selecciona una conexión (flecha): se resalta y se puede borrar con Supr/Retroceso.
function selectLink(id) { selectedLinkId = id; selectedIds = {}; refreshSelectionUI(); drawLinks(); }
function clearSelection() { selectedIds = {}; if (selectedLinkId) { selectedLinkId = null; drawLinks(); } refreshSelectionUI(); }
function refreshSelectionUI() {
  if (canvasContentEl) {
    // Durante el marco de selección reutiliza los elementos cacheados (evita querySelectorAll por fotograma).
    var els = _measureCache
      ? Object.keys(_measureCache).map(function (k) { return _measureCache[k].el; })
      : canvasContentEl.querySelectorAll('.card');
    Array.prototype.forEach.call(els, function (el) {
      if (el) el.classList.toggle('selected', !!selectedIds[el.getAttribute('data-id')]);
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
      h('span', { class: 'sel-align' },
        h('button', { class: 'sel-mini', title: 'Alinear a la izquierda', onclick: function () { alignSelected('left'); } }, icon('alignL')),
        h('button', { class: 'sel-mini', title: 'Alinear arriba', onclick: function () { alignSelected('top'); } }, icon('alignT')),
        h('button', { class: 'sel-mini sel-dist', title: 'Distribuir horizontalmente', onclick: function () { alignSelected('distH'); } }, icon('distH')),
        h('button', { class: 'sel-mini sel-dist', title: 'Distribuir verticalmente', onclick: function () { alignSelected('distV'); } }, icon('distV'))
      ),
      h('button', { class: 'sel-ai', title: 'Combinar los bloques seleccionados en una s\u00edntesis con IA', onclick: function () { aiSynthesizeSelection(); } }, icon('spark'), 'Sintetizar'),
      h('button', { class: 'sel-mmd', title: 'Convertir las formas/notas y sus conexiones en un diagrama Mermaid', onclick: function () { selectionToMermaid(); } }, icon('flow'), 'A diagrama'),
      h('button', { class: 'sel-flow', title: 'Auto-ordenar como flujograma: coloca los bloques en niveles según sus conexiones', onclick: function () { autoLayoutSelection(); } }, icon('fit'), 'Ordenar'),
      h('button', { class: 'sel-group', title: 'Crear un grupo con nombre y color (1 o m\u00e1s bloques)', onclick: function () { createGroupFromSelection(); } }, icon('shapes'), 'Agrupar'),
      h('button', { class: 'sel-tpl', title: 'Guardar la selecci\u00f3n como plantilla reutilizable (acceso r\u00e1pido en Plantillas)', onclick: function () { saveSelectionAsTemplate(); } }, icon('layout'), 'Plantilla'),
      h('button', { class: 'sel-dl', title: 'Descargar todas las imágenes de la selección', onclick: function () { downloadSelectedImages(); } }, icon('download'), 'Descargar'),
      h('button', { class: 'sel-mini', title: 'Duplicar la selecci\u00f3n (Ctrl/Cmd+D)', onclick: function () { duplicateSelected(); } }, icon('copy')),
      h('button', { class: 'sel-del', title: 'Eliminar selecci\u00f3n', onclick: deleteSelected }, icon('trash'), 'Eliminar'));
    document.body.appendChild(bar);
  }
  bar.querySelector('.sel-count').textContent = n + (n > 1 ? ' seleccionados' : ' seleccionado');
  bar.querySelector('.sel-align').style.display = n >= 2 ? '' : 'none';
  Array.prototype.forEach.call(bar.querySelectorAll('.sel-dist'), function (btn) {
    btn.style.display = n >= 3 ? '' : 'none';
  });
  // Descargar solo cuando al menos un bloque seleccionado tiene imágenes.
  var hasImages = Object.keys(selectedIds).some(function (id) {
    var b = data.blocks.find(function (x) { return x.id === id; });
    return b && b.content && b.content.images && b.content.images.length;
  });
  bar.querySelector('.sel-dl').style.display = hasImages ? '' : 'none';
  // Sintetizar solo tiene sentido con 2+ bloques con texto.
  var withText = Object.keys(selectedIds).filter(function (id) {
    var b = data.blocks.find(function (x) { return x.id === id; });
    return b && aiCanActOn(b);
  }).length;
  bar.querySelector('.sel-ai').style.display = withText >= 2 ? '' : 'none';
  // "A diagrama" con 2+ formas/notas seleccionadas.
  var nodeCount = Object.keys(selectedIds).filter(function (id) {
    var b = data.blocks.find(function (x) { return x.id === id; });
    return b && ['shape', 'text', 'idea', 'freetext', 'markdown'].indexOf(b.type) >= 0;
  }).length;
  bar.querySelector('.sel-mmd').style.display = nodeCount >= 2 ? '' : 'none';
  bar.querySelector('.sel-flow').style.display = n >= 2 ? '' : 'none';
  bar.querySelector('.sel-group').style.display = n >= 1 ? '' : 'none'; // permite grupos de 1
}
// Alinea o distribuye los bloques seleccionados en el lienzo.
function alignSelected(mode) {
  var blocks = Object.keys(selectedIds).map(function (id) {
    return data.blocks.find(function (x) { return x.id === id; });
  }).filter(Boolean);
  if (blocks.length < 2) return;
  pushUndo('Alinear bloques');
  if (mode === 'left') {
    var minX = Math.min.apply(null, blocks.map(function (b) { return b.x; }));
    blocks.forEach(function (b) { b.x = minX; });
  } else if (mode === 'top') {
    var minY = Math.min.apply(null, blocks.map(function (b) { return b.y; }));
    blocks.forEach(function (b) { b.y = minY; });
  } else if (mode === 'distH' || mode === 'distV') {
    var horiz = mode === 'distH';
    var sorted = blocks.slice().sort(function (a, b) { return horiz ? a.x - b.x : a.y - b.y; });
    var sizeOf = function (b) { return horiz ? (b.width || 200) : (b.height || 120); };
    var first = sorted[0], last = sorted[sorted.length - 1];
    var start = horiz ? first.x : first.y;
    var end = (horiz ? last.x : last.y) + sizeOf(last);
    var total = sorted.reduce(function (s, b) { return s + sizeOf(b); }, 0);
    var gap = Math.max(12, (end - start - total) / (sorted.length - 1));
    var pos = start;
    sorted.forEach(function (b) {
      if (horiz) b.x = Math.round(pos); else b.y = Math.round(pos);
      pos += sizeOf(b) + gap;
    });
  }
  blocks.forEach(function (b) {
    b.updatedAt = now();
    var el = cardEl(b.id);
    if (el) { el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; }
  });
  touchNote(blocks[0].noteId);
  logChange('Bloques alineados', blocks.length + ' bloques');
  save();
  drawLinks();
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
    // Usa el tamaño REAL renderizado (cacheado durante el marco) para que la selección
    // coincida con lo que se ve, sin volver a medir el DOM en cada fotograma.
    var r = blockRect(b);
    var bl = b.x, bt = b.y, br = b.x + r.w, bb = b.y + r.h;
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
function rectOf(b) { return blockRect(b); }
function centerOf(b) {
  var r = rectOf(b);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
// Punto del borde de un rectángulo en la dirección de 'toward' (conectores que
// se enganchan al borde, no al centro — así se ve la flecha).
function edgePoint(rect, toward) {
  var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  var dx = toward.x - cx, dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  var scale = Math.min(dx ? (rect.w / 2) / Math.abs(dx) : Infinity, dy ? (rect.h / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
// Tipos de conector (color semántico) y estilos de ruteo.
var LINK_TYPES = [
  { key: 'rel', label: 'Relación' },
  { key: 'dep', label: 'Depende' },
  { key: 'block', label: 'Bloquea' },
  { key: 'flow', label: 'Flujo' },
];
var LINK_STYLES = [
  { key: 'curve', label: 'Curvo' },
  { key: 'straight', label: 'Recto' },
  { key: 'elbow', label: 'Ortogonal' },
];
function linkPathD(p1, p2, style) {
  var dx = p2.x - p1.x, dy = p2.y - p1.y;
  var horiz = Math.abs(dx) >= Math.abs(dy); // eje dominante de la conexión
  if (style === 'straight') return 'M' + p1.x + ',' + p1.y + ' L' + p2.x + ',' + p2.y;
  if (style === 'elbow') {
    // Ruta ortogonal según el eje dominante: la flecha llega perpendicular al borde.
    if (horiz) {
      var mx = (p1.x + p2.x) / 2;
      return 'M' + p1.x + ',' + p1.y + ' L' + mx + ',' + p1.y + ' L' + mx + ',' + p2.y + ' L' + p2.x + ',' + p2.y;
    }
    var my = (p1.y + p2.y) / 2;
    return 'M' + p1.x + ',' + p1.y + ' L' + p1.x + ',' + my + ' L' + p2.x + ',' + my + ' L' + p2.x + ',' + p2.y;
  }
  // Curva según el eje dominante: en conexiones verticales la flecha entra en vertical
  // (antes siempre entraba en horizontal y quedaba "chueca").
  var k;
  if (horiz) {
    k = Math.max(40, Math.abs(dx) * 0.4) * (dx >= 0 ? 1 : -1);
    return 'M' + p1.x + ',' + p1.y + ' C' + (p1.x + k) + ',' + p1.y + ' ' + (p2.x - k) + ',' + p2.y + ' ' + p2.x + ',' + p2.y;
  }
  k = Math.max(40, Math.abs(dy) * 0.4) * (dy >= 0 ? 1 : -1);
  return 'M' + p1.x + ',' + p1.y + ' C' + p1.x + ',' + (p1.y + k) + ' ' + p2.x + ',' + (p2.y - k) + ' ' + p2.x + ',' + p2.y;
}
function linkArrowDefs(svg) {
  var defs = document.createElementNS(SVGNS, 'defs');
  var m = document.createElementNS(SVGNS, 'marker');
  m.setAttribute('id', 'linkArrow');
  m.setAttribute('viewBox', '0 0 10 10');
  m.setAttribute('refX', '8'); m.setAttribute('refY', '5');
  m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
  m.setAttribute('orient', 'auto-start-reverse');
  var mp = document.createElementNS(SVGNS, 'path');
  mp.setAttribute('d', 'M0,0 L10,5 L0,10 z');
  mp.setAttribute('class', 'link-arrow');
  m.appendChild(mp); defs.appendChild(m); svg.appendChild(defs);
}
function drawLinks() {
  if (!canvasContentEl) return;
  if (typeof updateGroupRects === 'function') updateGroupRects(); // áreas de grupo en vivo
  var svg = canvasContentEl.querySelector('.link-layer');
  if (!svg) return;
  var maxX = 600, maxY = 400;
  blocksOf(ui.currentNoteId).forEach(function (b) {
    var r = blockRect(b);
    maxX = Math.max(maxX, b.x + r.w);
    maxY = Math.max(maxY, b.y + r.h);
  });
  svg.setAttribute('width', String(maxX + 60));
  svg.setAttribute('height', String(maxY + 60));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  linkArrowDefs(svg);
  linksOf(ui.currentNoteId).forEach(function (lk) {
    var a = getBlockById(lk.a), b = getBlockById(lk.b);
    if (!a || !b) return;
    var ra = rectOf(a), rb = rectOf(b), ca = centerOf(a), cb = centerOf(b);
    var p1 = edgePoint(ra, cb), p2 = edgePoint(rb, ca);
    var d = linkPathD(p1, p2, lk.style);
    var hit = document.createElementNS(SVGNS, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'link-hit');
    var ttl = document.createElementNS(SVGNS, 'title');
    ttl.textContent = 'Click para etiquetar, cambiar tipo o eliminar la conexi\u00f3n';
    hit.appendChild(ttl);
    hit.addEventListener('click', function (e) { e.stopPropagation(); selectLink(lk.id); openLinkMenu(lk, e.clientX, e.clientY); });
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'link-path link-t-' + (lk.type || 'rel') + (lk.id === selectedLinkId ? ' link-selected' : ''));
    var dir = lk.dir || 'end'; // end (A→B) | start (B→A) | both (↔) | none
    if (dir === 'end' || dir === 'both') path.setAttribute('marker-end', 'url(#linkArrow)');
    if (dir === 'start' || dir === 'both') path.setAttribute('marker-start', 'url(#linkArrow)');
    svg.appendChild(hit);
    svg.appendChild(path);
    if (lk.label) {
      var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      var txt = document.createElementNS(SVGNS, 'text');
      txt.setAttribute('x', String(mx)); txt.setAttribute('y', String(my));
      txt.setAttribute('class', 'link-label');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'central');
      txt.textContent = lk.label;
      txt.addEventListener('click', function (e) { e.stopPropagation(); selectLink(lk.id); openLinkMenu(lk, e.clientX, e.clientY); });
      svg.appendChild(txt);
    }
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
// Men\u00fa de una conexi\u00f3n: etiquetar o eliminar (sustituye al borrado con un solo clic).
function closeLinkMenu() { var b = document.getElementById('linkMenuBackdrop'); if (b) b.remove(); }
function openLinkMenu(lk, clientX, clientY) {
  closeLinkMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'linkMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeLinkMenu(); } });
  var m = h('div', { class: 'card-menu-pop link-menu', onmousedown: function (e) { e.stopPropagation(); } });
  m.style.position = 'fixed';
  m.style.left = Math.min(clientX, window.innerWidth - 220) + 'px';
  m.style.top = Math.min(clientY, window.innerHeight - 140) + 'px';
  // Texto (etiqueta): edici\u00f3n r\u00e1pida en l\u00ednea (Enter aplica y cierra).
  m.appendChild(h('div', { class: 'cm-label' }, icon('edit'), 'Texto'));
  var labelInp = h('input', { class: 'link-label-input', value: lk.label || '', placeholder: 'Escribe y pulsa Enter\u2026' });
  labelInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  labelInp.addEventListener('input', function () { lk.label = labelInp.value; drawLinks(); debouncedSave(); });
  labelInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { lk.label = labelInp.value.trim(); logChange('Etiqueta de conexi\u00f3n', snippet(lk.label)); save(); drawLinks(); closeLinkMenu(); } });
  m.appendChild(labelInp);
  // Direcci\u00f3n de la flecha: punta al final, al inicio, ambas o ninguna.
  m.appendChild(h('div', { class: 'cm-label' }, 'Direcci\u00f3n'));
  var dirRow = h('div', { class: 'cm-quick' });
  [['end', '\u2192', 'Punta al final (A\u2192B)'], ['start', '\u2190', 'Punta al inicio (B\u2192A)'], ['both', '\u2194', 'Ambas puntas'], ['none', '\u2014', 'Sin puntas']].forEach(function (d) {
    var chip = h('button', { class: 'cm-chip link-dir-chip' + ((lk.dir || 'end') === d[0] ? ' on' : ''), title: d[2] }, d[1]);
    chip.addEventListener('click', function () {
      lk.dir = d[0]; logChange('Direcci\u00f3n de conexi\u00f3n', d[2]); save(); drawLinks();
      Array.prototype.forEach.call(dirRow.children, function (c) { c.classList.remove('on'); }); chip.classList.add('on');
    });
    dirRow.appendChild(chip);
  });
  m.appendChild(dirRow);
  m.appendChild(h('div', { class: 'cm-label' }, 'Tipo'));
  var typeRow = h('div', { class: 'cm-quick' });
  LINK_TYPES.forEach(function (t) {
    typeRow.appendChild(h('button', { class: 'cm-chip link-t-chip t-' + t.key + ((lk.type || 'rel') === t.key ? ' on' : ''), onclick: function () { lk.type = t.key; logChange('Tipo de conexi\u00f3n', t.label); save(); drawLinks(); closeLinkMenu(); } }, t.label));
  });
  m.appendChild(typeRow);
  m.appendChild(h('div', { class: 'cm-label' }, 'Estilo'));
  var styleRow = h('div', { class: 'cm-quick' });
  LINK_STYLES.forEach(function (s) {
    styleRow.appendChild(h('button', { class: 'cm-chip' + ((lk.style || 'curve') === s.key ? ' on' : ''), onclick: function () { lk.style = s.key; save(); drawLinks(); closeLinkMenu(); } }, s.label));
  });
  m.appendChild(styleRow);
  m.appendChild(h('button', { class: 'cm-item danger', onclick: function () { removeLink(lk.id); closeLinkMenu(); } },
    icon('trash'), h('span', {}, 'Eliminar conexi\u00f3n')));
  bd.appendChild(m); document.body.appendChild(bd);
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
// Se engancha al wrap (#canvas) para cubrir tambien los margenes fuera de .canvas-content
function attachMarquee(wrap) {
  wrap.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target !== wrap && e.target !== canvasContentEl) return;
    if (!canvasContentEl || radialEl || spaceDown) return;
    var startX = e.clientX, startY = e.clientY;
    var p1 = toContent(startX, startY);
    var ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey;
    var base = Object.assign({}, selectedIds);
    var rectEl = null, moved = false, rafId = 0, lastEv = null;
    var doMove = function (ev) {
      var ddx = ev.clientX - startX, ddy = ev.clientY - startY;
      if (!moved && Math.abs(ddx) < 4 && Math.abs(ddy) < 4) return;
      if (!moved) { moved = true; buildMeasureCache(); } // mide los bloques una sola vez
      if (!rectEl) { rectEl = h('div', { class: 'marquee' }); canvasContentEl.appendChild(rectEl); }
      var p2 = toContent(ev.clientX, ev.clientY);
      var left = Math.min(p1.x, p2.x), top = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), hgt = Math.abs(p2.y - p1.y);
      rectEl.style.left = left + 'px'; rectEl.style.top = top + 'px'; rectEl.style.width = w + 'px'; rectEl.style.height = hgt + 'px';
      selectInRect(left, top, w, hgt, shift, base);
    };
    var move = function (ev) { lastEv = ev; if (rafId) return; rafId = requestAnimationFrame(function () { rafId = 0; if (lastEv) doMove(lastEv); }); };
    var up = function () {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      clearMeasureCache();
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
  scheduleNavAids();
}
// ---------- Ayudas de navegación (no perderse en el lienzo) ----------
// Caja que envuelve todos los bloques de la nota (en coordenadas de contenido).
function contentBox(bs) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bs.forEach(function (b) {
    var w = b.width || 200, hh = b.height || 120;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + w); maxY = Math.max(maxY, b.y + hh);
  });
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}
// Rectángulo visible actual, en coordenadas de contenido.
function viewBox() {
  var wrap = document.getElementById('canvas'); var r = wrap ? wrap.getBoundingClientRect() : { width: 0, height: 0 };
  var v = getView();
  return { x1: -v.x / v.zoom, y1: -v.y / v.zoom, x2: (r.width - v.x) / v.zoom, y2: (r.height - v.y) / v.zoom };
}
// Desplaza la vista para centrar un punto del contenido (sin cambiar el zoom).
function centerOn(cx, cy) {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var r = wrap.getBoundingClientRect(); var v = getView();
  v.x = r.width / 2 - cx * v.zoom; v.y = r.height / 2 - cy * v.zoom;
  applyView(); saveViewDebounced();
}
// "Centrar": zoom 100% y contenido centrado (o al origen si la nota está vacía).
function centerView() {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var r = wrap.getBoundingClientRect(); var v = getView(); v.zoom = 1;
  var bs = ui.currentNoteId ? blocksOf(ui.currentNoteId) : [];
  if (!bs.length) { v.x = 0; v.y = 0; applyView(); saveView(); return; }
  var bb = contentBox(bs);
  v.x = r.width / 2 - ((bb.minX + bb.maxX) / 2) * v.zoom;
  v.y = r.height / 2 - ((bb.minY + bb.maxY) / 2) * v.zoom;
  applyView(); saveView();
}
// Aviso flotante cuando NINGÚN bloque está a la vista (te has ido al vacío).
function updateLostHint() {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var bs = ui.currentNoteId ? blocksOf(ui.currentNoteId) : [];
  var hint = document.getElementById('lostHint');
  if (!bs.length) { if (hint) hint.remove(); return; }
  var vb = viewBox();
  var anyVisible = bs.some(function (b) {
    var w = b.width || 200, hh = b.height || 120;
    return !(b.x > vb.x2 || b.x + w < vb.x1 || b.y > vb.y2 || b.y + hh < vb.y1);
  });
  if (anyVisible) { if (hint) hint.remove(); return; }
  if (!hint) {
    hint = h('button', { class: 'lost-hint', id: 'lostHint', title: 'Centrar la vista en tus bloques',
      onclick: function () { centerView(); } }, icon('target'), 'Volver al contenido');
    wrap.appendChild(hint);
  }
}
// Minimapa: vista general con el viewport; clic para saltar a esa zona.
function updateMinimap() {
  var wrap = document.getElementById('canvas'); if (!wrap) return;
  var mm = document.getElementById('miniMap');
  var bs = ui.currentNoteId ? blocksOf(ui.currentNoteId) : [];
  if (!bs.length || ui.hideMinimap) { if (mm) mm.remove(); return; }
  var MW = 156, MH = 108, pad = 8;
  if (!mm) {
    mm = h('div', { class: 'mini-map', id: 'miniMap', title: 'Clic para ir a esa zona del lienzo' });
    mm.appendChild(h('div', { class: 'mini-inner' }));
    mm.appendChild(h('div', { class: 'mini-vp' }));
    var hide = h('button', { class: 'mini-hide', title: 'Ocultar minimapa', onclick: function (e) { e.stopPropagation(); ui.hideMinimap = true; saveView(); mm.remove(); } }, '×');
    mm.appendChild(hide);
    mm.addEventListener('mousedown', function (e) {
      if (e.target === hide) return;
      var m = mm._map; if (!m) return;
      var ir = mm.getBoundingClientRect();
      var cx = m.minX + (e.clientX - ir.left - m.offX) / m.scale;
      var cy = m.minY + (e.clientY - ir.top - m.offY) / m.scale;
      centerOn(cx, cy);
    });
    wrap.appendChild(mm);
  }
  var vb = viewBox(), bb = contentBox(bs);
  var minX = Math.min(bb.minX, vb.x1), minY = Math.min(bb.minY, vb.y1);
  var maxX = Math.max(bb.maxX, vb.x2), maxY = Math.max(bb.maxY, vb.y2);
  var w = Math.max(1, maxX - minX), hh = Math.max(1, maxY - minY);
  var scale = Math.min((MW - 2 * pad) / w, (MH - 2 * pad) / hh);
  var offX = pad + ((MW - 2 * pad) - w * scale) / 2, offY = pad + ((MH - 2 * pad) - hh * scale) / 2;
  mm._map = { minX: minX, minY: minY, offX: offX, offY: offY, scale: scale };
  var html = '';
  bs.forEach(function (b) {
    var x = offX + (b.x - minX) * scale, y = offY + (b.y - minY) * scale;
    html += '<i style="left:' + x + 'px;top:' + y + 'px;width:' + Math.max(2, (b.width || 200) * scale) + 'px;height:' + Math.max(2, (b.height || 120) * scale) + 'px"></i>';
  });
  mm.querySelector('.mini-inner').innerHTML = html;
  var vp = mm.querySelector('.mini-vp');
  vp.style.left = (offX + (vb.x1 - minX) * scale) + 'px';
  vp.style.top = (offY + (vb.y1 - minY) * scale) + 'px';
  vp.style.width = ((vb.x2 - vb.x1) * scale) + 'px';
  vp.style.height = ((vb.y2 - vb.y1) * scale) + 'px';
}
var navAidsT = null;
function scheduleNavAids() {
  if (navAidsT) return;
  navAidsT = requestAnimationFrame(function () { navAidsT = null; updateLostHint(); updateMinimap(); });
}
function toContent(clientX, clientY) {
  var wrap = document.getElementById('canvas');
  var r = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
  var v = getView();
  return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
}
function zoomAt(sx, sy, nz) {
  var v = getView();
  nz = Math.min(3, Math.max(0.1, nz)); // permite alejar más para alcanzar contenido disperso
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
  z = Math.max(0.05, z); // "Ajustar todo" siempre encuadra, aunque el contenido esté muy disperso
  var v = getView();
  v.zoom = z;
  v.x = r.width / 2 - ((minX + maxX) / 2) * z;
  v.y = r.height / 2 - ((minY + maxY) / 2) * z;
  applyView();
  saveView();
}
function buildZoomControl() {
  return h('div', { class: 'zoom-ctl' },
    h('button', { class: 'zoom-btn', title: 'Alejar (' + MOD + ' \u2212)', onclick: function () { zoomBy(1 / 1.2); } }, '\u2212'),
    h('button', { class: 'zoom-pct', id: 'zoomPct', title: 'Centrar y restablecer zoom (' + MOD + ' 0)', onclick: centerView }, '100%'),
    h('button', { class: 'zoom-btn', title: 'Acercar (' + MOD + ' +)', onclick: function () { zoomBy(1.2); } }, '+'),
    h('span', { class: 'zoom-sep' }),
    h('button', { class: 'zoom-btn', title: 'Centrar en el contenido (zoom 100%)', onclick: centerView }, icon('target')),
    h('button', { class: 'zoom-btn', title: 'Ajustar todo a la vista', onclick: fitView }, icon('fit')),
    h('button', { class: 'zoom-btn', title: 'Mostrar/ocultar minimapa', onclick: function () { ui.hideMinimap = !ui.hideMinimap; saveView(); scheduleNavAids(); } }, icon('map'))
  );
}
function initCanvasNav() {
  if (navReady) return; navReady = true;
  var wrap = document.getElementById('canvas');
  if (!wrap) return;
  // Creacion/seleccion sobre todo el area visible del lienzo, incluidos los margenes
  // que .canvas-content no cubre al hacer pan o zoom.
  wrap.addEventListener('mousemove', function (e) { lastMouse.x = e.clientX; lastMouse.y = e.clientY; lastMouse.over = true; });
  wrap.addEventListener('mouseleave', function () { lastMouse.over = false; });
  wrap.addEventListener('dblclick', function (e) {
    if (e.target !== wrap && e.target !== canvasContentEl) return;
    createAt(e.clientX, e.clientY, dblType()); // tipo configurable (por defecto: texto libre translúcido)
  });
  attachMarquee(wrap);
  wrap.addEventListener('wheel', function (e) {
    if (!ui.currentNoteId || !canvasContentEl) return;
    // En modo tablet no paneamos con la rueda; el lápiz/dedo debe escribir.
    if (ui.tablet && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); return; }
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
      var dx = e.deltaX, dy = e.deltaY;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; } // Shift+rueda = desplazamiento horizontal (ratón sin eje X)
      v.x -= dx; v.y -= dy;
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
    else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); centerView(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.key === '9')) { e.preventDefault(); fitView(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') { spaceDown = false; document.body.classList.remove('space-pan'); }
  });
}

// ---------- Entrada de tinta (modo tablet) ----------
var inkState = { active: false, penDown: false, hasPen: false, cur: null, lasso: null, lassoEl: null };
function attachInkInput(inkLayer) {
  if (!inkLayer) return;
  inkLayer.style.touchAction = 'none';
  inkLayer.addEventListener('pointerdown', onInkDown);
  inkLayer.addEventListener('pointermove', onInkMove);
  inkLayer.addEventListener('pointerup', onInkUp);
  inkLayer.addEventListener('pointercancel', onInkUp);
  inkLayer.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}
function inkTool() { return (ui.pen && ui.pen.tool) || 'pen'; }
function pressureOf(e) {
  // Solo el lápiz real entrega presión útil. Ratón devuelve 0.5, tacto a veces 0.
  // Para ratón/tacto devolvemos undefined y dejamos que perfect-freehand simule presión por velocidad.
  if (e.pointerType === 'pen') {
    if (e.pressure == null || e.pressure === 0) return 0.5;
    return Math.max(0, Math.min(1, e.pressure));
  }
  return undefined;
}
function onInkDown(e) {
  if (!ui.tablet || !ui.currentNoteId || e.button !== 0) return;
  // Rechazo de palma: si un lápiz ya está activo, ignorar toques.
  if (inkState.hasPen && e.pointerType === 'touch') { e.preventDefault(); return; }
  if (e.pointerType === 'pen') inkState.hasPen = true;
  var tool = inkTool();
  // Pan con 2 dedos / rueda sigue funcionando vía wheel; aquí dibujamos.
  e.preventDefault();
  try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (er) {}
  inkState.active = true;
  inkState.penDown = true;
  var p = toContent(e.clientX, e.clientY);
  if (tool === 'eraser') { eraseInkAt(p); return; }
  if (tool === 'lasso') { startLasso(p); return; }
  // pen / hi
  clearInkSelection();
  inkState.cur = {
    id: uid(), noteId: ui.currentNoteId,
    tool: tool, color: ui.pen.color || '#33302b', size: (ui.pen.size || 3) * pressureOf(e),
    points: [{ x: p.x, y: p.y, p: pressureOf(e) }], createdAt: now()
  };
}
function onInkMove(e) {
  if (!inkState.active || !inkState.penDown) return;
  e.preventDefault();
  var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
  var tool = inkTool();
  for (var k = 0; k < evs.length; k++) {
    var p = toContent(evs[k].clientX, evs[k].clientY);
    if (tool === 'eraser') { eraseInkAt(p); continue; }
    if (tool === 'lasso') { moveLasso(p); continue; }
    if (inkState.cur) { inkState.cur.points.push({ x: p.x, y: p.y, p: pressureOf(evs[k]) }); }
  }
  if (tool === 'pen' || tool === 'hi') scheduleDrawCurrent();
  if (tool === 'lasso') drawLasso();
}
function scheduleDrawCurrent() {
  if (inkState.rafPending) return;
  inkState.rafPending = true;
  requestAnimationFrame(function () {
    inkState.rafPending = false;
    drawCurrentInk();
  });
}
function onInkUp(e) {
  if (!inkState.active) return;
  inkState.active = false; inkState.penDown = false;
  if (e.pointerType === 'pen') inkState.hasPen = false;
  try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (er) {}
  var tool = inkTool();
  if ((tool === 'pen' || tool === 'hi') && inkState.cur && inkState.cur.points.length) {
    // Simplificar: grosor constante al guardar (presión promedio opcional).
    inkState.cur.size = ui.pen.size || 3;
    addInk(inkState.cur);
    logChange('Tinta añadida', tool === 'hi' ? 'marcador' : 'lápiz');
    save();
    drawInks();
    inkState.cur = null;
  }
  if (tool === 'lasso') { endLasso(); }
}
function drawCurrentInk() {
  if (!inkState.cur || !canvasContentEl) return;
  var svg = canvasContentEl.querySelector('.ink-layer');
  if (!svg) return;
  var box = inkLayerBox();
  var curW = parseFloat(svg.getAttribute('width')) || box.maxX;
  var curH = parseFloat(svg.getAttribute('height')) || box.maxY;
  var pts = inkState.cur.points || [];
  var maxX = box.maxX, maxY = box.maxY;
  pts.forEach(function (p) { maxX = Math.max(maxX, p.x + 60); maxY = Math.max(maxY, p.y + 60); });
  if (maxX > curW) svg.setAttribute('width', String(maxX));
  if (maxY > curH) svg.setAttribute('height', String(maxY));
  var d = renderStrokePath(inkState.cur);
  if (!d) return;
  var curPath = svg.querySelector('.ink-cur-path');
  if (!curPath) {
    curPath = document.createElementNS(SVGNS, 'path');
    curPath.setAttribute('class', 'ink-cur-path');
    curPath.setAttribute('stroke', 'none');
    svg.appendChild(curPath);
  }
  curPath.setAttribute('d', d);
  curPath.setAttribute('fill', inkState.cur.color);
  if (inkState.cur.tool === 'hi') curPath.setAttribute('fill-opacity', '0.55'); else curPath.removeAttribute('fill-opacity');
}
function eraseInkAt(p) {
  var noteId = ui.currentNoteId;
  var list = inksOf(noteId);
  var changed = false;
  list.forEach(function (s) {
    // El trazo renderizado por perfect-freehand puede ser más ancho que size; usamos un margen generoso.
    var hitDist = Math.max(12, (s.size || 3) * 1.2);
    var hit = (s.points || []).some(function (q) {
      var d = Math.hypot(q.x - p.x, q.y - p.y);
      return d < hitDist;
    });
    if (hit) { dropInksFor(s.id); changed = true; }
  });
  if (changed) { debouncedSave(); drawInks(); }
}
function startLasso(p) {
  clearInkSelection();
  inkState.lasso = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
}
function moveLasso(p) {
  if (!inkState.lasso) return;
  inkState.lasso.x2 = p.x; inkState.lasso.y2 = p.y;
}
function drawLasso() {
  if (!inkState.lasso || !canvasContentEl) return;
  var svg = canvasContentEl.querySelector('.ink-layer');
  if (!svg) return;
  var el = svg.querySelector('.ink-lasso-rect');
  if (!el) { el = document.createElementNS(SVGNS, 'rect'); el.setAttribute('class', 'ink-lasso-rect'); svg.appendChild(el); }
  var l = inkState.lasso;
  el.setAttribute('x', String(Math.min(l.x1, l.x2)));
  el.setAttribute('y', String(Math.min(l.y1, l.y2)));
  el.setAttribute('width', String(Math.abs(l.x2 - l.x1)));
  el.setAttribute('height', String(Math.abs(l.y2 - l.y1)));
}
function endLasso() {
  if (!inkState.lasso) return;
  var l = inkState.lasso; inkState.lasso = null;
  var left = Math.min(l.x1, l.x2), top = Math.min(l.y1, l.y2);
  var w = Math.abs(l.x2 - l.x1), h = Math.abs(l.y2 - l.y1);
  if (w < 8 || h < 8) { drawInks(); return; }
  (data.inks || []).forEach(function (s) {
    if (s.noteId !== ui.currentNoteId) return;
    var inside = (s.points || []).some(function (p) { return p.x >= left && p.x <= left + w && p.y >= top && p.y <= top + h; });
    if (inside) s.selected = true;
  });
  drawInks();
}

// ---------- Menú radial (Alt) ----------
var radialEl = null;
function openRadial(cx, cy) {
  closeRadial();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) return;
  var opts = [
    { type: 'text', label: 'Nota', icon: 'grip' },
    { type: 'freetext', label: 'Texto', icon: 'type' },
    { type: 'table', label: 'Tabla', icon: 'table' },
    { type: 'code', label: 'C\u00f3digo', icon: 'code' },
    { type: 'python', label: 'Python', icon: 'python' },
    { type: 'json', label: 'JSON', icon: 'braces' },
    { type: 'curl', label: 'cURL', icon: 'terminal' },
    { type: 'freeimage', label: 'Imagen', icon: 'image' },
    { type: 'aiimage', label: 'Imagen IA', icon: 'spark' },
    { type: 'shape', label: 'Forma', icon: 'shapes' },
    { type: 'markdown', label: 'Markdown', icon: 'format' },
    { type: 'mermaid', label: 'Mermaid', icon: 'graph' },
    { type: 'draw', label: 'Dibujo', icon: 'pencil' },
  ];
  var n = opts.length;
  // Los botones son cuadrados de 58px: dos vecinos chocan si sus cajas se acercan menos
  // de 60px en X y en Y a la vez (el peor caso es el par que cae sobre una diagonal).
  // Se desfasa el anillo medio paso para alejar los pares de las diagonales y se busca
  // el radio minimo sin choques.
  var step = 360 / n, start = -90 + step / 2, btnSize = 60;
  var R = 86;
  for (; R < 400; R += 2) {
    var chord = 2 * R * Math.sin((step / 2) * Math.PI / 180), ok = true;
    for (var i = 0; i < n; i++) {
      var mid = ((start + step * i + step / 2) * Math.PI) / 180;
      if (chord * Math.max(Math.abs(Math.sin(mid)), Math.abs(Math.cos(mid))) < btnSize) { ok = false; break; }
    }
    if (ok) break;
  }
  // Mantener el menu completo dentro de la ventana (R + mitad del boton + margen)
  var pad = R + 44;
  cx = Math.min(Math.max(cx, pad), Math.max(pad, window.innerWidth - pad));
  cy = Math.min(Math.max(cy, pad), Math.max(pad, window.innerHeight - pad));
  radialEl = h('div', { class: 'radial', style: { left: cx + 'px', top: cy + 'px' } });
  opts.forEach(function (o, i) {
    var ang = (start + step * i) * Math.PI / 180;
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
