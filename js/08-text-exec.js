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
// Reutiliza numMarkerStyled (definido en js/03-dom.js) para no duplicar la lógica de
// conversión a letras/romanos y mantener la coherencia con la auto-continuación de listas.
function numMarker(n) { return numMarkerStyled(n, (ui && ui.fmt && ui.fmt.num) || '1.'); }
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
  pop.appendChild(h('button', { class: 'cm-item', title: 'Convierte la lista enumerada (1., 2., 3.1.…) en un flujograma de formas conectadas. La plantilla «Lista → Flujograma» explica el formato', onclick: function () {
    closeTopbarMenu(); listToFlowchart(b);
  } }, icon('flow'), h('span', {}, 'Lista → flujograma')));
  pop.appendChild(h('div', { class: 'cm-sep' }));
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
// Esconder la salida (respuesta de cURL o resultado de Python): a veces solo interesa el
// comando y la respuesta ocupa media pantalla. Se recuerda por bloque en content.ui.outHidden
// y el bloque se encoge y recupera su alto al volver a mostrarla.
function toggleMonoOut(b, out, resize, btn, etiqueta) {
  b.content = b.content || {};
  b.content.ui = b.content.ui || {};
  var oculta = !b.content.ui.outHidden;
  var alto = (parseInt(out.style.height, 10) || 130) + 10;   // salida + tirador
  b.content.ui.outHidden = oculta;
  applyMonoOutHidden(b, out, resize, btn, etiqueta);
  var el = cardEl(b.id);
  if (oculta) { b.content.ui.hFull = b.height; b.height = Math.max(110, (b.height || 0) - alto); }
  else if (b.content.ui.hFull) { b.height = b.content.ui.hFull; }
  if (el) el.style.height = b.height + 'px';
  touchNote(b.noteId);
  logChange(oculta ? 'Respuesta oculta' : 'Respuesta visible', '');
  save();
  if (typeof drawLinks === 'function') drawLinks();
}
function applyMonoOutHidden(b, out, resize, btn, etiqueta) {
  var oculta = !!(b.content && b.content.ui && b.content.ui.outHidden);
  out.style.display = oculta ? 'none' : '';
  if (resize) resize.style.display = oculta ? 'none' : '';
  btn.textContent = oculta ? 'Ver ' + etiqueta : 'Ocultar';
  btn.title = oculta ? 'Volver a mostrar la ' + etiqueta : 'Esconder la ' + etiqueta + ' (el bloque se encoge)';
  btn.classList.toggle('on', oculta);
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
    out.addEventListener('wheel', function (e) { if (!(e.ctrlKey || e.metaKey)) e.stopPropagation(); }); // Ctrl/Cmd+rueda = zoom del lienzo
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la salida' });
    var outH = (b.content.ui && b.content.ui.outH) || 150;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.result) renderPyResult(b.content.result, out, status);
    else { out.classList.add('empty'); out.textContent = 'La salida aparecerá aquí tras ejecutar (' + MOD + '+Enter).'; }
    var hidePy = h('button', { class: 'mono-fmt' });
    hidePy.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    hidePy.addEventListener('click', function (e) { e.stopPropagation(); toggleMonoOut(b, out, resize, hidePy, 'salida'); });
    applyMonoOutHidden(b, out, resize, hidePy, 'salida');
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, hidePy, status), resize, out];
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
    out.addEventListener('wheel', function (e) { if (!(e.ctrlKey || e.metaKey)) e.stopPropagation(); }); // Ctrl/Cmd+rueda = zoom del lienzo
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la respuesta' });
    var outH = (b.content.ui && b.content.ui.outH) || 130;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.response && b.content.response.body != null) renderCurlResponse(b.content.response, out, status);
    else { out.classList.add('empty'); out.textContent = 'La respuesta aparecer\u00e1 aqu\u00ed tras ejecutar.'; }
    var hideBtn = h('button', { class: 'mono-fmt' });
    hideBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    hideBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMonoOut(b, out, resize, hideBtn, 'respuesta'); });
    applyMonoOutHidden(b, out, resize, hideBtn, 'respuesta');
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, hideBtn, status), resize, out];
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
      // Si estaba escondida, una respuesta nueva la saca: si no, parecería que no pasó nada.
      if (b.content.ui && b.content.ui.outHidden) {
        var elc = cardEl(b.id);
        var btnc = elc && elc.querySelector('.mono-bar .mono-fmt.on');
        if (btnc) toggleMonoOut(b, out, elc.querySelector('.curl-resize'), btnc, 'respuesta');
      }
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
// Mini hoja de c\u00e1lculo dentro de la tarjeta:
//  \u00b7 las columnas se ajustan solas al texto y el ancho/alto se puede fijar arrastrando los bordes,
//  \u00b7 cada cabecera ordena (alfab\u00e9tico, num\u00e9rico o por fecha) y filtra por texto o por valores,
//  \u00b7 se copian y pegan rangos de celdas en TSV (compatible con Excel / Google Sheets),
//  \u00b7 se esconden filas, columnas o el cuerpo entero, y se vuelven a mostrar.
// Modelo (b.content.table): { rows, colW, rowH, hidCols, hidRows, filters, sort, collapsed }.
// `rows[0]` es SIEMPRE la cabecera. Orden y filtros son de VISTA: nunca reordenan `rows`, as\u00ed
// que "quitar el orden" devuelve la tabla a como se escribi\u00f3 y el resto de la app (exportar,
// buscar, IA) sigue leyendo `rows` tal cual.
var TBL_MINW = 56, TBL_MAXW = 260, TBL_GUT = 24, TBL_MINH = 22;

function newRow(n) { var r = []; for (var i = 0; i < n; i++) r.push(''); return r; }

// Normaliza el modelo in situ (tablas antiguas solo ten\u00edan `rows`); NO reemplaza los arrays
// para que los manejadores ya enganchados sigan escribiendo en la misma estructura.
function tblState(b) {
  b.content = b.content || {};
  var t = b.content.table;
  if (!t || !Array.isArray(t.rows) || !t.rows.length) { t = { rows: [['', ''], ['', '']] }; b.content.table = t; }
  var nc = 0;
  t.rows.forEach(function (r) { if (Array.isArray(r)) nc = Math.max(nc, r.length); });
  if (nc < 1) nc = 1;
  t.rows.forEach(function (r, i) {
    if (!Array.isArray(r)) { r = [r == null ? '' : String(r)]; t.rows[i] = r; }
    for (var j = 0; j < nc; j++) r[j] = r[j] == null ? '' : String(r[j]);
    r.length = nc;
  });
  if (!Array.isArray(t.colW)) t.colW = [];
  if (!Array.isArray(t.rowH)) t.rowH = [];
  if (!Array.isArray(t.hidCols)) t.hidCols = [];
  if (!Array.isArray(t.hidRows)) t.hidRows = [];
  if (!t.filters || typeof t.filters !== 'object') t.filters = {};
  t.hidCols = t.hidCols.filter(function (c) { return c >= 0 && c < nc; });
  t.hidRows = t.hidRows.filter(function (r) { return r >= 1 && r < t.rows.length; });
  if (t.sort && !(typeof t.sort.col === 'number' && t.sort.col >= 0 && t.sort.col < nc)) t.sort = null;
  return t;
}
function tblSave(b, label, detail) {
  touchNote(b.noteId);
  if (label) logChange(label, detail || '');
  save();
}

// --- Comparaci\u00f3n de valores: texto, n\u00famero (1.234,56 / $1,234.56 / 12 %) y fecha (d/m/a, a-m-d) ---
function tblNorm(s) {
  s = String(s == null ? '' : s).toLowerCase();
  return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
}
function tblNum(v) {
  var x = String(v == null ? '' : v).trim().replace(/[\s\u00a0]/g, '');
  x = x.replace(/^[^\d\-+.,]+/, '').replace(/[^\d.,]+$/, '');
  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(x)) return NaN;
  var lastC = x.lastIndexOf(','), lastD = x.lastIndexOf('.');
  if (lastC > lastD) x = x.replace(/\./g, '').replace(',', '.');
  else x = x.replace(/,/g, '');
  var n = parseFloat(x);
  return isNaN(n) ? NaN : n;
}
function tblDate(v) {
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]).getTime(); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return NaN;
}
function tblColKind(t, col, rows) {
  var vals = 0, nums = 0, dates = 0;
  rows.forEach(function (r) {
    var v = String(t.rows[r][col] || '').trim();
    if (!v) return;
    vals++;
    if (!isNaN(tblNum(v))) nums++;
    if (!isNaN(tblDate(v))) dates++;
  });
  if (!vals) return 'text';
  if (dates === vals) return 'date';
  if (nums === vals) return 'num';
  return 'text';
}
function tblCompare(kind, a, b) {
  if (kind === 'num') return tblNum(a) - tblNum(b);
  if (kind === 'date') return tblDate(a) - tblDate(b);
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true });
}

