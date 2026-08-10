/* tuNota — Panel de Tareas: el plan del día y el tablero Kanban son la MISMA cosa vista de dos
   maneras. La vista Lista responde a "¿qué tengo hoy y cuánto llevo?"; la vista Tablero, a
   "¿en qué estado está cada cosa?". Ambas trabajan sobre los mismos datos:
     · tareas del día  → data.plan   (js/20-planner.js tiene el modelo)
     · tarjetas del lienzo → bloques con b.kanban (js/11-features.js)
   Las dos pueden desglosarse en pasos (subtareas) con la misma forma { id, text, done, at }.
   Cargado en orden desde index.html. */
'use strict';

var tareasOpen = {};   // qué tarjetas tienen los pasos desplegados (interfaz, no se persiste)
var dragTask = null;   // { src: 'task' | 'block', id }

function tareasView() { return ui.tasksView === 'tablero' ? 'tablero' : 'lista'; }
function tareasSrcFilter() {
  return (ui.tasksSrc === 'task' || ui.tasksSrc === 'block') ? ui.tasksSrc : 'all';
}
var DATE_FILTERS = [['all', 'Todas'], ['today', 'Hoy'], ['week', 'Semana'], ['late', 'Atrasadas'], ['range', 'Rango…']];
function tareasDateFilter() {
  for (var i = 0; i < DATE_FILTERS.length; i++) { if (DATE_FILTERS[i][0] === ui.tasksDate) return ui.tasksDate; }
  return 'all';
}
function tareasPrioFilter() {
  return planPriorityOf({ priority: ui.tasksPrio }) || 'all';
}
function tareasSort() { return ui.tasksSort === 'prio' ? 'prio' : 'manual'; }
function closeTareas() { var o = document.getElementById('tareasOverlay'); if (o) o.remove(); }
function tareasIsOpen() { return !!document.getElementById('tareasOverlay'); }

// ---------- Adaptador: una sola lista de tarjetas venga de donde venga ----------
// El filtro por libro se aplica a las tarjetas del lienzo por su nota, y a las tareas del día
// por la hoja a la que estén anidadas (una tarea suelta no pertenece a ningún libro).
function tareaInBook(t) {
  if (!ui.kanbanBook) return true;
  if (!t.noteId) return false;
  var n = getNote(t.noteId); if (!n) return false;
  var s = getSection(n.sectionId);
  return !!(s && s.notebookId === ui.kanbanBook);
}
// Todas las tarjetas de una columna, sin los filtros del panel (la usa también el móvil).
function boardAll(status) {
  var out = [];
  planTasksIn(status).forEach(function (t) { out.push({ src: 'task', id: t.id, ref: t, order: planOrderOf(t) }); });
  (data.blocks || []).forEach(function (b) {
    if (b.kanban === status) out.push({ src: 'block', id: b.id, ref: b, order: kanbanOrderOf(b) });
  });
  return out.sort(function (a, b) { return a.order - b.order; });
}
// La fecha de una tarjeta: el día al que pertenece la tarea, o el día en que la tarjeta del
// lienzo entró al tablero (y si nunca entró, cuándo se creó).
function itemDay(it) {
  if (it.src === 'task') return it.ref.day || planDayOfMs(it.ref.createdAt);
  return planDayOfMs(it.ref.kanbanAt || it.ref.createdAt);
}
function itemIsDone(it) { return it.src === 'task' ? !!it.ref.done : it.ref.kanban === 'done'; }
function itemPassesDate(it) {
  var f = tareasDateFilter();
  if (f === 'all') return true;
  var day = itemDay(it), hoy = planTodayStr();
  if (f === 'today') return day === hoy;
  if (f === 'week') return day >= planWeekStartStr() && day <= hoy;
  if (f === 'late') return day < hoy && !itemIsDone(it); // pendiente y de un día pasado
  var desde = ui.tasksFrom || '', hasta = ui.tasksTo || '';
  if (desde && day < desde) return false;
  if (hasta && day > hasta) return false;
  return true;
}
function boardItems(status) {
  var src = tareasSrcFilter();
  var prio = tareasPrioFilter();
  var out = boardAll(status).filter(function (it) {
    if (prio !== 'all' && planPriorityOf(it.ref) !== prio) return false;
    if (!itemPassesDate(it)) return false;
    if (it.src === 'task') {
      if (src === 'block') return false;
      if (ui.kanbanBlockedOnly) return false; // "bloqueada" es un estado de las tarjetas del lienzo
      return tareaInBook(it.ref);
    }
    if (src === 'task') return false;
    if (ui.kanbanBook && notebookIdOfBlock(it.ref) !== ui.kanbanBook) return false;
    if (ui.kanbanBlockedOnly && !it.ref.blocked) return false;
    return true;
  });
  // El orden manual (arrastre) manda salvo que pidas ver primero lo más prioritario.
  if (tareasSort() === 'prio') {
    out.sort(function (a, b) { return planPriorityRank(a.ref) - planPriorityRank(b.ref) || a.order - b.order; });
  }
  return out;
}
function itemTitle(it) {
  if (it.src === 'task') return it.ref.title;
  return (it.ref.content && it.ref.content.text) ? it.ref.content.text : typeMeta(it.ref.type).label;
}
function itemSubs(it) { return it.ref.subs || []; }

