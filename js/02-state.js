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
  if (!Array.isArray(data.groups)) data.groups = [];
  if (!Array.isArray(data.userTemplates)) data.userTemplates = []; // plantillas guardadas por el usuario
  if (!Array.isArray(data.inks)) data.inks = [];
  if (typeof ui.kanbanBook !== 'string') ui.kanbanBook = '';
  if (typeof ui.tablet !== 'boolean') ui.tablet = false;
  if (!ui.pen || typeof ui.pen !== 'object') ui.pen = { tool: 'pen', color: '#33302b', size: 3 };
  if (typeof ui.sidebarCollapsed !== 'boolean') ui.sidebarCollapsed = false;
  if (!ui.theme || typeof ui.theme !== 'object') ui.theme = {};
  if (!ui.ai || typeof ui.ai !== 'object') ui.ai = { provider: 'openai', model: '', apiKey: '', baseUrl: '' };
  if (typeof ui.token !== 'string') ui.token = '';
  if (typeof ui.alarmSound !== 'string') ui.alarmSound = 'chime';
  // Preferencias de formato de texto: enumerador, viñeta y espaciado entre ítems.
  if (!ui.fmt || typeof ui.fmt !== 'object') ui.fmt = { num: '1.', bullet: '-', gap: false };
  // Color de texto en contraste automático con el fondo (legible en temas oscuros / tarjetas de color).
  if (typeof ui.autoText !== 'boolean') ui.autoText = true;
  // Tipo de bloque que crea el doble clic en el lienzo (por defecto texto libre translúcido).
  if (typeof ui.dblType !== 'string') ui.dblType = 'freetext';
  // Sincronización con Apple (CalDAV) y Google Drive.
  if (!ui.apple || typeof ui.apple !== 'object') ui.apple = { id: '', password: '', autoSync: false };
  if (!ui.drive || typeof ui.drive !== 'object') ui.drive = { clientId: '', autoSync: false, fileId: '' };
  // Control de funcionalidades (usuario maestro): overrides locales sobre los valores por defecto.
  if (!ui.features || typeof ui.features !== 'object') ui.features = {};
  if (typeof ui.master !== 'boolean') ui.master = false;
}

// ---------- Control de funcionalidades (feature flags + usuario maestro) ----------
// Permite ocultar funciones aún en pulido sin tocar el código. El "usuario maestro"
// (quien conoce el código maestro o tiene el token del servidor) puede alternarlas;
// para el público rige el valor por defecto de cada una.
// CAMBIA este código antes de publicar (queda visible en el JS del cliente; solo
// controla qué se MUESTRA en ese navegador, no da acceso a datos ajenos).
var MASTER_CODE = 'tunota-maestro-2026';
var FEATURE_DEFS = [
  { key: 'ai', label: 'Asistente de IA (con clave propia)', def: true },
  { key: 'ideaReview', label: 'Revisar idea (validación con IA)', def: false },
  { key: 'diagrams', label: 'Formas y diagramas', def: true },
  { key: 'graph', label: 'Mapa de conocimiento', def: true },
  { key: 'kanban', label: 'Kanban de ideas', def: true },
  { key: 'planner', label: 'Plan del día (tareas y acciones)', def: true },
  { key: 'templates', label: 'Plantillas de canvas', def: true },
  { key: 'sync', label: 'Sincronización (Apple · Drive)', def: true },
  { key: 'telegram', label: 'Enviar por Telegram', def: true },
  { key: 'tablet', label: 'Modo tablet (lápiz)', def: true },
  { key: 'donate', label: 'Botón de donación (Yape)', def: true },
];
function featureDefault(key) {
  for (var i = 0; i < FEATURE_DEFS.length; i++) if (FEATURE_DEFS[i].key === key) return FEATURE_DEFS[i].def;
  return true;
}
function isMaster() { return !!(ui && (ui.master || ui.token)); }
function featureOn(key) {
  // El maestro puede alternar; para todos rige su override local si existe.
  if (ui && ui.features && Object.prototype.hasOwnProperty.call(ui.features, key)) return !!ui.features[key];
  return featureDefault(key);
}

