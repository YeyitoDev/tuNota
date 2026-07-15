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
  if (b.reminder && b.reminder.label) return b.reminder.label; // recordatorio de una casilla concreta
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
// Sonidos de alarma (Web Audio, sin archivos). 'chime' es el estándar; se puede
// personalizar en el propio aviso o en el panel de recordatorio (ui.alarmSound).
var ALARM_SOUNDS = {
  chime: { label: 'Campanilla', notes: [[880, 0, 0.16], [1175, 0.18, 0.16], [1568, 0.36, 0.16]], type: 'sine', vol: 0.22 },
  ding: { label: 'Ding', notes: [[1318, 0, 0.5]], type: 'sine', vol: 0.25 },
  bell: { label: 'Campana', notes: [[660, 0, 0.7], [1320, 0, 0.5], [1980, 0, 0.3]], type: 'triangle', vol: 0.18 },
  digital: { label: 'Digital', notes: [[988, 0, 0.09], [988, 0.14, 0.09], [988, 0.28, 0.09], [1319, 0.5, 0.2]], type: 'square', vol: 0.1 },
  soft: { label: 'Suave', notes: [[523, 0, 0.4], [659, 0.1, 0.4], [784, 0.2, 0.5]], type: 'sine', vol: 0.14 },
  none: { label: 'Silencio', notes: [], type: 'sine', vol: 0 },
};
function playAlarmSound(kind) {
  var s = ALARM_SOUNDS[kind || (ui && ui.alarmSound) || 'chime'] || ALARM_SOUNDS.chime;
  if (!s.notes.length) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    s.notes.forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + n[1];
      o.type = s.type; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(s.vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + n[2]);
      o.connect(g); g.connect(ctx.destination);
      o.start(at); o.stop(at + n[2] + 0.02);
    });
  } catch (e) {}
}
function playBeep() { playAlarmSound(); }
function buildSoundSelect(cls) {
  var sel = h('select', { class: cls || 'rem-input', title: 'Sonido del aviso' });
  Object.keys(ALARM_SOUNDS).forEach(function (k) {
    var o = h('option', { value: k }, ALARM_SOUNDS[k].label);
    if (((ui && ui.alarmSound) || 'chime') === k) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', function () { ui.alarmSound = sel.value; save(); playAlarmSound(sel.value); });
  return sel;
}
// ---------- Exportar recordatorios al calendario (Google / Apple vía .ics) ----------
function calDates(at) {
  var p = function (n) { return String(n).padStart(2, '0'); };
  var f = function (d) { return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00Z'; };
  return { start: f(new Date(at)), end: f(new Date(at + 30 * 60000)) };
}
function calRRule(repeat) {
  if (repeat === 'daily') return 'FREQ=DAILY';
  if (repeat === 'weekly') return 'FREQ=WEEKLY';
  if (repeat === 'monthly') return 'FREQ=MONTHLY';
  if (repeat === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  return '';
}
function calTitle(b) { return (b.reminder && b.reminder.label) || reminderText(b); }
// Abre Google Calendar con el evento prellenado (sin OAuth).
function openGoogleCalendar(b) {
  if (!b.reminder || typeof b.reminder.at !== 'number') return;
  var d = calDates(b.reminder.at), rr = calRRule(b.reminder.repeat);
  var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(calTitle(b)) +
    '&dates=' + d.start + '/' + d.end +
    '&details=' + encodeURIComponent('Recordatorio de tuNota');
  if (rr) url += '&recur=' + encodeURIComponent('RRULE:' + rr);
  window.open(url, '_blank');
}
// Descarga un .ics con alarma: Apple Calendar / Outlook lo abren directamente.
function downloadICS(b) {
  if (!b.reminder || typeof b.reminder.at !== 'number') return;
  var d = calDates(b.reminder.at), rr = calRRule(b.reminder.repeat);
  var esc = function (s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); };
  var lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tuNota//ES', 'BEGIN:VEVENT',
    'UID:' + b.id + '-' + b.reminder.at + '@tunota',
    'DTSTAMP:' + calDates(now()).start,
    'DTSTART:' + d.start, 'DTEND:' + d.end,
    'SUMMARY:' + esc(calTitle(b)),
    'DESCRIPTION:Recordatorio de tuNota',
  ];
  if (rr) lines.push('RRULE:' + rr);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(calTitle(b)), 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var a = h('a', { href: URL.createObjectURL(blob), download: 'recordatorio-tunota.ics' });
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// ---------- Exportar a Recordatorios/Calendario de iOS (.ics, sin OAuth) ----------
// Reúne los recordatorios (con hora → VEVENT con alarma) y las tareas sin completar
// (casillas "- [ ]" → VTODO) de una nota y genera un .ics que iOS abre para añadirlos.
function collectNoteTodos(noteId) {
  var items = [];
  blocksOf(noteId).forEach(function (b) {
    if (b.reminder && !b.reminder.done && typeof b.reminder.at === 'number') {
      items.push({ kind: 'event', title: calTitle(b), at: b.reminder.at, repeat: b.reminder.repeat, uid: b.id + '-rem' });
    }
    var txt = b.content && b.content.text;
    if (txt) String(txt).replace(/\r\n?/g, '\n').split('\n').forEach(function (line, i) {
      var m = /^\s*[-*+•·◦▪‣]\s+\[( )\]\s+(.+)$/.exec(line); // solo tareas SIN completar
      if (m && m[2].trim()) items.push({ kind: 'todo', title: m[2].trim(), uid: b.id + '-t' + i });
    });
  });
  return items;
}
function exportNoteRemindersICS() {
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { toast('Abre una nota primero.', 'warn'); return; }
  var items = collectNoteTodos(ui.currentNoteId);
  if (!items.length) { toast('Esta nota no tiene tareas (- [ ]) ni recordatorios con hora.', 'warn'); return; }
  var esc = function (s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); };
  var stamp = calDates(now()).start;
  var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tuNota//iOS//ES', 'CALSCALE:GREGORIAN'];
  items.forEach(function (it) {
    if (it.kind === 'event') {
      var d = calDates(it.at), rr = calRRule(it.repeat);
      out.push('BEGIN:VEVENT', 'UID:' + it.uid + '@tunota', 'DTSTAMP:' + stamp, 'DTSTART:' + d.start, 'DTEND:' + d.end, 'SUMMARY:' + esc(it.title), 'DESCRIPTION:Recordatorio de tuNota');
      if (rr) out.push('RRULE:' + rr);
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(it.title), 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT');
    } else {
      out.push('BEGIN:VTODO', 'UID:' + it.uid + '@tunota', 'DTSTAMP:' + stamp, 'SUMMARY:' + esc(it.title), 'STATUS:NEEDS-ACTION', 'END:VTODO');
    }
  });
  out.push('END:VCALENDAR');
  var blob = new Blob([out.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var name = (getNote(ui.currentNoteId).title || 'nota').replace(/[^\wÀ-ſ -]+/g, '').trim().slice(0, 40) || 'nota';
  var a = h('a', { href: URL.createObjectURL(blob), download: 'recordatorios-' + name + '.ics' });
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  var ev = items.filter(function (x) { return x.kind === 'event'; }).length, td = items.length - ev;
  logChange('Recordatorios exportados (iOS)', ev + ' con hora · ' + td + ' tareas');
  toast('Descargado (' + items.length + '). Ábrelo en tu iPhone para añadirlo a Recordatorios / Calendario.', 'ok');
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
  panel.appendChild(h('div', { class: 'alarm-sound-row' },
    h('span', { class: 'alarm-sound-lbl' }, 'Sonido'),
    buildSoundSelect('alarm-sound-sel')
  ));
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
  var applyReminder = function () {
    var at = new Date(dt.value).getTime();
    if (isNaN(at)) { msg.textContent = 'Elige una fecha y hora v\u00e1lidas.'; return null; }
    var label = b.reminder && b.reminder.label;
    b.reminder = { at: at, repeat: rep.value, done: false };
    if (label) b.reminder.label = label;
    ensureNotifyPermission();
    return at;
  };
  var saveBtn = h('button', { class: 'rem-save', onclick: function () {
    var at = applyReminder();
    if (at == null) return;
    logChange('Recordatorio creado', fmtWhen(at));
    save();
    closeReminderPicker();
    renderCanvas();
    checkReminders();
    if (typeof scheduleAppleSync === 'function') scheduleAppleSync();
  } }, 'Guardar');
  var actions = h('div', { class: 'rem-actions' });
  if (exists) actions.appendChild(h('button', { class: 'rem-del', onclick: function () { b.reminder = null; logChange('Recordatorio quitado', ''); save(); closeReminderPicker(); renderCanvas(); } }, 'Quitar'));
  actions.appendChild(saveBtn);
  pop.appendChild(h('div', { class: 'rem-title' }, icon('bell'), 'Recordatorio'));
  pop.appendChild(h('label', { class: 'rem-lbl' }, 'Fecha y hora'));
  pop.appendChild(dt);
  pop.appendChild(h('label', { class: 'rem-lbl' }, 'Repetir'));
  pop.appendChild(rep);
  pop.appendChild(h('label', { class: 'rem-lbl' }, 'Sonido del aviso'));
  pop.appendChild(buildSoundSelect());
  pop.appendChild(h('label', { class: 'rem-lbl' }, 'A\u00f1adir a tu calendario'));
  pop.appendChild(h('div', { class: 'rem-cal-row' },
    h('button', { class: 'rem-cal-btn', title: 'Abre Google Calendar con el evento y su alarma', onclick: function () { if (applyReminder() == null) return; save(); renderCanvas(); openGoogleCalendar(b); } }, 'Google Calendar'),
    h('button', { class: 'rem-cal-btn', title: 'Descarga un archivo .ics con alarma (Apple Calendar / Outlook)', onclick: function () { if (applyReminder() == null) return; save(); renderCanvas(); downloadICS(b); } }, 'Apple / .ics')
  ));
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
  if (typeof scheduleAppleSync === 'function') scheduleAppleSync();
}
// ---------- Vista vertical: los bloques de la nota en lista, importantes primero ----------
function openVerticalView() {
  closeVerticalView();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { toast('Abre una nota primero.', 'warn'); return; }
  var overlay = h('div', { class: 'overlay', id: 'vertOverlay', onclick: function (e) { if (e.target === overlay) closeVerticalView(); } });
  var panel = h('div', { class: 'log-panel vert-panel' });
  panel.appendChild(h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('panel'), 'Vista vertical — ' + getNote(ui.currentNoteId).title),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeVerticalView }, icon('x'))
  ));
  var body = h('div', { class: 'log-body vert-body' });
  var bs = blocksOf(ui.currentNoteId).slice().sort(function (a, b2) {
    if (!!a.important !== !!b2.important) return a.important ? -1 : 1; // importantes arriba
    return (a.y - b2.y) || (a.x - b2.x);
  });
  if (!bs.length) body.appendChild(h('p', { class: 'tree-empty' }, 'Esta nota aún no tiene bloques.'));
  bs.forEach(function (b) {
    var text = aiBlockText(b) || '';
    var item = h('div', { class: 'vert-item' + (b.important ? ' important' : '') });
    var head = h('div', { class: 'vert-item-head' },
      icon(typeMeta(b.type).icon),
      h('span', { class: 'vert-item-title' }, b.title || typeMeta(b.type).label));
    if (b.important) head.appendChild(h('span', { class: 'vert-star' }, icon('star')));
    if (b.reminder && !b.reminder.done) head.appendChild(h('span', { class: 'vert-rem' }, icon('clock'), fmtShort(b.reminder.at)));
    item.appendChild(head);
    if (b.type === 'markdown' && text) {
      var md = h('div', { class: 'vert-item-md md-render' }); md.innerHTML = renderMarkdown(text.slice(0, 700)); item.appendChild(md);
    } else if (text) {
      item.appendChild(h('div', { class: 'vert-item-text' }, text.slice(0, 400) + (text.length > 400 ? '…' : '')));
    }
    item.addEventListener('click', function () { closeVerticalView(); focusBlock(b.id); });
    body.appendChild(item);
  });
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
function closeVerticalView() { var o = document.getElementById('vertOverlay'); if (o) o.remove(); }

// ---------- Enviar por Telegram ----------
// Compartir (sin configurar nada): abre Telegram con el texto listo para elegir chat.
function telegramShare(text) {
  var t = String(text || '').trim().slice(0, 3500);
  if (!t) { toast('No hay texto que enviar.', 'warn'); return; }
  window.open('https://t.me/share/url?url=' + encodeURIComponent('tuNota') + '&text=' + encodeURIComponent(t), '_blank');
}
// Bot del servidor (.env TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID): envía directo al grupo.
function telegramSend(text) {
  var t = String(text || '').trim();
  if (!t) { toast('No hay texto que enviar.', 'warn'); return; }
  apiFetch('api/telegram', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }),
  }).then(aiHandleJSON).then(function () {
    toast('Enviado a Telegram ✈️', 'ok');
  }).catch(function (e) {
    toast('Telegram: ' + ((e && e.message) || e), 'warn');
  });
}
function blockShareText(b) {
  var head = b.title ? b.title + '\n' : '';
  return head + aiBlockText(b);
}
// Duplica un bloque (contenido clonado; los blobs se copian de verdad para
// que borrar una imagen del duplicado no rompa el original).
function duplicateBlock(b) {
  pushUndo('Duplicar bloque');
  var t = now();
  var copy = JSON.parse(JSON.stringify(b));
  copy.id = uid();
  copy.x = b.x + 28;
  copy.y = b.y + 28;
  copy.createdAt = t;
  copy.updatedAt = t;
  delete copy.kanban; delete copy.kanbanAt; delete copy.kanbanOrder;
  delete copy.reminder;
  var c = copy.content || {};
  var reBlob = function (ref) { return isBlobRef(ref) ? storeBlob(resolveSrc(ref)) : ref; };
  if (c.images) c.images = c.images.map(function (it) {
    return typeof it === 'string' ? reBlob(it) : Object.assign({}, it, { src: reBlob(it.src) });
  });
  if (isBlobRef(c.pdf)) c.pdf = reBlob(c.pdf);
  if (c.result && isBlobRef(c.result.img)) c.result.img = reBlob(c.result.img);
  data.blocks.push(copy);
  touchNote(copy.noteId);
  logChange('Bloque duplicado', snippet((c.text || '')));
  save();
  renderCanvas();
  cardEnterAnim(cardEl(copy.id));
  return copy;
}
// Duplica todos los bloques seleccionados (y los conectores entre ellos); selecciona las copias.
function duplicateSelected() {
  var ids = Object.keys(selectedIds).filter(function (id) { return getBlockById(id); });
  if (!ids.length) return;
  if (ids.length === 1) { var one = duplicateBlock(getBlockById(ids[0])); if (one) { clearSelection(); selectedIds[one.id] = true; refreshSelectionUI(); } return; }
  pushUndo('Duplicar selección');
  var t = now(), map = {};
  var reBlob = function (ref) { return isBlobRef(ref) ? storeBlob(resolveSrc(ref)) : ref; };
  ids.forEach(function (id) {
    var b = getBlockById(id), copy = JSON.parse(JSON.stringify(b));
    copy.id = uid(); copy.x = b.x + 28; copy.y = b.y + 28; copy.createdAt = t; copy.updatedAt = t;
    delete copy.kanban; delete copy.kanbanAt; delete copy.kanbanOrder; delete copy.reminder;
    var c = copy.content || {};
    if (c.images) c.images = c.images.map(function (it) { return typeof it === 'string' ? reBlob(it) : Object.assign({}, it, { src: reBlob(it.src) }); });
    if (isBlobRef(c.pdf)) c.pdf = reBlob(c.pdf);
    if (c.result && isBlobRef(c.result.img)) c.result.img = reBlob(c.result.img);
    data.blocks.push(copy); map[id] = copy.id;
  });
  (data.links || []).slice().forEach(function (l) {
    if (map[l.a] && map[l.b]) data.links.push({ id: uid(), noteId: l.noteId, a: map[l.a], b: map[l.b], label: l.label, type: l.type, style: l.style, createdAt: t });
  });
  touchNote(getBlockById(ids[0]).noteId);
  logChange('Selección duplicada', ids.length + ' bloques');
  save();
  renderCanvas();
  clearSelection();
  Object.keys(map).forEach(function (o) { selectedIds[map[o]] = true; });
  refreshSelectionUI();
}

