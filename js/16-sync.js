/* tuNota — Sincronización: Apple (CalDAV: Calendario + Recordatorios) y Google Drive (copia).
   Cargado en index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Apple: Calendario + Recordatorios de iCloud (a través del servidor CalDAV) ----------
function collectAllTodos() {
  var all = [];
  (data.notes || []).forEach(function (n) { all = all.concat(collectNoteTodos(n.id)); });
  return all;
}
function appleConfigured() { return !!(ui.apple && ui.apple.id && ui.apple.password) || BACKEND.apple; }
function appleSyncNow(silent) {
  if (!SERVER || !window.fetch) { if (!silent) toast('La sincronización con Apple requiere el servidor (py server.py).', 'warn'); return; }
  if (!appleConfigured()) { if (!silent) toast('Configura tu Apple ID y la contraseña de app en Sincronización.', 'warn'); return; }
  var items = collectAllTodos();
  if (!items.length) { if (!silent) toast('No hay tareas (- [ ]) ni recordatorios con hora que sincronizar.', 'warn'); return; }
  if (!silent) toast('Sincronizando con Apple… (' + items.length + ')');
  apiFetch('api/apple/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appleId: (ui.apple && ui.apple.id) || '', appPassword: (ui.apple && ui.apple.password) || '', items: items }),
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res && res.ok) {
      logChange('Apple sincronizado', res.synced + '/' + res.total);
      if (!silent) toast('Apple: ' + res.synced + '/' + res.total + ' enviados · Cal: ' + (res.calendar || '—') + ' · Rec: ' + (res.reminders || '—'), 'ok');
    } else if (!silent) toast('Apple: ' + ((res && res.error) || 'no se pudo sincronizar'), 'warn');
  }).catch(function () { if (!silent) toast('Error de red al sincronizar con Apple.', 'warn'); });
}
var _appleT;
function scheduleAppleSync() {
  if (!ui.apple || !ui.apple.autoSync || !appleConfigured() || !SERVER) return;
  clearTimeout(_appleT); _appleT = setTimeout(function () { appleSyncNow(true); }, 6000);
}

// ---------- Google Drive: copia de seguridad (OAuth en el navegador, sin servidor) ----------
var driveToken = null, driveTokenClient = null, _driveThen = null;
function driveReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
function driveEnsureClient() {
  if (!ui.drive || !ui.drive.clientId || !driveReady()) return null;
  if (!driveTokenClient || driveTokenClient._cid !== ui.drive.clientId) {
    driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: ui.drive.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: function (resp) {
        if (resp && resp.access_token) { driveToken = resp.access_token; var f = _driveThen; _driveThen = null; if (f) f(); }
        else toast('Google no concedió acceso a Drive.', 'warn');
      },
    });
    driveTokenClient._cid = ui.drive.clientId;
  }
  return driveTokenClient;
}
function driveWithToken(fn) {
  if (!ui.drive || !ui.drive.clientId) { toast('Pega tu Client ID de Google en Sincronización.', 'warn'); return; }
  if (!driveReady()) { toast('Google aún no cargó; reintenta en unos segundos.', 'warn'); return; }
  if (driveToken) { fn(); return; }
  var c = driveEnsureClient(); if (!c) return;
  _driveThen = fn; c.requestAccessToken();
}
function driveBackupBody() {
  return JSON.stringify({ app: 'tunota', version: 1, exportedAt: now(), data: data, blobs: (typeof collectBlobsFor === 'function' ? collectBlobsFor(data) : {}) });
}
function driveBackupNow(silent) {
  driveWithToken(function () {
    var content = driveBackupBody();
    var meta = { name: 'tunota-backup.json', mimeType: 'application/json' };
    var boundary = 'tunota' + Math.random().toString(16).slice(2);
    var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + content + '\r\n--' + boundary + '--';
    var fileId = ui.drive.fileId;
    var url = 'https://www.googleapis.com/upload/drive/v3/files' + (fileId ? '/' + fileId : '') + '?uploadType=multipart&fields=id';
    fetch(url, { method: fileId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + driveToken, 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body })
      .then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.id) { ui.drive.fileId = res.id; save(); logChange('Copia en Google Drive', ''); if (!silent) toast('Copia de seguridad subida a Google Drive.', 'ok'); }
        else { if (res && res.error) driveToken = null; if (!silent) toast('Drive: ' + ((res && res.error && res.error.message) || 'no se pudo subir'), 'warn'); }
      }).catch(function () { driveToken = null; if (!silent) toast('Error subiendo a Google Drive.', 'warn'); });
  });
}
function driveRestore() {
  driveWithToken(function () {
    var go = function (id) {
      fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + driveToken } })
        .then(function (r) { return r.json(); })
        .then(function (payload) { if (applyBackupPayload(payload, { source: 'Google Drive' })) { toast('Restaurado desde Google Drive.', 'ok'); closeSyncPanel(); } })
        .catch(function () { toast('No se pudo descargar la copia de Drive.', 'warn'); });
    };
    if (ui.drive.fileId) return go(ui.drive.fileId);
    fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("name='tunota-backup.json' and trashed=false") + '&spaces=drive&orderBy=modifiedTime desc&fields=files(id,name)', { headers: { Authorization: 'Bearer ' + driveToken } })
      .then(function (r) { return r.json(); }).then(function (res) {
        var f = res && res.files && res.files[0];
        if (!f) { toast('No hay copia «tunota-backup.json» en tu Drive.', 'warn'); return; }
        ui.drive.fileId = f.id; save(); go(f.id);
      }).catch(function () { toast('No se pudo consultar Google Drive.', 'warn'); });
  });
}
var _driveT;
function scheduleDriveSync() {
  if (!ui.drive || !ui.drive.autoSync || !ui.drive.clientId || !driveToken) return; // sin token válido, no molestamos con popups
  clearTimeout(_driveT); _driveT = setTimeout(function () { driveBackupNow(true); }, 90000);
}

// ---------- Panel de Sincronización (Apple + Google Drive) ----------
function openSyncPanel() {
  closeSyncPanel();
  var overlay = h('div', { class: 'overlay', id: 'syncOverlay', onclick: function (e) { if (e.target === overlay) closeSyncPanel(); } });
  var panel = h('div', { class: 'log-panel sync-panel' });
  panel.appendChild(h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('clock'), 'Sincronización'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeSyncPanel }, icon('x'))));
  var body = h('div', { class: 'log-body sync-body' });

  // --- Apple ---
  body.appendChild(h('div', { class: 'sync-sec-title' }, '🍎 Apple — Calendario y Recordatorios'));
  body.appendChild(h('p', { class: 'sync-hint' }, 'Crea una «contraseña específica de app» en appleid.apple.com (Inicio de sesión y seguridad). Se envía a tu servidor, que escribe en tu Calendario y Recordatorios de iCloud vía CalDAV. Requiere «py server.py».'));
  var aId = h('input', { class: 'sync-inp', type: 'email', placeholder: 'tu-apple-id@icloud.com', value: (ui.apple && ui.apple.id) || '' });
  aId.addEventListener('input', function () { ui.apple.id = aId.value.trim(); save(); });
  var aPw = h('input', { class: 'sync-inp', type: 'password', placeholder: 'contraseña de app (xxxx-xxxx-xxxx-xxxx)', value: (ui.apple && ui.apple.password) || '' });
  aPw.addEventListener('input', function () { ui.apple.password = aPw.value.trim(); save(); });
  body.appendChild(h('label', { class: 'sync-row' }, h('span', { class: 'sync-lbl' }, 'Apple ID'), aId));
  body.appendChild(h('label', { class: 'sync-row' }, h('span', { class: 'sync-lbl' }, 'Contraseña'), aPw));
  var aAuto = h('input', { type: 'checkbox' }); aAuto.checked = !!(ui.apple && ui.apple.autoSync);
  aAuto.addEventListener('change', function () { ui.apple.autoSync = aAuto.checked; save(); });
  body.appendChild(h('label', { class: 'sync-toggle' }, aAuto, h('span', {}, 'Sincronizar automáticamente al crear o cambiar recordatorios y tareas')));
  body.appendChild(h('div', { class: 'sync-actions' },
    h('button', { class: 'sync-btn primary', onclick: function () { appleSyncNow(false); } }, icon('bell'), 'Sincronizar ahora')));

  // --- Google Drive ---
  body.appendChild(h('div', { class: 'sync-sec-title' }, '☁️ Google Drive — copia de seguridad de archivos'));
  body.appendChild(h('p', { class: 'sync-hint' }, 'Crea un «ID de cliente de OAuth» (tipo Aplicación web) en Google Cloud Console y autoriza este origen. Sube y restaura una copia completa (notas + imágenes) en tu Drive. La copia automática se pausa cuando caduca la sesión de Google (vuelve a pulsar «Copia ahora»).'));
  var dId = h('input', { class: 'sync-inp', type: 'text', placeholder: 'xxxxx.apps.googleusercontent.com', value: (ui.drive && ui.drive.clientId) || '' });
  dId.addEventListener('input', function () { ui.drive.clientId = dId.value.trim(); driveTokenClient = null; driveToken = null; save(); });
  body.appendChild(h('label', { class: 'sync-row' }, h('span', { class: 'sync-lbl' }, 'Client ID'), dId));
  var dAuto = h('input', { type: 'checkbox' }); dAuto.checked = !!(ui.drive && ui.drive.autoSync);
  dAuto.addEventListener('change', function () { ui.drive.autoSync = dAuto.checked; save(); if (dAuto.checked && !driveToken) driveWithToken(function () { toast('Google Drive conectado; se guardará automáticamente.', 'ok'); }); });
  body.appendChild(h('label', { class: 'sync-toggle' }, dAuto, h('span', {}, 'Copia automática a Drive al guardar (cada ~90 s)')));
  body.appendChild(h('div', { class: 'sync-actions' },
    h('button', { class: 'sync-btn primary', onclick: function () { driveBackupNow(false); } }, icon('shield'), 'Copia ahora'),
    h('button', { class: 'sync-btn', onclick: function () { driveRestore(); } }, icon('download'), 'Restaurar de Drive')));

  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseSync);
}
function escCloseSync(e) { if (e.key === 'Escape') closeSyncPanel(); }
function closeSyncPanel() { var o = document.getElementById('syncOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseSync); }
