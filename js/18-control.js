/* tuNota — Control de funcionalidades (panel del usuario maestro).
   Cargado en orden desde index.html; comparte el ámbito global (sin build). */
'use strict';

function closeFeatureControl() { var o = document.getElementById('featCtlOverlay'); if (o) o.remove(); }

// Pide el código maestro si aún no lo es; al acertar, marca ui.master y abre el panel.
function unlockMaster() {
  if (isMaster()) return true;
  var code = window.prompt('Código maestro para el control de funcionalidades:');
  if (code == null) return false;
  if (code.trim() === MASTER_CODE || (ui.token && code.trim() === ui.token)) {
    ui.master = true; save();
    toast('Modo maestro activado.', 'ok');
    return true;
  }
  toast('Código incorrecto.', 'warn');
  return false;
}

function openFeatureControl() {
  if (!unlockMaster()) return;
  closeFeatureControl();
  var overlay = h('div', { class: 'overlay', id: 'featCtlOverlay', onclick: function (e) { if (e.target === overlay) closeFeatureControl(); } });
  var body = h('div', { class: 'log-body feat-body' });
  FEATURE_DEFS.forEach(function (f) {
    var on = featureOn(f.key);
    var chk = h('input', { type: 'checkbox' });
    chk.checked = on;
    chk.addEventListener('change', function () {
      ui.features = ui.features || {};
      ui.features[f.key] = chk.checked;
      save();
      renderAll();               // aplica al instante (topbar, menús, lienzo)
    });
    var row = h('label', { class: 'feat-row' },
      h('span', { class: 'feat-name' }, f.label),
      h('span', { class: 'feat-toggle' + (on ? ' on' : '') }, chk));
    body.appendChild(row);
  });
  var panel = h('div', { class: 'log-panel feat-panel' },
    h('div', { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('shield'), 'Control de funcionalidades'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeFeatureControl }, icon('x'))),
    h('p', { class: 'feat-intro' }, 'Activa o desactiva funciones. Los cambios se guardan en este navegador; los visitantes ven la configuración por defecto.'),
    body,
    h('div', { class: 'feat-foot' },
      h('button', { class: 'tour-btn ghost', onclick: function () { ui.features = {}; save(); renderAll(); openFeatureControl(); } }, 'Restablecer'),
      h('button', { class: 'tour-btn ghost', title: 'Salir del modo maestro en este navegador', onclick: function () { ui.master = false; save(); closeFeatureControl(); } }, 'Salir de modo maestro')));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