function openCardMenu(b, anchor) {
  closeCardMenu();
  var backdrop = h('div', { class: 'pop-backdrop', id: 'cardMenuBackdrop', onmousedown: function (e) { if (e.target === backdrop) closeCardMenu(); } });
  var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('button', { class: 'cm-item' + (b.important ? ' active' : ''), onclick: function () { toggleImportant(b); closeCardMenu(); } },
    icon('star'), h('span', {}, b.important ? 'Quitar de importantes' : 'Marcar como importante')));
  var selN = Object.keys(selectedIds).length;
  var dupAll = selectedIds[b.id] && selN > 1;  // si el bloque es parte de una selección, duplica toda
  pop.appendChild(h('button', { class: 'cm-item', onclick: function () { if (dupAll) duplicateSelected(); else duplicateBlock(b); closeCardMenu(); } },
    icon('copy'), h('span', {}, dupAll ? 'Duplicar selección (' + selN + ')' : 'Duplicar bloque')));
  pop.appendChild(h('div', { class: 'cm-quick' },
    h('button', { class: 'cm-chip', title: 'Traer al frente', onclick: function () { bringToFront(b); closeCardMenu(); } }, '⤒ Al frente'),
    h('button', { class: 'cm-chip', title: 'Enviar al fondo', onclick: function () { sendToBack(b); closeCardMenu(); } }, '⤓ Al fondo')
  ));
  // Grupo: meter/sacar este bloque de un grupo (contenido dentro de contenido).
  var curG = groupOfBlock(b.id);
  var otherGs = groupsOf(b.noteId).filter(function (g) { return g !== curG; });
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('shapes'), 'Grupo'));
  if (curG) {
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { removeBlockFromGroup(curG, b.id); closeCardMenu(); } },
      icon('x'), h('span', {}, 'Sacar de «' + curG.name + '»')));
  }
  var gRow = h('div', { class: 'cm-quick' });
  if (!curG) gRow.appendChild(h('button', { class: 'cm-chip', title: 'Crear un grupo nuevo con este bloque', onclick: function () { clearSelection(); selectedIds[b.id] = true; createGroupFromSelection(); closeCardMenu(); } }, '＋ Nuevo grupo'));
  otherGs.forEach(function (g) {
    gRow.appendChild(h('button', { class: 'cm-chip', title: 'Meter este bloque en el grupo', onclick: function () { addBlockToGroup(g, b.id); closeCardMenu(); } }, '→ ' + g.name));
  });
  pop.appendChild(gRow);
  if (b.type === 'text' || b.type === 'idea' || b.type === 'image' || b.type === 'freeimage') {
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
  if (aiCanActOn(b)) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    pop.appendChild(h('div', { class: 'cm-label' }, icon('spark'), 'IA sobre este bloque'));
    var aiRow = h('div', { class: 'cm-quick cm-ai' });
    AI_BLOCK_ACTIONS.forEach(function (a) {
      aiRow.appendChild(h('button', {
        class: 'cm-chip',
        title: a.mode === 'replace' ? 'Reemplaza el texto (Ctrl+Z deshace)' : 'Crea un bloque enlazado con el resultado',
        onclick: function () { closeCardMenu(); aiBlockAction(b, a); },
      }, a.label));
    });
    if (BACKEND.search) {
      aiRow.appendChild(h('button', {
        class: 'cm-chip',
        title: 'Busca en internet sobre el contenido de este bloque y crea un bloque enlazado con las fuentes',
        onclick: function () { closeCardMenu(); aiWebSearchBlock(b); },
      }, '🌐 Buscar en la web'));
    }
    if (b.type === 'idea') {
      aiRow.appendChild(h('button', {
        class: 'cm-chip cm-chip-idea',
        title: 'La IA elige la metodología (Design Thinking, Lean Startup, Game Design, Marketing) y desarrolla la idea en fases numeradas y agrupadas',
        onclick: function () { closeCardMenu(); aiStructureIdea(b); },
      }, '🧭 Estructurar idea'));
    }
    pop.appendChild(aiRow);
  }
  if (aiBlockText(b).trim() || b.title) {
    pop.appendChild(h('div', { class: 'cm-sep' }));
    var tgRow = h('div', { class: 'cm-quick' },
      h('button', { class: 'cm-chip', title: 'Abre Telegram con el texto del bloque para compartirlo', onclick: function () { closeCardMenu(); telegramShare(blockShareText(b)); } }, '✈️ Telegram'));
    if (BACKEND.telegram) tgRow.appendChild(h('button', { class: 'cm-chip', title: 'Enviar directo al grupo configurado en el servidor', onclick: function () { closeCardMenu(); telegramSend(blockShareText(b)); } }, '🤖 Al grupo'));
    pop.appendChild(h('div', { class: 'cm-label' }, icon('send'), 'Compartir'));
    pop.appendChild(tgRow);
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
  var wasStatus = b.kanban;
  b.kanban = status;
  if (!b.kanbanAt) b.kanbanAt = now();
  b.kanbanOrder = (lo + hi) / 2;
  touchNote(b.noteId);
  save();
  renderCanvas();
  renderKanbanBody();
  // Al entrar en "Pendiente" sin recordatorio, ofrece crear uno (con alarma,
  // sonido y exportación al calendario desde el propio panel).
  if (status === 'todo' && wasStatus !== 'todo' && !(b.reminder && !b.reminder.done)) {
    toastAction('«' + reminderText(b) + '» está en Pendiente. ¿Le pongo un recordatorio?', 'Crear recordatorio', function (btn) {
      openReminderPicker(b, btn);
    });
  }
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
  var nb = sec ? getNotebook(sec.notebookId) : null;
  var loc = note ? note.title : 'Nota';
  // Muestra de qué libro viene la tarea: "📓 Libro · Sección"
  var bookLine = nb ? ((nb.emoji ? nb.emoji + ' ' : '📓 ') + nb.name + (sec ? ' · ' + sec.name : '')) : (sec ? sec.name : '');
  var task = (b.content && b.content.text) ? snippet(b.content.text) : typeMeta(b.type).label;
  var card = h('div', { class: 'kanban-card' + (b.important ? ' important' : ''), 'data-id': b.id, draggable: 'true' });
  card.addEventListener('dragstart', function (e) { dragKanId = b.id; card.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; } catch (er) {} });
  card.addEventListener('dragend', function () { card.classList.remove('dragging'); dragKanId = null; });
  var top = h('div', { class: 'kc-top' }, icon(typeMeta(b.type).icon), h('span', { class: 'kc-loc', title: loc }, loc));
  if (b.important) top.appendChild(h('span', { class: 'kc-star', title: 'Importante' }, icon('star')));
  card.appendChild(top);
  card.appendChild(h('div', { class: 'kc-task' }, task));
  if (bookLine) card.appendChild(h('div', { class: 'kc-sub' }, bookLine));
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
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    openSearch();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
    var da = document.activeElement;
    if (da && (da.tagName === 'TEXTAREA' || da.tagName === 'INPUT' || da.isContentEditable)) return;
    if (Object.keys(selectedIds).length) { e.preventDefault(); duplicateSelected(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
    var sa2 = document.activeElement;
    if (sa2 && (sa2.tagName === 'TEXTAREA' || sa2.tagName === 'INPUT' || sa2.isContentEditable)) return; // seleccionar texto nativo
    if (!ui.currentNoteId || document.querySelector('.overlay')) return;
    e.preventDefault();
    clearSelection();
    blocksOf(ui.currentNoteId).forEach(function (bb) { selectedIds[bb.id] = true; });
    refreshSelectionUI();
    return;
  }
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    var qe = document.activeElement;
    if (!(qe && (qe.tagName === 'TEXTAREA' || qe.tagName === 'INPUT' || qe.isContentEditable))) {
      e.preventDefault();
      openShortcuts();
      return;
    }
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
// Pegar (Ctrl+V) una captura/imagen o texto en el tablero -> crea una tarjeta con el contenido.
document.addEventListener('paste', function (e) {
  var a = document.activeElement;
  // Si se esta editando una nota/idea, su propio manejador ya agrega la imagen/texto a esa tarjeta.
  if (a && a.classList && a.classList.contains('card-ta') && !a.classList.contains('mono')) return;
  // No secuestrar el pegado en otros campos de edicion (codigo, titulos, celdas, etc.).
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
  if (!ui.currentNoteId || !getNote(ui.currentNoteId) || !canvasContentEl) return;
  var cd = e.clipboardData;
  if (!cd) return;

  // Imagenes primero.
  var items = cd.items;
  var files = [];
  if (items) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
  }
  if (files.length) {
    e.preventDefault();
    var cx, cy, wrap = document.getElementById('canvas');
    var r = wrap ? wrap.getBoundingClientRect() : null;
    if (lastMouse.over) { cx = lastMouse.x; cy = lastMouse.y; }
    else if (r) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    else { cx = 220; cy = 200; }
    var b = createAt(cx, cy, 'freeimage');
    if (!b) return;
    var el = cardEl(b.id);
    addImagesToBlock(b, files, function () {
      if (!el) return;
      var media = el.querySelector('.freeimg-media');
      if (media) renderFreeImage(media, b);
      fitImageCard(el, b);
      drawLinks();
    });
    return;
  }

  // Texto plano: detectar Markdown y crear el bloque adecuado.
  var text = cd.getData('text/plain');
  if (text && text.trim()) {
    e.preventDefault();
    var cx2, cy2, wrap2 = document.getElementById('canvas');
    var r2 = wrap2 ? wrap2.getBoundingClientRect() : null;
    if (lastMouse.over) { cx2 = lastMouse.x; cy2 = lastMouse.y; }
    else if (r2) { cx2 = r2.left + r2.width / 2; cy2 = r2.top + r2.height / 2; }
    else { cx2 = 220; cy2 = 200; }
    var isMd = looksLikeMarkdown(text);
    var b2 = createAt(cx2, cy2, isMd ? 'markdown' : 'text');
    if (!b2) return;
    b2.content = b2.content || {};
    b2.content.text = text;
    var el2 = cardEl(b2.id);
    if (el2) {
      if (isMd) {
        var view = el2.querySelector('.md-render');
        var ta = el2.querySelector('.md-src');
        if (view) view.innerHTML = renderMarkdown(text);
        if (ta) ta.value = text;
        b2.width = 420; b2.height = 320;
      } else {
        var tta = el2.querySelector('.card-ta');
        if (tta) tta.value = text;
        b2.width = 320; b2.height = 220;
      }
      el2.style.width = b2.width + 'px';
      el2.style.height = b2.height + 'px';
    }
    logChange(isMd ? 'Markdown pegado' : 'Texto pegado', snippet(text));
    save(); drawLinks();
  }
});
document.addEventListener('mousedown', function (e) {
  if (radialEl && !e.target.closest('.radial')) closeRadial();
});
window.addEventListener('blur', closeRadial);
window.addEventListener('blur', function () { setLinkMode(false); });
