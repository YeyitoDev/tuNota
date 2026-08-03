/* tuNota — Búsqueda global (Ctrl+K) con filtros y panel de atajos de teclado.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Búsqueda global con filtros ----------
// Busca en todo lo que guarda la app: libros, secciones, notas (lienzos), tarjetas,
// subgrupos, conexiones y tareas del plan del día. Además del texto, se puede acotar
// por tipo de tarjeta, ubicación, fecha, color, tono, kanban y estado (recordatorio,
// imagen, pendiente…). Los mismos filtros se pueden teclear en la caja como
// operadores: `tipo:code libro:"Mi libro" desde:2026-01-01 tiene:recordatorio`.

var SEARCH_KINDS = [
  { key: 'note', label: 'Notas', icon: 'file' },
  { key: 'block', label: 'Tarjetas', icon: 'grip' },
  { key: 'book', label: 'Libros', icon: 'book' },
  { key: 'section', label: 'Secciones', icon: 'panel' },
  { key: 'group', label: 'Subgrupos', icon: 'layout' },
  { key: 'link', label: 'Conexiones', icon: 'link' },
  { key: 'task', label: 'Tareas del día', icon: 'todo' },
];
function searchKindMeta(k) {
  for (var i = 0; i < SEARCH_KINDS.length; i++) if (SEARCH_KINDS[i].key === k) return SEARCH_KINDS[i];
  return SEARCH_KINDS[0];
}
// Estados que se pueden exigir. `kinds` dice a qué resultados puede aplicarse cada uno:
// al combinar varios, la búsqueda se acota a los tipos comunes a todos (y se suman, no
// se alternan: pedir "importante" + "con imagen" da las tarjetas que cumplen ambas).
var SEARCH_FLAGS = [
  { key: 'reminder', label: 'Con recordatorio', icon: 'clock', kinds: ['block'] },
  { key: 'overdue', label: 'Recordatorio vencido', icon: 'bellRing', kinds: ['block'] },
  { key: 'important', label: 'Importante', icon: 'star', kinds: ['block'] },
  { key: 'inkanban', label: 'En el kanban', icon: 'board', kinds: ['block'] },
  { key: 'pending', label: 'Pendiente', icon: 'todo', kinds: ['block', 'task'] },
  { key: 'done', label: 'Completado', icon: 'todo', kinds: ['block', 'task'] },
  { key: 'image', label: 'Con imagen', icon: 'image', kinds: ['block'] },
  { key: 'linked', label: 'Con conexiones', icon: 'link', kinds: ['block'] },
  { key: 'grouped', label: 'En un subgrupo', icon: 'layout', kinds: ['block'] },
  { key: 'colored', label: 'Con color', icon: 'palette', kinds: ['block'] },
  { key: 'titled', label: 'Con título propio', icon: 'type', kinds: ['block'] },
  { key: 'empty', label: 'Vacías', icon: 'square', kinds: ['block', 'note'] },
];
function searchFlagMeta(k) {
  for (var i = 0; i < SEARCH_FLAGS.length; i++) if (SEARCH_FLAGS[i].key === k) return SEARCH_FLAGS[i];
  return null;
}
var SEARCH_DATE_PRESETS = [
  ['', 'Cualquier fecha'],
  ['today', 'Hoy'],
  ['yesterday', 'Ayer'],
  ['7d', 'Últimos 7 días'],
  ['30d', 'Últimos 30 días'],
  ['90d', 'Últimos 3 meses'],
  ['year', 'Este año'],
  ['custom', 'Entre dos fechas…'],
];
var SEARCH_SORTS = [
  ['relevance', 'Relevancia'],
  ['recent', 'Más recientes'],
  ['old', 'Más antiguos'],
  ['az', 'A → Z'],
  ['za', 'Z → A'],
];
var SEARCH_MODES = [
  ['contains', 'Contiene'],
  ['word', 'Palabra exacta'],
  ['regex', 'Expresión regular'],
];

function defaultSearchFilters() {
  return {
    kinds: [], types: [], colors: [], ranks: [], kanban: [], flags: [],
    bookId: '', sectionId: '', noteId: '', groupId: '',
    dateField: 'updatedAt', datePreset: '', from: '', to: '',
    mode: 'contains', caseSensitive: false, sort: 'relevance', open: false,
  };
}
// Los filtros se conservan entre aperturas (y entre recargas, dentro de ui).
function searchFilters() {
  if (!ui.search || typeof ui.search !== 'object') ui.search = defaultSearchFilters();
  var def = defaultSearchFilters();
  for (var k in def) {
    var want = Array.isArray(def[k]) ? Array.isArray(ui.search[k]) : typeof def[k] === typeof ui.search[k];
    if (!want) ui.search[k] = def[k];
  }
  return ui.search;
}
function searchFiltersActive(f) {
  var n = f.kinds.length + f.types.length + f.colors.length + f.ranks.length + f.kanban.length + f.flags.length;
  if (f.bookId) n++;
  if (f.sectionId) n++;
  if (f.noteId) n++;
  if (f.groupId) n++;
  if (f.datePreset) n++;
  if (f.mode !== 'contains') n++;
  if (f.caseSensitive) n++;
  return n;
}
function searchToggle(arr, v) {
  var i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

// ---------- Consulta: términos, exclusiones (-palabra) y operadores (clave:valor) ----------
var SEARCH_OPS = {
  tipo: 'type', type: 'type',
  en: 'kind', solo: 'kind',
  libro: 'book', cuaderno: 'book',
  seccion: 'section', 'sección': 'section',
  nota: 'note', lienzo: 'note',
  grupo: 'group', subgrupo: 'group',
  color: 'color',
  tono: 'rank', rango: 'rank',
  kanban: 'kanban', estado: 'kanban',
  desde: 'from', hasta: 'to',
  tiene: 'has', con: 'has', es: 'has',
};
// Divide respetando comillas: `libro:"Mi libro"` es un solo token.
function searchTokenize(q) {
  var out = [], re = /(?:[^\s"]+|"[^"]*")+/g, m;
  while ((m = re.exec(q))) out.push(m[0]);
  return out;
}
function searchUnquote(s) { return s.replace(/"/g, '').trim(); }
// Busca por nombre (sin distinguir mayúsculas ni acentos) y devuelve el id.
function searchFold(s) {
  s = String(s == null ? '' : s).toLowerCase();
  return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
}
function searchFindByName(list, name, prop) {
  var want = searchFold(name);
  if (!want) return '';
  var exact = null, partial = null;
  list.forEach(function (o) {
    var v = searchFold(o[prop]);
    if (v === want) exact = exact || o;
    else if (!partial && v.indexOf(want) >= 0) partial = o;
  });
  var hit = exact || partial;
  return hit ? hit.id : '';
}
// Combina lo tecleado con los filtros del panel; devuelve una copia (no muta ui.search).
function parseSearchQuery(q, base) {
  var f = {};
  for (var k in base) f[k] = Array.isArray(base[k]) ? base[k].slice() : base[k];
  var terms = [], nots = [], bad = [];
  searchTokenize(q || '').forEach(function (tok) {
    var m = /^([a-zA-Z\u00c0-\u024f]+):(.*)$/.exec(tok);
    var op = m && SEARCH_OPS[m[1].toLowerCase()];
    if (!op) {
      var neg = tok.charAt(0) === '-' && tok.length > 1;
      var t = searchUnquote(neg ? tok.slice(1) : tok);
      if (t) (neg ? nots : terms).push(t);
      return;
    }
    var v = searchUnquote(m[2]);
    if (!v) return;
    var vl = searchFold(v);
    if (op === 'type') {
      var tk = Object.keys(TYPE_META).filter(function (t2) { return t2 === vl || searchFold(TYPE_META[t2].label) === vl; })[0];
      if (tk) { if (f.types.indexOf(tk) < 0) f.types.push(tk); } else bad.push(tok);
    } else if (op === 'kind') {
      var kk = SEARCH_KINDS.filter(function (x) { return x.key === vl || searchFold(x.label).indexOf(vl) === 0; })[0];
      if (kk) { if (f.kinds.indexOf(kk.key) < 0) f.kinds.push(kk.key); } else bad.push(tok);
    } else if (op === 'book') {
      var bid = searchFindByName(data.notebooks || [], v, 'name');
      if (bid) f.bookId = bid; else bad.push(tok);
    } else if (op === 'section') {
      var sid = searchFindByName(data.sections || [], v, 'name');
      if (sid) f.sectionId = sid; else bad.push(tok);
    } else if (op === 'note') {
      var nid = searchFindByName(data.notes || [], v, 'title');
      if (nid) f.noteId = nid; else bad.push(tok);
    } else if (op === 'group') {
      var gid = searchFindByName(data.groups || [], v, 'name');
      if (gid) f.groupId = gid; else bad.push(tok);
    } else if (op === 'color') {
      var ck = CARD_COLORS.filter(function (c) { return c[0] && (c[0] === vl || searchFold(c[1]) === vl); })[0];
      if (ck) { if (f.colors.indexOf(ck[0]) < 0) f.colors.push(ck[0]); } else bad.push(tok);
    } else if (op === 'rank') {
      var rk = NOTE_RANKS.filter(function (r) { return r.key === vl || searchFold(r.label) === vl; })[0];
      if (rk) { if (f.ranks.indexOf(rk.key) < 0) f.ranks.push(rk.key); } else bad.push(tok);
    } else if (op === 'kanban') {
      var kn = KAN.filter(function (x) { return x[0] === vl || searchFold(x[1]) === vl; })[0];
      if (kn) { if (f.kanban.indexOf(kn[0]) < 0) f.kanban.push(kn[0]); } else bad.push(tok);
    } else if (op === 'has') {
      var fl = SEARCH_FLAGS.filter(function (x) { return x.key === vl || searchFold(x.label).indexOf(vl) >= 0; })[0];
      if (fl) { if (f.flags.indexOf(fl.key) < 0) f.flags.push(fl.key); } else bad.push(tok);
    } else if (op === 'from' || op === 'to') {
      var d = searchParseDate(vl);
      if (d) { f.datePreset = 'custom'; f[op === 'from' ? 'from' : 'to'] = d; } else bad.push(tok);
    }
  });
  return { f: f, terms: terms, nots: nots, bad: bad, mode: f.mode, ci: !f.caseSensitive };
}
// Acepta 2026-08-03, 03/08/2026, «hoy» y «ayer»; devuelve YYYY-MM-DD.
function searchParseDate(v) {
  var d;
  if (v === 'hoy' || v === 'today') d = new Date();
  else if (v === 'ayer' || v === 'yesterday') { d = new Date(); d.setDate(d.getDate() - 1); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  else {
    var m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (!m) return '';
    d = new Date(+m[3], +m[2] - 1, +m[1]);
  }
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// ---------- Coincidencia de texto ----------
// Letras acentuadas incluidas: \b de JS las trataría como frontera de palabra.
var SEARCH_WORDCH = /[0-9A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff_]/;
function findTerm(text, term, mode, ci, from) {
  from = from || 0;
  if (mode === 'regex') {
    var re;
    try { re = new RegExp(term, ci ? 'i' : ''); } catch (e) { return null; }
    var m = re.exec(text.slice(from));
    return m ? { i: from + m.index, len: m[0].length || 1 } : null;
  }
  var hay = ci ? text.toLowerCase() : text;
  var needle = ci ? term.toLowerCase() : term;
  if (!needle) return null;
  var i = hay.indexOf(needle, from);
  if (mode !== 'word') return i < 0 ? null : { i: i, len: needle.length };
  while (i >= 0) {
    var before = i === 0 ? '' : hay.charAt(i - 1);
    var after = hay.charAt(i + needle.length);
    if (!SEARCH_WORDCH.test(before) && !SEARCH_WORDCH.test(after)) return { i: i, len: needle.length };
    i = hay.indexOf(needle, i + 1);
  }
  return null;
}
// Todos los términos deben aparecer y ninguno de los excluidos. Devuelve la primera
// coincidencia (para recortar el contexto) o null si el texto no encaja.
function searchMatchText(text, Q) {
  text = text || '';
  for (var j = 0; j < Q.nots.length; j++) if (findTerm(text, Q.nots[j], Q.mode, Q.ci)) return null;
  if (!Q.terms.length) return { i: -1, len: 0 };
  var best = null;
  for (var i = 0; i < Q.terms.length; i++) {
    var m = findTerm(text, Q.terms[i], Q.mode, Q.ci);
    if (!m) return null;
    if (!best || m.i < best.i) best = m;
  }
  return best;
}
function searchSnippet(text, i, len) {
  text = text || '';
  if (i < 0) {
    var head = text.replace(/\s+/g, ' ').trim();
    return head.length > 130 ? head.slice(0, 130) + '…' : head;
  }
  var from = Math.max(0, i - 40);
  var s = (from > 0 ? '…' : '') + text.slice(from, i + len + 80);
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}
// Pinta el texto resaltando las coincidencias dentro del nodo dado.
function hlInto(el, text, Q) {
  text = String(text == null ? '' : text);
  var marks = [];
  (Q.terms || []).forEach(function (t) {
    var from = 0, m, guard = 0;
    while ((m = findTerm(text, t, Q.mode, Q.ci, from)) && guard++ < 40) {
      marks.push([m.i, m.i + m.len]);
      from = m.i + Math.max(1, m.len);
    }
  });
  if (!marks.length) { el.appendChild(document.createTextNode(text)); return el; }
  marks.sort(function (a, b) { return a[0] - b[0]; });
  var merged = [];
  marks.forEach(function (r) {
    var last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  });
  var pos = 0;
  merged.forEach(function (r) {
    if (r[0] > pos) el.appendChild(document.createTextNode(text.slice(pos, r[0])));
    el.appendChild(h('mark', { class: 'search-mark' }, text.slice(r[0], r[1])));
    pos = r[1];
  });
  if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  return el;
}

// ---------- Texto y estado de cada cosa buscable ----------
function blockSearchText(b) {
  var c = b.content || {};
  var parts = [];
  if (b.title) parts.push(b.title);
  if (c.text) parts.push(c.text);
  if (c.table && c.table.rows) parts.push(c.table.rows.map(function (r) { return r.join(' '); }).join(' '));
  if (c.name) parts.push(c.name);                       // nombre del PDF
  if (c.desc) parts.push(c.desc);                       // descripción / texto extraído de la imagen
  if (c.prompt) parts.push(c.prompt);                   // instrucción de la imagen con IA
  if (Array.isArray(c.hlinks)) parts.push(c.hlinks.map(function (l) { return l.text || ''; }).join(' '));
  if (c.noteRef) { var n = getNote(c.noteRef); if (n) parts.push(n.title); }
  if (b.reminder && b.reminder.label) parts.push(b.reminder.label);
  return parts.join('\n');
}
function blockIsEmpty(b) {
  var c = b.content || {};
  if (blockSearchText(b).trim()) return false;
  if ((c.images || []).length || (c.strokes || []).length || c.pdf) return false;
  return true;
}
// Casillas de markdown sin marcar: «- [ ] algo».
function blockHasPending(b) {
  var t = (b.content && b.content.text) || '';
  return /^[\s>*-]*\[ \]/m.test(t);
}
function blockGroupId(b) {
  var g = (data.groups || []).filter(function (x) { return (x.blockIds || []).indexOf(b.id) >= 0; })[0];
  return g ? g.id : '';
}
function notePath(note) {
  var sec = note && getSection(note.sectionId);
  var nb = sec && getNotebook(sec.notebookId);
  return (nb ? nb.name + ' › ' : '') + (sec ? sec.name + ' › ' : '') + (note ? note.title : '');
}

// ---------- Filtros estructurales ----------
function daysAgoStart(n) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}
function searchDateRange(f) {
  var from = null, to = null;
  if (f.datePreset === 'today') from = daysAgoStart(0);
  else if (f.datePreset === 'yesterday') { from = daysAgoStart(1); to = daysAgoStart(0); }
  else if (f.datePreset === '7d') from = daysAgoStart(6);
  else if (f.datePreset === '30d') from = daysAgoStart(29);
  else if (f.datePreset === '90d') from = daysAgoStart(89);
  else if (f.datePreset === 'year') from = new Date(new Date().getFullYear(), 0, 1).getTime();
  else if (f.datePreset === 'custom') {
    if (f.from) from = new Date(f.from + 'T00:00:00').getTime();
    if (f.to) to = new Date(f.to + 'T23:59:59.999').getTime();
  }
  if (from != null && isNaN(from)) from = null;
  if (to != null && isNaN(to)) to = null;
  return { from: from, to: to };
}
function searchInRange(ts, range) {
  if (range.from == null && range.to == null) return true;
  if (typeof ts !== 'number' || !ts) return false;
  if (range.from != null && ts < range.from) return false;
  if (range.to != null && ts > range.to) return false;
  return true;
}
// Tipos de resultado compatibles con los filtros elegidos: los filtros propios de las
// tarjetas (tipo, color, tono, kanban) restringen la búsqueda a tarjetas.
function searchAllowedKinds(f) {
  var all = SEARCH_KINDS.map(function (k) { return k.key; });
  var allowed = f.kinds.length ? all.filter(function (k) { return f.kinds.indexOf(k) >= 0; }) : all;
  function drop(list) { allowed = allowed.filter(function (k) { return list.indexOf(k) < 0; }); }
  if (f.types.length || f.colors.length || f.ranks.length || f.kanban.length || f.groupId) {
    allowed = allowed.filter(function (k) { return k === 'block'; });
  }
  // Acotar a un sitio deja fuera lo que no vive ahí: las tareas del plan del día no
  // están en ningún libro, y un libro (o una sección) es más amplio que la sección
  // (o la nota) que se ha pedido.
  if (f.bookId || f.sectionId || f.noteId || f.groupId) drop(['task']);
  if (f.sectionId || f.noteId || f.groupId) drop(['book']);
  if (f.noteId || f.groupId) drop(['section']);
  f.flags.forEach(function (key) {
    var meta = searchFlagMeta(key);
    if (meta) allowed = allowed.filter(function (k) { return meta.kinds.indexOf(k) >= 0; });
  });
  return allowed;
}
// Ni los libros ni las secciones guardan fecha propia de modificación: se deduce de sus
// notas (la más reciente al filtrar por «modificado», la más antigua por «creado»).
function scopeTs(notes, field) {
  var best = 0;
  notes.forEach(function (n) {
    var t = n[field] || 0;
    if (!t) return;
    if (!best) best = t;
    else best = field === 'createdAt' ? Math.min(best, t) : Math.max(best, t);
  });
  return best;
}
function notebookTs(nb, field) {
  var ns = [];
  sectionsOf(nb.id).forEach(function (s) { ns = ns.concat(notesOf(s.id)); });
  return scopeTs(ns, field) || nb.createdAt || 0;
}
function sectionTs(s, field) { return scopeTs(notesOf(s.id), field); }
function blockPassesFlags(b, f) {
  for (var i = 0; i < f.flags.length; i++) {
    var k = f.flags[i];
    if (k === 'reminder' && !(b.reminder && !b.reminder.done)) return false;
    if (k === 'overdue' && !(b.reminder && !b.reminder.done && typeof b.reminder.at === 'number' && b.reminder.at <= now())) return false;
    if (k === 'important' && !b.important) return false;
    if (k === 'inkanban' && !b.kanban) return false;
    if (k === 'pending' && !(blockHasPending(b) || (b.kanban && b.kanban !== 'done'))) return false;
    if (k === 'done' && b.kanban !== 'done') return false;
    if (k === 'image' && !((b.content && b.content.images) || []).length) return false;
    if (k === 'linked' && !(data.links || []).some(function (l) { return l.a === b.id || l.b === b.id; })) return false;
    if (k === 'grouped' && !blockGroupId(b)) return false;
    if (k === 'colored' && !b.color) return false;
    if (k === 'titled' && !b.title) return false;
    if (k === 'empty' && !blockIsEmpty(b)) return false;
  }
  return true;
}
function taskPassesFlags(t, f) {
  for (var i = 0; i < f.flags.length; i++) {
    var k = f.flags[i];
    if (k === 'pending' && t.done) return false;
    if (k === 'done' && !t.done) return false;
  }
  return true;
}
// ¿La nota cae dentro del libro/sección/nota pedidos?
function noteInScope(n, f) {
  if (!n) return false;
  if (f.noteId && n.id !== f.noteId) return false;
  var s = getSection(n.sectionId);
  if (f.sectionId && n.sectionId !== f.sectionId) return false;
  if (f.bookId && (!s || s.notebookId !== f.bookId)) return false;
  return true;
}

// ---------- Motor de búsqueda ----------
var SEARCH_KIND_WEIGHT = { note: 14, book: 12, section: 12, group: 8, block: 6, link: 4, task: 6 };
function searchMatches(q, filters) {
  var f = filters || searchFilters();
  var Q = parseSearchQuery(q, f);
  f = Q.f;
  var allowed = searchAllowedKinds(f);
  var range = searchDateRange(f);
  var field = f.dateField === 'createdAt' ? 'createdAt' : 'updatedAt';
  var can = {};
  allowed.forEach(function (k) { can[k] = true; });
  var out = [];
  // Sin texto ni filtros no tiene sentido volcar toda la base: la lista queda vacía
  // y el panel muestra las búsquedas recientes.
  if (!Q.terms.length && !Q.nots.length && !searchFiltersActive(f)) return { results: [], query: Q, filters: f };

  function push(rec, hay, m) {
    var score = SEARCH_KIND_WEIGHT[rec.kind] || 0;
    if (m.i >= 0) score += m.i < rec.titleLen ? 60 - Math.min(45, m.i) : 22;
    if (Q.terms.length && m.i === 0) score += 12;
    rec.score = score;
    rec.hay = hay;
    rec.match = m;
    out.push(rec);
  }

  if (can.note) {
    (data.notes || []).forEach(function (n) {
      if (!noteInScope(n, f)) return;
      if (!searchInRange(n[field], range)) return;
      if (f.flags.indexOf('empty') >= 0 && blocksOf(n.id).length) return;
      var hay = n.title || '';
      var m = searchMatchText(hay, Q);
      if (!m) return;
      push({ kind: 'note', icon: 'file', title: n.title || 'Nota sin título', titleLen: hay.length, path: notePath(n), ts: n[field] || n.updatedAt, noteId: n.id, chips: [fmtDate(n.updatedAt), blocksOf(n.id).length + ' tarjetas'] }, hay, m);
    });
  }
  if (can.block) {
    (data.blocks || []).forEach(function (b) {
      var n = getNote(b.noteId);
      if (!noteInScope(n, f)) return;
      if (f.types.length && f.types.indexOf(b.type) < 0) return;
      if (f.colors.length && f.colors.indexOf(b.color || '') < 0) return;
      if (f.ranks.length && f.ranks.indexOf(noteRank(b)) < 0) return;
      if (f.kanban.length && f.kanban.indexOf(b.kanban || '') < 0) return;
      if (f.groupId && blockGroupId(b) !== f.groupId) return;
      if (!blockPassesFlags(b, f)) return;
      if (!searchInRange(b[field], range)) return;
      // blockSearchText ya empieza por el título propio de la tarjeta si lo tiene. La
      // etiqueta genérica del tipo ("Nota", "Tabla"…) NO entra en el texto buscado: si
      // no, escribir "nota" devolvería todas las tarjetas de texto. Para eso está el
      // filtro de tipo (chip o `tipo:...`).
      var body = blockSearchText(b);
      var head = b.title || '';
      var m = searchMatchText(body, Q);
      if (!m) return;
      // Si la coincidencia cae en el título propio se muestra el título; si cae en el
      // contenido (o no se buscó texto), un recorte del contenido.
      var inHead = m.i >= 0 && !!head && m.i < head.length;
      var snip = inHead ? '' : searchSnippet(body, m.i, m.len);
      var chips = [typeMeta(b.type).label];
      if (!inHead && head) chips.push(head);
      if (b.color && CARD_COLOR_LABEL[b.color]) chips.push(CARD_COLOR_LABEL[b.color]);
      if (b.kanban) chips.push(kanbanLabel(b.kanban));
      if (b.important) chips.push('Importante');
      if (b.reminder && !b.reminder.done && typeof b.reminder.at === 'number') chips.push('⏰ ' + fmtShort(b.reminder.at));
      chips.push(fmtDate(b[field] || b.updatedAt));
      push({
        kind: 'block', icon: typeMeta(b.type).icon,
        title: inHead ? head : (snip || head || typeMeta(b.type).label),
        titleLen: head.length, path: notePath(n), ts: b[field] || b.updatedAt,
        noteId: b.noteId, blockId: b.id, chips: chips,
      }, body, m);
    });
  }
  if (can.book) {
    (data.notebooks || []).forEach(function (nb) {
      if (f.bookId && nb.id !== f.bookId) return;
      var ts = notebookTs(nb, field);
      if (!searchInRange(ts, range)) return;
      var hay = nb.name || '';
      var m = searchMatchText(hay, Q);
      if (!m) return;
      push({ kind: 'book', icon: 'book', title: (nb.emoji ? nb.emoji + ' ' : '') + nb.name, titleLen: hay.length, path: 'Libro', ts: ts, notebookId: nb.id, chips: [sectionsOf(nb.id).length + ' secciones'] }, hay, m);
    });
  }
  if (can.section) {
    (data.sections || []).forEach(function (s) {
      if (f.sectionId && s.id !== f.sectionId) return;
      if (f.bookId && s.notebookId !== f.bookId) return;
      var ts = sectionTs(s, field);
      if (!searchInRange(ts, range)) return;
      var hay = s.name || '';
      var m = searchMatchText(hay, Q);
      if (!m) return;
      var nb = getNotebook(s.notebookId);
      push({ kind: 'section', icon: 'panel', title: s.name, titleLen: hay.length, path: (nb ? nb.name + ' › ' : '') + 'Sección', ts: ts, sectionId: s.id, chips: [notesOf(s.id).length + ' notas'] }, hay, m);
    });
  }
  if (can.group) {
    (data.groups || []).forEach(function (g) {
      var n = getNote(g.noteId);
      if (!noteInScope(n, f)) return;
      if (!searchInRange(g.createdAt, range)) return;
      var hay = g.name || '';
      var m = searchMatchText(hay, Q);
      if (!m) return;
      push({ kind: 'group', icon: 'layout', title: g.name || 'Subgrupo', titleLen: hay.length, path: notePath(n), ts: g.createdAt || 0, noteId: g.noteId, groupId: g.id, chips: [(g.blockIds || []).length + ' tarjetas'] }, hay, m);
    });
  }
  if (can.link) {
    (data.links || []).forEach(function (l) {
      if (!l.label) return;
      var n = getNote(l.noteId);
      if (!noteInScope(n, f)) return;
      if (!searchInRange(l.createdAt, range)) return;
      var hay = l.label || '';
      var m = searchMatchText(hay, Q);
      if (!m) return;
      push({ kind: 'link', icon: 'link', title: l.label, titleLen: hay.length, path: notePath(n), ts: l.createdAt || 0, noteId: l.noteId, blockId: l.a, chips: ['Conexión'] }, hay, m);
    });
  }
  if (can.task) {
    (data.plan || []).forEach(function (t) {
      if (!taskPassesFlags(t, f)) return;
      var ts = field === 'createdAt' ? t.createdAt : (t.doneAt || t.createdAt);
      if (!searchInRange(ts, range)) return;
      var subs = (t.subs || []).map(function (s) { return s.text || ''; }).join('\n');
      var hay = (t.title || '') + '\n' + subs;
      var m = searchMatchText(hay, Q);
      if (!m) return;
      var chips = [t.done ? 'Completada' : 'Pendiente', t.day || ''];
      if (t.remindAt) chips.push('⏰ ' + fmtShort(t.remindAt));
      push({ kind: 'task', icon: 'todo', title: t.title || 'Tarea', titleLen: (t.title || '').length, path: 'Plan del día', ts: ts || 0, taskId: t.id, chips: chips.filter(Boolean) }, hay, m);
    });
  }

  var sort = f.sort;
  out.sort(function (a, b) {
    if (sort === 'recent') return (b.ts || 0) - (a.ts || 0);
    if (sort === 'old') return (a.ts || 0) - (b.ts || 0);
    if (sort === 'az') return String(a.title).localeCompare(String(b.title), 'es');
    if (sort === 'za') return String(b.title).localeCompare(String(a.title), 'es');
    return (b.score - a.score) || ((b.ts || 0) - (a.ts || 0));
  });
  return { results: out.slice(0, 300), query: Q, filters: f, total: out.length };
}

// ---------- Navegación al resultado ----------
function gotoSearchResult(r) {
  closeSearch();
  if (r.kind === 'task') {
    if (typeof openPlanner === 'function') openPlanner();
    return;
  }
  if (r.noteId && getNote(r.noteId)) {
    selectNote(r.noteId);
  } else if (r.sectionId) {
    ui.expS[r.sectionId] = true;
    var n = (data.notes || []).find(function (x) { return x.sectionId === r.sectionId; });
    if (n) { selectNote(n.id); } else { save(); renderAll(); }
  } else if (r.notebookId) {
    ui.expN[r.notebookId] = true;
    var sec = (data.sections || []).find(function (s) { return s.notebookId === r.notebookId; });
    var n2 = sec && (data.notes || []).find(function (x) { return x.sectionId === sec.id; });
    if (sec) ui.expS[sec.id] = true;
    if (n2) { selectNote(n2.id); } else { save(); renderAll(); }
  } else {
    save();
    renderAll();
  }
  if (r.groupId) {
    var g = (data.groups || []).find(function (x) { return x.id === r.groupId; });
    var first = g && (g.blockIds || [])[0];
    if (first) focusBlock(first);
  } else if (r.blockId) {
    focusBlock(r.blockId);
  }
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

// ---------- Búsquedas recientes ----------
function searchRecent() {
  if (!Array.isArray(ui.searchRecent)) ui.searchRecent = [];
  return ui.searchRecent;
}
function pushSearchRecent(q) {
  q = (q || '').trim();
  if (!q) return;
  var list = searchRecent().filter(function (x) { return x !== q; });
  list.unshift(q);
  ui.searchRecent = list.slice(0, 8);
  writeLS(LS_UI, JSON.stringify(ui));
}

// ---------- Panel ----------
var searchSel = 0;
function searchSelect(opts, val, onChange, cls) {
  var sel = h('select', { class: 'search-select' + (cls ? ' ' + cls : '') });
  opts.forEach(function (o) {
    var op = h('option', { value: o[0] }, o[1]);
    if (o[0] === val) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', function () { onChange(sel.value); });
  return sel;
}
function searchChip(label, on, onClick, ico, title) {
  return h('button', { class: 'search-chip' + (on ? ' on' : ''), type: 'button', title: title || label, onclick: onClick },
    ico ? icon(ico) : null, h('span', {}, label));
}
function searchGroup(label, nodes) {
  return h('div', { class: 'search-fgroup' },
    h('div', { class: 'search-flabel' }, label),
    h('div', { class: 'search-fchips' }, nodes));
}

function openSearch() {
  closeSearch();
  var f = searchFilters();
  var overlay = h('div', { class: 'overlay search-overlay', id: 'searchOverlay', onclick: function (e) { if (e.target === overlay) closeSearch(); } });
  var panel = h('div', { class: 'search-panel' });
  var input = h('input', { class: 'search-input', placeholder: 'Buscar en todo… (o tipo:code libro:"Mi libro" desde:hoy)', autocomplete: 'off', spellcheck: 'false' });
  var filtersBtn = h('button', { class: 'search-tool-btn', type: 'button' });
  var filtersWrap = h('div', { class: 'search-filters' });
  var summary = h('div', { class: 'search-summary' });
  var list = h('div', { class: 'search-results' });
  var res = { results: [], query: { terms: [], nots: [], mode: 'contains', ci: true }, filters: f, total: 0 };

  function run() {
    res = searchMatches(input.value, searchFilters());
    searchSel = 0;
  }
  function persist() {
    writeLS(LS_UI, JSON.stringify(ui));
  }
  function refresh() {
    run();
    paintFilters();
    paintSummary();
    paintResults();
  }

  // --- Panel de filtros desplegable ---
  function paintFilters() {
    var n = searchFiltersActive(f);
    filtersBtn.innerHTML = '';
    filtersBtn.className = 'search-tool-btn' + (f.open ? ' on' : '') + (n ? ' has' : '');
    filtersBtn.appendChild(icon('filter'));
    filtersBtn.appendChild(h('span', {}, 'Filtros'));
    if (n) filtersBtn.appendChild(h('span', { class: 'search-tool-count' }, String(n)));
    filtersWrap.innerHTML = '';
    filtersWrap.classList.toggle('open', !!f.open);
    if (!f.open) return;

    // Qué buscar
    filtersWrap.appendChild(searchGroup('Qué buscar', SEARCH_KINDS.map(function (k) {
      return searchChip(k.label, f.kinds.indexOf(k.key) >= 0, function () { searchToggle(f.kinds, k.key); persist(); refresh(); }, k.icon);
    })));

    // Tipo de tarjeta
    filtersWrap.appendChild(searchGroup('Tipo de tarjeta', Object.keys(TYPE_META).map(function (t) {
      return searchChip(TYPE_META[t].label, f.types.indexOf(t) >= 0, function () { searchToggle(f.types, t); persist(); refresh(); }, TYPE_META[t].icon);
    })));

    // Ubicación: libro › sección › nota › subgrupo
    var books = [['', 'Todos los libros']].concat(notebooksAll().map(function (nb) { return [nb.id, (nb.emoji ? nb.emoji + ' ' : '') + nb.name]; }));
    var secList = (data.sections || []).filter(function (s) { return !f.bookId || s.notebookId === f.bookId; }).sort(byOrder);
    var secs = [['', 'Todas las secciones']].concat(secList.map(function (s) { return [s.id, s.name]; }));
    var noteList = (data.notes || []).filter(function (nn) {
      if (f.sectionId) return nn.sectionId === f.sectionId;
      if (f.bookId) { var s2 = getSection(nn.sectionId); return s2 && s2.notebookId === f.bookId; }
      return true;
    });
    var notes = [['', 'Todas las notas']].concat(noteList.map(function (nn) { return [nn.id, nn.title || 'Nota sin título']; }));
    var grpList = (data.groups || []).filter(function (g) { return !f.noteId || g.noteId === f.noteId; });
    var grps = [['', 'Todos los subgrupos']].concat(grpList.map(function (g) { return [g.id, g.name || 'Subgrupo']; }));
    filtersWrap.appendChild(searchGroup('Dónde', [
      searchSelect(books, f.bookId, function (v) { f.bookId = v; f.sectionId = ''; f.noteId = ''; persist(); refresh(); }),
      searchSelect(secs, f.sectionId, function (v) { f.sectionId = v; f.noteId = ''; persist(); refresh(); }),
      searchSelect(notes, f.noteId, function (v) { f.noteId = v; persist(); refresh(); }),
      searchSelect(grps, f.groupId, function (v) { f.groupId = v; persist(); refresh(); }),
      searchChip('Solo esta nota', f.noteId === ui.currentNoteId && !!f.noteId, function () {
        f.noteId = (f.noteId === ui.currentNoteId) ? '' : (ui.currentNoteId || '');
        persist(); refresh();
      }, 'target'),
    ]));

    // Fecha
    var dateNodes = [
      searchSelect([['updatedAt', 'Modificado'], ['createdAt', 'Creado']], f.dateField, function (v) { f.dateField = v; persist(); refresh(); }),
      searchSelect(SEARCH_DATE_PRESETS, f.datePreset, function (v) { f.datePreset = v; persist(); refresh(); }),
    ];
    if (f.datePreset === 'custom') {
      var from = h('input', { class: 'search-date', type: 'date', value: f.from || '' });
      from.addEventListener('change', function () { f.from = from.value; persist(); refresh(); });
      var to = h('input', { class: 'search-date', type: 'date', value: f.to || '' });
      to.addEventListener('change', function () { f.to = to.value; persist(); refresh(); });
      dateNodes.push(h('span', { class: 'search-flabel-in' }, 'desde'), from, h('span', { class: 'search-flabel-in' }, 'hasta'), to);
    }
    filtersWrap.appendChild(searchGroup('Fecha', dateNodes));

    // Color, tono y kanban
    filtersWrap.appendChild(searchGroup('Color', CARD_COLORS.filter(function (c) { return c[0]; }).map(function (c) {
      var chip = searchChip(c[1], f.colors.indexOf(c[0]) >= 0, function () { searchToggle(f.colors, c[0]); persist(); refresh(); });
      chip.classList.add('search-chip-c', 'card-c-' + c[0]);
      return chip;
    })));
    filtersWrap.appendChild(searchGroup('Tono', NOTE_RANKS.map(function (r) {
      return searchChip(r.label, f.ranks.indexOf(r.key) >= 0, function () { searchToggle(f.ranks, r.key); persist(); refresh(); }, r.icon, r.hint);
    })));
    filtersWrap.appendChild(searchGroup('Kanban', KAN.map(function (k) {
      return searchChip(k[1], f.kanban.indexOf(k[0]) >= 0, function () { searchToggle(f.kanban, k[0]); persist(); refresh(); }, 'board');
    })));

    // Estado
    filtersWrap.appendChild(searchGroup('Estado', SEARCH_FLAGS.map(function (fl) {
      return searchChip(fl.label, f.flags.indexOf(fl.key) >= 0, function () { searchToggle(f.flags, fl.key); persist(); refresh(); }, fl.icon);
    })));

    // Coincidencia y orden
    filtersWrap.appendChild(searchGroup('Coincidencia', [
      searchSelect(SEARCH_MODES, f.mode, function (v) { f.mode = v; persist(); refresh(); }),
      searchChip('Aa distingue mayúsculas', f.caseSensitive, function () { f.caseSensitive = !f.caseSensitive; persist(); refresh(); }, 'type'),
      searchSelect(SEARCH_SORTS.map(function (s) { return [s[0], 'Ordenar: ' + s[1]]; }), f.sort, function (v) { f.sort = v; persist(); refresh(); }),
      h('button', {
        class: 'search-chip search-clear', type: 'button', onclick: function () {
          var keep = { open: true };
          ui.search = defaultSearchFilters();
          ui.search.open = keep.open;
          f = searchFilters();
          persist();
          refresh();
        },
      }, icon('eraser'), h('span', {}, 'Limpiar filtros')),
    ]));
  }

  // --- Resumen: recuento total y por tipo (los recuentos filtran al pulsarlos) ---
  function paintSummary() {
    summary.innerHTML = '';
    var q = input.value.trim();
    if (!res.results.length && !q && !searchFiltersActive(f)) return;
    var counts = {};
    res.results.forEach(function (r) { counts[r.kind] = (counts[r.kind] || 0) + 1; });
    var total = res.total || res.results.length;
    summary.appendChild(h('span', { class: 'search-count' },
      total + (total === 1 ? ' resultado' : ' resultados') + (total > res.results.length ? ' (se muestran ' + res.results.length + ')' : '')));
    SEARCH_KINDS.forEach(function (k) {
      if (!counts[k.key]) return;
      summary.appendChild(searchChip(k.label + ' ' + counts[k.key], f.kinds.indexOf(k.key) >= 0, function () {
        searchToggle(f.kinds, k.key); persist(); refresh();
      }, k.icon));
    });
    if (res.query.bad && res.query.bad.length) {
      summary.appendChild(h('span', { class: 'search-warn', title: 'No se reconoció ese valor; se ignora' }, 'Sin efecto: ' + res.query.bad.join(' ')));
    }
  }

  // --- Lista de resultados ---
  function paintResults() {
    list.innerHTML = '';
    var q = input.value.trim();
    if (!q && !searchFiltersActive(f)) {
      var recents = searchRecent();
      if (recents.length) {
        var box = h('div', { class: 'search-recent' }, h('div', { class: 'search-flabel' }, 'Búsquedas recientes'));
        recents.forEach(function (r) {
          box.appendChild(searchChip(r, false, function () { input.value = r; refresh(); input.focus(); }, 'clock'));
        });
        list.appendChild(box);
      }
      list.appendChild(h('div', { class: 'search-empty' },
        h('div', {}, 'Escribe para buscar en notas, tarjetas, libros, subgrupos y tareas.'),
        h('div', { class: 'search-hint' }, 'También puedes acotar con Filtros, o teclear ',
          h('code', {}, 'tipo:python'), ' ', h('code', {}, 'libro:"Ideas"'), ' ', h('code', {}, 'desde:2026-01-01'),
          ' ', h('code', {}, 'tiene:recordatorio'), ' ', h('code', {}, '-excluir'), '.')));
      return;
    }
    if (!res.results.length) {
      list.appendChild(h('div', { class: 'search-empty' },
        h('div', {}, q ? 'Sin resultados para “' + q + '”.' : 'Ningún elemento cumple esos filtros.'),
        h('div', { class: 'search-hint' }, 'Prueba a quitar filtros o a buscar con menos palabras.')));
      return;
    }
    res.results.forEach(function (r, i) {
      var titleEl = h('span', { class: 'search-row-title' });
      hlInto(titleEl, r.title, res.query);
      var meta = h('span', { class: 'search-row-meta' });
      (r.chips || []).forEach(function (c) { if (c) meta.appendChild(h('span', { class: 'search-badge' }, c)); });
      var row = h('button', { class: 'search-row' + (i === searchSel ? ' sel' : ''), type: 'button', onclick: function () { pushSearchRecent(input.value); gotoSearchResult(r); } },
        h('span', { class: 'search-row-icon' }, icon(r.icon)),
        h('span', { class: 'search-row-main' },
          titleEl,
          h('span', { class: 'search-row-path' }, h('span', { class: 'search-kind' }, searchKindMeta(r.kind).label), r.path || ''),
          meta.childNodes.length ? meta : null
        )
      );
      row.addEventListener('mousemove', function () {
        if (searchSel !== i) { searchSel = i; markSel(); }
      });
      list.appendChild(row);
    });
    markSel();
  }
  function markSel() {
    Array.prototype.forEach.call(list.querySelectorAll('.search-row'), function (el, i) {
      el.classList.toggle('sel', i === searchSel);
    });
    var sel = list.querySelectorAll('.search-row')[searchSel];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  var inputT;
  input.addEventListener('input', function () {
    clearTimeout(inputT);
    inputT = setTimeout(function () { run(); paintSummary(); paintResults(); }, 90);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (searchSel < res.results.length - 1) { searchSel++; markSel(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (searchSel > 0) { searchSel--; markSel(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (res.results[searchSel]) { pushSearchRecent(input.value); gotoSearchResult(res.results[searchSel]); } }
  });
  filtersBtn.addEventListener('click', function () { f.open = !f.open; persist(); paintFilters(); });

  panel.appendChild(h('div', { class: 'search-bar' }, icon('search'), input, filtersBtn));
  panel.appendChild(filtersWrap);
  panel.appendChild(summary);
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseSearch);
  refresh();
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
    [MOD + ' + K', 'Búsqueda global con filtros'],
    [MOD + ' + 0', 'Centrar la vista · ' + MOD + ' + 1 ajustar todo'],
    ['?', 'Este panel de atajos'],
    ['Esc', 'Cerrar paneles / deseleccionar'],
    ['F2', 'Renombrar la nota actual'],
  ]],
  ['Buscador (' + MOD + ' + K)', [
    ['↑ ↓ · Enter', 'Moverse por los resultados y abrirlos'],
    ['tipo:code', 'Solo tarjetas de ese tipo'],
    ['libro:"Ideas"', 'Acotar a un libro · seccion: · nota: · grupo:'],
    ['desde:hoy · hasta:2026-08-31', 'Rango de fechas'],
    ['tiene:recordatorio', 'Estado: importante, imagen, pendiente, vacías…'],
    ['-palabra', 'Excluir resultados que la contengan'],
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
