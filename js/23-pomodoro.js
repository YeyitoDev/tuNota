/* tuNota — Pomodoro: enfoque cronometrado sobre UNA tarea concreta.
   Solo hay una sesión activa a la vez (eso es un pomodoro) y vive en `data.pomo`, así que
   sobrevive a las recargas, viaja en las copias de seguridad y se ve igual desde el panel de
   Tareas (js/22), el móvil (js/21) o cualquier ventana abierta.
   Cargado en orden desde index.html; comparte el ámbito global (sin build). */
'use strict';

var POMO_TICK = null;
var POMO_MINUTOS = [15, 25, 50];   // los clásicos: corto, pomodoro y bloque largo

// Preferencias del usuario: duración del foco, del descanso y si el descanso arranca solo.
function pomoCfg() {
  if (!ui.pomo || typeof ui.pomo !== 'object') ui.pomo = {};
  var p = ui.pomo;
  if (!(p.focus > 0)) p.focus = 25;
  if (!(p.rest > 0)) p.rest = 5;
  if (typeof p.autoRest !== 'boolean') p.autoRest = true;
  return p;
}
function pomoGet() { return (data && data.pomo && data.pomo.id) ? data.pomo : null; }
function pomoIsOn(src, id) { var s = pomoGet(); return !!(s && s.src === src && s.id === id); }
function pomoLeft(s) {
  s = s || pomoGet();
  if (!s) return 0;
  return Math.max(0, s.paused ? (s.leftMs || 0) : (s.endsAt - now()));
}
function pomoFmt(ms) {
  var t = Math.max(0, Math.round(ms / 1000));
  return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
}
function pomoRefOf(src, id) { return src === 'block' ? getBlockById(id) : planTaskById(id); }
function pomoOwner(s) { s = s || pomoGet(); return s ? pomoRefOf(s.src, s.id) : null; }
function pomoTitleOf(src, ref) {
  if (!ref) return 'Tarea';
  return src === 'block' ? (snippet((ref.content && ref.content.text) || '') || 'Tarjeta') : (snippet(ref.title || '') || 'Tarea');
}
// Minutos de foco acumulados y pomodoros completados de una tarea/tarjeta.
function pomoDoneOf(ref) { return (ref && ref.pomos) || 0; }
function pomoMinsOf(ref) { return Math.round(((ref && ref.focusMs) || 0) / 60000); }

