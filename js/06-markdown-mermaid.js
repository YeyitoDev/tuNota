/* tuNota — Markdown y diagramas Mermaid (render + editor interactivo de nodos y flechas).
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Markdown ----------
function mdEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function mdInline(text) {
  var codes = [];
  text = text.replace(/`([^`]+)`/g, function (m, c) { codes.push('<code class="md-code">' + mdEscape(c) + '</code>'); return '\u0000IC' + (codes.length - 1) + '\u0000'; });
  text = mdEscape(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">');
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/\u0000IC(\d+)\u0000/g, function (m, n) { return codes[+n]; });
  return text;
}
function mdSplitRow(r) {
  return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
}
function renderMarkdown(src) {
  src = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
  var codeBlocks = [];
  src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, function (m, lang, code) {
    codeBlocks.push('<pre class="md-pre"><code>' + mdEscape(code.replace(/\n$/, '')) + '</code></pre>');
    return '\u0000CB' + (codeBlocks.length - 1) + '\u0000';
  });
  var lines = src.split('\n'), out = [], i = 0;
  var isBlock = function (l) {
    return /^\u0000CB\d+\u0000$/.test(l) || /^(#{1,6})\s+/.test(l) || /^\s*>\s?/.test(l) ||
      /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^\s*([-*_])\1\1+\s*$/.test(l);
  };
  while (i < lines.length) {
    var line = lines[i];
    var cb = line.match(/^\u0000CB(\d+)\u0000$/);
    if (cb) { out.push(codeBlocks[+cb[1]]); i++; continue; }
    if (/^\s*$/.test(line)) { i++; continue; }
    var hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { var lvl = hm[1].length; out.push('<h' + lvl + '>' + mdInline(hm[2].trim()) + '</h' + lvl + '>'); i++; continue; }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      var header = mdSplitRow(line); i += 2; var rows = [];
      while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) { rows.push(mdSplitRow(lines[i])); i++; }
      var thead = '<thead><tr>' + header.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr></thead>';
      var tbody = '<tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
      out.push('<table class="md-table">' + thead + tbody + '</table>');
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      var quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push('<blockquote>' + mdInline(quote.join(' ')) + '</blockquote>');
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      var items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push('<li>' + mdInline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>'); i++; }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      var oitems = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { oitems.push('<li>' + mdInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
      out.push('<ol>' + oitems.join('') + '</ol>');
      continue;
    }
    var para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlock(lines[i])) { para.push(lines[i]); i++; }
    out.push('<p>' + mdInline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
  }
  return out.join('\n') || '<p class="md-empty">Vac\u00edo</p>';
}
function markdownBody(b) {
  b.content = b.content || {};
  var view = h('div', { class: 'md-render' });
  view.innerHTML = renderMarkdown(b.content.text || '');
  view.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var ta = h('textarea', { class: 'card-ta mono md-src', placeholder: '# T\u00edtulo\n\nEscribe **Markdown**...' });
  ta.value = b.content.text || '';
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange('Markdown editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  return [view, ta];
}
function toggleMdEdit(b, el) {
  var editing = el.classList.toggle('editing-md');
  if (editing) { var ta = el.querySelector('.md-src'); if (ta) ta.focus(); }
  else { var view = el.querySelector('.md-render'); if (view) view.innerHTML = renderMarkdown(b.content.text || ''); }
}
// ---------- Mermaid (diagramas) ----------
var mermaidReady = false;
function ensureMermaid() {
  if (!window.mermaid) return false;
  if (!mermaidReady) {
    try {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral', suppressErrorRendering: true, flowchart: { htmlLabels: false }, fontFamily: 'Nunito, system-ui, sans-serif' });
      mermaidReady = true;
    } catch (e) {}
  }
  return true;
}
function renderMermaid(view, code, onDone) {
  var src = String(code == null ? '' : code).trim();
  view.classList.remove('mmd-has-error');
  if (!src) { view.innerHTML = '<div class="mmd-empty">Escribe c\u00f3digo Mermaid y pulsa \u201cver diagrama\u201d.</div>'; return; }
  if (!ensureMermaid()) {
    view.innerHTML = '<div class="mmd-err">Mermaid no est\u00e1 disponible. Necesitas conexi\u00f3n a internet para cargarlo.</div>';
    return;
  }
  var gid = 'mmd-' + Math.random().toString(36).slice(2);
  try {
    var p = window.mermaid.render(gid, src);
    if (p && typeof p.then === 'function') {
      p.then(function (res) {
        view.innerHTML = (res && res.svg) || '';
        cleanupMmdTemp(gid);
        if (onDone) onDone();
      }).catch(function (err) {
        cleanupMmdTemp(gid);
        view.classList.add('mmd-has-error');
        view.innerHTML = '<div class="mmd-err">Error de sintaxis Mermaid:\n' + mdEscape(String((err && err.message) || err)) + '</div>';
      });
    } else if (typeof p === 'string') {
      view.innerHTML = p;
      cleanupMmdTemp(gid);
      if (onDone) onDone();
    }
  } catch (err) {
    cleanupMmdTemp(gid);
    view.classList.add('mmd-has-error');
    view.innerHTML = '<div class="mmd-err">Error de sintaxis Mermaid:\n' + mdEscape(String((err && err.message) || err)) + '</div>';
  }
}
function cleanupMmdTemp(gid) {
  // Solo elimina nodos temporales que Mermaid deja colgados directamente del <body>,
  // nunca el <svg id="gid"> que acabamos de insertar dentro de la vista.
  ['#' + gid, '#d' + gid].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el && el.parentNode === document.body) el.parentNode.removeChild(el);
  });
}
function mermaidBody(b) {
  b.content = b.content || {};
  var view = h('div', { class: 'mmd-render' });
  view._block = b;
  view.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  view.addEventListener('wheel', function (e) { if (!(view.closest('.card') && view.closest('.card').classList.contains('mmd-interactive'))) e.stopPropagation(); });
  mmdAttachHandlers(view);
  var ta = h('textarea', { class: 'card-ta mono mmd-src', spellcheck: 'false', placeholder: 'graph TD\n  A[Inicio] --> B[Fin]' });
  ta.value = b.content.text || '';
  var reT;
  ta.addEventListener('input', function () {
    b.content.text = ta.value; touchNote(b.noteId); debouncedSave();
    clearTimeout(reT); reT = setTimeout(function () { renderMmdCard(view, b); }, 400);
  });
  ta.addEventListener('change', function () { logChange('Diagrama Mermaid editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '  '); b.content.text = ta.value; debouncedSave(); } });
  scheduleMmdRender(view, b);
  return [view, ta];
}
function scheduleMmdRender(view, b, tries) {
  tries = tries || 0;
  requestAnimationFrame(function () {
    if (!view.isConnected && tries < 20) { scheduleMmdRender(view, b, tries + 1); return; }
    renderMmdCard(view, b);
  });
}
function renderMmdCard(view, b) {
  view._block = b;
  renderMermaid(view, b.content && b.content.text, function () { setupMmdController(view, b); });
}
function toggleMmdEdit(b, el) {
  var editing = el.classList.toggle('editing-mmd');
  if (editing) { el.classList.remove('mmd-interactive'); var ta = el.querySelector('.mmd-src'); if (ta) ta.focus(); }
  else { var view = el.querySelector('.mmd-render'); if (view) renderMmdCard(view, b); }
}
function toggleMmdMove(b, el) {
  var on = el.classList.toggle('mmd-interactive');
  if (on) el.classList.remove('editing-mmd');
  var view = el.querySelector('.mmd-render');
  if (view) renderMmdCard(view, b);
}

// ---------- Mermaid interactivo: mover / escalar / editar / zoom ----------
var MMD_NS = 'http://www.w3.org/2000/svg';
function mmdEnsureLayout(b) {
  b.content = b.content || {};
  var L = b.content.layout;
  if (!L || typeof L !== 'object') { L = {}; b.content.layout = L; }
  if (!L.pan || typeof L.pan !== 'object') L.pan = { x: 0, y: 0, k: 1 };
  if (typeof L.pan.k !== 'number' || !L.pan.k) L.pan.k = 1;
  if (typeof L.pan.x !== 'number') L.pan.x = 0;
  if (typeof L.pan.y !== 'number') L.pan.y = 0;
  if (!L.nodes || typeof L.nodes !== 'object') L.nodes = {};
  if (!L.edges || typeof L.edges !== 'object') L.edges = {};
  return L;
}
function mmdRawId(id) {
  if (!id) return '';
  return String(id).replace(/^[A-Za-z]+-/, '').replace(/-\d+$/, '');
}
function mmdTranslate(g) {
  var t = (g && g.getAttribute('transform')) || '';
  var m = /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)/.exec(t);
  return { x: m ? parseFloat(m[1]) : 0, y: m ? parseFloat(m[2]) : 0 };
}
function mmdViewport(svg) {
  if (svg._vp && svg._vp.parentNode === svg) return svg._vp;
  var g = document.createElementNS(MMD_NS, 'g');
  g.setAttribute('class', 'mmd-vp');
  while (svg.firstChild) g.appendChild(svg.firstChild);
  svg.appendChild(g);
  svg._vp = g;
  return g;
}
function mmdCollectNodes(svg) {
  var map = {};
  var list = svg.querySelectorAll('.node');
  Array.prototype.forEach.call(list, function (g) {
    var raw = mmdRawId(g.id);
    if (!raw) return;
    var t = mmdTranslate(g);
    var bb;
    try { bb = g.getBBox(); } catch (e) { bb = { width: 60, height: 32 }; }
    map[raw] = { g: g, baseX: t.x, baseY: t.y, hw: Math.max(6, bb.width / 2), hh: Math.max(5, bb.height / 2), dx: 0, dy: 0, sx: 1, sy: 1 };
  });
  return map;
}
function mmdEdgeEnds(id, nodeMap, rawIds) {
  if (!id) return null;
  var m = /^L[_-]([\s\S]+?)[_-]\d+$/.exec(id) || /^L[_-]([\s\S]+)$/.exec(id);
  if (!m) return null;
  var mid = m[1];
  for (var i = 0; i < rawIds.length; i++) {
    var s = rawIds[i];
    if (mid.length > s.length && mid.slice(0, s.length) === s) {
      var sep = mid.charAt(s.length);
      if (sep === '_' || sep === '-') {
        var rest = mid.slice(s.length + 1);
        if (nodeMap[rest]) return [s, rest];
      }
    }
  }
  var parts = mid.split(/[_-]/);
  if (parts.length >= 2) {
    var a = parts[0], b2 = parts.slice(1).join('_');
    if (nodeMap[a] && nodeMap[b2]) return [a, b2];
  }
  return null;
}
function mmdCollectEdges(svg, nodeMap, rawIds) {
  var paths = svg.querySelectorAll('.edgePaths path, path.flowchart-link, .edgePath path');
  var labelNodes = svg.querySelectorAll('.edgeLabels .edgeLabel, .edgeLabel');
  var matchLabels = labelNodes.length === paths.length;
  var edges = [];
  var occ = {};
  Array.prototype.forEach.call(paths, function (p, i) {
    var ends = mmdEdgeEnds(p.id, nodeMap, rawIds);
    var src = ends && ends[0], dst = ends && ends[1];
    var pair = src + '\u0001' + dst;
    var o = occ[pair] = (occ[pair] == null ? 0 : occ[pair] + 1);
    edges.push({ path: p, src: src, dst: dst, occ: o, key: src + '\u0001' + dst + '\u0001' + o, label: matchLabels ? labelNodes[i] : null });
  });
  return edges;
}
function mmdBoxEdge(cx, cy, hw, hh, tx, ty) {
  var dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  var sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  var sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  var s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s };
}
function mmdNodeCenter(n) { return { x: n.baseX + n.dx, y: n.baseY + n.dy, hw: n.hw * (n.sx || 1), hh: n.hh * (n.sy || 1) }; }
function mmdRedrawEdge(e, nodeMap, edgesLayout) {
  if (!e.src || !e.dst) return;
  var s = nodeMap[e.src], t = nodeMap[e.dst];
  if (!s || !t) return;
  var sc = mmdNodeCenter(s), tc = mmdNodeCenter(t);
  var bend = edgesLayout && e.key && edgesLayout[e.key] && edgesLayout[e.key].bend;
  var cx = (sc.x + tc.x) / 2 + (bend ? bend.x : 0);
  var cy = (sc.y + tc.y) / 2 + (bend ? bend.y : 0);
  var aim1 = bend ? { x: cx, y: cy } : tc;
  var aim2 = bend ? { x: cx, y: cy } : sc;
  var p1 = mmdBoxEdge(sc.x, sc.y, sc.hw, sc.hh, aim1.x, aim1.y);
  var p2 = mmdBoxEdge(tc.x, tc.y, tc.hw, tc.hh, aim2.x, aim2.y);
  var d;
  if (bend && (bend.x || bend.y)) {
    var qx = 2 * cx - (p1.x + p2.x) / 2;
    var qy = 2 * cy - (p1.y + p2.y) / 2;
    d = 'M' + p1.x + ',' + p1.y + ' Q' + qx + ',' + qy + ' ' + p2.x + ',' + p2.y;
    e.mid = { x: cx, y: cy };
  } else {
    d = 'M' + p1.x + ',' + p1.y + ' L' + p2.x + ',' + p2.y;
    e.mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  e.path.setAttribute('d', d);
  if (e.hit) e.hit.setAttribute('d', d);
  e.p1 = p1; e.p2 = p2;
  if (e.label) e.label.setAttribute('transform', 'translate(' + e.mid.x + ',' + e.mid.y + ')');
}
function mmdPlaceNode(n) {
  var x = n.baseX + n.dx, y = n.baseY + n.dy;
  var tr = 'translate(' + x + ',' + y + ')';
  if ((n.sx && n.sx !== 1) || (n.sy && n.sy !== 1)) tr += ' scale(' + (n.sx || 1) + ',' + (n.sy || 1) + ')';
  n.g.setAttribute('transform', tr);
}
function mmdApplyPan(ctrl, L) {
  ctrl.vp.setAttribute('transform', 'translate(' + L.pan.x + ',' + L.pan.y + ') scale(' + L.pan.k + ')');
}
function setupMmdController(view, b) {
  view._mmd = null;
  var svg = view.querySelector('svg');
  if (!svg) return;
  var vp = mmdViewport(svg);
  var nodes = mmdCollectNodes(svg);
  var rawIds = Object.keys(nodes).sort(function (a, c) { return c.length - a.length; });
  var edges = mmdCollectEdges(svg, nodes, rawIds);
  var ctrl = { svg: svg, vp: vp, nodes: nodes, edges: edges, b: b, sel: null, selEdge: -1, handle: null };
  view._mmd = ctrl;
  var L = mmdEnsureLayout(b);
  Object.keys(nodes).forEach(function (raw) {
    var n = nodes[raw], ov = L.nodes[raw];
    if (ov) { n.dx = ov.dx || 0; n.dy = ov.dy || 0; n.sx = ov.sx || 1; n.sy = ov.sy || 1; }
    mmdPlaceNode(n);
  });
  var interactive = view.closest('.card') && view.closest('.card').classList.contains('mmd-interactive');
  edges.forEach(function (e, i) {
    if (interactive) {
      var hit = document.createElementNS(MMD_NS, 'path');
      hit.setAttribute('class', 'mmd-edge-hit');
      hit.setAttribute('fill', 'none');
      hit.__edgeIndex = i;
      vp.appendChild(hit);
      e.hit = hit;
    }
    mmdRedrawEdge(e, nodes, L.edges);
  });
  mmdApplyPan(ctrl, L);
}
function mmdClientToSpace(el, cx, cy) {
  var svg = el.ownerSVGElement || el;
  var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  var m = el.getScreenCTM();
  if (!m) return { x: cx, y: cy };
  var p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
function mmdAttachHandlers(view) {
  if (view._mmdBound) return;
  view._mmdBound = true;
  view.addEventListener('mousedown', function (e) {
    var card = view.closest('.card');
    if (!card || !card.classList.contains('mmd-interactive')) return;
    var ctrl = view._mmd, b = view._block;
    if (!ctrl || !b) return;
    e.stopPropagation();
    var ep = e.target.closest && e.target.closest('.mmd-ep');
    if (ep) { mmdStartReconnect(e, view, ctrl, b, ep); return; }
    var bendH = e.target.closest && e.target.closest('.mmd-bend');
    if (bendH) { mmdStartBend(e, view, ctrl, b); return; }
    var handle = e.target.closest && e.target.closest('.mmd-handle');
    if (handle) { mmdStartResize(e, view, ctrl, b); return; }
    var hit = e.target.closest && e.target.closest('.mmd-edge-hit');
    if (hit && typeof hit.__edgeIndex === 'number') { mmdSelectEdge(view, ctrl, b, hit.__edgeIndex); return; }
    var g = e.target.closest && e.target.closest('.node');
    if (g) { mmdStartNodeDrag(e, view, ctrl, b, g); return; }
    mmdStartPan(e, view, ctrl, b);
  });
  view.addEventListener('wheel', function (e) {
    var card = view.closest('.card');
    if (!card || !card.classList.contains('mmd-interactive') || !view._mmd) return;
    e.preventDefault(); e.stopPropagation();
    mmdZoom(e, view, view._mmd, view._block);
  }, { passive: false });
  view.addEventListener('dblclick', function (e) {
    var card = view.closest('.card');
    if (!card || !card.classList.contains('mmd-interactive')) return;
    e.stopPropagation(); e.preventDefault();
    var hit = e.target.closest && e.target.closest('.mmd-edge-hit');
    if (hit && typeof hit.__edgeIndex === 'number') { mmdEditEdgeLabel(view, view._mmd, view._block, hit.__edgeIndex); return; }
    var g = e.target.closest && e.target.closest('.node');
    if (g) mmdEditNodeLabel(view, view._mmd, view._block, g);
  });
}
function mmdSelect(ctrl, raw) {
  mmdDeselectEdge(ctrl);
  if (ctrl.sel === raw) { mmdPositionHandle(ctrl); return; }
  Object.keys(ctrl.nodes).forEach(function (k) { ctrl.nodes[k].g.classList.remove('mmd-sel'); });
  ctrl.sel = raw;
  if (raw && ctrl.nodes[raw]) { ctrl.nodes[raw].g.classList.add('mmd-sel'); mmdShowHandle(ctrl); }
  else mmdHideHandle(ctrl);
}
function mmdShowHandle(ctrl) {
  if (!ctrl.handle) {
    var r = document.createElementNS(MMD_NS, 'rect');
    r.setAttribute('class', 'mmd-handle');
    r.setAttribute('width', '11'); r.setAttribute('height', '11'); r.setAttribute('rx', '2');
    ctrl.handle = r;
  }
  if (ctrl.handle.parentNode !== ctrl.vp) ctrl.vp.appendChild(ctrl.handle);
  mmdPositionHandle(ctrl);
}
function mmdPositionHandle(ctrl) {
  if (!ctrl.handle || !ctrl.sel || !ctrl.nodes[ctrl.sel]) return;
  var c = mmdNodeCenter(ctrl.nodes[ctrl.sel]);
  ctrl.handle.setAttribute('x', (c.x + c.hw - 5.5));
  ctrl.handle.setAttribute('y', (c.y + c.hh - 5.5));
}
function mmdHideHandle(ctrl) { if (ctrl.handle && ctrl.handle.parentNode) ctrl.handle.parentNode.removeChild(ctrl.handle); }
function mmdStartNodeDrag(e, view, ctrl, b, g) {
  var raw = mmdRawId(g.id), n = ctrl.nodes[raw];
  if (!n) return;
  mmdSelect(ctrl, raw);
  var Ld = mmdEnsureLayout(b).edges;
  var start = mmdClientToSpace(ctrl.vp, e.clientX, e.clientY);
  var odx = n.dx, ody = n.dy, moved = false;
  function move(ev) {
    var p = mmdClientToSpace(ctrl.vp, ev.clientX, ev.clientY);
    n.dx = odx + (p.x - start.x); n.dy = ody + (p.y - start.y); moved = true;
    mmdPlaceNode(n);
    ctrl.edges.forEach(function (ed) { if (ed.src === raw || ed.dst === raw) mmdRedrawEdge(ed, ctrl.nodes, Ld); });
    mmdPositionHandle(ctrl);
  }
  function up() {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    if (!moved) return;
    var L = mmdEnsureLayout(b); L.nodes[raw] = L.nodes[raw] || {}; L.nodes[raw].dx = n.dx; L.nodes[raw].dy = n.dy;
    touchNote(b.noteId); logChange('Nodo movido', raw); save();
  }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function mmdStartResize(e, view, ctrl, b) {
  var raw = ctrl.sel, n = raw && ctrl.nodes[raw];
  if (!n) return;
  var Ld = mmdEnsureLayout(b).edges;
  var start = mmdClientToSpace(ctrl.vp, e.clientX, e.clientY);
  var w0 = n.hw * (n.sx || 1), h0 = n.hh * (n.sy || 1), changed = false;
  function move(ev) {
    var p = mmdClientToSpace(ctrl.vp, ev.clientX, ev.clientY);
    var nw = Math.max(8, w0 + (p.x - start.x)), nh = Math.max(6, h0 + (p.y - start.y));
    n.sx = nw / n.hw; n.sy = nh / n.hh; changed = true;
    mmdPlaceNode(n);
    ctrl.edges.forEach(function (ed) { if (ed.src === raw || ed.dst === raw) mmdRedrawEdge(ed, ctrl.nodes, Ld); });
    mmdPositionHandle(ctrl);
  }
  function up() {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    if (!changed) return;
    var L = mmdEnsureLayout(b); L.nodes[raw] = L.nodes[raw] || {}; L.nodes[raw].sx = n.sx; L.nodes[raw].sy = n.sy;
    touchNote(b.noteId); logChange('Nodo redimensionado', raw); save();
  }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function mmdStartPan(e, view, ctrl, b) {
  mmdSelect(ctrl, null);
  mmdDeselectEdge(ctrl);
  var L = mmdEnsureLayout(b);
  var start = mmdClientToSpace(ctrl.svg, e.clientX, e.clientY);
  var ox = L.pan.x, oy = L.pan.y, moved = false;
  view.classList.add('mmd-panning');
  function move(ev) {
    var p = mmdClientToSpace(ctrl.svg, ev.clientX, ev.clientY);
    L.pan.x = ox + (p.x - start.x); L.pan.y = oy + (p.y - start.y); moved = true;
    mmdApplyPan(ctrl, L);
  }
  function up() {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    view.classList.remove('mmd-panning');
    if (moved) { touchNote(b.noteId); debouncedSave(); }
  }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function mmdZoom(e, view, ctrl, b) {
  var L = mmdEnsureLayout(b);
  var c = mmdClientToSpace(ctrl.svg, e.clientX, e.clientY);
  var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  var nk = Math.min(5, Math.max(0.2, L.pan.k * factor));
  L.pan.x = c.x - (c.x - L.pan.x) * (nk / L.pan.k);
  L.pan.y = c.y - (c.y - L.pan.y) * (nk / L.pan.k);
  L.pan.k = nk;
  mmdApplyPan(ctrl, L);
  if (ctrl.selEdge >= 0) mmdPositionEdgeToolbar(view, ctrl);
  touchNote(b.noteId); debouncedSave();
}
// --- Edici\u00f3n de etiqueta de nodo (sincroniza con el c\u00f3digo Mermaid) ---
function mmdEscRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function mmdCloseFor(openStr) {
  var map = { '[': ']', '(': ')', '{': '}', '/': '/', '\\': '\\', '>': ']' };
  var out = '';
  for (var i = 0; i < openStr.length; i++) out += (map[openStr[i]] || '');
  return out.split('').reverse().join('');
}
function mmdFindLabelRegion(src, raw) {
  var re = new RegExp('(^|[^\\w-])' + mmdEscRe(raw) + '(\\s*)([\\[({>/\\\\]+)');
  var m = re.exec(src);
  if (!m) return null;
  var openStr = m[3];
  var openEnd = m.index + m[0].length;
  var closeStr = mmdCloseFor(openStr);
  if (!closeStr) return null;
  var closeStart = src.indexOf(closeStr, openEnd);
  if (closeStart < 0) return null;
  return { openEnd: openEnd, closeStart: closeStart, inner: src.slice(openEnd, closeStart) };
}
function mmdStripQuotes(s) { s = String(s).trim(); if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') return s.slice(1, -1); return s; }
function mmdGetLabel(src, raw) { var r = mmdFindLabelRegion(src, raw); return r ? mmdStripQuotes(r.inner) : raw; }
function mmdSetLabel(src, raw, text) {
  var r = mmdFindLabelRegion(src, raw);
  if (!r) return src;
  var val = '"' + String(text).replace(/"/g, '&quot;') + '"';
  return src.slice(0, r.openEnd) + val + src.slice(r.closeStart);
}
function mmdEditNodeLabel(view, ctrl, b, g) {
  var raw = mmdRawId(g.id);
  if (!raw) return;
  var src = (b.content && b.content.text) || '';
  var cur = mmdGetLabel(src, raw);
  var rect = g.getBoundingClientRect(), vr = view.getBoundingClientRect();
  var inp = h('input', { class: 'mmd-edit-input', spellcheck: 'false' });
  inp.value = cur;
  inp.style.left = (rect.left - vr.left) + 'px';
  inp.style.top = (rect.top - vr.top) + 'px';
  inp.style.width = Math.max(64, rect.width) + 'px';
  inp.style.height = Math.max(22, rect.height) + 'px';
  view.appendChild(inp);
  inp.focus(); inp.select();
  var done = false;
  function commit(apply) {
    if (done) return; done = true;
    var val = inp.value;
    if (inp.parentNode) inp.parentNode.removeChild(inp);
    if (apply && val !== cur) {
      b.content.text = mmdSetLabel(src, raw, val);
      var ta = view.parentNode && view.parentNode.querySelector('.mmd-src');
      if (ta) ta.value = b.content.text;
      touchNote(b.noteId); logChange('Etiqueta de nodo editada', raw + ': ' + val); save();
      renderMmdCard(view, b);
    }
  }
  inp.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
  });
  inp.addEventListener('blur', function () { commit(true); });
  inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
}

// ---------- Edici\u00f3n de flechas (aristas) ----------
var MMD_LINK_OPS = ['<-.->', '<-->', '<==>', 'o--o', 'x--x', '<-.-', '-.->', '-.-', '<==', '==>', '<--', '-->', '--o', '--x', 'o--', 'x--', '===', '---', '==', '--'];
MMD_LINK_OPS.sort(function (a, b) { return b.length - a.length; });
function mmdMatchLinkAt(src, k) {
  for (var i = 0; i < MMD_LINK_OPS.length; i++) {
    var op = MMD_LINK_OPS[i];
    if (src.substr(k, op.length) === op) return { op: op, start: k, end: k + op.length };
  }
  return null;
}
function mmdConsumeShape(src, i) {
  var openM = /^([\[({>/\\]+)/.exec(src.slice(i));
  if (!openM) return i;
  var openStr = openM[1];
  var closeStr = mmdCloseFor(openStr);
  if (!closeStr) return i;
  var closeAt = src.indexOf(closeStr, i + openStr.length);
  if (closeAt < 0) return i;
  return closeAt + closeStr.length;
}
function mmdConsumeNode(src, i) {
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
  var m = /^([A-Za-z0-9_]+)/.exec(src.slice(i));
  if (!m) return null;
  var id = m[1], idEnd = i + id.length;
  return { id: id, idStart: i, idEnd: idEnd, end: mmdConsumeShape(src, idEnd) };
}
function mmdParseEdges(src) {
  src = String(src || '');
  var out = [], i = 0, n = src.length, guard = 0;
  while (i < n && guard++ < 100000) {
    var from = mmdConsumeNode(src, i);
    if (!from) { i++; continue; }
    var k = from.end; while (k < n && (src[k] === ' ' || src[k] === '\t')) k++;
    var link = mmdMatchLinkAt(src, k);
    if (!link) { i = from.end > i ? from.end : i + 1; continue; }
    var opStart = k, opEnd = link.end, op = link.op, labelInfo = null, label = '';
    var p = opEnd; while (p < n && (src[p] === ' ' || src[p] === '\t')) p++;
    if (src[p] === '|') {
      var close = src.indexOf('|', p + 1);
      if (close > 0) { labelInfo = { start: p, end: close + 1, textStart: p + 1, textEnd: close }; label = src.slice(p + 1, close); p = close + 1; while (p < n && (src[p] === ' ' || src[p] === '\t')) p++; }
    }
    var to = mmdConsumeNode(src, p);
    if (!labelInfo && to && /^[-=.]+$/.test(op) && to.idEnd === to.end) {
      var q = to.end; while (q < n && (src[q] === ' ' || src[q] === '\t')) q++;
      var link2 = mmdMatchLinkAt(src, q);
      if (link2) {
        var realTo = mmdConsumeNode(src, link2.end);
        if (realTo) {
          out.push({ from: from.id, fromStart: from.idStart, fromEnd: from.idEnd, op: src.slice(opStart, link2.end), opStart: opStart, opEnd: link2.end, to: realTo.id, toStart: realTo.idStart, toEnd: realTo.idEnd, label: to.id, labelInfo: { inline: true, wordStart: to.idStart, wordEnd: to.idEnd } });
          i = realTo.idStart; continue;
        }
      }
    }
    if (!to) { i = opEnd; continue; }
    out.push({ from: from.id, fromStart: from.idStart, fromEnd: from.idEnd, op: op, opStart: opStart, opEnd: link.end, to: to.id, toStart: to.idStart, toEnd: to.idEnd, label: label, labelInfo: labelInfo });
    i = to.idStart;
  }
  return out;
}
function mmdMapEdge(ctrl, b, idx) {
  var e = ctrl.edges[idx];
  if (!e) return null;
  var parsed = mmdParseEdges((b.content && b.content.text) || '');
  if (parsed.length === ctrl.edges.length) return parsed[idx];
  var cnt = -1;
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i].from === e.src && parsed[i].to === e.dst) { cnt++; if (cnt === e.occ) return parsed[i]; }
  }
  return null;
}
function mmdParseOp(op) {
  op = String(op || '-->');
  var line = /=/.test(op) ? 'thick' : (/\./.test(op) ? 'dotted' : 'solid');
  var fwd = /[>ox]$/.test(op), back = /^</.test(op);
  var dir = back && fwd ? 'both' : (back ? 'back' : (fwd ? 'forward' : 'none'));
  return { line: line, dir: dir };
}
function mmdBuildOp(line, dir) {
  var map = {
    solid: { none: '---', forward: '-->', back: '<--', both: '<-->' },
    dotted: { none: '-.-', forward: '-.->', back: '<-.-', both: '<-.->' },
    thick: { none: '===', forward: '==>', back: '<==', both: '<==>' },
  };
  return (map[line] || map.solid)[dir] || '-->';
}
function mmdSpaceToClient(el, x, y) {
  var svg = el.ownerSVGElement || el;
  var pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  var m = el.getScreenCTM();
  if (!m) return { x: x, y: y };
  var p = pt.matrixTransform(m);
  return { x: p.x, y: p.y };
}
function mmdDeselectEdge(ctrl) {
  if (!ctrl) return;
  if (ctrl.selEdge >= 0 && ctrl.edges[ctrl.selEdge] && ctrl.edges[ctrl.selEdge].path) ctrl.edges[ctrl.selEdge].path.classList.remove('mmd-edge-sel');
  ctrl.selEdge = -1;
  if (ctrl.edgeHandles) ctrl.edgeHandles.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
  mmdHideEdgeToolbar(ctrl);
}
function mmdSelectEdge(view, ctrl, b, idx) {
  mmdSelect(ctrl, null);
  var e = ctrl.edges[idx];
  if (!e) return;
  ctrl.selEdge = idx;
  if (e.path) e.path.classList.add('mmd-edge-sel');
  mmdShowEdgeHandles(ctrl);
  mmdShowEdgeToolbar(view, ctrl, b);
}
function mmdShowEdgeHandles(ctrl) {
  if (!ctrl.edgeHandles) {
    var bend = document.createElementNS(MMD_NS, 'circle'); bend.setAttribute('class', 'mmd-bend'); bend.setAttribute('r', '6');
    var ep1 = document.createElementNS(MMD_NS, 'circle'); ep1.setAttribute('class', 'mmd-ep'); ep1.setAttribute('r', '6'); ep1.__end = 'src';
    var ep2 = document.createElementNS(MMD_NS, 'circle'); ep2.setAttribute('class', 'mmd-ep'); ep2.setAttribute('r', '6'); ep2.__end = 'dst';
    ctrl.edgeHandles = [bend, ep1, ep2];
  }
  ctrl.edgeHandles.forEach(function (el) { if (el.parentNode !== ctrl.vp) ctrl.vp.appendChild(el); });
  mmdPositionEdgeHandles(ctrl);
}
function mmdPositionEdgeHandles(ctrl) {
  if (!ctrl.edgeHandles || ctrl.selEdge < 0) return;
  var e = ctrl.edges[ctrl.selEdge]; if (!e) return;
  if (e.mid) { ctrl.edgeHandles[0].setAttribute('cx', e.mid.x); ctrl.edgeHandles[0].setAttribute('cy', e.mid.y); }
  if (e.p1) { ctrl.edgeHandles[1].setAttribute('cx', e.p1.x); ctrl.edgeHandles[1].setAttribute('cy', e.p1.y); }
  if (e.p2) { ctrl.edgeHandles[2].setAttribute('cx', e.p2.x); ctrl.edgeHandles[2].setAttribute('cy', e.p2.y); }
}
function mmdShowEdgeToolbar(view, ctrl, b) {
  mmdHideEdgeToolbar(ctrl);
  var bar = h('div', { class: 'mmd-edge-toolbar' });
  function mk(content, title, fn) {
    var btn = h('button', { class: 'mmd-etb-btn', title: title, onclick: function (ev) { ev.stopPropagation(); ev.preventDefault(); fn(); } }, content);
    btn.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    return btn;
  }
  bar.appendChild(mk('\u2014', 'L\u00ednea s\u00f3lida', function () { mmdApplyEdgeStyle(view, ctrl, b, 'solid'); }));
  bar.appendChild(mk('\u2504', 'L\u00ednea punteada', function () { mmdApplyEdgeStyle(view, ctrl, b, 'dotted'); }));
  bar.appendChild(mk('\u2501', 'L\u00ednea gruesa', function () { mmdApplyEdgeStyle(view, ctrl, b, 'thick'); }));
  bar.appendChild(mk('\u21C4', 'Cambiar direcci\u00f3n de la punta', function () { mmdCycleEdgeDir(view, ctrl, b); }));
  bar.appendChild(mk(icon('edit'), 'Editar etiqueta', function () { mmdEditEdgeLabel(view, ctrl, b, ctrl.selEdge); }));
  bar.appendChild(mk(icon('trash'), 'Borrar flecha', function () { mmdDeleteEdge(view, ctrl, b); }));
  bar.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
  view.appendChild(bar);
  ctrl.edgeToolbar = bar;
  mmdPositionEdgeToolbar(view, ctrl);
}
function mmdPositionEdgeToolbar(view, ctrl) {
  if (!ctrl.edgeToolbar || ctrl.selEdge < 0) return;
  var e = ctrl.edges[ctrl.selEdge]; if (!e || !e.mid) return;
  var pos = mmdSpaceToClient(ctrl.vp, e.mid.x, e.mid.y);
  var vr = view.getBoundingClientRect();
  ctrl.edgeToolbar.style.left = (pos.x - vr.left) + 'px';
  ctrl.edgeToolbar.style.top = (pos.y - vr.top) + 'px';
}
function mmdHideEdgeToolbar(ctrl) { if (ctrl && ctrl.edgeToolbar && ctrl.edgeToolbar.parentNode) ctrl.edgeToolbar.parentNode.removeChild(ctrl.edgeToolbar); if (ctrl) ctrl.edgeToolbar = null; }
function mmdStartBend(e, view, ctrl, b) {
  var edge = ctrl.edges[ctrl.selEdge];
  if (!edge || !edge.src || !edge.dst) return;
  var s = ctrl.nodes[edge.src], t = ctrl.nodes[edge.dst];
  if (!s || !t) return;
  var L = mmdEnsureLayout(b), changed = false;
  function move(ev) {
    var p = mmdClientToSpace(ctrl.vp, ev.clientX, ev.clientY);
    var sc = mmdNodeCenter(s), tc = mmdNodeCenter(t);
    L.edges[edge.key] = L.edges[edge.key] || {};
    L.edges[edge.key].bend = { x: p.x - (sc.x + tc.x) / 2, y: p.y - (sc.y + tc.y) / 2 };
    changed = true;
    mmdRedrawEdge(edge, ctrl.nodes, L.edges);
    mmdPositionEdgeHandles(ctrl); mmdPositionEdgeToolbar(view, ctrl);
  }
  function up() {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    if (changed) { touchNote(b.noteId); logChange('Flecha curvada', edge.src + '\u2192' + edge.dst); save(); }
  }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function mmdStartReconnect(e, view, ctrl, b, ep) {
  var edge = ctrl.edges[ctrl.selEdge];
  if (!edge) return;
  var which = ep.__end;
  var fixed = which === 'src' ? edge.p2 : edge.p1;
  var line = document.createElementNS(MMD_NS, 'line'); line.setAttribute('class', 'mmd-reconnect-line');
  ctrl.vp.appendChild(line);
  ctrl.edges.forEach(function (ed) { if (ed.hit) ed.hit.style.pointerEvents = 'none'; });
  var lastG = null;
  function move(ev) {
    var p = mmdClientToSpace(ctrl.vp, ev.clientX, ev.clientY);
    line.setAttribute('x1', fixed.x); line.setAttribute('y1', fixed.y); line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
    var over = document.elementFromPoint(ev.clientX, ev.clientY);
    var g = over && over.closest && over.closest('.node');
    if (g !== lastG) { if (lastG) lastG.classList.remove('mmd-drop'); if (g) g.classList.add('mmd-drop'); lastG = g; }
  }
  function up(ev) {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    if (line.parentNode) line.parentNode.removeChild(line);
    if (lastG) lastG.classList.remove('mmd-drop');
    var over = document.elementFromPoint(ev.clientX, ev.clientY);
    var g = over && over.closest && over.closest('.node');
    var raw = g && mmdRawId(g.id);
    if (raw) mmdReconnectEdge(view, ctrl, b, which, raw);
    else renderMmdCard(view, b);
  }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}
function mmdReconnectEdge(view, ctrl, b, which, newRaw) {
  var pe = mmdMapEdge(ctrl, b, ctrl.selEdge);
  if (!pe) { renderMmdCard(view, b); return; }
  var src = (b.content && b.content.text) || '';
  if (which === 'src') b.content.text = src.slice(0, pe.fromStart) + newRaw + src.slice(pe.fromEnd);
  else b.content.text = src.slice(0, pe.toStart) + newRaw + src.slice(pe.toEnd);
  var ta = view.parentNode && view.parentNode.querySelector('.mmd-src'); if (ta) ta.value = b.content.text;
  touchNote(b.noteId); logChange('Flecha reconectada', (which === 'src' ? newRaw + '\u2192' + pe.to : pe.from + '\u2192' + newRaw)); save();
  renderMmdCard(view, b);
}
function mmdSetEdgeLabel(src, pe, text) {
  text = String(text).replace(/\|/g, '');
  if (pe.labelInfo && pe.labelInfo.inline) {
    if (text === '') return src;
    return src.slice(0, pe.labelInfo.wordStart) + text + src.slice(pe.labelInfo.wordEnd);
  }
  if (pe.labelInfo) {
    if (text === '') return src.slice(0, pe.labelInfo.start) + src.slice(pe.labelInfo.end);
    return src.slice(0, pe.labelInfo.textStart) + text + src.slice(pe.labelInfo.textEnd);
  }
  if (text === '') return src;
  return src.slice(0, pe.opEnd) + '|' + text + '|' + src.slice(pe.opEnd);
}
function mmdEditEdgeLabel(view, ctrl, b, idx) {
  if (ctrl.selEdge !== idx) mmdSelectEdge(view, ctrl, b, idx);
  var edge = ctrl.edges[idx]; if (!edge || !edge.mid) return;
  var pe = mmdMapEdge(ctrl, b, idx);
  var cur = pe ? pe.label : '';
  var pos = mmdSpaceToClient(ctrl.vp, edge.mid.x, edge.mid.y);
  var vr = view.getBoundingClientRect();
  var inp = h('input', { class: 'mmd-edit-input', spellcheck: 'false' });
  inp.value = cur;
  inp.style.left = (pos.x - vr.left - 45) + 'px';
  inp.style.top = (pos.y - vr.top - 12) + 'px';
  inp.style.width = '96px';
  view.appendChild(inp);
  inp.focus(); inp.select();
  var done = false;
  function commit(apply) {
    if (done) return; done = true;
    var val = inp.value;
    if (inp.parentNode) inp.parentNode.removeChild(inp);
    if (apply && pe && val !== cur) {
      b.content.text = mmdSetEdgeLabel((b.content && b.content.text) || '', pe, val);
      var ta = view.parentNode && view.parentNode.querySelector('.mmd-src'); if (ta) ta.value = b.content.text;
      touchNote(b.noteId); logChange('Etiqueta de flecha editada', edge.src + '\u2192' + edge.dst + ': ' + val); save();
      renderMmdCard(view, b);
    }
  }
  inp.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); } });
  inp.addEventListener('blur', function () { commit(true); });
  inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
}
function mmdWriteEdgeOp(view, ctrl, b, pe, op, msg) {
  var src = (b.content && b.content.text) || '';
  b.content.text = src.slice(0, pe.opStart) + op + src.slice(pe.opEnd);
  var ta = view.parentNode && view.parentNode.querySelector('.mmd-src'); if (ta) ta.value = b.content.text;
  touchNote(b.noteId); logChange(msg, pe.from + ' ' + op + ' ' + pe.to); save();
  renderMmdCard(view, b);
}
function mmdApplyEdgeStyle(view, ctrl, b, line) {
  var pe = mmdMapEdge(ctrl, b, ctrl.selEdge); if (!pe) return;
  mmdWriteEdgeOp(view, ctrl, b, pe, mmdBuildOp(line, mmdParseOp(pe.op).dir), 'Estilo de flecha');
}
function mmdCycleEdgeDir(view, ctrl, b) {
  var pe = mmdMapEdge(ctrl, b, ctrl.selEdge); if (!pe) return;
  var cur = mmdParseOp(pe.op), order = ['forward', 'back', 'both', 'none'];
  var next = order[(order.indexOf(cur.dir) + 1) % order.length];
  mmdWriteEdgeOp(view, ctrl, b, pe, mmdBuildOp(cur.line, next), 'Direcci\u00f3n de flecha');
}
function mmdDeleteEdge(view, ctrl, b) {
  var pe = mmdMapEdge(ctrl, b, ctrl.selEdge); if (!pe) return;
  var src = (b.content && b.content.text) || '';
  var ls = src.lastIndexOf('\n', pe.fromStart - 1) + 1;
  var le = src.indexOf('\n', pe.toEnd); if (le < 0) le = src.length;
  if (mmdParseEdges(src.slice(ls, le)).length !== 1) { alert('Esta l\u00ednea tiene varias conexiones; ed\u00edtala desde el c\u00f3digo.'); return; }
  b.content.text = src.slice(0, ls) + src.slice(le + (src.charAt(le) === '\n' ? 1 : 0));
  var ta = view.parentNode && view.parentNode.querySelector('.mmd-src'); if (ta) ta.value = b.content.text;
  touchNote(b.noteId); logChange('Flecha eliminada', pe.from + '\u2192' + pe.to); save();
  renderMmdCard(view, b);
}
function downloadMermaid(b, el) {
  var view = el.querySelector('.mmd-render');
  var svg = view && view.querySelector('svg');
  if (!svg) {
    // intenta renderizar antes de descargar
    if (view) renderMermaid(view, b.content && b.content.text, function () {
      var s = view.querySelector('svg');
      if (s) exportSvgAsPng(s, 'diagrama-mermaid'); else alert('No hay un diagrama v\u00e1lido para descargar. Revisa la sintaxis.');
    });
    else alert('No hay un diagrama v\u00e1lido para descargar.');
    return;
  }
  exportSvgAsPng(svg, 'diagrama-mermaid');
}
function svgDimensions(svg) {
  var w = 0, h = 0;
  if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) { w = svg.viewBox.baseVal.width; h = svg.viewBox.baseVal.height; }
  if (!w) { var r = svg.getBoundingClientRect(); w = r.width; h = r.height; }
  if (!w) { w = 800; h = 600; }
  return { w: w, h: h };
}
function exportSvgAsPng(svg, filename) {
  var dim = svgDimensions(svg);
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', dim.w);
  clone.setAttribute('height', dim.h);
  var xml = new XMLSerializer().serializeToString(clone);
  var svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  var img = new Image();
  img.onload = function () {
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(dim.w * scale));
    canvas.height = Math.max(1, Math.round(dim.h * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      canvas.toBlob(function (blob) {
        if (!blob) { downloadDataUrl(svgUrl, filename + '.svg'); return; }
        var url = URL.createObjectURL(blob);
        downloadDataUrl(url, filename + '.png');
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      }, 'image/png');
    } catch (e) {
      downloadDataUrl(svgUrl, filename + '.svg');
    }
  };
  img.onerror = function () { downloadDataUrl(svgUrl, filename + '.svg'); };
  img.src = svgUrl;
}
function downloadDataUrl(url, filename) {
  var a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