// --- Vista: qu\u00e9 filas y columnas se ven, y en qu\u00e9 orden ---
function tblDataRows(t) { var out = []; for (var r = 1; r < t.rows.length; r++) out.push(r); return out; }
function tblRowPasses(t, r, skipCol) {
  var keys = Object.keys(t.filters);
  for (var i = 0; i < keys.length; i++) {
    var c = +keys[i], f = t.filters[keys[i]];
    if (!f || c === skipCol) continue;
    var v = t.rows[r] ? (t.rows[r][c] || '') : '';
    if (f.q && tblNorm(v).indexOf(tblNorm(f.q)) < 0) return false;
    if (f.excl && f.excl.length && f.excl.indexOf(v) >= 0) return false;
  }
  return true;
}
function tblViewRows(t) {
  var rows = [];
  for (var r = 1; r < t.rows.length; r++) {
    if (t.hidRows.indexOf(r) >= 0) continue;
    if (!tblRowPasses(t, r)) continue;
    rows.push(r);
  }
  if (t.sort) {
    var col = t.sort.col, dir = t.sort.dir === 'desc' ? -1 : 1;
    var kind = tblColKind(t, col, rows);
    var full = [], empty = [];
    rows.forEach(function (r) { (String(t.rows[r][col] || '').trim() ? full : empty).push(r); });
    full.sort(function (a, b) {
      var d = tblCompare(kind, t.rows[a][col], t.rows[b][col]);
      return d ? d * dir : a - b;              // desempate por posici\u00f3n original (orden estable)
    });
    rows = full.concat(empty);                 // las celdas vac\u00edas siempre al final
  }
  return rows;
}
function tblViewCols(t) {
  var cols = [], n = t.rows[0].length;
  for (var c = 0; c < n; c++) if (t.hidCols.indexOf(c) < 0) cols.push(c);
  if (!cols.length) {                          // red de seguridad: nunca una tabla sin columnas
    t.hidCols = [];
    for (var i = 0; i < n; i++) cols.push(i);
  }
  return cols;
}
function tblHiddenRange(list, from, to) {
  return list.filter(function (i) { return i > from && (to == null || i < to); });
}
function tblRowAt(st, vr) { return vr <= 0 ? 0 : (st.view.rows[vr - 1] != null ? st.view.rows[vr - 1] : 0); }
function tblColAt(st, vc) { return st.view.cols[vc]; }
function tblActive(t) {
  return !!(t.sort || Object.keys(t.filters).length || t.hidCols.length || t.hidRows.length || t.collapsed);
}

// --- Medida del texto para el ancho autom\u00e1tico de columna ---
var _tblCtx = null;
function tblTextW(s, bold) {
  if (!_tblCtx) { var cv = document.createElement('canvas'); _tblCtx = cv.getContext && cv.getContext('2d'); }
  if (!_tblCtx) return String(s || '').length * 7;
  _tblCtx.font = (bold ? '700 ' : '') + '12.5px Nunito, system-ui, sans-serif';
  var w = 0;
  String(s == null ? '' : s).split('\n').forEach(function (line) { w = Math.max(w, _tblCtx.measureText(line).width); });
  return w;
}
// Ancho de cada columna visible: autom\u00e1tico seg\u00fan el texto (acotado), o el fijado a mano.
// Si sobra sitio en la tarjeta se reparte entre las autom\u00e1ticas; si falta, se encogen (nunca
// por debajo de TBL_MINW: a partir de ah\u00ed la tabla se desplaza en horizontal).
function tblWidths(t, view, avail) {
  var nat = view.cols.map(function (c) {
    var w = tblTextW(t.rows[0][c], true) + 42;
    view.rows.forEach(function (r) { w = Math.max(w, tblTextW(t.rows[r][c], false) + 18); });
    return Math.max(TBL_MINW, Math.min(TBL_MAXW, Math.ceil(w)));
  });
  var widths = view.cols.map(function (c, i) { return t.colW[c] ? Math.max(30, Math.round(t.colW[c])) : nat[i]; });
  var autos = [];
  view.cols.forEach(function (c, i) { if (!t.colW[c]) autos.push(i); });
  var box = Math.max(0, (avail || 0) - TBL_GUT - 2);
  if (!box || !autos.length) return widths;
  var sum = widths.reduce(function (a, w) { return a + w; }, 0), i;
  if (sum < box) {
    var base = 0;
    autos.forEach(function (i2) { base += widths[i2]; });
    if (base > 0) { var extra = box - sum; autos.forEach(function (i2) { widths[i2] += Math.floor(extra * widths[i2] / base); }); }
  } else if (sum > box) {
    var slack = 0;
    autos.forEach(function (i2) { slack += widths[i2] - TBL_MINW; });
    if (slack > 0) {
      var k = Math.min(1, (sum - box) / slack);
      autos.forEach(function (i2) { widths[i2] = Math.round(widths[i2] - (widths[i2] - TBL_MINW) * k); });
    }
  }
  return widths;
}
function tblAutoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(18, ta.scrollHeight) + 'px';
}
// Aplica anchos de columna y altos de fila sobre el DOM ya montado (sin reconstruirlo).
function tblLayout(wrap) {
  var st = wrap._tbl;
  if (!st || !st.cg || !wrap.isConnected) return;
  var t = st.t, view = st.view;
  var scroll = wrap.querySelector('.tbl-scroll');
  var avail = (scroll && scroll.clientWidth) || ((st.b.width || 280) - 22);
  var widths = tblWidths(t, view, avail);
  var cols = st.cg.children;
  if (cols[0]) cols[0].style.width = TBL_GUT + 'px';
  var total = TBL_GUT;
  widths.forEach(function (w, i) { if (cols[i + 1]) cols[i + 1].style.width = w + 'px'; total += w; });
  var table = wrap.querySelector('.mini-table');
  if (table) table.style.width = total + 'px';
  Array.prototype.forEach.call(wrap.querySelectorAll('tr[data-r]'), function (tr) {
    var r = +tr.getAttribute('data-r');
    var fixed = t.rowH[r] ? Math.max(TBL_MINH, Math.round(t.rowH[r])) : 0;
    tr.classList.toggle('fixh', !!fixed);
    tr.style.height = fixed ? fixed + 'px' : '';
    Array.prototype.forEach.call(tr.querySelectorAll('textarea.cell'), function (ta) {
      if (fixed) ta.style.height = '';
      else tblAutoGrow(ta);
    });
  });
  return total;
}
function tblRelayout(wrap, ms) {
  clearTimeout(wrap._tblT);
  wrap._tblT = setTimeout(function () { tblLayout(wrap); }, ms || 140);
}