// Colocar una tarjeta en una columna, entre sus vecinas. Las dos escalas de orden
// (t.order y b.kanbanOrder) nacen de now(), así que son comparables entre sí.
function boardPlace(src, id, status, beforeId) {
  var col = boardItems(status).filter(function (x) { return x.id !== id; });
  var idx = beforeId ? col.map(function (x) { return x.id; }).indexOf(beforeId) : col.length;
  if (idx < 0) idx = col.length;
  var prev = col[idx - 1], next = col[idx];
  var lo = prev ? prev.order : (next ? next.order - 2 : now());
  var hi = next ? next.order : (prev ? prev.order + 2 : now());
  var ord = (lo + hi) / 2;
  if (src === 'task') {
    var t = planTaskById(id); if (!t) return;
    planApplyStatus(t, status, ord);
  } else {
    var b = getBlockById(id); if (!b) return;
    var was = b.kanban;
    b.kanban = status;
    if (!b.kanbanAt) b.kanbanAt = now();
    b.kanbanOrder = ord;
    touchNote(b.noteId);
    save();
    renderCanvas();
    if (status === 'todo' && was !== 'todo' && !(b.reminder && !b.reminder.done)) {
      toastAction('«' + reminderText(b) + '» está en Pendiente. ¿Le pongo un recordatorio?', 'Crear recordatorio', function (btn) {
        openReminderPicker(b, btn);
      });
    }
  }
  renderTareas();
}

