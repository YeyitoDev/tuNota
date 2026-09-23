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
var DATE_FILTERS = [['all', 'Todas'],['today', 'Hoy'], ['week', 'Semana'], ['late', 'Vencidas'], ['done', 'Completadas'], ['range', 'Rango…']];
// Estos filtros miran también lo terminado en días anteriores (el historial).
function tareasWantsHistory() { var f = tareasDateFilter(); return f === 'week' || f === 'range' || f === 'done'; }
var tareaDet = null;   // { src, id } de la tarea abierta en la vista de detalle (no se persiste)
function tareasDateFilter() {
  for (var i = 0; i < DATE_FILTERS.length; i++) { if (DATE_FILTERS[i][0] === ui.tasksDate) return ui.tasksDate; }
  return 'all';
}
function tareasPrioFilter() {
  return planPriorityOf({ priority: ui.tasksPrio }) || 'all';
}
function tareasSort() { return ui.tasksSort === 'prio' ? 'prio' : 'manual'; }
// Acoplado (a un lado, sin tapar el lienzo) o en ventana centrada. Acoplado es el modo por
// defecto: así puedes reordenar prioridades mientras sigues moviendo tarjetas en el lienzo.
function tareasDock() { return ui.tasksDock === 'modal' ? 'modal' : 'dock'; }
// Ancho del panel acoplado. La regla es que SIEMPRE quede lienzo a la vista: por eso el
// tope es poco más de la mitad de la ventana (antes 90%, que tapaba casi todo) y el ancho
// por defecto del tablero es el justo para ver sus tres columnas.
// En pantalla estrecha (teléfono) el panel al lado no cabe: la barra lateral y el panel se
// comen el lienzo entero. Ahí se acopla ABAJO, como una hoja, y el lienzo queda visible
// arriba para seguir explorándolo mientras se apuntan tareas.
var TAREAS_ANCHO_HOJA = 760;   // por debajo de esto, siempre hoja abajo
var TAREAS_MIN_LIENZO = 200;   // px de lienzo que deben quedar SIEMPRE a la vista
var TAREAS_MIN_LADO = 380;     // menos de esto al lado no da para el panel: mejor abajo
// El sitio libre se mide desde donde empieza el lienzo, no desde el borde de la ventana:
// con la barra lateral abierta (284 px) un panel «del 74%» tapaba el lienzo entero.
function tareasSitioLateral() {
  var c = document.getElementById('canvas');
  var izq = c ? c.getBoundingClientRect().left : 0;
  return (window.innerWidth || 1200) - izq - TAREAS_MIN_LIENZO;
}
function tareasIsSheet() {
  if (tareasDock() !== 'dock') return false;
  if ((window.innerWidth || 1200) <= TAREAS_ANCHO_HOJA) return true;
  return tareasSitioLateral() < TAREAS_MIN_LADO;
}
function tareasHeight() {
  var vh = window.innerHeight || 800;
  var hgt = parseInt(ui.tasksHeight, 10);
  if (!hgt || hgt < 180) hgt = Math.round(vh * 0.55);
  return Math.max(180, Math.min(hgt, Math.round(vh * 0.82)));
}
function tareasWidth() {
  var w = parseInt(ui.tasksWidth, 10);
  if (!w || w < 300) w = tareasView() === 'tablero' ? 760 : 420;
  var tope = Math.max(300, Math.min(Math.round((window.innerWidth || 1200) * 0.56), tareasSitioLateral()));
  return Math.max(300, Math.min(w, tope));
}
function closeTareas() {
  var o = document.getElementById('tareasOverlay');
  if (o) {
    // Se va deslizando por donde entró. Pierde el id al instante: para la app ya está
    // cerrado, y lo que queda es un fantasma que acaba la animación y se borra solo.
    o.removeAttribute('id');
    // Sus hijos también sueltan los id: si no, al reabrir (cambiar Lista ↔ Tablero) el
    // repintado encontraba #tareasBody del panel que se está yendo y el nuevo quedaba vacío.
    Array.prototype.forEach.call(o.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
    o.classList.add('is-closing');
    o.classList.add('is-pre');     // se va por donde vino
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 260);
  }
  document.body.classList.remove('has-tareas-dock');
}
function tareasIsOpen() { return !!document.getElementById('tareasOverlay'); }

