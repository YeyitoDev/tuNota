/* tuNota — Herramientas de texto sobre la selección: la barra que aparece justo encima del
   texto que marcas, con negrita, subrayado, resaltado, tipo de letra, listas y demás.

   Cómo funciona, y por qué así: los bloques de nota son un <textarea> y su contenido vive en
   b.content.text como texto PLANO (lo leen la IA, el buscador, las tareas, el móvil…). Un
   textarea no sabe pintar formato mezclado, así que:
     · el estilo de CARÁCTER (negrita, resaltado…) se guarda con marcadores markdown, y el
       botón «Vista» enseña el resultado ya compuesto;
     · el estilo de BLOQUE (tipo de letra, tamaño, color, alineación, interlineado) se aplica
       de verdad al textarea, así que se ve mientras escribes.
   Cargado en orden desde index.html. */
'use strict';

// ---------- Dónde está la selección dentro del textarea ----------
// Un textarea no expone la geometría de su cursor, así que se mide con un div espejo que copia
// sus estilos y su ancho: el texto se parte igual, y la posición del span marcador es la buena.
var TA_MIRROR_PROPS = ['boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing',
  'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'textAlign', 'whiteSpace', 'wordWrap'];
var taMirrorEl = null;
function taCaretPoint(ta, pos) {
  if (!taMirrorEl) {
    taMirrorEl = h('div', { class: 'ta-mirror' });
    document.body.appendChild(taMirrorEl);
  }
  var m = taMirrorEl, cs = getComputedStyle(ta);
  TA_MIRROR_PROPS.forEach(function (p) { m.style[p] = cs[p]; });
  m.style.width = cs.width;
  m.style.whiteSpace = 'pre-wrap';
  m.style.wordWrap = 'break-word';
  m.textContent = ta.value.slice(0, pos);
  var mark = h('span', {}, ta.value.slice(pos) || '.');
  m.appendChild(mark);
  var r = ta.getBoundingClientRect();
  var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 18;
  var pt = { x: r.left + mark.offsetLeft - ta.scrollLeft, y: r.top + mark.offsetTop - ta.scrollTop, h: lh };
  m.textContent = '';
  return pt;
}
// Punto de anclaje de la barra: el borde superior de la selección. Si empieza y acaba en la
// misma línea se centra sobre ella; si abarca varias, se ancla al principio.
function taSelectionAnchor(ta) {
  var a = taCaretPoint(ta, ta.selectionStart);
  if (ta.selectionEnd === ta.selectionStart) return a;
  var b = taCaretPoint(ta, ta.selectionEnd);
  if (Math.abs(b.y - a.y) < a.h / 2) return { x: (a.x + b.x) / 2, y: a.y, h: a.h };
  return { x: a.x, y: Math.min(a.y, b.y), h: a.h };
}

// ---------- Estilo de carácter con marcadores ----------
// Cada marca es simétrica: si la selección ya la lleva, el mismo botón la quita.
var FMT_MARKS = {
  bold:      { open: '**', close: '**', label: 'B',  title: 'Negrita',   cls: 'fb-bold' },
  italic:    { open: '_',  close: '_',  label: 'I',  title: 'Cursiva',   cls: 'fb-italic' },
  underline: { open: '++', close: '++', label: 'U',  title: 'Subrayado', cls: 'fb-under' },
  strike:    { open: '~~', close: '~~', label: 'S',  title: 'Tachado',   cls: 'fb-strike' },
  highlight: { open: '==', close: '==', label: '🖍', title: 'Resaltar',  cls: 'fb-mark' },
  code:      { open: '`',  close: '`',  label: '</>', title: 'Código',   cls: 'fb-code' },
};
// Sin selección, actúa sobre la palabra que tienes debajo del cursor: es lo que espera
// cualquiera que venga de un procesador de textos.
function taWordRange(v, s, e) {
  if (s !== e) return [s, e];
  var ws = s, we = e;
  while (ws > 0 && /\S/.test(v.charAt(ws - 1))) ws--;
  while (we < v.length && /\S/.test(v.charAt(we))) we++;
  return we > ws ? [ws, we] : [s, e];
}
function applyCharMark(b, ta, key) {
  var mk = FMT_MARKS[key];
  if (!mk || !ta) return;
  var v = ta.value;
  var r = taWordRange(v, ta.selectionStart, ta.selectionEnd);
  var s = r[0], e = r[1];
  // Recorta espacios y saltos de los extremos. En markdown "** texto **" NO compone negrita:
  // el marcador tiene que quedar pegado al texto, así que lo sobrante se deja fuera.
  while (s < e && /\s/.test(v.charAt(s))) s++;
  while (e > s && /\s/.test(v.charAt(e - 1))) e--;
  if (s === e) return;                        // la selección era solo espacio: nada que marcar
  var sel = v.slice(s, e);
  var before = v.slice(0, s), after = v.slice(e);
  var out, ns, ne;
  if (sel.length >= mk.open.length + mk.close.length &&
      sel.slice(0, mk.open.length) === mk.open && sel.slice(-mk.close.length) === mk.close) {
    out = sel.slice(mk.open.length, sel.length - mk.close.length);   // los marcadores estaban dentro
    ns = s; ne = s + out.length;
  } else if (before.slice(-mk.open.length) === mk.open && after.slice(0, mk.close.length) === mk.close) {
    before = before.slice(0, before.length - mk.open.length);        // estaban justo fuera
    after = after.slice(mk.close.length);
    out = sel; ns = before.length; ne = ns + out.length;
  } else {
    out = mk.open + sel + mk.close;
    ns = s + mk.open.length; ne = ns + sel.length;
  }
  pushUndo('Formato: ' + mk.title);
  ta.value = before + out + after;
  try { ta.selectionStart = ns; ta.selectionEnd = ne; } catch (err) {}
  commitTaValue(b, ta, mk.title);
}
// Guardar lo que hay en el textarea en el bloque. Los bloques de nota parten su texto en
// segmentos por las imágenes inline, así que hay que escribir en el segmento correcto.
function commitTaValue(b, ta, label) {
  b.content = b.content || {};
  if (typeof ta._segCommit === 'function') ta._segCommit();
  else b.content.text = ta.value;
  touchNote(b.noteId);
  logChange('Texto: ' + label, snippet(ta.value));
  save();
  if (typeof autoGrowNote === 'function') autoGrowNote(ta);
  if (ta.isConnected) ta.focus();
  positionFmtBar();
}

// ---------- Estilo del bloque: esto SÍ se ve mientras escribes ----------
var TEXT_FONTS = [
  { key: '', label: 'Predeterminada', css: '' },
  { key: 'serif', label: 'Serif', css: '"Fraunces", Georgia, "Times New Roman", serif' },
  { key: 'sans', label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { key: 'mono', label: 'Monoespaciada', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { key: 'hand', label: 'Manuscrita', css: '"Bradley Hand", "Segoe Script", "Comic Sans MS", cursive' },
];
var TEXT_SIZES = [12, 13.5, 16, 18, 22, 28];
var TEXT_ALIGNS = [['left', 'Izquierda', '⯇'], ['center', 'Centrado', '≡'], ['right', 'Derecha', '⯈'], ['justify', 'Justificado', '☰']];
var TEXT_LHS = [['1.2', 'Compacto'], ['1.5', 'Normal'], ['1.9', 'Aireado']];
function textFontCss(key) {
  for (var i = 0; i < TEXT_FONTS.length; i++) { if (TEXT_FONTS[i].key === key) return TEXT_FONTS[i].css; }
  return '';
}
// Se llama al crear el textarea y cada vez que cambia un ajuste.
function applyNoteTextStyle(ta, b) {
  if (!ta || !b) return;
  var c = b.content || {};
  ta.style.fontFamily = textFontCss(c.font) || '';
  ta.style.fontSize = c.size ? c.size + 'px' : '';
  ta.style.textAlign = c.align || '';
  ta.style.lineHeight = c.lh || '';
  ta.style.color = c.color || '';
}
function setNoteTextStyle(b, key, value, label) {
  b.content = b.content || {};
  if (value === '' || value === null || value === undefined) delete b.content[key];
  else b.content[key] = value;
  touchNote(b.noteId);
  logChange('Texto: ' + label, snippet(b.content.text || ''));
  save();
  var el = cardEl(b.id);
  var ta = el && el.querySelector('.card-ta');
  if (ta) { applyNoteTextStyle(ta, b); if (typeof autoGrowNote === 'function') autoGrowNote(ta); }
  if (fmtBarState.ta) { positionFmtBar(); renderFmtBarState(); }
}

// ---------- Transformaciones de línea (títulos, cita, sangría) ----------
function lineTransform(b, ta, fn, label) {
  if (typeof applyLineTransform === 'function') applyLineTransform(b, ta, fn, label);
  positionFmtBar();
}
function headingFn(level) {
  var hash = level ? new Array(level + 1).join('#') + ' ' : '';
  return function (t) {
    return String(t || '').split('\n').map(function (l) {
      if (!l.trim()) return l;
      var m = l.match(/^(\s*)#{1,6}\s+(.*)$/);
      var indent = m ? m[1] : (l.match(/^(\s*)/) || ['', ''])[1];
      var body = m ? m[2] : l.slice(indent.length);
      return indent + hash + body;
    }).join('\n');
  };
}
function quoteFn(t) {
  var lines = String(t || '').split('\n');
  var todasCitadas = lines.filter(function (l) { return l.trim(); }).every(function (l) { return /^\s*>\s?/.test(l); });
  return lines.map(function (l) {
    if (!l.trim()) return l;
    return todasCitadas ? l.replace(/^(\s*)>\s?/, '$1') : l.replace(/^(\s*)/, '$1> ');
  }).join('\n');
}
// Al convertir en ítem de lista, la línea deja de ser título o cita: markdown no compone
// "1. # Texto", y dejarlo produciría un ítem con una almohadilla suelta dentro.
function listSource(t) {
  return String(t || '').split('\n').map(function (l) {
    return l.replace(/^(\s*)#{1,6}\s+/, '$1').replace(/^(\s*)>\s?/, '$1');
  }).join('\n');
}
function indentFn(dir) {
  return function (t) {
    return String(t || '').split('\n').map(function (l) {
      if (!l.trim()) return l;
      return dir > 0 ? '  ' + l : l.replace(/^ {1,2}/, '');
    }).join('\n');
  };
}

// ---------- La barra, justo encima de lo que has seleccionado ----------
var fmtBarEl = null;
var fmtBarState = { ta: null, b: null };
function fmtBtn(label, title, onClick, cls) {
  var btn = h('button', { class: 'fmt-btn' + (cls ? ' ' + cls : ''), title: title, type: 'button' }, label);
  // mousedown preventDefault: pulsar la barra no debe quitar el foco ni deshacer la selección.
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
  btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return btn;
}
function fmtSep() { return h('span', { class: 'fmt-sep' }); }
function withTa(fn) {
  return function (e) {
    if (!fmtBarState.ta || !fmtBarState.b) return;
    fn(fmtBarState.b, fmtBarState.ta, e);
  };
}
function ensureFmtBar() {
  if (fmtBarEl) return fmtBarEl;
  var bar = h('div', { class: 'fmt-bar' });
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });

  // Estilo de carácter
  ['bold', 'italic', 'underline', 'strike', 'highlight', 'code'].forEach(function (k) {
    var mk = FMT_MARKS[k];
    bar.appendChild(fmtBtn(mk.label, mk.title, withTa(function (b, ta) { applyCharMark(b, ta, k); }), mk.cls));
  });
  bar.appendChild(fmtSep());

  // Párrafo: títulos y cita
  bar.appendChild(fmtBtn('H▾', 'Título del párrafo', withTa(function (b, ta, e) {
    openFmtMenu(e.currentTarget, 'Título', [
      ['Texto normal', function () { lineTransform(b, ta, headingFn(0), 'Texto normal'); }],
      ['Título 1', function () { lineTransform(b, ta, headingFn(1), 'Título 1'); }],
      ['Título 2', function () { lineTransform(b, ta, headingFn(2), 'Título 2'); }],
      ['Título 3', function () { lineTransform(b, ta, headingFn(3), 'Título 3'); }],
      ['Cita', function () { lineTransform(b, ta, quoteFn, 'Cita'); }],
    ]);
  })));
  // Listas: reutiliza las transformaciones que ya existían en js/08-text-exec.js
  bar.appendChild(fmtBtn('1.', 'Lista numerada', withTa(function (b, ta) {
    lineTransform(b, ta, function (t) { return transformLines(listSource(t), function (s, n) { return numMarker(n) + s; }); }, 'Enumerar');
  })));
  bar.appendChild(fmtBtn('•', 'Lista con viñetas', withTa(function (b, ta) {
    lineTransform(b, ta, function (t) { return transformLines(listSource(t), function (s) { return bulletMarker() + s; }); }, 'Viñetas');
  })));
  bar.appendChild(fmtBtn('☐', 'Casillas de tarea', withTa(function (b, ta) {
    lineTransform(b, ta, function (t) { return transformLines(listSource(t), function (s) { return '- [ ] ' + s; }); }, 'Casillas');
  })));
  bar.appendChild(fmtBtn('⇥', 'Aumentar sangría', withTa(function (b, ta) { lineTransform(b, ta, indentFn(1), 'Sangría'); })));
  bar.appendChild(fmtBtn('⇤', 'Reducir sangría', withTa(function (b, ta) { lineTransform(b, ta, indentFn(-1), 'Sangría'); })));
  bar.appendChild(fmtSep());

  // Tipografía del bloque
  bar.appendChild(fmtBtn('Aa▾', 'Tipo de letra', withTa(function (b, ta, e) {
    openFmtMenu(e.currentTarget, 'Tipo de letra', TEXT_FONTS.map(function (f) {
      return [f.label, function () { setNoteTextStyle(b, 'font', f.key, 'tipo de letra'); }, (b.content.font || '') === f.key, f.css];
    }));
  }), 'fmt-wide'));
  bar.appendChild(fmtBtn('⇕▾', 'Tamaño de letra', withTa(function (b, ta, e) {
    openFmtMenu(e.currentTarget, 'Tamaño', TEXT_SIZES.map(function (s) {
      return [s + ' px', function () { setNoteTextStyle(b, 'size', s, 'tamaño'); }, (b.content.size || 13.5) === s];
    }).concat([['Restablecer', function () { setNoteTextStyle(b, 'size', '', 'tamaño'); }, !b.content.size]]));
  })));
  bar.appendChild(fmtBtn('≡▾', 'Alineación e interlineado', withTa(function (b, ta, e) {
    var items = TEXT_ALIGNS.map(function (a) {
      return [a[2] + '  ' + a[1], function () { setNoteTextStyle(b, 'align', a[0], 'alineación'); }, (b.content.align || 'left') === a[0]];
    });
    items.push(['—', null]);
    TEXT_LHS.forEach(function (l) {
      items.push(['Interlineado ' + l[1], function () { setNoteTextStyle(b, 'lh', l[0], 'interlineado'); }, (b.content.lh || '1.5') === l[0]]);
    });
    openFmtMenu(e.currentTarget, 'Párrafo', items);
  })));
  bar.appendChild(fmtBtn('A', 'Color del texto', withTa(function (b, ta, e) { openFmtColor(e.currentTarget, b); }), 'fmt-color'));
  bar.appendChild(fmtSep());

  // Insertar y limpiar
  bar.appendChild(fmtBtn('🔗', 'Vincular la selección a un bloque, nota, imagen o PDF', withTa(function (b, ta, e) {
    var text = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    if (!text) { toast('Selecciona primero el texto que quieres vincular.', 'warn'); return; }
    openHlinkPicker(b, text, e.currentTarget);
  })));
  bar.appendChild(fmtBtn('⌫', 'Quitar el formato de la selección', withTa(function (b, ta) { clearFormatting(b, ta); })));
  bar.appendChild(fmtBtn('✨', 'Auto-formato: ordena espacios, listas y numeración', withTa(function (b, ta) {
    lineTransform(b, ta, function (t) { return formatTextContent(t); }, 'Auto-formato');
  })));
  bar.appendChild(fmtSep());
  bar.appendChild(fmtBtn('👁', 'Ver el texto con el formato ya aplicado', withTa(function (b) { toggleTextPreview(b); }), 'fmt-eye'));

  document.body.appendChild(bar);
  fmtBarEl = bar;
  return bar;
}

// Menú de opciones de la barra. `items`: [etiqueta, fn, activa?, cssTipografia?]; fn null = separador.
function openFmtMenu(anchor, titulo, items) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop fmt-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, titulo));
  items.forEach(function (it) {
    if (!it[1]) { pop.appendChild(h('div', { class: 'cm-sep' })); return; }
    var btn = h('button', { class: 'cm-item' + (it[2] ? ' active' : ''), onclick: function (e) {
      e.stopPropagation(); closeTopbarMenu(); it[1]();
    } }, h('span', {}, it[0]), it[2] ? h('span', { class: 'value-check' }, '✓') : null);
    if (it[3]) btn.style.fontFamily = it[3];
    pop.appendChild(btn);
  });
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 210);
}
var TEXT_COLORS = ['', '#c14b3f', '#d9a35a', '#6f9257', '#3f6f9a', '#7a5ba6', '#8a7f70', '#33302b'];
function openFmtColor(anchor, b) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop fmt-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, 'Color del texto'));
  var row = h('div', { class: 'fmt-colors' });
  TEXT_COLORS.forEach(function (c) {
    row.appendChild(h('button', {
      class: 'fmt-color-dot' + (c ? '' : ' none') + ((b.content.color || '') === c ? ' on' : ''),
      title: c || 'Color por defecto',
      style: c ? { background: c } : null,
      onclick: function (e) { e.stopPropagation(); closeTopbarMenu(); setNoteTextStyle(b, 'color', c, 'color'); },
    }));
  });
  pop.appendChild(row);
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 200);
}