// ---------- Render ----------
function tableBody(b) {
  var wrap = h('div', { class: 'card-table-wrap', tabindex: '-1' });
  renderTable(wrap, b);
  return wrap;
}
function renderTable(wrap, b) {
  var t = tblState(b);
  var st = wrap._tbl || (wrap._tbl = { sel: null });
  st.b = b; st.t = t;
  st.view = { cols: tblViewCols(t), rows: tblViewRows(t) };
  wrap.innerHTML = '';
  wrap.classList.toggle('collapsed', !!t.collapsed);

  var table = h('table', { class: 'mini-table' });
  var cg = h('colgroup');
  cg.appendChild(h('col', { class: 'cg-gut' }));
  st.view.cols.forEach(function () { cg.appendChild(h('col')); });
  table.appendChild(cg);
  st.cg = cg;

  var thr = h('tr', { class: 'thead', 'data-r': '0' });
  thr.appendChild(tblCornerCell(b, wrap, t));
  st.view.cols.forEach(function (c, vc) { thr.appendChild(tblHeadCell(b, wrap, t, c, vc)); });
  table.appendChild(thr);
  if (!t.collapsed) {
    st.view.rows.forEach(function (r, i) {
      var tr = h('tr', { 'data-r': String(r) });
      tr.appendChild(tblGutterCell(b, wrap, t, r, i));
      st.view.cols.forEach(function (c, vc) { tr.appendChild(tblCellTd(b, wrap, t, r, c, i + 1, vc)); });
      table.appendChild(tr);
    });
  }
  var scroll = h('div', { class: 'tbl-scroll' }, table);
  wrap.appendChild(scroll);
  var status = tblStatusBar(b, wrap, t);
  if (status) wrap.appendChild(status);
  wrap.appendChild(tblToolbar(b, wrap, t));

  if (st.sel) {                                  // la selecci\u00f3n puede quedar fuera tras filtrar
    var nvr = st.view.rows.length, nvc = st.view.cols.length;
    if (st.sel.r2 > nvr || st.sel.c2 >= nvc) st.sel = null;
  }
  tblPaint(wrap);
  tblBind(wrap, b);
  tblLayout(wrap);
  // Al construir la tarjeta el nodo aún no está en el documento: se recoloca en cuanto lo está
  // (rAF) y con un temporizador de respaldo por si el navegador retrasa el frame.
  requestAnimationFrame(function () { tblLayout(wrap); });
  setTimeout(function () { tblLayout(wrap); }, 0);
  return wrap;
}
function tblCornerCell(b, wrap, t) {
  var td = h('td', { class: 'tbl-gut tbl-corner', title: 'Seleccionar toda la tabla' });
  var hid = t.hidCols.length + t.hidRows.length;
  td.appendChild(h('span', { class: 'corner-mark' }));
  td.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); tblSelectAll(wrap); });
  if (hid) td.title += ' \u00b7 ' + hid + ' oculta(s)';
  return td;
}
function tblHeadCell(b, wrap, t, c, vc) {
  var st = wrap._tbl;
  var cls = 'tbl-h';
  if (t.sort && t.sort.col === c) cls += ' sorted';
  if (t.filters[c]) cls += ' filtered';
  var td = h('td', { class: cls, 'data-r': '0', 'data-c': String(c), 'data-vr': '0', 'data-vc': String(vc) });
  td.appendChild(tblCellInput(b, wrap, t, 0, c, 0, vc));
  var arrow = t.sort && t.sort.col === c ? (t.sort.dir === 'desc' ? '\u2193' : '\u2191') : null;
  var btn = h('button', {
    class: 'th-menu' + (arrow ? ' on' : ''),
    title: 'Ordenar y filtrar esta columna',
    onclick: function (e) { e.stopPropagation(); openTableColMenu(b, wrap, c, btn); },
  }, arrow ? h('span', { class: 'th-arrow' }, arrow) : icon('filter'));
  btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  td.appendChild(btn);
  // Marcas para revelar columnas escondidas a un lado y otro de esta cabecera.
  var prev = vc > 0 ? st.view.cols[vc - 1] : -1;
  var before = tblHiddenRange(t.hidCols, prev, c);
  if (before.length) td.appendChild(tblRevealMark(b, wrap, 'col', before, 'left'));
  if (vc === st.view.cols.length - 1) {
    var after = tblHiddenRange(t.hidCols, c, null);
    if (after.length) td.appendChild(tblRevealMark(b, wrap, 'col', after, 'right'));
  }
  var grip = h('span', { class: 'col-grip', title: 'Arrastra para el ancho \u00b7 doble clic = autom\u00e1tico' });
  grip.addEventListener('pointerdown', function (e) { tblStartColResize(e, b, wrap, c, td); });
  grip.addEventListener('dblclick', function (e) {
    e.stopPropagation(); e.preventDefault();
    t.colW[c] = null; tblSave(b, 'Ancho de columna autom\u00e1tico'); tblLayout(wrap);
  });
  td.appendChild(grip);
  return td;
}
function tblGutterCell(b, wrap, t, r, i) {
  var st = wrap._tbl;
  var td = h('td', { class: 'tbl-gut', title: 'Fila ' + r + ' \u00b7 clic para seleccionarla' });
  td.appendChild(h('span', { class: 'gut-n' }, String(r)));
  var prev = i > 0 ? st.view.rows[i - 1] : 0;
  var before = tblHiddenRange(t.hidRows, prev, r);
  if (before.length) td.appendChild(tblRevealMark(b, wrap, 'row', before, 'top'));
  if (i === st.view.rows.length - 1) {
    var after = tblHiddenRange(t.hidRows, r, null);
    if (after.length) td.appendChild(tblRevealMark(b, wrap, 'row', after, 'bottom'));
  }
  var grip = h('span', { class: 'row-grip', title: 'Arrastra para el alto \u00b7 doble clic = autom\u00e1tico' });
  grip.addEventListener('pointerdown', function (e) { tblStartRowResize(e, b, wrap, r, td.parentNode); });
  grip.addEventListener('dblclick', function (e) {
    e.stopPropagation(); e.preventDefault();
    t.rowH[r] = null; tblSave(b, 'Alto de fila autom\u00e1tico'); tblLayout(wrap);
  });
  td.appendChild(grip);
  td.addEventListener('mousedown', function (e) {
    if (e.target === grip) return;
    e.stopPropagation(); e.preventDefault();
    if (e.shiftKey && wrap._tbl.sel) tblExtendSel(wrap, i + 1, st.view.cols.length - 1);
    else tblSetSel(wrap, i + 1, 0, i + 1, st.view.cols.length - 1);
    tblFocusWrap(wrap);
  });
  return td;
}
function tblRevealMark(b, wrap, kind, list, side) {
  var el = h('button', {
    class: 'tbl-reveal ' + kind + ' ' + side,
    title: 'Mostrar ' + list.length + (kind === 'col' ? ' columna(s) oculta(s)' : ' fila(s) oculta(s)'),
    onclick: function (e) {
      e.stopPropagation();
      var t = wrap._tbl.t;
      var key = kind === 'col' ? 'hidCols' : 'hidRows';
      t[key] = t[key].filter(function (i) { return list.indexOf(i) < 0; });
      tblSave(b, 'Mostrar ' + (kind === 'col' ? 'columnas' : 'filas'), String(list.length));
      renderTable(wrap, b);
    },
  }, kind === 'col' ? '\u203a\u2039' : '\u2304');
  el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  return el;
}
function tblCellTd(b, wrap, t, r, c, vr, vc) {
  var td = h('td', { class: 'tbl-c', 'data-r': String(r), 'data-c': String(c), 'data-vr': String(vr), 'data-vc': String(vc) });
  td.appendChild(tblCellInput(b, wrap, t, r, c, vr, vc));
  return td;
}
function tblCellInput(b, wrap, t, r, c, vr, vc) {
  var ta = h('textarea', { class: 'cell' + (r === 0 ? ' hcell' : ''), rows: '1', spellcheck: 'false' });
  ta.value = t.rows[r][c] || '';
  ta.addEventListener('input', function () {
    t.rows[r][c] = ta.value;
    if (!t.rowH[r]) tblAutoGrow(ta);
    touchNote(b.noteId); debouncedSave();
    tblRelayout(wrap);                       // el ancho de la columna sigue al texto
  });
  ta.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    if (e.shiftKey) { e.preventDefault(); tblSetSel(wrap, vr, vc, null, null, true); tblFocusWrap(wrap); return; }
    tblSetSel(wrap, vr, vc, vr, vc);
    tblStartRangeDrag(wrap, vr, vc);
  });
  ta.addEventListener('focus', function () { if (!wrap._tbl.dragging) tblSetSel(wrap, vr, vc, vr, vc); });
  ta.addEventListener('keydown', function (e) { tblCellKey(e, b, wrap, ta, vr, vc); });
  ta.addEventListener('contextmenu', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (!tblInSel(wrap, vr, vc)) tblSetSel(wrap, vr, vc, vr, vc);
    openTableCellMenu(b, wrap, e.clientX, e.clientY);
  });
  return ta;
}
function tblStatusBar(b, wrap, t) {
  if (!tblActive(t)) return null;
  var st = wrap._tbl, bits = [];
  var totalRows = t.rows.length - 1;
  if (st.view.rows.length !== totalRows) bits.push(st.view.rows.length + ' de ' + totalRows + ' filas');
  if (t.sort) bits.push('orden: ' + ((t.rows[0][t.sort.col] || '').trim() || ('col. ' + (t.sort.col + 1))) + ' ' + (t.sort.dir === 'desc' ? '\u2193' : '\u2191'));
  if (t.hidCols.length) bits.push(t.hidCols.length + ' col. ocultas');
  if (t.hidRows.length) bits.push(t.hidRows.length + ' filas ocultas');
  if (t.collapsed) bits.push('contenido escondido');
  var bar = h('div', { class: 'tbl-status' }, h('span', { class: 'tbl-status-txt' }, bits.join(' \u00b7 ')));
  var btn = h('button', { class: 'tbl-btn tbl-clear', title: 'Quitar orden, filtros y volver a mostrar todo', onclick: function (e) { e.stopPropagation(); tblResetView(b, wrap); } }, 'Restablecer');
  btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  bar.appendChild(btn);
  return bar;
}
function tblToolbar(b, wrap, t) {
  var mkOp = function (label, op, title) {
    var btn = h('button', { class: 'tbl-btn', title: title, onclick: function (e) { e.stopPropagation(); resizeTable(b, wrap, op); } }, label);
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    return btn;
  };
  var mkIco = function (ic, title, fn, on) {
    var btn = h('button', { class: 'tbl-btn tbl-ico' + (on ? ' on' : ''), title: title, onclick: function (e) { e.stopPropagation(); fn(e); } }, icon(ic));
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    return btn;
  };
  return h('div', { class: 'tbl-tools' },
    mkOp('+ fila', 'addRow', 'Agregar una fila (debajo de la seleccionada)'),
    mkOp('\u2212 fila', 'delRow', 'Quitar la fila seleccionada (o la \u00faltima)'),
    mkOp('+ col', 'addCol', 'Agregar una columna (a la derecha de la seleccionada)'),
    mkOp('\u2212 col', 'delCol', 'Quitar la columna seleccionada (o la \u00faltima)'),
    h('span', { class: 'tbl-sp' }),
    mkIco('copy', 'Copiar la selecci\u00f3n o toda la tabla (se pega en Excel / Sheets)', function () { tblCopyClipboard(b, wrap); }),
    mkIco('paste', 'Pegar celdas desde el portapapeles (Excel, Sheets, CSV\u2026)', function () { tblPasteClipboard(b, wrap); }),
    mkIco('fit', 'Ajustar las columnas al texto y la tarjeta al contenido', function () { tblFit(b, wrap); }),
    mkIco(t.collapsed ? 'eyeOff' : 'eye', t.collapsed ? 'Mostrar el contenido' : 'Esconder el contenido (deja solo la cabecera)', function () {
      t.collapsed = !t.collapsed;
      tblSave(b, t.collapsed ? 'Contenido de tabla escondido' : 'Contenido de tabla visible');
      renderTable(wrap, b);
    }, t.collapsed)
  );
}