// ---------- Control de la sesión ----------
function pomoStart(src, id, mins, mode) {
  var ref = pomoRefOf(src, id);
  if (!ref) return;
  var cfg = pomoCfg();
  mode = mode === 'rest' ? 'rest' : 'focus';
  var m = mins || (mode === 'focus' ? cfg.focus : cfg.rest);
  if (mode === 'focus' && mins) { cfg.focus = mins; } // la última duración elegida manda
  data.pomo = {
    src: src, id: id, mode: mode, totalMs: m * 60000, endsAt: now() + m * 60000,
    paused: false, leftMs: 0, startedAt: now(), title: pomoTitleOf(src, ref),
  };
  if (typeof ensureNotifyPermission === 'function') ensureNotifyPermission();
  logChange(mode === 'focus' ? 'Pomodoro iniciado' : 'Descanso iniciado', data.pomo.title + ' · ' + m + ' min');
  save();
  pomoLoop();
  pomoRefreshUI(true);
  toast((mode === 'focus' ? '🍅 ' + m + ' min de foco · ' : '☕ Descanso de ' + m + ' min · ') + data.pomo.title, 'ok');
}
function pomoPause() {
  var s = pomoGet();
  if (!s || s.paused) return;
  s.leftMs = pomoLeft(s);
  s.paused = true;
  save();
  pomoLoop();
  pomoRefreshUI(true);
}
function pomoResume() {
  var s = pomoGet();
  if (!s || !s.paused) return;
  s.endsAt = now() + (s.leftMs || 0);
  s.paused = false;
  save();
  pomoLoop();
  pomoRefreshUI(true);
}
function pomoAdd(mins) {
  var s = pomoGet();
  if (!s) return;
  if (s.paused) s.leftMs = (s.leftMs || 0) + mins * 60000;
  else s.endsAt += mins * 60000;
  s.totalMs += mins * 60000;
  save();
  pomoRefreshUI(true);
  toast('+' + mins + ' min', 'ok');
}
// Cortar la sesión a mano: el foco ya hecho se guarda igual (el tiempo trabajado cuenta).
function pomoStop() {
  var s = pomoGet();
  if (!s) return;
  var ref = pomoOwner(s);
  if (s.mode === 'focus' && ref) {
    var hecho = Math.max(0, s.totalMs - pomoLeft(s));
    if (hecho > 60000) ref.focusMs = (ref.focusMs || 0) + hecho;
  }
  data.pomo = null;
  clearInterval(POMO_TICK); POMO_TICK = null;
  logChange('Pomodoro detenido', s.title);
  save();
  pomoRefreshUI(true);
}
function pomoFinish() {
  var s = pomoGet();
  if (!s) return;
  clearInterval(POMO_TICK); POMO_TICK = null;
  var ref = pomoOwner(s), cfg = pomoCfg();
  var eraFoco = s.mode === 'focus', src = s.src, id = s.id, titulo = s.title;
  if (eraFoco && ref) {
    ref.pomos = (ref.pomos || 0) + 1;
    ref.focusMs = (ref.focusMs || 0) + s.totalMs;
  }
  data.pomo = null;
  logChange(eraFoco ? 'Pomodoro completado' : 'Descanso terminado', titulo);
  save();
  if (typeof notify === 'function') notify(eraFoco ? '🍅 Pomodoro completado' : '☕ Fin del descanso', titulo);
  if (typeof playBeep === 'function') playBeep();
  if (eraFoco && cfg.autoRest && cfg.rest > 0 && ref) {
    pomoStart(src, id, cfg.rest, 'rest');
    if (typeof toastAction === 'function') {
      toastAction('🍅 ¡Pomodoro completado! Descanso de ' + cfg.rest + ' min.', 'Saltar descanso', function () { pomoStop(); });
    }
  } else {
    toast(eraFoco ? '🍅 ¡Pomodoro completado!' : '☕ Descanso terminado. ¿Otra ronda?', 'ok');
    pomoRefreshUI(true);
  }
}
// Latido de un segundo, solo mientras corre la cuenta atrás.
function pomoLoop() {
  clearInterval(POMO_TICK);
  POMO_TICK = null;
  var s = pomoGet();
  if (!s || s.paused) return;
  POMO_TICK = setInterval(function () {
    var cur = pomoGet();
    if (!cur) { clearInterval(POMO_TICK); POMO_TICK = null; return; }
    if (pomoLeft(cur) <= 0) { pomoFinish(); return; }
    pomoRefreshUI();
  }, 1000);
}
// Al arrancar: si la sesión venció con la app cerrada se cierra ahora; si sigue viva, se retoma.
function pomoBoot() {
  var s = pomoGet();
  if (!s) return;
  if (!pomoOwner(s)) { data.pomo = null; save(); return; }  // la tarea ya no existe
  if (!s.paused && pomoLeft(s) <= 0) { pomoFinish(); return; }
  pomoLoop();
  pomoRefreshUI(true);
}
// El reloj se actualiza SIN repintar el panel (repintar cada segundo robaría el foco de los
// campos de texto). Solo los cambios de estado piden un repintado completo.
function pomoRefreshUI(full) {
  var s = pomoGet(), txt = s ? pomoFmt(pomoLeft(s)) : '';
  var els = document.querySelectorAll('[data-pomo-clock]');
  for (var i = 0; i < els.length; i++) els[i].textContent = txt;
  if (!full) return;
  if (typeof refreshTareas === 'function') refreshTareas(true);
  if (typeof mobileRefresh === 'function') mobileRefresh();
}

