/* tuNota — Búsqueda global (Ctrl+K) y panel de atajos de teclado.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Búsqueda global ----------
function blockSearchText(b) {
  var c = b.content || {};
  var parts = [];
  if (c.text) parts.push(c.text);
  if (c.table && c.table.rows) parts.push(c.table.rows.map(function (r) { return r.join(' '); }).join(' '));
  if (c.name) parts.push(c.name); // PDF
  return parts.join(' ');
}
function notePath(note) {
  var sec = note && getSection(note.sectionId);
  var nb = sec && getNotebook(sec.notebookId);
  return (nb ? nb.name + ' › ' : '') + (sec ? sec.name + ' › ' : '') + (note ? note.title : '');
}
function searchMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  var out = [];
  function hit(text) { return text && text.toLowerCase().indexOf(q) >= 0; }
  function ctx(text) {
    var i = text.toLowerCase().indexOf(q);
    var from = Math.max(0, i - 34);
    var s = (from > 0 ? '…' : '') + text.slice(from, i + q.length + 46).replace(/\s+/g, ' ');
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  }
  (data.notes || []).forEach(function (n) {
    if (hit(n.title)) out.push({ kind: 'note', icon: 'file', title: n.title, path: notePath(n), noteId: n.id });
  });
  (data.blocks || []).forEach(function (b) {
    var t = blockSearchText(b);
    if (hit(t)) {
      var n = getNote(b.noteId);
      if (!n) return;
      out.push({ kind: 'block', icon: typeMeta(b.type).icon, title: ctx(t), path: notePath(n), noteId: b.noteId, blockId: b.id });
    }
  });
  (data.notebooks || []).forEach(function (nb) {
    if (hit(nb.name)) out.push({ kind: 'book', icon: 'book', title: nb.name, path: 'Libro', notebookId: nb.id });
  });
  (data.sections || []).forEach(function (s) {
    if (hit(s.name)) {
      var nb = getNotebook(s.notebookId);
      out.push({ kind: 'section', icon: 'panel', title: s.name, path: (nb ? nb.name : '') + ' › Sección', sectionId: s.id });
    }
  });
  return out.slice(0, 40);
}
function gotoSearchResult(r) {
  closeSearch();
  if (r.noteId) {
    ui.currentNoteId = r.noteId;
  } else if (r.sectionId) {
    var n = (data.notes || []).find(function (x) { return x.sectionId === r.sectionId; });
    if (n) ui.currentNoteId = n.id;
    ui.expS[r.sectionId] = true;
  } else if (r.notebookId) {
    ui.expN[r.notebookId] = true;
    var sec = (data.sections || []).find(function (s) { return s.notebookId === r.notebookId; });
    var n2 = sec && (data.notes || []).find(function (x) { return x.sectionId === sec.id; });
    if (n2) ui.currentNoteId = n2.id;
  }
  save();
  renderAll();
  if (r.blockId) focusBlock(r.blockId);
}
// Centra la vista en un bloque y lo resalta un instante.
function focusBlock(blockId) {
  var b = data.blocks.find(function (x) { return x.id === blockId; });
  var wrap = document.getElementById('canvas');
  if (!b || !wrap) return;
  var r = wrap.getBoundingClientRect();
  var v = getView();
  v.x = r.width / 2 - (b.x + (b.width || 0) / 2) * v.zoom;
  v.y = r.height / 2 - (b.y + (b.height || 0) / 2) * v.zoom;
  applyView();
  saveViewDebounced();
  var el = cardEl(blockId);
  if (el) {
    el.classList.add('search-hit');
    setTimeout(function () { el.classList.remove('search-hit'); }, 1600);
  }
}
var searchSel = 0;
function openSearch() {
  closeSearch();
  var overlay = h('div', { class: 'overlay search-overlay', id: 'searchOverlay', onclick: function (e) { if (e.target === overlay) closeSearch(); } });
  var panel = h('div', { class: 'search-panel' });
  var input = h('input', { class: 'search-input', placeholder: 'Buscar en notas, bloques, libros… (Esc cierra)' });
  var list = h('div', { class: 'search-results' });
  var results = [];
  function paint() {
    list.innerHTML = '';
    if (!input.value.trim()) {
      list.appendChild(h('div', { class: 'search-empty' }, 'Escribe para buscar en todo tuNota.'));
      return;
    }
    if (!results.length) {
      list.appendChild(h('div', { class: 'search-empty' }, 'Sin resultados para “' + input.value.trim() + '”.'));
      return;
    }
    results.forEach(function (r, i) {
      var row = h('button', { class: 'search-row' + (i === searchSel ? ' sel' : ''), onclick: function () { gotoSearchResult(r); } },
        h('span', { class: 'search-row-icon' }, icon(r.icon)),
        h('span', { class: 'search-row-main' },
          h('span', { class: 'search-row-title' }, r.title),
          h('span', { class: 'search-row-path' }, r.path)
        )
      );
      row.addEventListener('mousemove', function () { if (searchSel !== i) { searchSel = i; paint(); } });
      list.appendChild(row);
    });
    var sel = list.children[searchSel];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }
  input.addEventListener('input', function () {
    results = searchMatches(input.value);
    searchSel = 0;
    paint();
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (searchSel < results.length - 1) { searchSel++; paint(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (searchSel > 0) { searchSel--; paint(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[searchSel]) gotoSearchResult(results[searchSel]); }
  });
  panel.appendChild(h('div', { class: 'search-bar' }, icon('search'), input));
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseSearch);
  paint();
  setTimeout(function () { input.focus(); }, 20);
}
function escCloseSearch(e) { if (e.key === 'Escape') closeSearch(); }
function closeSearch() {
  var o = document.getElementById('searchOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseSearch);
}

// ---------- Panel de atajos ----------
var SHORTCUTS = [
  ['Navegación y paneles', [
    [MOD + ' + K', 'Búsqueda global'],
    [MOD + ' + 0', 'Centrar la vista · ' + MOD + ' + 1 ajustar todo'],
    ['?', 'Este panel de atajos'],
    ['Esc', 'Cerrar paneles / deseleccionar'],
    ['F2', 'Renombrar la nota actual'],
  ]],
  ['Lienzo', [
    ['Doble clic', 'Crear nota de texto'],
    [ALTKEY + ' (mantener)', 'Menú radial para insertar bloques'],
    ['Shift (mantener)', 'Modo conexión: arrastra entre bloques'],
    ['Arrastrar en vacío', 'Selección múltiple (marquee)'],
    [(IS_MAC ? '⌘' : 'Ctrl') + ' + rueda', 'Zoom del lienzo'],
    [IS_MAC ? 'Supr / ⌫' : 'Supr', 'Eliminar bloques seleccionados'],
    [MOD + ' + D', 'Duplicar bloque(s) seleccionado(s)'],
    [MOD + ' + Z', 'Deshacer'],
    [MOD + ' + V', 'Pegar imagen como tarjeta'],
  ]],
  ['Crear bloques (tecla rápida, con el cursor sobre el lienzo)', [
    ['T', 'Texto'], ['F', 'Texto libre'], ['I', 'Idea'], ['B', 'Tabla'],
    ['C', 'Código'], ['J', 'JSON'], ['U', 'cURL'], ['P', 'Python'],
    ['M', 'Markdown'], ['D', 'Diagrama Mermaid'], ['X', 'Imagen'], ['K', 'Dibujo'],
  ]],
  ['Dentro de bloques', [
    [MOD + ' + Enter', 'Ejecutar Python / cURL'],
    ['Enter', 'Enviar mensaje en el chat de IA'],
  ]],
];
function openShortcuts() {
  closeShortcuts();
  var overlay = h('div', { class: 'overlay', id: 'shortcutOverlay', onclick: function (e) { if (e.target === overlay) closeShortcuts(); } });
  var panel = h('div', { class: 'log-panel shortcut-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('key'), 'Atajos de teclado'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeShortcuts }, icon('x'))
  );
  var body = h('div', { class: 'log-body' });
  SHORTCUTS.forEach(function (group) {
    body.appendChild(h('div', { class: 'log-date' }, group[0]));
    var wrap = h('div', { class: 'shortcut-list' });
    group[1].forEach(function (row) {
      wrap.appendChild(h('div', { class: 'shortcut-row' },
        h('kbd', { class: 'shortcut-key' }, row[0]),
        h('span', { class: 'shortcut-desc' }, row[1])
      ));
    });
    body.appendChild(wrap);
  });
  panel.appendChild(head);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseShortcuts);
}
function escCloseShortcuts(e) { if (e.key === 'Escape') closeShortcuts(); }
function closeShortcuts() {
  var o = document.getElementById('shortcutOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseShortcuts);
}