// ---------- Selecci\u00f3n de celdas ----------
function tblSetSel(wrap, ar, ac, r2, c2, extend) {
  var st = wrap._tbl;
  if (ar == null) { st.sel = null; tblPaint(wrap); return; }
  var s = st.sel;
  if (extend && s) { s.r1 = Math.min(s.ar, ar); s.r2 = Math.max(s.ar, ar); s.c1 = Math.min(s.ac, ac); s.c2 = Math.max(s.ac, ac); }
  else st.sel = { ar: ar, ac: ac, r1: Math.min(ar, r2), r2: Math.max(ar, r2), c1: Math.min(ac, c2), c2: Math.max(ac, c2) };
  tblPaint(wrap);
}
function tblExtendSel(wrap, vr, vc) {
  var s = wrap._tbl.sel;
  if (!s) return tblSetSel(wrap, vr, vc, vr, vc);
  s.r1 = Math.min(s.ar, vr); s.r2 = Math.max(s.ar, vr);
  s.c1 = Math.min(s.ac, vc); s.c2 = Math.max(s.ac, vc);
  tblPaint(wrap);
}
function tblSelectAll(wrap) {
  var st = wrap._tbl;
  tblSetSel(wrap, 0, 0, st.view.rows.length, Math.max(0, st.view.cols.length - 1));
  tblFocusWrap(wrap);
}
function tblInSel(wrap, vr, vc) {
  var s = wrap._tbl.sel;
  return !!s && vr >= s.r1 && vr <= s.r2 && vc >= s.c1 && vc <= s.c2;
}
function tblSelCells(wrap) {
  var st = wrap._tbl, s = st.sel, out = [];
  if (!s) return out;
  for (var vr = s.r1; vr <= s.r2; vr++) {
    for (var vc = s.c1; vc <= s.c2; vc++) out.push({ r: tblRowAt(st, vr), c: tblColAt(st, vc) });
  }
  return out;
}
function tblPaint(wrap) {
  var st = wrap._tbl, s = st.sel;
  Array.prototype.forEach.call(wrap.querySelectorAll('td[data-vr]'), function (td) {
    var vr = +td.getAttribute('data-vr'), vc = +td.getAttribute('data-vc');
    var on = !!s && vr >= s.r1 && vr <= s.r2 && vc >= s.c1 && vc <= s.c2;
    td.classList.toggle('sel', on);
    td.classList.toggle('anchor', !!s && vr === s.ar && vc === s.ac);
  });
  wrap.classList.toggle('has-range', !!s && (s.r1 !== s.r2 || s.c1 !== s.c2));
}
function tblFocusWrap(wrap) {
  var a = document.activeElement;
  if (a && a.classList && a.classList.contains('cell') && wrap.contains(a)) a.blur();
  try { wrap.focus({ preventScroll: true }); } catch (e) { wrap.focus(); }
}
function tblTdAt(wrap, x, y) {
  var el = document.elementFromPoint(x, y);
  var td = el && el.closest ? el.closest('td[data-vr]') : null;
  return td && wrap.contains(td) ? td : null;
}
function tblStartRangeDrag(wrap, vr, vc) {
  var st = wrap._tbl;
  st.dragging = false;
  function move(ev) {
    var td = tblTdAt(wrap, ev.clientX, ev.clientY);
    if (!td) return;
    var r = +td.getAttribute('data-vr'), c = +td.getAttribute('data-vc');
    if (r === vr && c === vc && !st.dragging) return;
    if (!st.dragging) { st.dragging = true; document.body.classList.add('tbl-selecting'); tblFocusWrap(wrap); }
    tblExtendSel(wrap, r, c);
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('tbl-selecting');
    setTimeout(function () { st.dragging = false; }, 0);
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
// ---------- Enumeración que continúa en las tablas ----------
// Igual que en una nota: si la celda de arriba (misma columna) es un ítem de lista, al bajar
// con Enter o Tab la celda nueva se estrena con el marcador siguiente —1. → 2., a) → b),
// I. → II., viñeta → viñeta, casilla → casilla vacía—. Respeta el estilo de ui.fmt.num.
function tblNextMarker(prev) {
  if (typeof outlineParse !== 'function') return '';
  var it = outlineParse(String(prev == null ? '' : prev).split('\n').pop());
  if (!it.list || !it.text) return '';   // un "1." suelto sin texto no arrastra la lista
  if (it.kind === 'ordered') return numMarkerStyled((it.num || 0) + 1, it.style);
  if (it.kind === 'task') return '- [ ] ';
  var bl = outlineBullets();
  return bl[0] + ' ';
}
// Rellena la celda destino si está vacía y la de arriba enumera. Trabaja sobre las filas de
// la VISTA, así respeta el orden y los filtros activos.
function tblAutoNumber(st, vr, vc) {
  var t = st.t;
  if (vr < 2) return false;                       // vr 0 es la cabecera: no arrastra numeración
  var r = tblRowAt(st, vr), c = tblColAt(st, vc);
  var rPrev = tblRowAt(st, vr - 1);
  if (!t.rows[r] || !t.rows[rPrev] || t.rows[r][c]) return false;  // solo celdas vacías
  var m = tblNextMarker(t.rows[rPrev][c]);
  if (!m) return false;
  t.rows[r][c] = m;
  return true;
}
// autonumDesde: fila de partida. Solo se continúa la enumeración si el salto BAJA de fila
// (Enter, o Tab que se desborda al final de la fila); tabulando por la misma fila, no.
function tblMove(wrap, b, vr, vc, grow, autonumDesde) {
  var st = wrap._tbl;
  var maxR = st.view.rows.length, maxC = st.view.cols.length - 1;
  if (vc > maxC) { vc = 0; vr++; }
  if (vc < 0) { vc = maxC; vr--; }
  if (vr > maxR) {
    if (!grow || st.t.collapsed) return;
    tblInsertRow(st.t, st.t.rows.length);      // Tab/Enter al final: crea fila nueva
    tblSave(b, 'Fila agregada');
    renderTable(wrap, b);
    st = wrap._tbl;
    vr = st.view.rows.length;
  }
  if (vr < 0) vr = 0;
  var td = wrap.querySelector('td[data-vr="' + vr + '"][data-vc="' + vc + '"]');
  var ta = td && td.querySelector('textarea.cell');
  if (!ta) return;
  tblSetSel(wrap, vr, vc, vr, vc);
  if (autonumDesde != null && vr > autonumDesde && tblAutoNumber(wrap._tbl, vr, vc)) {
    ta.value = wrap._tbl.t.rows[tblRowAt(wrap._tbl, vr)][tblColAt(wrap._tbl, vc)];
    touchNote(b.noteId);
    debouncedSave();
    tblRelayout(wrap);
  }
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function tblCellKey(e, b, wrap, ta, vr, vc) {
  var k = e.key;
  if (k === 'Escape') { e.stopPropagation(); tblFocusWrap(wrap); return; }
  if (k === 'Tab') { e.preventDefault(); e.stopPropagation(); tblMove(wrap, b, vr, vc + (e.shiftKey ? -1 : 1), true, e.shiftKey ? null : vr); return; }
  if (k === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault(); e.stopPropagation(); tblMove(wrap, b, vr + 1, vc, true, vr); return;
  }
  // Shift/Alt+Enter parte la celda en varias líneas: dentro de ella la lista también continúa.
  if (k === 'Enter' && (e.shiftKey || e.altKey) && typeof outlineApply === 'function') {
    var stC = wrap._tbl, tC = stC.t, rC = tblRowAt(stC, vr), cC = tblColAt(stC, vc);
    var sync = function () {
      tC.rows[rC][cC] = ta.value;
      if (!tC.rowH[rC]) tblAutoGrow(ta);
      touchNote(b.noteId); debouncedSave(); tblRelayout(wrap);
    };
    if (outlineApply(ta, sync, 'enter', false)) { e.preventDefault(); e.stopPropagation(); return; }
    e.stopPropagation();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && /^[cvxadCVXAD]$/.test(k)) { e.stopPropagation(); return; } // no molestar a los atajos del lienzo
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    var s0 = ta.selectionStart, s1 = ta.selectionEnd, v = ta.value;
    var moved = false;
    if (k === 'ArrowLeft' && s0 === 0 && s1 === 0) { tblMove(wrap, b, vr, vc - 1); moved = true; }
    else if (k === 'ArrowRight' && s0 === v.length && s1 === v.length) { tblMove(wrap, b, vr, vc + 1); moved = true; }
    else if (k === 'ArrowUp' && v.slice(0, s0).indexOf('\n') < 0) { tblMove(wrap, b, vr - 1, vc); moved = true; }
    else if (k === 'ArrowDown' && v.slice(s1).indexOf('\n') < 0) { tblMove(wrap, b, vr + 1, vc); moved = true; }
    if (moved) e.preventDefault();
    e.stopPropagation();
  }
}

// ---------- Portapapeles (TSV: Excel / Google Sheets) ----------
function tblEsc(v) {
  v = String(v == null ? '' : v);
  return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function tblSelTSV(wrap) {
  var st = wrap._tbl, s = st.sel, t = st.t, out = [];
  var r1 = s ? s.r1 : 0, r2 = s ? s.r2 : st.view.rows.length;
  var c1 = s ? s.c1 : 0, c2 = s ? s.c2 : st.view.cols.length - 1;
  for (var vr = r1; vr <= r2; vr++) {
    var line = [];
    for (var vc = c1; vc <= c2; vc++) line.push(tblEsc(t.rows[tblRowAt(st, vr)][tblColAt(st, vc)]));
    out.push(line.join('\t'));
  }
  return out.join('\n');
}
function tblSelHTML(wrap) {
  var st = wrap._tbl, s = st.sel, t = st.t;
  var r1 = s ? s.r1 : 0, r2 = s ? s.r2 : st.view.rows.length;
  var c1 = s ? s.c1 : 0, c2 = s ? s.c2 : st.view.cols.length - 1;
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); };
  var html = '<table>';
  for (var vr = r1; vr <= r2; vr++) {
    html += '<tr>';
    for (var vc = c1; vc <= c2; vc++) {
      var tag = vr === 0 ? 'th' : 'td';
      html += '<' + tag + '>' + esc(t.rows[tblRowAt(st, vr)][tblColAt(st, vc)]) + '</' + tag + '>';
    }
    html += '</tr>';
  }
  return html + '</table>';
}
// Acepta TSV (Excel/Sheets) y CSV con ; o , cuando el separador es coherente en todas las l\u00edneas.
function tblParseGrid(text) {
  text = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var sep = '\t';
  if (text.indexOf('\t') < 0) {
    var lines = text.split('\n').filter(function (l) { return l !== ''; });
    var pick = function (ch) {
      if (lines.length < 2) return false;
      var n = -1;
      for (var i = 0; i < lines.length; i++) {
        var k = lines[i].split(ch).length - 1;
        if (k < 1) return false;
        if (n < 0) n = k; else if (n !== k) return false;
      }
      return true;
    };
    if (pick(';')) sep = ';';
    else if (pick(',')) sep = ',';
  }
  var rows = [], row = [], cur = '', q = false, i = 0;
  while (i < text.length) {
    var ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"' && cur === '') { q = true; i++; continue; }
    if (ch === sep) { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += ch; i++;
  }
  row.push(cur); rows.push(row);
  while (rows.length > 1 && rows[rows.length - 1].every(function (v) { return v === ''; })) rows.pop();
  return rows;
}
function tblApplyGrid(b, wrap, grid) {
  if (!grid.length) return;
  var st = wrap._tbl, t = st.t;
  var s = st.sel || { r1: st.view.rows.length ? 1 : 0, c1: 0 };
  pushUndo('Pegar en tabla');
  var vr0 = s.r1, vc0 = s.c1;
  grid.forEach(function (line, i) {
    var vr = vr0 + i, r;
    if (vr === 0) r = 0;
    else if (vr - 1 < st.view.rows.length) r = st.view.rows[vr - 1];
    else { r = t.rows.length; tblInsertRow(t, r); st.view.rows.push(r); }
    line.forEach(function (val, j) {
      var vc = vc0 + j, c;
      if (vc < st.view.cols.length) c = st.view.cols[vc];
      else { c = t.rows[0].length; tblInsertCol(t, c); st.view.cols.push(c); }
      t.rows[r][c] = val;
    });
  });
  tblSave(b, 'Celdas pegadas', grid.length + '\u00d7' + grid[0].length);
  renderTable(wrap, b);
  st = wrap._tbl;
  tblSetSel(wrap, vr0, vc0, Math.min(vr0 + grid.length - 1, st.view.rows.length), Math.min(vc0 + grid[0].length - 1, st.view.cols.length - 1));
  toast(grid.length + ' \u00d7 ' + grid[0].length + ' celdas pegadas', 'ok');
}
function tblClearSel(b, wrap) {
  var cells = tblSelCells(wrap);
  if (!cells.length) return;
  var t = wrap._tbl.t;
  pushUndo('Vaciar celdas');
  cells.forEach(function (p) { t.rows[p.r][p.c] = ''; });
  tblSave(b, 'Celdas vaciadas', cells.length + '');
  renderTable(wrap, b);
}
function tblCopyClipboard(b, wrap) {
  var txt = tblSelTSV(wrap);
  var done = function () { toast('Copiado \u00b7 se pega en Excel, Sheets o en otra tabla', 'ok'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, function () { tblCopyFallback(txt, done); });
  } else tblCopyFallback(txt, done);
}
function tblCopyFallback(txt, done) {
  var prev = document.activeElement;
  var ta = h('textarea', { style: { position: 'fixed', opacity: '0', left: '-9999px' } });
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar', 'warn'); }
  ta.remove();
  if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e2) { prev.focus(); }
}
function tblPasteClipboard(b, wrap) {
  if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Coloca el cursor en una celda y pulsa ' + MOD + '+V', 'warn'); return; }
  navigator.clipboard.readText().then(function (txt) {
    if (!txt) { toast('El portapapeles est\u00e1 vac\u00edo', 'warn'); return; }
    tblApplyGrid(b, wrap, tblParseGrid(txt));
  }, function () { toast('El navegador no deja leer el portapapeles: pulsa ' + MOD + '+V sobre una celda', 'warn'); });
}

// ---------- Eventos a nivel de tabla (una sola vez por tarjeta) ----------
function tblBind(wrap, b) {
  if (wrap._tblBound) { wrap._tbl.b = b; return; }
  wrap._tblBound = true;
  wrap.addEventListener('copy', function (e) {
    var st = wrap._tbl, s = st.sel;
    if (!s) return;
    var multi = s.r1 !== s.r2 || s.c1 !== s.c2;
    var a = document.activeElement;
    var editing = a && a.classList && a.classList.contains('cell') && wrap.contains(a) && a.selectionStart !== a.selectionEnd;
    if (!multi && editing) return;                      // copia normal dentro de la celda
    e.preventDefault(); e.stopPropagation();
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', tblSelTSV(wrap));
      e.clipboardData.setData('text/html', tblSelHTML(wrap));
    }
  });
  wrap.addEventListener('cut', function (e) {
    var st = wrap._tbl, s = st.sel;
    if (!s) return;
    var a = document.activeElement;
    var editing = a && a.classList && a.classList.contains('cell') && wrap.contains(a) && a.selectionStart !== a.selectionEnd;
    if (s.r1 === s.r2 && s.c1 === s.c2 && editing) return;
    e.preventDefault(); e.stopPropagation();
    if (e.clipboardData) e.clipboardData.setData('text/plain', tblSelTSV(wrap));
    tblClearSel(wrap._tbl.b, wrap);
  });
  wrap.addEventListener('paste', function (e) {
    e.stopPropagation();                                 // el pegado global no debe crear tarjetas
    var txt = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!txt) return;
    var a = document.activeElement;
    var inCell = a && a.classList && a.classList.contains('cell') && wrap.contains(a);
    var grid = tblParseGrid(txt);
    var isGrid = grid.length > 1 || (grid[0] && grid[0].length > 1);
    if (!isGrid && inCell) return;                       // texto simple dentro de una celda: pegado normal
    e.preventDefault();
    tblApplyGrid(wrap._tbl.b, wrap, grid);
  });
  wrap.addEventListener('keydown', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('cell')) return; // lo gestiona tblCellKey
    var st = wrap._tbl, b2 = st.b, k = e.key;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); e.stopPropagation(); tblSelectAll(wrap); return; }
    // Con el rango activo no hay ningún campo editable enfocado y el navegador NO dispara
    // copy/cut/paste: los atendemos a mano. (Dentro de una celda sí llegan los eventos.)
    if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); e.stopPropagation(); tblCopyClipboard(b2, wrap); return; }
    if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); e.stopPropagation(); tblCopyClipboard(b2, wrap); tblClearSel(b2, wrap); return; }
    if (mod && (k === 'v' || k === 'V')) { e.preventDefault(); e.stopPropagation(); tblPasteClipboard(b2, wrap); return; }
    // Ctrl+D no debe duplicar bloques del lienzo; Ctrl+Z sí sigue su camino (deshace la tabla).
    if (mod && (k === 'd' || k === 'D')) { e.stopPropagation(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); tblClearSel(b2, wrap); return; }
    if (k === 'Escape') { e.stopPropagation(); tblSetSel(wrap, null); wrap.blur(); return; }
    if (k === 'Tab' || /^Arrow/.test(k) || k === 'Enter') {
      var s = st.sel;
      if (!s) return;
      e.preventDefault(); e.stopPropagation();
      var dr = k === 'ArrowUp' ? -1 : (k === 'ArrowDown' || k === 'Enter' ? 1 : 0);
      var dc = k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' ? 1 : (k === 'Tab' ? (e.shiftKey ? -1 : 1) : 0));
      if (e.shiftKey && /^Arrow/.test(k)) { tblExtendSel(wrap, Math.max(0, s.r2 + dr), Math.max(0, s.c2 + dc)); return; }
      tblMove(wrap, b2, s.ar + dr, s.ac + dc, k === 'Tab' || k === 'Enter');
      return;
    }
    if (!mod && !e.altKey && k && k.length === 1) {      // escribir con el rango activo edita la celda ancla
      var st2 = wrap._tbl, sa = st2.sel;
      if (!sa) return;
      var td = wrap.querySelector('td[data-vr="' + sa.ar + '"][data-vc="' + sa.ac + '"]');
      var ta = td && td.querySelector('textarea.cell');
      if (!ta) return;
      e.preventDefault(); e.stopPropagation();
      ta.focus(); ta.value = k;
      ta.setSelectionRange(1, 1);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  wrap.addEventListener('mousedown', function (e) {
    if (e.target === wrap || (e.target.classList && e.target.classList.contains('tbl-scroll'))) tblSetSel(wrap, null);
  });
  if (window.ResizeObserver) {
    var lastW = 0;
    var ro = new ResizeObserver(function () {
      if (!wrap.isConnected) return;
      var w = wrap.clientWidth;
      if (w === lastW) return;
      lastW = w;
      tblRelayout(wrap, 60);                             // la tarjeta cambi\u00f3 de ancho: recolocar columnas
    });
    ro.observe(wrap);
  }
}

