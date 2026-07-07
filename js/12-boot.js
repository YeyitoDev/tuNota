/* tuNota — Migración de blobs inline, GC de blobs y arranque.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Migración única: data URLs inline -> blobs en IndexedDB ----------
function migrateInlineBlobs(skipSave) {
  var moved = 0;
  (data.blocks || []).forEach(function (b) {
    var c = b.content;
    if (!c) return;
    if (c.images) c.images.forEach(function (it, i) {
      var src = typeof it === 'string' ? it : (it && it.src);
      if (src && src.indexOf('data:') === 0) {
        var ref = storeBlob(src);
        if (typeof it === 'string') c.images[i] = { src: ref };
        else it.src = ref;
        moved++;
      }
    });
    if (typeof c.pdf === 'string' && c.pdf.indexOf('data:') === 0) { c.pdf = storeBlob(c.pdf); moved++; }
    if (c.result && c.result.img && !isBlobRef(c.result.img)) {
      c.result.img = storeBlob('data:image/png;base64,' + c.result.img);
      moved++;
    }
  });
  if (moved && !skipSave) {
    logChange('Imágenes migradas a IndexedDB', moved + ' elemento' + (moved > 1 ? 's' : ''));
    save();
  }
  return moved;
}

// Recolector: elimina de IndexedDB los blobs que ya no referencia ni la
// data actual ni ninguna copia automática. Se ejecuta al arrancar (así el
// deshacer de la sesión anterior nunca pierde bytes a mitad de sesión).
function gcBlobs() {
  var marked = {};
  eachBlobRef(data, function (ref) { marked[blobRefId(ref)] = 1; });
  BlobStore.all('backups').then(function (snaps) {
    Object.keys(snaps || {}).forEach(function (k) {
      try {
        eachBlobRef(JSON.parse(snaps[k].json), function (ref) { marked[blobRefId(ref)] = 1; });
      } catch (e) {}
    });
    return BlobStore.keys('blobs');
  }).then(function (ks) {
    (ks || []).forEach(function (id) {
      if (!marked[id]) {
        delete blobCache[id];
        BlobStore.del('blobs', id).catch(function () {});
      }
    });
  }).catch(function () {});
}

// Si otra ventana (note.html) añadió blobs, tráelos al espejo en memoria.
function hydrateMissingBlobs() {
  var missing = false;
  eachBlobRef(data, function (ref) { if (!blobCache[blobRefId(ref)]) missing = true; });
  if (!missing) return;
  BlobStore.all('blobs').then(function (map) {
    var added = false;
    Object.keys(map || {}).forEach(function (k) {
      if (!blobCache[k]) { blobCache[k] = map[k]; added = true; }
    });
    if (added) syncCanvasCards();
  }).catch(function () {});
}

// ---------- Init ----------
function boot() {
  initState();
  applyTheme();
  initCanvasNav();
  // 1) hidrata los blobs, 2) carga datos del servidor, 3) migra lo inline, 4) pinta.
  BlobStore.all('blobs')
    .then(function (map) { blobCache = map || {}; })
    .catch(function () {})
    .then(function () {
      serverLoad(function () {
        migrateInlineBlobs();
        renderAll();
        lastSig = sidebarSig();
        startReminderLoop();
        gcBlobs();
      });
    });
}
if (bc) bc.onmessage = function (ev) { if (ev && ev.data && ev.data.app === 'tunota') scheduleSync(); };
window.addEventListener('storage', function (e) { if (e.key === LS_DATA) scheduleSync(); });
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