// Quitar marcadores de estilo de la selección (el «pincel» de limpiar formato).
function clearFormatting(b, ta) {
  var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if (s === e) { s = 0; e = v.length; }
  var seg = v.slice(s, e);
  var limpio = seg
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/~~([\s\S]*?)~~/g, '$1')
    .replace(/==([\s\S]*?)==/g, '$1')
    .replace(/\+\+([\s\S]*?)\+\+/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^\w_])_([^_\n]+)_/g, '$1$2')
    .split('\n').map(function (l) { return l.replace(/^(\s*)#{1,6}\s+/, '$1').replace(/^(\s*)>\s?/, '$1'); })
    .join('\n');
  if (limpio === seg) return;
  pushUndo('Formato: quitar');
  ta.value = v.slice(0, s) + limpio + v.slice(e);
  try { ta.selectionStart = s; ta.selectionEnd = s + limpio.length; } catch (err) {}
  commitTaValue(b, ta, 'quitar formato');
}

// Vista con el formato ya compuesto. Reutiliza renderMarkdown() (js/06-markdown-mermaid.js),
// que es el mismo motor que pinta los bloques Markdown.
function toggleTextPreview(b) {
  var el = cardEl(b.id);
  if (!el) return;
  var prev = el.querySelector('.text-preview');
  if (prev) { prev.remove(); el.classList.remove('previewing'); return; }
  var host = h('div', { class: 'text-preview', html: renderMarkdown(b.content.text || '') });
  var c = b.content || {};
  host.style.fontFamily = textFontCss(c.font) || '';
  if (c.size) host.style.fontSize = c.size + 'px';
  if (c.align) host.style.textAlign = c.align;
  if (c.lh) host.style.lineHeight = c.lh;
  if (c.color) host.style.color = c.color;
  host.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  host.addEventListener('dblclick', function (e) { e.stopPropagation(); toggleTextPreview(b); });
  host.title = 'Doble clic para volver a editar';
  host.appendChild(h('span', { class: 'text-preview-tag' }, 'Vista · doble clic para editar'));
  el.appendChild(host);
  el.classList.add('previewing');
  // Se coloca justo encima del textarea real: la cabecera de la tarjeta cambia de alto según
  // el título y los botones, así que un margen fijo se desalinearía.
  var ta = el.querySelector('.card-ta');
  if (ta) {
    host.style.top = ta.offsetTop + 'px';
    host.style.left = ta.offsetLeft + 'px';
    host.style.width = ta.offsetWidth + 'px';
    host.style.height = ta.offsetHeight + 'px';
  }
}

// ---------- Colocación y ciclo de vida ----------
// La barra se ancla al texto seleccionado, no al bloque: sigue a la selección línea a línea.
function positionFmtBar() {
  var bar = fmtBarEl, ta = fmtBarState.ta;
  if (!bar || !ta || !ta.isConnected) return;
  var pt = taSelectionAnchor(ta);
  var bw = bar.offsetWidth || 420, bh = bar.offsetHeight || 34;
  var left = Math.min(Math.max(8, pt.x - bw / 2), window.innerWidth - bw - 8);
  var top = pt.y - bh - 8;
  // Si no cabe encima (línea alta o topbar), se pasa debajo de la línea para no taparla.
  bar.classList.toggle('below', top < 52);
  if (top < 52) top = pt.y + pt.h + 8;
  // Fuera de la vista del propio textarea: no tiene sentido enseñarla
  var tr = ta.getBoundingClientRect();
  var visible = pt.y + pt.h > tr.top - 2 && pt.y < tr.bottom + 2;
  bar.classList.toggle('off', !visible);
  bar.style.left = Math.round(left) + 'px';
  bar.style.top = Math.round(top) + 'px';
}
// Marca en la barra el estilo que ya tiene el bloque o la selección.
function renderFmtBarState() {
  var bar = fmtBarEl, st = fmtBarState;
  if (!bar || !st.ta || !st.b) return;
  var v = st.ta.value;
  var r = taWordRange(v, st.ta.selectionStart, st.ta.selectionEnd);
  var sel = v.slice(r[0], r[1]);
  var fuera = { before: v.slice(0, r[0]), after: v.slice(r[1]) };
  Object.keys(FMT_MARKS).forEach(function (k) {
    var mk = FMT_MARKS[k];
    var dentro = sel.length >= mk.open.length + mk.close.length &&
      sel.slice(0, mk.open.length) === mk.open && sel.slice(-mk.close.length) === mk.close;
    var alrededor = fuera.before.slice(-mk.open.length) === mk.open && fuera.after.slice(0, mk.close.length) === mk.close;
    var btn = bar.querySelector('.' + mk.cls);
    if (btn) btn.classList.toggle('on', !!(sel && (dentro || alrededor)));
  });
}
function showFmtBar(ta, b) {
  var bar = ensureFmtBar();
  fmtBarState.ta = ta; fmtBarState.b = b;
  bar.classList.add('show');
  positionFmtBar();
  renderFmtBarState();
  window.addEventListener('resize', positionFmtBar);
  window.addEventListener('scroll', positionFmtBar, true);
}
function hideFmtBar() {
  if (!fmtBarEl) return;
  fmtBarEl.classList.remove('show');
  fmtBarState.ta = null; fmtBarState.b = null;
  window.removeEventListener('resize', positionFmtBar);
  window.removeEventListener('scroll', positionFmtBar, true);
}
// Conecta un textarea de nota/idea con la barra. `segCommit` guarda el segmento correcto
// cuando la nota tiene imágenes intercaladas.
function attachFmtBar(ta, b, segCommit) {
  if (segCommit) ta._segCommit = segCommit;
  applyNoteTextStyle(ta, b);
  ta.addEventListener('focus', function () { showFmtBar(ta, b); });
  ta.addEventListener('blur', function () {
    setTimeout(function () {
      // Un clic en la barra o en uno de sus menús no cuenta como salir del texto.
      var a = document.activeElement;
      if (a && a.closest && (a.closest('.fmt-bar') || a.closest('.card-menu-pop'))) return;
      if (document.getElementById('topbarMenuBackdrop')) return;
      if (fmtBarState.ta === ta && document.activeElement !== ta) hideFmtBar();
    }, 140);
  });
  ['select', 'keyup', 'mouseup', 'input', 'click', 'scroll'].forEach(function (ev) {
    ta.addEventListener(ev, function () {
      if (fmtBarState.ta !== ta) return;
      positionFmtBar();
      renderFmtBarState();
    });
  });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideFmtBar(); ta.blur(); return; }
    // Atajos de toda la vida: los dedos ya se los saben.
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    var k = e.key.toLowerCase();
    var mapa = { b: 'bold', i: 'italic', u: 'underline' };
    if (e.shiftKey && k === 'h') { e.preventDefault(); applyCharMark(b, ta, 'highlight'); return; }
    if (e.shiftKey && k === 'x') { e.preventDefault(); applyCharMark(b, ta, 'strike'); return; }
    if (!e.shiftKey && mapa[k]) { e.preventDefault(); applyCharMark(b, ta, mapa[k]); }
  });
}
// La barra anterior se llamaba así; el lienzo la esconde al repintar (js/05-topbar-canvas.js).
function hideSelFmtBar() { hideFmtBar(); }
function attachSelFmtBar(ta, b) { attachFmtBar(ta, b); }
