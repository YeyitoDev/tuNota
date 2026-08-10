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
function planTasksIn(status) {
  return planVisibleTasks()
    .filter(function (t) { return planStatusOf(t) === status; })
    .sort(function (a, b) { return planOrderOf(a) - planOrderOf(b); });
}
function planSubsDone(t) {
  var subs = t.subs || [];
  return subs.filter(function (s) { return s.done; }).length;
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
  };
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
  if (was !== status) logChange('Tarea a ' + kanbanLabel(status), t.title);
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
// Marcar el primer paso arranca la tarea; marcar el último ofrece cerrarla.
// Es el único automatismo, y es el que de verdad ahorra clics.
function planSubToggle(owner, s, checked) {
  s.done = !!checked;
  s.at = s.done ? now() : null;
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