// ---------- Panel ----------
function openTareas(view) {
  closeTareas();
  planTasks(); // sesiones existentes: normalizeData puede no haber corrido
  if (view === 'lista' || view === 'tablero') ui.tasksView = view;
  var overlay = h('div', { class: 'overlay tareas-overlay', id: 'tareasOverlay', onmousedown: function (e) { if (e.target === overlay) closeTareas(); } });
  var panel = h('div', { class: 'tareas-panel v-' + tareasView() });

  // Conmutador de vista: los mismos datos, dos preguntas distintas.
  var views = h('div', { class: 'tareas-views' });
  [['lista', 'todo', 'Lista', 'Qué tengo hoy y cuánto llevo'],
   ['tablero', 'board', 'Tablero', 'En qué estado está cada cosa']].forEach(function (v) {
    views.appendChild(h('button', {
      class: 'tareas-view-btn' + (tareasView() === v[0] ? ' on' : ''), title: v[3],
      onclick: function () { ui.tasksView = v[0]; save(); openTareas(v[0]); },
    }, icon(v[1]), v[2]));
  });

  var sel = h('select', { class: 'kanban-filter', title: 'Filtrar por libro' });
  sel.appendChild(h('option', { value: '' }, 'Todos los libros'));
  notebooksAll().forEach(function (nb) {
    sel.appendChild(h('option', { value: nb.id }, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
  });
  sel.value = ui.kanbanBook || '';
  sel.addEventListener('change', function () { ui.kanbanBook = sel.value; save(); renderTareas(); });

  var blockedBtn = h('button', { class: 'icon-btn kanban-blocked-btn' + (ui.kanbanBlockedOnly ? ' on' : ''), title: 'Mostrar solo las tarjetas bloqueadas' }, icon('bellRing'));
  blockedBtn.addEventListener('click', function () {
    ui.kanbanBlockedOnly = !ui.kanbanBlockedOnly;
    save();
    blockedBtn.classList.toggle('on', ui.kanbanBlockedOnly);
    renderTareas();
  });

  var dateLbl = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  dateLbl = dateLbl.charAt(0).toUpperCase() + dateLbl.slice(1);
  // Los filtros por libro y por bloqueo son del tablero: en la lista del día solo estorban.
  var esTablero = tareasView() === 'tablero';
  panel.appendChild(h('div', { class: 'tareas-head' },
    h('div', { class: 'tareas-title' }, icon('todo'), 'Tareas', h('span', { class: 'planner-date' }, dateLbl)),
    views,
    h('div', { class: 'tareas-head-right' },
      esTablero ? blockedBtn : null,
      esTablero ? h('span', { class: 'kanban-filter-wrap' }, icon('book'), sel) : null,
      h('button', { class: 'icon-btn', title: 'Cerrar (Esc)', onclick: closeTareas }, icon('x')))));

  // Origen de las tarjetas: las del día, las del lienzo o ambas.
  var srcRow = h('div', { class: 'tareas-src' });
  [['all', 'Todo'], ['task', 'Del día'], ['block', 'Del lienzo']].forEach(function (o) {
    srcRow.appendChild(h('button', { class: 'cm-chip' + (tareasSrcFilter() === o[0] ? ' on' : ''), onclick: function () {
      ui.tasksSrc = o[0]; save(); renderTareas();
    } }, o[1]));
  });
  panel.appendChild(h('div', { class: 'tareas-summary-row' }, h('div', { class: 'planner-summary', id: 'tareasSummary' }), srcRow));
  panel.appendChild(h('div', { class: 'tareas-filters', id: 'tareasFilters' }));
  panel.appendChild(h('div', { class: 'tareas-body', id: 'tareasBody' }));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  renderTareas();
  var first = panel.querySelector('.planner-inp, .kanban-add-inp');
  if (first) first.focus();
}

// Refresco desde fuera (sync entre ventanas, recordatorios). No repinta si estás escribiendo
// dentro del panel, para no tragarse lo que llevas tecleado.
function refreshTareas(force) {
  if (!tareasIsOpen()) return;
  if (!force) {
    var a = document.activeElement;
    if (a && a.closest && a.closest('#tareasOverlay') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  }
  renderTareas();
}

// Barra de filtros: por fecha, por prioridad y cómo ordenar. Se pinta en cada repintado para
// que los chips reflejen siempre lo que está activo.
function renderTareasFilters() {
  var el = document.getElementById('tareasFilters');
  if (!el) return;
  el.innerHTML = '';
  var f = tareasDateFilter();
  var grpFecha = h('div', { class: 'tareas-fgroup' }, h('span', { class: 'tareas-flabel' }, icon('clock'), 'Fecha'));
  DATE_FILTERS.forEach(function (o) {
    grpFecha.appendChild(h('button', { class: 'cm-chip' + (f === o[0] ? ' on' : ''), title: fechaHint(o[0]), onclick: function () {
      ui.tasksDate = o[0]; save(); renderTareas();
    } }, o[1]));
  });
  el.appendChild(grpFecha);
  // El rango solo aparece cuando lo pides: dos campos de fecha ocupan mucho para tenerlos siempre.
  if (f === 'range') {
    var desde = h('input', { class: 'tareas-date-inp', type: 'date', value: ui.tasksFrom || '' });
    var hasta = h('input', { class: 'tareas-date-inp', type: 'date', value: ui.tasksTo || '' });
    desde.addEventListener('change', function () { ui.tasksFrom = desde.value; save(); renderTareas(); });
    hasta.addEventListener('change', function () { ui.tasksTo = hasta.value; save(); renderTareas(); });
    var limpiar = h('button', { class: 'cm-chip', title: 'Quitar el rango', onclick: function () {
      ui.tasksFrom = ''; ui.tasksTo = ''; save(); renderTareas();
    } }, icon('x'));
    el.appendChild(h('div', { class: 'tareas-fgroup tareas-range' }, h('span', { class: 'tareas-flabel' }, 'del'), desde, h('span', { class: 'tareas-flabel' }, 'al'), hasta, limpiar));
  }
  var prio = tareasPrioFilter();
  var grpPrio = h('div', { class: 'tareas-fgroup' }, h('span', { class: 'tareas-flabel' }, icon('star'), 'Prioridad'));
  [['all', 'Todas']].concat(PRIOS).forEach(function (o) {
    grpPrio.appendChild(h('button', { class: 'cm-chip' + (prio === o[0] ? ' on' : '') + (o[0] !== 'all' ? ' prio-' + o[0] : ''), onclick: function () {
      ui.tasksPrio = o[0]; save(); renderTareas();
    } }, o[1]));
  });
  el.appendChild(grpPrio);
  var esPrio = tareasSort() === 'prio';
  el.appendChild(h('button', {
    class: 'tareas-sort-btn' + (esPrio ? ' on' : ''),
    title: esPrio ? 'Ordenando por prioridad — clic para volver a tu orden manual' : 'Ordenar por prioridad (tu orden manual se conserva)',
    onclick: function () { ui.tasksSort = esPrio ? 'manual' : 'prio'; save(); renderTareas(); },
  }, icon(esPrio ? 'star' : 'grip'), esPrio ? 'Por prioridad' : 'Orden manual'));
}
function fechaHint(k) {
  if (k === 'today') return 'Solo lo de hoy';
  if (k === 'week') return 'Desde el lunes de esta semana';
  if (k === 'late') return 'Pendientes de días anteriores';
  if (k === 'range') return 'Elegir un rango de fechas';
  return 'Sin filtro de fecha';
}

function renderTareas() {
  var body = document.getElementById('tareasBody');
  if (!body) return;
  renderTareasSummary();
  renderTareasFilters();
  body.innerHTML = '';
  body.className = 'tareas-body ' + (tareasView() === 'tablero' ? 'is-tablero' : 'is-lista');
  if (tareasView() === 'tablero') renderTareasTablero(body);
  else renderTareasLista(body);
}

// Progreso del día ponderado por pasos: una tarea a medias ya no vale cero.
function renderTareasSummary() {
  var el = document.getElementById('tareasSummary');
  if (!el) return;
  var items = [];
  KAN.forEach(function (k) { items = items.concat(boardItems(k[0])); });
  var total = 0, done = 0;
  items.forEach(function (it) {
    var subs = itemSubs(it);
    var closed = it.src === 'task' ? it.ref.done : it.ref.kanban === 'done';
    if (subs.length) { total += subs.length; done += closed ? subs.length : subs.filter(function (s) { return s.done; }).length; }
    else { total += 1; done += closed ? 1 : 0; }
  });
  var closedN = items.filter(function (it) { return it.src === 'task' ? it.ref.done : it.ref.kanban === 'done'; }).length;
  el.innerHTML = '';
  el.appendChild(h('div', { class: 'planner-progress', title: 'Progreso ponderado por pasos completados' },
    h('div', { class: 'planner-progress-fill', style: { width: (total ? Math.round(done / total * 100) : 0) + '%' } })));
  el.appendChild(h('span', { class: 'planner-count' }, items.length
    ? (closedN + ' de ' + items.length + ' completadas · ' + (total ? Math.round(done / total * 100) : 0) + '% del trabajo')
    : 'Escribe lo primero que tengas que hacer hoy'));
}

// ---------- Vista Lista ----------
// Orden de la lista: lo que ya está en marcha primero, luego lo pendiente y al final lo hecho
// —responde a "¿qué estoy haciendo ahora?" antes que a "¿qué me queda?"—. Si pediste ordenar
// por prioridad, esa manda por encima del estado.
var TAREAS_RANK = { doing: 0, todo: 1, done: 2 };
function tareasListCmp(a, b) {
  if (tareasSort() === 'prio') {
    var dp = planPriorityRank(a.ref) - planPriorityRank(b.ref);
    if (dp) return dp;
  }
  var sa = a.src === 'task' ? planStatusOf(a.ref) : a.ref.kanban;
  var sb = b.src === 'task' ? planStatusOf(b.ref) : b.ref.kanban;
  return (TAREAS_RANK[sa] - TAREAS_RANK[sb]) || (a.order - b.order);
}
function renderTareasLista(body) {
  var inp = h('input', { class: 'planner-inp', placeholder: '¿Qué tienes que hacer hoy? (Enter para añadir)' });
  var addTask = function () {
    var t = planAddTask(inp.value);
    if (!t) return;
    inp.value = '';
    tareasOpen[t.id] = true; // nace desplegada: descomponerla en pasos sin un clic extra
    renderTareas();
    var sub = body.querySelector('.planner-task .planner-sub-inp');
    if (sub) sub.focus(); else inp.focus();
  };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });
  body.appendChild(h('div', { class: 'planner-add' }, inp, h('button', { class: 'tour-btn', onclick: addTask }, 'Añadir')));

  var list = h('div', { class: 'log-body planner-body' });
  var tasks = [];
  KAN.forEach(function (k) { boardItems(k[0]).forEach(function (it) { tasks.push(it); }); });
  tasks.sort(tareasListCmp);
  tasks.forEach(function (it) { list.appendChild(it.src === 'task' ? taskRow(it.ref) : blockRow(it.ref)); });
  if (!tasks.length) list.appendChild(h('p', { class: 'tree-empty' }, 'Sin tareas para hoy. ¡Día despejado! 🌿'));
  body.appendChild(list);
}

// Chip de prioridad: un clic recorre sin prioridad → alta → media → baja.
function prioChip(x, rerender) {
  var p = planPriorityOf(x);
  return h('button', {
    class: 'planner-prio' + (p ? ' prio-' + p : ' prio-none'),
    title: planPriorityLabel(p) + ' — clic para cambiarla',
    onclick: function (e) { e.stopPropagation(); planCyclePriority(x); rerender(); },
  }, p ? planPriorityLabel(p) : 'Prioridad');
}

// Botón de pasos: es la puerta a desglosar la tarea, así que se ve. Sin pasos invita a crearlos;
// con pasos muestra cuántos llevas.
function stepsBtn(owner, open, rerender) {
  var subs = owner.subs || [];
  var hechos = subs.filter(function (s) { return s.done; }).length;
  var todos = subs.length && hechos === subs.length;
  return h('button', {
    class: 'steps-btn' + (open ? ' open' : '') + (subs.length ? ' has' : ' empty') + (todos ? ' all' : ''),
    title: subs.length ? (open ? 'Ocultar los pasos' : 'Ver los ' + subs.length + ' pasos') : 'Desglosar en pasos',
    onclick: function (e) { e.stopPropagation(); tareasOpen[owner.id] = !open; rerender(); },
  }, icon(subs.length ? 'todo' : 'plus'),
     h('span', { class: 'steps-btn-lbl' }, subs.length ? (hechos + '/' + subs.length + ' pasos') : 'Pasos'),
     icon(open ? 'chevronDown' : 'chevron'));
}

// Chip de estado: un clic lo pasa a la siguiente columna; también sirve para ver dónde está.
function statusChip(status, onPick) {
  var idx = KAN.map(function (k) { return k[0]; }).indexOf(status);
  return h('button', {
    class: 'planner-status k-' + status,
    title: 'Estado: ' + kanbanLabel(status) + ' — clic para pasarla a «' + kanbanLabel(KAN[(idx + 1) % KAN.length][0]) + '»',
    onclick: function (e) { e.stopPropagation(); onPick(KAN[(idx + 1) % KAN.length][0]); },
  }, kanbanLabel(status));
}

function taskRow(t) {
  t.subs = t.subs || [];
  var status = planStatusOf(t);
  var open = !!tareasOpen[t.id];
  var subsDone = planSubsDone(t);
  var chk = h('input', { type: 'checkbox' });
  chk.checked = !!t.done;
  chk.addEventListener('change', function () { planToggleDone(t, chk.checked); renderTareas(); });
  var title = editable(h('span', { class: 'planner-title' + (t.done ? ' done' : '') }, t.title), t.title,
    function (v) { t.title = v; logChange('Tarea renombrada', v); save(); renderTareas(); });
  var carried = !t.done && t.day !== planTodayStr();
  var row = h('div', { class: 'planner-task' + (t.done ? ' done' : '') + (planPriorityOf(t) ? ' p-' + planPriorityOf(t) : ''), 'data-id': t.id },
    h('div', { class: 'planner-task-row' },
      chk, title,
      carried ? h('span', { class: 'planner-carried', title: 'Pendiente desde ' + t.day }, t.day.slice(5)) : null,
      stepsBtn(t, open, renderTareas),
      h('button', { class: 'act danger', title: 'Eliminar tarea', onclick: function () { planDeleteTask(t); renderTareas(); } }, icon('trash'))));

  var meta = h('div', { class: 'planner-meta' });
  meta.appendChild(statusChip(status, function (next) { planSetStatus(t, next); renderTareas(); }));
  meta.appendChild(prioChip(t, renderTareas));
  meta.appendChild(h('span', { class: 'planner-meta-at', title: 'Insertada el ' + fmtWhen(t.createdAt) }, '⏱ ' + fmtDate(t.createdAt) + ' · ' + fmtTime(t.createdAt)));
  var kind = t.kind || 'relevant', rk = rankMeta(kind);
  meta.appendChild(h('button', { class: 'planner-kind rank-' + kind, title: 'Tipo: ' + rk.label + ' — clic para cambiarlo', onclick: function () {
    var order = NOTE_RANKS.map(function (r) { return r.key; });
    t.kind = order[(order.indexOf(kind) + 1) % order.length];
    save(); renderTareas();
  } }, rk.label));
  var linked = t.noteId && getNote(t.noteId);
  if (linked) {
    meta.appendChild(h('button', { class: 'planner-note-chip', title: 'Anidada a esta hoja — clic para abrirla', onclick: function () { closeTareas(); selectNote(t.noteId); } }, '📄 ' + (linked.title || 'Hoja')));
  }
  var linkBtn = h('button', { class: 'act', title: linked ? 'Cambiar o quitar la hoja anidada' : 'Anidar la tarea a una hoja o nota' }, icon('link'));
  linkBtn.addEventListener('click', function (e) { e.stopPropagation(); openPlanNotePicker(t, linkBtn, renderTareas); });
  meta.appendChild(linkBtn);
  if (t.remindAt && t.remindAt > now()) {
    meta.appendChild(h('span', { class: 'planner-remind-chip', title: 'Sonará a las ' + planFmtTime(t.remindAt) }, '⏰ ' + planFmtTime(t.remindAt)));
  }
  var bellBtn = h('button', { class: 'act', title: 'Recordatorio en X minutos (suena y avisa)' }, icon('bell'));
  bellBtn.addEventListener('click', function (e) { e.stopPropagation(); openPlanRemindPicker(t, bellBtn, renderTareas); });
  meta.appendChild(bellBtn);
  var toCanvas = h('button', { class: 'act', title: 'Llevarla al lienzo como tarjeta' }, icon('popout'));
  toCanvas.addEventListener('click', function (e) { e.stopPropagation(); taskToCanvas(t); });
  meta.appendChild(toCanvas);
  row.appendChild(meta);

  if (t.subs.length) {
    row.appendChild(h('div', { class: 'planner-bar' },
      h('div', { class: 'planner-bar-fill', style: { width: Math.round(subsDone / t.subs.length * 100) + '%' } })));
  }
  if (open) row.appendChild(subsEditor(t));
  return row;
}

// Una tarjeta del lienzo dentro de la lista del día: mismo aspecto, distinto origen.
function blockRow(b) {
  b.subs = b.subs || [];
  var open = !!tareasOpen[b.id];
  var subsDone = b.subs.filter(function (s) { return s.done; }).length;
  var note = getNote(b.noteId);
  var chk = h('input', { type: 'checkbox' });
  chk.checked = b.kanban === 'done';
  chk.addEventListener('change', function () { setKanban(b, chk.checked ? 'done' : 'todo'); });
  var text = (b.content && b.content.text) ? b.content.text : typeMeta(b.type).label;
  var title = editable(h('span', { class: 'planner-title' + (b.kanban === 'done' ? ' done' : '') }, snippet(text)), text,
    function (v) { blockSetText(b, v); renderTareas(); });
  var row = h('div', { class: 'planner-task from-canvas' + (b.kanban === 'done' ? ' done' : '') + (planPriorityOf(b) ? ' p-' + planPriorityOf(b) : ''), 'data-id': b.id },
    h('div', { class: 'planner-task-row' },
      chk, title,
      stepsBtn(b, open, renderTareas),
      h('button', { class: 'act danger', title: 'Quitar del tablero (la tarjeta sigue en el lienzo)', onclick: function () { removeFromKanban(b); } }, icon('x'))));
  var meta = h('div', { class: 'planner-meta' });
  meta.appendChild(statusChip(b.kanban, function (next) { setKanban(b, next); }));
  meta.appendChild(prioChip(b, renderTareas));
  meta.appendChild(h('span', { class: 'planner-src-chip', title: 'Esta tarjeta vive en el lienzo' }, icon(typeMeta(b.type).icon), 'Lienzo'));
  if (note) {
    meta.appendChild(h('button', { class: 'planner-note-chip', title: 'Abrir la hoja', onclick: function () { closeTareas(); selectNote(b.noteId); } }, '📄 ' + (note.title || 'Hoja')));
  }
  if (b.reminder && !b.reminder.done) meta.appendChild(h('span', { class: 'planner-remind-chip' }, '⏰ ' + fmtShort(b.reminder.at)));
  var toPlan = h('button', { class: 'act', title: 'Copiarla al plan de hoy' }, icon('todo'));
  toPlan.addEventListener('click', function (e) { e.stopPropagation(); blockToTask(b); });
  meta.appendChild(toPlan);
  row.appendChild(meta);
  if (b.subs.length) {
    row.appendChild(h('div', { class: 'planner-bar' },
      h('div', { class: 'planner-bar-fill', style: { width: Math.round(subsDone / b.subs.length * 100) + '%' } })));
  }
  if (open) row.appendChild(subsEditor(b));
  return row;
}

// ---------- Editor de pasos (subtareas), común a tareas del día y tarjetas del lienzo ----------
function subsEditor(owner) {
  var wrap = h('div', { class: 'planner-subs' });
  (owner.subs || []).forEach(function (s) {
    var sChk = h('input', { type: 'checkbox' });
    sChk.checked = !!s.done;
    sChk.addEventListener('change', function () { planSubToggle(owner, s, sChk.checked); renderTareas(); });
    // Doble clic sobre el texto del paso para editarlo. La fila es un <div> y no un <label>
    // a propósito: dentro de un <label> el primer clic marcaría la casilla y el repintado
    // se llevaría por delante el nodo antes de que llegue el segundo clic.
    var txt = editable(h('span', { class: 'planner-sub-text' }, s.text), s.text,
      function (v) { planSubSetText(owner, s, v); renderTareas(); });
    wrap.appendChild(h('div', { class: 'planner-sub' + (s.done ? ' done' : '') },
      sChk, txt,
      s.done && s.at ? h('span', { class: 'planner-sub-at', title: 'Hecho a las ' + planFmtTime(s.at) }, planFmtTime(s.at)) : null,
      h('button', { class: 'act danger', title: 'Quitar el paso', onclick: function (e) { e.preventDefault(); planSubRemove(owner, s); renderTareas(); } }, icon('x'))));
  });
  var inp = h('input', { class: 'planner-inp planner-sub-inp', placeholder: 'Paso siguiente o acción realizada… (Enter)' });
  var add = function () {
    if (!planSubAdd(owner, inp.value)) return;
    tareasOpen[owner.id] = true;
    renderTareas();
    var again = document.querySelector('#tareasBody [data-id="' + owner.id + '"] .planner-sub-inp');
    if (again) again.focus();
  };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  wrap.appendChild(h('div', { class: 'planner-sub-add' }, inp));
  return wrap;
}

// ---------- Vista Tablero ----------
function renderTareasTablero(body) {
  var cols = h('div', { class: 'kanban-cols' });
  KAN.forEach(function (k) {
    var status = k[0];
    var items = boardItems(status);
    var col = h('div', { class: 'kanban-col k-' + status });
    col.appendChild(h('div', { class: 'kanban-col-head' },
      h('span', { class: 'kc-dot' }), h('span', { class: 'kc-name' }, k[1]), h('span', { class: 'kc-count' }, String(items.length))));
    // Cada columna captura: apuntar algo que ya está en marcha no obliga a crearlo y luego moverlo.
    var inp = h('input', { class: 'kanban-add-inp', placeholder: 'Añadir en «' + k[1] + '»…' });
    var addIt = function () {
      var t = planAddTask(inp.value, { status: status });
      if (!t) return;
      if (status !== 'todo') planSetStatus(t, status);
      inp.value = '';
      tareasOpen[t.id] = true;
      renderTareas();
      var again = document.querySelector('.kanban-col.k-' + status + ' .kanban-add-inp');
      if (again) again.focus();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
    col.appendChild(h('div', { class: 'kanban-add' }, inp, h('button', { class: 'kanban-add-btn', title: 'Añadir', onclick: addIt }, icon('plus'))));

    var cbody = h('div', { class: 'kanban-col-body' });
    cbody.addEventListener('dragover', function (e) { e.preventDefault(); cbody.classList.add('drop'); });
    cbody.addEventListener('dragleave', function () { cbody.classList.remove('drop'); });
    cbody.addEventListener('drop', function (e) {
      e.preventDefault();
      cbody.classList.remove('drop');
      if (!dragTask) return;
      var beforeId = null;
      var cards = Array.prototype.slice.call(cbody.querySelectorAll('.kanban-card'));
      for (var i = 0; i < cards.length; i++) {
        var rect = cards[i].getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { beforeId = cards[i].getAttribute('data-id'); break; }
      }
      var d = dragTask;
      dragTask = null;
      boardPlace(d.src, d.id, status, beforeId);
    });
    if (!items.length) cbody.appendChild(h('div', { class: 'kanban-empty' }, 'Sin tarjetas'));
    items.forEach(function (it) { cbody.appendChild(boardCard(it, status)); });
    col.appendChild(cbody);
    cols.appendChild(col);
  });
  body.appendChild(cols);
}

function boardCard(it, status) {
  var isTask = it.src === 'task';
  var ref = it.ref;
  ref.subs = ref.subs || [];
  var open = !!tareasOpen[it.id];
  var subs = ref.subs;
  var subsDone = subs.filter(function (s) { return s.done; }).length;
  var note = isTask ? (ref.noteId ? getNote(ref.noteId) : null) : getNote(ref.noteId);
  var prio = planPriorityOf(ref);
  var card = h('div', {
    class: 'kanban-card' + (!isTask && ref.important ? ' important' : '') + (!isTask && ref.blocked ? ' blocked' : '')
      + (isTask ? ' is-task' : ' is-block') + (prio ? ' p-' + prio : ''),
    'data-id': it.id, 'data-src': it.src, draggable: 'true',
  });
  card.addEventListener('dragstart', function (e) {
    dragTask = { src: it.src, id: it.id };
    card.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; } catch (er) {}
  });
  card.addEventListener('dragend', function () { card.classList.remove('dragging'); dragTask = null; });

  var top = h('div', { class: 'kc-top' },
    icon(isTask ? 'todo' : typeMeta(ref.type).icon),
    h('span', { class: 'kc-loc', title: isTask ? 'Tarea del día' : (note ? note.title : 'Nota') }, isTask ? (note ? note.title : 'Tarea del día') : (note ? note.title : 'Nota')));
  top.appendChild(prioChip(ref, renderTareas));
  if (isTask && ref.kind && ref.kind !== 'relevant') top.appendChild(h('span', { class: 'kc-rank rank-' + ref.kind }, rankMeta(ref.kind).label));
  if (!isTask && ref.important) top.appendChild(h('span', { class: 'kc-star', title: 'Importante' }, icon('star')));
  if (!isTask && ref.blocked) top.appendChild(h('span', { class: 'kc-blocked-badge', title: 'Bloqueado' }, icon('bellRing')));
  card.appendChild(top);

  // Doble clic sobre el texto para editarlo sin salir del tablero.
  var full = itemTitle(it);
  var taskEl = h('div', { class: 'kc-task', title: 'Doble clic para editar' }, snippet(full));
  taskEl.addEventListener('dblclick', function (e) {
    e.stopPropagation(); e.preventDefault();
    var inp = h('textarea', { class: 'kanban-edit-inp', value: full });
    inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation(); // Escape aquí cancela la edición, no cierra el panel
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); inp.blur(); }
      if (ev.key === 'Escape') { inp.value = full; inp.blur(); }
    });
    inp.addEventListener('blur', function () {
      var v = inp.value.trim();
      if (v && v !== full) {
        if (isTask) { ref.title = v; logChange('Tarea renombrada', v); save(); }
        else blockSetText(ref, v);
      }
      renderTareas();
    });
    taskEl.replaceWith(inp);
    inp.focus(); inp.select();
  });
  card.appendChild(taskEl);

  if (subs.length) {
    card.appendChild(h('div', { class: 'kc-steps-bar', title: subsDone + ' de ' + subs.length + ' pasos' },
      h('div', { class: 'kc-steps-fill', style: { width: Math.round(subsDone / subs.length * 100) + '%' } })));
  }
  var sub = isTask
    ? ('⏱ ' + fmtDate(ref.createdAt) + (ref.day !== planTodayStr() && !ref.done ? ' · pendiente desde ' + ref.day.slice(5) : ''))
    : bookLineOf(ref);
  if (sub) card.appendChild(h('div', { class: 'kc-sub' }, sub));
  var rem = isTask ? (ref.remindAt && ref.remindAt > now() ? planFmtTime(ref.remindAt) : null)
                   : (ref.reminder && !ref.reminder.done ? fmtShort(ref.reminder.at) : null);
  if (rem) card.appendChild(h('div', { class: 'kc-rem' }, icon('clock'), rem));
  // El acceso a los pasos va en el cuerpo de la tarjeta, no escondido entre los iconos de abajo.
  card.appendChild(stepsBtn(ref, open, renderTareas));
  if (open) card.appendChild(subsEditor(ref));

  var idx = KAN.map(function (k) { return k[0]; }).indexOf(status);
  var actions = h('div', { class: 'kc-actions' },
    h('button', { class: 'kc-btn', title: 'Mover a la izquierda', disabled: idx <= 0 ? '' : null, onclick: function () { if (idx > 0) boardPlace(it.src, it.id, KAN[idx - 1][0], null); } }, icon('chevronL')),
    isTask
      ? h('button', { class: 'kc-btn', title: 'Llevarla al lienzo como tarjeta', onclick: function () { taskToCanvas(ref); } }, icon('popout'))
      : h('button', { class: 'kc-btn', title: 'Ver la nota en el lienzo', onclick: function () { selectNote(ref.noteId); closeTareas(); } }, icon('popout')),
    isTask
      ? h('button', { class: 'kc-btn', title: 'Eliminar la tarea', onclick: function () { planDeleteTask(ref); renderTareas(); } }, icon('trash'))
      : h('button', { class: 'kc-btn', title: 'Quitar del tablero', onclick: function () { removeFromKanban(ref); } }, icon('x')),
    h('button', { class: 'kc-btn', title: 'Mover a la derecha', disabled: idx >= KAN.length - 1 ? '' : null, onclick: function () { if (idx < KAN.length - 1) boardPlace(it.src, it.id, KAN[idx + 1][0], null); } }, icon('chevron')));
  card.appendChild(actions);
  return card;
}

