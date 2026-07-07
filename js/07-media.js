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
    var isImg = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
    if (isImg) {
      var ib = createAt(ox, oy, 'image'); if (!ib) return;
      ib.width = 300; ib.height = 220;
      var iel = cardEl(ib.id);
      if (iel) { iel.style.width = ib.width + 'px'; iel.style.height = ib.height + 'px'; }
      addImagesToBlock(ib, [f], function () {
        if (!iel) return;
        updateCardMedia(iel, ib);
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
var MAX_IMG_DIM = 1400;
// imgItemRaw: valor almacenado (ref 'blob:<id>' o data URL). imgItemSrc: src ya resuelta para pintar.
function imgItemRaw(it) { return typeof it === 'string' ? it : (it && it.src) || ''; }
function imgItemSrc(it) { return resolveSrc(imgItemRaw(it)); }
function imgItemW(it) { return (it && typeof it === 'object' && it.w) ? it.w : 0; }
var DEFAULT_IMG_W = 260;
function fileToScaledDataURL(file, cb) {
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h2 = img.height;
      var scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h2));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h2 * scale));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      try { c.getContext('2d').drawImage(img, 0, 0, cw, ch); cb(c.toDataURL('image/jpeg', 0.82), cw); }
      catch (e) { cb(reader.result, 0); }
    };
    img.onerror = function () { cb(reader.result, 0); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function addImagesToBlock(b, files, done) {
  var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
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
  var img = el.querySelector('.img-media img');
  var head = el.querySelector('.card-head');
  var headH = head ? head.offsetHeight : 34;
  var nw = (img && img.naturalWidth) || 4, nh = (img && img.naturalHeight) || 3;
  var aspect = nh / nw;
  var startX = e.clientX, startW = el.offsetWidth;
  function move(ev) {
    var scale = getView().zoom || 1;
    var w = Math.max(140, Math.round(startW + (ev.clientX - startX) / scale));
    el.style.width = w + 'px';
    el.style.height = Math.round((w - 2) * aspect + headH + 2) + 'px';
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
  if (!el || b.type !== 'image') return;
  var img = el.querySelector('.img-media img');
  if (!img) return;
  var apply = function () {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    var media = el.querySelector('.img-media');
    var mw = (media && media.clientWidth) || (b.width - 2);
    var head = el.querySelector('.card-head');
    var headH = head ? head.offsetHeight : 34;
    var ih = Math.round(mw * nh / nw);
    b.height = Math.max(120, headH + ih + 2);
    el.style.height = b.height + 'px';
    drawLinks();
    save();
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
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
  var img = h('img', { src: imgItemSrc(it), alt: '', draggable: 'false' });
  var w = imgItemW(it);
  if (w) img.style.width = w + 'px';
  var del = h('button', { class: 'fig-del', title: 'Quitar imagen', onclick: function (e) { e.stopPropagation(); removeCardImage(b, index, cardEl); } }, icon('trash'));
  var handle = h('span', { class: 'fig-resize', title: 'Arrastra para redimensionar' });
  handle.addEventListener('mousedown', function (e) { startImgResize(e, b, index, img, cardEl); });
  var fig = h('figure', { class: 'card-fig' }, img, del, handle);
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