// ---------- Adaptador: una sola lista de tarjetas venga de donde venga ----------
// El filtro por libro se aplica a las tarjetas del lienzo por su nota, y a las tareas del día
// por la hoja a la que estén anidadas (una tarea suelta no pertenece a ningún libro).
// '__inbox' = la Bandeja: tareas sin libro y tarjetas que viven en el libro Bandeja.
function tareaInBook(t) {
  if (!ui.kanbanBook) return true;
  var book = planBookOf(t);
  if (ui.kanbanBook === '__inbox') return !book || !!(getNotebook(book) || {}).inbox;
  return book === ui.kanbanBook;
}
function blockInBook(b) {
  if (!ui.kanbanBook) return true;
  var book = notebookIdOfBlock(b);
  if (ui.kanbanBook === '__inbox') return !!(getNotebook(book) || {}).inbox;
  return book === ui.kanbanBook;
}
// Libro al que va lo que se crea con el filtro puesto (lo creado en "Bandeja" queda sin libro).
function tareasNewBook() { return ui.kanbanBook && ui.kanbanBook !== '__inbox' ? ui.kanbanBook : ''; }
// Todas las tarjetas de una columna, sin los filtros del panel (la usa también el móvil).
function boardAll(status, all) {
  var out = [];
  planTasksIn(status, all).forEach(function (t) { out.push({ src: 'task', id: t.id, ref: t, order: planOrderOf(t) }); });
  (data.blocks || []).forEach(function (b) {
    if (b.kanban === status) out.push({ src: 'block', id: b.id, ref: b, order: kanbanOrderOf(b) });
  });
  return out.sort(function (a, b) { return a.order - b.order; });
}
// La fecha de una tarjeta: el día al que pertenece la tarea, o el día en que la tarjeta del
// lienzo entró al tablero (y si nunca entró, cuándo se creó).
// Lo terminado cuenta el día en que se terminó; lo abierto, su fecha límite o, sin ella, el
// día en que se apuntó.
function itemDoneAt(it) { return it.src === 'task' ? it.ref.doneAt : it.ref.kanbanDoneAt; }
function itemDay(it) {
  if (itemIsDone(it) && itemDoneAt(it)) return planDayOfMs(itemDoneAt(it));
  if (planDueOf(it.ref)) return planDueOf(it.ref);
  if (it.src === 'task') return it.ref.day || planDayOfMs(it.ref.createdAt);
  return planDayOfMs(it.ref.kanbanAt || it.ref.createdAt);
}
function itemIsDone(it) { return it.src === 'task' ? !!it.ref.done : it.ref.kanban === 'done'; }
function itemStatus(it) { return it.src === 'task' ? planStatusOf(it.ref) : it.ref.kanban; }
function itemPassesDate(it) {
  var f = tareasDateFilter();
  var done = itemIsDone(it), hoy = planTodayStr();
  if (f === 'all') return true;
  if (f === 'done') return done;
  if (f === 'late') return planIsOverdue(it.ref, done);
  var day = itemDay(it);
  if (f === 'today') {
    if (done) return day === hoy;
    return planDueOf(it.ref) ? day <= hoy : day === hoy; // lo que vence hoy o ya venció, y lo apuntado hoy
  }
  // Semana: lo de esta semana, más lo que arrastras vencido de antes (sigue siendo tu semana).
  if (f === 'week') return (day >= planWeekStartStr() && day <= hoy) || (!done && !!planDueOf(it.ref) && day < planWeekStartStr());
  var desde = ui.tasksFrom || '', hasta = ui.tasksTo || '';
  if (desde && day < desde) return false;
  if (hasta && day > hasta) return false;
  return true;
}
function boardItems(status) {
  var src = tareasSrcFilter();
  var prio = tareasPrioFilter();
  var out = boardAll(status, tareasWantsHistory()).filter(function (it) {
    if (prio !== 'all' && planPriorityOf(it.ref) !== prio) return false;
    if (!itemPassesDate(it)) return false;
    if (ui.kanbanBlockedOnly && !it.ref.blocked) return false; // en espera: tareas y tarjetas
    if (it.src === 'task') {
      if (src === 'block') return false;
      return tareaInBook(it.ref);
    }
    if (src === 'task') return false;
    return blockInBook(it.ref);
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
    if (was !== status) {
      planHist(b, { s: status });
      b.kanbanDoneAt = status === 'done' ? now() : null;
      if (status === 'done' && b.blocked) { b.blocked = false; delete b.blockedWhy; }
    }
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

// Asa para dar más o menos sitio al panel sin cerrarlo: el borde izquierdo cuando está al
// lado, el borde superior cuando es una hoja abajo. Doble clic/toque restablece la medida.
// Eventos de puntero (no de ratón) para que también se arrastre con el dedo.
function tareasResizer(dockEl, sheet) {
  var grip = h('div', { class: 'tareas-resize' + (sheet ? ' is-vert' : ''), title: sheet
    ? 'Arrastra para ver más o menos lienzo · doble toque para restablecer'
    : 'Arrastra para cambiar el ancho · doble clic para restablecerlo' });
  grip.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    document.body.classList.add('tareas-resizing');
    try { grip.setPointerCapture(e.pointerId); } catch (er) {}
    var move = function (ev) {
      if (sheet) {
        dockEl.style.height = Math.max(160, Math.min(window.innerHeight - 60, window.innerHeight - ev.clientY)) + 'px';
      } else {
        dockEl.style.width = Math.max(300, Math.min(window.innerWidth - 80, window.innerWidth - ev.clientX)) + 'px';
      }
    };
    var up = function () {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('tareas-resizing');
      if (sheet) ui.tasksHeight = parseInt(dockEl.style.height, 10) || 0;
      else ui.tasksWidth = parseInt(dockEl.style.width, 10) || 0;
      save();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', function () {
    if (sheet) { ui.tasksHeight = 0; save(); dockEl.style.height = tareasHeight() + 'px'; }
    else { ui.tasksWidth = 0; save(); dockEl.style.width = tareasWidth() + 'px'; }
  });
  return grip;
}

// ---------- Panel ----------
function openTareas(view) {
  var yaEstaba = tareasIsOpen();   // cambiar de vista no repite la entrada deslizante
  closeTareas();
  planTasks(); // sesiones existentes: normalizeData puede no haber corrido
  if (view === 'lista' || view === 'tablero') ui.tasksView = view;
  var dock = tareasDock() === 'dock';
  var sheet = tareasIsSheet(); // teléfono: hoja abajo en vez de panel al lado
  // Acoplado: sin fondo oscuro y sin capturar los clics, para que el lienzo siga vivo detrás.
  var overlay = dock
    ? h('div', { class: 'tareas-dock' + (sheet ? ' is-sheet' : '') + (yaEstaba ? ' no-anim' : ''), id: 'tareasOverlay' })
    : h('div', { class: 'overlay tareas-overlay', id: 'tareasOverlay', onmousedown: function (e) { if (e.target === overlay) closeTareas(); } });
  // Modo compacto: acoplado y estrecho, o en una pantalla de portátil. Sin esto, en un
  // 1366x768 al 125% el cromo se comía 252 px y solo se veían tres tareas.
  var apretado = dock && (sheet || tareasWidth() < 520 || (window.innerHeight || 900) < 820);
  var panel = h('div', { class: 'tareas-panel v-' + tareasView() + (dock ? ' is-dock' : '') + (apretado ? ' is-tight' : '') });
  if (dock) {
    if (sheet) overlay.style.height = tareasHeight() + 'px';
    else overlay.style.width = tareasWidth() + 'px';
    overlay.appendChild(tareasResizer(overlay, sheet));
  }

  // Conmutador de vista: los mismos datos, dos preguntas distintas.
  var views = h('div', { class: 'tareas-views' });
  [['lista', 'todo', 'Lista', 'Qué tengo hoy y cuánto llevo'],
   ['tablero', 'board', 'Tablero', 'En qué estado está cada cosa']].forEach(function (v) {
    views.appendChild(h('button', {
      class: 'tareas-view-btn' + (tareasView() === v[0] ? ' on' : ''), title: v[3],
      onclick: function () { ui.tasksView = v[0]; save(); openTareas(v[0]); },
    }, icon(v[1]), v[2]));
  });

  var sel = h('select', { class: 'kanban-filter', title: 'Filtrar por libro (lo que crees con el filtro puesto va a ese libro)' });
  sel.appendChild(h('option', { value: '' }, 'Todos los libros'));
  sel.appendChild(h('option', { value: '__inbox' }, '📥 Bandeja (sin libro)'));
  notebooksAll().forEach(function (nb) {
    if (nb.inbox) return; // ya está arriba como «Bandeja»
    sel.appendChild(h('option', { value: nb.id }, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
  });
  sel.value = ui.kanbanBook || '';
  sel.addEventListener('change', function () { ui.kanbanBook = sel.value; save(); renderTareas(); });

  var blockedBtn = h('button', { class: 'icon-btn kanban-blocked-btn' + (ui.kanbanBlockedOnly ? ' on' : ''), title: 'Mostrar solo lo que está en espera (bloqueado)' }, icon('bellRing'));
  blockedBtn.addEventListener('click', function () {
    ui.kanbanBlockedOnly = !ui.kanbanBlockedOnly;
    save();
    blockedBtn.classList.toggle('on', ui.kanbanBlockedOnly);
    renderTareas();
  });

  var dateLbl = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  dateLbl = dateLbl.charAt(0).toUpperCase() + dateLbl.slice(1);
  // El libro y "en espera" filtran las dos vistas: seguir un proyecto es lo mismo en lista o tablero.
  var dockBtn = h('button', {
    class: 'icon-btn' + (dock ? ' on' : ''),
    title: dock ? 'Está acoplado al lado: puedes seguir usando el lienzo. Clic para verlo como ventana centrada.'
                : 'Acoplar al lado para trabajar en el lienzo a la vez',
    onclick: function () { ui.tasksDock = dock ? 'modal' : 'dock'; save(); openTareas(); },
  }, icon(dock ? 'panel' : 'layout'));
  // Acoplado el sitio es escaso: la fecha baja a la fila del resumen y no aprieta la cabecera.
  panel.appendChild(h('div', { class: 'tareas-head' },
    h('div', { class: 'tareas-title' }, icon('todo'), 'Tareas',
      dock ? null : h('span', { class: 'planner-date' }, dateLbl)),
    views,
    h('div', { class: 'tareas-head-right' },
      blockedBtn,
      h('span', { class: 'kanban-filter-wrap' }, icon('book'), sel),
      dockBtn,
      h('button', { class: 'icon-btn', title: 'Cerrar (Esc)', onclick: closeTareas }, icon('x')))));

  // Origen de las tarjetas: las del día, las del lienzo o ambas.
  var srcRow = h('div', { class: 'tareas-src' });
  [['all', 'Todo'], ['task', 'Del día'], ['block', 'Del lienzo']].forEach(function (o) {
    srcRow.appendChild(h('button', { class: 'cm-chip' + (tareasSrcFilter() === o[0] ? ' on' : ''), onclick: function () {
      ui.tasksSrc = o[0]; save(); renderTareas();
    } }, o[1]));
  });
  panel.appendChild(h('div', { class: 'tareas-summary-row' },
    dock ? h('span', { class: 'planner-date dock-date' }, dateLbl) : null,
    h('div', { class: 'planner-summary', id: 'tareasSummary' }), srcRow));
  panel.appendChild(h('div', { class: 'pomo-slot', id: 'pomoSlot' }));   // sesión de foco en curso
  panel.appendChild(h('div', { class: 'tareas-filters', id: 'tareasFilters' }));
  panel.appendChild(h('div', { class: 'tareas-body', id: 'tareasBody' }));
  overlay.appendChild(panel);
  if (dock && !yaEstaba) overlay.classList.add('is-pre');   // fuera de pantalla hasta estar pintado
  document.body.appendChild(overlay);
  document.body.classList.toggle('has-tareas-dock', dock);
  renderTareas();
  if (dock && !yaEstaba) {
    // Dos fotogramas: uno para que cuaje la posición inicial y otro para lanzar la entrada.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.remove('is-pre'); });
    });
  }
  var first = panel.querySelector('.planner-inp, .kanban-add-inp');
  if (first) first.focus();
}

// Refresco desde fuera (sync entre ventanas, recordatorios, ediciones en el lienzo).
// No repinta si estás escribiendo dentro del panel, para no tragarse lo que llevas tecleado.
function refreshTareas(force) {
  if (!tareasIsOpen()) return;
  if (!force) {
    var a = document.activeElement;
    if (a && a.closest && a.closest('#tareasOverlay') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  }
  renderTareas();
}
// Acoplado, el lienzo sigue editándose mientras el panel está abierto: si tocas una nota que
// tiene tarjeta en el tablero, el panel se pone al día solo (con un respiro para no repintar
// en cada tecla). Lo llama touchNote().
var tareasTouchT = null;
function tareasTouched() {
  if (!tareasIsOpen() || tareasDock() !== 'dock') return;
  clearTimeout(tareasTouchT);
  tareasTouchT = setTimeout(function () { refreshTareas(); }, 450);
}
// Escape solo cierra si estabas dentro del panel: acoplado, es un panel más de la app y no
// debe desaparecer porque canceles algo en el lienzo.
function escCloseTareas() {
  if (!tareasIsOpen()) return;
  if (tareasDock() === 'modal') { closeTareas(); return; }
  var a = document.activeElement;
  if (a && a.closest && a.closest('#tareasOverlay')) closeTareas();
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
  if (k === 'today') return 'Lo apuntado hoy y lo que vence hoy o ya venció';
  if (k === 'late') return 'Abiertas con la fecha límite ya pasada';
  if (k === 'done') return 'Historial de lo terminado, por día';
  if (k === 'range') return 'Elegir un rango de fechas';
  return 'Sin filtro de fecha';
}

function renderTareas() {
  var slot = document.getElementById('pomoSlot');
  if (slot) {
    slot.innerHTML = '';
    if (typeof pomoBar === 'function') { var pb = pomoBar(); if (pb) slot.appendChild(pb); }
  }
  var body = document.getElementById('tareasBody');
  if (!body) return;
  var det = tareaDet && tareaDetItem();
  if (!det) tareaDet = null;
  renderTareasSummary();
  if (det) { var fl = document.getElementById('tareasFilters'); if (fl) fl.innerHTML = ''; }
  else renderTareasFilters();
  body.innerHTML = '';
  if (det) { body.className = 'tareas-body is-detalle'; renderTareaDetalle(body, det); return; }
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
  // Lo que pide atención, a la vista y a un clic de su filtro.
  var vencidas = items.filter(function (it) { return planIsOverdue(it.ref, itemIsDone(it)); }).length;
  var espera = items.filter(function (it) { return it.ref.blocked && !itemIsDone(it); }).length;
  if (vencidas) el.appendChild(h('button', { class: 'tareas-alert is-late', title: 'Ver solo las vencidas', onclick: function () { tareaDet = null; ui.tasksDate = 'late'; save(); renderTareas(); } }, '⚠ ' + vencidas + (vencidas === 1 ? ' vencida' : ' vencidas')));
  if (espera) el.appendChild(h('button', { class: 'tareas-alert is-wait', title: 'Ver solo lo que está en espera', onclick: function () { tareaDet = null; ui.kanbanBlockedOnly = true; save(); openTareas(); } }, '⏸ ' + espera + ' en espera'));
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
  var historial = tareasDateFilter() === 'done';
  if (!historial) {
    var inp = h('input', { class: 'planner-inp', placeholder: '¿Qué tienes que hacer? (Enter para añadir)' });
    // Fecha límite opcional al crearla: sin esto había que abrir la tarea para ponérsela.
    var due = h('input', { class: 'tareas-date-inp planner-due-inp', type: 'date', title: 'Fecha límite (opcional)' });
    var addTask = function () {
      var t = planAddTask(inp.value, { bookId: tareasNewBook(), due: due.value });
      if (!t) return;
      inp.value = '';
      tareasOpen[t.id] = true; // nace desplegada: descomponerla en pasos sin un clic extra
      renderTareas();
      var sub = body.querySelector('[data-id="' + t.id + '"] .planner-sub-inp');
      if (sub) sub.focus(); else inp.focus();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });
    body.appendChild(h('div', { class: 'planner-add' }, inp, due, h('button', { class: 'tour-btn', onclick: addTask }, 'Añadir')));
  }

  var list = h('div', { class: 'log-body planner-body' });
  var tasks = [];
  KAN.forEach(function (k) { boardItems(k[0]).forEach(function (it) { tasks.push(it); }); });
  if (historial) {
    // Historial: lo más reciente arriba, con un separador por día.
    tasks.sort(function (a, b) { return (itemDoneAt(b) || 0) - (itemDoneAt(a) || 0); });
    var lastDay = null;
    tasks.forEach(function (it) {
      var d = itemDay(it);
      if (d !== lastDay) { lastDay = d; list.appendChild(h('div', { class: 'tareas-dayhead' }, tareasDayTitle(d))); }
      list.appendChild(it.src === 'task' ? taskRow(it.ref) : blockRow(it.ref));
    });
    if (!tasks.length) list.appendChild(h('p', { class: 'tree-empty' }, 'Aún no hay nada terminado con estos filtros.'));
  } else {
    tasks.sort(tareasListCmp);
    tasks.forEach(function (it) { list.appendChild(it.src === 'task' ? taskRow(it.ref) : blockRow(it.ref)); });
    if (!tasks.length) list.appendChild(h('p', { class: 'tree-empty' }, 'Nada pendiente con estos filtros. 🌿'));
  }
  body.appendChild(list);
  if (!historial) renderMdTasks(body);
}
function tareasDayTitle(d) {
  var lbl = planDueLabel(d);
  var largo = new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (lbl === 'Hoy' || lbl === 'Ayer') ? lbl + ' · ' + largo : largo.charAt(0).toUpperCase() + largo.slice(1);
}

// ---------- Casillas «- [ ]» escritas dentro de las notas ----------
// Antes no aparecían en ningún panel: lo que apuntabas como casilla en una nota se perdía
// para el seguimiento. Se leen de los bloques de texto y marcarlas aquí edita la nota.
var MD_TASK_RE = /^(\s*[-*+]\s+)\[( |x|X)\](\s+.*)$/;
function mdTasksOf(b) {
  var txt = b && b.content && typeof b.content.text === 'string' ? b.content.text : '';
  if (txt.indexOf('[') < 0) return [];
  var out = [];
  txt.replace(/\r\n?/g, '\n').split('\n').forEach(function (line, ln) {
    var m = line.match(MD_TASK_RE);
    if (m) out.push({ ln: ln, text: m[3].trim(), done: m[2] !== ' ' });
  });
  return out;
}
function mdTaskToggle(b, ln) {
  var lines = String(b.content.text || '').replace(/\r\n?/g, '\n').split('\n');
  var m = lines[ln] && lines[ln].match(MD_TASK_RE);
  if (!m) return;
  lines[ln] = m[1] + (m[2] === ' ' ? '[x]' : '[ ]') + m[3];
  b.content.text = lines.join('\n');
  touchNote(b.noteId);
  logChange(m[2] === ' ' ? 'Tarea completada' : 'Tarea reabierta', snippet(m[3]));
  save();
  renderCanvas();
}
function renderMdTasks(body) {
  if (tareasSrcFilter() === 'task') return;
  var f = tareasDateFilter();
  if (f !== 'all' && f !== 'today') return; // no tienen fecha: solo cuadran en la vista general
  var grupos = [], pendientes = 0;
  (data.blocks || []).forEach(function (b) {
    if (!blockInBook(b)) return;
    var abiertas = mdTasksOf(b).filter(function (x) { return !x.done; });
    if (!abiertas.length) return;
    pendientes += abiertas.length;
    grupos.push({ b: b, items: abiertas });
  });
  if (!grupos.length) return;
  var abierto = ui.tasksMdOpen !== false;
  var wrap = h('div', { class: 'tareas-md' });
  wrap.appendChild(h('button', { class: 'tareas-md-head', onclick: function () { ui.tasksMdOpen = !abierto; save(); renderTareas(); } },
    icon(abierto ? 'chevronDown' : 'chevron'), 'Casillas en tus notas', h('span', { class: 'kc-count' }, String(pendientes))));
  if (abierto) {
    grupos.forEach(function (g) {
      var note = getNote(g.b.noteId);
      wrap.appendChild(h('button', { class: 'tareas-md-note', title: 'Abrir la hoja', onclick: function () { closeTareas(); selectNote(g.b.noteId); } },
        '📄 ' + ((note && note.title) || 'Nota'), h('span', { class: 'tareas-md-path' }, bookLineOf(g.b))));
      g.items.forEach(function (x) {
        var chk = h('input', { type: 'checkbox' });
        chk.addEventListener('change', function () { mdTaskToggle(g.b, x.ln); renderTareas(); });
        wrap.appendChild(h('label', { class: 'tareas-md-item' }, chk, h('span', {}, x.text)));
      });
    });
  }
  body.appendChild(wrap);
}

// Desplegable de opciones anclado a un chip. Se elige el valor de una lista en vez de ir
// pulsando hasta dar con él: con tres o cuatro valores, ciclar obliga a contar clics.
// opts: [[valor, etiqueta, claseDelPunto]]
function openValuePicker(anchor, titulo, opts, actual, onPick) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop value-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, titulo));
  opts.forEach(function (o) {
    var activa = o[0] === actual;
    pop.appendChild(h('button', { class: 'cm-item value-item' + (activa ? ' active' : ''), onclick: function (e) {
      e.stopPropagation();
      closeTopbarMenu();
      onPick(o[0]);
    } },
      h('span', { class: 'value-dot ' + (o[2] || '') }),
      h('span', {}, o[1]),
      activa ? h('span', { class: 'value-check' }, '✓') : null));
  });
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionPop(pop, anchor, 190);
}