// ---------- Redimensionar columnas y filas ----------
function tblStartColResize(e, b, wrap, c, td) {
  e.preventDefault(); e.stopPropagation();
  var t = wrap._tbl.t;
  var startW = td.offsetWidth, startX = e.clientX, moved = false;
  function move(ev) {
    var zoom = (typeof getView === 'function' && getView().zoom) || 1;
    t.colW[c] = Math.max(30, Math.round(startW + (ev.clientX - startX) / zoom));
    moved = true;
    tblLayout(wrap);
  }
  function up() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.body.classList.remove('tbl-resizing');
    if (moved) tblSave(b, 'Ancho de columna', t.colW[c] + ' px');
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.body.classList.add('tbl-resizing');
}
function tblStartRowResize(e, b, wrap, r, tr) {
  e.preventDefault(); e.stopPropagation();
  var t = wrap._tbl.t;
  var startH = tr ? tr.offsetHeight : TBL_MINH, startY = e.clientY, moved = false;
  function move(ev) {
    var zoom = (typeof getView === 'function' && getView().zoom) || 1;
    t.rowH[r] = Math.max(TBL_MINH, Math.round(startH + (ev.clientY - startY) / zoom));
    moved = true;
    tblLayout(wrap);
  }
  function up() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.body.classList.remove('tbl-resizing');
    if (moved) tblSave(b, 'Alto de fila', t.rowH[r] + ' px');
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.body.classList.add('tbl-resizing');
}
// Columnas al ancho del texto (sin estirar) y la tarjeta al tama\u00f1o de la tabla.
function tblFit(b, wrap) {
  var st = wrap._tbl, t = st.t;
  t.colW = []; t.rowH = [];
  var widths = tblWidths(t, st.view, 0);
  var total = widths.reduce(function (a, w) { return a + w; }, 0) + TBL_GUT + 4;
  var el = cardEl(b.id);
  if (el) {
    el.style.width = Math.max(200, Math.min(760, total + 20)) + 'px';
    b.width = el.offsetWidth;
  }
  tblLayout(wrap);
  requestAnimationFrame(function () {
    var scroll = wrap.querySelector('.tbl-scroll');
    if (el && scroll) {
      var over = scroll.scrollHeight - scroll.clientHeight;
      if (over > 0) { el.style.height = Math.min(640, el.offsetHeight + over + 2) + 'px'; b.height = el.offsetHeight; }
    }
    tblLayout(wrap);
    tblSave(b, 'Tabla ajustada al contenido');
    if (typeof drawLinks === 'function') drawLinks();
  });
}
function tblResetView(b, wrap) {
  var t = wrap._tbl.t;
  t.sort = null; t.filters = {}; t.hidCols = []; t.hidRows = []; t.collapsed = false;
  tblSave(b, 'Vista de tabla restablecida');
  renderTable(wrap, b);
}

