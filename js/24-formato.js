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

// ---------- Dónde está la selección ----------
// Un contenteditable sí expone la geometría de su selección, así que la barra se ancla al
// rectángulo real de lo que has marcado. (Con el textarea anterior había que medirlo con un
// div espejo que replicaba sus estilos; eso ya no hace falta.)
function selectionAnchor(ed) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var r = sel.getRangeAt(0);
  if (!ed.contains(r.commonAncestorContainer)) return null;
  var rect = r.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) {
    // Cursor sin selección: el rectángulo viene vacío, así que se usa el del nodo que lo contiene.
    var n = r.startContainer;
    var el = n.nodeType === 1 ? n : n.parentNode;
    rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : ed.getBoundingClientRect();
  }
  return { x: rect.left + rect.width / 2, y: rect.top, h: rect.height || 18 };
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
var TEXT_ALIGNS = [['left', 'Izquierda', '⯇', 'Left'], ['center', 'Centrado', '≡', 'Center'], ['right', 'Derecha', '⯈', 'Right'], ['justify', 'Justificado', '☰', 'Full']];
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
// ---------- La barra, justo encima de lo que has seleccionado ----------
// Dos filas: arriba lo que se usa a cada momento (estilo del texto y párrafo), abajo lo que se
// toca de vez en cuando (tipografía, insertar, limpiar). Antes era una sola fila con veinte
// botones y costaba encontrar nada.
var fmtBarEl = null;
var fmtBarState = { ed: null, b: null };
function fmtBtn(label, title, onClick, cls) {
  var btn = h('button', { class: 'fmt-btn' + (cls ? ' ' + cls : ''), title: title, type: 'button' }, label);
  // mousedown preventDefault: pulsar la barra no debe quitar el foco ni deshacer la selección.
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
  btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return btn;
}
function fmtSep() { return h('span', { class: 'fmt-sep' }); }
function withEd(fn) {
  return function (e) {
    if (!fmtBarState.ed || !fmtBarState.b) return;
    fn(fmtBarState.b, fmtBarState.ed, e);
  };
}
// Cada estilo de carácter, con el comando que lo aplica de verdad y cómo saber si ya está puesto.
var FMT_STYLES = [
  { key: 'bold',      cmd: 'bold',          label: 'B',   title: 'Negrita (⌘/Ctrl+B)',   cls: 'fb-bold' },
  { key: 'italic',    cmd: 'italic',        label: 'I',   title: 'Cursiva (⌘/Ctrl+I)',   cls: 'fb-italic' },
  { key: 'underline', cmd: 'underline',     label: 'U',   title: 'Subrayado (⌘/Ctrl+U)', cls: 'fb-under' },
  { key: 'strike',    cmd: 'strikeThrough', label: 'S',   title: 'Tachado',              cls: 'fb-strike' },
  { key: 'mark',      cmd: 'mark',          label: '🖍',  title: 'Resaltar',             cls: 'fb-mark' },
  { key: 'code',      cmd: 'code',          label: '</>', title: 'Código',               cls: 'fb-code' },
];
function ensureFmtBar() {
  if (fmtBarEl) return fmtBarEl;
  var bar = h('div', { class: 'fmt-bar' });
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
  var fila1 = h('div', { class: 'fmt-row' });
  var fila2 = h('div', { class: 'fmt-row fmt-row2' });

  // ---- Fila 1: lo que tocas a cada rato ----
  FMT_STYLES.forEach(function (st) {
    fila1.appendChild(fmtBtn(st.label, st.title, withEd(function (b, ed) { applyStyleCmd(b, ed, st); }), st.cls));
  });
  fila1.appendChild(fmtSep());
  fila1.appendChild(fmtBtn('H▾', 'Título del párrafo', withEd(function (b, ed, e) {
    openFmtMenu(e.currentTarget, 'Párrafo', [
      ['Texto normal', function () { richExec(b, ed, 'formatBlock', 'P'); }],
      ['Título 1', function () { richExec(b, ed, 'formatBlock', 'H1'); }],
      ['Título 2', function () { richExec(b, ed, 'formatBlock', 'H2'); }],
      ['Título 3', function () { richExec(b, ed, 'formatBlock', 'H3'); }],
      ['Cita', function () { richExec(b, ed, 'formatBlock', 'BLOCKQUOTE'); }],
    ]);
  })));
  fila1.appendChild(fmtBtn('1.', 'Lista numerada', withEd(function (b, ed) { richExec(b, ed, 'insertOrderedList'); })));
  fila1.appendChild(fmtBtn('•', 'Lista con viñetas', withEd(function (b, ed) { richExec(b, ed, 'insertUnorderedList'); })));
  fila1.appendChild(fmtBtn('☐', 'Casillas de tarea', withEd(function (b, ed) { richToggleTasks(b, ed); })));
  fila1.appendChild(fmtSep());
  fila1.appendChild(fmtBtn('⇥', 'Aumentar sangría', withEd(function (b, ed) { richExec(b, ed, 'indent'); })));
  fila1.appendChild(fmtBtn('⇤', 'Reducir sangría', withEd(function (b, ed) { richExec(b, ed, 'outdent'); })));

  // ---- Fila 2: lo que se ajusta de vez en cuando ----
  fila2.appendChild(fmtBtn('Aa▾', 'Tipo de letra', withEd(function (b, ed, e) {
    openFmtMenu(e.currentTarget, 'Tipo de letra', TEXT_FONTS.map(function (f) {
      return [f.label, function () { richExec(b, ed, 'fontName', f.css || 'inherit'); }, false, f.css];
    }));
  }), 'fmt-wide'));
  fila2.appendChild(fmtBtn('⇕▾', 'Tamaño de letra', withEd(function (b, ed, e) {
    openFmtMenu(e.currentTarget, 'Tamaño', TEXT_SIZES.map(function (px) {
      return [px + ' px', function () { richFontSize(b, ed, px); }];
    }));
  })));
  fila2.appendChild(fmtBtn('≡▾', 'Alineación', withEd(function (b, ed, e) {
    openFmtMenu(e.currentTarget, 'Alineación', TEXT_ALIGNS.map(function (a) {
      return [a[2] + '  ' + a[1], function () { richExec(b, ed, 'justify' + a[3]); }];
    }));
  })));
  fila2.appendChild(fmtBtn('A', 'Color del texto', withEd(function (b, ed, e) { openFmtColor(e.currentTarget, b, ed, 'foreColor'); }), 'fmt-color'));
  fila2.appendChild(fmtBtn('▉', 'Color de fondo del texto', withEd(function (b, ed, e) { openFmtColor(e.currentTarget, b, ed, 'hiliteColor'); }), 'fmt-bg'));
  fila2.appendChild(fmtSep());
  fila2.appendChild(fmtBtn('🔗', 'Vincular la selección a un bloque, nota, imagen o PDF', withEd(function (b, ed, e) {
    var texto = String(window.getSelection());
    if (!texto.trim()) { toast('Selecciona primero el texto que quieres vincular.', 'warn'); return; }
    openHlinkPicker(b, texto.trim(), e.currentTarget);
  })));
  fila2.appendChild(fmtBtn('⌫', 'Quitar el formato de la selección', withEd(function (b, ed) {
    richExec(b, ed, 'removeFormat');
    richExec(b, ed, 'formatBlock', 'P');
  })));
  fila2.appendChild(fmtBtn('—', 'Línea separadora', withEd(function (b, ed) { richExec(b, ed, 'insertHorizontalRule'); })));

  bar.appendChild(fila1);
  bar.appendChild(fila2);
  document.body.appendChild(bar);
  fmtBarEl = bar;
  return bar;
}
// Negrita, cursiva y compañía se aplican con el comando nativo; resaltar y código necesitan
// envolver en <mark> y <code>, que execCommand no sabe hacer.
function applyStyleCmd(b, ed, st) {
  if (st.key === 'mark') { richToggleMark(b, ed); positionFmtBar(); renderFmtBarState(); return; }
  if (st.key === 'code') { richToggleTag(b, ed, 'CODE'); positionFmtBar(); renderFmtBarState(); return; }
  richExec(b, ed, st.cmd);
  renderFmtBarState();
}
// execCommand('fontSize') solo entiende 1..7; se aplica y luego se traduce a píxeles reales.
function richFontSize(b, ed, px) {
  ed.focus();
  try { document.execCommand('styleWithCSS', false, true); } catch (err) {}
  try { document.execCommand('fontSize', false, '7'); } catch (err) {}
  Array.prototype.forEach.call(ed.querySelectorAll('[style*="xxx-large"], font[size="7"]'), function (n) {
    n.removeAttribute('size');
    n.style.fontSize = px + 'px';
  });
  richCommit(b, ed, 'Texto: tamaño');
  save();
  if (typeof autoGrowRich === 'function') autoGrowRich(ed);
}
// Convierte la lista actual en casillas de tarea (y al revés).
function richToggleTasks(b, ed) {
  ed.focus();
  var sel = window.getSelection();
  var nodo = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  var el = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentNode);
  var li = el && el.closest ? el.closest('li') : null;
  if (!li) { richExec(b, ed, 'insertUnorderedList'); sel = window.getSelection(); nodo = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null; el = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentNode); li = el && el.closest ? el.closest('li') : null; }
  if (!li || !ed.contains(li)) return;
  var lista = li.parentNode;
  var eranTareas = li.getAttribute('data-task') !== null;
  Array.prototype.forEach.call(lista.children, function (x) {
    if (eranTareas) x.removeAttribute('data-task');
    else x.setAttribute('data-task', 'todo');
  });
  lista.classList.toggle('task-list', !eranTareas);
  richCommit(b, ed, 'Texto: casillas');
  save();
}
// Envolver la selección en una etiqueta concreta (código), o quitarla si ya está.
function richToggleTag(b, ed, tag) {
  ed.focus();
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var r = sel.getRangeAt(0);
  var nodo = r.commonAncestorContainer;
  var el = nodo.nodeType === 1 ? nodo : nodo.parentNode;
  var dentro = el && el.closest ? el.closest(tag.toLowerCase()) : null;
  if (dentro && ed.contains(dentro)) {
    while (dentro.firstChild) dentro.parentNode.insertBefore(dentro.firstChild, dentro);
    dentro.remove();
  } else {
    if (r.collapsed) return;
    var nueva = document.createElement(tag);
    try { r.surroundContents(nueva); } catch (err) {
      nueva.appendChild(r.extractContents());
      r.insertNode(nueva);
    }
  }
  richCommit(b, ed, 'Texto: ' + tag.toLowerCase());
  save();
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
var TEXT_COLORS = ['#33302b', '#c14b3f', '#d9a35a', '#6f9257', '#3f6f9a', '#7a5ba6', '#8a7f70', '#ffffff'];
var BG_COLORS = ['#fff3bf', '#ffd8cc', '#d8f0d0', '#d3e6f7', '#e8dcf7', '#eeeae2'];
function openFmtColor(anchor, b, ed, cmd) {
  closeTopbarMenu();
  var esFondo = cmd === 'hiliteColor';
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop fmt-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, esFondo ? 'Color de fondo' : 'Color del texto'));
  var row = h('div', { class: 'fmt-colors' });
  (esFondo ? BG_COLORS : TEXT_COLORS).forEach(function (c) {
    row.appendChild(h('button', {
      class: 'fmt-color-dot', title: c, style: { background: c },
      onclick: function (e) { e.stopPropagation(); closeTopbarMenu(); richExec(b, ed, cmd, c); },
    }));
  });
  row.appendChild(h('button', {
    class: 'fmt-color-dot none', title: 'Quitar el color',
    onclick: function (e) { e.stopPropagation(); closeTopbarMenu(); richExec(b, ed, esFondo ? 'hiliteColor' : 'foreColor', 'inherit'); },
  }));
  pop.appendChild(row);
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 210);
}

