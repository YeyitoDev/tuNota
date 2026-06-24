/* tuNota - app vanilla, sin dependencias ni build. Persistencia en localStorage. */
(function () {
  'use strict';

  var LS_DATA = 'tunota.data.v1';
  var LS_UI = 'tunota.ui.v1';
  var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('tunota') : null;

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function now() {
    return Date.now();
  }
  function loadJSON(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (e) {
      return null;
    }
  }

  // ---------- Estado ----------
  var data = loadJSON(LS_DATA);
  var ui = loadJSON(LS_UI);
  if (!data) {
    data = seed();
    var first = data.notes[0];
    ui = {
      currentNoteId: first.id,
      expN: pair(data.notebooks[0].id),
      expS: pair(data.sections[0].id),
    };
    save();
  }
  if (!ui) ui = { currentNoteId: null, expN: {}, expS: {} };
  if (!ui.expN) ui.expN = {};
  if (!ui.expS) ui.expS = {};
  if (!ui.views) ui.views = {};
  if (!data.log) data.log = [];
  if (!Array.isArray(data.links)) data.links = [];
  if (typeof ui.kanbanBook !== 'string') ui.kanbanBook = '';

  function pair(id) {
    var o = {};
    o[id] = true;
    return o;
  }
  function save() {
    data.savedAt = now();
    localStorage.setItem(LS_DATA, JSON.stringify(data));
    localStorage.setItem(LS_UI, JSON.stringify(ui));
    if (bc) bc.postMessage({ app: 'tunota' });
    serverSave();
  }
  var saveT;
  function debouncedSave() {
    clearTimeout(saveT);
    saveT = setTimeout(save, 300);
  }
  function logChange(action, detail) {
    if (!data.log) data.log = [];
    data.log.unshift({ id: uid(), ts: now(), action: action, detail: detail || '' });
    if (data.log.length > 500) data.log.length = 500;
  }
  function snippet(t) {
    t = (t || '').replace(/\s+/g, ' ').trim();
    return t.length > 48 ? t.slice(0, 48) + '\u2026' : t;
  }

  // ---------- Deshacer (Ctrl+Z) ----------
  var undoStack = [];
  function pushUndo(label) {
    undoStack.push({ blocks: JSON.parse(JSON.stringify(data.blocks)), links: JSON.parse(JSON.stringify(data.links || [])), noteId: ui.currentNoteId, label: label || '' });
    if (undoStack.length > 40) undoStack.shift();
  }
  function undo() {
    if (!undoStack.length) return;
    var snap = undoStack.pop();
    data.blocks = snap.blocks;
    data.links = snap.links || [];
    if (snap.noteId && getNote(snap.noteId)) ui.currentNoteId = snap.noteId;
    logChange('Deshacer', snap.label || '');
    save();
    renderCanvas();
  }

  // ---------- Selectores ----------
  var byOrder = function (a, b) {
    return (a.order || 0) - (b.order || 0);
  };
  function notebooksAll() {
    return data.notebooks.slice().sort(byOrder);
  }
  function sectionsOf(id) {
    return data.sections.filter(function (s) { return s.notebookId === id; }).sort(byOrder);
  }
  function notesOf(id) {
    return data.notes
      .filter(function (n) { return n.sectionId === id; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }
  function blocksOf(id) {
    return data.blocks.filter(function (b) { return b.noteId === id; });
  }
  function getNote(id) { return data.notes.find(function (n) { return n.id === id; }); }
  function getSection(id) { return data.sections.find(function (s) { return s.id === id; }); }
  function getNotebook(id) { return data.notebooks.find(function (n) { return n.id === id; }); }
  function notebookIdOfBlock(b) {
    var n = b && getNote(b.noteId); if (!n) return null;
    var s = getSection(n.sectionId); return s ? s.notebookId : null;
  }
  function linksOf(noteId) {
    return (data.links || []).filter(function (l) { return l.noteId === noteId && getBlockById(l.a) && getBlockById(l.b); });
  }
  function linkExists(aId, bId) {
    return (data.links || []).some(function (l) { return (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId); });
  }
  function dropLinksFor(ids) {
    var set = {}; (Array.isArray(ids) ? ids : [ids]).forEach(function (i) { set[i] = 1; });
    data.links = (data.links || []).filter(function (l) { return !set[l.a] && !set[l.b]; });
  }

  // ---------- Mutaciones ----------
  function addNotebook() {
    var nb = { id: uid(), name: 'Nuevo libro', emoji: '\uD83D\uDCD3', order: data.notebooks.length, createdAt: now() };
    data.notebooks.push(nb);
    ui.expN[nb.id] = true;
    logChange('Libro creado', nb.name);
    save();
    renderSidebar();
  }
  function addSection(nbId) {
    var s = { id: uid(), notebookId: nbId, name: 'Nueva secci\u00f3n', order: sectionsOf(nbId).length };
    data.sections.push(s);
    ui.expN[nbId] = true;
    ui.expS[s.id] = true;
    logChange('Secci\u00f3n creada', s.name);
    save();
    renderSidebar();
  }
  function addNote(secId) {
    var t = now();
    var n = { id: uid(), sectionId: secId, title: 'Nota sin t\u00edtulo', createdAt: t, updatedAt: t };
    data.notes.push(n);
    ui.expS[secId] = true;
    logChange('Nota creada', n.title);
    selectNote(n.id);
  }
  function rename(kind, id, val) {
    var o = kind === 'nb' ? getNotebook(id) : kind === 'sec' ? getSection(id) : getNote(id);
    if (!o) return;
    if (kind === 'note') {
      o.title = val;
      o.updatedAt = now();
    } else {
      o.name = val;
    }
    logChange('Renombrado', '\u2192 "' + val + '"');
    save();
    renderSidebar();
    if (kind === 'note') renderTopbar();
  }

  function removeNoteData(id) {
    data.blocks = data.blocks.filter(function (b) { return b.noteId !== id; });
    data.notes = data.notes.filter(function (n) { return n.id !== id; });
    if (ui.currentNoteId === id) ui.currentNoteId = null;
  }
  function removeSectionData(id) {
    notesOf(id).forEach(function (n) { removeNoteData(n.id); });
    data.sections = data.sections.filter(function (s) { return s.id !== id; });
  }
  function removeNotebookData(id) {
    sectionsOf(id).forEach(function (s) { removeSectionData(s.id); });
    data.notebooks = data.notebooks.filter(function (n) { return n.id !== id; });
  }
  function deleteNotebook(id) {
    var nb = getNotebook(id);
    if (!window.confirm('\u00bfEliminar "' + nb.name + '" y todo su contenido?')) return;
    removeNotebookData(id);
    logChange('Libro eliminado', nb.name);
    save();
    renderAll();
  }
  function deleteSection(id) {
    var s = getSection(id);
    if (!window.confirm('\u00bfEliminar la secci\u00f3n "' + s.name + '"?')) return;
    removeSectionData(id);
    logChange('Secci\u00f3n eliminada', s.name);
    save();
    renderAll();
  }
  function deleteNote(id) {
    var n = getNote(id);
    if (!window.confirm('\u00bfEliminar la nota "' + n.title + '"?')) return;
    removeNoteData(id);
    logChange('Nota eliminada', n.title);
    save();
    renderAll();
  }
  function selectNote(id) {
    var n = getNote(id);
    if (n) {
      ui.currentNoteId = id;
      var s = getSection(n.sectionId);
      if (s) {
        ui.expS[s.id] = true;
        ui.expN[s.notebookId] = true;
      }
    }
    save();
    renderAll();
  }

  function touchNote(id) {
    var n = getNote(id);
    if (n) n.updatedAt = now();
  }
  var BLOCK_SIZES = {
    idea: { w: 240, h: 132 },
    text: { w: 256, h: 140 },
    code: { w: 340, h: 190 },
    json: { w: 340, h: 210 },
    curl: { w: 360, h: 150 },
    table: { w: 340, h: 170 },
  };
  function defaultContent(type) {
    if (type === 'table') return { table: { rows: [['', ''], ['', '']] } };
    if (type === 'code' || type === 'json' || type === 'curl') return { text: '' };
    return { text: '', images: [] };
  }
  function addBlock(noteId, type, x, y) {
    var t = now();
    var sz = BLOCK_SIZES[type] || BLOCK_SIZES.text;
    var b = {
      id: uid(),
      noteId: noteId,
      type: type,
      x: Math.round(x),
      y: Math.round(y),
      width: sz.w,
      height: sz.h,
      content: defaultContent(type),
      createdAt: t,
      updatedAt: t,
    };
    data.blocks.push(b);
    touchNote(noteId);
    logChange(typeMeta(type).label + ' a\u00f1adida', '');
    save();
    return b;
  }
  function deleteBlock(id) {
    pushUndo('Eliminar bloque');
    var blk = data.blocks.find(function (x) { return x.id === id; });
    data.blocks = data.blocks.filter(function (x) { return x.id !== id; });
    dropLinksFor(id);
    logChange('Bloque eliminado', blk ? snippet(blk.content && blk.content.text) : '');
    save();
  }

  function mergeBlocks(targetId, sourceId) {
    if (targetId === sourceId) return;
    var t = data.blocks.find(function (x) { return x.id === targetId; });
    var s = data.blocks.find(function (x) { return x.id === sourceId; });
    if (!t || !s) return;
    pushUndo('Combinar contenedores');
    var srcText = (s.content.text || '').trim();
    if (srcText) {
      var base = (t.content.text || '').replace(/\s+$/, '');
      t.content.text = base ? base + '\n\n' + srcText : srcText;
    }
    t.updatedAt = now();
    data.blocks = data.blocks.filter(function (x) { return x.id !== sourceId; });
    dropLinksFor(sourceId);
    touchNote(t.noteId);
    logChange('Notas combinadas', 'El texto se agreg\u00f3 abajo');
    save();
    renderCanvas();
  }

  // ---------- Helper DOM ----------
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else e.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) appendChild(e, arguments[i]);
    return e;
  }
  function appendChild(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) {
      c.forEach(function (x) { appendChild(e, x); });
      return;
    }
    e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }

  // ---------- Iconos ----------
  var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var I = {
    chevron: S + '<polyline points="9 18 15 12 9 6"/></svg>',
    chevronDown: S + '<polyline points="6 9 12 15 18 9"/></svg>',
    plus: S + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: S + '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    folderPlus: S + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    file: S + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    bulb: S + '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
    spark: S + '<path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2z"/></svg>',
    cursor: S + '<path d="M5 3l6 16 2-7 7-2z"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 4C9.5 4 4 9.3 4 16.6c0 .9.1 1.8.4 2.6.6-3.6 2.6-7 7.2-9.7-3.7 3.3-5.5 6.8-6.1 10.7C13 21.2 20 16.4 20 8c0-1.5-.3-3-.9-4z"/></svg>',
    clock: S + '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    bell: S + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    bellRing: S + '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M2.5 7a5 5 0 0 1 1.7-3.2"/><path d="M21.5 7a5 5 0 0 0-1.7-3.2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
    star: S + '<polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.3 21 12 17.6 5.7 21 7 14.1 2 9.3 8.9 8.6 12 2"/></svg>',
    board: S + '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="5" height="7" rx="1"/></svg>',
    link: S + '<path d="M9 12a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M15 12a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    book: S + '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    fit: S + '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    chevronL: S + '<polyline points="15 18 9 12 15 6"/></svg>',
    x: S + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    image: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>',
    popout: S + '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
    code: S + '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    braces: S + '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>',
    terminal: S + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    table: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
  };
  function icon(name, cls) {
    return h('span', { class: 'icon' + (cls ? ' ' + cls : ''), html: I[name] || '' });
  }
  var TYPE_META = {
    text: { label: 'Nota', icon: 'grip', cls: '' },
    idea: { label: 'Idea', icon: 'bulb', cls: 'idea' },
    code: { label: 'C\u00f3digo', icon: 'code', cls: 'code' },
    json: { label: 'JSON', icon: 'braces', cls: 'code' },
    curl: { label: 'cURL', icon: 'terminal', cls: 'code' },
    table: { label: 'Tabla', icon: 'table', cls: 'table' },
  };
  function typeMeta(t) { return TYPE_META[t] || TYPE_META.text; }

  // ---------- Edici\u00f3n en l\u00ednea ----------
  function editable(node, value, onCommit) {
    node.title = 'Doble click para renombrar';
    node.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      var input = h('input', { class: 'inline-edit', value: value });
      node.replaceWith(input);
      input.focus();
      input.select();
      var done = false;
      var commit = function () {
        if (done) return;
        done = true;
        var v = input.value.trim();
        if (input.isConnected) input.replaceWith(node);
        if (v && v !== value) onCommit(v);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('click', function (ev) { ev.stopPropagation(); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commit();
        } else if (ev.key === 'Escape') {
          done = true;
          if (input.isConnected) input.replaceWith(node);
        }
      });
    });
    return node;
  }

  // ---------- Render: Sidebar ----------
  function renderSidebar() {
    var aside = document.getElementById('sidebar');
    aside.innerHTML = '';
    var brand = h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-ico' }, icon('leaf')),
      h('div', {}, h('div', { class: 'brand-name' }, 'tuNota'), h('div', { class: 'brand-sub' }, 'ideas que respiran'))
    );
    var tree = h('div', { class: 'tree' });
    var nbs = notebooksAll();
    nbs.forEach(function (nb) { tree.appendChild(notebookNode(nb)); });
    if (nbs.length === 0) tree.appendChild(h('p', { class: 'tree-empty' }, 'Crea tu primer libro.'));
    var addBtn = h('button', { class: 'add-nb', onclick: addNotebook }, icon('plus'), 'Nuevo libro');
    aside.appendChild(brand);
    aside.appendChild(tree);
    aside.appendChild(addBtn);
  }

  function notebookNode(nb) {
    var open = !!ui.expN[nb.id];
    var name = editable(h('span', { class: 'item-name' }, nb.name), nb.name, function (v) { rename('nb', nb.id, v); });
    var row = h(
      'div',
      { class: 'row nb-row' },
      h('button', { class: 'chev', onclick: function () { ui.expN[nb.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
      h('span', { class: 'emoji' }, nb.emoji || '\uD83D\uDCD3'),
      name,
      h('button', { class: 'act', title: 'A\u00f1adir secci\u00f3n', onclick: function (e) { e.stopPropagation(); addSection(nb.id); } }, icon('folderPlus')),
      h('button', { class: 'act danger', title: 'Eliminar libro', onclick: function (e) { e.stopPropagation(); deleteNotebook(nb.id); } }, icon('trash'))
    );
    var wrap = h('div', {}, row);
    if (open) {
      var kids = h('div', { class: 'children' });
      var secs = sectionsOf(nb.id);
      secs.forEach(function (s) { kids.appendChild(sectionNode(s)); });
      if (secs.length === 0) kids.appendChild(h('p', { class: 'tree-empty' }, 'Sin secciones a\u00fan'));
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function sectionNode(s) {
    var open = !!ui.expS[s.id];
    var name = editable(h('span', { class: 'item-name' }, s.name), s.name, function (v) { rename('sec', s.id, v); });
    var row = h(
      'div',
      { class: 'row sec-row' },
      h('button', { class: 'chev', onclick: function () { ui.expS[s.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
      name,
      h('button', { class: 'act', title: 'Nueva nota', onclick: function (e) { e.stopPropagation(); addNote(s.id); } }, icon('plus')),
      h('button', { class: 'act danger', title: 'Eliminar secci\u00f3n', onclick: function (e) { e.stopPropagation(); deleteSection(s.id); } }, icon('trash'))
    );
    var wrap = h('div', {}, row);
    if (open) {
      var kids = h('div', { class: 'children' });
      var ns = notesOf(s.id);
      ns.forEach(function (n) { kids.appendChild(noteRow(n)); });
      if (ns.length === 0) kids.appendChild(h('p', { class: 'tree-empty' }, 'Sin notas a\u00fan'));
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function noteRow(n) {
    var active = ui.currentNoteId === n.id;
    var name = editable(h('span', { class: 'item-name' }, n.title), n.title, function (v) { rename('note', n.id, v); });
    return h(
      'div',
      { class: 'row note-row' + (active ? ' active' : ''), onclick: function () { selectNote(n.id); } },
      icon('file'),
      name,
      h('button', { class: 'act danger', title: 'Eliminar nota', onclick: function (e) { e.stopPropagation(); deleteNote(n.id); } }, icon('trash'))
    );
  }

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

    var left = h('div', { class: 'tb-left' }, crumb, title);
    var hint = h('div', { class: 'hint' }, icon('cursor'), 'Doble clic: nota \u00b7 Alt: men\u00fa \u00b7 Rueda: mover \u00b7 Ctrl+rueda: zoom \u00b7 Espacio: arrastrar');
    var kanBtn = h('button', { class: 'icon-btn', title: 'Kanban de ideas', onclick: openKanban }, icon('board'));
    var histBtn = h('button', { class: 'icon-btn', title: 'Historial de cambios', onclick: openLog }, icon('clock'));
    var ai = h('button', { class: 'ai-btn', disabled: '', title: 'Pr\u00f3ximamente' }, icon('spark'), 'IA (pronto)');
    bar.appendChild(left);
    bar.appendChild(hint);
    bar.appendChild(kanBtn);
    bar.appendChild(histBtn);
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

  function createAt(clientX, clientY, type) {
    if (!ui.currentNoteId || !canvasContentEl) return null;
    var p = toContent(clientX, clientY);
    var x = Math.max(0, p.x - 8);
    var y = Math.max(0, p.y - 8);
    var b = addBlock(ui.currentNoteId, type || 'text', x, y);
    var el = card(b);
    canvasContentEl.appendChild(el);
    var ta = el.querySelector('textarea');
    if (ta) ta.focus();
    return b;
  }

  function card(b) {
    var meta = typeMeta(b.type);
    var isText = b.type === 'text' || b.type === 'idea';
    var el = h('div', {
      class: 'card' + (meta.cls ? ' ' + meta.cls : '') + (selectedIds[b.id] ? ' selected' : '') + (b.reminder && !b.reminder.done ? ' reminder-on' : '') + (b.important ? ' important' : ''),
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
    if (isText) {
      head.appendChild(h('span', { class: 'card-imgs' }));
      head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    head.appendChild(menuBtn);
    head.appendChild(del);

    el.appendChild(head);
    if (b.type === 'table') appendChild(el, tableBody(b));
    else if (b.type === 'code' || b.type === 'json' || b.type === 'curl') appendChild(el, monoBody(b));
    else appendChild(el, textBody(b));

    attachDragHandler(head, el, b);
    var anchor = h('button', { class: 'card-link-anchor', title: 'Arrastra hasta otro bloque para conectarlos' });
    anchor.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); startLinkDrag(b, e); });
    anchor.addEventListener('click', function (e) { e.stopPropagation(); });
    el.appendChild(anchor);
    if (isText) {
      head.addEventListener('dblclick', function (e) {
        if (e.target.closest('.card-del') || e.target.closest('.card-pop') || e.target.closest('.card-menu')) return;
        popOut(b.id);
      });
      updateCardMedia(el, b);
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
    return [ta, h('div', { class: 'card-thumbs' })];
  }
  function insertAtCursor(ta, text) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
  }
  function monoBody(b) {
    b.content = b.content || {};
    var ph = b.type === 'curl' ? 'curl -X GET https://api.ejemplo.com' : (b.type === 'json' ? '{\n  "clave": "valor"\n}' : '// tu c\u00f3digo aqu\u00ed');
    var ta = h('textarea', { class: 'card-ta mono', spellcheck: 'false', placeholder: ph });
    ta.value = b.content.text || '';
    ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
    ta.addEventListener('change', function () { logChange(typeMeta(b.type).label + ' editado', snippet(ta.value)); save(); });
    ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '  '); b.content.text = ta.value; debouncedSave(); }
    });
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
  function saveView() { try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (e) {} }
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
      { type: 'table', label: 'Tabla', icon: 'table' },
      { type: 'code', label: 'C\u00f3digo', icon: 'code' },
      { type: 'json', label: 'JSON', icon: 'braces' },
      { type: 'curl', label: 'cURL', icon: 'terminal' },
      { type: 'text', label: 'Nota', icon: 'grip' },
      { type: 'idea', label: 'Idea', icon: 'bulb' },
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

  // ---------- Backend JSON (opcional) ----------
  var SERVER = false, srvT = null;
  function normalizeData() {
    data.notebooks = data.notebooks || [];
    data.sections = data.sections || [];
    data.notes = data.notes || [];
    data.blocks = data.blocks || [];
    data.log = data.log || [];
  }
  function serverSave() {
    if (!SERVER || !window.fetch) return;
    clearTimeout(srvT);
    srvT = setTimeout(serverSaveNow, 500);
  }
  function serverSaveNow() {
    if (!SERVER || !window.fetch) return;
    fetch('api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(function () {});
  }
  function serverLoad(done) {
    if (!window.fetch) { done(); return; }
    var local = data;
    fetch('api/data', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (srv) {
        SERVER = true;
        if (srv && srv.notebooks && srv.notebooks.length) {
          var srvAt = srv.savedAt || 0, locAt = (local && local.savedAt) || 0;
          if (srvAt >= locAt) {
            data = srv; normalizeData();
            localStorage.setItem(LS_DATA, JSON.stringify(data));
            if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { var n0 = data.notes[0]; if (n0) ui.currentNoteId = n0.id; }
          } else { serverSaveNow(); }
        } else { serverSaveNow(); }
        done();
      })
      .catch(function () { SERVER = false; done(); });
  }

  // ---------- Ventana emergente / Sincronización ----------
  var openWins = {};
  var poppedIds = {};
  var winWatch = null;
  function getBlockById(id) { return data.blocks.find(function (x) { return x.id === id; }); }
  function cardEl(id) { return canvasContentEl ? canvasContentEl.querySelector('.card[data-id="' + id + '"]') : null; }

  function popOut(id) {
    var ex = openWins[id];
    if (ex && !ex.closed) { try { ex.focus(); } catch (e) {} return; }
    var w = window.open('note.html?id=' + encodeURIComponent(id), 'tunota_' + id, 'width=600,height=680');
    if (!w) {
      window.alert('El navegador bloque\u00f3 la ventana emergente.\n\nPermite las ventanas emergentes (pop-ups) para este sitio y vuelve a intentarlo.');
      return;
    }
    openWins[id] = w;
    poppedIds[id] = true;
    var el = cardEl(id);
    if (el) updateCardPoppedState(el, getBlockById(id));
    startWinWatch();
    try { w.focus(); } catch (e) {}
  }
  function startWinWatch() {
    if (winWatch) return;
    winWatch = setInterval(function () {
      var any = false;
      Object.keys(openWins).forEach(function (id) {
        var w = openWins[id];
        if (!w || w.closed) {
          delete openWins[id];
          delete poppedIds[id];
          var el = cardEl(id);
          var blk = getBlockById(id);
          if (el && blk) updateCardPoppedState(el, blk);
          scheduleSync();
        } else {
          any = true;
        }
      });
      if (!any) { clearInterval(winWatch); winWatch = null; }
    }, 800);
  }

  function updateCardMedia(el, b) {
    var imgs = (b.content && b.content.images) || [];
    var chip = el.querySelector('.card-imgs');
    if (chip) {
      chip.innerHTML = '';
      if (imgs.length) { chip.style.display = ''; chip.appendChild(icon('image')); chip.appendChild(document.createTextNode(' ' + imgs.length)); }
      else { chip.style.display = 'none'; }
    }
    var thumbs = el.querySelector('.card-thumbs');
    if (thumbs) {
      thumbs.innerHTML = '';
      if (imgs.length) {
        thumbs.style.display = '';
        imgs.slice(0, 4).forEach(function (src) { thumbs.appendChild(h('img', { src: src, alt: '' })); });
        if (imgs.length > 4) thumbs.appendChild(h('span', { class: 'more' }, '+' + (imgs.length - 4)));
      } else { thumbs.style.display = 'none'; }
    }
  }
  function updateCardPoppedState(el, b) {
    var popped = !!poppedIds[b.id];
    el.classList.toggle('is-popped', popped);
    var ta = el.querySelector('.card-ta');
    if (ta) ta.readOnly = popped;
  }

  var syncT;
  function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(syncAfterExternal, 80); }
  function activeCardId() {
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains('card-ta')) { var c = a.closest('.card'); return c ? c.getAttribute('data-id') : null; }
    return null;
  }
  function syncAfterExternal() {
    var fresh = loadJSON(LS_DATA);
    if (!fresh) return;
    mergeFromStorage(fresh);
    refreshAfterMerge();
    serverSave();
  }
  function mergeFromStorage(fresh) {
    var activeId = activeCardId();
    var have = {};
    data.blocks.forEach(function (b) { have[b.id] = b; });
    var freshIds = {};
    (fresh.blocks || []).forEach(function (fb) {
      freshIds[fb.id] = 1;
      var ex = have[fb.id];
      if (ex) {
        ex.reminder = fb.reminder;
        ex.important = fb.important;
        ex.kanban = fb.kanban; ex.kanbanOrder = fb.kanbanOrder; ex.kanbanAt = fb.kanbanAt;
        if (fb.id !== activeId) {
          ex.content = fb.content;
          ex.x = fb.x; ex.y = fb.y; ex.width = fb.width; ex.height = fb.height; ex.updatedAt = fb.updatedAt;
        }
      } else {
        data.blocks.push(fb);
      }
    });
    data.blocks = data.blocks.filter(function (b) { return freshIds[b.id]; });
    data.notes = fresh.notes || [];
    data.sections = fresh.sections || [];
    data.notebooks = fresh.notebooks || [];
    data.links = fresh.links || [];
    data.log = fresh.log || [];
  }
  var lastSig = '';
  function sidebarSig() {
    return (
      data.notebooks.map(function (n) { return n.id + n.name + (n.emoji || ''); }).join('|') + '#' +
      data.sections.map(function (s) { return s.id + s.name; }).join('|') + '#' +
      data.notes.map(function (n) { return n.id + n.title + n.sectionId; }).join('|')
    );
  }
  function refreshAfterMerge() {
    var a = document.activeElement;
    var editingInline = a && a.classList && a.classList.contains('inline-edit');
    syncCanvasCards();
    if (!editingInline) {
      var sig = sidebarSig();
      if (sig !== lastSig) { renderSidebar(); lastSig = sig; }
      renderTopbar();
    }
  }
  function syncCanvasCards() {
    if (!canvasContentEl) return;
    var current = ui.currentNoteId;
    var present = {};
    Array.prototype.forEach.call(canvasContentEl.querySelectorAll('.card'), function (el) {
      var id = el.getAttribute('data-id');
      var blk = getBlockById(id);
      if (!blk || blk.noteId !== current) { el.remove(); return; }
      present[id] = 1;
      var ta = el.querySelector('.card-ta');
      if (ta && document.activeElement !== ta) {
        var txt = (blk.content && blk.content.text) || '';
        if (ta.value !== txt) ta.value = txt;
      }
      el.style.left = blk.x + 'px';
      el.style.top = blk.y + 'px';
      updateCardMedia(el, blk);
      updateCardPoppedState(el, blk);
    });
    if (current) {
      blocksOf(current).forEach(function (blk) {
        if (!present[blk.id]) canvasContentEl.appendChild(card(blk));
      });
    }
    drawLinks();
  }

  // ---------- Historial de cambios ----------
  function openLog() {
    closeLog();
    var overlay = h('div', { class: 'overlay', id: 'logOverlay', onclick: function (e) { if (e.target === overlay) closeLog(); } });
    var panel = h('div', { class: 'log-panel' });
    var head = h(
      'div',
      { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('clock'), 'Historial de cambios'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeLog }, icon('x'))
    );
    var body = h('div', { class: 'log-body' });
    var entries = data.log || [];
    if (entries.length === 0) {
      body.appendChild(h('p', { class: 'tree-empty' }, 'A\u00fan no hay cambios registrados.'));
    } else {
      groupByDate(entries).forEach(function (g) {
        body.appendChild(h('div', { class: 'log-date' }, g.label));
        g.items.forEach(function (it) {
          body.appendChild(
            h(
              'div',
              { class: 'log-item' },
              h('span', { class: 'log-time' }, fmtTime(it.ts)),
              h(
                'div',
                { class: 'log-text' },
                h('div', { class: 'log-action' }, it.action),
                it.detail ? h('div', { class: 'log-detail' }, it.detail) : null
              )
            )
          );
        });
      });
    }
    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeLog(); }
  function closeLog() {
    var o = document.getElementById('logOverlay');
    if (o) o.remove();
    document.removeEventListener('keydown', escClose);
  }
  function groupByDate(entries) {
    var map = {}, order = [];
    entries.forEach(function (e) {
      var k = fmtDate(e.ts);
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(e);
    });
    return order.map(function (k) { return { label: k, items: map[k] }; });
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function fmtDate(ts) {
    var d = new Date(ts), today = new Date(), y = new Date();
    y.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return 'Hoy';
    if (sameDay(d, y)) return 'Ayer';
    try { return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch (e) { return d.toLocaleDateString(); }
  }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ts).toLocaleTimeString(); }
  }

  // ---------- Render all ----------
  function renderAll() {
    renderSidebar();
    renderTopbar();
    renderCanvas();
  }

  // ---------- Seed ----------
  function seed() {
    var t = now();
    var nb = { id: uid(), name: 'Mi primer libro', emoji: '\uD83C\uDF3F', order: 0, createdAt: t };
    var sec = { id: uid(), notebookId: nb.id, name: 'Ideas r\u00e1pidas', order: 0 };
    var note = { id: uid(), sectionId: sec.id, title: 'Bienvenida a tuNota', createdAt: t, updatedAt: t };
    var b1 = {
      id: uid(), noteId: note.id, type: 'text', x: 80, y: 80, width: 280, height: 150,
      content: { text: 'Doble clic en el lienzo = nota.\nCtrl+clic o mant\u00e9n Alt = men\u00fa para insertar idea, tabla, c\u00f3digo, JSON o cURL.\nArrastra para seleccionar varias; arr\u00e1strala sobre otra para combinarlas.', images: [] },
      createdAt: t, updatedAt: t,
    };
    var b2 = {
      id: uid(), noteId: note.id, type: 'idea', x: 392, y: 130, width: 244, height: 132,
      content: { text: 'Las "ideas" usan un color c\u00e1lido. \u00c1brelas con el men\u00fa (Ctrl+clic o Alt).' },
      createdAt: t, updatedAt: t,
    };
    return {
      notebooks: [nb], sections: [sec], notes: [note], blocks: [b1, b2],
      log: [{ id: uid(), ts: t, action: 'Proyecto creado', detail: 'Bienvenida a tuNota' }],
      savedAt: t,
    };
  }

  // ---------- Recordatorios / alarmas ----------
  var reminderTimer = null, audioCtx = null;
  function startReminderLoop() {
    checkReminders();
    clearInterval(reminderTimer);
    reminderTimer = setInterval(checkReminders, 20000);
  }
  function reminderText(b) {
    var t = (b.content && b.content.text) ? snippet(b.content.text) : '';
    return t || typeMeta(b.type).label;
  }
  function fmtWhen(ts) { return fmtDate(ts) + ' \u00b7 ' + fmtTime(ts); }
  function fmtShort(ts) {
    var d = new Date(ts);
    if (sameDay(d, new Date())) return fmtTime(ts);
    try { return d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) + ' ' + fmtTime(ts); }
    catch (e) { return d.toLocaleDateString() + ' ' + fmtTime(ts); }
  }
  function toLocalInput(ts) {
    var d = new Date(ts), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function nextOccurrence(at, repeat) {
    var d = new Date(at), t = now();
    var step = function () {
      if (repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (repeat === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
      else d.setFullYear(d.getFullYear() + 50);
    };
    do { step(); } while (d.getTime() <= t);
    return d.getTime();
  }
  function ensureNotifyPermission() {
    try { if (('Notification' in window) && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }
  function notify(title, body) {
    try { if (('Notification' in window) && Notification.permission === 'granted') new Notification(title, { body: body, icon: 'public/leaf.svg' }); } catch (e) {}
  }
  function playBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      [880, 1175, 1568].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + i * 0.18;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(at); o.stop(at + 0.18);
      });
    } catch (e) {}
  }
  function checkReminders() {
    var t = now();
    var due = (data.blocks || []).filter(function (b) {
      return b.reminder && !b.reminder.done && typeof b.reminder.at === 'number' && b.reminder.at <= t;
    });
    if (!due.length) return;
    var fired = due.map(function (b) { return { id: b.id, noteId: b.noteId, at: b.reminder.at, text: reminderText(b) }; });
    due.forEach(function (b) {
      if (b.reminder.repeat && b.reminder.repeat !== 'none') b.reminder.at = nextOccurrence(b.reminder.at, b.reminder.repeat);
      else b.reminder.done = true;
    });
    logChange('Recordatorio activado', fired.length + (fired.length > 1 ? ' avisos' : ' aviso'));
    save();
    fired.forEach(function (f) { notify('\u23f0 Recordatorio', f.text); });
    playBeep();
    showAlarm(fired);
    renderCanvas();
  }
  function snooze(id, mins) {
    var b = getBlockById(id);
    if (!b) return;
    b.reminder = b.reminder || {};
    b.reminder.at = now() + mins * 60000;
    b.reminder.done = false;
    save();
    renderCanvas();
  }
  function gotoNote(id) {
    var b = getBlockById(id);
    if (b) selectNote(b.noteId);
  }
  function showAlarm(fired) {
    var old = document.getElementById('alarmOverlay');
    if (old) old.remove();
    var overlay = h('div', { class: 'overlay alarm-overlay', id: 'alarmOverlay', onmousedown: function (e) { if (e.target === overlay) overlay.remove(); } });
    var panel = h('div', { class: 'alarm-card' });
    panel.appendChild(h('div', { class: 'alarm-head' }, icon('bellRing'), h('span', {}, fired.length > 1 ? (fired.length + ' recordatorios') : 'Recordatorio')));
    var list = h('div', { class: 'alarm-list' });
    var close = function () { overlay.remove(); };
    fired.forEach(function (f) {
      var item = h('div', { class: 'alarm-item' },
        h('div', { class: 'alarm-text' }, f.text),
        h('div', { class: 'alarm-when' }, icon('clock'), fmtWhen(f.at)),
        h('div', { class: 'alarm-actions' },
          h('button', { class: 'alarm-btn ghost', onclick: function () { gotoNote(f.id); close(); } }, 'Ver nota'),
          h('button', { class: 'alarm-btn ghost', onclick: function () { snooze(f.id, 5); item.remove(); if (!list.children.length) close(); } }, 'Posponer 5 min'),
          h('button', { class: 'alarm-btn', onclick: function () { item.remove(); if (!list.children.length) close(); } }, 'Listo')
        )
      );
      list.appendChild(item);
    });
    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }
  function openReminderPicker(b, anchor) {
    closeReminderPicker();
    var exists = b.reminder && typeof b.reminder.at === 'number';
    var defAt = exists ? b.reminder.at : Math.ceil((now() + 3600000) / 60000) * 60000;
    var backdrop = h('div', { class: 'pop-backdrop', id: 'reminderBackdrop', onmousedown: function (e) { if (e.target === backdrop) closeReminderPicker(); } });
    var pop = h('div', { class: 'reminder-pop', onmousedown: function (e) { e.stopPropagation(); } });
    var dt = h('input', { type: 'datetime-local', class: 'rem-input', value: toLocalInput(defAt) });
    var rep = h('select', { class: 'rem-input' });
    [['none', 'Una vez'], ['daily', 'Cada d\u00eda'], ['weekdays', 'D\u00edas laborables'], ['weekly', 'Cada semana'], ['monthly', 'Cada mes']].forEach(function (o) {
      var opt = h('option', { value: o[0] }, o[1]);
      if (exists && b.reminder.repeat === o[0]) opt.selected = true;
      rep.appendChild(opt);
    });
    var msg = h('div', { class: 'rem-msg' });
    var saveBtn = h('button', { class: 'rem-save', onclick: function () {
      var at = new Date(dt.value).getTime();
      if (isNaN(at)) { msg.textContent = 'Elige una fecha y hora v\u00e1lidas.'; return; }
      b.reminder = { at: at, repeat: rep.value, done: false };
      ensureNotifyPermission();
      logChange('Recordatorio creado', fmtWhen(at));
      save();
      closeReminderPicker();
      renderCanvas();
      checkReminders();
    } }, 'Guardar');
    var actions = h('div', { class: 'rem-actions' });
    if (exists) actions.appendChild(h('button', { class: 'rem-del', onclick: function () { b.reminder = null; logChange('Recordatorio quitado', ''); save(); closeReminderPicker(); renderCanvas(); } }, 'Quitar'));
    actions.appendChild(saveBtn);
    pop.appendChild(h('div', { class: 'rem-title' }, icon('bell'), 'Recordatorio'));
    pop.appendChild(h('label', { class: 'rem-lbl' }, 'Fecha y hora'));
    pop.appendChild(dt);
    pop.appendChild(h('label', { class: 'rem-lbl' }, 'Repetir'));
    pop.appendChild(rep);
    pop.appendChild(msg);
    pop.appendChild(actions);
    backdrop.appendChild(pop);
    document.body.appendChild(backdrop);
    positionPop(pop, anchor, 248);
    dt.focus();
  }
  function closeReminderPicker() {
    var bd = document.getElementById('reminderBackdrop');
    if (bd) bd.remove();
  }
  function positionPop(pop, anchor, pw) {
    var r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    var pr = pop.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - pr.height - 6) + 'px';
  }

  // ---------- Nota importante / recordatorio r\u00e1pido ----------
  function toggleImportant(b) {
    b.important = !b.important;
    touchNote(b.noteId);
    logChange(b.important ? 'Marcada como importante' : 'Importante quitado', reminderText(b));
    save();
    renderCanvas();
  }
  function humanMins(m) {
    if (m % 60 === 0) { var hh = m / 60; return hh + (hh === 1 ? ' hora' : ' horas'); }
    if (m > 60) return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
    return m + ' min';
  }
  function setQuickReminder(b, minutes) {
    b.reminder = { at: now() + minutes * 60000, repeat: 'none', done: false };
    ensureNotifyPermission();
    logChange('Recordatorio creado', 'En ' + humanMins(minutes) + ' \u00b7 ' + fmtWhen(b.reminder.at));
    save();
    renderCanvas();
  }
  function openCardMenu(b, anchor) {
    closeCardMenu();
    var backdrop = h('div', { class: 'pop-backdrop', id: 'cardMenuBackdrop', onmousedown: function (e) { if (e.target === backdrop) closeCardMenu(); } });
    var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
    pop.appendChild(h('button', { class: 'cm-item' + (b.important ? ' active' : ''), onclick: function () { toggleImportant(b); closeCardMenu(); } },
      icon('star'), h('span', {}, b.important ? 'Quitar de importantes' : 'Marcar como importante')));
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('div', { class: 'cm-label' }, icon('bell'), 'Recordarme'));
    pop.appendChild(h('div', { class: 'cm-quick' },
      h('button', { class: 'cm-chip', onclick: function () { setQuickReminder(b, 15); closeCardMenu(); } }, 'En 15 min'),
      h('button', { class: 'cm-chip', onclick: function () { setQuickReminder(b, 60); closeCardMenu(); } }, 'En 1 h'),
      h('button', { class: 'cm-chip', onclick: function () { setQuickReminder(b, 180); closeCardMenu(); } }, 'En 3 h')
    ));
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeCardMenu(); openReminderPicker(b, anchor); } },
      icon('clock'), h('span', {}, 'Fecha y hora\u2026')));
    if (b.reminder && !b.reminder.done) {
      pop.appendChild(h('div', { class: 'cm-info' },
        h('span', {}, 'Pr\u00f3ximo: ' + fmtWhen(b.reminder.at)),
        h('button', { class: 'cm-mini', onclick: function () { b.reminder = null; logChange('Recordatorio quitado', ''); save(); closeCardMenu(); renderCanvas(); } }, 'Quitar')));
    }
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('div', { class: 'cm-label' }, icon('board'), 'Kanban'));
    if (!b.kanban) {
      pop.appendChild(h('button', { class: 'cm-item', onclick: function () { addToKanban(b); closeCardMenu(); } }, icon('board'), h('span', {}, 'Enviar a Kanban (Por hacer)')));
    } else {
      var st = h('div', { class: 'cm-quick' });
      KAN.forEach(function (o) {
        st.appendChild(h('button', { class: 'cm-chip' + (b.kanban === o[0] ? ' on' : ''), onclick: function () { setKanban(b, o[0]); closeCardMenu(); } }, o[1]));
      });
      pop.appendChild(st);
      pop.appendChild(h('button', { class: 'cm-item danger', onclick: function () { removeFromKanban(b); closeCardMenu(); } }, icon('x'), h('span', {}, 'Quitar del Kanban')));
    }
    backdrop.appendChild(pop);
    document.body.appendChild(backdrop);
    positionPop(pop, anchor, 240);
  }
  function closeCardMenu() { var bd = document.getElementById('cardMenuBackdrop'); if (bd) bd.remove(); }

  // ---------- Kanban ----------
  var KAN = [['todo', 'Por hacer'], ['doing', 'En progreso'], ['done', 'Hecho']];
  var dragKanId = null;
  function kanbanLabel(s) { for (var i = 0; i < KAN.length; i++) { if (KAN[i][0] === s) return KAN[i][1]; } return s; }
  function kanbanOrderOf(b) { return (typeof b.kanbanOrder === 'number') ? b.kanbanOrder : (b.kanbanAt || 0); }
  function kanbanItems(status) {
    return (data.blocks || []).filter(function (b) {
      if (b.kanban !== status) return false;
      if (ui.kanbanBook && notebookIdOfBlock(b) !== ui.kanbanBook) return false;
      return true;
    }).sort(function (a, b) { return kanbanOrderOf(a) - kanbanOrderOf(b); });
  }
  function addToKanban(b) {
    var t = now();
    b.kanban = 'todo'; b.kanbanAt = t; b.kanbanOrder = t;
    touchNote(b.noteId);
    logChange('Enviado a Kanban', reminderText(b));
    save();
    renderCanvas();
    renderKanbanBody();
  }
  function setKanban(b, status) { placeInColumn(b.id, status, null); }
  function removeFromKanban(b) {
    b.kanban = null;
    logChange('Quitado del Kanban', reminderText(b));
    save();
    renderCanvas();
    renderKanbanBody();
  }
  function placeInColumn(id, status, beforeId) {
    var b = getBlockById(id);
    if (!b) return;
    var col = kanbanItems(status).filter(function (x) { return x.id !== id; });
    var idx = beforeId ? col.map(function (x) { return x.id; }).indexOf(beforeId) : col.length;
    if (idx < 0) idx = col.length;
    var prev = col[idx - 1], next = col[idx];
    var lo = prev ? kanbanOrderOf(prev) : (next ? kanbanOrderOf(next) - 2 : now());
    var hi = next ? kanbanOrderOf(next) : (prev ? kanbanOrderOf(prev) + 2 : now());
    b.kanban = status;
    if (!b.kanbanAt) b.kanbanAt = now();
    b.kanbanOrder = (lo + hi) / 2;
    touchNote(b.noteId);
    save();
    renderCanvas();
    renderKanbanBody();
  }
  function openKanban() {
    closeKanban();
    var overlay = h('div', { class: 'overlay kanban-overlay', id: 'kanbanOverlay', onmousedown: function (e) { if (e.target === overlay) closeKanban(); } });
    var panel = h('div', { class: 'kanban-panel' });
    var sel = h('select', { class: 'kanban-filter', title: 'Filtrar por libro' });
    sel.appendChild(h('option', { value: '' }, 'Todos los libros'));
    notebooksAll().forEach(function (nb) {
      sel.appendChild(h('option', { value: nb.id }, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
    });
    sel.value = ui.kanbanBook || '';
    sel.addEventListener('change', function () {
      ui.kanbanBook = sel.value;
      try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (er) {}
      renderKanbanBody();
    });
    panel.appendChild(h('div', { class: 'kanban-head' },
      h('div', { class: 'kanban-title' }, icon('board'), 'Kanban de ideas'),
      h('div', { class: 'kanban-head-right' },
        h('span', { class: 'kanban-filter-wrap' }, icon('book'), sel),
        h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeKanban }, icon('x')))
    ));
    panel.appendChild(h('div', { class: 'kanban-cols', id: 'kanbanCols' }));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    renderKanbanBody();
  }
  function closeKanban() { var o = document.getElementById('kanbanOverlay'); if (o) o.remove(); }
  function renderKanbanBody() {
    var cols = document.getElementById('kanbanCols');
    if (!cols) return;
    cols.innerHTML = '';
    KAN.forEach(function (k) {
      var status = k[0];
      var items = kanbanItems(status);
      var col = h('div', { class: 'kanban-col k-' + status });
      col.appendChild(h('div', { class: 'kanban-col-head' },
        h('span', { class: 'kc-dot' }), h('span', { class: 'kc-name' }, k[1]), h('span', { class: 'kc-count' }, String(items.length))));
      if (status === 'todo') {
        var inp = h('input', { class: 'kanban-add-inp', placeholder: ui.currentNoteId ? 'Nueva idea\u2026' : 'Abre una nota para a\u00f1adir', disabled: ui.currentNoteId ? null : '' });
        var addIt = function () {
          var v = inp.value.trim();
          if (!v || !ui.currentNoteId) return;
          var nb = addBlock(ui.currentNoteId, 'idea', 36 + Math.round(Math.random() * 140), 36 + Math.round(Math.random() * 120));
          nb.content = nb.content || {}; nb.content.text = v;
          addToKanban(nb);
          inp.value = '';
        };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
        var add = h('div', { class: 'kanban-add' }, inp, h('button', { class: 'kanban-add-btn', title: 'A\u00f1adir', onclick: addIt, disabled: ui.currentNoteId ? null : '' }, icon('plus')));
        col.appendChild(add);
      }
      var body = h('div', { class: 'kanban-col-body' });
      body.addEventListener('dragover', function (e) { e.preventDefault(); body.classList.add('drop'); });
      body.addEventListener('dragleave', function () { body.classList.remove('drop'); });
      body.addEventListener('drop', function (e) {
        e.preventDefault();
        body.classList.remove('drop');
        if (!dragKanId) return;
        var beforeId = null;
        var cards = Array.prototype.slice.call(body.querySelectorAll('.kanban-card'));
        for (var i = 0; i < cards.length; i++) {
          var rect = cards[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) { beforeId = cards[i].getAttribute('data-id'); break; }
        }
        placeInColumn(dragKanId, status, beforeId);
        dragKanId = null;
      });
      if (!items.length) body.appendChild(h('div', { class: 'kanban-empty' }, 'Sin tarjetas'));
      items.forEach(function (b) { body.appendChild(kanbanCard(b, status)); });
      col.appendChild(body);
      cols.appendChild(col);
    });
  }
  function kanbanCard(b, status) {
    var note = getNote(b.noteId);
    var sec = note ? getSection(note.sectionId) : null;
    var loc = note ? note.title : 'Nota';
    var task = (b.content && b.content.text) ? snippet(b.content.text) : typeMeta(b.type).label;
    var card = h('div', { class: 'kanban-card' + (b.important ? ' important' : ''), 'data-id': b.id, draggable: 'true' });
    card.addEventListener('dragstart', function (e) { dragKanId = b.id; card.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; } catch (er) {} });
    card.addEventListener('dragend', function () { card.classList.remove('dragging'); dragKanId = null; });
    var top = h('div', { class: 'kc-top' }, icon(typeMeta(b.type).icon), h('span', { class: 'kc-loc', title: loc }, loc));
    if (b.important) top.appendChild(h('span', { class: 'kc-star', title: 'Importante' }, icon('star')));
    card.appendChild(top);
    card.appendChild(h('div', { class: 'kc-task' }, task));
    if (sec) card.appendChild(h('div', { class: 'kc-sub' }, sec.name));
    if (b.reminder && !b.reminder.done) card.appendChild(h('div', { class: 'kc-rem' }, icon('clock'), fmtShort(b.reminder.at)));
    var idx = KAN.map(function (k) { return k[0]; }).indexOf(status);
    var actions = h('div', { class: 'kc-actions' },
      h('button', { class: 'kc-btn', title: 'Mover a la izquierda', disabled: idx <= 0 ? '' : null, onclick: function () { if (idx > 0) setKanban(b, KAN[idx - 1][0]); } }, icon('chevronL')),
      h('button', { class: 'kc-btn', title: 'Ver nota', onclick: function () { selectNote(b.noteId); closeKanban(); } }, icon('popout')),
      h('button', { class: 'kc-btn', title: 'Quitar del Kanban', onclick: function () { removeFromKanban(b); } }, icon('x')),
      h('button', { class: 'kc-btn', title: 'Mover a la derecha', disabled: idx >= KAN.length - 1 ? '' : null, onclick: function () { if (idx < KAN.length - 1) setKanban(b, KAN[idx + 1][0]); } }, icon('chevron'))
    );
    card.appendChild(actions);
    return card;
  }

  // ---------- Atajos globales ----------
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      var z = document.activeElement;
      if (z && (z.tagName === 'TEXTAREA' || z.tagName === 'INPUT' || z.isContentEditable)) return; // deja el undo nativo del texto
      if (undoStack.length) { e.preventDefault(); undo(); }
      return;
    }
    if (e.key === 'Delete') {
      var a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)) return;
      if (Object.keys(selectedIds).length) { e.preventDefault(); deleteSelected(); }
    } else if (e.key === 'Escape') {
      closeRadial();
      closeReminderPicker();
      closeCardMenu();
      closeKanban();
      var ao = document.getElementById('alarmOverlay'); if (ao) ao.remove();
      if (Object.keys(selectedIds).length) clearSelection();
    } else if (e.key === 'Alt' && !e.repeat) {
      if (radialEl || !lastMouse.over) return;
      e.preventDefault();
      openRadial(lastMouse.x, lastMouse.y);
    } else if (e.key === 'Shift' && !e.repeat) {
      var sa = document.activeElement;
      if (sa && (sa.tagName === 'TEXTAREA' || sa.tagName === 'INPUT' || sa.isContentEditable)) return;
      if (ui.currentNoteId) setLinkMode(true);
    }
  });
  document.addEventListener('keyup', function (e) { if (e.key === 'Shift') setLinkMode(false); });
  document.addEventListener('mousedown', function (e) {
    if (radialEl && !e.target.closest('.radial')) closeRadial();
  });
  window.addEventListener('blur', closeRadial);
  window.addEventListener('blur', function () { setLinkMode(false); });

  // ---------- Init ----------
  function boot() {
    initCanvasNav();
    serverLoad(function () {
      renderAll();
      lastSig = sidebarSig();
      startReminderLoop();
    });
  }
  if (bc) bc.onmessage = function (ev) { if (ev && ev.data && ev.data.app === 'tunota') scheduleSync(); };
  window.addEventListener('storage', function (e) { if (e.key === LS_DATA) scheduleSync(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
