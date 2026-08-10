/* tuNota — Versión móvil: apuntar rápido lo que no quieres olvidar.
   Tres pestañas y nada más: Tareas (plan del día), Kanban e Ideas rápidas.
   El lienzo, los diagramas y el resto de funciones siguen siendo cosa del escritorio.
   Comparte los MISMOS datos que la app de escritorio (data.plan, bloques con
   b.kanban, bloques clasificados como idea): lo que capturas en el móvil aparece
   luego en el lienzo, y al revés.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// Ancho a partir del cual asumimos "teléfono". Por encima, solo se activa si el
// puntero es táctil (tablets en vertical) o si el usuario lo fuerza.
var MOBILE_MAX_W = 760;
var MOBILE_TABS = [
  { key: 'tareas', label: 'Tareas', icon: 'todo' },
  { key: 'kanban', label: 'Kanban', icon: 'board' },
  { key: 'ideas', label: 'Ideas', icon: 'bulb' },
];
var mShellEl = null, mBodyEl = null, mCapInp = null, mSubEl = null, mTabsEl = null;

// ---------- Activación ----------
function deviceLooksMobile() {
  try {
    if (window.matchMedia('(max-width: ' + MOBILE_MAX_W + 'px)').matches) return true;
    return window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches;
  } catch (e) {
    return window.innerWidth <= MOBILE_MAX_W;
  }
}
// ui.mobile: 'auto' (según el aparato), 'on' (forzado) u 'off' (escritorio completo).
function mobileWanted() {
  var m = (ui && ui.mobile) || 'auto';
  if (m === 'on') return true;
  if (m === 'off') return false;
  return deviceLooksMobile();
}
function mobileActive() { return !!mShellEl && !!mShellEl.isConnected; }
function mobileTabKey() {
  var k = ui && ui.mobileTab;
  for (var i = 0; i < MOBILE_TABS.length; i++) if (MOBILE_TABS[i].key === k) return k;
  return 'tareas';
}
function setMobileTab(k) {
  ui.mobileTab = k;
  writeLS(LS_UI, JSON.stringify(ui));
  renderMobile();
  if (mBodyEl) mBodyEl.scrollTop = 0;
}
function setMobileMode(on) {
  ui.mobile = on ? 'on' : 'off';
  writeLS(LS_UI, JSON.stringify(ui));
  applyMobileMode();
  if (!on) {
    renderAll();
    if (typeof drawLinks === 'function') drawLinks();
    toast('Escritorio completo. Vuelve al móvil con el botón de abajo a la izquierda.', 'ok');
  }
}
function applyMobileMode() {
  var on = mobileWanted();
  document.body.classList.toggle('mobile-on', on);
  if (on) {
    buildMobileShell();
    renderMobile();
  } else {
    mCloseSheet();
    if (mShellEl) mShellEl.remove();
    mShellEl = mBodyEl = mCapInp = mSubEl = mTabsEl = null;
  }
  updateMobilePill();
}
// Re-pinta el móvil si está activo (lo llama renderAll() y los avisos de recordatorio).
function mobileRefresh() {
  if (mobileActive()) renderMobile();
}
// Píldora para volver al móvil cuando se está en escritorio dentro de un teléfono.
function updateMobilePill() {
  var old = document.getElementById('mobilePill');
  if (old) old.remove();
  if (mobileWanted() || !deviceLooksMobile()) return;
  var pill = h('button', { class: 'm-pill', id: 'mobilePill', onclick: function () { setMobileMode(true); } },
    icon('todo'), 'Versión móvil');
  document.body.appendChild(pill);
}
var mResizeT = null;
window.addEventListener('resize', function () {
  clearTimeout(mResizeT);
  mResizeT = setTimeout(function () {
    if (!ui) return;
    var want = mobileWanted();
    if (want !== mobileActive()) applyMobileMode();
    else updateMobilePill();
  }, 250);
});

// ---------- Estructura ----------
// La cáscara (cabecera, barra de captura y pestañas) se crea UNA vez: al repintar
// solo se reconstruye el cuerpo, así el teclado no se cierra mientras escribes.
function buildMobileShell() {
  if (mobileActive()) return;
  if (mShellEl) mShellEl.remove();
  mShellEl = h('div', { class: 'm-app', id: 'mobileApp' });

  var moreBtn = h('button', { class: 'm-head-btn', title: 'Más opciones' }, icon('more'));
  moreBtn.addEventListener('click', function () { mMoreSheet(); });
  mShellEl.appendChild(h('header', { class: 'm-head' },
    h('span', { class: 'm-brand-ico' }, icon('leaf')),
    h('div', { class: 'm-brand' },
      h('strong', {}, 'tuNota'),
      h('span', { class: 'm-brand-sub' }, 'Apunta ahora, ordena luego')),
    h('button', { class: 'm-head-btn', title: 'Escritorio completo', onclick: function () { setMobileMode(false); } }, icon('layout')),
    moreBtn));

  mSubEl = h('div', { class: 'm-sub' });
  mShellEl.appendChild(mSubEl);

  mBodyEl = h('main', { class: 'm-body', id: 'mBody' });
  mShellEl.appendChild(mBodyEl);

  mCapInp = h('input', { class: 'm-cap-inp', type: 'text', enterkeyhint: 'done',
    autocapitalize: 'sentences', autocorrect: 'on', autocomplete: 'off' });
  mCapInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); mCapture(); } });
  var capBtn = h('button', { class: 'm-cap-btn', title: 'Añadir', onclick: mCapture }, icon('plus'));
  mShellEl.appendChild(h('div', { class: 'm-cap' }, mCapInp, capBtn));

  mTabsEl = h('nav', { class: 'm-tabs' });
  mShellEl.appendChild(mTabsEl);

  document.body.appendChild(mShellEl);
}

function renderMobile() {
  if (!mobileActive()) return;
  var tab = mobileTabKey();
  mShellEl.setAttribute('data-tab', tab);
  var keep = mBodyEl.scrollTop;
  mBodyEl.innerHTML = '';
  mSubEl.innerHTML = '';
  if (tab === 'tareas') mRenderTareas();
  else if (tab === 'kanban') mRenderKanban();
  else mRenderIdeas();
  mBodyEl.scrollTop = keep;
  mCapInp.placeholder = tab === 'tareas' ? '¿Qué tienes que hacer?'
    : tab === 'kanban' ? 'Nueva tarjeta en «' + kanbanLabel(mKanCol()) + '»…'
    : 'Escribe la idea antes de que se te olvide…';
  mRenderTabs();
}
function mRenderTabs() {
  mTabsEl.innerHTML = '';
  var tab = mobileTabKey();
  var counts = {
    tareas: planVisibleTasks().filter(function (t) { return !t.done; }).length,
    kanban: kanbanItems('todo').length + kanbanItems('doing').length,
    ideas: mIdeas().length,
  };
  MOBILE_TABS.forEach(function (t) {
    var n = counts[t.key];
    mTabsEl.appendChild(h('button', { class: 'm-tab' + (t.key === tab ? ' on' : ''), onclick: function () { setMobileTab(t.key); } },
      h('span', { class: 'm-tab-ico' }, icon(t.icon), n ? h('span', { class: 'm-tab-badge' }, n > 99 ? '99+' : String(n)) : null),
      h('span', { class: 'm-tab-lbl' }, t.label)));
  });
}

// La captura rápida depende de la pestaña: tarea, tarjeta de Kanban o idea suelta.
function mCapture() {
  var v = (mCapInp.value || '').trim();
  if (!v) { mCapInp.focus(); return; }
  var tab = mobileTabKey();
  if (tab === 'tareas') mAddTask(v);
  else if (tab === 'kanban') mAddKanbanCard(v, mKanCol());
  else mAddIdea(v);
  mCapInp.value = '';
  renderMobile();
  mBodyEl.scrollTop = 0;
  mCapInp.focus(); // el teclado sigue abierto: se pueden encadenar varias capturas
}

// ---------- Hojas emergentes (menús desde abajo) ----------
function mCloseSheet() {
  var bd = document.getElementById('mSheet');
  if (bd) bd.remove();
}
function mSheet(title, items) {
  mCloseSheet();
  var bd = h('div', { class: 'm-sheet-bd', id: 'mSheet', onclick: function (e) { if (e.target === bd) mCloseSheet(); } });
  var sh = h('div', { class: 'm-sheet' });
  sh.appendChild(h('div', { class: 'm-sheet-grip' }));
  if (title) sh.appendChild(h('div', { class: 'm-sheet-title' }, title));
  items.forEach(function (it) {
    if (!it) return;
    if (it.sep) { sh.appendChild(h('div', { class: 'm-sheet-sep' })); return; }
    if (it.node) { sh.appendChild(it.node); return; }
    sh.appendChild(h('button', { class: 'm-sheet-item' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''),
      onclick: function () { mCloseSheet(); it.onClick(); } },
      icon(it.icon || 'chevron'), h('span', {}, it.label), it.hint ? h('em', { class: 'm-sheet-hint' }, it.hint) : null));
  });
  bd.appendChild(sh);
  document.body.appendChild(bd);
  setTimeout(function () { bd.classList.add('show'); }, 10);
  return sh;
}
// Editor de texto a pantalla cómoda (para editar una tarjeta, una idea o una tarea).
function mEditSheet(title, value, placeholder, onSave) {
  var ta = h('textarea', { class: 'm-edit-ta', placeholder: placeholder || '', enterkeyhint: 'done' });
  ta.value = value || '';
  mSheet(title, [
    { node: ta },
    { node: h('div', { class: 'm-sheet-actions' },
      h('button', { class: 'm-btn ghost', onclick: mCloseSheet }, 'Cancelar'),
      h('button', { class: 'm-btn', onclick: function () { var v = ta.value.trim(); mCloseSheet(); if (v) onSave(v); } }, 'Guardar')) },
  ]);
  setTimeout(function () { ta.focus(); }, 80);
}
function mMoreSheet() {
  mSheet('tuNota en el móvil', [
    { icon: 'layout', label: 'Escritorio completo (lienzo)', hint: 'Todo lo demás', onClick: function () { setMobileMode(false); } },
    { icon: 'bell', label: 'Activar los avisos del móvil', hint: 'Recordatorios', onClick: function () {
      ensureNotifyPermission();
      toast('Si el navegador lo pide, acepta los avisos para oír los recordatorios.', 'ok');
    } },
    { icon: 'search', label: 'Buscar en todo', onClick: function () { openSearch(); } },
    { sep: true },
    { icon: 'download', label: 'Exportar copia de seguridad', onClick: function () { downloadBackup(); } },
  ]);
}
// Recordatorio para un bloque (Kanban/idea) o para una tarea del plan del día.
function mRemindSheet(kind, obj, label) {
  var isTask = kind === 'task';
  var cur = isTask ? obj.remindAt : (obj.reminder && !obj.reminder.done ? obj.reminder.at : 0);
  var setAt = function (at) {
    if (isTask) obj.remindAt = at;
    else if (at) obj.reminder = { at: at, repeat: 'none', done: false };
    else obj.reminder = null;
    ensureNotifyPermission();
    logChange(at ? 'Recordatorio creado (móvil)' : 'Recordatorio quitado', at ? fmtWhen(at) : '');
    save();
    mCloseSheet();
    renderMobile();
    if (at) toast('⏰ Te aviso el ' + fmtDate(at) + ' a las ' + fmtTime(at) + '.', 'ok');
  };
  var chips = h('div', { class: 'm-chips' });
  [[15, 'En 15 min'], [30, 'En 30 min'], [60, 'En 1 h'], [180, 'En 3 h'], [1440, 'Mañana']].forEach(function (o) {
    chips.appendChild(h('button', { class: 'm-chip', onclick: function () { setAt(now() + o[0] * 60000); } }, o[1]));
  });
  var dt = h('input', { class: 'm-dt', type: 'datetime-local' });
  dt.value = toLocalInput(cur || (Math.ceil((now() + 3600000) / 60000) * 60000));
  var rows = [
    { node: chips },
    { node: h('div', { class: 'm-sheet-lbl' }, 'Fecha y hora exactas') },
    { node: h('div', { class: 'm-sheet-actions' }, dt,
      h('button', { class: 'm-btn', onclick: function () { var at = new Date(dt.value).getTime(); if (!isNaN(at)) setAt(at); } }, 'Poner')) },
  ];
  if (cur) rows.push({ icon: 'x', label: 'Quitar el recordatorio (' + fmtShort(cur) + ')', danger: true, onClick: function () { setAt(null); } });
  mSheet('⏰ Avisarme de «' + snippet(label) + '»', rows);
}

// ---------- Pestaña 1: Tareas (plan del día) ----------
function mAddTask(text, noteId) {
  return planAddTask(text, { noteId: noteId || null });
}
function mRenderTareas() {
  // En marcha primero, luego lo pendiente y al final lo hecho.
  var rank = { doing: 0, todo: 1, done: 2 };
  var tasks = planVisibleTasks().slice().sort(function (a, b) {
    return (rank[planStatusOf(a)] - rank[planStatusOf(b)]) || (planOrderOf(a) - planOrderOf(b));
  });
  var doneN = tasks.filter(function (t) { return t.done; }).length;
  var pct = tasks.length ? Math.round(doneN / tasks.length * 100) : 0;
  var hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  mSubEl.appendChild(h('div', { class: 'm-sub-row' },
    h('span', { class: 'm-sub-title' }, hoy.charAt(0).toUpperCase() + hoy.slice(1)),
    h('span', { class: 'm-sub-count' }, tasks.length ? (doneN + '/' + tasks.length) : '')));
  mSubEl.appendChild(h('div', { class: 'm-bar' }, h('div', { class: 'm-bar-fill', style: { width: pct + '%' } })));

  if (!tasks.length) {
    mBodyEl.appendChild(mEmpty('todo', 'Sin tareas pendientes',
      'Escribe abajo lo que tengas que hacer y pulsa +. Lo que dejes sin terminar se arrastra al día siguiente.'));
    return;
  }
  tasks.forEach(function (t) { mBodyEl.appendChild(mTaskRow(t)); });
}
function mTaskRow(t) {
  t.subs = t.subs || [];
  var subsDone = t.subs.filter(function (s) { return s.done; }).length;
  var carried = !t.done && t.day !== planTodayStr();
  var row = h('div', { class: 'm-item m-task' + (t.done ? ' done' : '') });

  var chk = h('button', { class: 'm-check' + (t.done ? ' on' : ''), title: t.done ? 'Reabrir' : 'Completar' }, icon('todo'));
  chk.addEventListener('click', function () { planToggleDone(t); renderMobile(); });

  var main = h('div', { class: 'm-item-main' });
  main.appendChild(h('div', { class: 'm-item-text' }, t.title));
  var meta = h('div', { class: 'm-meta' });
  // Toque en el estado: pasa a la siguiente columna sin abrir nada.
  var st = planStatusOf(t);
  var stIdx = KAN.map(function (k) { return k[0]; }).indexOf(st);
  var stBtn = h('button', { class: 'm-tag m-status k-' + st, title: 'Estado: ' + kanbanLabel(st) + ' — tocar para cambiarlo' }, kanbanLabel(st));
  stBtn.addEventListener('click', function (e) { e.stopPropagation(); planSetStatus(t, KAN[(stIdx + 1) % KAN.length][0]); renderMobile(); });
  meta.appendChild(stBtn);
  var pr = planPriorityOf(t);
  var prBtn = h('button', { class: 'm-tag m-prio' + (pr ? ' prio-' + pr : ' prio-none'), title: planPriorityLabel(pr) + ' — tocar para cambiarla' }, pr ? planPriorityLabel(pr) : 'Prioridad');
  prBtn.addEventListener('click', function (e) { e.stopPropagation(); planCyclePriority(t); renderMobile(); });
  meta.appendChild(prBtn);
  if (carried) meta.appendChild(h('span', { class: 'm-tag warn', title: 'Pendiente desde ' + t.day }, 'de ' + t.day.slice(5)));
  if (t.remindAt && t.remindAt > now()) meta.appendChild(h('span', { class: 'm-tag rem' }, '⏰ ' + fmtShort(t.remindAt)));
  var linked = t.noteId && getNote(t.noteId);
  if (linked) meta.appendChild(h('span', { class: 'm-tag' }, '📄 ' + snippet(linked.title || 'Hoja')));
  if (meta.children.length) main.appendChild(meta);
  main.addEventListener('click', function () { tareasOpen[t.id] = !tareasOpen[t.id]; renderMobile(); });

  var more = h('button', { class: 'm-item-btn', title: 'Opciones' }, icon('more'));
  more.addEventListener('click', function (e) { e.stopPropagation(); mTaskSheet(t); });

  row.appendChild(h('div', { class: 'm-item-row' }, chk, main, more));

  // Botón de pasos bien visible, como en el escritorio: es lo que invita a desglosar.
  var abierta = !!tareasOpen[t.id];
  var pasosBtn = h('button', {
    class: 'm-steps-btn' + (abierta ? ' open' : '') + (t.subs.length ? ' has' : ' empty') + (t.subs.length && subsDone === t.subs.length ? ' all' : ''),
  }, icon(t.subs.length ? 'todo' : 'plus'),
     h('span', {}, t.subs.length ? (subsDone + ' de ' + t.subs.length + ' pasos') : 'Desglosar en pasos'),
     icon(abierta ? 'chevronDown' : 'chevron'));
  pasosBtn.addEventListener('click', function (e) { e.stopPropagation(); tareasOpen[t.id] = !abierta; renderMobile(); });
  row.appendChild(pasosBtn);

  if (t.subs.length) {
    row.appendChild(h('div', { class: 'm-bar thin' },
      h('div', { class: 'm-bar-fill', style: { width: Math.round(subsDone / t.subs.length * 100) + '%' } })));
  }
  if (tareasOpen[t.id]) {
    var subs = h('div', { class: 'm-subs' });
    t.subs.forEach(function (s) {
      var sChk = h('button', { class: 'm-check small' + (s.done ? ' on' : '') }, icon('todo'));
      sChk.addEventListener('click', function () { planSubToggle(t, s, !s.done); renderMobile(); });
      var del = h('button', { class: 'm-item-btn small', title: 'Quitar' }, icon('x'));
      del.addEventListener('click', function () { planSubRemove(t, s); renderMobile(); });
      // Toque largo (o doble toque) sobre el texto para editar el paso.
      var txt = h('span', { class: 'm-sub-txt' }, s.text);
      txt.addEventListener('click', function (e) {
        e.stopPropagation();
        mEditSheet('Editar el paso', s.text, 'Qué hay que hacer', function (v) { planSubSetText(t, s, v); renderMobile(); });
      });
      subs.appendChild(h('div', { class: 'm-sub-item' + (s.done ? ' done' : '') }, sChk, txt, del));
    });
    var si = h('input', { class: 'm-sub-inp', placeholder: 'Siguiente paso… (Enter)', enterkeyhint: 'done' });
    si.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!planSubAdd(t, si.value)) return;
      tareasOpen[t.id] = true;
      renderMobile();
      var again = mBodyEl.querySelector('.m-sub-inp');
      if (again) again.focus();
    });
    subs.appendChild(si);
    row.appendChild(subs);
  }
  return row;
}
function mTaskSheet(t) {
  mSheet(snippet(t.title), [
    { icon: 'bell', label: 'Recordarme…', onClick: function () { mRemindSheet('task', t, t.title); } },
    { icon: 'edit', label: 'Editar el texto', onClick: function () {
      mEditSheet('Editar tarea', t.title, 'Descripción de la tarea', function (v) { t.title = v; save(); renderMobile(); });
    } },
    { icon: 'board', label: 'Cambiar el estado', hint: kanbanLabel(planStatusOf(t)), onClick: function () {
      mSheet('Estado de «' + snippet(t.title) + '»', KAN.map(function (k) {
        return { icon: 'board', label: k[1], hint: planStatusOf(t) === k[0] ? 'actual' : '', onClick: function () { planSetStatus(t, k[0]); renderMobile(); } };
      }));
    } },
    { icon: 'popout', label: 'Llevarla al lienzo', hint: 'con sus pasos', onClick: function () {
      taskToCanvas(t);
      setMobileTab('kanban');
    } },
    { sep: true },
    { icon: 'trash', label: 'Eliminar la tarea', danger: true, onClick: function () {
      planDeleteTask(t);
      renderMobile();
    } },
  ]);
}

// ---------- Pestaña 2: Kanban ----------
function mKanCol() {
  var c = ui && ui.mobileKanCol;
  for (var i = 0; i < KAN.length; i++) if (KAN[i][0] === c) return c;
  return 'todo';
}
function mSetKanCol(c) {
  ui.mobileKanCol = c;
  writeLS(LS_UI, JSON.stringify(ui));
  renderMobile();
  if (mBodyEl) mBodyEl.scrollTop = 0;
}
// Mueve una tarjeta al final de otra columna. No usa placeInColumn() para no
// disparar el aviso de escritorio (que abre un menú anclado, incómodo en móvil).
function mMoveKanban(b, status) {
  var col = kanbanItems(status).filter(function (x) { return x.id !== b.id; });
  var last = col[col.length - 1];
  b.kanban = status;
  if (!b.kanbanAt) b.kanbanAt = now();
  b.kanbanOrder = last ? kanbanOrderOf(last) + 1 : now();
  touchNote(b.noteId);
  logChange('Kanban: ' + kanbanLabel(status), reminderText(b));
  save();
  renderMobile();
}
// Crea la tarjeta como bloque real (nota propia), igual que el Kanban de escritorio.
function mAddKanbanCard(text, status) {
  var secId = ensureKanbanDefaultSection();
  var t = now();
  var note = { id: uid(), sectionId: secId, title: text.length > 40 ? text.slice(0, 40) + '…' : text, createdAt: t, updatedAt: t };
  data.notes.push(note);
  var b = addBlock(note.id, 'text', 36 + Math.round(Math.random() * 140), 36 + Math.round(Math.random() * 120));
  b.content = b.content || {};
  b.content.text = text;
  // Sin clasificar como "idea" a propósito: así la pestaña Ideas sigue siendo la
  // bandeja de lo que aún no has procesado y no se llena de tarjetas del Kanban.
  b.kanban = status || 'todo';
  b.kanbanAt = t;
  b.kanbanOrder = t;
  logChange('Tarjeta creada (móvil)', text);
  save();
  return b;
}
// El tablero móvil enseña lo mismo que el de escritorio: las tarjetas del lienzo y
// las tareas del día, en la misma columna.
function mRenderKanban() {
  var cur = mKanCol();
  var seg = h('div', { class: 'm-seg' });
  KAN.forEach(function (k) {
    var n = boardAll(k[0]).length;
    seg.appendChild(h('button', { class: 'm-seg-btn k-' + k[0] + (k[0] === cur ? ' on' : ''), onclick: function () { mSetKanCol(k[0]); } },
      h('span', {}, k[1]), h('em', {}, String(n))));
  });
  mSubEl.appendChild(seg);

  var items = boardAll(cur);
  if (!items.length) {
    mBodyEl.appendChild(mEmpty('board',
      cur === 'done' ? 'Nada terminado todavía' : 'Columna vacía',
      cur === 'todo' ? 'Escribe abajo una tarjeta. Las tarjetas son notas reales: luego las verás en el lienzo del escritorio.'
        : 'Mueve tarjetas hasta aquí con las flechas de cada tarjeta.'));
    return;
  }
  items.forEach(function (it) {
    mBodyEl.appendChild(it.src === 'task' ? mKanTaskCard(it.ref, cur) : mKanCard(it.ref, cur));
  });
}
// Una tarea del día dentro del tablero móvil: mismos gestos que una tarjeta.
function mKanTaskCard(t, status) {
  t.subs = t.subs || [];
  var idx = KAN.map(function (k) { return k[0]; }).indexOf(status);
  var subsDone = planSubsDone(t);
  var card = h('div', { class: 'm-item m-kan m-kan-task' });
  var main = h('div', { class: 'm-item-main' });
  main.appendChild(h('div', { class: 'm-item-text' }, t.title));
  var meta = h('div', { class: 'm-meta' });
  meta.appendChild(h('span', { class: 'm-tag ok' }, '🗓 Del día'));
  if (t.subs.length) meta.appendChild(h('span', { class: 'm-tag' + (subsDone === t.subs.length ? ' ok' : '') }, subsDone + '/' + t.subs.length + ' pasos'));
  if (t.remindAt && t.remindAt > now()) meta.appendChild(h('span', { class: 'm-tag rem' }, '⏰ ' + fmtShort(t.remindAt)));
  main.appendChild(meta);
  var more = h('button', { class: 'm-item-btn', title: 'Opciones' }, icon('more'));
  more.addEventListener('click', function (e) { e.stopPropagation(); mTaskSheet(t); });
  card.appendChild(h('div', { class: 'm-item-row' }, main, more));
  if (t.subs.length) {
    card.appendChild(h('div', { class: 'm-bar thin' },
      h('div', { class: 'm-bar-fill', style: { width: Math.round(subsDone / t.subs.length * 100) + '%' } })));
  }
  var moves = h('div', { class: 'm-move' });
  if (idx > 0) moves.appendChild(h('button', { class: 'm-move-btn', onclick: function () { planSetStatus(t, KAN[idx - 1][0]); renderMobile(); } },
    icon('chevronL'), KAN[idx - 1][1]));
  if (idx < KAN.length - 1) moves.appendChild(h('button', { class: 'm-move-btn next', onclick: function () { planSetStatus(t, KAN[idx + 1][0]); renderMobile(); } },
    KAN[idx + 1][1], icon('chevron')));
  card.appendChild(moves);
  return card;
}
function mKanCard(b, status) {
  var note = getNote(b.noteId);
  var sec = note ? getSection(note.sectionId) : null;
  var nb = sec ? getNotebook(sec.notebookId) : null;
  var idx = KAN.map(function (k) { return k[0]; }).indexOf(status);
  var card = h('div', { class: 'm-item m-kan' + (b.blocked ? ' blocked' : '') + (b.important ? ' important' : '') });

  var main = h('div', { class: 'm-item-main' });
  main.appendChild(h('div', { class: 'm-item-text' }, (b.content && b.content.text) ? b.content.text : typeMeta(b.type).label));
  var meta = h('div', { class: 'm-meta' });
  if (nb) meta.appendChild(h('span', { class: 'm-tag' }, (nb.emoji ? nb.emoji + ' ' : '📓 ') + nb.name));
  if (b.blocked) meta.appendChild(h('span', { class: 'm-tag warn' }, '⛔ Bloqueada'));
  if (b.reminder && !b.reminder.done) meta.appendChild(h('span', { class: 'm-tag rem' }, '⏰ ' + fmtShort(b.reminder.at)));
  if (meta.children.length) main.appendChild(meta);

  var more = h('button', { class: 'm-item-btn', title: 'Opciones' }, icon('more'));
  more.addEventListener('click', function (e) { e.stopPropagation(); mKanSheet(b, status); });
  card.appendChild(h('div', { class: 'm-item-row' }, main, more));

  var moves = h('div', { class: 'm-move' });
  if (idx > 0) moves.appendChild(h('button', { class: 'm-move-btn', onclick: function () { mMoveKanban(b, KAN[idx - 1][0]); } },
    icon('chevronL'), KAN[idx - 1][1]));
  if (idx < KAN.length - 1) moves.appendChild(h('button', { class: 'm-move-btn next', onclick: function () { mMoveKanban(b, KAN[idx + 1][0]); } },
    KAN[idx + 1][1], icon('chevron')));
  card.appendChild(moves);
  return card;
}
function mKanSheet(b, status) {
  var txt = (b.content && b.content.text) || '';
  var items = [
    { icon: 'edit', label: 'Editar el texto', onClick: function () {
      mEditSheet('Editar tarjeta', txt, 'Texto de la tarjeta', function (v) {
        b.content = b.content || {};
        b.content.text = v;
        var note = getNote(b.noteId);
        if (note) note.title = v.length > 40 ? v.slice(0, 40) + '…' : v;
        touchNote(b.noteId);
        logChange('Tarjeta editada (móvil)', v);
        save();
        renderMobile();
      });
    } },
    { icon: 'bell', label: 'Recordarme…', onClick: function () { mRemindSheet('block', b, txt || 'tarjeta'); } },
    { icon: 'bellRing', label: b.blocked ? 'Quitar el bloqueo' : 'Marcar como bloqueada', on: !!b.blocked, onClick: function () {
      b.blocked = !b.blocked;
      touchNote(b.noteId);
      save();
      renderMobile();
    } },
    { icon: 'star', label: b.important ? 'Quitar importante' : 'Marcar como importante', on: !!b.important, onClick: function () {
      b.important = !b.important;
      touchNote(b.noteId);
      save();
      renderMobile();
    } },
    { sep: true },
  ];
  KAN.forEach(function (k) {
    if (k[0] === status) return;
    items.push({ icon: 'board', label: 'Mover a «' + k[1] + '»', onClick: function () { mMoveKanban(b, k[0]); } });
  });
  items.push({ sep: true });
  items.push({ icon: 'todo', label: 'Pasarla al plan de hoy', onClick: function () {
    mAddTask(txt || 'Tarjeta', b.noteId);
    setMobileTab('tareas');
    toast('Añadida a las tareas de hoy.', 'ok');
  } });
  items.push({ icon: 'layout', label: 'Abrirla en el escritorio', onClick: function () {
    selectNote(b.noteId);
    setMobileMode(false);
  } });
  items.push({ icon: 'x', label: 'Quitar del Kanban', hint: 'La nota se conserva', danger: true, onClick: function () {
    b.kanban = null;
    logChange('Quitado del Kanban', reminderText(b));
    save();
    renderMobile();
  } });
  mSheet(snippet(txt) || 'Tarjeta', items);
}

// ---------- Pestaña 3: Ideas rápidas ----------
// Todas las notas clasificadas como "idea", vengan de donde vengan (móvil o lienzo).
function mIdeas() {
  return (data.blocks || []).filter(function (b) {
    return noteRank(b) === 'idea' && ((b.content && b.content.text) || '').trim();
  }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
}
// Hoja donde caen las ideas capturadas desde el móvil (se crea la primera vez).
function mIdeaNoteId() {
  if (ui.mobileIdeaNote && getNote(ui.mobileIdeaNote)) return ui.mobileIdeaNote;
  var found = (data.notes || []).find(function (n) { return (n.title || '') === '💡 Ideas rápidas'; });
  if (!found) {
    var t = now();
    found = { id: uid(), sectionId: ensureKanbanDefaultSection(), title: '💡 Ideas rápidas', createdAt: t, updatedAt: t };
    data.notes.push(found);
    logChange('Hoja creada', found.title);
  }
  ui.mobileIdeaNote = found.id;
  writeLS(LS_UI, JSON.stringify(ui));
  return found.id;
}
function mAddIdea(text) {
  var noteId = mIdeaNoteId();
  var n = blocksOf(noteId).length;
  // En columnas de 3: al abrir la hoja en el escritorio se ven ordenadas.
  var b = addBlock(noteId, 'text', 40 + (n % 3) * 300, 40 + Math.floor(n / 3) * 170);
  b.content = b.content || {};
  b.content.text = text;
  b.content.rank = 'idea';
  logChange('Idea rápida (móvil)', snippet(text));
  save();
  return b;
}
function mRenderIdeas() {
  var ideas = mIdeas();
  mSubEl.appendChild(h('div', { class: 'm-sub-row' },
    h('span', { class: 'm-sub-title' }, 'Lo que no quieres olvidar'),
    h('span', { class: 'm-sub-count' }, ideas.length ? String(ideas.length) : '')));
  if (!ideas.length) {
    mBodyEl.appendChild(mEmpty('bulb', 'Ninguna idea guardada',
      'Escríbela abajo tal cual se te ocurra. Después podrás mandarla al Kanban, convertirla en tarea o desarrollarla en el lienzo.'));
    return;
  }
  ideas.forEach(function (b) { mBodyEl.appendChild(mIdeaRow(b)); });
}
function mIdeaRow(b) {
  var note = getNote(b.noteId);
  var row = h('div', { class: 'm-item m-idea' });
  var main = h('div', { class: 'm-item-main' });
  main.appendChild(h('div', { class: 'm-item-text' }, (b.content && b.content.text) || ''));
  var meta = h('div', { class: 'm-meta' });
  meta.appendChild(h('span', { class: 'm-tag' }, fmtShort(b.createdAt || now())));
  if (b.kanban) meta.appendChild(h('span', { class: 'm-tag ok' }, '📋 ' + kanbanLabel(b.kanban)));
  // Hoja de origen, solo si aporta algo (no la bandeja de ideas ni un título que repite el texto).
  var txt0 = ((b.content && b.content.text) || '').trim();
  if (note && note.id !== ui.mobileIdeaNote && txt0.indexOf((note.title || '').replace(/…$/, '')) !== 0) {
    meta.appendChild(h('span', { class: 'm-tag' }, '📄 ' + snippet(note.title || 'Hoja')));
  }
  main.appendChild(meta);
  var more = h('button', { class: 'm-item-btn', title: 'Opciones' }, icon('more'));
  more.addEventListener('click', function (e) { e.stopPropagation(); mIdeaSheet(b); });
  row.appendChild(h('div', { class: 'm-item-row' }, main, more));

  var acts = h('div', { class: 'm-move' });
  if (!b.kanban) {
    acts.appendChild(h('button', { class: 'm-move-btn', onclick: function () {
      mMoveKanban(b, 'todo');
      toast('Al Kanban, en «Por hacer».', 'ok');
    } }, icon('board'), 'Al Kanban'));
  }
  acts.appendChild(h('button', { class: 'm-move-btn', onclick: function () {
    mAddTask(((b.content && b.content.text) || 'Idea'), b.noteId);
    toast('Añadida a las tareas de hoy.', 'ok');
    renderMobile();
  } }, icon('todo'), 'A tareas'));
  row.appendChild(acts);
  return row;
}
function mIdeaSheet(b) {
  var txt = (b.content && b.content.text) || '';
  mSheet(snippet(txt) || 'Idea', [
    { icon: 'edit', label: 'Editar la idea', onClick: function () {
      mEditSheet('Editar idea', txt, 'Tu idea', function (v) {
        b.content = b.content || {};
        b.content.text = v;
        touchNote(b.noteId);
        logChange('Idea editada (móvil)', snippet(v));
        save();
        renderMobile();
      });
    } },
    { icon: 'bell', label: 'Recordarme…', onClick: function () { mRemindSheet('block', b, txt || 'idea'); } },
    b.kanban
      ? { icon: 'x', label: 'Quitar del Kanban', onClick: function () { b.kanban = null; save(); renderMobile(); } }
      : { icon: 'board', label: 'Enviar al Kanban', onClick: function () { mMoveKanban(b, 'todo'); } },
    { icon: 'layout', label: 'Desarrollarla en el escritorio', onClick: function () { selectNote(b.noteId); setMobileMode(false); } },
    { sep: true },
    { icon: 'trash', label: 'Eliminar la idea', danger: true, onClick: function () {
      deleteBlock(b.id);
      renderMobile();
    } },
  ]);
}

// ---------- Estado vacío ----------
function mEmpty(ico, title, text) {
  return h('div', { class: 'm-empty' }, h('span', { class: 'm-empty-ico' }, icon(ico)),
    h('strong', {}, title), h('p', {}, text));
}