// ---------- API del backend: token Bearer + descubrimiento de capacidades ----------
// server.py puede exigir un token Bearer y ofrecer IA (OpenCode) y búsqueda web
// (Tavily) con las claves del .env. La UI mantiene las claves manuales por proveedor;
// esto solo añade la opción de "usar las claves del servidor".
var BACKEND = { up: false, ai: false, search: false, image: false, telegram: false, apple: false, publicMode: false, tokenRequired: false, models: [], defaultModel: '' };
function authHeaders(base) {
  var hh = {};
  if (base) Object.keys(base).forEach(function (k) { hh[k] = base[k]; });
  var t = (ui && ui.token) || '';
  if (t) hh['Authorization'] = 'Bearer ' + t;
  return hh;
}
// Igual que fetch() pero adjunta el token Bearer (si hay) en todas las llamadas /api/*.
function apiFetch(path, opts) {
  opts = opts || {};
  opts.headers = authHeaders(opts.headers);
  return fetch(path, opts);
}
// Enlace de confianza: si la URL trae ?token=… (o #token=…), lo guarda y limpia la URL.
// Permite "confiar" un dispositivo con un enlace, sin teclear el token en la app desplegada.
function applyUrlToken() {
  try {
    var m = /[?#&]token=([^&#]+)/.exec((location.search || '') + (location.hash || ''));
    if (m && m[1] && ui) {
      ui.token = decodeURIComponent(m[1]);
      writeLS(LS_UI, JSON.stringify(ui));
      if (window.history && history.replaceState) history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}
}
function loadBackendConfig(done) {
  if (!window.fetch) { if (done) done(); return; }
  apiFetch('api/config', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (c) {
      BACKEND.up = true; // hay servidor: los proveedores con CORS pueden enrutar por /api/ai
      BACKEND.ai = !!c.aiAvailable;
      BACKEND.search = !!c.searchAvailable;
      BACKEND.image = !!c.imageAvailable;
      BACKEND.telegram = !!c.telegramAvailable;
      BACKEND.apple = !!c.appleAvailable;
      BACKEND.publicMode = !!c.publicMode;
      BACKEND.tokenRequired = !!c.tokenRequired;
      BACKEND.models = c.models || [];
      BACKEND.defaultModel = c.defaultModel || '';
      // En local el servidor entrega el token a los clientes del mismo equipo
      // (loopback): así el navegador no tiene que pedirlo. Nunca llega a clientes
      // remotos (Fly.io), donde sí hay que introducirlo a mano.
      // En loopback sincroniza SIEMPRE con el token actual del servidor (arregla tokens
      // antiguos guardados tras rotar el token). En remoto `c.token` no llega, así que
      // no toca el token que el usuario introdujo a mano.
      if (c.token && ui.token !== c.token) { ui.token = c.token; writeLS(LS_UI, JSON.stringify(ui)); }
      // Si el servidor tiene IA y el usuario no configuró clave propia, usa por
      // defecto las claves del servidor (listo para usar sin pegar ninguna clave).
      // Con token exigido, SOLO si este navegador ya tiene el token: los visitantes
      // sin token deben usar su propia clave (no gastan las claves del dueño).
      if (BACKEND.ai && (!BACKEND.tokenRequired || ui.token) && !ui.ai.apiKey && (!ui.ai.provider || ui.ai.provider === 'openai')) {
        ui.ai.provider = 'backend';
        if (!ui.ai.model) ui.ai.model = BACKEND.defaultModel;
        writeLS(LS_UI, JSON.stringify(ui));
      }
    })
    .catch(function () {})
    .then(function () { if (done) done(); });
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
  if (typeof scheduleDriveSync === 'function') scheduleDriveSync(); // copia automática a Google Drive
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
  undoStack.push({ blocks: JSON.parse(JSON.stringify(data.blocks)), links: JSON.parse(JSON.stringify(data.links || [])), inks: JSON.parse(JSON.stringify(data.inks || [])), groups: JSON.parse(JSON.stringify(data.groups || [])), noteId: ui.currentNoteId, label: label || '' });
  if (undoStack.length > 40) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return;
  var snap = undoStack.pop();
  data.blocks = snap.blocks;
  data.links = snap.links || [];
  data.inks = snap.inks || [];
  if (snap.groups) data.groups = snap.groups; // grupos también son deshacibles (crear/disolver/juntar)
  if (snap.noteId && getNote(snap.noteId)) ui.currentNoteId = snap.noteId;
  logChange('Deshacer', snap.label || '');
  save();
  renderCanvas();
  if (typeof renderSidebar === 'function') renderSidebar(); // el árbol muestra los grupos
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
function inksOf(noteId) {
  return (data.inks || []).filter(function (i) { return i.noteId === noteId; });
}
function addInk(stroke) {
  data.inks = data.inks || [];
  data.inks.push(stroke);
  touchNote(stroke.noteId);
}
function dropInksFor(ids) {
  var set = {}; (Array.isArray(ids) ? ids : [ids]).forEach(function (i) { set[i] = 1; });
  data.inks = (data.inks || []).filter(function (i) { return !set[i.id]; });
}
function removeInksForNote(noteId) {
  data.inks = (data.inks || []).filter(function (i) { return i.noteId !== noteId; });
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
  removeInksForNote(id);
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
    if (typeof pushRecentNote === 'function') pushRecentNote(id); // barra de pestañas (lienzos recientes)
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
  freeimage: { w: 240, h: 180 },
  aiimage: { w: 320, h: 300 },
  shape: { w: 200, h: 130 },
  canvas: { w: 250, h: 92 },
  markdown: { w: 420, h: 320 },
  pdf: { w: 460, h: 560 },
  mermaid: { w: 440, h: 340 },
  draw: { w: 380, h: 300 },
};
function defaultFreeStyle() { return { size: 20, color: '', font: 'sans', bold: false, italic: false, underline: false, strike: false, shadow: false, align: 'left', lineHeight: 1.3, letterSpacing: 0, bg: '', pad: 4, minH: 0 }; }
function defaultContent(type) {
  if (type === 'table') return { table: { rows: [['', ''], ['', '']] } };
  if (type === 'code' || type === 'json' || type === 'curl') return { text: '' };
  if (type === 'python') return { text: '# Escribe Python y pulsa Ejecutar (Ctrl+Enter)\nprint("Hola desde Python")' };
  if (type === 'freetext') return { text: '', style: defaultFreeStyle() };
  if (type === 'image' || type === 'freeimage') return { images: [] };
  if (type === 'aiimage') return { prompt: '', images: [], mode: 'search' };
  if (type === 'shape') return { text: '', shape: 'rect' };
  if (type === 'canvas') return { noteRef: '' }; // portal a un lienzo (nota) anidado
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
