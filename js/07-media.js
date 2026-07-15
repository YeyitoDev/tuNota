/* tuNota — PDF, importación de archivos (.md/.pdf) e imágenes.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- PDF ----------
function renderPdf(wrap, b) {
  wrap.innerHTML = '';
  var src = resolveSrc(b.content && b.content.pdf);
  if (src) {
    wrap.appendChild(h('iframe', { class: 'pdf-frame', src: src, title: (b.content && b.content.name) || 'PDF' }));
  } else {
    wrap.appendChild(h('div', { class: 'card-media-empty' }, 'Importa un PDF con el bot\u00f3n Importar'));
  }
}
function pdfBody(b) {
  b.content = b.content || {};
  var wrap = h('div', { class: 'pdf-wrap' });
  wrap.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  renderPdf(wrap, b);
  return [wrap];
}
// ---------- Importar archivos (.md / .pdf) ----------
function openImport() {
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre o crea una nota primero.'); return; }
  var input = h('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain,.pdf,application/pdf', multiple: '', style: { display: 'none' } });
  input.addEventListener('change', function () { importFiles(input.files); input.value = ''; });
  document.body.appendChild(input);
  input.click();
  setTimeout(function () { input.remove(); }, 60000);
}
function importFiles(fileList, atX, atY) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { alert('Abre o crea una nota primero.'); return; }
  var wrap = document.getElementById('canvas');
  var r = wrap ? wrap.getBoundingClientRect() : null;
  var hasPos = typeof atX === 'number' && typeof atY === 'number';
  var baseX = hasPos ? atX : (r ? r.left + r.width / 2 : 240);
  var baseY = hasPos ? atY : (r ? r.top + r.height / 3 : 160);
  files.forEach(function (f, idx) {
    var name = f.name || '';
    var ox = baseX + idx * 26, oy = baseY + idx * 26;
    var isMd = /\.(md|markdown|txt)$/i.test(name) || f.type === 'text/markdown';
    var isPdf = /\.pdf$/i.test(name) || f.type === 'application/pdf';
    var isImg = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name);
    if (isImg) {
      var ib = createAt(ox, oy, 'freeimage'); if (!ib) return;
      var iel = cardEl(ib.id);
      addImagesToBlock(ib, [f], function () {
        if (!iel) return;
        var media = iel.querySelector('.freeimg-media');
        if (media) renderFreeImage(media, ib);
        fitImageCard(iel, ib);
        drawLinks();
      });
    } else if (isMd) {
      var mr = new FileReader();
      mr.onload = function () {
        var b = createAt(ox, oy, 'markdown'); if (!b) return;
        b.content = { text: String(mr.result || '') };
        b.width = 440; b.height = 360;
        var el = cardEl(b.id);
        if (el) {
          el.style.width = b.width + 'px'; el.style.height = b.height + 'px';
          var v = el.querySelector('.md-render'); if (v) v.innerHTML = renderMarkdown(b.content.text);
          var ta = el.querySelector('.md-src'); if (ta) ta.value = b.content.text;
        }
        logChange('Markdown importado', snippet(name)); save(); drawLinks();
      };
      mr.readAsText(f);
    } else if (isPdf) {
      if (f.size > 12 * 1024 * 1024 && !window.confirm('El PDF "' + name + '" pesa ' + Math.round(f.size / 1048576) + ' MB y puede ralentizar el guardado. \u00bfContinuar?')) return;
      var pr = new FileReader();
      pr.onload = function () {
        var b = createAt(ox, oy, 'pdf'); if (!b) return;
        b.content = { pdf: storeBlob(String(pr.result || '')), name: name };
        b.width = 480; b.height = 600;
        var el = cardEl(b.id);
        if (el) {
          el.style.width = b.width + 'px'; el.style.height = b.height + 'px';
          var w = el.querySelector('.pdf-wrap'); if (w) renderPdf(w, b);
        }
        logChange('PDF importado', snippet(name)); save(); drawLinks();
      };
      pr.readAsDataURL(f);
    } else {
      alert('Formato no soportado: ' + name + '\nUsa .md (Markdown) o .pdf');
    }
  });
}
// ---------- Im\u00e1genes ----------
// Calidad de imagen: por defecto conservamos el archivo ORIGINAL sin recomprimir. Así una captura
// de pantalla PNG mantiene su nitidez y su resolución nativa (clave con Retina / varios monitores:
// aunque la captura venga de una pantalla de menor resolución, se guarda íntegra y se ve nítida en
// cualquier pantalla). Solo reescalamos imágenes ENORMES, y aun entonces conservamos el formato:
// PNG sin pérdida y JPEG a alta calidad. Los blobs viven en IndexedDB, así que el peso no infla db.json.
var MAX_IMG_DIM = 4096;                     // límite de seguridad: cubre capturas 4K; 5K/6K se reducen a esto
var SOFT_MAX_CHARS = 24 * 1024 * 1024;      // ~17 MB reales: por encima, reducimos para no agotar el almacenamiento
var IMG_NO_REENCODE = /^image\/(gif|svg\+xml|avif)$/i; // animación / vector: nunca rasterizar (los degradaría)
// imgItemRaw: valor almacenado (ref 'blob:<id>' o data URL). imgItemSrc: src ya resuelta para pintar.
function imgItemRaw(it) { return typeof it === 'string' ? it : (it && it.src) || ''; }
function imgItemSrc(it) { return resolveSrc(imgItemRaw(it)); }
function imgItemW(it) { return (it && typeof it === 'object' && it.w) ? it.w : 0; }
var DEFAULT_IMG_W = 260;
function fileToScaledDataURL(file, cb) {
  var reader = new FileReader();
  reader.onload = function () {
    var original = reader.result;                       // bytes originales, sin pérdida
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width, h2 = img.naturalHeight || img.height;
      var maxSide = Math.max(w, h2);
      var heavy = (original.length || 0) > SOFT_MAX_CHARS;
      // Caso normal (capturas, imágenes web o importadas normales): guardar el original tal cual.
      if ((maxSide <= MAX_IMG_DIM && !heavy) || IMG_NO_REENCODE.test((file && file.type) || '')) { cb(original, w); return; }
      // Imagen enorme: reescalar lo mínimo imprescindible, conservando el formato.
      var scale = Math.min(1, MAX_IMG_DIM / maxSide);
      if (heavy) scale = Math.min(scale, Math.sqrt(SOFT_MAX_CHARS / original.length)); // baja el área hacia el presupuesto
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h2 * scale));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      try {
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        var isPng = /^data:image\/png/i.test(original);
        var out = isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
        var keepOriginal = out.length >= original.length;   // nunca dejarla más pesada que el original
        cb(keepOriginal ? original : out, keepOriginal ? w : cw);
      } catch (e) { cb(original, w); }
    };
    img.onerror = function () { cb(original, 0); };
    img.src = original;
  };
  reader.readAsDataURL(file);
}
function isHeic(file) {
  if (!file) return false;
  var name = (file.name || '').toLowerCase();
  if (/\.(heic|heif)$/.test(name)) return true;
  return /^image\/(heic|heif)$/i.test(file.type);
}
function convertHeicToJpeg(file, cb) {
  if (typeof heic2any !== 'function') return cb(new Error('heic2any no disponible'), null, 0);
  var t0 = performance.now();
  heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    .then(function (blob) {
      var ms = Math.round(performance.now() - t0);
      var outName = (file.name || 'imagen.heic').replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
      var jpeg = new File([blob], outName, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
      cb(null, jpeg, ms);
    })
    .catch(function (err) { cb(err, null, 0); });
}
function convertHeicFilesIfNeeded(files, cb) {
  var arr = Array.prototype.slice.call(files || []);
  var heic = arr.filter(isHeic);
  if (!heic.length) return cb(arr);
  var progressEl = showProgressToast('Convirtiendo HEIC...');
  var t0 = performance.now();
  var done = 0, errors = [], outMap = {};
  heic.forEach(function (file) {
    convertHeicToJpeg(file, function (err, jpeg, ms) {
      if (err) errors.push(file.name || 'HEIC');
      else outMap[file.name] = jpeg;
      done++;
      updateProgressToast(progressEl, 'Convirtiendo HEIC (' + done + '/' + heic.length + ')...');
      if (done === heic.length) {
        var total = Math.round(performance.now() - t0);
        var msg = errors.length
          ? 'HEIC convertido en ' + total + ' ms (' + errors.length + ' error)'
          : 'HEIC convertido en ' + total + ' ms';
        hideProgressToast(progressEl, msg, 1600);
        var result = arr.map(function (f) { return isHeic(f) ? (outMap[f.name] || f) : f; });
        cb(result);
      }
    });
  });
}
function addImagesToBlock(b, files, done) {
  convertHeicFilesIfNeeded(files, function (arr) {
    arr = arr.filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) { if (done) done(0); return; }
    b.content = b.content || {};
    b.content.images = b.content.images || [];
    var pending = arr.length, added = 0;
    arr.forEach(function (f) {
      fileToScaledDataURL(f, function (url, cw) {
        var dw = cw ? Math.min(cw, DEFAULT_IMG_W) : 0;
        var ref = storeBlob(url); // el blob va a IndexedDB; aquí solo queda la referencia
        b.content.images.push(dw ? { src: ref, w: dw } : { src: ref });
        added++; pending--;
        if (pending <= 0) {
          touchNote(b.noteId);
          logChange('Imagen a\u00f1adida', '');
          save();
          if (done) done(added);
      }
    });
  });
});
}
function removeCardImage(b, index, cardEl) {
  if (!b.content || !b.content.images) return;
  var removed = b.content.images[index];
  b.content.images.splice(index, 1);
  deleteBlobRef(imgItemRaw(removed)); // quitar imagen no pasa por deshacer: borra el blob ya
  touchNote(b.noteId);
  logChange('Imagen eliminada', '');
  save();
  if (cardEl) updateCardMedia(cardEl, b);
}
// Redimensiona la tarjeta de imagen manteniendo la proporci\u00f3n de la imagen (sin margen/letterbox).
function startImageCardResize(e, b, el) {
  e.preventDefault(); e.stopPropagation();
  var img = el.querySelector('.img-media img, .freeimg-media img');
  var head = el.querySelector('.card-head');
  var headH = (b.type === 'freeimage') ? 0 : (head ? head.offsetHeight : 34);
  var nw = (img && img.naturalWidth) || 4, nh = (img && img.naturalHeight) || 3;
  var aspect = nh / nw;
  // Con descripción al lado, el alto es libre (imagen + texto); si no, se mantiene la proporción.
  var freeMode = el.classList.contains('has-desc') || el.classList.contains('desc-open');
  var startX = e.clientX, startY = e.clientY, startW = el.offsetWidth, startH = el.offsetHeight;
  function move(ev) {
    var scale = getView().zoom || 1;
    var w = Math.max(freeMode ? 160 : 48, Math.round(startW + (ev.clientX - startX) / scale));
    el.style.width = w + 'px';
    if (freeMode) el.style.height = Math.max(80, Math.round(startH + (ev.clientY - startY) / scale)) + 'px';
    else el.style.height = Math.round((w - 2) * aspect + headH + 2) + 'px';
    drawLinks();
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    b.width = el.offsetWidth; b.height = el.offsetHeight;
    logChange('Imagen redimensionada', b.width + ' px');
    save(); drawLinks();
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
// Ajusta el alto de una tarjeta de imagen al aspecto real de la primera imagen (sin letterbox).
function fitImageCard(el, b) {
  if (!el || (b.type !== 'image' && b.type !== 'freeimage')) return;
  if (el.classList.contains('has-desc') || el.classList.contains('desc-open')) return; // con descripción, alto libre
  var img = el.querySelector('.img-media img, .freeimg-media img');
  if (!img) return;
  var apply = function () {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    var media = el.querySelector('.img-media, .freeimg-media');
    var mw = (media && media.clientWidth) || (b.width - 2);
    var head = el.querySelector('.card-head');
    var headH = (b.type === 'freeimage') ? 0 : (head ? head.offsetHeight : 34);
    var ih = Math.round(mw * nh / nw);
    b.height = Math.max(b.type === 'freeimage' ? 24 : 120, headH + ih + 2);
    el.style.height = b.height + 'px';
    drawLinks();
    save();
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
}
// Bloque "Imagen IA": compositor para buscar imágenes (Tavily) o generarlas (backend).
function aiImageBody(b) {
  b.content = b.content || {};
  b.content.images = b.content.images || [];
  var wrap = h('div', { class: 'card-media aiimg-body' });
  wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) e.stopPropagation(); });
  function render() {
    wrap.innerHTML = '';
    if (b.content.images.length) {
      var it = b.content.images[0];
      var img = h('img', { class: 'aiimg-result', src: imgItemSrc(it), alt: b.content.prompt || '', draggable: 'false' });
      var fig = h('figure', { class: 'aiimg-figure' }, img);
      fig.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      var bar = h('div', { class: 'aiimg-bar' },
        h('span', { class: 'aiimg-caption', title: b.content.prompt || '' }, b.content.prompt || 'Imagen IA'),
        h('button', { class: 'aiimg-mini', title: 'Buscar o generar otra imagen', onclick: function (e) { e.stopPropagation(); b.content.images = []; touchNote(b.noteId); save(); render(); drawLinks(); } }, icon('spark'), 'Cambiar')
      );
      wrap.appendChild(fig);
      wrap.appendChild(bar);
      return;
    }
    var mode = b.content.mode === 'gen' ? 'gen' : 'search';
    var input = h('input', { class: 'aiimg-input', placeholder: mode === 'gen' ? 'Describe la imagen a generar…' : 'Busca una imagen…', value: b.content.prompt || '' });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    input.addEventListener('input', function () { b.content.prompt = input.value; debouncedSave(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    var searchTab = h('button', { class: 'aiimg-tab' + (mode === 'search' ? ' on' : ''), onclick: function (e) { e.stopPropagation(); b.content.mode = 'search'; render(); } }, icon('search'), 'Buscar');
    var genTab = h('button', {
      class: 'aiimg-tab' + (mode === 'gen' ? ' on' : ''),
      title: BACKEND.image ? 'Generar imagen con IA' : 'Generación no configurada: añade IMAGE_API_KEY en .env',
      onclick: function (e) { e.stopPropagation(); b.content.mode = 'gen'; render(); },
    }, icon('spark'), 'Generar');
    var go = h('button', { class: 'aiimg-go', onclick: function (e) { e.stopPropagation(); run(); } }, mode === 'gen' ? 'Generar' : 'Buscar');
    var status = h('div', { class: 'aiimg-status' });
    var grid = h('div', { class: 'aiimg-grid' });

    function choose(src, isRemote) {
      b.content.images = [isRemote ? { src: src } : { src: storeBlob(src) }];
      touchNote(b.noteId);
      logChange('Imagen IA añadida', snippet(b.content.prompt || ''));
      save();
      render();
      drawLinks();
    }
    function run() {
      var q = (input.value || '').trim();
      if (!q) { status.className = 'aiimg-status err'; status.textContent = 'Escribe una descripción.'; return; }
      b.content.prompt = q; b.content.mode = mode;
      grid.innerHTML = '';
      if (mode === 'gen') {
        if (!BACKEND.image) { status.className = 'aiimg-status err'; status.textContent = 'Generación no configurada (IMAGE_API_KEY en .env). Usa “Buscar”.'; return; }
        status.className = 'aiimg-status'; status.textContent = 'Generando imagen…'; go.disabled = true;
        imageGenerate(q).then(function (dataUrl) { go.disabled = false; status.textContent = ''; choose(dataUrl, false); })
          .catch(function (err) { go.disabled = false; status.className = 'aiimg-status err'; status.textContent = (err && err.message) || String(err); });
      } else {
        status.className = 'aiimg-status'; status.textContent = 'Buscando imágenes…'; go.disabled = true;
        imageSearchWeb(q).then(function (imgs) {
          go.disabled = false;
          if (!imgs.length) { status.className = 'aiimg-status err'; status.textContent = 'Sin imágenes. Prueba otra descripción.'; return; }
          status.className = 'aiimg-status'; status.textContent = 'Elige una:';
          imgs.slice(0, 8).forEach(function (im) {
            var thumb = h('img', { class: 'aiimg-thumb', src: im.url, alt: im.description || '', title: im.description || im.url, draggable: 'false', loading: 'lazy' });
            thumb.addEventListener('error', function () { thumb.remove(); });
            thumb.addEventListener('mousedown', function (e) { e.stopPropagation(); });
            thumb.addEventListener('click', function (e) { e.stopPropagation(); choose(im.url, true); });
            grid.appendChild(thumb);
          });
        }).catch(function (err) { go.disabled = false; status.className = 'aiimg-status err'; status.textContent = (err && err.message) || String(err); });
      }
    }

    wrap.appendChild(h('div', { class: 'aiimg-tabs' }, searchTab, genTab));
    wrap.appendChild(h('div', { class: 'aiimg-inbar' }, input, go));
    wrap.appendChild(status);
    wrap.appendChild(grid);
  }
  render();
  return [wrap];
}
function pickImagesFor(b, cardEl) {
  var input = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
  input.addEventListener('change', function () {
    addImagesToBlock(b, input.files, function () { if (cardEl) updateCardMedia(cardEl, b); });
    input.value = '';
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(function () { input.remove(); }, 60000);
}
function cardFigure(b, index, cardEl) {
  var it = b.content.images[index];
  var img = h('img', { src: imgItemSrc(it), alt: '' });
  setupImageDrag(img, b);
  var w = imgItemW(it);
  if (w) img.style.width = w + 'px';
  var del = h('button', { class: 'fig-del', title: 'Quitar imagen', onclick: function (e) { e.stopPropagation(); removeCardImage(b, index, cardEl); } }, icon('trash'));
  var dl = h('button', { class: 'fig-dl', title: 'Descargar imagen', onclick: function (e) { e.stopPropagation(); downloadImageItem(b, index); } }, icon('download'));
  var handle = h('span', { class: 'fig-resize', title: 'Arrastra para redimensionar' });
  handle.addEventListener('mousedown', function (e) { startImgResize(e, b, index, img, cardEl); });
  var fig = h('figure', { class: 'card-fig' }, img, del, dl, handle);
  fig.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  return fig;
}
function startImgResize(e, b, index, img, cardEl) {
  e.preventDefault(); e.stopPropagation();
  var media = cardEl.querySelector('.card-media');
  if (media) media.setAttribute('data-resizing', '1');
  var startX = e.clientX, startW = img.offsetWidth || img.naturalWidth || 120;
  function move(ev) {
    var scale = getView().zoom || 1;
    var nw = Math.max(48, Math.round(startW + (ev.clientX - startX) / scale));
    img.style.width = nw + 'px';
    drawLinks();
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    if (media) media.removeAttribute('data-resizing');
    var nw = img.offsetWidth;
    b.content.images[index] = { src: imgItemRaw(b.content.images[index]), w: nw };
    touchNote(b.noteId);
    logChange('Imagen redimensionada', nw + ' px');
    save();
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
function insertAtCursor(ta, text) {
  var s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
}

// ---------- Exportar / copiar / arrastrar imágenes ----------
function imageFileName(b, ext) {
  var title = (b.title || '').trim() || 'imagen';
  return title.replace(/[^a-z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc_-]/gi, '_').replace(/_+/g, '_') + (ext || '.png');
}
function downloadImageItem(b, index) {
  if (!b.content || !b.content.images || !b.content.images[index]) return;
  var it = b.content.images[index];
  var src = imgItemSrc(it);
  if (!src) return;
  var a = document.createElement('a');
  a.href = src;
  a.download = imageFileName(b, '_' + (index + 1) + '.png');
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { a.remove(); }, 200);
  toast('Imagen descargada', 'ok');
}
function downloadCardImage(b) {
  downloadImageItem(b, 0);
}
function downloadAllCardImages(b) {
  if (!b.content || !b.content.images || !b.content.images.length) { toast('No hay imágenes para descargar.', 'warn'); return; }
  b.content.images.forEach(function (_, i) {
    setTimeout(function () { downloadImageItem(b, i); }, i * 250);
  });
}
function downloadSelectedImages() {
  var ids = Object.keys(selectedIds || {});
  if (!ids.length) return;
  var items = [];
  ids.forEach(function (id) {
    var b = getBlockById(id);
    if (!b || !b.content || !b.content.images) return;
    b.content.images.forEach(function (_, i) { items.push({ b: b, i: i }); });
  });
  if (!items.length) { toast('No hay imágenes en la selección para descargar.', 'warn'); return; }
  items.forEach(function (it, idx) {
    setTimeout(function () { downloadImageItem(it.b, it.i); }, idx * 250);
  });
  toast('Descargando ' + items.length + ' imagen' + (items.length > 1 ? 'es' : ''), 'ok');
}
function copyCardImage(b) {
  if (!b.content || !b.content.images || !b.content.images.length) { toast('No hay imagen para copiar.', 'warn'); return; }
  var it = b.content.images[0];
  var src = imgItemSrc(it);
  if (!src) { toast('No se pudo leer la imagen.', 'warn'); return; }
  if (!navigator.clipboard || !navigator.clipboard.write) {
    toast('Tu navegador no soporta copiar imágenes.', 'warn');
    return;
  }
  var progressEl = showProgressToast('Copiando imagen...');
  fetch(src)
    .then(function (r) { return r.blob(); })
    .then(function (blob) {
      var type = blob.type || 'image/png';
      var item = {}; item[type] = blob;
      return navigator.clipboard.write([new ClipboardItem(item)]);
    })
    .then(function () { hideProgressToast(progressEl, 'Imagen copiada', 1200); })
    .catch(function (err) { hideProgressToast(progressEl, 'Error al copiar: ' + err.message, 2000); });
}
function setupImageDrag(imgEl, b, filename) {
  imgEl.draggable = true;
  imgEl.addEventListener('dragstart', function (e) {
    if (!b.content || !b.content.images || !b.content.images.length) return;
    var it = b.content.images[0];
    var src = imgItemSrc(it);
    if (!src) return;
    var dt = e.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = 'copy';
    dt.setData('text/uri-list', src);
    dt.setData('text/plain', src);
    // Chrome: permite arrastrar para descargar con nombre.
    dt.setData('DownloadURL', 'image/png:' + (filename || imageFileName(b, '.png')) + ':' + src);
  });
}

// ---------- Recorte libre (lasso) de imágenes ----------
function openImageCropper(b, cardEl) {
  if (!b.content || !b.content.images || !b.content.images.length) return;
  var it = b.content.images[0];
  var src = imgItemSrc(it);
  var img = new Image();
  var overlay = null, box = null, canvas = null, ctx = null;
  var path = [];
  var drawing = false;
  var closed = false;
  var zoom = 1;
  var cropCount = 0;
  var zoomLabel = null;

  function closeOverlay() { if (overlay && overlay.isConnected) overlay.remove(); }
  function relPoint(e) {
    var r = img.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function drawPath() {
    if (!ctx || path.length < 2) return;
    var r = img.getBoundingClientRect();
    var cw = r.width, ch = r.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = '#c2745b';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach(function (p, i) {
      var x = p.x * cw, y = p.y * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    if (closed) {
      ctx.fillStyle = 'rgba(194, 116, 91, 0.18)';
      ctx.fill();
    }
  }
  function applyZoom() {
    if (!img.naturalWidth) return;
    img.style.width = Math.round(img.naturalWidth * zoom) + 'px';
    img.style.height = Math.round(img.naturalHeight * zoom) + 'px';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    var r = img.getBoundingClientRect();
    canvas.width = r.width; canvas.height = r.height;
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    drawPath();
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  function finishSelection() {
    if (path.length < 3) { toast('Dibuja una selección cerrada con al menos 3 puntos.', 'warn'); return; }
    closed = true; drawPath();
  }
  function doCrop() {
    if (!closed || path.length < 3) { toast('Primero cierra la selección.', 'warn'); return; }
    var t0 = performance.now();
    var progressEl = showProgressToast('Recortando selección...');
    setTimeout(function () {
      try {
        var nw = img.naturalWidth, nh = img.naturalHeight;
        var pts = path.map(function (p) { return { x: Math.round(p.x * nw), y: Math.round(p.y * nh) }; });
        var minX = nw, minY = nh, maxX = 0, maxY = 0;
        pts.forEach(function (p) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });
        minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
        maxX = Math.min(nw, maxX + 2); maxY = Math.min(nh, maxY + 2);
        var bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
        // Render original recortada a las dimensiones exactas de la selección.
        var fullC = document.createElement('canvas');
        fullC.width = nw; fullC.height = nh;
        var fctx = fullC.getContext('2d');
        fctx.drawImage(img, 0, 0);
        fctx.globalCompositeOperation = 'destination-in';
        fctx.beginPath();
        pts.forEach(function (p, i) { if (i === 0) fctx.moveTo(p.x, p.y); else fctx.lineTo(p.x, p.y); });
        fctx.closePath(); fctx.fillStyle = '#fff'; fctx.fill();
        fctx.globalCompositeOperation = 'source-over';
        var cropC = document.createElement('canvas');
        cropC.width = bw; cropC.height = bh;
        var cctx = cropC.getContext('2d');
        cctx.drawImage(fullC, minX, minY, bw, bh, 0, 0, bw, bh);
        var dataUrl = cropC.toDataURL('image/png');
        if (!dataUrl || dataUrl === 'data:,') throw new Error('Imagen recortada vacía');
        cropCount++;
        var cx = b.x + b.width + 24;
        var cy = b.y + (cropCount - 1) * 140;
        var nb = addBlock(ui.currentNoteId, 'freeimage', cx, cy);
        nb.content = nb.content || {};
        nb.content.images = [{ src: storeBlob(dataUrl), w: bw }];
        var nel = card(nb);
        canvasContentEl.appendChild(nel);
        cardEnterAnim(nel);
        fitImageCard(nel, nb);
        drawLinks();
        touchNote(b.noteId);
        var ms = Math.round(performance.now() - t0);
        hideProgressToast(progressEl, 'Recorte creado (' + bw + '×' + bh + ' px) en ' + ms + ' ms', 1400);
        logChange('Imagen recortada', bw + '×' + bh);
        save();
        path = []; closed = false; drawPath();
      } catch (err) {
        hideProgressToast(progressEl, 'Error al recortar: ' + err.message, 2000);
      }
    }, 30);
  }

  img.onload = function () {
    overlay = h('div', { class: 'crop-overlay' });
    var head = h('div', { class: 'crop-head' },
      h('span', { class: 'crop-title' }, icon('crop'), 'Recortar selección libre'),
      h('span', { class: 'crop-hint' }, 'Dibuja alrededor del dibujo. Tocá el primer punto o usá Cerrar.')
    );
    var wrap = h('div', { class: 'crop-wrap' });
    var inner = h('div', { class: 'crop-inner' });
    img.className = 'crop-img';
    img.draggable = false;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    canvas = h('canvas', { class: 'crop-canvas' });
    ctx = canvas.getContext('2d');
    inner.appendChild(img); inner.appendChild(canvas);
    wrap.appendChild(inner);
    zoomLabel = h('span', { class: 'crop-zoom-val' }, '100%');
    var zoomOut = h('button', { class: 'crop-btn zoom', title: 'Alejar', onclick: function (e) { e.stopPropagation(); zoom = Math.max(0.25, zoom / 1.25); applyZoom(); } }, icon('minus'));
    var zoomIn = h('button', { class: 'crop-btn zoom', title: 'Acercar', onclick: function (e) { e.stopPropagation(); zoom = Math.min(4, zoom * 1.25); applyZoom(); } }, icon('plus'));
    var zoomRow = h('div', { class: 'crop-zoom' }, zoomOut, zoomLabel, zoomIn);
    var btns = h('div', { class: 'crop-btns' },
      h('button', { class: 'crop-btn secondary', onclick: function (e) { e.stopPropagation(); closeOverlay(); } }, 'Salir'),
      h('button', { class: 'crop-btn secondary', onclick: function (e) { e.stopPropagation(); path = []; closed = false; drawPath(); } }, 'Limpiar'),
      h('button', { class: 'crop-btn', onclick: function (e) { e.stopPropagation(); finishSelection(); } }, 'Cerrar selección'),
      h('button', { class: 'crop-btn primary', onclick: function (e) { e.stopPropagation(); doCrop(); } }, 'Recortar'),
      zoomRow
    );
    box = h('div', { class: 'crop-box' }, head, wrap, btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(function () {
      var maxW = Math.max(200, wrap.clientWidth - 10);
      var maxH = Math.max(160, wrap.clientHeight - 10);
      zoom = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      applyZoom();
    }, 0);

    function addPoint(e) {
      e.preventDefault();
      var p = relPoint(e);
      if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
      path.push(p);
      if (path.length > 2) {
        var dx = p.x - path[0].x, dy = p.y - path[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.03) { path.pop(); finishSelection(); }
      }
      drawPath();
    }
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (closed) { path = []; closed = false; }
      drawing = true; path = [relPoint(e)]; drawPath();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!drawing) return;
      addPoint(e);
    });
    canvas.addEventListener('pointerup', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!drawing) return;
      drawing = false;
      addPoint(e);
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    window.addEventListener('resize', applyZoom);
  };
  img.onerror = function () { toast('No se pudo cargar la imagen para recortar.', 'warn'); };
  img.src = src;
}
