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
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        var liBody = lines[i].replace(/^\s*[-*+]\s+/, '');
        var tk = liBody.match(/^\[( |x|X)\]\s+(.*)$/); // casilla de tarea: - [ ] / - [x]
        if (tk) {
          var done = tk[1] !== ' ';
          items.push('<li class="md-task' + (done ? ' done' : '') + '">' +
            '<input type="checkbox" class="md-task-cb" data-ln="' + i + '"' + (done ? ' checked' : '') + '>' +
            '<span class="md-task-txt">' + mdInline(tk[2]) + '</span>' +
            '<button class="md-task-bell" data-ln="' + i + '" title="Recordatorio para esta tarea">' + I.bell + '</button></li>');
        } else {
          items.push('<li>' + mdInline(liBody) + '</li>');
        }
        i++;
      }
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
function looksLikeMarkdown(text) {
  if (!text || typeof text !== 'string') return false;
  var t = text.replace(/\r\n?/g, '\n');
  var markers = [
    /^#{1,6}\s+/m,                 // encabezados
    /^\s*[-*+]\s+\[?[ xX]?\]?/m, // listas y tareas
    /^\s*\d+[.)]\s+/m,           // listas numeradas
    /^\s*>\s?/m,                  // citas
    /^```[\s\S]*```/m,            // bloques de código
    /\*\*[^*]+\*\*/,              // negrita
    /__[^_]+__/,                  // negrita alt
    /\*[^*]+\*/,                  // cursiva
    /`[^`]+`/,                    // código inline
    /!?\[[^\]]+\]\([^)]+\)/,      // enlaces / imágenes
    /^\s*([-*_])\1\1+\s*$/m       // regla horizontal
  ];
  for (var i = 0; i < markers.length; i++) {
    if (markers[i].test(t)) return true;
  }
  return false;
}
function markdownBody(b) {
  b.content = b.content || {};
  var view = h('div', { class: 'md-render' });
  view.innerHTML = renderMarkdown(b.content.text || '');
  view.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var ta = h('textarea', { class: 'card-ta mono md-src', placeholder: '# T\u00edtulo\n\nEscribe **Markdown**...' });
  ta.value = b.content.text || '';
  attachListAutoContinue(ta, function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); }, false); // Markdown: anidación simple (sin numeración con puntos)
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange('Markdown editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  // Barra de formato al editar: negrita, cursiva, tachado, c\u00f3digo, t\u00edtulo, listas, enlace.
  var fmtBar = h('div', { class: 'md-fmt-bar' });
  [
    ['B', 'Negrita', function () { mdWrapSel(ta, b, '**', '**'); }],
    ['I', 'Cursiva', function () { mdWrapSel(ta, b, '*', '*'); }],
    ['S', 'Tachado', function () { mdWrapSel(ta, b, '~~', '~~'); }],
    ['</>', 'C\u00f3digo', function () { mdWrapSel(ta, b, '`', '`'); }],
    ['H2', 'T\u00edtulo', function () { mdPrefixLines(ta, b, '## '); }],
    ['\u2022', 'Vi\u00f1etas', function () { mdPrefixLines(ta, b, '- '); }],
    ['1.', 'Numerar', function () { mdPrefixLines(ta, b, null); }],
    ['\u2610', 'Casilla', function () { mdPrefixLines(ta, b, '- [ ] '); }],
    ['\ud83d\udd17', 'Enlace', function () { mdWrapSel(ta, b, '[', '](url)'); }],
  ].forEach(function (it) {
    fmtBar.appendChild(h('button', { class: 'md-fmt-b', title: it[1], onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); }, onclick: function (e) { e.stopPropagation(); it[2](); } }, it[0]));
  });
  // Casillas interactivas: clic marca/desmarca (edita la l\u00ednea fuente); campana =
  // recordatorio con el texto de ESA tarea (alarma, sonido y calendario incluidos).
  view.addEventListener('click', function (e) {
    var cb = e.target.closest ? e.target.closest('.md-task-cb') : null;
    var bell = e.target.closest ? e.target.closest('.md-task-bell') : null;
    if (!cb && !bell) return;
    e.stopPropagation();
    var ln = parseInt((cb || bell).getAttribute('data-ln'), 10);
    var lines = String(b.content.text || '').replace(/\r\n?/g, '\n').split('\n');
    if (isNaN(ln) || ln < 0 || ln >= lines.length) return;
    if (cb) {
      var m = lines[ln].match(/^(\s*[-*+]\s+)\[( |x|X)\](\s+.*)$/);
      if (!m) return;
      lines[ln] = m[1] + (m[2] === ' ' ? '[x]' : '[ ]') + m[3];
      b.content.text = lines[ln] !== null ? lines.join('\n') : b.content.text;
      ta.value = b.content.text;
      touchNote(b.noteId);
      logChange(m[2] === ' ' ? 'Tarea completada' : 'Tarea reabierta', snippet(m[3]));
      save();
      view.innerHTML = renderMarkdown(b.content.text);
    } else {
      var tm = lines[ln].match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/);
      var taskText = tm ? tm[2].replace(/[*_~`]/g, '').trim() : '';
      b.reminder = Object.assign({}, b.reminder || {}, { label: taskText || undefined });
      openReminderPicker(b, bell);
    }
  });
  return [view, fmtBar, ta];
}
// Envuelve la selección del textarea con marcadores Markdown y sincroniza el bloque.
function mdWrapSel(ta, b, before, after) {
  var s = ta.selectionStart, e = ta.selectionEnd;
  var sel = ta.value.slice(s, e) || 'texto';
  ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + sel.length;
  ta.focus();
  b.content.text = ta.value; touchNote(b.noteId); debouncedSave();
  var card = ta.closest('.card'); var view = card && card.querySelector('.md-render');
  if (view) view.innerHTML = renderMarkdown(ta.value);
}
// Prefija las líneas seleccionadas ('- ', '## ', '- [ ] '…); null = numeración 1. 2. 3.
function mdPrefixLines(ta, b, prefix) {
  var s = ta.selectionStart, e = ta.selectionEnd;
  var v = ta.value;
  var ls = v.lastIndexOf('\n', s - 1) + 1;
  var le = v.indexOf('\n', e); if (le < 0) le = v.length;
  var chunk = v.slice(ls, le);
  var n = 0;
  var out = chunk.split('\n').map(function (line) {
    if (!line.trim()) return line;
    n++;
    var body = line.replace(/^(\s*)(#{1,6}\s+|\d+[.)]\s+|[-*+]\s+(\[( |x|X)\]\s+)?)?/, '$1');
    var im = line.match(/^(\s*)/);
    return (im ? im[1] : '') + (prefix === null ? n + '. ' : prefix) + body.replace(/^\s*/, '');
  }).join('\n');
  ta.value = v.slice(0, ls) + out + v.slice(le);
  ta.focus();
  b.content.text = ta.value; touchNote(b.noteId); debouncedSave();
  var card = ta.closest('.card'); var view = card && card.querySelector('.md-render');
  if (view) view.innerHTML = renderMarkdown(ta.value);
}
function toggleMdEdit(b, el) {
  var editing = el.classList.toggle('editing-md');
  if (editing) { var ta = el.querySelector('.md-src'); if (ta) ta.focus(); }
  else { var view = el.querySelector('.md-render'); if (view) view.innerHTML = renderMarkdown(b.content.text || ''); }
}
// ---------- Mermaid (diagramas) ----------
var mermaidReady = false;
// Colores de los diagramas a juego con la paleta actual (tema personalizable).
function mmdThemeVars() {
  return {
    fontFamily: 'Nunito, system-ui, sans-serif',
    fontSize: '14px',
    primaryColor: cssVarValue('--secondary'),
    primaryTextColor: cssVarValue('--fg'),
    primaryBorderColor: cssVarValue('--primary'),
    lineColor: cssVarValue('--muted'),
    secondaryColor: cssVarValue('--bg'),
    secondaryBorderColor: cssVarValue('--border'),
    tertiaryColor: cssVarValue('--card'),
    tertiaryBorderColor: cssVarValue('--border'),
    noteBkgColor: cssVarValue('--secondary'),
    noteBorderColor: cssVarValue('--border'),
    actorBkg: cssVarValue('--secondary'),
    actorBorder: cssVarValue('--primary'),
    actorTextColor: cssVarValue('--fg'),
    clusterBkg: cssVarValue('--bg'),
    clusterBorder: cssVarValue('--border'),
    edgeLabelBackground: cssVarValue('--card'),
    textColor: cssVarValue('--fg'),
  };
}
function ensureMermaid() {
  if (!window.mermaid) return false;
  if (!mermaidReady) {
    try {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base', themeVariables: mmdThemeVars(), suppressErrorRendering: true, flowchart: { htmlLabels: false }, fontFamily: 'Nunito, system-ui, sans-serif' });
      mermaidReady = true;
    } catch (e) {}
  }
  return true;
}
// Al cambiar la paleta, re-inicializa mermaid y repinta los diagramas visibles.
function mmdThemeRefresh() {
  if (!window.mermaid) return;
  mermaidReady = false;
  var views = document.querySelectorAll('.mmd-render');
  Array.prototype.forEach.call(views, function (v) {
    if (v._block) renderMmdCard(v, v._block);
  });
}
function renderMermaid(view, code, onDone) {
  var src = String(code == null ? '' : code).trim();
  view.classList.remove('mmd-has-error');
  if (!src) { view.innerHTML = '<div class="mmd-empty">Elige un tipo de diagrama en el bot\u00f3n de formas de la tarjeta,<br>escribe c\u00f3digo Mermaid o genera uno con IA.</div>'; return; }
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
  // La rueda a secas se queda dentro de la tarjeta (desplaza el diagrama), pero Ctrl/Cmd+rueda
  // —y el pellizco del trackpad, que llega igual— SIEMPRE debe llegar al lienzo: si no, encima
  // de un diagrama el zoom del lienzo no responde y no hay forma de alejarse y volver.
  view.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) return;
    if (!(view.closest('.card') && view.closest('.card').classList.contains('mmd-interactive'))) e.stopPropagation();
  });
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
  // Envoltorio: en columna es "o código o dibujo"; en modo dividido (.mmd-split) pasa a fila
  // y se ven los dos a la vez. El código sigue buscándose con view.parentNode.querySelector.
  return [h('div', { class: 'mmd-wrap' }, view, ta)];
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
  if (el.classList.contains('mmd-split')) { toggleMmdSplit(b, el); return; }
  var editing = el.classList.toggle('editing-mmd');
  if (editing) { el.classList.remove('mmd-interactive'); var ta = el.querySelector('.mmd-src'); if (ta) ta.focus(); }
  else { var view = el.querySelector('.mmd-render'); if (view) renderMmdCard(view, b); }
}
// Vista dividida: código a la izquierda y diagrama a la derecha, los dos a la vez.
// Se recuerda en el bloque (b.content.split) para que sobreviva a los re-render.
function toggleMmdSplit(b, el) {
  b.content = b.content || {};
  var on = !el.classList.contains('mmd-split');
  el.classList.toggle('mmd-split', on);
  b.content.split = on;
  if (on) {
    el.classList.remove('editing-mmd');
    // Con la tarjeta estrecha el código y el dibujo no caben: se ensancha una vez.
    var minW = 760;
    if ((b.width || 0) < minW) { b.width = minW; el.style.width = minW + 'px'; }
    if ((b.height || 0) < 380) { b.height = 380; el.style.height = '380px'; }
  }
  var view = el.querySelector('.mmd-render');
  if (view) renderMmdCard(view, b);
  touchNote(b.noteId); save();
  if (typeof drawLinks === 'function') drawLinks();
  if (on) { var ta = el.querySelector('.mmd-src'); if (ta) ta.focus(); }
}
var mmdMoveHinted = false;
function toggleMmdMove(b, el) {
  var on = el.classList.toggle('mmd-interactive');
  if (on) {
    el.classList.remove('editing-mmd');
    if (!mmdMoveHinted) { mmdMoveHinted = true; toast('¿Vas a editar mucho? Prueba «Explotar a formas del lienzo»: arrastras cajas y las flechas siempre las siguen.', 'ok'); }
  }
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
// Rectángulo del SVG que se ve dentro de la tarjeta, en unidades de usuario del SVG
// (las mismas en las que trabaja el pan/zoom del viewport).
function mmdVisibleRect(ctrl) {
  var r = ctrl.svg.getBoundingClientRect();
  var a = mmdClientToSpace(ctrl.svg, r.left, r.top);
  var c = mmdClientToSpace(ctrl.svg, r.right, r.bottom);
  return { x1: Math.min(a.x, c.x), y1: Math.min(a.y, c.y), x2: Math.max(a.x, c.x), y2: Math.max(a.y, c.y) };
}
// Caja del diagrama SIN el transform del viewport (getBBox ignora el transform propio).
function mmdContentBox(ctrl) {
  try {
    var bb = ctrl.vp.getBBox();
    return (bb && (bb.width || bb.height)) ? bb : null;
  } catch (e) { return null; }
}
// El zoom se ancla en el cursor, así que si el cursor cae fuera del diagrama cada rueda lo
// empuja hacia el borde hasta sacarlo por completo de la tarjeta, y no había forma de volver.
// Esto lo retiene: siempre queda un trozo del diagrama dentro del área visible.
function mmdClampPan(ctrl, L) {
  var bb = mmdContentBox(ctrl);
  if (!bb) return;
  var vis = mmdVisibleRect(ctrl);
  var k = L.pan.k;
  var x1 = L.pan.x + bb.x * k, y1 = L.pan.y + bb.y * k;
  var x2 = x1 + bb.width * k, y2 = y1 + bb.height * k;
  var mx = Math.max(12, Math.min(60, (x2 - x1) / 2));
  var my = Math.max(12, Math.min(60, (y2 - y1) / 2));
  if (x1 > vis.x2 - mx) L.pan.x -= x1 - (vis.x2 - mx);
  else if (x2 < vis.x1 + mx) L.pan.x += (vis.x1 + mx) - x2;
  if (y1 > vis.y2 - my) L.pan.y -= y1 - (vis.y2 - my);
  else if (y2 < vis.y1 + my) L.pan.y += (vis.y1 + my) - y2;
}
// Vuelve a encuadrar el diagrama entero en la tarjeta (salida de emergencia del zoom).
function mmdFitView(view, ctrl, b) {
  var bb = mmdContentBox(ctrl);
  if (!bb) return;
  var L = mmdEnsureLayout(b);
  var vis = mmdVisibleRect(ctrl);
  var pad = 8;
  var vw = Math.max(1, (vis.x2 - vis.x1) - pad * 2), vh = Math.max(1, (vis.y2 - vis.y1) - pad * 2);
  var k = Math.min(5, Math.max(0.2, Math.min(vw / Math.max(1, bb.width), vh / Math.max(1, bb.height))));
  L.pan.k = k;
  L.pan.x = (vis.x1 + vis.x2) / 2 - (bb.x + bb.width / 2) * k;
  L.pan.y = (vis.y1 + vis.y2) / 2 - (bb.y + bb.height / 2) * k;
  mmdApplyPan(ctrl, L);
  if (ctrl.selEdge >= 0) mmdPositionEdgeToolbar(view, ctrl);
  touchNote(b.noteId); debouncedSave();
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
    if (e.ctrlKey || e.metaKey) return; // Ctrl/Cmd+rueda = zoom del lienzo, no del diagrama
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
    if (g) { mmdEditNodeLabel(view, view._mmd, view._block, g); return; }
    // Doble clic en zona vacía: reencuadra el diagrama. Salida de emergencia del zoom.
    mmdFitView(view, view._mmd, view._block);
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
    mmdClampPan(ctrl, L);
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
  mmdClampPan(ctrl, L);
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

// ---------- Herramienta de diagramas: tipos, nodos rápidos y generación con IA ----------
var DIAGRAM_TYPES = [
  { key: 'flow', name: 'Flujo', desc: 'Pasos y decisiones', code: 'flowchart TD\n  A[Inicio] --> B{Decisión}\n  B -->|Sí| C[Acción]\n  B -->|No| D[Fin]' },
  { key: 'swimlane', name: 'Carriles (swimlane)', desc: 'Quién hace qué', code: 'flowchart LR\n  subgraph Cliente\n    A[Solicita] --> B[Recibe]\n  end\n  subgraph Equipo\n    C[Procesa] --> D[Entrega]\n  end\n  subgraph Sistema\n    E[(Registro)]\n  end\n  A --> C\n  C --> E\n  D --> B' },
  { key: 'sequence', name: 'Secuencia', desc: 'Mensajes en el tiempo', code: 'sequenceDiagram\n  participant U as Usuario\n  participant A as App\n  participant S as Servidor\n  U->>A: Acción\n  A->>S: Petición\n  S-->>A: Respuesta\n  A-->>U: Resultado' },
  { key: 'state', name: 'Estados', desc: 'Ciclo de vida', code: 'stateDiagram-v2\n  [*] --> Borrador\n  Borrador --> Revision: enviar\n  Revision --> Aprobado: ok\n  Revision --> Borrador: cambios\n  Aprobado --> [*]' },
  { key: 'gantt', name: 'Gantt', desc: 'Plan en el tiempo', code: 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Fase 1\n    Diseño :a1, 2026-07-07, 5d\n    Desarrollo :after a1, 10d\n  section Fase 2\n    Pruebas :5d\n    Lanzamiento :2d' },
  { key: 'mindmap', name: 'Mapa mental', desc: 'Ideas ramificadas', code: 'mindmap\n  root((Tema))\n    Rama 1\n      Detalle\n    Rama 2\n    Rama 3' },
  { key: 'journey', name: 'User journey', desc: 'Experiencia por pasos', code: 'journey\n  title Viaje del usuario\n  section Descubre\n    Encuentra la app: 4: Usuario\n    Prueba la demo: 3: Usuario\n  section Usa\n    Crea su primera nota: 5: Usuario' },
  { key: 'class', name: 'Clases', desc: 'Entidades y herencia', code: 'classDiagram\n  class Cliente {\n    +String nombre\n    +String email\n    +registrar()\n  }\n  class Pedido {\n    +int numero\n    +total()\n  }\n  Cliente "1" --> "*" Pedido : realiza' },
  { key: 'er', name: 'Entidad-relación', desc: 'Modelo de datos', code: 'erDiagram\n  CLIENTE ||--o{ PEDIDO : realiza\n  PEDIDO ||--|{ LINEA : contiene\n  PRODUCTO ||--o{ LINEA : aparece_en\n  CLIENTE {\n    string nombre\n    string email\n  }' },
  { key: 'timeline', name: 'Línea de tiempo', desc: 'Hitos por periodo', code: 'timeline\n  title Historia del proyecto\n  2024 : Idea : Primeros bocetos\n  2025 : Prototipo : Primeros usuarios\n  2026 : Lanzamiento' },
  { key: 'pie', name: 'Tarta', desc: 'Proporciones', code: 'pie title Distribución\n  "A" : 45\n  "B" : 30\n  "C" : 25' },
];
// Formas rápidas para diagramas de flujo (flowchart/graph).
var DIAGRAM_SHAPES = [
  { key: 'step', label: '▭ Paso', open: '[', close: ']', text: 'Nuevo paso' },
  { key: 'decision', label: '◇ Decisión', open: '{', close: '}', text: 'Decisión' },
  { key: 'round', label: '▢ Redondeado', open: '(', close: ')', text: 'Acción' },
  { key: 'pill', label: '⬭ Inicio / Fin', open: '([', close: '])', text: 'Inicio' },
  { key: 'hex', label: '⬡ Preparación', open: '{{', close: '}}', text: 'Preparar' },
  { key: 'data', label: '⛁ Base de datos', open: '[(', close: ')]', text: 'Datos' },
  { key: 'sub', label: '⧉ Subproceso', open: '[[', close: ']]', text: 'Subproceso' },
  { key: 'io', label: '▱ Entrada / Salida', open: '[/', close: '/]', text: 'Entrada' },
  { key: 'manual', label: '⏢ Manual', open: '[/', close: '\\]', text: 'Paso manual' },
  { key: 'circle', label: '◯ Círculo', open: '((', close: '))', text: 'Hito' },
  { key: 'flag', label: '⯈ Etiqueta', open: '>', close: ']', text: 'Nota' },
];
function mmdIsFlowchart(code) { return /^\s*(flowchart|graph)\b/.test(code || ''); }
function mmdNodeIds(code) {
  return (code.match(/\b[A-Za-z][A-Za-z0-9_]*(?=\[|\{|\()/g) || []);
}
function mmdFreshId(code) {
  var i = 1;
  while (new RegExp('\\bn' + i + '\\b').test(code)) i++;
  return 'n' + i;
}
// Actualiza código + textarea + render en un solo sitio (y limpia el layout
// guardado cuando el diagrama cambia de forma sustancial).
function mmdSetCode(b, el, code, logMsg, keepLayout) {
  b.content = b.content || {};
  b.content.text = code;
  if (!keepLayout) delete b.content.layout;
  var ta = el.querySelector('.mmd-src');
  if (ta) ta.value = code;
  var view = el.querySelector('.mmd-render');
  if (view) renderMmdCard(view, b);
  touchNote(b.noteId);
  if (logMsg) logChange(logMsg, snippet(code));
  save();
}
function mmdAddShape(b, el, shape) {
  var code = (b.content && b.content.text || '').trim();
  if (!code) code = 'flowchart TD';
  if (!mmdIsFlowchart(code)) { toast('Añadir formas rápidas funciona con diagramas de flujo.', 'warn'); return; }
  var id = mmdFreshId(code);
  var ids = mmdNodeIds(code);
  var last = ids.length ? ids[ids.length - 1] : null;
  var line = last ? ('  ' + last + ' --> ' + id + shape.open + shape.text + shape.close)
                  : ('  ' + id + shape.open + shape.text + shape.close);
  mmdSetCode(b, el, code + '\n' + line, 'Forma añadida al diagrama', true);
}
function mmdAddLane(b, el) {
  var code = (b.content && b.content.text || '').trim();
  if (!code) code = 'flowchart LR';
  if (!mmdIsFlowchart(code)) { toast('Los carriles funcionan con diagramas de flujo.', 'warn'); return; }
  var n = (code.match(/subgraph /g) || []).length + 1;
  var id = mmdFreshId(code);
  mmdSetCode(b, el, code + '\n  subgraph Carril ' + n + '\n    ' + id + '[Paso]\n  end', 'Carril añadido al diagrama', true);
}
function aiDiagramGenerate(b, el, desc) {
  desc = (desc || '').trim();
  if (!desc) { toast('Describe primero qué diagrama quieres.', 'warn'); return; }
  if (!aiReady()) { openAI(); return; }
  el.classList.add('ai-busy');
  callAI([
    { role: 'system', content: 'Eres un experto en Mermaid 11. Respondes SOLO con código Mermaid válido, sin explicaciones y sin fences de Markdown.' },
    { role: 'user', content: 'Genera un diagrama Mermaid para: ' + desc + '\nElige el tipo más adecuado (flowchart, flowchart con subgraph como carriles, sequenceDiagram, stateDiagram-v2, gantt, mindmap, journey, pie…). Etiquetas en el idioma de la descripción. Sin fences.' },
  ]).then(function (code) {
    el.classList.remove('ai-busy');
    code = String(code || '').replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!code) { toast('La IA devolvió una respuesta vacía.', 'warn'); return; }
    pushUndo('IA: diagrama generado');
    mmdSetCode(b, el, code, 'IA: diagrama generado');
    toast('Diagrama generado (Ctrl+Z para deshacer).', 'ok');
  }).catch(function (e) {
    el.classList.remove('ai-busy');
    toast('IA: ' + ((e && e.message) || e), 'warn');
  });
}
function openDiagramMenu(b, el, anchor) {
  closeDiagramMenu();
  var backdrop = h('div', { class: 'pop-backdrop', id: 'diagramMenuBackdrop', onmousedown: function (e) { if (e.target === backdrop) closeDiagramMenu(); } });
  var pop = h('div', { class: 'card-menu-pop diagram-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('flow'), 'Tipo de diagrama'));
  var grid = h('div', { class: 'dg-grid' });
  DIAGRAM_TYPES.forEach(function (t) {
    grid.appendChild(h('button', { class: 'dg-type', onclick: function () {
      var cur = (b.content && b.content.text || '').trim();
      var isStarter = !cur || DIAGRAM_TYPES.some(function (x) { return x.code === cur; }) || cur === defaultContent('mermaid').text;
      if (!isStarter && !window.confirm('Reemplazar el diagrama actual por la plantilla "' + t.name + '"?')) return;
      pushUndo('Cambiar tipo de diagrama');
      mmdSetCode(b, el, t.code, 'Diagrama: plantilla ' + t.name);
      closeDiagramMenu();
    } },
      h('span', { class: 'dg-type-name' }, t.name),
      h('span', { class: 'dg-type-desc' }, t.desc)
    ));
  });
  pop.appendChild(grid);
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('plus'), 'Añadir (diagramas de flujo)'));
  var shapes = h('div', { class: 'cm-quick dg-shapes' });
  DIAGRAM_SHAPES.forEach(function (s) {
    shapes.appendChild(h('button', { class: 'cm-chip', onclick: function () { mmdAddShape(b, el, s); } }, s.label));
  });
  shapes.appendChild(h('button', { class: 'cm-chip', onclick: function () { mmdAddLane(b, el); } }, '⇉ Carril'));
  pop.appendChild(shapes);
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('shapes'), 'Editar en el lienzo'));
  pop.appendChild(h('button', { class: 'cm-item', title: 'Convierte el diagrama en formas y conectores que puedes arrastrar (las flechas los siguen). Funciona con cualquier tipo de diagrama.', onclick: function () { closeDiagramMenu(); mermaidToCanvas(b); } },
    icon('shapes'), h('span', {}, 'Explotar a formas del lienzo')));
  pop.appendChild(h('button', { class: 'cm-item', title: 'Muestra el código y el dibujo al mismo tiempo', onclick: function () { closeDiagramMenu(); toggleMmdSplit(b, el); } },
    icon('panel'), h('span', {}, 'Ver código y diagrama en paralelo')));
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('spark'), 'Generar con IA'));
  var desc = h('input', { class: 'dg-ai-input', placeholder: 'p. ej. "proceso de alta de un cliente con validación"' });
  desc.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); closeDiagramMenu(); aiDiagramGenerate(b, el, desc.value); } });
  var go = h('button', { class: 'dg-ai-btn', onclick: function () { closeDiagramMenu(); aiDiagramGenerate(b, el, desc.value); } }, icon('spark'), 'Generar');
  pop.appendChild(h('div', { class: 'dg-ai-row' }, desc, go));
  backdrop.appendChild(pop);
  document.body.appendChild(backdrop);
  positionPop(pop, anchor, 300);
  setTimeout(function () { desc.focus(); }, 30);
}
function closeDiagramMenu() { var bd = document.getElementById('diagramMenuBackdrop'); if (bd) bd.remove(); }