// ---------- Insertar / eliminar / esconder ----------
function tblInsertCol(t, at) {
  t.rows.forEach(function (r) { r.splice(at, 0, ''); });
  t.colW.splice(at, 0, null);
  t.hidCols = t.hidCols.map(function (c) { return c >= at ? c + 1 : c; });
  var nf = {};
  Object.keys(t.filters).forEach(function (k) { var c = +k; nf[c >= at ? c + 1 : c] = t.filters[k]; });
  t.filters = nf;
  if (t.sort && t.sort.col >= at) t.sort.col++;
}
function tblDeleteCol(t, at) {
  if (t.rows[0].length <= 1) return false;
  t.rows.forEach(function (r) { r.splice(at, 1); });
  t.colW.splice(at, 1);
  t.hidCols = t.hidCols.filter(function (c) { return c !== at; }).map(function (c) { return c > at ? c - 1 : c; });
  var nf = {};
  Object.keys(t.filters).forEach(function (k) { var c = +k; if (c === at) return; nf[c > at ? c - 1 : c] = t.filters[k]; });
  t.filters = nf;
  if (t.sort) { if (t.sort.col === at) t.sort = null; else if (t.sort.col > at) t.sort.col--; }
  return true;
}
function tblInsertRow(t, at) {
  if (at < 1) at = 1;
  t.rows.splice(at, 0, newRow(t.rows[0].length));
  t.rowH.splice(at, 0, null);
  t.hidRows = t.hidRows.map(function (r) { return r >= at ? r + 1 : r; });
}
function tblDeleteRow(t, at) {
  if (at < 1 || t.rows.length <= 2) return false;
  t.rows.splice(at, 1);
  t.rowH.splice(at, 1);
  t.hidRows = t.hidRows.filter(function (r) { return r !== at; }).map(function (r) { return r > at ? r - 1 : r; });
  return true;
}
function tblHide(b, wrap, kind, idx) {
  var t = wrap._tbl.t;
  if (kind === 'col') {
    if (t.rows[0].length - t.hidCols.length <= 1) { toast('Debe quedar al menos una columna visible', 'warn'); return; }
    if (t.hidCols.indexOf(idx) < 0) t.hidCols.push(idx);
  } else {
    if (idx < 1) return;
    if (t.hidRows.indexOf(idx) < 0) t.hidRows.push(idx);
  }
  tblSave(b, kind === 'col' ? 'Columna escondida' : 'Fila escondida');
  renderTable(wrap, b);
}
function resizeTable(b, wrap, op) {
  var t = tblState(b), st = wrap._tbl, sel = st && st.sel;
  var nCols = t.rows[0].length;
  if (op === 'addRow') {
    var at = t.rows.length;
    if (sel) { var sr = tblRowAt(st, Math.max(1, sel.r2)); if (sr >= 1) at = sr + 1; }
    tblInsertRow(t, at);
  } else if (op === 'delRow') {
    var dr = sel ? tblRowAt(st, Math.max(1, sel.r1)) : t.rows.length - 1;
    if (dr < 1) dr = t.rows.length - 1;
    if (t.rows.length <= 2) { toast('La tabla necesita al menos una fila de datos', 'warn'); return; }
    pushUndo('Quitar fila');
    tblDeleteRow(t, dr);
  } else if (op === 'addCol') {
    var ac = nCols;
    if (sel) { var sc = tblColAt(st, sel.c2); if (sc != null) ac = sc + 1; }
    tblInsertCol(t, ac);
  } else if (op === 'delCol') {
    var dc = sel ? tblColAt(st, sel.c1) : nCols - 1;
    if (dc == null) dc = nCols - 1;
    if (nCols <= 1) { toast('La tabla necesita al menos una columna', 'warn'); return; }
    pushUndo('Quitar columna');
    tblDeleteCol(t, dc);
  }
  tblSave(b, 'Tabla modificada', t.rows.length + '\u00d7' + t.rows[0].length);
  renderTable(wrap, b);
}