// ---------- Colocación y ciclo de vida ----------
// La barra se ancla al texto seleccionado, no al bloque: sigue a la selección línea a línea.
function positionFmtBar() {
  var bar = fmtBarEl, ed = fmtBarState.ed;
  if (!bar || !ed || !ed.isConnected) return;
  var pt = selectionAnchor(ed);
  if (!pt) { bar.classList.add('off'); return; }
  var bw = bar.offsetWidth || 420, bh = bar.offsetHeight || 68;
  var left = Math.min(Math.max(8, pt.x - bw / 2), window.innerWidth - bw - 8);
  var top = pt.y - bh - 10;
  // Si no cabe encima (línea alta o barra superior de la app), se pasa debajo para no taparla.
  var debajo = top < 52;
  bar.classList.toggle('below', debajo);
  if (debajo) top = pt.y + pt.h + 10;
  // Si lo seleccionado se ha ido de la vista del propio editor, la barra sobra.
  var er = ed.getBoundingClientRect();
  bar.classList.toggle('off', !(pt.y + pt.h > er.top - 2 && pt.y < er.bottom + 2));
  bar.style.left = Math.round(left) + 'px';
  bar.style.top = Math.round(top) + 'px';
}
// Enciende los botones cuyo estilo ya tiene lo seleccionado.
function renderFmtBarState() {
  var bar = fmtBarEl, ed = fmtBarState.ed;
  if (!bar || !ed) return;
  FMT_STYLES.forEach(function (st) {
    var btn = bar.querySelector('.' + st.cls);
    if (!btn) return;
    var activo = false;
    if (st.key === 'code') {
      var sel = window.getSelection();
      if (sel && sel.rangeCount) {
        var n = sel.getRangeAt(0).commonAncestorContainer;
        var el = n.nodeType === 1 ? n : n.parentNode;
        activo = !!(el && el.closest && el.closest('code') && ed.contains(el.closest('code')));
      }
    } else {
      activo = richHasStyle(ed, st.cmd === 'mark' ? 'mark' : st.cmd);
    }
    btn.classList.toggle('on', activo);
  });
}
function showFmtBar(ed, b) {
  var bar = ensureFmtBar();
  fmtBarState.ed = ed; fmtBarState.b = b;
  bar.classList.add('show');
  positionFmtBar();
  renderFmtBarState();
  window.addEventListener('resize', positionFmtBar);
  window.addEventListener('scroll', positionFmtBar, true);
}
function hideFmtBar() {
  if (!fmtBarEl) return;
  fmtBarEl.classList.remove('show');
  fmtBarState.ed = null; fmtBarState.b = null;
  window.removeEventListener('resize', positionFmtBar);
  window.removeEventListener('scroll', positionFmtBar, true);
}
// Conecta un editor (nota, idea o texto libre) con la barra.
function attachFmtBar(ed, b) {
  ed.addEventListener('focus', function () { showFmtBar(ed, b); });
  ed.addEventListener('blur', function () {
    setTimeout(function () {
      // Pulsar la barra o uno de sus menús no cuenta como salir del texto.
      var a = document.activeElement;
      if (a && a.closest && (a.closest('.fmt-bar') || a.closest('.card-menu-pop'))) return;
      if (document.getElementById('topbarMenuBackdrop')) return;
      if (fmtBarState.ed === ed && document.activeElement !== ed) hideFmtBar();
    }, 140);
  });
  ['keyup', 'mouseup', 'input', 'click', 'scroll'].forEach(function (ev) {
    ed.addEventListener(ev, function () {
      if (fmtBarState.ed !== ed) return;
      positionFmtBar();
      renderFmtBarState();
    });
  });
  document.addEventListener('selectionchange', function () {
    if (fmtBarState.ed !== ed) return;
    positionFmtBar();
    renderFmtBarState();
  });
  ed.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideFmtBar(); ed.blur(); return; }
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    var k = e.key.toLowerCase();
    if (e.shiftKey && k === 'h') { e.preventDefault(); richToggleMark(b, ed); renderFmtBarState(); return; }
    if (e.shiftKey && k === 'x') { e.preventDefault(); richExec(b, ed, 'strikeThrough'); renderFmtBarState(); return; }
    // El navegador ya trae B/I/U en un contenteditable; solo hay que guardar lo que hizo.
    if (!e.shiftKey && (k === 'b' || k === 'i' || k === 'u')) {
      setTimeout(function () { richCommit(b, ed, 'Texto: formato'); save(); renderFmtBarState(); }, 0);
    }
  });
}
// El lienzo esconde la barra al repintar (js/05-topbar-canvas.js).
function hideSelFmtBar() { hideFmtBar(); }