// ---------- Puente Mermaid ↔ lienzo (formas + conectores nativos) ----------
// "Explotar" un diagrama de flujo a formas del lienzo (que sí siguen a las flechas
// al arrastrarlas) y, a la inversa, convertir una selección de formas en Mermaid.
function mmdDirection(src) {
  var m = /^\s*(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)/i.exec(src || '');
  return m ? m[1].toUpperCase() : 'TD';
}
function mmdShapeFromOpen(open, close) {
  if (open === '([') return 'pill';
  if (open === '((') return 'ellipse';
  if (open === '{{') return 'hexagon';
  if (open === '[[') return 'subprocess';
  if (open === '[(') return 'cylinder';
  if (open === '[/') return close === '\\]' ? 'trapezoid' : 'parallelogram';
  if (open === '[\\') return close === '/]' ? 'trapezoid-alt' : 'parallelogram';
  var c = open.charAt(0);
  if (c === '>') return 'flag';
  if (c === '{') return 'diamond';
  if (c === '(') return 'round';
  return 'rect';
}
// `[/ ... /]` y `[/ ... \]` abren igual pero cierran distinto: hay que mirar los dos.
function mmdCloseAfter(src, open, from) {
  var cands = (open === '[/' || open === '[\\') ? ['/]', '\\]'] : [mmdCloseFor(open)];
  var best = -1, tok = '';
  cands.forEach(function (c) {
    if (!c) return;
    var at = src.indexOf(c, from);
    if (at >= 0 && (best < 0 || at < best)) { best = at; tok = c; }
  });
  return best < 0 ? null : { at: best, tok: tok };
}
function mmdCollectNodeDefs(src) {
  var defs = {}, re = /([A-Za-z0-9_]+)\s*([\[({>]{1,2}[/\\]?)/g, m;
  while ((m = re.exec(src))) {
    var id = m[1], open = m[2];
    var openEnd = m.index + m[0].length;
    var close = mmdCloseAfter(src, open, openEnd);
    if (!close) continue;
    var inner = src.slice(openEnd, close.at);
    defs[id] = { label: mmdStripQuotes(inner).replace(/<br\s*\/?>/gi, '\n').trim() || id, shape: mmdShapeFromOpen(open, close.tok) };
    re.lastIndex = close.at + close.tok.length;
  }
  return defs;
}
// Disposición por capas (longest-path) según la dirección del diagrama. `sizes` permite
// separar más los niveles cuando los nodos son grandes (clases con miembros, etc.).
function mmdLayout(ids, edges, dir, sizes) {
  var adj = {}, indeg = {};
  ids.forEach(function (id) { adj[id] = []; indeg[id] = 0; });
  edges.forEach(function (e) { if (adj[e.from] && indeg[e.to] != null && e.from !== e.to) { adj[e.from].push(e.to); indeg[e.to]++; } });
  var din = Object.assign({}, indeg), q = ids.filter(function (id) { return !indeg[id]; }), order = [];
  while (q.length) { var id = q.shift(); order.push(id); adj[id].forEach(function (t) { if (--din[t] === 0) q.push(t); }); }
  ids.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
  var layer = {}; order.forEach(function (id) { layer[id] = 0; });
  order.forEach(function (id) { adj[id].forEach(function (t) { layer[t] = Math.max(layer[t] || 0, (layer[id] || 0) + 1); }); });
  var byL = {}; ids.forEach(function (id) { (byL[layer[id]] = byL[layer[id]] || []).push(id); });
  var maxW = 176, maxH = 104;
  if (sizes) ids.forEach(function (id) { var s = sizes[id]; if (s) { maxW = Math.max(maxW, s.w || 0); maxH = Math.max(maxH, s.h || 0); } });
  var horiz = dir === 'LR' || dir === 'RL';
  var GL = horiz ? maxW + 94 : maxH + 71, GC = horiz ? maxH + 46 : maxW + 44, pos = {};
  Object.keys(byL).forEach(function (L) {
    byL[L].forEach(function (id, i) {
      var main = parseInt(L, 10) * GL, cross = i * GC - (byL[L].length - 1) * GC / 2;
      pos[id] = horiz ? { x: main, y: cross } : { x: cross, y: main };
    });
  });
  return pos;
}

// ---------- Regla general: CUALQUIER diagrama Mermaid → formas del lienzo ----------
// Cada familia de diagrama tiene su lector, que devuelve nodos (forma + etiqueta) y
// conexiones. Lo que no reconocemos cae en el lector genérico, así que explotar a formas
// nunca se queda sin hacer nada.
var MMD_KIND_LABEL = {
  flow: 'flujo', sequence: 'secuencia', state: 'estados', class: 'clases', er: 'entidad-relación',
  mindmap: 'mapa mental', journey: 'user journey', gantt: 'Gantt', timeline: 'línea de tiempo',
  pie: 'tarta', generic: 'diagrama',
};
function mmdKind(src) {
  var head = String(src || '').replace(/%%\{[\s\S]*?\}%%/g, '').trim().split('\n')[0].trim().toLowerCase();
  if (/^(flowchart|graph)\b/.test(head)) return 'flow';
  if (/^sequencediagram\b/.test(head)) return 'sequence';
  if (/^statediagram(-v2)?\b/.test(head)) return 'state';
  if (/^classdiagram(-v2)?\b/.test(head)) return 'class';
  if (/^erdiagram\b/.test(head)) return 'er';
  if (/^mindmap\b/.test(head)) return 'mindmap';
  if (/^journey\b/.test(head)) return 'journey';
  if (/^gantt\b/.test(head)) return 'gantt';
  if (/^timeline\b/.test(head)) return 'timeline';
  if (/^pie\b/.test(head)) return 'pie';
  return 'generic';
}
// Líneas útiles: sin directivas %%{...}%%, sin comentarios y sin líneas en blanco.
function mmdLines(src) {
  return String(src || '').replace(/%%\{[\s\S]*?\}%%/g, '').replace(/\r\n?/g, '\n').split('\n')
    .filter(function (l) { return l.trim() && !/^\s*%%/.test(l); });
}
function mmdClean(t) {
  return mmdStripQuotes(String(t == null ? '' : t)).replace(/<br\s*\/?>/gi, '\n').replace(/[ \t]+/g, ' ').trim();
}
function mmdIndent(l) { var m = /^[ \t]*/.exec(l)[0]; return m.replace(/\t/g, '  ').length; }
// Heurística de forma para "actores" de secuencia / entidades: la etiqueta suele decir
// si es una persona, una base de datos o un servicio externo.
function mmdGuessShape(text, isActor) {
  if (isActor) return 'actor';
  var t = String(text || '').toLowerCase();
  if (/\b(db|bd|dynamo|dynamodb|sql|postgres|mysql|mongo|oracle|redis|cache|cach[eé]|base de datos|almacen|storage|bucket|s3|repositor|tabla)/.test(t)) return 'cylinder';
  if (/\b(cloud|nube|external|externo|tercero|third|saas|internet|proveedor|gateway|cdn)/.test(t)) return 'cloud';
  if (/\b(cola|queue|kafka|sqs|rabbit|topic|bus|stream)\b/.test(t)) return 'subprocess';
  if (/\b(usuario|user|cliente|client|persona|admin|operador|analista|actor|visitante)\b/.test(t)) return 'actor';
  if (/\b(informe|reporte|report|documento|document|factura|archivo|fichero|pdf)\b/.test(t)) return 'doc';
  return 'round';
}
// --- Secuencia: participantes en columnas y cada mensaje como una caja en su columna,
// encadenada con flechas (así se lee igual que el diagrama y se puede arrastrar). ---
// Ojo: el identificador NO puede incluir "-" o se comería el primer guion de la flecha
// (`API->>DYN` daría el participante "API-").
var MMD_SEQ_MSG = /^([A-Za-z0-9_.À-ɏ]+)\s*(<<-{1,2}>>|-{1,2}(?:>>|>|x|\)))\s*([+-]?)\s*([A-Za-z0-9_.À-ɏ]+)\s*:\s*([\s\S]*)$/;
function mmdGraphSequence(src) {
  var parts = {}, order = [], nodes = [], edges = [], last = {};
  var COL = 300, ROW = 132, HEAD_H = 104, BOX_W = 248, BOX_H = 96;
  var row = 0, num = false, n = 0;
  function part(id, label, isActor) {
    id = String(id).trim();
    var p = parts[id];
    if (!p) { p = parts[id] = { id: id, col: order.length, label: label || id, actor: !!isActor, key: 'P' + order.length }; order.push(p); last[id] = p.key; }
    if (label) p.label = label;
    if (isActor) p.actor = true;
    return p;
  }
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    if (/^sequenceDiagram\b/i.test(l) || /^(activate|deactivate|destroy|link|links|properties|create|box|end)\b/i.test(l)) return;
    if (/^autonumber\b/i.test(l)) { num = true; return; }
    if (/^title\b/i.test(l)) return;
    var dec = /^(participant|actor)\s+([^\s:]+)(?:\s+as\s+(.*))?$/i.exec(l);
    if (dec) { part(dec[2], mmdClean(dec[3] || ''), /actor/i.test(dec[1])); return; }
    var note = /^note\s+(over|right of|left of)\s+([^:]+):\s*(.*)$/i.exec(l);
    if (note) {
      var who = note[2].split(',')[0].trim(), p0 = part(who);
      nodes.push({ key: 'N' + row, label: mmdClean(note[3]), shape: 'note', color: 'p',
        x: p0.col * COL + 24, y: HEAD_H + 68 + row * ROW, w: BOX_W - 40, h: BOX_H - 8 });
      row++;
      return;
    }
    var ctl = /^(loop|alt|else|opt|par|and|critical|option|break|rect)\b\s*(.*)$/i.exec(l);
    if (ctl) {
      var kw = ctl[1].toLowerCase();
      var word = { loop: 'bucle', alt: 'si', else: 'si no', opt: 'opcional', par: 'en paralelo', and: 'y', critical: 'crítico', option: 'opción', break: 'corta', rect: 'bloque' }[kw] || kw;
      nodes.push({ key: 'C' + row, label: word + (ctl[2] ? ': ' + mmdClean(ctl[2]) : ''), shape: 'hexagon', color: 'v',
        x: -Math.round(COL * 0.92), y: HEAD_H + 68 + row * ROW, w: 210, h: 84 });
      row++;
      return;
    }
    var m = MMD_SEQ_MSG.exec(l);
    if (!m) return;
    var from = part(m[1]), to = part(m[4]);
    n++;
    var dashed = /^--/.test(m[2]);
    var key = 'M' + n;
    nodes.push({
      key: key, label: (num ? n + '. ' : '') + mmdClean(m[5]), shape: dashed ? 'round' : 'rect',
      color: dashed ? 'a' : 'i', x: to.col * COL, y: HEAD_H + 68 + row * ROW, w: BOX_W, h: BOX_H,
    });
    edges.push({ from: last[from.id] || from.key, to: key, label: '', line: dashed ? 'dotted' : 'solid' });
    last[to.id] = key;
    row++;
  });
  var heads = order.map(function (p) {
    return { key: p.key, label: p.label, shape: mmdGuessShape(p.label + ' ' + p.id, p.actor), color: 'n',
      x: p.col * COL, y: 0, w: BOX_W, h: HEAD_H };
  });
  return { nodes: heads.concat(nodes), edges: edges, fixed: true };
}
// --- Estados: [*] se convierte en píldoras de inicio y fin. ---
function mmdGraphState(src) {
  var nodes = {}, list = [], edges = [], alias = {}, starts = 0, ends = 0;
  function node(id, label, shape, color) {
    if (!nodes[id]) { nodes[id] = { key: id, label: label || alias[id] || id, shape: shape || 'round', color: color || '' }; list.push(nodes[id]); }
    else if (label) nodes[id].label = label;
    return nodes[id];
  }
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    if (/^stateDiagram/i.test(l) || /^direction\b/i.test(l) || l === '}' || /^(note|classDef|class|style)\b/i.test(l)) return;
    var as = /^state\s+"([^"]*)"\s+as\s+([^\s{]+)/i.exec(l);
    if (as) { alias[as[2]] = mmdClean(as[1]); node(as[2], mmdClean(as[1])); return; }
    var comp = /^state\s+([^\s{:]+)\s*\{?/i.exec(l);
    if (comp && !/-->/.test(l)) { node(comp[1]); return; }
    var m = /^(.+?)\s*-{2,3}>\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(l);
    if (!m) return;
    var a = m[1].trim(), z = m[2].trim(), lbl = mmdClean(m[3] || '');
    var ka = a === '[*]' ? 'S_start' : a, kz = z === '[*]' ? 'S_end' : z;
    if (a === '[*]') { node(ka, 'Inicio', 'pill', 'g'); starts++; } else node(ka);
    if (z === '[*]') { node(kz, 'Fin', 'pill', 'q'); ends++; } else node(kz);
    edges.push({ from: ka, to: kz, label: lbl });
  });
  return { nodes: list, edges: edges, dir: 'TD' };
}
// --- Clases: cada clase es una caja con sus miembros; las relaciones, conectores. ---
// Escapadas para regex y de más larga a más corta (si no, "--" se comería a "-->").
var MMD_CLASS_REL = ['<\\|--', '--\\|>', '<\\|\\.\\.', '\\.\\.\\|>', '\\*--', '--\\*', 'o--', '--o', '<\\.\\.', '\\.\\.>', '-->', '<--', '\\.\\.', '--'];
function mmdGraphClass(src) {
  var nodes = {}, list = [], edges = [], open = null;
  function node(id, label) {
    id = String(id).replace(/["~]/g, '').trim();
    if (!nodes[id]) { nodes[id] = { key: id, label: label || id, shape: 'rect', members: [] }; list.push(nodes[id]); }
    return nodes[id];
  }
  var rel = new RegExp('^\\s*([A-Za-z0-9_~"]+)\\s*(?:"[^"]*"\\s*)?(' + MMD_CLASS_REL.join('|') + ')\\s*(?:"[^"]*"\\s*)?([A-Za-z0-9_~"]+)\\s*(?::\\s*(.*))?$');
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    if (/^classDiagram/i.test(l) || /^(direction|classDef|style|click|namespace)\b/i.test(l)) return;
    if (l === '}') { open = null; return; }
    if (open) { if (l) open.members.push(mmdClean(l)); return; }
    var cl = /^class\s+([A-Za-z0-9_~]+)\s*(?:\["([^"]*)"\])?\s*(\{)?/i.exec(l);
    if (cl) { var nd = node(cl[1], cl[2] ? mmdClean(cl[2]) : cl[1]); if (cl[3]) open = nd; return; }
    var m = rel.exec(l);
    if (m) { node(m[1]); node(m[3]); edges.push({ from: m[1].replace(/["~]/g, '').trim(), to: m[3].replace(/["~]/g, '').trim(), label: mmdClean(m[4] || '') }); return; }
    var mem = /^([A-Za-z0-9_~]+)\s*:\s*(.+)$/.exec(l);
    if (mem) node(mem[1]).members.push(mmdClean(mem[2]));
  });
  list.forEach(function (nd) {
    if (nd.members && nd.members.length) nd.label = nd.label + '\n————\n' + nd.members.join('\n');
    nd.h = Math.min(300, 104 + (nd.members ? nd.members.length : 0) * 20);
    nd.w = 230;
  });
  return { nodes: list, edges: edges, dir: 'TD' };
}
// --- Entidad-relación: entidades como cilindros y la cardinalidad en la flecha. ---
function mmdGraphEr(src) {
  var nodes = {}, list = [], edges = [], open = null;
  function node(id) {
    if (!nodes[id]) { nodes[id] = { key: id, label: id, shape: 'cylinder', attrs: [] }; list.push(nodes[id]); }
    return nodes[id];
  }
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    if (/^erDiagram/i.test(l) || /^direction\b/i.test(l)) return;
    if (l === '}') { open = null; return; }
    if (open) { if (l) open.attrs.push(mmdClean(l)); return; }
    var m = /^([A-Za-z0-9_\-]+)\s+([|}{o<>ox.\-]{3,})\s+([A-Za-z0-9_\-]+)\s*:\s*(.*)$/.exec(l);
    if (m) { node(m[1]); node(m[3]); edges.push({ from: m[1], to: m[3], label: mmdClean(m[4]).replace(/^_+$/, '') }); return; }
    var ent = /^([A-Za-z0-9_\-]+)\s*\{/.exec(l);
    if (ent) { open = node(ent[1]); return; }
    var bare = /^([A-Za-z0-9_\-]+)$/.exec(l);
    if (bare) node(bare[1]);
  });
  list.forEach(function (nd) {
    if (nd.attrs && nd.attrs.length) nd.label = nd.label + '\n' + nd.attrs.slice(0, 8).join('\n');
    nd.h = Math.min(280, 118 + (nd.attrs ? nd.attrs.length : 0) * 18);
    nd.w = 220;
  });
  return { nodes: list, edges: edges, dir: 'LR' };
}
// --- Mapa mental: el árbol sale de la sangría de cada línea. ---
function mmdGraphMindmap(src) {
  var nodes = [], edges = [], stack = [], i = 0;
  mmdLines(src).forEach(function (raw) {
    if (/^\s*mindmap\b/i.test(raw)) return;
    var lvl = mmdIndent(raw), t = raw.trim();
    if (/^(::icon|class|classDef)\b/.test(t)) return;
    // `id((Tema))`, `id[Texto]`… solo si el paréntesis cierra al final de la línea;
    // si no, es texto normal.
    var shape = 'round', label = mmdClean(t);
    var m = /^([A-Za-z0-9_]*)(\(\(|\{\{|\[|\()/.exec(t);
    if (m) {
      var open = m[2], from = m[1].length + open.length;
      var close = mmdCloseAfter(t, open, from);
      if (close && close.at + close.tok.length === t.length) {
        label = mmdClean(t.slice(from, close.at));
        shape = mmdShapeFromOpen(open, close.tok);
      }
    }
    if (!label) return;
    var key = 'K' + (i++);
    while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
    var parent = stack.length ? stack[stack.length - 1] : null;
    nodes.push({ key: key, label: label, shape: stack.length ? shape : 'ellipse', color: stack.length ? '' : 'n', w: 190, h: 96 });
    if (parent) edges.push({ from: parent.key, to: key, label: '' });
    stack.push({ key: key, lvl: lvl });
  });
  return { nodes: nodes, edges: edges, dir: 'LR' };
}
// --- Journey / Gantt / Timeline: secciones + pasos encadenados. ---
function mmdGraphSteps(src, kind) {
  var nodes = [], edges = [], i = 0, prevSection = null, prev = null;
  function push(label, shape, color, w, h) {
    var key = 'S' + (i++);
    nodes.push({ key: key, label: label, shape: shape, color: color || '', w: w || 200, h: h || 100 });
    return key;
  }
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    if (/^(journey|gantt|timeline)\b/i.test(l)) return;
    if (/^(title|dateFormat|axisFormat|tickInterval|excludes|todayMarker|weekday|includes)\b/i.test(l)) return;
    var sec = /^section\s+(.*)$/i.exec(l);
    if (sec) {
      var k = push(mmdClean(sec[1]), 'hexagon', 'n', 210, 88);
      if (prevSection) edges.push({ from: prevSection, to: k, label: '', line: 'dotted' });
      prevSection = k; prev = k;
      return;
    }
    var label = '', shape = 'rect', color = '';
    if (kind === 'journey') {
      var t = l.split(':');
      if (t.length < 2) return;
      var who = t.slice(2).join(':').trim(), score = (t[1] || '').trim();
      label = mmdClean(t[0]) + (score ? '\n★ ' + score : '') + (who ? '\n' + who : '');
      color = score && +score >= 4 ? 'a' : (score && +score <= 2 ? 'q' : '');
    } else if (kind === 'gantt') {
      var g = l.split(':');
      if (g.length < 2) return;
      var meta = g.slice(1).join(':').split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return s && !/^(done|active|crit|milestone)$/i.test(s); });
      if (meta.length > 1 && /^[a-z][a-z0-9_]*$/i.test(meta[0]) && !/^\d/.test(meta[0])) meta.shift();
      label = mmdClean(g[0]) + (meta.length ? '\n' + meta.join(' · ') : '');
      shape = /milestone/i.test(l) ? 'diamond' : 'rect';
    } else {
      var parts = l.split(':');
      if (parts.length < 2) { label = mmdClean(l); shape = 'pill'; color = 'n'; }
      else {
        var period = mmdClean(parts[0]);
        var pk = push(period, 'pill', 'n', 180, 78);
        if (prev) edges.push({ from: prev, to: pk, label: '' });
        prev = pk;
        parts.slice(1).forEach(function (ev) {
          var e = mmdClean(ev);
          if (!e) return;
          var ek = push(e, 'round', '', 200, 92);
          edges.push({ from: pk, to: ek, label: '' });
        });
        return;
      }
    }
    if (!label) return;
    var key = push(label, shape, color, 210, 112);
    if (prev) edges.push({ from: prev, to: key, label: '' });
    prev = key;
  });
  return { nodes: nodes, edges: edges, dir: 'LR' };
}
// --- Tarta: el título en el centro y cada porción colgando con su porcentaje. ---
function mmdGraphPie(src) {
  var nodes = [], edges = [], i = 0, total = 0, rows = [], title = 'Distribución';
  mmdLines(src).forEach(function (raw) {
    var l = raw.trim();
    var t = /^pie\b\s*(?:showData\s*)?(?:title\s+(.*))?$/i.exec(l);
    if (t) { if (t[1]) title = mmdClean(t[1]); return; }
    if (/^title\s+/i.test(l)) { title = mmdClean(l.replace(/^title\s+/i, '')); return; }
    var m = /^"?([^":]+)"?\s*:\s*([\d.]+)\s*$/.exec(l);
    if (m) { var v = parseFloat(m[2]) || 0; total += v; rows.push({ label: mmdClean(m[1]), v: v }); }
  });
  nodes.push({ key: 'PIE', label: title, shape: 'ellipse', color: 'n', w: 210, h: 120 });
  rows.forEach(function (r) {
    var key = 'W' + (i++), pct = total ? Math.round(r.v * 100 / total) : 0;
    nodes.push({ key: key, label: r.label + '\n' + r.v + (total ? ' (' + pct + '%)' : ''), shape: 'round', w: 190, h: 96 });
    edges.push({ from: 'PIE', to: key, label: pct ? pct + '%' : '' });
  });
  return { nodes: nodes, edges: edges, dir: 'TD' };
}
// --- Genérico: si no conocemos el tipo, buscamos "A --> B" y, si no hay flechas,
// encadenamos las líneas tal cual. Siempre sale algo con lo que trabajar. ---
function mmdGraphGeneric(src) {
  var nodes = {}, list = [], edges = [], i = 0;
  function node(id, label) {
    var k = String(id).trim();
    if (!nodes[k]) { nodes[k] = { key: k, label: mmdClean(label || k), shape: 'rect', w: 200, h: 100 }; list.push(nodes[k]); }
    return nodes[k];
  }
  var arrow = /^(.+?)\s*(<?[-=.]{1,3}(?:->|>|\||o|x)?)\s*(?:\|([^|]*)\|)?\s*([^:]+?)\s*(?::\s*(.*))?$/;
  mmdLines(src).forEach(function (raw, idx) {
    var l = raw.trim();
    if (idx === 0 || /^(title|direction|accTitle|accDescr)\b/i.test(l)) return;
    var m = arrow.exec(l);
    if (m && /[-=.]/.test(m[2]) && /(>|\||o|x|-|=|\.)$/.test(m[2]) && m[1] && m[4] && m[1].indexOf(' ') < 0) {
      node(m[1]); node(m[4]);
      edges.push({ from: m[1].trim(), to: m[4].trim(), label: mmdClean(m[3] || m[5] || '') });
      return;
    }
    var kv = /^([^:]{1,60}):\s*(.*)$/.exec(l);
    var key = 'G' + (i++);
    list.push({ key: key, label: kv ? mmdClean(kv[1]) + (kv[2] ? '\n' + mmdClean(kv[2]) : '') : mmdClean(l), shape: 'rect', w: 210, h: 100 });
    nodes[key] = list[list.length - 1];
  });
  // Sin flechas: se encadenan las cajas en el orden en que aparecen.
  if (!edges.length) {
    for (var k = 1; k < list.length; k++) edges.push({ from: list[k - 1].key, to: list[k].key, label: '' });
  }
  return { nodes: list, edges: edges, dir: 'TD' };
}
function mmdGraphFlow(src) {
  var edges = mmdParseEdges(src), defs = mmdCollectNodeDefs(src), ids = [], nodes = [];
  function add(id) { if (id && ids.indexOf(id) < 0 && !/^(subgraph|end|direction)$/i.test(id)) ids.push(id); }
  Object.keys(defs).forEach(add);
  edges.forEach(function (e) { add(e.from); add(e.to); });
  ids.forEach(function (id) {
    var d = defs[id] || {};
    nodes.push({ key: id, label: d.label || id, shape: d.shape || 'rect', w: 176, h: 104 });
  });
  return {
    nodes: nodes,
    edges: edges.map(function (e) { return { from: e.from, to: e.to, label: (e.label || '').trim(), line: mmdParseOp(e.op).line }; }),
    dir: mmdDirection(src),
  };
}
// Punto de entrada: código Mermaid → { nodes, edges } con posiciones ya calculadas.
function mmdGraph(src) {
  var kind = mmdKind(src), g;
  if (kind === 'flow') g = mmdGraphFlow(src);
  else if (kind === 'sequence') g = mmdGraphSequence(src);
  else if (kind === 'state') g = mmdGraphState(src);
  else if (kind === 'class') g = mmdGraphClass(src);
  else if (kind === 'er') g = mmdGraphEr(src);
  else if (kind === 'mindmap') g = mmdGraphMindmap(src);
  else if (kind === 'journey' || kind === 'gantt' || kind === 'timeline') g = mmdGraphSteps(src, kind);
  else if (kind === 'pie') g = mmdGraphPie(src);
  else g = mmdGraphGeneric(src);
  g.kind = kind;
  g.nodes = (g.nodes || []).filter(function (n) { return n && n.key; });
  var known = {};
  g.nodes.forEach(function (n) { known[n.key] = n; });
  g.edges = (g.edges || []).filter(function (e) { return e && known[e.from] && known[e.to] && e.from !== e.to; });
  if (!g.fixed) {
    var sizes = {}, ids = g.nodes.map(function (n) { sizes[n.key] = { w: n.w || 176, h: n.h || 104 }; return n.key; });
    var pos = mmdLayout(ids, g.edges, g.dir || 'TD', sizes);
    g.nodes.forEach(function (n) { var p = pos[n.key] || { x: 0, y: 0 }; n.x = p.x; n.y = p.y; });
  }
  return g;
}
// Explota CUALQUIER diagrama a formas del lienzo (las flechas siguen a las cajas).
function mermaidToCanvas(b) {
  var src = (b.content && b.content.text) || '';
  var g = mmdGraph(src);
  if (!g.nodes.length) { toast('No se encontró contenido que convertir en formas.', 'warn'); return; }
  var minX = Infinity, minY = Infinity;
  g.nodes.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); });
  var ox = Math.round(b.x), oy = Math.round(b.y + (b.height || 300) + 70), t = now(), map = {};
  pushUndo('Explotar diagrama a lienzo');
  g.nodes.forEach(function (n) {
    var nb = {
      id: uid(), noteId: b.noteId, type: 'shape',
      x: ox + Math.round(n.x - minX), y: oy + Math.round(n.y - minY),
      width: Math.round(n.w || 176), height: Math.round(n.h || 104),
      content: { text: n.label || n.key, shape: n.shape || 'rect' },
      createdAt: t, updatedAt: t,
    };
    if (n.color) nb.color = n.color;
    data.blocks.push(nb); map[n.key] = nb.id;
  });
  g.edges.forEach(function (e) {
    if (!map[e.from] || !map[e.to]) return;
    data.links.push({ id: uid(), noteId: b.noteId, a: map[e.from], b: map[e.to], label: (e.label || '').trim(), type: 'flow', style: e.line === 'dotted' ? 'straight' : 'curve', createdAt: t });
  });
  touchNote(b.noteId);
  logChange('Diagrama explotado a formas', MMD_KIND_LABEL[g.kind] + ': ' + g.nodes.length + ' nodos, ' + g.edges.length + ' conexiones');
  save();
  renderCanvas();
  clearSelection();
  g.nodes.forEach(function (n) { selectedIds[map[n.key]] = true; });
  refreshSelectionUI();
  focusBlock(map[g.nodes[0].key]);
  toast('Diagrama de ' + MMD_KIND_LABEL[g.kind] + ' → ' + g.nodes.length + ' formas: arrástralas y las flechas las siguen. Puedes volver a Mermaid desde la barra de selección.', 'ok');
}
function mmdBracketFor(shape) {
  switch (shape) {
    case 'round': return ['(', ')'];
    case 'pill': return ['([', '])'];
    case 'ellipse': return ['((', '))'];
    case 'diamond': return ['{', '}'];
    case 'hexagon': return ['{{', '}}'];
    case 'cylinder': return ['[(', ')]'];
    case 'subprocess': return ['[[', ']]'];
    case 'parallelogram': return ['[/', '/]'];
    case 'trapezoid': return ['[/', '\\]'];
    case 'trapezoid-alt': return ['[\\', '/]'];
    case 'flag': return ['>', ']'];
    default: return ['[', ']'];   // documento, nube, nota, actor, triángulo… → caja
  }
}
function mmdSanitizeLabel(t) { return (t || '').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/"/g, "'"); }
// Convierte los bloques seleccionados (formas/notas) y sus conexiones en un
// diagrama Mermaid nuevo, junto a la selección.
function selectionToMermaid() {
  var sel = Object.keys(selectedIds).map(getBlockById).filter(function (b) {
    return b && ['shape', 'text', 'idea', 'freetext', 'markdown'].indexOf(b.type) >= 0;
  });
  if (sel.length < 1) { toast('Selecciona al menos una forma o nota.', 'warn'); return; }
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  sel.forEach(function (b) { minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); });
  var dir = (maxX - minX) > (maxY - minY) * 1.3 ? 'LR' : 'TD';
  var idMap = {}, lines = [], nodeSet = {};
  sel.forEach(function (b, i) {
    var nid = 'N' + (i + 1); idMap[b.id] = nid; nodeSet[b.id] = 1;
    var label = mmdSanitizeLabel(aiBlockText(b)) || typeMeta(b.type).label;
    var br = mmdBracketFor(b.type === 'shape' ? (b.content && b.content.shape) : 'rect');
    lines.push('  ' + nid + br[0] + '"' + label + '"' + br[1]);
  });
  (data.links || []).forEach(function (lk) {
    if (nodeSet[lk.a] && nodeSet[lk.b]) {
      var lbl = mmdSanitizeLabel(lk.label);
      lines.push('  ' + idMap[lk.a] + ' -->' + (lbl ? '|' + lbl + '|' : '') + ' ' + idMap[lk.b]);
    }
  });
  var code = 'flowchart ' + dir + '\n' + lines.join('\n'), t = now();
  pushUndo('Convertir selección a Mermaid');
  var nb = {
    id: uid(), noteId: sel[0].noteId, type: 'mermaid',
    x: Math.round(maxX + 300), y: Math.round(minY),
    width: 460, height: 340,
    content: { text: code },
    createdAt: t, updatedAt: t,
  };
  data.blocks.push(nb);
  touchNote(nb.noteId);
  logChange('Selección convertida a Mermaid', sel.length + ' nodos');
  save();
  renderCanvas();
  cardEnterAnim(cardEl(nb.id));
  focusBlock(nb.id);
  toast('Diagrama Mermaid creado desde ' + sel.length + ' bloques.', 'ok');
}
