/* tuNota — Seed inicial, recordatorios/alarmas, notas rápidas, Kanban y atajos globales.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

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
    writeLS(LS_UI, JSON.stringify(ui));
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
