/* tuNota — Plan del día: qué tengo que hacer hoy, con las acciones/subtareas realizadas
   para completarlo y el progreso de cada tarea. Los datos viven en data.plan (se guardan
   y entran en las copias de seguridad). Cargado en orden desde index.html. */
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

function closePlanner() { var o = document.getElementById('plannerOverlay'); if (o) o.remove(); }
function openPlanner() {
  closePlanner();
  if (!Array.isArray(data.plan)) data.plan = []; // sesiones existentes: normalizeData puede no haber corrido
  var overlay = h('div', { class: 'overlay', id: 'plannerOverlay', onclick: function (e) { if (e.target === overlay) closePlanner(); } });
  var panel = h('div', { class: 'log-panel planner-panel' });
  var today = planTodayStr();
  var list = h('div', { class: 'log-body planner-body' });
  var summary = h('div', { class: 'planner-summary' });

  function render() {
    var tasks = planVisibleTasks();
    var doneN = tasks.filter(function (t) { return t.done; }).length;
    summary.innerHTML = '';
    summary.appendChild(h('div', { class: 'planner-progress' },
      h('div', { class: 'planner-progress-fill', style: { width: (tasks.length ? Math.round(doneN / tasks.length * 100) : 0) + '%' } })));
    summary.appendChild(h('span', { class: 'planner-count' }, tasks.length ? (doneN + ' de ' + tasks.length + ' tareas completadas') : 'Escribe lo primero que tengas que hacer hoy'));
    list.innerHTML = '';
    // Pendientes primero; completadas al final.
    tasks.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0); });
    tasks.forEach(function (t) { list.appendChild(taskRow(t)); });
    if (!tasks.length) list.appendChild(h('p', { class: 'tree-empty' }, 'Sin tareas para hoy. ¡Día despejado! 🌿'));
  }

  function taskRow(t) {
    t.subs = t.subs || [];
    var open = !!t._open;
    var subsDone = t.subs.filter(function (s) { return s.done; }).length;
    var chk = h('input', { type: 'checkbox' });
    chk.checked = !!t.done;
    chk.addEventListener('change', function () {
      t.done = chk.checked;
      t.doneAt = t.done ? now() : null;
      if (t.done) t.day = planTodayStr(); // se completó HOY (aunque viniera arrastrada)
      logChange(t.done ? 'Tarea completada' : 'Tarea reabierta', t.title);
      save(); render();
    });
    var title = editable(h('span', { class: 'planner-title' + (t.done ? ' done' : '') }, t.title), t.title, function (v) { t.title = v; save(); render(); });
    var carried = !t.done && t.day !== planTodayStr();
    var row = h('div', { class: 'planner-task' + (t.done ? ' done' : '') },
      h('div', { class: 'planner-task-row' },
        chk, title,
        carried ? h('span', { class: 'planner-carried', title: 'Pendiente desde ' + t.day }, t.day.slice(5)) : null,
        t.subs.length ? h('span', { class: 'planner-subcount' + (subsDone === t.subs.length ? ' all' : '') }, subsDone + '/' + t.subs.length) : null,
        h('button', { class: 'act', title: open ? 'Ocultar acciones' : 'Ver/añadir las acciones realizadas', onclick: function () { t._open = !open; render(); } }, icon(open ? 'chevronDown' : 'chevron')),
        h('button', { class: 'act danger', title: 'Eliminar tarea', onclick: function () { data.plan = data.plan.filter(function (x) { return x.id !== t.id; }); save(); render(); } }, icon('trash'))));
    if (t.subs.length) {
      row.appendChild(h('div', { class: 'planner-bar' },
        h('div', { class: 'planner-bar-fill', style: { width: Math.round(subsDone / t.subs.length * 100) + '%' } })));
    }
    if (open) {
      var subsEl = h('div', { class: 'planner-subs' });
      t.subs.forEach(function (s) {
        var sChk = h('input', { type: 'checkbox' });
        sChk.checked = !!s.done;
        sChk.addEventListener('change', function () { s.done = sChk.checked; s.at = s.done ? now() : null; save(); render(); });
        subsEl.appendChild(h('label', { class: 'planner-sub' + (s.done ? ' done' : '') },
          sChk,
          h('span', { class: 'planner-sub-text' }, s.text),
          s.done && s.at ? h('span', { class: 'planner-sub-at', title: 'Hecha a las ' + planFmtTime(s.at) }, planFmtTime(s.at)) : null,
          h('button', { class: 'act danger', title: 'Quitar', onclick: function (e) { e.preventDefault(); t.subs = t.subs.filter(function (x) { return x.id !== s.id; }); save(); render(); } }, icon('x'))));
      });
      var subInp = h('input', { class: 'planner-inp planner-sub-inp', placeholder: 'Acción realizada o siguiente paso… (Enter)' });
      var addSub = function () {
        var v = subInp.value.trim(); if (!v) return;
        t.subs.push({ id: uid(), text: v, done: false, at: null });
        save(); t._open = true; render();
        var again = list.querySelector('.planner-task .planner-sub-inp'); if (again) again.focus();
      };
      subInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
      subsEl.appendChild(h('div', { class: 'planner-sub-add' }, subInp));
      row.appendChild(subsEl);
    }
    return row;
  }

  var inp = h('input', { class: 'planner-inp', placeholder: '¿Qué tienes que hacer hoy? (Enter para añadir)' });
  var addTask = function () {
    var v = inp.value.trim(); if (!v) return;
    data.plan.push({ id: uid(), title: v, day: today, done: false, doneAt: null, createdAt: now(), subs: [] });
    inp.value = '';
    logChange('Tarea del día añadida', v);
    save(); render(); inp.focus();
  };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });

  var dateLbl = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  panel.appendChild(h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('todo'), 'Plan del día', h('span', { class: 'planner-date' }, dateLbl)),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closePlanner }, icon('x'))));
  panel.appendChild(summary);
  panel.appendChild(h('div', { class: 'planner-add' }, inp, h('button', { class: 'tour-btn', onclick: addTask }, 'Añadir')));
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  render();
  inp.focus();
}
