/* tuNota — Estado global (data/ui), guardado, deshacer, selectores y mutaciones de datos.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Estado ----------
var data = null;
var ui = null;
// Se llama desde boot() (12-boot.js), cuando ya están cargados todos los
// módulos: seed() y save() viven en ficheros posteriores.
function initState() {
  data = loadJSON(LS_DATA);
  ui = loadJSON(LS_UI);
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
}

function pair(id) {
  var o = {};
  o[id] = true;
  return o;
}
function save() {
  data.savedAt = now();
  var dataStr = JSON.stringify(data);
  var ok = writeLS(LS_DATA, dataStr);
  writeLS(LS_UI, JSON.stringify(ui));
  if (ok) maybeSnapshot(dataStr);
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
  // Nota: los blobs del bloque NO se borran aquí para que Ctrl+Z pueda
  // restaurarlos; gcBlobs() limpia los huérfanos en el próximo arranque.
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
