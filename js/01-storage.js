/* tuNota — Persistencia: claves LS, helpers base (uid/now/loadJSON), BlobStore (IndexedDB), escritura protegida, snapshots y copias de seguridad.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

var LS_DATA = 'tunota.data.v1';
var LS_UI = 'tunota.ui.v1';
var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('tunota') : null;

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function now() {
  return Date.now();
}
function loadJSON(k) {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch (e) {
    return null;
  }
}

// ---------- Almacén de blobs (IndexedDB) ----------
// Las imágenes/PDF viven en IndexedDB; localStorage guarda solo referencias
// ('blob:<id>') para no superar la cuota (~5 MB). Un espejo en memoria
// (blobCache) permite que el render síncrono resuelva las referencias.
var BlobStore = (function () {
  var DB_NAME = 'tunota-blobs', VERSION = 1;
  var dbP = null;
  function open() {
    if (dbP) return dbP;
    dbP = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbP;
  }
  function tx(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode);
        var store = t.objectStore(storeName);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }
  return {
    put: function (store, id, value) { return tx(store, 'readwrite', function (s) { s.put(value, id); }); },
    get: function (store, id) { return tx(store, 'readonly', function (s) { return s.get(id); }); },
    del: function (store, id) { return tx(store, 'readwrite', function (s) { s.delete(id); }); },
    keys: function (store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); },
    all: function (store) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(store, 'readonly');
          var s = t.objectStore(store);
          var out = {};
          var kReq = s.getAllKeys(), vReq = s.getAll();
          t.oncomplete = function () {
            var ks = kReq.result || [], vs = vReq.result || [];
            for (var i = 0; i < ks.length; i++) out[ks[i]] = vs[i];
            resolve(out);
          };
          t.onerror = function () { reject(t.error); };
        });
      });
    },
  };
})();

var blobCache = {}; // id -> data URL (espejo síncrono de IndexedDB)
function isBlobRef(s) { return typeof s === 'string' && s.indexOf('blob:') === 0; }
function blobRefId(s) { return s.slice(5); }
function resolveSrc(s) {
  if (isBlobRef(s)) return blobCache[blobRefId(s)] || ''; // '' hasta hidratar
  return s || ''; // data URL heredada sigue funcionando
}
function storeBlob(dataUrl) {
  var id = uid();
  blobCache[id] = dataUrl;
  BlobStore.put('blobs', id, dataUrl).catch(function (e) { onSaveError('blob', e); });
  return 'blob:' + id;
}
function deleteBlobRef(ref) {
  if (!isBlobRef(ref)) return;
  var id = blobRefId(ref);
  delete blobCache[id];
  BlobStore.del('blobs', id).catch(function () {});
}
// Gráficos de Python: nuevo = ref de blob; heredado = base64 crudo sin prefijo.
function pyImgSrc(img) {
  return isBlobRef(img) ? resolveSrc(img) : 'data:image/png;base64,' + img;
}
// Recorre todas las referencias de blob de un snapshot de datos.
function eachBlobRef(d, fn) {
  function scan(c) {
    if (!c) return;
    if (c.images) c.images.forEach(function (it) {
      var s = typeof it === 'string' ? it : (it && it.src);
      if (isBlobRef(s)) fn(s);
    });
    if (isBlobRef(c.pdf)) fn(c.pdf);
    if (c.result && isBlobRef(c.result.img)) fn(c.result.img);
  }
  (d.blocks || []).forEach(function (b) { scan(b.content); });
  // Plantillas de usuario: sus bloques capturan contenido (incluidas imágenes) → no deben
  // considerarse blobs huérfanos por gcBlobs.
  (d.userTemplates || []).forEach(function (tpl) { (tpl.blocks || []).forEach(function (spec) { scan(spec.content); }); });
}

// ---------- Escritura protegida en localStorage (sin fallos silenciosos) ----------
var saveHealthy = true;
var autoBackupDone = false;
function writeLS(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    if (!saveHealthy) { saveHealthy = true; clearSaveBanner(); }
    return true;
  } catch (e) {
    saveHealthy = false;
    var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    onSaveError(quota ? 'quota' : 'unknown', e);
    return false;
  }
}
function onSaveError(kind, e) {
  if (e) console.error('tuNota: no se pudo guardar (' + kind + ')', e);
  if (!document.body) return;
  var msg = kind === 'quota'
    ? '⚠ No se pudo guardar: almacenamiento lleno. Exporta una copia de seguridad para no perder cambios.'
    : '⚠ No se pudo guardar tus cambios.';
  var banner = document.getElementById('saveBanner');
  if (!banner) {
    banner = h('div', { class: 'save-banner', id: 'saveBanner' });
    document.body.appendChild(banner);
  }
  banner.innerHTML = '';
  banner.appendChild(h('span', { class: 'save-banner-msg' }, msg));
  banner.appendChild(h('button', { class: 'save-banner-btn', onclick: downloadBackup }, 'Exportar copia'));
  // Emergencia real: tras mover los blobs a IndexedDB, una cuota llena
  // significa que la propia estructura creció demasiado. Descarga una copia
  // automática una sola vez.
  if (kind === 'quota' && !autoBackupDone) {
    autoBackupDone = true;
    try { downloadBackup(); } catch (er) {}
  }
}
function clearSaveBanner() {
  var b = document.getElementById('saveBanner');
  if (b) b.remove();
}

// ---------- Copias automáticas (snapshots en IndexedDB) ----------
var SNAP_MAX = 10, SNAP_EVERY_MS = 2 * 60 * 1000;
var lastSnapAt = 0;
function maybeSnapshot(dataStr) {
  var t = now();
  if (t - lastSnapAt < SNAP_EVERY_MS) return;
  lastSnapAt = t;
  BlobStore.put('backups', t, { ts: t, json: dataStr })
    .then(function () { return BlobStore.keys('backups'); })
    .then(function (ks) {
      ks = (ks || []).slice().sort(function (a, b) { return a - b; });
      for (var i = 0; i < ks.length - SNAP_MAX; i++) BlobStore.del('backups', ks[i]).catch(function () {});
    })
    .catch(function () {});
}

// ---------- Copia de seguridad completa (estructura + blobs inline) ----------
function collectBlobsFor(d) {
  var out = {};
  eachBlobRef(d, function (ref) {
    var id = blobRefId(ref);
    if (blobCache[id]) out[id] = blobCache[id];
  });
  return out;
}
function downloadBackup() {
  var payload = { app: 'tunota', version: 1, exportedAt: now(), data: data, blobs: collectBlobsFor(data) };
  var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var d = new Date();
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var name = 'tunota-copia-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.json';
  downloadDataUrl(url, name);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  logChange('Copia de seguridad exportada', '');
  debouncedSave();
}
// Aplica una copia (objeto ya parseado) { data, blobs } o un JSON de datos crudo. Devuelve
// true si se importó. Reutilizado por la importación de archivo y la restauración de Drive.
function applyBackupPayload(obj, opts) {
  opts = opts || {};
  var payload = obj && obj.data && obj.data.notebooks ? obj : (obj && obj.notebooks ? { data: obj, blobs: {} } : null);
  if (!payload) { if (!opts.silent) alert('El archivo no es una copia válida de tuNota.'); return false; }
  if (!opts.skipConfirm && !window.confirm('Importar esta copia reemplazará TODOS los datos actuales. ¿Continuar?')) return false;
  var blobs = payload.blobs || {};
  Object.keys(blobs).forEach(function (id) {
    blobCache[id] = blobs[id];
    BlobStore.put('blobs', id, blobs[id]).catch(function (e) { onSaveError('blob', e); });
  });
  data = payload.data;
  normalizeData();
  migrateInlineBlobs(true); // copias antiguas pueden traer data URLs inline
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { var n0 = data.notes[0]; ui.currentNoteId = n0 ? n0.id : null; }
  logChange(opts.source ? ('Restaurado desde ' + opts.source) : 'Copia de seguridad importada', '');
  save();
  renderAll();
  return true;
}
function importBackupFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var obj;
    try { obj = JSON.parse(String(reader.result || '')); } catch (e) { obj = null; }
    if (applyBackupPayload(obj)) closeBackups();
  };
  reader.readAsText(file);
}
function restoreSnapshot(snap) {
  var d;
  try { d = JSON.parse(snap.json); } catch (e) { alert('No se pudo leer la copia.'); return; }
  if (!window.confirm('Restaurar la copia del ' + fmtDate(snap.ts) + ' ' + fmtTime(snap.ts) + ' reemplazará los datos actuales. ¿Continuar?')) return;
  data = d;
  normalizeData();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { var n0 = data.notes[0]; ui.currentNoteId = n0 ? n0.id : null; }
  logChange('Copia restaurada', fmtDate(snap.ts) + ' ' + fmtTime(snap.ts));
  save();
  renderAll();
  closeBackups();
}