function bookLineOf(b) {
  var note = getNote(b.noteId);
  var sec = note ? getSection(note.sectionId) : null;
  var nb = sec ? getNotebook(sec.notebookId) : null;
  return nb ? ((nb.emoji ? nb.emoji + ' ' : '📓 ') + nb.name + (sec ? ' · ' + sec.name : '')) : (sec ? sec.name : '');
}
// Editar el texto de una tarjeta del lienzo (y mantener el título de su hoja en sintonía).
function blockSetText(b, v) {
  b.content = b.content || {};
  b.content.text = v;
  var note = getNote(b.noteId);
  if (note) note.title = v.length > 40 ? v.slice(0, 40) + '…' : v;
  touchNote(b.noteId);
  logChange('Tarjeta editada', v);
  save();
  renderCanvas();
}

// ---------- Puentes entre el día y el lienzo ----------
// Una tarea del día se convierte en tarjeta del lienzo conservando sus pasos.
function taskToCanvas(t) {
  var secId = ensureKanbanDefaultSection();
  var ts = now();
  var note = { id: uid(), sectionId: secId, title: t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title, createdAt: ts, updatedAt: ts };
  data.notes.push(note);
  var blk = addBlock(note.id, 'text', 36 + Math.round(Math.random() * 140), 36 + Math.round(Math.random() * 120));
  blk.content = blk.content || {};
  blk.content.text = t.title;
  blk.content.rank = t.kind || 'idea';
  blk.subs = (t.subs || []).map(function (s) { return { id: uid(), text: s.text, done: s.done, at: s.at }; });
  blk.kanban = planStatusOf(t); blk.kanbanAt = ts; blk.kanbanOrder = ts;
  data.plan = planTasks().filter(function (x) { return x.id !== t.id; });
  logChange('Tarea llevada al lienzo', t.title);
  save();
  renderSidebar();
  renderCanvas();
  renderTareas();
  if (typeof mobileRefresh === 'function') mobileRefresh();
  toast('Ahora es una tarjeta del lienzo, con sus pasos.', 'ok');
}
// Una tarjeta del lienzo se copia al plan de hoy (la tarjeta se queda donde está).
function blockToTask(b) {
  var text = (b.content && b.content.text) ? b.content.text : typeMeta(b.type).label;
  var t = planAddTask(text, { noteId: b.noteId, status: b.kanban || 'todo' });
  if (!t) return;
  t.subs = (b.subs || []).map(function (s) { return { id: uid(), text: s.text, done: s.done, at: s.at }; });
  if (b.kanban && b.kanban !== 'todo') planSetStatus(t, b.kanban);
  save();
  renderTareas();
  if (typeof mobileRefresh === 'function') mobileRefresh();
  toast('Añadida al plan de hoy.', 'ok');
}
