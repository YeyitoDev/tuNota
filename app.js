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
  if (typeof ui.sidebarCollapsed !== 'boolean') ui.sidebarCollapsed = false;
  if (!ui.theme || typeof ui.theme !== 'object') ui.theme = {};
  if (!ui.ai || typeof ui.ai !== 'object') ui.ai = { provider: 'openai', model: '', apiKey: '', baseUrl: '' };

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
    freetext: { w: 260, h: 70 },
    code: { w: 340, h: 190 },
    json: { w: 340, h: 210 },
    curl: { w: 380, h: 320 },
    python: { w: 400, h: 340 },
    table: { w: 340, h: 170 },
    image: { w: 280, h: 240 },
    markdown: { w: 420, h: 320 },
    pdf: { w: 460, h: 560 },
    mermaid: { w: 440, h: 340 },
    draw: { w: 380, h: 300 },
  };
  function defaultFreeStyle() { return { size: 20, color: '', bold: false, italic: false, underline: false, shadow: false, align: 'left' }; }
  function defaultContent(type) {
    if (type === 'table') return { table: { rows: [['', ''], ['', '']] } };
    if (type === 'code' || type === 'json' || type === 'curl') return { text: '' };
    if (type === 'python') return { text: '# Escribe Python y pulsa Ejecutar (Ctrl+Enter)\nprint("Hola desde Python")' };
    if (type === 'freetext') return { text: '', style: defaultFreeStyle() };
    if (type === 'image') return { images: [] };
    if (type === 'markdown') return { text: '' };
    if (type === 'mermaid') return { text: 'graph TD\n  A[Inicio] --> B{\u00bfDecisi\u00f3n?}\n  B -->|S\u00ed| C[Acci\u00f3n]\n  B -->|No| D[Fin]' };
    if (type === 'pdf') return { pdf: '', name: '' };
    if (type === 'draw') return { strokes: [], color: '#33302b', size: 3 };
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
    var moved = [];
    var srcText = ((s.content && s.content.text) || '').trim();
    if (srcText) {
      t.content = t.content || {};
      var base = (t.content.text || '').replace(/\s+$/, '');
      t.content.text = base ? base + '\n\n' + srcText : srcText;
      moved.push('texto');
    }
    var srcImgs = (s.content && s.content.images) || [];
    if (srcImgs.length) {
      t.content = t.content || {};
      t.content.images = (t.content.images || []).concat(srcImgs);
      moved.push(srcImgs.length + ' imagen' + (srcImgs.length > 1 ? 'es' : ''));
    }
    t.updatedAt = now();
    data.blocks = data.blocks.filter(function (x) { return x.id !== sourceId; });
    dropLinksFor(sourceId);
    touchNote(t.noteId);
    logChange('Contenedores combinados', moved.length ? ('Se agreg\u00f3: ' + moved.join(' y ')) : '');
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
    info: S + '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>',
    code: S + '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    braces: S + '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>',
    terminal: S + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    table: S + '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
    format: S + '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
    download: S + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    eye: S + '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: S + '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    panel: S + '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>',
    graph: S + '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="7" r="2.5"/><circle cx="12" cy="17" r="2.5"/><circle cx="12" cy="12" r="3"/><line x1="7" y1="7" x2="9.5" y2="10.5"/><line x1="17" y1="8" x2="14.5" y2="10.5"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="11" y1="14.5" x2="12" y2="15"/></svg>',
    move: S + '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    palette: S + '<circle cx="13.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.2" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.5 1.9-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/></svg>',
    type: S + '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    play: S + '<polygon points="6 4 20 12 6 20 6 4"/></svg>',
    python: S + '<path d="M12 3c-3 0-4 1.2-4 3v2h5v1H6c-1.8 0-3 1.2-3 4s1.2 4 3 4h2v-2.2c0-1.9 1.4-3.3 3.3-3.3h3.4c1.7 0 3-1.4 3-3.1V6c0-1.8-1-3-4-3z"/><circle cx="9.5" cy="6" r="0.8" fill="currentColor"/></svg>',
    key: S + '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l8-8"/><path d="M15.5 7.5l2 2"/><path d="M18 5l2 2"/></svg>',
    send: S + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    pencil: S + '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    eraser: S + '<path d="M20 20H7L3 16a2 2 0 0 1 0-3L13 3a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8"/><line x1="8" y1="20" x2="20" y2="20"/></svg>',
  };
  function icon(name, cls) {
    return h('span', { class: 'icon' + (cls ? ' ' + cls : ''), html: I[name] || '' });
  }
  var TYPE_META = {
    text: { label: 'Nota', icon: 'grip', cls: '' },
    idea: { label: 'Idea', icon: 'bulb', cls: 'idea' },
    freetext: { label: 'Texto', icon: 'type', cls: 'freetext' },
    code: { label: 'C\u00f3digo', icon: 'code', cls: 'code' },
    json: { label: 'JSON', icon: 'braces', cls: 'code' },
    curl: { label: 'cURL', icon: 'terminal', cls: 'code' },
    python: { label: 'Python', icon: 'python', cls: 'code' },
    image: { label: 'Imagen', icon: 'image', cls: 'image' },
    markdown: { label: 'Markdown', icon: 'format', cls: 'md' },
    mermaid: { label: 'Mermaid', icon: 'graph', cls: 'mmd' },
    pdf: { label: 'PDF', icon: 'file', cls: 'pdf' },
    table: { label: 'Tabla', icon: 'table', cls: 'table' },
    draw: { label: 'Dibujo', icon: 'pencil', cls: 'draw' },
  };
  function typeMeta(t) { return TYPE_META[t] || TYPE_META.text; }
  // Atajos de una tecla para crear bloques bajo el cursor
  var QUICK_KEYS = {
    t: 'text', f: 'freetext', i: 'idea', b: 'table', c: 'code',
    p: 'python', j: 'json', u: 'curl', m: 'markdown', d: 'mermaid', x: 'image', k: 'draw',
  };

  // ---------- Colores / categor\u00edas de tarjeta ----------
  var CARD_COLORS = [
    ['', 'Sin color'],
    ['q', 'Pregunta'],
    ['a', 'Respuesta'],
    ['p', 'Pendiente'],
    ['i', 'Info'],
    ['n', 'Destacado'],
  ];
  var CARD_COLOR_LABEL = {};
  CARD_COLORS.forEach(function (c) { if (c[0]) CARD_COLOR_LABEL[c[0]] = c[1]; });
  function setCardColor(b, key) {
    b.color = key || '';
    touchNote(b.noteId);
    logChange('Color de tarjeta', key ? CARD_COLOR_LABEL[key] : 'Sin color');
    save();
    applyCardColor(b, document.querySelector('.card[data-id="' + b.id + '"]'));
  }
  function applyCardColor(b, el) {
    if (!el) return;
    el.className = el.className.replace(/\bcard-c-\w+\b/g, '').replace(/\s{2,}/g, ' ').trim();
    if (b.color) el.classList.add('card-c-' + b.color);
    var head = el.querySelector('.card-head');
    if (!head) return;
    var old = head.querySelector('.card-cat-badge');
    if (old) old.remove();
    if (b.color && CARD_COLOR_LABEL[b.color]) {
      var badge = h('span', { class: 'card-cat-badge cat-' + b.color, title: 'Categor\u00eda: ' + CARD_COLOR_LABEL[b.color] }, CARD_COLOR_LABEL[b.color]);
      var ref = head.querySelector('.card-kanban-badge') || head.querySelector('.card-remind-badge') || head.querySelector('.card-imp-badge') || head.querySelector('.card-spacer');
      if (ref) head.insertBefore(badge, ref.nextSibling); else head.appendChild(badge);
    }
  }

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

  // ---------- Sidebar: colapsar / expandir ----------
  function applySidebar() {
    var app = document.getElementById('app');
    if (app) app.classList.toggle('sidebar-collapsed', !!ui.sidebarCollapsed);
  }
  function toggleSidebar() {
    ui.sidebarCollapsed = !ui.sidebarCollapsed;
    try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (e) {}
    applySidebar();
    drawLinks();
  }

  // ---------- Render: Sidebar ----------
  function renderSidebar() {
    var aside = document.getElementById('sidebar');
    aside.innerHTML = '';
    var brand = h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-ico' }, icon('leaf')),
      h('div', { class: 'brand-txt' }, h('div', { class: 'brand-name' }, 'tuNota'), h('div', { class: 'brand-sub' }, 'ideas que respiran')),
      h('span', { class: 'brand-spacer' }),
      h('button', { class: 'sidebar-collapse-btn', title: 'Ocultar panel', onclick: toggleSidebar }, icon('chevronL'))
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

  // ---------- Tema / colores personalizables ----------
  var THEME_VARS = [
    ['--bg', 'Fondo'],
    ['--card', 'Tarjetas'],
    ['--fg', 'Texto'],
    ['--secondary', 'Panel lateral'],
    ['--border', 'Bordes'],
    ['--primary', 'Acento'],
    ['--sage', 'Verde'],
    ['--ocre', 'Ocre'],
  ];
  var THEME_PRESETS = {
    'Cozy (por defecto)': {},
    'Bosque': { '--bg': '#eef1e6', '--card': '#f8faf2', '--secondary': '#e2e8d6', '--border': '#cfd8bf', '--primary': '#5f8d5a', '--sage': '#7a9b6f', '--ocre': '#c99a4e', '--fg': '#2c332a' },
    'Oc\u00e9ano': { '--bg': '#e9eff3', '--card': '#f6fafc', '--secondary': '#d7e3ea', '--border': '#c3d3dd', '--primary': '#3d7ea6', '--sage': '#5aa0a8', '--ocre': '#d99a5a', '--fg': '#26333b' },
    'Lavanda': { '--bg': '#f0ecf6', '--card': '#faf8fd', '--secondary': '#e5ddf0', '--border': '#d5cae6', '--primary': '#8a6bc2', '--sage': '#9a8ac0', '--ocre': '#d9a35a', '--fg': '#332c3d' },
    'Noche': { '--bg': '#22242a', '--card': '#2c2f37', '--secondary': '#282b32', '--border': '#3a3e48', '--primary': '#d98a6a', '--sage': '#8aa38c', '--ocre': '#d9a35a', '--fg': '#e7e3da', '--muted': '#a09a8f', '--muted2': '#726c62' },
  };
  function applyTheme() {
    var root = document.documentElement;
    THEME_VARS.forEach(function (v) { root.style.removeProperty(v[0]); });
    ['--muted', '--muted2'].forEach(function (k) { root.style.removeProperty(k); });
    var t = ui.theme || {};
    Object.keys(t).forEach(function (k) { if (t[k]) root.style.setProperty(k, t[k]); });
  }
  function cssVarValue(name) {
    var inline = document.documentElement.style.getPropertyValue(name);
    if (inline) return inline.trim();
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';
  }
  function setThemeVar(name, val) {
    ui.theme[name] = val;
    applyTheme();
    debouncedSave();
  }
  function applyPreset(map) {
    ui.theme = {};
    Object.keys(map).forEach(function (k) { ui.theme[k] = map[k]; });
    applyTheme();
    logChange('Tema aplicado', '');
    save();
  }
  function resetTheme() { ui.theme = {}; applyTheme(); logChange('Tema restablecido', ''); save(); }
  function openTheme() {
    closeTheme();
    var overlay = h('div', { class: 'overlay', id: 'themeOverlay', onclick: function (e) { if (e.target === overlay) closeTheme(); } });
    var panel = h('div', { class: 'log-panel theme-panel' });
    var head = h('div', { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('leaf'), 'Personalizar colores'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeTheme }, icon('x'))
    );
    var body = h('div', { class: 'log-body theme-body' });
    var presets = h('div', { class: 'theme-presets' });
    Object.keys(THEME_PRESETS).forEach(function (name) {
      presets.appendChild(h('button', { class: 'theme-preset-btn', onclick: function () { applyPreset(THEME_PRESETS[name]); openTheme(); } }, name));
    });
    body.appendChild(h('div', { class: 'theme-sec-title' }, 'Paletas'));
    body.appendChild(presets);
    body.appendChild(h('div', { class: 'theme-sec-title' }, 'Colores individuales'));
    var grid = h('div', { class: 'theme-grid' });
    THEME_VARS.forEach(function (v) {
      var inp = h('input', { type: 'color', class: 'theme-color', value: toHex(cssVarValue(v[0])) });
      inp.addEventListener('input', function () { setThemeVar(v[0], inp.value); });
      grid.appendChild(h('label', { class: 'theme-row' }, inp, h('span', {}, v[1])));
    });
    body.appendChild(grid);
    var reset = h('button', { class: 'theme-reset-btn', onclick: function () { resetTheme(); openTheme(); } }, 'Restablecer por defecto');
    body.appendChild(reset);
    panel.appendChild(head); panel.appendChild(body);
    overlay.appendChild(panel); document.body.appendChild(overlay);
    document.addEventListener('keydown', escCloseTheme);
  }
  function escCloseTheme(e) { if (e.key === 'Escape') closeTheme(); }
  function closeTheme() { var o = document.getElementById('themeOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseTheme); }
  function toHex(c) {
    c = String(c || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    if (/^#[0-9a-fA-F]{3}$/.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);
    if (m) { return '#' + [1, 2, 3].map(function (i) { return ('0' + (+m[i]).toString(16)).slice(-2); }).join(''); }
    return '#000000';
  }

  // ---------- IA (proveedor + API key) ----------
  var AI_PROVIDERS = {
    openai: { label: 'OpenAI', style: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyHint: 'sk-\u2026' },
    groq: { label: 'Groq', style: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_\u2026' },
    openrouter: { label: 'OpenRouter', style: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', keyHint: 'sk-or-\u2026' },
    gemini: { label: 'Google Gemini', style: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash', keyHint: 'AIza\u2026' },
    anthropic: { label: 'Anthropic (Claude)', style: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', keyHint: 'sk-ant-\u2026' },
    custom: { label: 'Personalizado (OpenAI-compat)', style: 'openai', baseUrl: '', model: '', keyHint: 'clave' },
  };
  function aiConfig() {
    var p = AI_PROVIDERS[ui.ai.provider] || AI_PROVIDERS.openai;
    return {
      style: p.style,
      baseUrl: (ui.ai.baseUrl || p.baseUrl || '').replace(/\/+$/, ''),
      model: ui.ai.model || p.model,
      key: ui.ai.apiKey || '',
    };
  }
  function aiReady() { var c = aiConfig(); return !!(c.key && c.baseUrl && c.model); }
  function aiHandleJSON(r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok) { throw new Error((d && d.error && (d.error.message || d.error)) || ('HTTP ' + r.status)); }
      return d;
    });
  }
  function callAI(messages) {
    var c = aiConfig();
    if (!c.key) return Promise.reject(new Error('Configura tu API key en el panel de IA.'));
    if (!c.baseUrl) return Promise.reject(new Error('Falta la URL base del proveedor.'));
    if (!c.model) return Promise.reject(new Error('Indica un modelo.'));
    if (c.style === 'openai') {
      return fetch(c.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
        body: JSON.stringify({ model: c.model, messages: messages, temperature: 0.7 }),
      }).then(aiHandleJSON).then(function (d) {
        return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
      });
    }
    if (c.style === 'gemini') {
      var sys = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
      var contents = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      });
      var body = { contents: contents };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
      return fetch(c.baseUrl + '/models/' + encodeURIComponent(c.model) + ':generateContent?key=' + encodeURIComponent(c.key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(aiHandleJSON).then(function (d) {
        var cand = d.candidates && d.candidates[0];
        return (cand && cand.content && cand.content.parts) ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
      });
    }
    if (c.style === 'anthropic') {
      var sysA = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
      var msgs = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }; });
      return fetch(c.baseUrl + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: c.model, max_tokens: 1024, system: sysA || undefined, messages: msgs }),
      }).then(aiHandleJSON).then(function (d) {
        return (d.content && d.content.length) ? d.content.map(function (x) { return x.text || ''; }).join('') : '';
      });
    }
    return Promise.reject(new Error('Proveedor no soportado.'));
  }
  function currentNoteText() {
    if (!ui.currentNoteId) return '';
    var parts = [];
    blocksOf(ui.currentNoteId).forEach(function (b) {
      var t = b.content && b.content.text;
      if (t) parts.push(t);
      if (b.content && b.content.table && b.content.table.rows) {
        parts.push(b.content.table.rows.map(function (r) { return r.join(' | '); }).join('\n'));
      }
    });
    return parts.join('\n\n').slice(0, 8000);
  }
  var aiChat = [];
  function openAI() {
    closeAI();
    var overlay = h('div', { class: 'overlay', id: 'aiOverlay', onclick: function (e) { if (e.target === overlay) closeAI(); } });
    var panel = h('div', { class: 'log-panel ai-panel' });
    var showSettings = !aiReady();
    var head = h('div', { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('spark'), 'Asistente IA'),
      h('span', { class: 'card-spacer', style: { flex: '1' } }),
      h('button', { class: 'icon-btn', title: 'Configuraci\u00f3n', onclick: function () { settings.classList.toggle('open'); } }, icon('key')),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeAI }, icon('x'))
    );
    // Settings
    var settings = h('div', { class: 'ai-settings' + (showSettings ? ' open' : '') });
    var provSel = h('select', { class: 'ai-input' });
    Object.keys(AI_PROVIDERS).forEach(function (k) {
      var o = h('option', { value: k }, AI_PROVIDERS[k].label);
      if (ui.ai.provider === k) o.selected = true;
      provSel.appendChild(o);
    });
    var modelInp = h('input', { class: 'ai-input', placeholder: 'modelo', value: ui.ai.model || '' });
    var baseInp = h('input', { class: 'ai-input', placeholder: 'URL base (opcional)', value: ui.ai.baseUrl || '' });
    var keyInp = h('input', { class: 'ai-input', type: 'password', placeholder: 'API key', value: ui.ai.apiKey || '' });
    function syncHints() {
      var p = AI_PROVIDERS[provSel.value] || AI_PROVIDERS.openai;
      modelInp.placeholder = p.model || 'modelo';
      baseInp.placeholder = p.baseUrl || 'URL base';
      keyInp.placeholder = p.keyHint || 'API key';
    }
    provSel.addEventListener('change', function () { syncHints(); });
    syncHints();
    var saveBtn = h('button', { class: 'ai-save-btn', onclick: function () {
      ui.ai.provider = provSel.value;
      ui.ai.model = modelInp.value.trim();
      ui.ai.baseUrl = baseInp.value.trim();
      ui.ai.apiKey = keyInp.value.trim();
      save();
      settings.classList.remove('open');
      renderTopbar();
      pushAIMsg('system-note', aiReady() ? 'Configuraci\u00f3n guardada. \u00a1Listo para chatear!' : 'Faltan datos de configuraci\u00f3n.');
    } }, 'Guardar');
    settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Proveedor'), provSel));
    settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Modelo'), modelInp));
    settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'URL base'), baseInp));
    settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'API key'), keyInp));
    settings.appendChild(h('p', { class: 'ai-warn' }, 'La clave se guarda en este navegador (localStorage). No la uses en equipos compartidos.'));
    settings.appendChild(saveBtn);
    // Chat
    var log = h('div', { class: 'ai-log' });
    var quick = h('div', { class: 'ai-quick' },
      h('button', { class: 'ai-chip', onclick: function () { aiAsk('Resume la siguiente nota en vi\u00f1etas claras y breves:\n\n' + currentNoteText(), 'Resumir nota'); } }, 'Resumir nota'),
      h('button', { class: 'ai-chip', onclick: function () { aiAsk('Sugiere 5 ideas o siguientes pasos a partir de esta nota:\n\n' + currentNoteText(), 'Ideas'); } }, 'Ideas')
    );
    var input = h('textarea', { class: 'ai-textarea', placeholder: 'Escribe tu mensaje\u2026 (Enter env\u00eda, Shift+Enter salto)' });
    var sendBtn = h('button', { class: 'ai-send-btn', title: 'Enviar', onclick: function () { var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } }, icon('send'));
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } });
    var inbar = h('div', { class: 'ai-inbar' }, input, sendBtn);
    var body = h('div', { class: 'log-body ai-body' }, settings, log, quick, inbar);
    panel.appendChild(head); panel.appendChild(body);
    overlay.appendChild(panel); document.body.appendChild(overlay);
    panel._log = log;
    aiChat.forEach(function (m) { renderAIMsg(log, m.role, m.content); });
    if (!aiChat.length) pushAIMsg('assistant', aiReady() ? '\u00a1Hola! Preg\u00fantame o usa una acci\u00f3n r\u00e1pida.' : 'Configura tu proveedor y API key (icono de llave) para empezar.');
    document.addEventListener('keydown', escCloseAI);
    setTimeout(function () { input.focus(); }, 30);
  }
  function aiLogEl() { var o = document.getElementById('aiOverlay'); return o ? o.querySelector('.ai-log') : null; }
  function renderAIMsg(log, role, content) {
    if (!log) return;
    var cls = role === 'user' ? 'ai-msg user' : (role === 'system-note' ? 'ai-msg note' : 'ai-msg bot');
    var msg = h('div', { class: cls });
    if (role === 'assistant') { msg.innerHTML = renderMarkdown(content); msg.classList.add('md-render'); }
    else msg.textContent = content;
    if (role === 'assistant') {
      var ins = h('button', { class: 'ai-insert', title: 'Insertar como nota en el tablero', onclick: function () { insertAINote(content); } }, 'Insertar');
      msg.appendChild(ins);
    }
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  }
  function pushAIMsg(role, content) { if (role !== 'system-note') aiChat.push({ role: role, content: content }); renderAIMsg(aiLogEl(), role, content); }
  function aiAsk(prompt, label) {
    if (!aiReady()) { pushAIMsg('system-note', 'Primero configura tu API key (icono de llave).'); return; }
    pushAIMsg('user', label ? (label + ' \u2192 ' + snippet(prompt)) : prompt);
    var thinking = h('div', { class: 'ai-msg bot thinking' }, 'Pensando\u2026');
    var log = aiLogEl(); if (log) { log.appendChild(thinking); log.scrollTop = log.scrollHeight; }
    var msgs = [{ role: 'system', content: 'Eres un asistente conciso y \u00fatil dentro de tuNota, una app de notas. Responde en el idioma del usuario, usando Markdown breve.' }]
      .concat(aiChat.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-8));
    // Reemplaza el \u00faltimo user por el prompt real (por si venia con label)
    msgs[msgs.length - 1] = { role: 'user', content: prompt };
    callAI(msgs).then(function (text) {
      if (thinking.parentNode) thinking.remove();
      pushAIMsg('assistant', text || '(respuesta vac\u00eda)');
    }).catch(function (e) {
      if (thinking.parentNode) thinking.remove();
      pushAIMsg('system-note', 'Error: ' + ((e && e.message) || e));
    });
  }
  function insertAINote(text) {
    var b = quickCreate('text');
    if (!b) { closeAI(); return; }
    b.content = b.content || {}; b.content.text = text;
    touchNote(b.noteId); logChange('Nota de IA insertada', snippet(text)); save();
    var el = cardEl(b.id); if (el) { var ta = el.querySelector('.card-ta'); if (ta) ta.value = text; }
    closeAI();
  }
  function escCloseAI(e) { if (e.key === 'Escape') closeAI(); }
  function closeAI() { var o = document.getElementById('aiOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseAI); }

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

    var sidebarBtn = h('button', { class: 'icon-btn tb-sidebar-btn', title: 'Mostrar/ocultar panel', onclick: toggleSidebar }, icon('panel'));
    var left = h('div', { class: 'tb-left' }, sidebarBtn, crumb, title);
    var hint = h('div', { class: 'hint' }, icon('cursor'), 'Doble clic: nota \u00b7 Alt: men\u00fa \u00b7 Teclas t/f/i/c/p: crear \u00b7 F2: renombrar \u00b7 Espacio: arrastrar');
    var graphBtn = h('button', { class: 'icon-btn', title: 'Mapa de conocimiento (grafo)', onclick: openGraph }, icon('graph'));
    var importBtn = h('button', { class: 'icon-btn', title: 'Importar Markdown (.md) o PDF', onclick: openImport }, icon('download'));
    var kanBtn = h('button', { class: 'icon-btn', title: 'Kanban de ideas', onclick: openKanban }, icon('board'));
    var histBtn = h('button', { class: 'icon-btn', title: 'Historial de cambios', onclick: openLog }, icon('clock'));
    var integBtn = h('button', { class: 'icon-btn', title: 'Integraciones y versiones', onclick: openIntegrations }, icon('info'));
    var themeBtn = h('button', { class: 'icon-btn', title: 'Personalizar colores', onclick: openTheme }, icon('palette'));
    var ai = h('button', { class: 'ai-btn' + (aiReady() ? ' ready' : ''), title: aiReady() ? 'Asistente IA' : 'Configurar IA (API key)', onclick: openAI }, icon('spark'), 'IA');
    bar.appendChild(left);
    bar.appendChild(hint);
    bar.appendChild(graphBtn);
    bar.appendChild(importBtn);
    bar.appendChild(kanBtn);
    bar.appendChild(histBtn);
    bar.appendChild(themeBtn);
    bar.appendChild(integBtn);
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

  function quickCreate(type) {
    if (!ui.currentNoteId || !canvasContentEl) return null;
    var cx, cy;
    if (lastMouse.over) { cx = lastMouse.x; cy = lastMouse.y; }
    else {
      var wrap = document.getElementById('canvas');
      var r = wrap ? wrap.getBoundingClientRect() : null;
      cx = r ? r.left + r.width / 2 : 300;
      cy = r ? r.top + r.height / 2 : 240;
    }
    return createAt(cx, cy, type);
  }
  function createAt(clientX, clientY, type) {
    if (!ui.currentNoteId || !canvasContentEl) return null;
    var p = toContent(clientX, clientY);
    var x = Math.max(0, p.x - 8);
    var y = Math.max(0, p.y - 8);
    var b = addBlock(ui.currentNoteId, type || 'text', x, y);
    var el = card(b);
    canvasContentEl.appendChild(el);
    if (b.type === 'markdown') el.classList.add('editing-md'); // empezar en modo edici\u00f3n
    var ta = el.querySelector('textarea');
    if (ta) ta.focus();
    return b;
  }

  function card(b) {
    var meta = typeMeta(b.type);
    var isText = b.type === 'text' || b.type === 'idea';
    var isImage = b.type === 'image';
    var isMd = b.type === 'markdown';
    var isPdf = b.type === 'pdf';
    var isMermaid = b.type === 'mermaid';
    var isFree = b.type === 'freetext';
    var isDraw = b.type === 'draw';
    var isMono = b.type === 'code' || b.type === 'json' || b.type === 'curl' || b.type === 'python';
    var hasMedia = isText || isImage;
    var el = h('div', {
      class: 'card' + (meta.cls ? ' ' + meta.cls : '') + (b.color ? ' card-c-' + b.color : '') + (selectedIds[b.id] ? ' selected' : '') + (b.reminder && !b.reminder.done ? ' reminder-on' : '') + (b.important ? ' important' : ''),
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
    if (b.color && CARD_COLOR_LABEL[b.color]) head.appendChild(h('span', { class: 'card-cat-badge cat-' + b.color, title: 'Categor\u00eda: ' + CARD_COLOR_LABEL[b.color] }, CARD_COLOR_LABEL[b.color]));
    if (hasMedia) {
      head.appendChild(h('span', { class: 'card-imgs' }));
      if (isText) head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formatear texto (listas, vi\u00f1etas, saltos de l\u00ednea)', onclick: function (e) { e.stopPropagation(); formatCardText(b, el); } }, icon('format')));
      head.appendChild(h('button', { class: 'card-img-btn', title: 'Insertar imagen (o pega con Ctrl+V)', onclick: function (e) { e.stopPropagation(); pickImagesFor(b, el); } }, icon('image')));
      head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    if (isMd) {
      head.appendChild(h('button', { class: 'card-md-edit', title: 'Editar / previsualizar Markdown', onclick: function (e) { e.stopPropagation(); toggleMdEdit(b, el); } }, icon('edit')));
      head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    if (isPdf) {
      head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana (calidad completa)', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    if (isMermaid) {
      head.appendChild(h('button', { class: 'card-mmd-move', title: 'Modo interactivo: mover / escalar objetos, editar texto y zoom', onclick: function (e) { e.stopPropagation(); toggleMmdMove(b, el); } }, icon('move')));
      head.appendChild(h('button', { class: 'card-mmd-edit', title: 'Editar / ver diagrama', onclick: function (e) { e.stopPropagation(); toggleMmdEdit(b, el); } }, icon('edit')));
      head.appendChild(h('button', { class: 'card-mmd-dl', title: 'Descargar diagrama (PNG)', onclick: function (e) { e.stopPropagation(); downloadMermaid(b, el); } }, icon('download')));
      head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    if (isMono && b.type !== 'python') {
      head.appendChild(h('button', { class: 'card-pop', title: b.type === 'curl' ? 'Abrir en ventana (ejecutar cURL)' : 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
    }
    if (isFree) {
      head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formato: tama\u00f1o, color, sombra, subrayado', onclick: function (e) { e.stopPropagation(); openFreeFormat(b, el); } }, icon('format')));
    }
    head.appendChild(menuBtn);
    head.appendChild(del);

    el.appendChild(head);
    if (b.type === 'table') appendChild(el, tableBody(b));
    else if (isMono) appendChild(el, monoBody(b));
    else if (isImage) appendChild(el, imageBody(b));
    else if (isMd) appendChild(el, markdownBody(b));
    else if (isPdf) appendChild(el, pdfBody(b));
    else if (isMermaid) appendChild(el, mermaidBody(b));
    else if (isFree) appendChild(el, freeTextBody(b));
    else if (isDraw) appendChild(el, drawBody(b));
    else appendChild(el, textBody(b));

    attachDragHandler(head, el, b);
    var anchor = h('button', { class: 'card-link-anchor', title: 'Arrastra hasta otro bloque para conectarlos' });
    anchor.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); startLinkDrag(b, e); });
    anchor.addEventListener('click', function (e) { e.stopPropagation(); });
    el.appendChild(anchor);
    if (hasMedia || isMd || isPdf || isMermaid || (isMono && b.type !== 'python')) {
      head.addEventListener('dblclick', function (e) {
        if (e.target.closest('.card-del') || e.target.closest('.card-pop') || e.target.closest('.card-menu') || e.target.closest('.card-md-edit') || e.target.closest('.card-mmd-edit') || e.target.closest('.card-mmd-dl') || e.target.closest('.card-mmd-move')) return;
        popOut(b.id);
      });
      if (hasMedia) updateCardMedia(el, b);
    }
    if (isImage) {
      var grip = h('span', { class: 'img-card-resize', title: 'Arrastra para redimensionar (mantiene proporci\u00f3n)' });
      grip.addEventListener('mousedown', function (e) { startImageCardResize(e, b, el); });
      el.appendChild(grip);
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
    ta.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
      }
      if (files.length) {
        e.preventDefault();
        var el = ta.closest('.card');
        addImagesToBlock(b, files, function () { if (el) updateCardMedia(el, b); });
      }
    });
    return [ta, h('div', { class: 'card-media' })];
  }
  function applyFreeStyle(ta, st) {
    st = st || {};
    ta.style.fontSize = (st.size || 20) + 'px';
    ta.style.color = st.color || '';
    ta.style.fontWeight = st.bold ? '700' : '400';
    ta.style.fontStyle = st.italic ? 'italic' : 'normal';
    ta.style.textDecoration = st.underline ? 'underline' : 'none';
    ta.style.textShadow = st.shadow ? '0 2px 6px rgba(0,0,0,0.35)' : 'none';
    ta.style.textAlign = st.align || 'left';
    ta.style.lineHeight = '1.3';
  }
  function autoGrowFree(ta) {
    var card = ta.closest('.card');
    ta.style.height = 'auto';
    var hh = Math.max(ta.scrollHeight, 28);
    ta.style.height = hh + 'px';
    if (card) { card.style.height = 'auto'; }
  }
  function freeTextBody(b) {
    b.content = b.content || {};
    if (!b.content.style) b.content.style = defaultFreeStyle();
    var ta = h('textarea', { class: 'card-ta free-ta', rows: '1', placeholder: 'Texto\u2026', spellcheck: 'false' });
    ta.value = b.content.text || '';
    applyFreeStyle(ta, b.content.style);
    ta.addEventListener('input', function () { b.content.text = ta.value; autoGrowFree(ta); touchNote(b.noteId); debouncedSave(); drawLinks(); });
    ta.addEventListener('change', function () { logChange('Texto editado', snippet(ta.value)); save(); });
    ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    setTimeout(function () { autoGrowFree(ta); }, 0);
    return [ta];
  }
  function openFreeFormat(b, el) {
    closeCardMenu();
    var ta = el.querySelector('.free-ta');
    if (!ta) return;
    b.content.style = b.content.style || defaultFreeStyle();
    var st = b.content.style;
    var pop = h('div', { class: 'free-format-pop' });
    pop.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    function persist(logMsg) { applyFreeStyle(ta, st); autoGrowFree(ta); touchNote(b.noteId); if (logMsg) logChange(logMsg, ''); save(); drawLinks(); }
    // Tama\u00f1o
    var size = h('input', { type: 'range', min: '12', max: '72', step: '1', value: String(st.size || 20), class: 'free-size' });
    size.addEventListener('input', function () { st.size = +size.value; sizeLbl.textContent = size.value + 'px'; persist(); });
    var sizeLbl = h('span', { class: 'free-size-lbl' }, (st.size || 20) + 'px');
    pop.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Tama\u00f1o'), size, sizeLbl));
    // Color
    var color = h('input', { type: 'color', value: st.color ? toHex(st.color) : toHex(cssVarValue('--fg')), class: 'free-color' });
    color.addEventListener('input', function () { st.color = color.value; persist(); });
    var clearColor = h('button', { class: 'free-chip', title: 'Color por defecto', onclick: function () { st.color = ''; persist('Formato de texto'); } }, 'Auto');
    pop.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Color'), color, clearColor));
    // Toggles
    function toggle(label, key, title) {
      var btn = h('button', { class: 'free-chip' + (st[key] ? ' on' : ''), title: title }, label);
      btn.addEventListener('click', function () { st[key] = !st[key]; btn.classList.toggle('on', st[key]); persist('Formato de texto'); });
      return btn;
    }
    pop.appendChild(h('div', { class: 'free-row' },
      toggle('B', 'bold', 'Negrita'),
      toggle('i', 'italic', 'Cursiva'),
      toggle('U', 'underline', 'Subrayado'),
      toggle('S', 'shadow', 'Sombra')
    ));
    // Alineaci\u00f3n
    var aligns = ['left', 'center', 'right'];
    var alignRow = h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Alinear'));
    aligns.forEach(function (a) {
      var btn = h('button', { class: 'free-chip' + (st.align === a ? ' on' : ''), title: a }, a === 'left' ? '\u2190' : (a === 'center' ? '\u2194' : '\u2192'));
      btn.addEventListener('click', function () { st.align = a; alignRow.querySelectorAll('.free-chip').forEach(function (x) { x.classList.remove('on'); }); btn.classList.add('on'); persist('Formato de texto'); });
      alignRow.appendChild(btn);
    });
    pop.appendChild(alignRow);
    el.appendChild(pop);
    var close = function (ev) { if (!pop.contains(ev.target) && !ev.target.closest('.card-fmt-btn')) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(function () { document.addEventListener('mousedown', close, true); }, 0);
  }
  // ---------- Dibujo a mano (Apple Pencil / mouse / t\u00e1ctil) ----------
  function drawBody(b) {
    b.content = b.content || {};
    if (!Array.isArray(b.content.strokes)) b.content.strokes = [];
    if (!b.content.color) b.content.color = '#33302b';
    if (!b.content.size) b.content.size = 3;
    var wrap = h('div', { class: 'draw-wrap' });
    var canvas = h('canvas', { class: 'draw-canvas' });
    var ctx = canvas.getContext('2d');
    var state = { drawing: false, cur: null, erase: false, dpr: window.devicePixelRatio || 1 };

    function resize() {
      var rect = wrap.getBoundingClientRect();
      var w = Math.max(20, rect.width), hh = Math.max(20, rect.height);
      state.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * state.dpr);
      canvas.height = Math.round(hh * state.dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = hh + 'px';
      redraw();
    }
    function drawStroke(s) {
      if (!s.points || s.points.length === 0) return;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = s.color;
      if (s.points.length === 1) {
        var p0 = s.points[0];
        ctx.beginPath(); ctx.fillStyle = s.color;
        ctx.arc(p0.x * canvas.width, p0.y * canvas.height, Math.max(0.5, (s.size * (p0.p || 1)) / 2) * state.dpr, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      for (var i = 1; i < s.points.length; i++) {
        var a = s.points[i - 1], c = s.points[i];
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.5, s.size * ((a.p || 1) + (c.p || 1)) / 2) * state.dpr;
        ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
        ctx.lineTo(c.x * canvas.width, c.y * canvas.height);
        ctx.stroke();
      }
    }
    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      b.content.strokes.forEach(drawStroke);
      if (state.cur) drawStroke(state.cur);
    }
    function ptFrom(e) {
      var rect = canvas.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var pr = (e.pointerType === 'pen') ? (e.pressure || 0.5) : (e.pressure && e.pressure !== 0.5 ? e.pressure : 1);
      return { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)), p: pr };
    }
    function down(e) {
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      state.drawing = true;
      state.erase = e.button === 2 || state.forceErase;
      if (state.erase) { eraseAt(ptFrom(e)); return; }
      state.cur = { color: b.content.color, size: b.content.size, points: [ptFrom(e)] };
      redraw();
    }
    function move(e) {
      if (!state.drawing) return;
      e.stopPropagation();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
      if (state.erase) { for (var k = 0; k < evs.length; k++) eraseAt(ptFrom(evs[k])); return; }
      for (var i = 0; i < evs.length; i++) state.cur.points.push(ptFrom(evs[i]));
      redraw();
    }
    function up(e) {
      if (!state.drawing) return;
      e.stopPropagation();
      state.drawing = false;
      if (state.cur && state.cur.points.length) { b.content.strokes.push(state.cur); }
      state.cur = null;
      touchNote(b.noteId); logChange('Dibujo actualizado', ''); save();
      redraw();
    }
    function eraseAt(pt) {
      var before = b.content.strokes.length;
      b.content.strokes = b.content.strokes.filter(function (s) {
        return !s.points.some(function (q) { return Math.hypot(q.x - pt.x, q.y - pt.y) < 0.03; });
      });
      if (b.content.strokes.length !== before) { redraw(); debouncedSave(); }
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.style.touchAction = 'none';

    // Barra de herramientas
    var colorInp = h('input', { type: 'color', class: 'draw-color', value: b.content.color, title: 'Color' });
    colorInp.addEventListener('input', function () { b.content.color = colorInp.value; debouncedSave(); });
    colorInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var sizeInp = h('input', { type: 'range', class: 'draw-size', min: '1', max: '24', value: String(b.content.size), title: 'Grosor' });
    sizeInp.addEventListener('input', function () { b.content.size = +sizeInp.value; debouncedSave(); });
    sizeInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var eraseBtn = h('button', { class: 'draw-tool', title: 'Borrador (o clic derecho)' }, icon('eraser'));
    eraseBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    eraseBtn.addEventListener('click', function (e) { e.stopPropagation(); state.forceErase = !state.forceErase; eraseBtn.classList.toggle('on', state.forceErase); });
    var clearBtn = h('button', { class: 'draw-tool', title: 'Limpiar todo' }, icon('trash'));
    clearBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    clearBtn.addEventListener('click', function (e) { e.stopPropagation(); if (!b.content.strokes.length) return; b.content.strokes = []; state.cur = null; redraw(); touchNote(b.noteId); logChange('Dibujo borrado', ''); save(); });
    var toolbar = h('div', { class: 'draw-toolbar' }, colorInp, sizeInp, eraseBtn, clearBtn);

    wrap.appendChild(canvas);
    wrap.appendChild(toolbar);
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (canvas.isConnected) resize(); }); ro.observe(wrap); }
    setTimeout(resize, 0);
    return [wrap];
  }
  function imageBody(b) {
    b.content = b.content || {};
    b.content.images = b.content.images || [];
    var media = h('div', { class: 'card-media img-media', tabindex: '0' });
    media.addEventListener('mousedown', function (e) { if (e.target === media) media.focus(); });
    media.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
      }
      if (files.length) {
        e.preventDefault(); e.stopPropagation();
        var el = media.closest('.card');
        addImagesToBlock(b, files, function () { if (el) { updateCardMedia(el, b); drawLinks(); } });
      }
    });
    return [media];
  }
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
  // ---------- PDF ----------
  function renderPdf(wrap, b) {
    wrap.innerHTML = '';
    var src = b.content && b.content.pdf;
    if (src) {
      wrap.appendChild(h('iframe', { class: 'pdf-frame', src: src, title: (b.content && b.content.name) || 'PDF' }));
    } else {
      wrap.appendChild(h('div', { class: 'card-media-empty' }, 'Importa un PDF con el bot\u00f3n Importar'));
    }
  }
  function pdfBody(b) {
    b.content = b.content || {};
    var wrap = h('div', { class: 'pdf-wrap' });
    wrap.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    renderPdf(wrap, b);
    return [wrap];
  }
  // ---------- Importar archivos (.md / .pdf) ----------
  function openImport() {
    if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre o crea una nota primero.'); return; }
    var input = h('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain,.pdf,application/pdf', multiple: '', style: { display: 'none' } });
    input.addEventListener('change', function () { importFiles(input.files); input.value = ''; });
    document.body.appendChild(input);
    input.click();
    setTimeout(function () { input.remove(); }, 60000);
  }
  function importFiles(fileList, atX, atY) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre o crea una nota primero.'); return; }
    var wrap = document.getElementById('canvas');
    var r = wrap ? wrap.getBoundingClientRect() : null;
    var hasPos = typeof atX === 'number' && typeof atY === 'number';
    var baseX = hasPos ? atX : (r ? r.left + r.width / 2 : 240);
    var baseY = hasPos ? atY : (r ? r.top + r.height / 3 : 160);
    files.forEach(function (f, idx) {
      var name = f.name || '';
      var ox = baseX + idx * 26, oy = baseY + idx * 26;
      var isMd = /\.(md|markdown|txt)$/i.test(name) || f.type === 'text/markdown';
      var isPdf = /\.pdf$/i.test(name) || f.type === 'application/pdf';
      var isImg = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
      if (isImg) {
        var ib = createAt(ox, oy, 'image'); if (!ib) return;
        ib.width = 300; ib.height = 220;
        var iel = cardEl(ib.id);
        if (iel) { iel.style.width = ib.width + 'px'; iel.style.height = ib.height + 'px'; }
        addImagesToBlock(ib, [f], function () {
          if (!iel) return;
          updateCardMedia(iel, ib);
          fitImageCard(iel, ib);
          drawLinks();
        });
      } else if (isMd) {
        var mr = new FileReader();
        mr.onload = function () {
          var b = createAt(ox, oy, 'markdown'); if (!b) return;
          b.content = { text: String(mr.result || '') };
          b.width = 440; b.height = 360;
          var el = cardEl(b.id);
          if (el) {
            el.style.width = b.width + 'px'; el.style.height = b.height + 'px';
            var v = el.querySelector('.md-render'); if (v) v.innerHTML = renderMarkdown(b.content.text);
            var ta = el.querySelector('.md-src'); if (ta) ta.value = b.content.text;
          }
          logChange('Markdown importado', snippet(name)); save(); drawLinks();
        };
        mr.readAsText(f);
      } else if (isPdf) {
        if (f.size > 12 * 1024 * 1024 && !window.confirm('El PDF "' + name + '" pesa ' + Math.round(f.size / 1048576) + ' MB y puede ralentizar el guardado. \u00bfContinuar?')) return;
        var pr = new FileReader();
        pr.onload = function () {
          var b = createAt(ox, oy, 'pdf'); if (!b) return;
          b.content = { pdf: String(pr.result || ''), name: name };
          b.width = 480; b.height = 600;
          var el = cardEl(b.id);
          if (el) {
            el.style.width = b.width + 'px'; el.style.height = b.height + 'px';
            var w = el.querySelector('.pdf-wrap'); if (w) renderPdf(w, b);
          }
          logChange('PDF importado', snippet(name)); save(); drawLinks();
        };
        pr.readAsDataURL(f);
      } else {
        alert('Formato no soportado: ' + name + '\nUsa .md (Markdown) o .pdf');
      }
    });
  }
  // ---------- Im\u00e1genes ----------
  var MAX_IMG_DIM = 1400;
  function imgItemSrc(it) { return typeof it === 'string' ? it : (it && it.src) || ''; }
  function imgItemW(it) { return (it && typeof it === 'object' && it.w) ? it.w : 0; }
  var DEFAULT_IMG_W = 260;
  function fileToScaledDataURL(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h2 = img.height;
        var scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h2));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h2 * scale));
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        try { c.getContext('2d').drawImage(img, 0, 0, cw, ch); cb(c.toDataURL('image/jpeg', 0.82), cw); }
        catch (e) { cb(reader.result, 0); }
      };
      img.onerror = function () { cb(reader.result, 0); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function addImagesToBlock(b, files, done) {
    var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) { if (done) done(0); return; }
    b.content = b.content || {};
    b.content.images = b.content.images || [];
    var pending = arr.length, added = 0;
    arr.forEach(function (f) {
      fileToScaledDataURL(f, function (url, cw) {
        var dw = cw ? Math.min(cw, DEFAULT_IMG_W) : 0;
        b.content.images.push(dw ? { src: url, w: dw } : { src: url });
        added++; pending--;
        if (pending <= 0) {
          touchNote(b.noteId);
          logChange('Imagen a\u00f1adida', '');
          save();
          if (done) done(added);
        }
      });
    });
  }
  function removeCardImage(b, index, cardEl) {
    if (!b.content || !b.content.images) return;
    b.content.images.splice(index, 1);
    touchNote(b.noteId);
    logChange('Imagen eliminada', '');
    save();
    if (cardEl) updateCardMedia(cardEl, b);
  }
  // Redimensiona la tarjeta de imagen manteniendo la proporci\u00f3n de la imagen (sin margen/letterbox).
  function startImageCardResize(e, b, el) {
    e.preventDefault(); e.stopPropagation();
    var img = el.querySelector('.img-media img');
    var head = el.querySelector('.card-head');
    var headH = head ? head.offsetHeight : 34;
    var nw = (img && img.naturalWidth) || 4, nh = (img && img.naturalHeight) || 3;
    var aspect = nh / nw;
    var startX = e.clientX, startW = el.offsetWidth;
    function move(ev) {
      var scale = getView().zoom || 1;
      var w = Math.max(140, Math.round(startW + (ev.clientX - startX) / scale));
      el.style.width = w + 'px';
      el.style.height = Math.round((w - 2) * aspect + headH + 2) + 'px';
      drawLinks();
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      b.width = el.offsetWidth; b.height = el.offsetHeight;
      logChange('Imagen redimensionada', b.width + ' px');
      save(); drawLinks();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  // Ajusta el alto de una tarjeta de imagen al aspecto real de la primera imagen (sin letterbox).
  function fitImageCard(el, b) {
    if (!el || b.type !== 'image') return;
    var img = el.querySelector('.img-media img');
    if (!img) return;
    var apply = function () {
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh) return;
      var media = el.querySelector('.img-media');
      var mw = (media && media.clientWidth) || (b.width - 2);
      var head = el.querySelector('.card-head');
      var headH = head ? head.offsetHeight : 34;
      var ih = Math.round(mw * nh / nw);
      b.height = Math.max(120, headH + ih + 2);
      el.style.height = b.height + 'px';
      drawLinks();
      save();
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  }
  function pickImagesFor(b, cardEl) {
    var input = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    input.addEventListener('change', function () {
      addImagesToBlock(b, input.files, function () { if (cardEl) updateCardMedia(cardEl, b); });
      input.value = '';
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(function () { input.remove(); }, 60000);
  }
  function cardFigure(b, index, cardEl) {
    var it = b.content.images[index];
    var img = h('img', { src: imgItemSrc(it), alt: '', draggable: 'false' });
    var w = imgItemW(it);
    if (w) img.style.width = w + 'px';
    var del = h('button', { class: 'fig-del', title: 'Quitar imagen', onclick: function (e) { e.stopPropagation(); removeCardImage(b, index, cardEl); } }, icon('trash'));
    var handle = h('span', { class: 'fig-resize', title: 'Arrastra para redimensionar' });
    handle.addEventListener('mousedown', function (e) { startImgResize(e, b, index, img, cardEl); });
    var fig = h('figure', { class: 'card-fig' }, img, del, handle);
    fig.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    return fig;
  }
  function startImgResize(e, b, index, img, cardEl) {
    e.preventDefault(); e.stopPropagation();
    var media = cardEl.querySelector('.card-media');
    if (media) media.setAttribute('data-resizing', '1');
    var startX = e.clientX, startW = img.offsetWidth || img.naturalWidth || 120;
    function move(ev) {
      var scale = getView().zoom || 1;
      var nw = Math.max(48, Math.round(startW + (ev.clientX - startX) / scale));
      img.style.width = nw + 'px';
      drawLinks();
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (media) media.removeAttribute('data-resizing');
      var nw = img.offsetWidth;
      b.content.images[index] = { src: imgItemSrc(b.content.images[index]), w: nw };
      touchNote(b.noteId);
      logChange('Imagen redimensionada', nw + ' px');
      save();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function insertAtCursor(ta, text) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + text.length;
  }
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
      var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar el código (Ctrl+Enter)', onclick: function (e) {
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
      else { out.classList.add('empty'); out.textContent = 'La salida aparecerá aquí tras ejecutar (Ctrl+Enter).'; }
      return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, status), resize, out];
    }
    if (b.type === 'curl') {
      ta.classList.add('curl-input');
      var status = h('span', { class: 'mono-status' });
      var out = h('pre', { class: 'curl-out' });
      var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar la petici\u00f3n (Ctrl+Enter)', onclick: function (e) {
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
    fetch('api/curl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) })
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
      var res = { text: text ? String(text) : '', error: err ? String(err) : '', img: img ? String(img) : '', timeMs: Date.now() - t0 };
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
    if (res.img) out.appendChild(h('img', { class: 'py-img', src: 'data:image/png;base64,' + res.img, alt: 'gr\u00e1fico' }));
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
    var blk = getBlockById(id);
    var dim = 'width=600,height=680';
    if (blk && blk.type === 'pdf') dim = 'width=980,height=900';
    else if (blk && blk.type === 'image') dim = 'width=820,height=780';
    else if (blk && blk.type === 'markdown') dim = 'width=760,height=820';
    else if (blk && blk.type === 'mermaid') dim = 'width=900,height=760';
    else if (blk && blk.type === 'curl') dim = 'width=820,height=760';
    else if (blk && (blk.type === 'code' || blk.type === 'json')) dim = 'width=760,height=700';
    var w = window.open('note.html?id=' + encodeURIComponent(id), 'tunota_' + id, dim);
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
    var media = el.querySelector('.card-media');
    if (media) {
      if (media.getAttribute('data-resizing') === '1') return;
      media.innerHTML = '';
      if (imgs.length) {
        media.style.display = '';
        imgs.forEach(function (_it, i) { media.appendChild(cardFigure(b, i, el)); });
      } else if (b.type === 'image') {
        media.style.display = '';
        media.appendChild(h('div', { class: 'card-media-empty' }, 'Pega (Ctrl+V) o inserta una imagen'));
      } else { media.style.display = 'none'; }
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

  // ---------- Integraciones y versiones ----------
  function getIntegrations() {
    var mmdLoaded = !!window.mermaid;
    var mmdVer = mmdLoaded && window.mermaid.version ? window.mermaid.version : null;
    var serverOn = (typeof SERVER !== 'undefined') && !!SERVER;
    return [
      {
        name: 'Mermaid',
        desc: 'Diagramas de texto (flowchart, secuencia, swimlanes\u2026)',
        version: mmdVer ? mmdVer : '11 (latest)',
        requested: '11 (latest)',
        ok: mmdLoaded,
        statusText: mmdLoaded ? 'Cargado' : 'No disponible (requiere internet)',
        url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
      },
      {
        name: 'Servidor local (API)',
        desc: 'Ejecuci\u00f3n de cURL y guardado en disco (server.py)',
        version: 'HTTP api/*',
        requested: 'py server.py',
        ok: serverOn,
        statusText: serverOn ? 'Conectado' : 'Sin conexi\u00f3n (modo solo navegador)',
        url: '',
      },
      {
        name: 'Google Fonts',
        desc: 'Tipograf\u00edas Fraunces y Nunito',
        version: 'CSS2 API',
        requested: 'Fraunces + Nunito',
        ok: true,
        statusText: 'Enlazado',
        url: 'https://fonts.googleapis.com',
      },
    ];
  }
  function openIntegrations() {
    closeIntegrations();
    var overlay = h('div', { class: 'overlay', id: 'integOverlay', onclick: function (e) { if (e.target === overlay) closeIntegrations(); } });
    var panel = h('div', { class: 'log-panel integ-panel' });
    var head = h('div', { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('info'), 'Integraciones y versiones'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeIntegrations }, icon('x'))
    );
    var body = h('div', { class: 'log-body' });
    getIntegrations().forEach(function (it) {
      var row = h('div', { class: 'integ-row' },
        h('span', { class: 'integ-dot ' + (it.ok ? 'ok' : 'off') }),
        h('div', { class: 'integ-main' },
          h('div', { class: 'integ-name' }, it.name, h('span', { class: 'integ-ver' }, 'v' + it.version)),
          h('div', { class: 'integ-desc' }, it.desc),
          it.url ? h('a', { class: 'integ-url', href: it.url, target: '_blank', rel: 'noopener' }, it.url) : null
        ),
        h('span', { class: 'integ-status ' + (it.ok ? 'ok' : 'off') }, it.statusText)
      );
      body.appendChild(row);
    });
    body.appendChild(h('p', { class: 'integ-note' }, 'Los swimlanes nativos de Mermaid requieren v11.16.0+ (sintaxis "swimlane-beta", a\u00fan en beta).'));
    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escCloseInteg);
  }
  function escCloseInteg(e) { if (e.key === 'Escape') closeIntegrations(); }
  function closeIntegrations() {
    var o = document.getElementById('integOverlay');
    if (o) o.remove();
    document.removeEventListener('keydown', escCloseInteg);
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

  // ---------- Mapa de conocimiento (grafo tipo Obsidian) ----------
  function graphBlockLabel(b) {
    if (b.type === 'pdf') return (b.content && b.content.name) || 'PDF';
    if (b.type === 'image') return 'Imagen';
    if (b.type === 'mermaid') return 'Diagrama';
    if (b.type === 'markdown') {
      var t = (b.content && b.content.text) || '';
      var m = t.match(/^#{1,6}\s+(.+)$/m);
      return (m ? m[1].trim() : snippet(t)) || 'Markdown';
    }
    if (b.type === 'code' || b.type === 'json' || b.type === 'curl' || b.type === 'table') return typeMeta(b.type).label;
    return snippet(b.content && b.content.text) || typeMeta(b.type).label;
  }
  function buildGraphTree() {
    var root = { id: 'root', label: 'tuNota', kind: 'root', children: [] };
    notebooksAll().forEach(function (nb) {
      var nbNode = { id: 'nb-' + nb.id, label: (nb.emoji ? nb.emoji + ' ' : '') + nb.name, kind: 'notebook', children: [] };
      sectionsOf(nb.id).forEach(function (s) {
        var sNode = { id: 'sec-' + s.id, label: s.name, kind: 'section', children: [] };
        notesOf(s.id).forEach(function (n) {
          var nNode = { id: 'note-' + n.id, label: n.title || 'Nota', kind: 'note', noteId: n.id, children: [] };
          blocksOf(n.id).forEach(function (b) {
            if (b.type === 'markdown' || b.type === 'pdf' || b.type === 'image' || b.type === 'mermaid') {
              nNode.children.push({ id: 'blk-' + b.id, label: graphBlockLabel(b), kind: 'doc', docType: b.type, noteId: n.id, blockId: b.id, children: [] });
            }
          });
          sNode.children.push(nNode);
        });
        nbNode.children.push(sNode);
      });
      root.children.push(nbNode);
    });
    return root;
  }
  function layoutRadial(root) {
    function leaves(node) {
      if (!node.children || !node.children.length) { node._leaves = 1; return 1; }
      var s = 0; node.children.forEach(function (c) { s += leaves(c); }); node._leaves = s; return s;
    }
    leaves(root);
    var RING = 200;
    (function assign(node, depth, a0, a1) {
      var ang = (a0 + a1) / 2;
      var r = depth * RING;
      node._x = Math.cos(ang) * r;
      node._y = Math.sin(ang) * r;
      if (node.children && node.children.length) {
        var acc = a0, span = (a1 - a0);
        node.children.forEach(function (c) { var cs = span * (c._leaves / node._leaves); assign(c, depth + 1, acc, acc + cs); acc += cs; });
      }
    })(root, 0, 0, Math.PI * 2);
    return root;
  }
  function firstNoteUnder(node) {
    if (node.noteId) return node.noteId;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) { var r = firstNoteUnder(kids[i]); if (r) return r; }
    return null;
  }
  function onGraphNodeClick(n) {
    if (n.kind === 'doc' && n.noteId) {
      closeGraph();
      selectNote(n.noteId);
      setTimeout(function () { popOut(n.blockId); }, 160);
    } else if (n.noteId) {
      closeGraph();
      selectNote(n.noteId);
    } else {
      var target = firstNoteUnder(n);
      if (target) { closeGraph(); selectNote(target); }
    }
  }
  function openGraph() {
    closeGraph();
    var overlay = h('div', { class: 'overlay graph-overlay', id: 'graphOverlay', onmousedown: function (e) { if (e.target === overlay) closeGraph(); } });
    var panel = h('div', { class: 'graph-panel' });
    panel.appendChild(h('div', { class: 'graph-head' },
      h('div', { class: 'graph-title' }, icon('graph'), 'Mapa de conocimiento'),
      h('div', { class: 'graph-head-right' },
        h('span', { class: 'graph-hint' }, 'Clic en un nodo para ir a su lienzo \u00b7 Arrastra para mover \u00b7 Rueda: zoom'),
        h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeGraph }, icon('x')))
    ));
    var stage = h('div', { class: 'graph-stage', id: 'graphStage' });
    var world = h('div', { class: 'graph-world', id: 'graphWorld' });
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'graph-edges');
    world.appendChild(svg);
    stage.appendChild(world);
    panel.appendChild(stage);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', graphEsc);
    renderGraph(world, svg, stage);
  }
  function graphEsc(e) { if (e.key === 'Escape') closeGraph(); }
  function closeGraph() {
    var o = document.getElementById('graphOverlay');
    if (o) o.remove();
    document.removeEventListener('keydown', graphEsc);
  }
  function renderGraph(world, svg, stage) {
    var tree = layoutRadial(buildGraphTree());
    var nodes = [], edges = [];
    (function walk(n, parent) { nodes.push(n); if (parent) edges.push([parent, n]); (n.children || []).forEach(function (c) { walk(c, n); }); })(tree, null);
    var cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
    svg.setAttribute('width', stage.clientWidth);
    svg.setAttribute('height', stage.clientHeight);
    svg.innerHTML = '';
    edges.forEach(function (e) {
      var l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', cx + e[0]._x); l.setAttribute('y1', cy + e[0]._y);
      l.setAttribute('x2', cx + e[1]._x); l.setAttribute('y2', cy + e[1]._y);
      l.setAttribute('class', 'graph-edge k-' + e[1].kind);
      svg.appendChild(l);
    });
    nodes.forEach(function (n) {
      var el = h('button', {
        class: 'graph-node k-' + n.kind + (n.docType ? ' doc-' + n.docType : ''),
        style: { left: (cx + n._x) + 'px', top: (cy + n._y) + 'px' },
        title: n.label
      });
      el.appendChild(h('span', { class: 'gn-dot' }, n.kind === 'doc' ? icon(typeMeta(n.docType).icon) : (n.kind === 'note' ? icon('file') : null)));
      el.appendChild(h('span', { class: 'gn-label' }, n.label));
      el.addEventListener('click', function (ev) { ev.stopPropagation(); onGraphNodeClick(n); });
      world.appendChild(el);
    });
    setupGraphNav(world, stage);
  }
  function setupGraphNav(world, stage) {
    var view = { x: 0, y: 0, z: 1 };
    function apply() { world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'; }
    apply();
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = Math.exp(-e.deltaY * 0.0015);
      view.z = Math.max(0.2, Math.min(2.6, view.z * f));
      apply();
    }, { passive: false });
    stage.addEventListener('mousedown', function (e) {
      if (e.target.closest('.graph-node')) return;
      e.preventDefault();
      var sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
      stage.classList.add('grabbing');
      function mv(ev) { view.x = ox + (ev.clientX - sx); view.y = oy + (ev.clientY - sy); apply(); }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); stage.classList.remove('grabbing'); }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  // ---------- Render all ----------
  function renderAll() {
    renderSidebar();
    renderTopbar();
    renderCanvas();
    applySidebar();
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
    if (b.type === 'text' || b.type === 'idea' || b.type === 'image') {
      pop.appendChild(h('div', { class: 'cm-sep' }));
      pop.appendChild(h('div', { class: 'cm-label' }, icon('leaf'), 'Color / categor\u00eda'));
      var sw = h('div', { class: 'cm-colors' });
      CARD_COLORS.forEach(function (c) {
        var btn = h('button', {
          class: 'cm-color' + (c[0] ? ' cat-' + c[0] : ' none') + ((b.color || '') === c[0] ? ' on' : ''),
          title: c[1],
          onclick: function () { setCardColor(b, c[0]); closeCardMenu(); },
        });
        if (!c[0]) btn.appendChild(icon('x'));
        sw.appendChild(btn);
      });
      pop.appendChild(sw);
    }
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
    } else if (e.key === 'F2') {
      var te = document.querySelector('.note-title');
      if (te && !te.classList.contains('is-muted')) { e.preventDefault(); te.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key && e.key.length === 1) {
      // Atajos de creaci\u00f3n r\u00e1pida (crean el bloque bajo el cursor)
      var ce = document.activeElement;
      if (ce && (ce.tagName === 'TEXTAREA' || ce.tagName === 'INPUT' || ce.isContentEditable)) return;
      if (radialEl || document.querySelector('.overlay')) return; // no crear con paneles abiertos
      if (!ui.currentNoteId || !getNote(ui.currentNoteId)) return;
      var key = e.key.toLowerCase();
      if (QUICK_KEYS[key]) { e.preventDefault(); quickCreate(QUICK_KEYS[key]); }
    }
  });
  document.addEventListener('keyup', function (e) { if (e.key === 'Shift') setLinkMode(false); });
  // Pegar (Ctrl+V) una captura/imagen directamente en el tablero -> crea una tarjeta con la imagen.
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (!files.length) return;
    var a = document.activeElement;
    // Si se est\u00e1 editando una nota/idea, su propio manejador ya agrega la imagen a esa tarjeta.
    if (a && a.classList && a.classList.contains('card-ta') && !a.classList.contains('mono')) return;
    // No secuestrar el pegado en otros campos de edici\u00f3n (c\u00f3digo, t\u00edtulos, celdas, etc.).
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (!ui.currentNoteId || !getNote(ui.currentNoteId) || !canvasContentEl) return;
    e.preventDefault();
    var cx, cy, wrap = document.getElementById('canvas');
    var r = wrap ? wrap.getBoundingClientRect() : null;
    if (lastMouse.over) { cx = lastMouse.x; cy = lastMouse.y; }
    else if (r) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    else { cx = 220; cy = 200; }
    var b = createAt(cx, cy, 'image');
    if (!b) return;
    b.width = 300; b.height = 220;
    var el = cardEl(b.id);
    if (el) { el.style.width = b.width + 'px'; el.style.height = b.height + 'px'; }
    addImagesToBlock(b, files, function () {
      if (!el) return;
      updateCardMedia(el, b);
      fitImageCard(el, b);
      drawLinks();
    });
  });
  document.addEventListener('mousedown', function (e) {
    if (radialEl && !e.target.closest('.radial')) closeRadial();
  });
  window.addEventListener('blur', closeRadial);
  window.addEventListener('blur', function () { setLinkMode(false); });

  // ---------- Init ----------
  function boot() {
    applyTheme();
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