// Chip de prioridad: abre la lista de niveles con su flecha.
function prioChip(x, rerender) {
  var p = planPriorityOf(x);
  var chip = h('button', {
    class: 'planner-prio has-arrow' + (p ? ' prio-' + p : ' prio-none'),
    title: 'Prioridad: ' + planPriorityLabel(p) + ' — clic para elegir otra',
  }, h('span', {}, p ? planPriorityLabel(p) : 'Prioridad'), icon('chevronDown', 'pick-arrow'));
  chip.addEventListener('click', function (e) {
    e.stopPropagation();
    var opts = [['', 'Sin prioridad', 'p-none']].concat(PRIOS.map(function (o) { return [o[0], o[1], 'p-' + o[0]]; }));
    openValuePicker(chip, 'Prioridad', opts, p, function (v) {
      if (v) x.priority = v; else delete x.priority;
      logChange('Prioridad: ' + planPriorityLabel(v), x.title || (x.content && x.content.text) || '');
      save();
      rerender();
    });
  });
  return chip;
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

// Chip de estado: abre la lista de columnas con su flecha.
function statusChip(status, onPick) {
  var chip = h('button', {
    class: 'planner-status has-arrow k-' + status,
    title: 'Estado: ' + kanbanLabel(status) + ' — clic para moverla de columna',
  }, h('span', {}, kanbanLabel(status)), icon('chevronDown', 'pick-arrow'));
  chip.addEventListener('click', function (e) {
    e.stopPropagation();
    var opts = KAN.map(function (k) { return [k[0], k[1], 'k-' + k[0]]; });
    openValuePicker(chip, 'Estado', opts, status, onPick);
  });
  return chip;
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
  var carried = !t.done && t.day !== planTodayStr() && !planDueOf(t);
  var row = h('div', { class: 'planner-task' + (t.done ? ' done' : '') + (t.blocked ? ' is-wait' : '') + (planPriorityOf(t) ? ' p-' + planPriorityOf(t) : ''), 'data-id': t.id },
    h('div', { class: 'planner-task-row' },
      chk, title,
      carried ? h('span', { class: 'planner-carried', title: 'Abierta desde ' + t.day + ' (sin fecha límite)' }, t.day.slice(5)) : null,
      stepsBtn(t, open, renderTareas),
      detalleBtn('task', t.id)));

  // Fila de estado: solo lo que se consulta de un vistazo. Tipo, hoja, recordatorio, lienzo y
  // borrar viven en el detalle (antes eran ~10 controles por fila).
  var meta = h('div', { class: 'planner-meta' });
  meta.appendChild(statusChip(status, function (next) { planSetStatus(t, next); renderTareas(); }));
  meta.appendChild(prioChip(t, renderTareas));
  var dc = dueChip(t, t.done); if (dc) meta.appendChild(dc);
  if (t.blocked) meta.appendChild(waitChip(t));
  var bk = planBookOf(t), bnb = bk && getNotebook(bk);
  if (bnb && ui.kanbanBook !== bk) meta.appendChild(h('span', { class: 'planner-book-chip', title: 'Libro' }, (bnb.emoji || '📓') + ' ' + bnb.name));
  if (t.remindAt && t.remindAt > now()) {
    meta.appendChild(h('span', { class: 'planner-remind-chip', title: 'Sonará a las ' + planFmtTime(t.remindAt) }, '⏰ ' + planFmtTime(t.remindAt)));
  }
  if (t.desc) meta.appendChild(h('span', { class: 'planner-desc-mark', title: t.desc }, icon('format')));
  if (typeof pomoRowBtn === 'function') meta.appendChild(pomoRowBtn('task', t.id));
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
  var closed = b.kanban === 'done';
  var row = h('div', { class: 'planner-task from-canvas' + (closed ? ' done' : '') + (b.blocked ? ' is-wait' : '') + (planPriorityOf(b) ? ' p-' + planPriorityOf(b) : ''), 'data-id': b.id },
    h('div', { class: 'planner-task-row' },
      chk, title,
      stepsBtn(b, open, renderTareas),
      detalleBtn('block', b.id)));
  var meta = h('div', { class: 'planner-meta' });
  meta.appendChild(statusChip(b.kanban, function (next) { setKanban(b, next); }));
  meta.appendChild(prioChip(b, renderTareas));
  var dc = dueChip(b, closed); if (dc) meta.appendChild(dc);
  if (b.blocked) meta.appendChild(waitChip(b));
  if (note) {
    meta.appendChild(h('button', { class: 'planner-note-chip', title: 'Vive en el lienzo de esta hoja — clic para abrirla', onclick: function () { closeTareas(); selectNote(b.noteId); } }, icon(typeMeta(b.type).icon), ' ' + (note.title || 'Hoja')));
  }
  if (b.reminder && !b.reminder.done) meta.appendChild(h('span', { class: 'planner-remind-chip' }, '⏰ ' + fmtShort(b.reminder.at)));
  if (typeof pomoRowBtn === 'function') meta.appendChild(pomoRowBtn('block', b.id));
  row.appendChild(meta);
  if (b.subs.length) {
    row.appendChild(h('div', { class: 'planner-bar' },
      h('div', { class: 'planner-bar-fill', style: { width: Math.round(subsDone / b.subs.length * 100) + '%' } })));
  }
  if (open) row.appendChild(subsEditor(b));
  return row;
}

// ---------- Editor de pasos (subtareas), común a tareas del día y tarjetas del lienzo ----------
// full = vista de detalle: cada paso puede llevar una nota y reordenarse.
var subNoteOpen = {};  // qué pasos tienen la nota desplegada (interfaz)
function subsEditor(owner, full) {
  var wrap = h('div', { class: 'planner-subs' + (full ? ' is-full' : '') });
  var subsN = (owner.subs || []).length;
  (owner.subs || []).forEach(function (s, i) {
    if (full) { wrap.appendChild(subFullRow(owner, s, i, subsN)); return; }
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
      s.note ? h('span', { class: 'planner-desc-mark', title: s.note }, icon('format')) : null,
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
function subFullRow(owner, s, i, n) {
  var sChk = h('input', { type: 'checkbox' });
  sChk.checked = !!s.done;
  sChk.addEventListener('change', function () { planSubToggle(owner, s, sChk.checked); renderTareas(); });
  var txt = editable(h('span', { class: 'planner-sub-text' }, s.text), s.text,
    function (v) { planSubSetText(owner, s, v); renderTareas(); });
  var abierta = !!subNoteOpen[s.id] || !!s.note;
  var row = h('div', { class: 'planner-sub' + (s.done ? ' done' : '') },
    sChk, txt,
    s.done && s.at ? h('span', { class: 'planner-sub-at', title: 'Hecho el ' + fmtWhen(s.at) }, fmtDate(s.at) + ' ' + planFmtTime(s.at)) : null,
    h('button', { class: 'act' + (s.note ? ' on' : ''), title: 'Añadir detalle a este paso', onclick: function () { subNoteOpen[s.id] = !subNoteOpen[s.id]; renderTareas(); } }, icon('format')),
    h('button', { class: 'act', title: 'Subir', disabled: i === 0 ? '' : null, onclick: function () { planSubMove(owner, s, -1); renderTareas(); } }, icon('chevronL', 'rot-up')),
    h('button', { class: 'act', title: 'Bajar', disabled: i === n - 1 ? '' : null, onclick: function () { planSubMove(owner, s, 1); renderTareas(); } }, icon('chevron', 'rot-down')),
    h('button', { class: 'act danger', title: 'Quitar el paso', onclick: function () { planSubRemove(owner, s); renderTareas(); } }, icon('x')));
  if (!abierta) return row;
  var ta = h('textarea', { class: 'planner-sub-note', rows: '2', placeholder: 'Detalle del paso: qué hiciste, qué falta, un enlace…' });
  ta.value = s.note || '';
  ta.addEventListener('change', function () { planSubSetNote(owner, s, ta.value); });
  return h('div', { class: 'planner-sub-wrap' }, row, ta);
}

// ---------- Vista de detalle: todo lo de una tarea en un sitio ----------
function detalleBtn(src, id) {
  return h('button', { class: 'act detalle-btn', title: 'Abrir el detalle (descripción, fecha, pasos, historial)', onclick: function (e) {
    e.stopPropagation(); tareaDet = { src: src, id: id }; renderTareas();
  } }, icon('more'));
}
function tareaDetItem() {
  if (!tareaDet) return null;
  var ref = tareaDet.src === 'task' ? planTaskById(tareaDet.id) : getBlockById(tareaDet.id);
  if (!ref || (tareaDet.src === 'block' && !ref.kanban)) return null;
  return { src: tareaDet.src, id: tareaDet.id, ref: ref };
}
function dueChip(x, closed) {
  var d = planDueOf(x);
  if (!d) return null;
  var late = planIsOverdue(x, closed);
  var hoy = !closed && d === planTodayStr();
  return h('span', { class: 'planner-due' + (late ? ' is-late' : hoy ? ' is-today' : ''), title: 'Fecha límite: ' + d },
    icon('clock'), (late ? 'Venció ' : '') + planDueLabel(d));
}
function waitChip(x) {
  return h('span', { class: 'planner-wait', title: x.blockedWhy ? 'En espera: ' + x.blockedWhy : 'En espera' },
    '⏸ ' + (x.blockedWhy ? snippet(x.blockedWhy).slice(0, 28) : 'En espera'));
}
function detField(label, control) {
  return h('div', { class: 'det-field' }, h('span', { class: 'det-label' }, label), h('div', { class: 'det-ctl' }, control));
}
function renderTareaDetalle(body, it) {
  var isTask = it.src === 'task', x = it.ref;
  x.subs = x.subs || [];
  var closed = itemIsDone(it);
  var back = function () { tareaDet = null; renderTareas(); };
  var wrap = h('div', { class: 'tarea-det', 'data-id': it.id });
  wrap.appendChild(h('div', { class: 'det-top' },
    h('button', { class: 'cm-chip', onclick: back }, icon('chevronL'), 'Volver'),
    h('span', { class: 'planner-src-chip' }, icon(isTask ? 'todo' : typeMeta(x.type).icon), isTask ? 'Tarea' : 'Tarjeta del lienzo')));

  // Título
  var tt = h('textarea', { class: 'det-title', rows: '1' });
  tt.value = itemTitle(it);
  tt.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); tt.blur(); } });
  tt.addEventListener('change', function () {
    var v = tt.value.trim(); if (!v || v === itemTitle(it)) return;
    if (isTask) { x.title = v; logChange('Tarea renombrada', v); save(); } else blockSetText(x, v);
  });
  wrap.appendChild(tt);

  // Campos
  var grid = h('div', { class: 'det-grid' });
  grid.appendChild(detField('Estado', statusChip(itemStatus(it), function (next) {
    if (isTask) planSetStatus(x, next); else setKanban(x, next);
    renderTareas();
  })));
  grid.appendChild(detField('Prioridad', prioChip(x, renderTareas)));
  var dueInp = h('input', { class: 'tareas-date-inp', type: 'date', value: planDueOf(x) });
  dueInp.addEventListener('change', function () { planSetDue(x, dueInp.value); renderTareas(); });
  grid.appendChild(detField('Vence', h('span', { class: 'det-inline' }, dueInp,
    planDueOf(x) ? h('button', { class: 'cm-chip', title: 'Quitar la fecha', onclick: function () { planSetDue(x, ''); renderTareas(); } }, icon('x')) : null,
    dueChip(x, closed))));
  if (isTask) {
    var bsel = h('select', { class: 'kanban-filter' });
    bsel.appendChild(h('option', { value: '' }, '📥 Bandeja (sin libro)'));
    notebooksAll().forEach(function (nb) { if (!nb.inbox) bsel.appendChild(h('option', { value: nb.id }, (nb.emoji ? nb.emoji + ' ' : '') + nb.name)); });
    bsel.value = x.bookId && getNotebook(x.bookId) ? x.bookId : '';
    bsel.addEventListener('change', function () { planSetBook(x, bsel.value); renderTareas(); });
    grid.appendChild(detField('Libro', bsel));
    var linked = x.noteId && getNote(x.noteId);
    var linkBtn = h('button', { class: 'cm-chip' }, icon('link'), linked ? (linked.title || 'Hoja') : 'Anidar a una hoja');
    linkBtn.addEventListener('click', function (e) { e.stopPropagation(); openPlanNotePicker(x, linkBtn, renderTareas); });
    grid.appendChild(detField('Hoja', h('span', { class: 'det-inline' }, linkBtn,
      linked ? h('button', { class: 'cm-chip', title: 'Abrir la hoja', onclick: function () { closeTareas(); selectNote(x.noteId); } }, icon('popout')) : null)));
    var bell = h('button', { class: 'cm-chip' }, icon('bell'), x.remindAt && x.remindAt > now() ? 'A las ' + planFmtTime(x.remindAt) : 'Avisarme en…');
    bell.addEventListener('click', function (e) { e.stopPropagation(); openPlanRemindPicker(x, bell, renderTareas); });
    grid.appendChild(detField('Recordatorio', bell));
    var kind = x.kind || 'relevant';
    var kindSel = h('select', { class: 'kanban-filter' });
    NOTE_RANKS.forEach(function (r) { kindSel.appendChild(h('option', { value: r.key }, r.label)); });
    kindSel.value = kind;
    kindSel.addEventListener('change', function () { x.kind = kindSel.value; save(); });
    grid.appendChild(detField('Tipo', kindSel));
  } else {
    grid.appendChild(detField('Dónde', h('button', { class: 'cm-chip', onclick: function () { closeTareas(); selectNote(x.noteId); } }, icon('popout'), bookLineOf(x) || 'Ver en el lienzo')));
  }
  // En espera: el estado que faltaba para "no depende de mí" (antes solo en tarjetas del lienzo).
  var wChk = h('input', { type: 'checkbox' });
  wChk.checked = !!x.blocked;
  var why = h('input', { class: 'planner-inp det-why', placeholder: '¿Qué o a quién esperas?', value: x.blockedWhy || '' });
  wChk.addEventListener('change', function () { planSetBlocked(x, wChk.checked, why.value); if (!isTask) renderCanvas(); renderTareas(); });
  why.addEventListener('change', function () { if (x.blocked) { x.blockedWhy = why.value.trim(); planTouch(x); save(); } });
  grid.appendChild(detField('En espera', h('span', { class: 'det-inline' }, h('label', { class: 'det-check' }, wChk, 'Bloqueada'), x.blocked ? why : null)));
  wrap.appendChild(grid);

  // Descripción
  var desc = h('textarea', { class: 'det-desc', rows: '4', placeholder: 'Descripción, contexto, criterios de «hecho», enlaces…' });
  desc.value = x.desc || '';
  desc.addEventListener('change', function () { planSetDesc(x, desc.value); });
  wrap.appendChild(h('div', { class: 'det-sec' }, h('div', { class: 'det-sec-title' }, icon('format'), 'Descripción'), desc));

  // Pasos
  var hechos = x.subs.filter(function (s) { return s.done; }).length;
  var pasos = h('div', { class: 'det-sec' }, h('div', { class: 'det-sec-title' }, icon('todo'), 'Pasos',
    x.subs.length ? h('span', { class: 'kc-count' }, hechos + '/' + x.subs.length) : null));
  if (x.subs.length) pasos.appendChild(h('div', { class: 'planner-bar' }, h('div', { class: 'planner-bar-fill', style: { width: Math.round(hechos / x.subs.length * 100) + '%' } })));
  pasos.appendChild(subsEditor(x, true));
  wrap.appendChild(pasos);

  // Historial
  var hist = h('div', { class: 'det-sec' }, h('div', { class: 'det-sec-title' }, icon('clock'), 'Historial'));
  var doing = planDoingMs(x);
  var abierta = (closed ? (itemDoneAt(it) || now()) : now()) - (isTask ? x.createdAt : (x.kanbanAt || x.createdAt));
  hist.appendChild(h('div', { class: 'det-stats' },
    h('span', {}, (closed ? 'Tardó ' : 'Abierta hace ') + planFmtDur(abierta)),
    doing ? h('span', {}, 'En progreso: ' + planFmtDur(doing)) : null));
  var evs = (x.hist || []).slice().reverse();
  var ul = h('div', { class: 'det-hist' });
  evs.forEach(function (e) {
    ul.appendChild(h('div', { class: 'det-ev' + (e.s ? ' k-' + e.s : '') },
      h('span', { class: 'det-ev-at' }, fmtDate(e.ts) + ' ' + planFmtTime(e.ts)),
      e.s ? h('span', { class: 'value-dot k-' + e.s }) : null,
      h('span', {}, e.s ? '→ ' + kanbanLabel(e.s) : e.m)));
  });
  if (!evs.length) ul.appendChild(h('div', { class: 'det-ev' }, h('span', { class: 'det-ev-at' }, fmtDate(x.createdAt)), h('span', {}, 'Creada (sin cambios registrados aún)')));
  hist.appendChild(ul);
  wrap.appendChild(hist);

  // Acciones
  var acts = h('div', { class: 'det-actions' });
  if (typeof pomoRowBtn === 'function') acts.appendChild(pomoRowBtn(it.src, it.id));
  if (isTask) {
    acts.appendChild(h('button', { class: 'cm-chip', onclick: function () { tareaDet = null; taskToCanvas(x); } }, icon('popout'), 'Llevar al lienzo'));
    acts.appendChild(h('button', { class: 'cm-chip danger', onclick: function () {
      if (!window.confirm('¿Eliminar la tarea «' + x.title + '»?')) return;
      tareaDet = null; planDeleteTask(x); renderTareas();
    } }, icon('trash'), 'Eliminar'));
  } else {
    acts.appendChild(h('button', { class: 'cm-chip', onclick: function () { tareaDet = null; removeFromKanban(x); renderTareas(); } }, icon('x'), 'Quitar del tablero'));
  }
  wrap.appendChild(acts);
  body.appendChild(wrap);
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
      var t = planAddTask(inp.value, { status: status, bookId: tareasNewBook() });
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
  if (ref.blocked) top.appendChild(h('span', { class: 'kc-blocked-badge', title: ref.blockedWhy ? 'En espera: ' + ref.blockedWhy : 'En espera' }, icon('bellRing')));
  top.appendChild(detalleBtn(it.src, it.id));
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
    ? ('⏱ ' + fmtDate(ref.createdAt) + (ref.day !== planTodayStr() && !ref.done && !planDueOf(ref) ? ' · abierta desde ' + ref.day.slice(5) : ''))
    : bookLineOf(ref);
  var dc = dueChip(ref, itemIsDone(it));
  if (sub || dc) card.appendChild(h('div', { class: 'kc-sub' }, dc, sub));
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
  // La hoja toma el nombre de la tarjeta solo si es SU hoja (una tarjeta sola, no la hoja
  // compartida «✅ Tareas» ni una hoja con más contenido).
  if (note && !note.tasksHost && blocksOf(note.id).length === 1) note.title = v.length > 40 ? v.slice(0, 40) + '…' : v;
  touchNote(b.noteId);
  logChange('Tarjeta editada', v);
  save();
  renderCanvas();
}

