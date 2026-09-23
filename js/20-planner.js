/* tuNota — Modelo de las tareas del día: qué tengo que hacer, en qué estado está y qué pasos
   (subtareas) faltan para completarlo. Los datos viven en data.plan y son los MISMOS que pinta
   el tablero Kanban del panel de Tareas (js/22-tareas.js): una tarea es una sola cosa, se vea
   en la lista del día o en una columna. Aquí viven los datos y las operaciones; la interfaz
   está en 22-tareas.js. Cargado en orden desde index.html. */
'use strict';

function planTodayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function planFmtTime(ms) {
  var d = new Date(ms);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
// Tareas visibles: las de hoy + las pendientes arrastradas de días anteriores.
function planVisibleTasks() {
  var today = planTodayStr();
  return (data.plan || []).filter(function (t) { return t.day === today || !t.done; });
}
// Todas, incluidas las terminadas otros días: el historial ("Completadas", "Semana", rangos).
function planAllTasks() { return (data.plan || []).slice(); }
function planTasks() { if (!Array.isArray(data.plan)) data.plan = []; return data.plan; }
function planTaskById(id) {
  var all = planTasks();
  for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
  return null;
}
function planStatusOf(t) {
  if (t.status === 'todo' || t.status === 'doing' || t.status === 'done') return t.status;
  return t.done ? 'done' : 'todo';
}
function planOrderOf(t) { return (typeof t.order === 'number') ? t.order : (t.createdAt || 0); }
// Tareas del día en una columna del tablero, ya ordenadas.
function planTasksIn(status, all) {
  return (all ? planAllTasks() : planVisibleTasks())
    .filter(function (t) { return planStatusOf(t) === status; })
    .sort(function (a, b) { return planOrderOf(a) - planOrderOf(b); });
}
function planSubsDone(t) {
  var subs = t.subs || [];
  return subs.filter(function (s) { return s.done; }).length;
}

// ---------- Prioridad ----------
// Es distinta del "tipo" (Relevante/Idea/Importante/Crucial), que describe la naturaleza de la
// nota: la prioridad dice por dónde empezar. Vale igual para una tarea del día que para una
// tarjeta del lienzo, y "sin prioridad" es un estado legítimo (no todo tiene que ordenarse).
var PRIOS = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
function planPriorityOf(x) {
  var p = x && x.priority;
  for (var i = 0; i < PRIOS.length; i++) { if (PRIOS[i][0] === p) return p; }
  return '';
}
function planPriorityLabel(p) {
  for (var i = 0; i < PRIOS.length; i++) { if (PRIOS[i][0] === p) return PRIOS[i][1]; }
  return 'Sin prioridad';
}
// Orden de recorrido del chip: sin prioridad → alta → media → baja → sin prioridad.
function planCyclePriority(x) {
  var order = ['', 'alta', 'media', 'baja'];
  var next = order[(order.indexOf(planPriorityOf(x)) + 1) % order.length];
  if (next) x.priority = next; else delete x.priority;
  if (x.noteId && !x.day) touchNote(x.noteId); // las tarjetas del lienzo tocan su nota
  logChange('Prioridad: ' + planPriorityLabel(next), x.title || (x.content && x.content.text) || '');
  save();
  return next;
}
function planPriorityRank(x) {
  var p = planPriorityOf(x);
  return p === 'alta' ? 0 : p === 'media' ? 1 : p === 'baja' ? 2 : 3; // sin prioridad, al final
}

// ---------- Fechas ----------
function planDayOfMs(ms) {
  var d = new Date(ms || now());
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
// Lunes de la semana en curso (la semana laboral empieza el lunes, no el domingo).
function planWeekStartStr() {
  var d = new Date();
  var dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return planDayOfMs(d.getTime());
}

// ---------- Seguimiento: vencimiento, libro, bloqueo, descripción e historial ----------
// Valen igual para una tarea del día (x = t) que para una tarjeta del lienzo (x = b).
function planDueOf(x) {
  return (x && typeof x.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.due)) ? x.due : '';
}
// Vencida = tiene fecha límite, ya pasó y sigue abierta. (Antes "atrasada" era solo "creada
// antes de hoy", que no dice nada de si llegas tarde.)
function planIsOverdue(x, closed) {
  var d = planDueOf(x);
  return !!d && !closed && d < planTodayStr();
}
function planDueLabel(due) {
  if (!due) return '';
  var hoy = planTodayStr();
  var dt = new Date(due + 'T12:00:00');
  var diff = Math.round((dt.getTime() - new Date(hoy + 'T12:00:00').getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1 && diff < 7) return dt.toLocaleDateString('es-PE', { weekday: 'short' });
  return dt.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}
function planTouch(x) {
  if (x && x.noteId && !x.day && typeof touchNote === 'function') touchNote(x.noteId); // tarjeta del lienzo
}
// Historial propio de cada tarea: cambios de estado y hechos relevantes, con su hora.
// { ts, s: 'doing' } para un cambio de estado; { ts, m: 'texto' } para lo demás.
function planHist(x, ev) {
  if (!Array.isArray(x.hist)) x.hist = [];
  ev.ts = now();
  x.hist.push(ev);
  if (x.hist.length > 80) x.hist.splice(0, x.hist.length - 80);
}
function planSetDue(x, due) {
  var v = /^\d{4}-\d{2}-\d{2}$/.test(due || '') ? due : '';
  if (v === planDueOf(x)) return;
  if (v) x.due = v; else delete x.due;
  planHist(x, { m: v ? 'Vence el ' + v : 'Sin fecha límite' });
  planTouch(x);
  logChange(v ? 'Fecha límite: ' + v : 'Fecha límite quitada', x.title || reminderText(x));
  save();
}
function planSetBlocked(x, on, why) {
  x.blocked = !!on;
  if (x.blocked) x.blockedWhy = (why || '').trim(); else delete x.blockedWhy;
  planHist(x, { m: x.blocked ? 'En espera' + (x.blockedWhy ? ': ' + x.blockedWhy : '') : 'Desbloqueada' });
  planTouch(x);
  logChange(x.blocked ? 'Bloqueado' : 'Desbloqueado', x.title || reminderText(x));
  save();
}
function planSetDesc(x, text) {
  var v = (text || '').replace(/\s+$/, '');
  if (v === (x.desc || '')) return;
  if (v) x.desc = v; else delete x.desc;
  planTouch(x);
  save();
}
// El libro de una tarea: el que le asignaste o, si no, el de la hoja a la que está anidada.
// Sin ninguno, la tarea está en la Bandeja.
function planBookOf(t) {
  if (t.bookId && getNotebook(t.bookId)) return t.bookId;
  var n = t.noteId && getNote(t.noteId);
  var s = n && getSection(n.sectionId);
  return s ? s.notebookId : '';
}
function planSetBook(t, nbId) {
  if (nbId && getNotebook(nbId)) t.bookId = nbId; else delete t.bookId;
  var nb = nbId && getNotebook(nbId);
  planHist(t, { m: 'Libro: ' + (nb ? nb.name : 'Bandeja') });
  save();
}
// Minutos que estuvo "En progreso", sumando cada tramo (el abierto cuenta hasta ahora).
function planDoingMs(x) {
  var total = 0, since = null;
  (x.hist || []).forEach(function (e) {
    if (!e.s) return;
    if (e.s === 'doing' && since === null) since = e.ts;
    else if (e.s !== 'doing' && since !== null) { total += e.ts - since; since = null; }
  });
  if (since !== null) total += now() - since;
  return total;
}
function planFmtDur(ms) {
  var m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  var hh = Math.floor(m / 60), mm = m % 60;
  if (hh < 24) return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  var d = Math.floor(hh / 24);
  return d + ' d ' + (hh % 24) + ' h';
}

// ---------- Operaciones sobre una tarea ----------
// Crear. Nace en "Por hacer" y al final de esa columna.
function planAddTask(title, opts) {
  var v = (title || '').trim();
  if (!v) return null;
  opts = opts || {};
  var t = {
    id: uid(), title: v, day: planTodayStr(),
    status: opts.status || 'todo', done: opts.status === 'done',
    doneAt: null, createdAt: now(), order: now(), subs: [],
    noteId: opts.noteId || null,
    hist: [{ ts: now(), s: opts.status || 'todo' }],
  };
  if (opts.bookId && getNotebook(opts.bookId)) t.bookId = opts.bookId;
  if (planDueOf(opts)) t.due = opts.due;
  planTasks().push(t);
  logChange('Tarea del día añadida', v);
  save();
  return t;
}
// Aplicar el estado. done es siempre el espejo de status === 'done': una sola verdad.
function planApplyStatus(t, status, ord) {
  var was = planStatusOf(t);
  t.status = status;
  if (typeof ord === 'number') t.order = ord;
  t.done = status === 'done';
  t.doneAt = t.done ? now() : null;
  if (t.done) t.day = planTodayStr(); // se completó HOY (aunque viniera arrastrada de otro día)
  if (t.done && t.blocked) { t.blocked = false; delete t.blockedWhy; } // terminada ya no espera nada
  if (was !== status) { planHist(t, { s: status }); logChange('Tarea a ' + kanbanLabel(status), t.title); }
  save();
  return t;
}
// Cambiar de columna colocándola entre sus vecinas (índice fraccional, como el tablero).
function planSetStatus(t, status, beforeId) {
  var col = planTasksIn(status).filter(function (x) { return x.id !== t.id; });
  var idx = beforeId ? col.map(function (x) { return x.id; }).indexOf(beforeId) : col.length;
  if (idx < 0) idx = col.length;
  var prev = col[idx - 1], next = col[idx];
  var lo = prev ? planOrderOf(prev) : (next ? planOrderOf(next) - 2 : now());
  var hi = next ? planOrderOf(next) : (prev ? planOrderOf(prev) + 2 : now());
  return planApplyStatus(t, status, (lo + hi) / 2);
}
// La casilla de "completada" y la columna "Hecho" son lo mismo.
function planToggleDone(t, value) {
  var v = (typeof value === 'boolean') ? value : !t.done;
  planSetStatus(t, v ? 'done' : 'todo');
  logChange(v ? 'Tarea completada' : 'Tarea reabierta', t.title);
  save();
}
function planDeleteTask(t) {
  data.plan = planTasks().filter(function (x) { return x.id !== t.id; });
  logChange('Tarea eliminada', t.title);
  save();
}

// ---------- Subtareas (los pasos para completar la tarea) ----------
// Misma forma para una tarea del día y para una tarjeta del lienzo: { id, text, done, at }.
function planSubAdd(owner, text) {
  var v = (text || '').trim();
  if (!v) return null;
  if (!Array.isArray(owner.subs)) owner.subs = [];
  var s = { id: uid(), text: v, done: false, at: null };
  owner.subs.push(s);
  save();
  return s;
}
function planSubSetText(owner, s, text) {
  var v = (text || '').trim();
  if (!v || v === s.text) return;
  s.text = v;
  save();
}
function planSubRemove(owner, s) {
  owner.subs = (owner.subs || []).filter(function (x) { return x.id !== s.id; });
  save();
}
// Detalle de un paso: qué se hizo, un enlace, lo que falta… (texto libre, opcional).
function planSubSetNote(owner, s, text) {
  var v = (text || '').replace(/\s+$/, '');
  if (v === (s.note || '')) return;
  if (v) s.note = v; else delete s.note;
  planTouch(owner);
  save();
}
// Subir (-1) o bajar (+1) un paso en la lista.
function planSubMove(owner, s, dir) {
  var subs = owner.subs || [];
  var i = subs.indexOf(s), j = i + dir;
  if (i < 0 || j < 0 || j >= subs.length) return;
  subs.splice(i, 1);
  subs.splice(j, 0, s);
  planTouch(owner);
  save();
}
// Marcar el primer paso arranca la tarea; marcar el último ofrece cerrarla.
// Es el único automatismo, y es el que de verdad ahorra clics.
function planSubToggle(owner, s, checked) {
  s.done = !!checked;
  s.at = s.done ? now() : null;
  planHist(owner, { m: (s.done ? 'Paso hecho: ' : 'Paso reabierto: ') + s.text });
  var subs = owner.subs || [];
  var doneN = subs.filter(function (x) { return x.done; }).length;
  var isTask = !owner.type; // las tareas del día no tienen `type`; los bloques del lienzo sí
  if (isTask) {
    if (s.done && doneN === 1 && planStatusOf(owner) === 'todo') planSetStatus(owner, 'doing');
    else if (!s.done && planStatusOf(owner) === 'done') planSetStatus(owner, 'doing');
  }
  save();
  if (s.done && doneN === subs.length && subs.length > 1 && !(isTask && owner.done)) {
    var label = isTask ? owner.title : reminderText(owner);
    toastAction('Todos los pasos de «' + label + '» están hechos.', 'Darla por completada', function () {
      if (isTask) planSetStatus(owner, 'done');
      else setKanban(owner, 'done');
      if (typeof refreshTareas === 'function') refreshTareas(true);
    });
  }
}

// ---------- Bandeja y hoja de tareas ----------
// La Bandeja es un libro normal marcado con `inbox`: ahí cae lo que aún no tiene sitio.
// Se crea la primera vez que hace falta, nunca por adelantado.
function inboxBook() {
  for (var i = 0; i < data.notebooks.length; i++) { if (data.notebooks[i].inbox) return data.notebooks[i]; }
  return null;
}
function ensureInbox() {
  var nb = inboxBook();
  if (!nb) {
    nb = { id: uid(), name: 'Bandeja', emoji: '📥', inbox: true, order: -1, createdAt: now() };
    data.notebooks.push(nb);
    logChange('Libro creado', 'Bandeja');
  }
  if (!sectionsOf(nb.id).length) data.sections.push({ id: uid(), notebookId: nb.id, name: 'Entrada', order: 0 });
  return nb;
}
// Hoja donde caen las tarjetas creadas desde el tablero: UNA por libro («✅ Tareas»), no una
// hoja nueva por tarjeta (eso llenaba el árbol de notas sueltas).
function tasksHostNote(bookId) {
  var nb = (bookId && getNotebook(bookId)) || ensureInbox();
  var secs = sectionsOf(nb.id);
  var found = null;
  secs.forEach(function (s) { notesOf(s.id).forEach(function (n) { if (!found && n.tasksHost) found = n; }); });
  if (found) return found.id;
  var sec = secs[0];
  if (!sec) { sec = { id: uid(), notebookId: nb.id, name: 'General', order: 0 }; data.sections.push(sec); }
  var ts = now();
  var note = { id: uid(), sectionId: sec.id, title: '✅ Tareas', tasksHost: true, createdAt: ts, updatedAt: ts };
  data.notes.push(note);
  return note.id;
}
// Siguiente hueco libre en una hoja: debajo de lo que ya hay, en la columna izquierda.
function nextFreeSpot(noteId) {
  var y = 36;
  blocksOf(noteId).forEach(function (b) { if (b.x < 400) y = Math.max(y, (b.y || 0) + (b.height || 120) + 24); });
  return { x: 36, y: y };
}

// ---------- Pickers: anidar a una hoja y recordatorio en X minutos ----------
function openPlanNotePicker(t, anchor, rerender) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop move-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('link'), 'Anidar la tarea a una hoja'));
  if (t.noteId) {
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); t.noteId = null; save(); rerender(); } }, icon('x'), h('span', {}, 'Quitar el vínculo')));
    pop.appendChild(h('div', { class: 'cm-sep' }));
  }
  notebooksAll().forEach(function (nb) {
    var secs = sectionsOf(nb.id);
    var any = secs.some(function (s) { return notesOf(s.id).length; });
    if (!any) return;
    pop.appendChild(h('div', { class: 'move-book' }, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
    secs.forEach(function (s) {
      notesOf(s.id).forEach(function (n) {
        pop.appendChild(h('button', { class: 'cm-item' + (t.noteId === n.id ? ' move-here' : ''), title: s.name, onclick: function () {
          closeTopbarMenu(); t.noteId = n.id; save(); rerender();
        } }, icon('file'), h('span', {}, (n.title || 'Nota') + (t.noteId === n.id ? ' (actual)' : ''))));
      });
    });
  });
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 260);
}
function openPlanRemindPicker(t, anchor, rerender) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('bell'), 'Recordatorio en…'));
  var setIn = function (mins) {
    t.remindAt = now() + mins * 60000;
    logChange('Recordatorio de tarea', t.title + ' en ' + mins + ' min');
    save(); closeTopbarMenu(); rerender();
    toast('⏰ Te aviso en ' + mins + ' min (a las ' + planFmtTime(t.remindAt) + ').', 'ok');
  };
  var row = h('div', { class: 'cm-quick' });
  [5, 10, 15, 30, 60].forEach(function (m) {
    row.appendChild(h('button', { class: 'cm-chip', onclick: function (e) { e.stopPropagation(); setIn(m); } }, m + ' min'));
  });
  pop.appendChild(row);
  var custom = h('input', { class: 'planner-inp planner-min-inp', type: 'number', min: '1', max: '1440', placeholder: 'X minutos…' });
  custom.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var v = parseInt(custom.value, 10); if (v > 0) setIn(v); } });
  pop.appendChild(h('div', { class: 'cm-quick planner-min-row' }, custom,
    h('button', { class: 'cm-chip', onclick: function (e) { e.stopPropagation(); var v = parseInt(custom.value, 10); if (v > 0) setIn(v); } }, 'OK')));
  if (t.remindAt && t.remindAt > now()) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { t.remindAt = null; save(); closeTopbarMenu(); rerender(); } }, icon('x'), h('span', {}, 'Quitar el recordatorio (' + planFmtTime(t.remindAt) + ')')));
  }
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 230);
  custom.focus();
}

// El "Plan del día" es la vista Lista del panel de Tareas.
function openPlanner() { openTareas('lista'); }
function closePlanner() { closeTareas(); }