// ---------- Men\u00fa de la cabecera: ordenar y filtrar ----------
function tblSort(b, wrap, c, dir) {
  var t = wrap._tbl.t;
  if (!dir) t.sort = null;
  else t.sort = { col: c, dir: dir };
  tblSave(b, dir ? 'Tabla ordenada' : 'Orden quitado', (t.rows[0][c] || '').trim());
  renderTable(wrap, b);
}
function openTableColMenu(b, wrap, c, anchor) {
  closeTopbarMenu();
  var t = wrap._tbl.t;
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop tbl-filter-pop', onmousedown: function (e) { e.stopPropagation(); } });
  var name = (t.rows[0][c] || '').trim() || ('Columna ' + (c + 1));
  var kind = tblColKind(t, c, tblDataRows(t));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('filter'), name));
  var sorted = t.sort && t.sort.col === c;
  var lblAsc = kind === 'num' ? '1 \u2192 9 (menor a mayor)' : (kind === 'date' ? 'Antiguas \u2192 recientes' : 'A \u2192 Z');
  var lblDesc = kind === 'num' ? '9 \u2192 1 (mayor a menor)' : (kind === 'date' ? 'Recientes \u2192 antiguas' : 'Z \u2192 A');
  pop.appendChild(h('button', { class: 'cm-item' + (sorted && t.sort.dir === 'asc' ? ' active' : ''), onclick: function () { closeTopbarMenu(); tblSort(b, wrap, c, 'asc'); } }, icon('sort'), h('span', {}, lblAsc)));
  pop.appendChild(h('button', { class: 'cm-item' + (sorted && t.sort.dir === 'desc' ? ' active' : ''), onclick: function () { closeTopbarMenu(); tblSort(b, wrap, c, 'desc'); } }, icon('sort'), h('span', {}, lblDesc)));
  if (sorted) pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblSort(b, wrap, c, null); } }, icon('x'), h('span', {}, 'Quitar el orden')));
  pop.appendChild(h('div', { class: 'cm-sep' }));

  var f = t.filters[c] || { q: '', excl: [] };
  var apply = function (rerender) {
    if (!f.q && (!f.excl || !f.excl.length)) delete t.filters[c];
    else t.filters[c] = { q: f.q, excl: (f.excl || []).slice() };
    touchNote(b.noteId); debouncedSave();
    if (rerender !== false) { clearTimeout(pop._t); pop._t = setTimeout(function () { renderTable(wrap, b); }, 120); }
  };
  var q = h('input', { class: 'tbl-fq', placeholder: 'Filtrar por texto\u2026', value: f.q || '' });
  q.addEventListener('input', function () { f.q = q.value; apply(); paintVals(); });
  q.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  pop.appendChild(h('div', { class: 'cm-quick' }, q));

  // Valores disponibles teniendo en cuenta los filtros de las DEM\u00c1S columnas (como en Excel).
  var seen = {}, vals = [];
  tblDataRows(t).forEach(function (r) {
    if (!tblRowPasses(t, r, c)) return;
    var v = t.rows[r][c] || '';
    if (seen[v]) return;
    seen[v] = 1; vals.push(v);
  });
  vals.sort(function (a, b2) { return tblCompare(kind, a, b2); });
  var list = h('div', { class: 'tbl-vals' });
  var rowsEls = [];
  var allBtn = h('button', { class: 'cm-item tbl-val all', onclick: function () {
    var anyOff = vals.some(function (v) { return f.excl.indexOf(v) >= 0; });
    f.excl = anyOff ? [] : vals.slice();
    apply(); paintVals();
  } }, h('span', { class: 'tbl-tick' }), h('span', {}, '(Todos)'));
  list.appendChild(allBtn);
  vals.forEach(function (v) {
    var it = h('button', { class: 'cm-item tbl-val', title: v || '(vac\u00edo)', onclick: function () {
      var i = f.excl.indexOf(v);
      if (i >= 0) f.excl.splice(i, 1); else f.excl.push(v);
      apply(); paintVals();
    } }, h('span', { class: 'tbl-tick' }), h('span', { class: 'tbl-val-txt' }, v || '(vac\u00edas)'));
    rowsEls.push({ v: v, el: it });
    list.appendChild(it);
  });
  function paintVals() {
    f.excl = f.excl || [];
    var qn = tblNorm(f.q || '');
    rowsEls.forEach(function (o) {
      o.el.classList.toggle('on', f.excl.indexOf(o.v) < 0);
      o.el.classList.toggle('dim', !!qn && tblNorm(o.v).indexOf(qn) < 0);
    });
    allBtn.classList.toggle('on', !f.excl.length);
  }
  paintVals();
  pop.appendChild(list);
  if (t.filters[c]) pop.appendChild(h('button', { class: 'cm-item', onclick: function () { delete t.filters[c]; closeTopbarMenu(); tblSave(b, 'Filtro quitado', name); renderTable(wrap, b); } }, icon('x'), h('span', {}, 'Quitar el filtro')));

  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblHide(b, wrap, 'col', c); } }, icon('eyeOff'), h('span', {}, 'Esconder esta columna')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); t.colW[c] = null; tblSave(b, 'Ancho autom\u00e1tico'); tblLayout(wrap); } }, icon('fit'), h('span', {}, 'Ancho autom\u00e1tico (al texto)')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertCol(t, c); tblSave(b, 'Columna insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar columna a la izquierda')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertCol(t, c + 1); tblSave(b, 'Columna insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar columna a la derecha')));
  pop.appendChild(h('button', { class: 'cm-item danger', onclick: function () {
    closeTopbarMenu();
    pushUndo('Eliminar columna');
    if (!tblDeleteCol(t, c)) { toast('La tabla necesita al menos una columna', 'warn'); return; }
    tblSave(b, 'Columna eliminada', name); renderTable(wrap, b);
  } }, icon('trash'), h('span', {}, 'Eliminar esta columna')));
  if (tblActive(t)) pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblResetView(b, wrap); } }, icon('eye'), h('span', {}, 'Restablecer orden, filtros y ocultos')));

  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 248);
  setTimeout(function () { q.focus(); }, 20);
}