// ---------- Puentes entre el día y el lienzo ----------
// Una tarea del día se convierte en tarjeta del lienzo conservando pasos, fecha, descripción
// e historial. Va a la hoja a la que estaba anidada o, si no, a la hoja «✅ Tareas» de su
// libro (o de la Bandeja): ya no se crea una hoja nueva por cada tarea.
function taskToCanvas(t) {
  var ts = now();
  var noteId = (t.noteId && getNote(t.noteId)) ? t.noteId : tasksHostNote(planBookOf(t));
  var spot = nextFreeSpot(noteId);
  var blk = addBlock(noteId, 'text', spot.x, spot.y);
  blk.content = blk.content || {};
  blk.content.text = t.title;
  blk.content.rank = t.kind || 'idea';
  blk.subs = (t.subs || []).map(function (s) { var c = { id: uid(), text: s.text, done: s.done, at: s.at }; if (s.note) c.note = s.note; return c; });
  ['due', 'desc', 'priority', 'blocked', 'blockedWhy'].forEach(function (k) { if (t[k]) blk[k] = t[k]; });
  blk.hist = (t.hist || []).slice();
  blk.kanban = planStatusOf(t); blk.kanbanAt = t.createdAt || ts; blk.kanbanOrder = ts;
  if (t.done) blk.kanbanDoneAt = t.doneAt || ts;
  data.plan = planTasks().filter(function (x) { return x.id !== t.id; });
  logChange('Tarea llevada al lienzo', t.title);
  save();
  renderSidebar();
  renderCanvas();
  renderTareas();
  if (typeof mobileRefresh === 'function') mobileRefresh();
  toast('Ahora es una tarjeta del lienzo, con sus pasos.', 'ok');
}
