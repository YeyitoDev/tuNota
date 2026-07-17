/* tuNota — Formateo de texto y bloques ejecutables: cURL, Python (Pyodide) y tablas.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Formateo de texto (respeta enumeraciones y saltos de l\u00ednea) ----------
function formatTextContent(text) {
  var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  var out = [];
  var counter = 0, prevOrdered = false, blankRun = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, '');           // quita espacios al final
    var im = line.match(/^([ \t]*)/);
    var indent = (im ? im[1] : '').replace(/\t/g, '  ');
    var body = line.slice(im ? im[1].length : 0);

    if (body === '') {                                  // l\u00ednea en blanco
      blankRun++;
      if (blankRun > 1) { prevOrdered = false; counter = 0; } // salto de p\u00e1rrafo: reinicia la lista
      // una sola l\u00ednea en blanco NO reinicia la numeraci\u00f3n (listas con doble espacio)
      if (out.length === 0 || blankRun > 1) continue;   // colapsa blancos y quita los del inicio
      out.push('');
      continue;
    }
    blankRun = 0;

    var om = body.match(/^(\d+)[.)]\s+(.*)$/);          // lista numerada: "1." o "1)"
    if (om) {
      counter = prevOrdered ? counter + 1 : 1;
      prevOrdered = true;
      out.push(indent + counter + '. ' + om[2].replace(/[ \t]{2,}/g, ' ').trim());
      continue;
    }
    prevOrdered = false; counter = 0;

    var bm = body.match(/^([-*\u2022\u00b7\u2013\u2014])\s+(.*)$/); // vi\u00f1etas: - * \u2022 \u00b7 \u2013 \u2014
    if (bm) {
      out.push(indent + '- ' + bm[2].replace(/[ \t]{2,}/g, ' ').trim());
      continue;
    }

    out.push(indent + body.replace(/[ \t]{2,}/g, ' ')); // texto normal: colapsa espacios internos
  }
  while (out.length && out[out.length - 1] === '') out.pop(); // quita blancos al final
  return out.join('\n');
}
function formatCardText(b, el) {
  var ta = el.querySelector('.card-ta');
  if (!ta) return;
  var formatted = formatTextContent(ta.value);
  if (formatted === ta.value) return;
  ta.value = formatted;
  b.content = b.content || {};
  b.content.text = formatted;
  touchNote(b.noteId);
  logChange((b.type === 'idea' ? 'Idea' : 'Nota') + ' formateada', snippet(formatted));
  save();
}
// ---------- Transformaciones de lista (sin IA): enumerar, viñetas, casillas, limpiar ----------
function stripListMarker(line) {
  return line
    .replace(/^(\s*)(\d+[.)]|[a-z]{1,3}\)|[IVXLCDM]{1,7}\.)\s+/, '$1')
    .replace(/^(\s*)[-*+•·–—▸]\s+(\[( |x|X)\]\s+)?/, '$1');
}
// Estilo de numeración personalizable (ui.fmt.num): "1." "1)" "a)" "I."
function numMarker(n) {
  var style = (ui && ui.fmt && ui.fmt.num) || '1.';
  if (style === '1)') return n + ') ';
  if (style === 'a)') { var s = ''; var k = n; while (k > 0) { k--; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } return s + ') '; }
  if (style === 'I.') {
    var ro = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var r = '', v = n;
    ro.forEach(function (p) { while (v >= p[0]) { r += p[1]; v -= p[0]; } });
    return r + '. ';
  }
  return n + '. ';
}
function bulletMarker() { return ((ui && ui.fmt && ui.fmt.bullet) || '-') + ' '; }
// Aplica un marcador por línea no vacía; la numeración se reinicia en cada párrafo.
// Con ui.fmt.gap, deja una línea en blanco entre ítems (espaciado aireado).
function transformLines(text, maker) {
  var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  var n = 0, out = [];
  lines.forEach(function (line) {
    if (!line.trim()) { n = 0; if (out.length && out[out.length - 1] !== '') out.push(''); return; }
    var im = line.match(/^(\s*)/);
    var indent = im ? im[1] : '';
    n++;
    if (ui && ui.fmt && ui.fmt.gap && n > 1) out.push('');
    out.push(indent + maker(stripListMarker(line).trim(), n));
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
var TEXT_TRANSFORMS = [
  { key: 'auto', label: '✨ Auto-formato', fn: function (t) { return formatTextContent(t); } },
  { key: 'numbered', label: '1. Enumerar', fn: function (t) { return transformLines(t, function (s, n) { return numMarker(n) + s; }); } },
  { key: 'bullets', label: '• Viñetas', fn: function (t) { return transformLines(t, function (s) { return bulletMarker() + s; }); } },
  { key: 'tasks', label: '☐ Casillas de tarea', fn: function (t) { return transformLines(t, function (s) { return '- [ ] ' + s; }); } },
  { key: 'clean', label: '⌫ Quitar marcadores', fn: function (t) { return String(t || '').split('\n').map(stripListMarker).join('\n'); } },
];
// Aplica una transformación de líneas SOLO a la selección (o a todo el bloque si no hay
// selección). Expande la selección a líneas completas y conserva el resto del texto.
function applyLineTransform(b, ta, fn, label) {
  if (!ta) return;
  var full = ta.value;
  var s = ta.selectionStart, e = ta.selectionEnd;
  var from = 0, to = full.length;
  if (s !== e) {                                        // hay selección → solo esas líneas
    from = full.lastIndexOf('\n', s - 1) + 1;
    to = full.indexOf('\n', e); if (to === -1) to = full.length;
  }
  var seg = full.slice(from, to);
  var res = fn(seg);
  if (res === seg) return;
  pushUndo('Formato: ' + label);
  ta.value = full.slice(0, from) + res + full.slice(to);
  try { ta.selectionStart = from; ta.selectionEnd = from + res.length; } catch (err) {}
  b.content = b.content || {};
  b.content.text = ta.value;
  touchNote(b.noteId);
  logChange('Texto: ' + label, snippet(ta.value));
  save();
  if (typeof autoGrowNote === 'function') autoGrowNote(ta); // el auto-formato cambia el nº de líneas → reajusta el alto
  if (ta.isConnected) ta.focus();
}
// Menú del botón de formato de un bloque de texto: elige la transformación.
function openTextFormatMenu(b, el, anchor) {
  closeTopbarMenu();
  var ta = el.querySelector('.card-ta');
  if (!ta) return;
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('format'), 'Formatear texto'));
  TEXT_TRANSFORMS.forEach(function (t) {
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () {
      closeTopbarMenu();
      applyLineTransform(b, ta, t.fn, t.label);
    } }, h('span', {}, t.label)));
  });
  // Personalización: estilo de numeración, viñeta y espaciado (se recuerdan).
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, 'Tu estilo'));
  var numRow = h('div', { class: 'cm-quick' });
  ['1.', '1)', 'a)', 'I.'].forEach(function (s) {
    numRow.appendChild(h('button', { class: 'cm-chip' + (ui.fmt.num === s ? ' on' : ''), title: 'Estilo de numeración', onclick: function (e) { e.stopPropagation(); ui.fmt.num = s; save(); Array.prototype.forEach.call(numRow.children, function (c) { c.classList.toggle('on', c.textContent === s); }); } }, s));
  });
  pop.appendChild(numRow);
  var bulRow = h('div', { class: 'cm-quick' });
  ['-', '•', '–', '▸'].forEach(function (s) {
    bulRow.appendChild(h('button', { class: 'cm-chip' + (ui.fmt.bullet === s ? ' on' : ''), title: 'Estilo de viñeta', onclick: function (e) { e.stopPropagation(); ui.fmt.bullet = s; save(); Array.prototype.forEach.call(bulRow.children, function (c) { c.classList.toggle('on', c.textContent === s); }); } }, s));
  });
  pop.appendChild(bulRow);
  var gapBtn = h('button', { class: 'cm-chip' + (ui.fmt.gap ? ' on' : ''), title: 'Deja una línea en blanco entre ítems', onclick: function (e) { e.stopPropagation(); ui.fmt.gap = !ui.fmt.gap; save(); gapBtn.classList.toggle('on', ui.fmt.gap); } }, '␣ Espaciado aireado');
  pop.appendChild(h('div', { class: 'cm-quick' }, gapBtn));
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 210);
}

// ---------- Barra flotante de formato sobre la selección (aparece arriba del bloque) ----------
// Resuelve el problema de los controles que se ocultan: al enfocar/seleccionar texto en una
// nota o idea, aparece una barra encima del bloque y formatea SOLO las líneas seleccionadas.
var SEL_FMT_ACTIONS = [
  { label: '✨', title: 'Auto-formato', fn: function (t) { return formatTextContent(t); } },
  { label: '1.', title: 'Enumerar', fn: function (t) { return transformLines(t, function (s, n) { return numMarker(n) + s; }); } },
  { label: '•', title: 'Viñetas', fn: function (t) { return transformLines(t, function (s) { return bulletMarker() + s; }); } },
  { label: '☐', title: 'Casillas de tarea', fn: function (t) { return transformLines(t, function (s) { return '- [ ] ' + s; }); } },
  { label: '⌫', title: 'Quitar marcadores', fn: function (t) { return String(t || '').split('\n').map(stripListMarker).join('\n'); } },
];
var selFmtBarEl = null;
var selFmtState = { ta: null, b: null };
function ensureSelFmtBar() {
  if (selFmtBarEl) return selFmtBarEl;
  var bar = h('div', { class: 'sel-fmt-bar' });
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); }); // no robar el foco/selección
  SEL_FMT_ACTIONS.forEach(function (a) {
    bar.appendChild(h('button', { class: 'sel-fmt-btn', title: a.title, onclick: function (e) {
      e.preventDefault(); e.stopPropagation();
      if (selFmtState.ta && selFmtState.b) { applyLineTransform(selFmtState.b, selFmtState.ta, a.fn, a.title); positionSelFmtBar(); }
    } }, a.label));
  });
  bar.appendChild(h('span', { class: 'sel-fmt-sep' }));
  bar.appendChild(h('button', { class: 'sel-fmt-btn', title: 'Más opciones (estilo de numeración, viñeta, espaciado)', onclick: function (e) {
    e.preventDefault(); e.stopPropagation();
    if (selFmtState.ta && selFmtState.b) openTextFormatMenu(selFmtState.b, selFmtState.ta.closest('.card'), e.currentTarget);
  } }, '⋯'));
  bar.appendChild(h('button', { class: 'sel-fmt-btn', title: 'Vincular la selección a un bloque, nota, imagen o PDF', onclick: function (e) {
    e.preventDefault(); e.stopPropagation();
    if (!selFmtState.ta || !selFmtState.b) return;
    var ta = selFmtState.ta, text = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    if (!text) { toast('Selecciona primero el texto que quieres vincular.', 'warn'); return; }
    openHlinkPicker(selFmtState.b, text, e.currentTarget);
  } }, '🔗'));
  document.body.appendChild(bar);
  selFmtBarEl = bar;
  return bar;
}
function positionSelFmtBar() {
  var bar = selFmtBarEl, ta = selFmtState.ta;
  if (!bar || !ta) return;
  var card = ta.closest('.card');
  if (!card) return;
  var cr = card.getBoundingClientRect();
  var bw = bar.offsetWidth || 240, bh = bar.offsetHeight || 34;
  var left = Math.min(Math.max(8, cr.left + (cr.width - bw) / 2), window.innerWidth - bw - 8);
  var top = Math.max(56, cr.top - bh - 8);                 // encima del bloque, sin taparse con el topbar
  bar.style.left = Math.round(left) + 'px';
  bar.style.top = Math.round(top) + 'px';
}
function showSelFmtBar(ta, b) {
  var bar = ensureSelFmtBar();
  selFmtState.ta = ta; selFmtState.b = b;
  bar.classList.add('show');
  positionSelFmtBar();
  window.addEventListener('resize', positionSelFmtBar);
  window.addEventListener('scroll', positionSelFmtBar, true);
}
function hideSelFmtBar() {
  if (!selFmtBarEl) return;
  selFmtBarEl.classList.remove('show');
  selFmtState.ta = null; selFmtState.b = null;
  window.removeEventListener('resize', positionSelFmtBar);
  window.removeEventListener('scroll', positionSelFmtBar, true);
}
// Conecta una nota/idea (textarea) con la barra flotante de formato.
function attachSelFmtBar(ta, b) {
  ta.addEventListener('focus', function () { showSelFmtBar(ta, b); });
  ta.addEventListener('blur', function () { setTimeout(function () { if (selFmtState.ta === ta && document.activeElement !== ta) hideSelFmtBar(); }, 120); });
  ['select', 'keyup', 'mouseup', 'input', 'click', 'scroll'].forEach(function (ev) {
    ta.addEventListener(ev, function () { if (selFmtState.ta === ta) positionSelFmtBar(); });
  });
  ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hideSelFmtBar(); ta.blur(); } });
}

// ---------- Color de texto en contraste automático con el fondo más próximo ----------
function _rgbParse(col) {
  var m = /rgba?\(([^)]+)\)/.exec(col || '');
  if (m) { var p = m[1].split(',').map(function (x) { return parseFloat(x); }); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  var hx = toHex(col); return { r: parseInt(hx.slice(1, 3), 16), g: parseInt(hx.slice(3, 5), 16), b: parseInt(hx.slice(5, 7), 16), a: 1 };
}
function _relLum(c) {
  function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}
function _contrastRatio(a, b) { var L1 = _relLum(a), L2 = _relLum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); }
// Devuelve '' si el texto por defecto (--fg) ya se lee bien sobre el fondo de la tarjeta;
// en caso contrario, elige un color oscuro o claro que contraste con ese fondo.
function autoTextColorFor(cardEl) {
  if (!cardEl) return '';
  var bg = _rgbParse(getComputedStyle(cardEl).backgroundColor);
  if (!bg.a) bg = _rgbParse(cssVarValue('--card'));
  var fg = _rgbParse(cssVarValue('--fg'));
  if (_contrastRatio(bg, fg) >= 3.5) return '';
  return _relLum(bg) > 0.4 ? '#201d19' : '#f3efe7';
}
function refreshAutoText(ta) {
  if (!ta) return;
  var card = ta.closest('.card'); if (!card) return;
  ta.style.color = (typeof ui !== 'undefined' && ui && ui.autoText) ? autoTextColorFor(card) : '';
}
function applyAutoTextAll() {
  if (!canvasContentEl) return;
  Array.prototype.forEach.call(canvasContentEl.querySelectorAll('.card-ta:not(.mono):not(.free-ta)'), function (ta) { refreshAutoText(ta); });
}

// ---------- Hipervínculos de texto: vincula una selección con un bloque, nota, imagen o PDF ----------
function blockPickLabel(bl) {
  var base = bl.title || typeMeta(bl.type).label;
  var t = (bl.content && bl.content.text) || '';
  var sn = snippet(String(t || '')).slice(0, 42);
  return sn ? base + ' · ' + sn : base;
}
function openHlinkPicker(b, text, anchor) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop hlink-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, '🔗 Vincular «' + snippet(text).slice(0, 28) + '» a…'));
  var here = blocksOf(b.noteId).filter(function (x) { return x.id !== b.id; });
  if (here.length) {
    pop.appendChild(h('div', { class: 'cm-label' }, 'En esta nota'));
    here.forEach(function (bl) {
      pop.appendChild(h('button', { class: 'cm-item', onclick: function () { addHlink(b, text, 'block', bl.id); closeTopbarMenu(); } },
        icon(typeMeta(bl.type).icon), h('span', {}, blockPickLabel(bl))));
    });
  }
  var notes = (data.notes || []).filter(function (n) { return n.id !== b.noteId; });
  if (notes.length) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('div', { class: 'cm-label' }, 'Otro lienzo (nota)'));
    notes.slice(0, 30).forEach(function (n) {
      pop.appendChild(h('button', { class: 'cm-item', onclick: function () { addHlink(b, text, 'note', n.id); closeTopbarMenu(); } },
        icon('file'), h('span', {}, n.title || 'Nota')));
    });
  }
  var books = (data.notebooks || []);
  if (books.length) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('div', { class: 'cm-label' }, 'Libro'));
    books.forEach(function (nb) {
      pop.appendChild(h('button', { class: 'cm-item', onclick: function () { addHlink(b, text, 'notebook', nb.id); closeTopbarMenu(); } },
        icon('layout'), h('span', {}, (nb.emoji ? nb.emoji + ' ' : '') + nb.name)));
    });
  }
  if (!here.length && !notes.length && !books.length) pop.appendChild(h('div', { class: 'cm-info' }, h('span', {}, 'Crea otro bloque, nota o libro para poder vincularlo.')));
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 250);
}
function addHlink(b, text, type, targetId) {
  b.content = b.content || {};
  if (!Array.isArray(b.content.hlinks)) b.content.hlinks = [];
  b.content.hlinks.push({ id: uid(), text: String(text).slice(0, 80), type: type, target: targetId });
  touchNote(b.noteId); logChange('Hipervínculo creado', snippet(text)); save();
  var el = cardEl(b.id); if (el) updateHlinks(el, b);
  toast('Vínculo creado: aparece bajo el texto; haz clic para ir al destino.', 'ok');
}
function removeHlink(b, id) {
  if (!b.content || !b.content.hlinks) return;
  b.content.hlinks = b.content.hlinks.filter(function (x) { return x.id !== id; });
  touchNote(b.noteId); logChange('Hipervínculo quitado', ''); save();
  var el = cardEl(b.id); if (el) updateHlinks(el, b);
}
function hlinkTargetLabel(hl) {
  if (hl.type === 'notebook') { var nb = (data.notebooks || []).find(function (x) { return x.id === hl.target; }); return nb ? ('Libro: ' + nb.name) : 'libro eliminado'; }
  if (hl.type === 'note') { var n = getNote(hl.target); return n ? ('Nota: ' + n.title) : 'nota eliminada'; }
  var bl = getBlockById(hl.target); return bl ? blockPickLabel(bl) : 'destino eliminado';
}
function navigateHlink(hl) {
  if (hl.type === 'notebook') {
    var nb = (data.notebooks || []).find(function (x) { return x.id === hl.target; });
    if (!nb) { toast('El libro destino ya no existe.', 'warn'); return; }
    ui.expN[nb.id] = true;
    var sec = sectionsOf(nb.id)[0], first = sec && notesOf(sec.id)[0];
    if (first) selectNote(first.id); else { save(); renderSidebar(); toast('Abre una nota dentro de «' + nb.name + '».', 'ok'); }
    return;
  }
  if (hl.type === 'note') { if (getNote(hl.target)) selectNote(hl.target); else toast('La nota destino ya no existe.', 'warn'); return; }
  var bl = getBlockById(hl.target);
  if (!bl) { toast('El bloque destino ya no existe.', 'warn'); return; }
  if (ui.currentNoteId !== bl.noteId) { selectNote(bl.noteId); requestAnimationFrame(function () { focusBlock(bl.id); }); }
  else focusBlock(bl.id);
}
function renderHlinksInto(wrap, b) {
  wrap.innerHTML = '';
  var hls = (b.content && b.content.hlinks) || [];
  wrap.style.display = hls.length ? '' : 'none';
  hls.forEach(function (hl) {
    var chip = h('span', { class: 'hlink-chip', title: 'Ir a ' + hlinkTargetLabel(hl) });
    var go = h('span', { class: 'hlink-go' }, '🔗 ', h('span', { class: 'hlink-text' }, hl.text));
    go.addEventListener('click', function (e) { e.stopPropagation(); navigateHlink(hl); });
    go.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    chip.appendChild(go);
    var del = h('button', { class: 'hlink-del', title: 'Quitar vínculo', onclick: function (e) { e.stopPropagation(); removeHlink(b, hl.id); } }, '×');
    del.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    chip.appendChild(del);
    wrap.appendChild(chip);
  });
}
function updateHlinks(el, b) { var w = el && el.querySelector('.card-hlinks'); if (w) renderHlinksInto(w, b); }

// ---------- Casillas de tarea clicables en notas/ideas (textarea de texto plano) ----------
// Al hacer clic sobre el marcador de una tarea ("- [ ]" / "- [x]") la marca o desmarca.
// Devuelve true si toggleó (para no confundirlo con un clic de edición normal).
function toggleTaskAtCaret(ta, b) {
  if (!ta || ta.selectionStart !== ta.selectionEnd) return false;   // hay selección → no togglear
  var v = ta.value, pos = ta.selectionStart;
  var ls = v.lastIndexOf('\n', pos - 1) + 1;
  var le = v.indexOf('\n', pos); if (le === -1) le = v.length;
  var line = v.slice(ls, le);
  var m = line.match(/^(\s*[-*+•·–—▸]\s+)\[( |x|X)\]/);            // marcador de casilla al inicio de la línea
  if (!m) return false;
  var boxStart = ls + m[1].length;                                  // posición del '['
  if (pos < ls || pos > boxStart + 3) return false;                 // el clic debe caer en el marcador "- [ ]"
  var checked = m[2] !== ' ';
  ta.value = v.slice(0, boxStart) + '[' + (checked ? ' ' : 'x') + ']' + v.slice(boxStart + 3);
  try { ta.selectionStart = ta.selectionEnd = pos; } catch (e) {}   // el marcador no cambia de longitud
  b.content = b.content || {};
  b.content.text = ta.value;
  touchNote(b.noteId);
  logChange(checked ? 'Tarea reabierta' : 'Tarea completada', snippet(line.replace(m[0], '').trim()));
  save();
  if (typeof scheduleAppleSync === 'function') scheduleAppleSync();
  return true;
}
function monoBody(b) {
  b.content = b.content || {};
  var ph = b.type === 'curl' ? 'curl -X GET https://api.ejemplo.com' : (b.type === 'json' ? '{\n  "clave": "valor"\n}' : (b.type === 'python' ? 'print("Hola")' : '// tu c\u00f3digo aqu\u00ed'));
  var ta = h('textarea', { class: 'card-ta mono', spellcheck: 'false', placeholder: ph });
  ta.value = b.content.text || '';
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange(typeMeta(b.type).label + ' editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '  '); b.content.text = ta.value; debouncedSave(); }
    if (b.type === 'curl' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCurlBlock(b, ta, out, status, runBtn); }
    if (b.type === 'python' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPythonBlock(b, ta, out, status, runBtn); }
  });
  if (b.type === 'python') {
    ta.classList.add('curl-input');
    var status = h('span', { class: 'mono-status' });
    var out = h('div', { class: 'py-out' });
    var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar el código (' + MOD + '+Enter)', onclick: function (e) {
      e.stopPropagation(); runPythonBlock(b, ta, out, status, runBtn);
    } }, 'Ejecutar');
    runBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var copyBtn = h('button', { class: 'mono-fmt', title: 'Copiar salida', onclick: function (e) {
      e.stopPropagation();
      var txt = out.textContent || '';
      if (!txt || out.classList.contains('empty')) return;
      try { navigator.clipboard.writeText(txt); status.textContent = 'Copiado'; status.className = 'mono-status ok'; } catch (err) {}
    } }, 'Copiar');
    copyBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('wheel', function (e) { e.stopPropagation(); });
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la salida' });
    var outH = (b.content.ui && b.content.ui.outH) || 150;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.result) renderPyResult(b.content.result, out, status);
    else { out.classList.add('empty'); out.textContent = 'La salida aparecerá aquí tras ejecutar (' + MOD + '+Enter).'; }
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, status), resize, out];
  }
  if (b.type === 'curl') {
    ta.classList.add('curl-input');
    var status = h('span', { class: 'mono-status' });
    var out = h('pre', { class: 'curl-out' });
    var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar la petici\u00f3n (' + MOD + '+Enter)', onclick: function (e) {
      e.stopPropagation(); runCurlBlock(b, ta, out, status, runBtn);
    } }, 'Ejecutar');
    runBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var copyBtn = h('button', { class: 'mono-fmt', title: 'Copiar respuesta', onclick: function (e) {
      e.stopPropagation();
      if (!out.textContent || out.classList.contains('empty')) return;
      try { navigator.clipboard.writeText(out.textContent); status.textContent = 'Copiado'; status.className = 'mono-status ok'; } catch (err) {}
    } }, 'Copiar');
    copyBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('wheel', function (e) { e.stopPropagation(); });
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la respuesta' });
    var outH = (b.content.ui && b.content.ui.outH) || 130;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.response && b.content.response.body != null) renderCurlResponse(b.content.response, out, status);
    else { out.classList.add('empty'); out.textContent = 'La respuesta aparecer\u00e1 aqu\u00ed tras ejecutar.'; }
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, status), resize, out];
  }
  if (b.type !== 'json') return [ta];
  var status = h('span', { class: 'mono-status' });
  var fmt = h('button', { class: 'mono-fmt', title: 'Formatear JSON', onclick: function (e) {
    e.stopPropagation();
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value || 'null'), null, 2);
      b.content.text = ta.value; save();
      status.textContent = 'Formateado'; status.className = 'mono-status ok';
    } catch (err) {
      status.textContent = 'JSON inv\u00e1lido'; status.className = 'mono-status err';
    }
  } }, 'Formatear');
  fmt.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  return [ta, h('div', { class: 'mono-bar' }, fmt, status)];
}

// ---------- Ejecuci\u00f3n de cURL ----------
function attachCurlResize(handle, out, b) {
  handle.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var startY = e.clientY;
    var startH = out.getBoundingClientRect().height;
    var card = out.closest('.card');
    document.body.classList.add('curl-resizing');
    function move(ev) {
      var dy = startY - ev.clientY; // arrastrar hacia arriba agranda la respuesta
      var hgt = Math.max(40, startH + dy);
      if (card) { var maxH = card.clientHeight - 150; if (maxH > 60) hgt = Math.min(hgt, maxH); }
      out.style.height = Math.round(hgt) + 'px';
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('curl-resizing');
      b.content = b.content || {};
      b.content.ui = b.content.ui || {};
      b.content.ui.outH = Math.round(out.getBoundingClientRect().height);
      debouncedSave();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
function renderCurlResponse(resp, out, status) {
  out.style.display = '';
  out.classList.remove('empty');
  out.innerHTML = '';
  var body = resp.body || '';
  var ctype = (resp.contentType || '').toLowerCase();
  var pretty = body, isJson = false;
  var looksJson = ctype.indexOf('json') !== -1 || /^\s*[\[{]/.test(body);
  if (looksJson) {
    try { pretty = JSON.stringify(JSON.parse(body), null, 2); isJson = true; } catch (e) { pretty = body; }
  }
  if (isJson) out.appendChild(highlightJSON(pretty));
  else out.textContent = pretty;
  var ok = resp.status >= 200 && resp.status < 300;
  status.textContent = resp.status + ' ' + (resp.reason || '') + (resp.timeMs != null ? '  \u00b7 ' + resp.timeMs + ' ms' : '');
  status.className = 'mono-status ' + (ok ? 'ok' : 'err');
}
function runCurlBlock(b, ta, out, status, runBtn) {
  b.content.text = ta.value;
  var cmd = (ta.value || '').trim();
  if (!cmd) { status.textContent = 'Escribe un comando cURL'; status.className = 'mono-status err'; return; }
  if (!SERVER || !window.fetch) {
    status.textContent = 'Requiere el servidor: py server.py'; status.className = 'mono-status err';
    out.style.display = ''; out.classList.remove('empty'); out.textContent = 'La ejecuci\u00f3n de cURL necesita el servidor Python (api/curl).\nInicia con:  py server.py  y abre http://localhost:8765';
    return;
  }
  status.textContent = 'Ejecutando\u2026'; status.className = 'mono-status';
  runBtn.disabled = true;
  apiFetch('api/curl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) })
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      runBtn.disabled = false;
      if (!resp || resp.ok === false) {
        status.textContent = 'Error'; status.className = 'mono-status err';
        out.style.display = ''; out.classList.remove('empty'); out.textContent = (resp && resp.error) || 'No se pudo ejecutar la petici\u00f3n.';
        return;
      }
      b.content.response = { status: resp.status, reason: resp.reason, body: resp.body, contentType: resp.contentType, timeMs: resp.timeMs };
      renderCurlResponse(resp, out, status);
      logChange('cURL ejecutado', (resp.method || '') + ' ' + resp.status + ' ' + snippet(resp.url || ''));
      save();
    })
    .catch(function (err) {
      runBtn.disabled = false;
      status.textContent = 'Error de red'; status.className = 'mono-status err';
      out.style.display = ''; out.classList.remove('empty'); out.textContent = String(err);
    });
}
// ---------- Ejecuci\u00f3n de Python (Pyodide, en el navegador) ----------
var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';
var _pyodide = null, _pyLoading = null;
function ensurePyodide() {
  if (_pyodide) return Promise.resolve(_pyodide);
  if (_pyLoading) return _pyLoading;
  _pyLoading = new Promise(function (resolve, reject) {
    function boot() {
      if (!window.loadPyodide) { reject(new Error('Pyodide no disponible.')); return; }
      window.loadPyodide({ indexURL: PYODIDE_URL })
        .then(function (py) { _pyodide = py; resolve(py); })
        .catch(reject);
    }
    if (window.loadPyodide) return boot();
    var s = document.createElement('script');
    s.src = PYODIDE_URL + 'pyodide.js';
    s.onload = boot;
    s.onerror = function () { reject(new Error('No se pudo cargar Pyodide (requiere conexi\u00f3n a internet).')); };
    document.head.appendChild(s);
  });
  return _pyLoading;
}
var PY_HARNESS = [
  'import sys, io, traceback, contextlib',
  '_buf = io.StringIO()',
  '_err = None',
  '_img = None',
  'try:',
  '    with contextlib.redirect_stdout(_buf), contextlib.redirect_stderr(_buf):',
  "        exec(compile(_USER_CODE, '<tunota>', 'exec'), globals())",
  '    try:',
  '        import matplotlib',
  '        import matplotlib.pyplot as _plt',
  '        if _plt.get_fignums():',
  '            import base64, io as _io2',
  '            _b = _io2.BytesIO()',
  "            _plt.savefig(_b, format='png', bbox_inches='tight', dpi=110)",
  "            _plt.close('all')",
  "            _img = base64.b64encode(_b.getvalue()).decode('ascii')",
  '    except Exception:',
  '        pass',
  'except Exception:',
  '    _err = traceback.format_exc()',
  '_out_text = _buf.getvalue()',
].join('\n');
function runPythonBlock(b, ta, out, status, runBtn) {
  b.content.text = ta.value;
  var code = ta.value || '';
  if (!code.trim()) { status.textContent = 'Escribe c\u00f3digo Python'; status.className = 'mono-status err'; return; }
  status.textContent = 'Cargando Python\u2026'; status.className = 'mono-status';
  runBtn.disabled = true;
  var t0 = Date.now();
  ensurePyodide().then(function (py) {
    status.textContent = 'Preparando paquetes\u2026';
    return py.loadPackagesFromImports(code).catch(function () {}).then(function () { return py; });
  }).then(function (py) {
    status.textContent = 'Ejecutando\u2026';
    py.globals.set('_USER_CODE', code);
    return py.runPythonAsync(PY_HARNESS).then(function () { return py; });
  }).then(function (py) {
    var text = py.globals.get('_out_text');
    var err = py.globals.get('_err');
    var img = py.globals.get('_img');
    var res = { text: text ? String(text) : '', error: err ? String(err) : '', img: img ? storeBlob('data:image/png;base64,' + String(img)) : '', timeMs: Date.now() - t0 };
    b.content.result = res;
    renderPyResult(res, out, status);
    logChange('Python ejecutado', res.error ? 'con error' : 'ok');
    save();
    runBtn.disabled = false;
  }).catch(function (e) {
    runBtn.disabled = false;
    status.textContent = 'Error'; status.className = 'mono-status err';
    out.style.display = ''; out.classList.remove('empty'); out.innerHTML = '';
    out.appendChild(h('pre', { class: 'py-err' }, String((e && e.message) || e)));
  });
}
function renderPyResult(res, out, status) {
  out.style.display = ''; out.classList.remove('empty'); out.innerHTML = '';
  if (res.text) out.appendChild(h('pre', { class: 'py-stdout' }, res.text));
  if (res.img) out.appendChild(h('img', { class: 'py-img', src: pyImgSrc(res.img), alt: 'gr\u00e1fico' }));
  if (res.error) out.appendChild(h('pre', { class: 'py-err' }, res.error));
  if (!res.text && !res.img && !res.error) out.textContent = '(sin salida)';
  if (res.error) { status.textContent = 'Error \u00b7 ' + res.timeMs + ' ms'; status.className = 'mono-status err'; }
  else { status.textContent = 'OK \u00b7 ' + res.timeMs + ' ms'; status.className = 'mono-status ok'; }
}

function highlightJSON(str) {
  var frag = document.createElement('span');
  var esc = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var re = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  frag.innerHTML = esc.replace(re, function (m) {
    var cls = 'j-num';
    if (/^"/.test(m)) cls = /:$/.test(m) ? 'j-key' : 'j-str';
    else if (/true|false/.test(m)) cls = 'j-bool';
    else if (/null/.test(m)) cls = 'j-null';
    return '<span class="' + cls + '">' + m + '</span>';
  });
  return frag;
}

// ---------- Tablas ----------
function newRow(n) { var r = []; for (var i = 0; i < n; i++) r.push(''); return r; }
function tableBody(b) {
  b.content = b.content || {};
  if (!b.content.table || !b.content.table.rows || !b.content.table.rows.length) b.content.table = { rows: [['', ''], ['', '']] };
  var wrap = h('div', { class: 'card-table-wrap' });
  renderTable(wrap, b);
  return wrap;
}
function renderTable(wrap, b) {
  wrap.innerHTML = '';
  var rows = b.content.table.rows;
  var table = h('table', { class: 'mini-table' });
  rows.forEach(function (row, r) {
    var tr = h('tr', r === 0 ? { class: 'thead' } : {});
    row.forEach(function (cell, c) {
      var inp = h('input', { class: 'cell', value: cell });
      inp.addEventListener('input', function () { b.content.table.rows[r][c] = inp.value; touchNote(b.noteId); debouncedSave(); });
      inp.addEventListener('change', save);
      inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      tr.appendChild(h('td', {}, inp));
    });
    table.appendChild(tr);
  });
  var mk = function (label, op, title) {
    var btn = h('button', { class: 'tbl-btn', title: title, onclick: function (e) { e.stopPropagation(); resizeTable(b, wrap, op); } }, label);
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    return btn;
  };
  var tools = h('div', { class: 'tbl-tools' },
    mk('+ fila', 'addRow', 'Agregar fila'),
    mk('\u2212 fila', 'delRow', 'Quitar fila'),
    mk('+ col', 'addCol', 'Agregar columna'),
    mk('\u2212 col', 'delCol', 'Quitar columna')
  );
  wrap.appendChild(table);
  wrap.appendChild(tools);
}
function resizeTable(b, wrap, op) {
  var rows = b.content.table.rows;
  var nCols = rows[0] ? rows[0].length : 0;
  if (op === 'addRow') rows.push(newRow(nCols));
  else if (op === 'delRow') { if (rows.length > 1) rows.pop(); }
  else if (op === 'addCol') rows.forEach(function (r) { r.push(''); });
  else if (op === 'delCol') { if (nCols > 1) rows.forEach(function (r) { r.pop(); }); }
  touchNote(b.noteId);
  logChange('Tabla modificada', rows.length + '\u00d7' + (rows[0] ? rows[0].length : 0));
  save();
  renderTable(wrap, b);
}