// ---------- Interfaz ----------
// Barra de la sesión en curso, para la cabecera del panel de Tareas.
function pomoBar() {
  var s = pomoGet();
  if (!s) return null;
  var foco = s.mode === 'focus';
  var bar = h('div', { class: 'pomo-bar' + (foco ? '' : ' is-rest') + (s.paused ? ' is-paused' : '') });
  bar.appendChild(h('span', { class: 'pomo-emoji' }, foco ? '🍅' : '☕'));
  bar.appendChild(h('span', { class: 'pomo-clock', 'data-pomo-clock': '1' }, pomoFmt(pomoLeft(s))));
  bar.appendChild(h('div', { class: 'pomo-what' },
    h('strong', {}, foco ? 'Enfocado en' : 'Descanso'),
    h('span', { class: 'pomo-task', title: s.title }, s.title)));
  var acciones = h('div', { class: 'pomo-actions' });
  acciones.appendChild(h('button', { class: 'pomo-btn', title: s.paused ? 'Reanudar' : 'Pausar',
    onclick: function () { s.paused ? pomoResume() : pomoPause(); } }, s.paused ? '▶' : '❚❚'));
  acciones.appendChild(h('button', { class: 'pomo-btn', title: 'Cinco minutos más', onclick: function () { pomoAdd(5); } }, '+5'));
  acciones.appendChild(h('button', { class: 'pomo-btn danger', title: 'Terminar la sesión', onclick: pomoStop }, '■'));
  bar.appendChild(acciones);
  var pct = s.totalMs ? Math.max(0, Math.min(100, 100 - Math.round(pomoLeft(s) / s.totalMs * 100))) : 0;
  bar.appendChild(h('div', { class: 'pomo-progress' }, h('div', { class: 'pomo-progress-fill', style: { width: pct + '%' } })));
  return bar;
}
// Botón de una fila: arranca el pomodoro de ESA tarea, o muestra su cuenta atrás si ya corre.
function pomoRowBtn(src, id) {
  var ref = pomoRefOf(src, id);
  var hechos = pomoDoneOf(ref), mins = pomoMinsOf(ref);
  if (pomoIsOn(src, id)) {
    var s = pomoGet();
    var chip = h('button', { class: 'pomo-chip on' + (s.paused ? ' paused' : ''),
      title: s.paused ? 'En pausa — clic para reanudar' : 'En marcha — clic para pausar',
      onclick: function (e) { e.stopPropagation(); s.paused ? pomoResume() : pomoPause(); } },
      s.mode === 'focus' ? '🍅' : '☕', h('span', { 'data-pomo-clock': '1' }, pomoFmt(pomoLeft(s))));
    return chip;
  }
  var titulo = 'Enfocar ' + pomoCfg().focus + ' min en esto (pomodoro)';
  if (hechos) titulo += ' · ' + hechos + (hechos === 1 ? ' pomodoro hecho' : ' pomodoros hechos') + (mins ? ' · ' + mins + ' min' : '');
  var btn = h('button', { class: 'pomo-chip' + (hechos ? ' has-done' : ''), title: titulo },
    '🍅', hechos ? h('span', {}, '×' + hechos) : null);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (e.altKey) { pomoStart(src, id); return; }   // Alt = arranca con la duración de siempre
    pomoPicker(src, id, btn);
  });
  return btn;
}
// Elegir cuánto dura el foco (y ajustar el descanso) antes de arrancar.
function pomoPicker(src, id, anchor) {
  if (typeof closeTopbarMenu === 'function') closeTopbarMenu();
  var cfg = pomoCfg();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop pomo-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('clock'), 'Enfocar durante…'));
  var fila = h('div', { class: 'cm-quick' });
  POMO_MINUTOS.forEach(function (m) {
    fila.appendChild(h('button', { class: 'cm-chip' + (cfg.focus === m ? ' on' : ''), onclick: function () {
      closeTopbarMenu(); pomoStart(src, id, m);
    } }, m + ' min'));
  });
  pop.appendChild(fila);
  var libre = h('input', { class: 'planner-inp planner-min-inp', type: 'number', min: '1', max: '180', placeholder: 'X min…' });
  libre.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var v = parseInt(libre.value, 10);
    if (v > 0) { closeTopbarMenu(); pomoStart(src, id, v); }
  });
  pop.appendChild(h('div', { class: 'cm-quick planner-min-row' }, libre,
    h('button', { class: 'cm-chip', onclick: function () {
      var v = parseInt(libre.value, 10);
      if (v > 0) { closeTopbarMenu(); pomoStart(src, id, v); }
    } }, 'Empezar')));
  pop.appendChild(h('div', { class: 'cm-sep' }));
  pop.appendChild(h('div', { class: 'cm-label' }, icon('coffee'), 'Descanso después'));
  var filaD = h('div', { class: 'cm-quick' });
  [0, 5, 10].forEach(function (m) {
    filaD.appendChild(h('button', { class: 'cm-chip' + (cfg.rest === m ? ' on' : ''), onclick: function (e) {
      e.stopPropagation();
      cfg.rest = m; cfg.autoRest = m > 0; save();
      pomoPicker(src, id, anchor);   // repinta el selector con el valor nuevo
    } }, m ? m + ' min' : 'Sin descanso'));
  });
  pop.appendChild(filaD);
  var ref = pomoRefOf(src, id);
  if (pomoDoneOf(ref)) {
    pop.appendChild(h('div', { class: 'cm-info' },
      h('span', {}, '🍅 ' + pomoDoneOf(ref) + ' · ' + pomoMinsOf(ref) + ' min enfocados'),
      h('button', { class: 'cm-mini', onclick: function () {
        ref.pomos = 0; ref.focusMs = 0; save(); closeTopbarMenu();
        if (typeof refreshTareas === 'function') refreshTareas(true);
      } }, 'Reiniciar')));
  }
  bd.appendChild(pop);
  document.body.appendChild(bd);
  if (typeof positionPop === 'function') positionPop(pop, anchor, 240);
  libre.focus();
}
