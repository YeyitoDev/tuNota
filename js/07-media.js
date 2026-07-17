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
  var img = h('img', { src: imgItemSrc(it), alt: '', title: 'Doble clic para editar: dibujar, señalar, notas, formas, recortar…' });
  setupImageDrag(img, b);
  img.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); openImageEditor(b, index); });
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
// ---------- Editor de imágenes (doble clic): dibujar, señalar, notas, formas, recortar, duplicar ----------
var _imedUndoFn = null;
function closeImageEditor() {
  var o = document.getElementById('imgEditor');
  if (o) o.remove();
  _imedUndoFn = null;
  document.removeEventListener('keydown', _imedKey, true);
}
function _imedKey(e) {
  if (!document.getElementById('imgEditor')) return;
  var a = document.activeElement;
  if (a && a.classList && a.classList.contains('imed-text-input')) return; // deja escribir la nota
  if (e.key === 'Escape') { closeImageEditor(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (_imedUndoFn) _imedUndoFn(); }
}
function openImageEditor(b, index) {
  if (!b.content || !b.content.images || !b.content.images[index]) return;
  closeImageEditor();
  var img = new Image();
  img.onload = function () { buildImageEditor(b, index, img); };
  img.onerror = function () { toast('No se pudo abrir la imagen para editar.', 'warn'); };
  img.src = imgItemSrc(b.content.images[index]);
}
function buildImageEditor(b, index, baseImg) {
  var it = b.content.images[index];
  var W = baseImg.naturalWidth || baseImg.width || 800, H = baseImg.naturalHeight || baseImg.height || 600;
  var st = { tool: 'draw', color: '#e0392b', size: Math.max(3, Math.round(Math.max(W, H) / 320)), annos: [], cur: null, crop: null, dragCrop: false, sel: null, moving: null };
  var canvas = h('canvas', { class: 'imed-canvas', width: String(W), height: String(H) });
  var ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  var textLayer = h('div', { class: 'imed-textlayer' });
  var stage = h('div', { class: 'imed-stage' }, canvas, textLayer);

  function head(x1, y1, x2, y2, size) {
    var ang = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(11, size * 3.5);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - 0.5), y2 - hl * Math.sin(ang - 0.5));
    ctx.lineTo(x2 - hl * Math.cos(ang + 0.5), y2 - hl * Math.sin(ang + 0.5));
    ctx.closePath(); ctx.fill();
  }
  function drawAnno(a) {
    ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.size;
    if (a.type === 'draw') { if (a.points.length < 1) return; ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y); for (var i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y); ctx.stroke(); }
    else if (a.type === 'arrow') { ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke(); head(a.x1, a.y1, a.x2, a.y2, a.size); }
    else if (a.type === 'rect') { ctx.strokeRect(Math.min(a.x, a.x + a.w), Math.min(a.y, a.y + a.h), Math.abs(a.w), Math.abs(a.h)); }
    else if (a.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w) / 2, Math.abs(a.h) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (a.type === 'text') { ctx.font = '700 ' + a.fs + 'px Nunito, system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = Math.max(3, a.fs / 6); String(a.text).split('\n').forEach(function (ln, i) { var y = a.y + i * a.fs * 1.25; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(ln, a.x, y); ctx.fillStyle = a.color; ctx.fillText(ln, a.x, y); }); }
  }
  function redraw() {
    ctx.clearRect(0, 0, W, H); ctx.drawImage(baseImg, 0, 0, W, H);
    st.annos.forEach(drawAnno);
    if (st.cur) drawAnno(st.cur);
    if (st.tool === 'move' && st.sel && st.annos.indexOf(st.sel) >= 0) {
      var sb = annoBBox(st.sel), sp = Math.max(6, W / 200);
      ctx.save(); ctx.strokeStyle = 'rgba(59,130,246,0.95)'; ctx.lineWidth = Math.max(1.5, W / 500); ctx.setLineDash([W / 80, W / 110]);
      ctx.strokeRect(sb.x - sp, sb.y - sp, sb.w + sp * 2, sb.h + sp * 2); ctx.restore();
    }
    if (st.crop) {
      var c = st.crop, x = Math.min(c.x, c.x + c.w), y = Math.min(c.y, c.y + c.h), w = Math.abs(c.w), hh = Math.abs(c.h);
      ctx.save(); ctx.fillStyle = 'rgba(20,16,12,0.45)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, hh); ctx.fill('evenodd');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, W / 400); ctx.setLineDash([W / 60, W / 90]); ctx.strokeRect(x, y, w, hh); ctx.restore();
    }
  }
  function toImg(ev) { var r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; }
  _imedUndoFn = function () { if (st.annos.length) { st.sel = null; st.annos.pop(); redraw(); } };

  // Caja envolvente de una anotación (coordenadas de imagen) para seleccionarla/moverla.
  function annoBBox(a) {
    if (a.type === 'text') {
      ctx.font = '700 ' + a.fs + 'px Nunito, system-ui, sans-serif';
      var w = 0; String(a.text).split('\n').forEach(function (ln) { w = Math.max(w, ctx.measureText(ln).width); });
      return { x: a.x, y: a.y, w: w, h: String(a.text).split('\n').length * a.fs * 1.25 };
    }
    if (a.type === 'rect' || a.type === 'ellipse') return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
    if (a.type === 'arrow') return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    if (a.type === 'draw') {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      a.points.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  function hitAnno(p) {
    for (var i = st.annos.length - 1; i >= 0; i--) {
      var a = st.annos[i], b = annoBBox(a), pad = Math.max(12, (a.size || 6) * 1.5);
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return a;
    }
    return null;
  }
  function moveAnno(a, dx, dy) {
    if (a.type === 'draw') a.points.forEach(function (p) { p.x += dx; p.y += dy; });
    else if (a.type === 'arrow') { a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; }
    else { a.x += dx; a.y += dy; } // rect, ellipse, text
  }

  var down = false;
  canvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    var p = toImg(ev);
    if (st.tool === 'move') {
      st.sel = hitAnno(p);
      if (st.sel) { down = true; st.moving = { a: st.sel, lastX: p.x, lastY: p.y }; }
      redraw(); return;
    }
    if (st.tool === 'text') { addTextAt(ev, p); return; }
    down = true;
    if (st.tool === 'draw') st.cur = { type: 'draw', color: st.color, size: st.size, points: [p] };
    else if (st.tool === 'arrow') st.cur = { type: 'arrow', color: st.color, size: st.size, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    else if (st.tool === 'rect') st.cur = { type: 'rect', color: st.color, size: st.size, x: p.x, y: p.y, w: 0, h: 0 };
    else if (st.tool === 'ellipse') st.cur = { type: 'ellipse', color: st.color, size: st.size, x: p.x, y: p.y, w: 0, h: 0 };
    else if (st.tool === 'crop') { st.crop = { x: p.x, y: p.y, w: 0, h: 0 }; st.dragCrop = true; }
    redraw();
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!down) return; var p = toImg(ev);
    if (st.moving) { moveAnno(st.moving.a, p.x - st.moving.lastX, p.y - st.moving.lastY); st.moving.lastX = p.x; st.moving.lastY = p.y; redraw(); return; }
    if (st.cur) { if (st.cur.type === 'draw') st.cur.points.push(p); else if (st.cur.type === 'arrow') { st.cur.x2 = p.x; st.cur.y2 = p.y; } else { st.cur.w = p.x - st.cur.x; st.cur.h = p.y - st.cur.y; } }
    else if (st.dragCrop && st.crop) { st.crop.w = p.x - st.crop.x; st.crop.h = p.y - st.crop.y; }
    redraw();
  });
  canvas.addEventListener('pointerup', function () {
    down = false; st.dragCrop = false; st.moving = null;
    if (st.cur) { var a = st.cur; st.cur = null; var ok = a.type === 'draw' ? a.points.length > 1 : (a.type === 'arrow' ? Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 5 : Math.abs(a.w) > 5 && Math.abs(a.h) > 5); if (ok) st.annos.push(a); }
    redraw();
  });
  function addTextAt(ev, p) {
    var sr = stage.getBoundingClientRect();
    var scale = canvas.getBoundingClientRect().width / W, fs = Math.max(16, st.size * 6);
    var inp = h('textarea', { class: 'imed-text-input', rows: '1' });
    inp.style.left = (ev.clientX - sr.left) + 'px'; inp.style.top = (ev.clientY - sr.top) + 'px';
    inp.style.color = st.color; inp.style.fontSize = Math.max(11, Math.round(fs * scale)) + 'px';
    textLayer.appendChild(inp); setTimeout(function () { inp.focus(); }, 0);
    function commit() { var t = inp.value.replace(/\s+$/, ''); if (inp.parentNode) inp.remove(); if (t) { st.annos.push({ type: 'text', color: st.color, x: p.x, y: p.y, fs: fs, text: t }); redraw(); } }
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = ''; inp.blur(); } });
  }
  function setTool(t) { st.tool = t; Array.prototype.forEach.call(toolbar.querySelectorAll('.imed-tool'), function (x) { x.classList.toggle('on', x.getAttribute('data-tool') === t); }); if (t !== 'crop') st.crop = null; if (t !== 'move') st.sel = null; canvas.style.cursor = (t === 'text' ? 'text' : (t === 'move' ? 'move' : 'crosshair')); redraw(); }
  function toolBtn(t, label, title) { var btn = h('button', { class: 'imed-tool' + (st.tool === t ? ' on' : ''), title: title, 'data-tool': t, onclick: function () { setTool(t); } }, label); return btn; }
  var color = h('input', { type: 'color', class: 'imed-color', value: st.color, title: 'Color' }); color.addEventListener('input', function () { st.color = color.value; });
  var size = h('input', { type: 'range', class: 'imed-size', min: '1', max: '48', value: String(st.size), title: 'Grosor' }); size.addEventListener('input', function () { st.size = +size.value; });
  function composite() { var c = st.crop; st.crop = null; redraw(); st.crop = c; return canvas; }
  function applyCrop() {
    if (!st.crop || Math.abs(st.crop.w) < 8 || Math.abs(st.crop.h) < 8) { toast('Elige ✂ y marca sobre la imagen el área a recortar.', 'warn'); return; }
    var c = st.crop, x = Math.round(Math.min(c.x, c.x + c.w)), y = Math.round(Math.min(c.y, c.y + c.h)), w = Math.round(Math.abs(c.w)), hh = Math.round(Math.abs(c.h));
    var src = composite(), tmp = document.createElement('canvas'); tmp.width = w; tmp.height = hh;
    tmp.getContext('2d').drawImage(src, x, y, w, hh, 0, 0, w, hh);
    var ni = new Image(); ni.onload = function () { baseImg = ni; W = w; H = hh; canvas.width = W; canvas.height = H; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; st.annos = []; setTool('draw'); }; ni.src = tmp.toDataURL('image/png');
  }
  function doDownload() { var a = h('a', { href: composite().toDataURL('image/png'), download: imageFileName(b, '.png') }); document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }
  function apply() {
    var url = composite().toDataURL('image/png');
    pushUndo('Editar imagen'); var ref = storeBlob(url), oldW = imgItemW(it);
    b.content.images[index] = oldW ? { src: ref, w: oldW } : { src: ref };
    touchNote(b.noteId); logChange('Imagen editada', ''); save();
    var el = cardEl(b.id); if (el) { updateCardMedia(el, b); if (typeof fitImageCard === 'function') fitImageCard(el, b); drawLinks(); }
    closeImageEditor();
  }
  var toolbar = h('div', { class: 'imed-tools' },
    toolBtn('move', '✥', 'Mover: arrastra un texto o anotación ya colocado'),
    toolBtn('draw', '✏️', 'Dibujar'), toolBtn('arrow', '↗', 'Flecha / señalar un punto'),
    toolBtn('rect', '▭', 'Rectángulo'), toolBtn('ellipse', '◯', 'Elipse'),
    toolBtn('text', 'T', 'Nota de texto sobre la imagen'), toolBtn('crop', '✂', 'Recortar (marca el área)'),
    h('span', { class: 'imed-sep' }), color, size,
    h('button', { class: 'imed-btn', title: 'Deshacer (Ctrl+Z)', onclick: function () { _imedUndoFn(); } }, '⟲'),
    h('button', { class: 'imed-btn', title: 'Aplicar el recorte marcado', onclick: applyCrop }, 'Recortar'),
    h('span', { class: 'imed-sep' }),
    h('button', { class: 'imed-btn', title: 'Descargar la imagen editada', onclick: doDownload }, '⬇'),
    h('button', { class: 'imed-btn', title: 'Duplicar el bloque de imagen', onclick: function () { duplicateBlock(b); closeImageEditor(); } }, 'Duplicar'),
    h('span', { class: 'card-spacer' }),
    h('button', { class: 'imed-btn ghost', title: 'Cerrar sin guardar (Esc)', onclick: closeImageEditor }, 'Cancelar'),
    h('button', { class: 'imed-btn primary', title: 'Guardar los cambios en la imagen', onclick: apply }, '✓ Aplicar')
  );
  var overlay = h('div', { class: 'overlay imed-overlay', id: 'imgEditor' });
  overlay.appendChild(h('div', { class: 'imed-panel' }, toolbar, stage));
  document.body.appendChild(overlay);
  canvas.style.cursor = 'crosshair';
  redraw();
  document.addEventListener('keydown', _imedKey, true);
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