// ---------- Men\u00fa contextual de celda (clic derecho) ----------
function openTableCellMenu(b, wrap, x, y) {
  closeTopbarMenu();
  var st = wrap._tbl, t = st.t, s = st.sel;
  if (!s) return;
  var r = tblRowAt(st, s.r1), c = tblColAt(st, s.c1);
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
  var n = (s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1);
  pop.appendChild(h('div', { class: 'cm-label' }, icon('table'), n > 1 ? n + ' celdas' : 'Celda'));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblCopyClipboard(b, wrap); } }, icon('copy'), h('span', {}, 'Copiar')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblPasteClipboard(b, wrap); } }, icon('paste'), h('span', {}, 'Pegar')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblClearSel(b, wrap); } }, icon('eraser'), h('span', {}, 'Vaciar el contenido')));
  pop.appendChild(h('div', { class: 'cm-sep' }));
  if (r >= 1) {
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertRow(t, r); tblSave(b, 'Fila insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar fila encima')));
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertRow(t, r + 1); tblSave(b, 'Fila insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar fila debajo')));
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblHide(b, wrap, 'row', r); } }, icon('eyeOff'), h('span', {}, 'Esconder esta fila')));
    pop.appendChild(h('button', { class: 'cm-item danger', onclick: function () {
      closeTopbarMenu();
      pushUndo('Eliminar fila');
      if (!tblDeleteRow(t, r)) { toast('La tabla necesita al menos una fila de datos', 'warn'); return; }
      tblSave(b, 'Fila eliminada'); renderTable(wrap, b);
    } }, icon('trash'), h('span', {}, 'Eliminar esta fila')));
    pop.appendChild(h('div', { class: 'cm-sep' }));
  }
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertCol(t, c); tblSave(b, 'Columna insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar columna a la izquierda')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblInsertCol(t, c + 1); tblSave(b, 'Columna insertada'); renderTable(wrap, b); } }, icon('plus'), h('span', {}, 'Insertar columna a la derecha')));
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblHide(b, wrap, 'col', c); } }, icon('eyeOff'), h('span', {}, 'Esconder esta columna')));
  if (tblActive(t)) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); tblResetView(b, wrap); } }, icon('eye'), h('span', {}, 'Mostrar todo / quitar filtros')));
  }
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, { getBoundingClientRect: function () { return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 }; } }, 240);
}

// ---------- Lista enumerada → flujograma (formas y conectores nativos) ----------
// Formato: "1." pasos en orden; "3.1."/"3.2." ramas del paso 3 (con "Sí:"/"No:" como
// etiqueta de la flecha); un paso que termina en "?" es rombo de decisión; "Inicio"/"Fin"
// se dibujan como píldoras. Las ramas se reconectan solas con el siguiente paso.
function parseNumberedList(text) {
  var items = [];
  String(text || '').split('\n').forEach(function (line) {
    var m = line.match(/^\s*(\d+(?:\.\d+)*)[.)]\s+(.+)$/);
    if (m) items.push({ depth: m[1].split('.').length, text: m[2].trim() });
  });
  var root = { children: [] };
  items.forEach(function (it) {
    var parent = root;
    for (var d = 1; d < it.depth; d++) {
      var last = parent.children[parent.children.length - 1];
      if (!last) break;                 // lista mal formada: cuelga del nivel disponible
      parent = last;
    }
    parent.children.push({ text: it.text, children: [] });
  });
  return root.children;
}
function flowDecorate(node, isBranch) {
  if (isBranch) {
    var m = node.text.match(/^([^:]{1,18}):\s+(.+)$/);
    if (m) { node.label = m[1].trim(); node.text = m[2].trim(); }
  }
  node.label = node.label || '';
  node.shape = /\?\s*$/.test(node.text) ? 'diamond' : (/^(inicio|fin|start|end)\b/i.test(node.text) ? 'pill' : 'round');
  node.children.forEach(function (c) { flowDecorate(c, true); });
}
// Coloca 'node' centrado en [x0,x1] desde y; devuelve las salidas del subárbol y su fondo.
function layoutFlowNode(node, x0, x1, y, out) {
  var W = 200, H = node.shape === 'diamond' ? 96 : 60, GAPY = 64;
  var cx = (x0 + x1) / 2;
  node._blk = {
    id: uid(), noteId: out.noteId, type: 'shape',
    x: Math.round(cx - W / 2), y: Math.round(y), width: W, height: H,
    content: { text: node.text, shape: node.shape }, createdAt: out.t, updatedAt: out.t,
  };
  out.blocks.push(node._blk);
  if (!node.children.length) return { exits: [node._blk], bottom: y + H };
  var span = (x1 - x0) / node.children.length;
  var exits = [], bottom = y + H;
  node.children.forEach(function (c, i) {
    var r = layoutFlowNode(c, x0 + i * span, x0 + (i + 1) * span, y + H + GAPY, out);
    out.links.push({ id: uid(), noteId: out.noteId, a: node._blk.id, b: c._blk.id, label: c.label, type: 'flow', createdAt: out.t });
    exits = exits.concat(r.exits);
    bottom = Math.max(bottom, r.bottom);
  });
  return { exits: exits, bottom: bottom };
}
function listToFlowchart(b) {
  var tops = parseNumberedList(b.content && b.content.text);
  if (tops.length < 2) { toast('Numera los pasos primero: 1., 2., 3.… (usa 3.1./3.2. para ramas). Mira la plantilla «Lista → Flujograma».', 'warn'); return; }
  tops.forEach(function (n) { flowDecorate(n, false); });
  var breadth = 1;
  (function widest(list) { breadth = Math.max(breadth, list.length ? Math.max.apply(null, list.map(function (n) { return n.children.length || 1; })) : 1); list.forEach(function (n) { widest(n.children); }); })(tops);
  var totalW = Math.max(280, breadth * 250);
  var out = { blocks: [], links: [], noteId: b.noteId, t: now() };
  var ox = b.x + (b.width || 280) + 90, y = b.y, prevExits = null;
  tops.forEach(function (top) {
    var r = layoutFlowNode(top, ox, ox + totalW, y, out);
    if (prevExits) prevExits.forEach(function (p) { out.links.push({ id: uid(), noteId: b.noteId, a: p.id, b: top._blk.id, type: 'flow', createdAt: out.t }); });
    prevExits = r.exits;
    y = r.bottom + 64;
  });
  out.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: out.blocks[0].id, label: 'flujo', createdAt: out.t }); // traza al origen
  Array.prototype.push.apply(data.blocks, out.blocks);
  Array.prototype.push.apply(data.links, out.links);
  touchNote(b.noteId);
  logChange('Lista convertida en flujograma', snippet(b.content.text));
  save();
  renderCanvas();
  out.blocks.forEach(function (nb, i) { cardEnterAnim(cardEl(nb.id), i * 40); });
  focusBlock(out.blocks[0].id);
  toast('Flujograma creado con ' + out.blocks.length + ' pasos junto a la nota.', 'ok');
}
