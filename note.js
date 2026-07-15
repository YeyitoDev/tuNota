/* tuNota - ventana emergente de una nota. Lee/escribe el mismo localStorage que la app. */
(function () {
  'use strict';

  var LS_DATA = 'tunota.data.v1';
  var id = new URLSearchParams(location.search).get('id');
  var bc = ('BroadcastChannel' in window) ? new BroadcastChannel('tunota') : null;
  var MAX_DIM = 1400;
  var SERVER = false;
  if (window.fetch) {
    fetch('api/data', { cache: 'no-store' }).then(function (r) { SERVER = !!r.ok; }).catch(function () { SERVER = false; });
  }
  function serverSave(obj) {
    if (!SERVER || !window.fetch) return;
    fetch('api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }).catch(function () {});
  }

  function now() { return Date.now(); }
  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function loadData() {
    try { return JSON.parse(localStorage.getItem(LS_DATA)); } catch (e) { return null; }
  }

  // ---------- Almacén de blobs (mismo IndexedDB que la app principal) ----------
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
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction('blobs', mode);
          var out = fn(t.objectStore('blobs'));
          t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
    return {
      put: function (id, value) { return tx('readwrite', function (s) { s.put(value, id); }); },
      del: function (id) { return tx('readwrite', function (s) { s.delete(id); }); },
      all: function () {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var t = db.transaction('blobs', 'readonly');
            var s = t.objectStore('blobs');
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
  var blobCache = {}; // id -> data URL
  function isBlobRef(s) { return typeof s === 'string' && s.indexOf('blob:') === 0; }
  function blobRefId(s) { return s.slice(5); }
  function resolveSrc(s) {
    if (isBlobRef(s)) return blobCache[blobRefId(s)] || '';
    return s || '';
  }
  function storeBlob(dataUrl) {
    var id = uid();
    blobCache[id] = dataUrl;
    BlobStore.put(id, dataUrl).catch(function (e) { console.error('tuNota: no se pudo guardar el blob', e); });
    return 'blob:' + id;
  }
  // Si la app principal añadió imágenes nuevas, tráelas al espejo en memoria.
  function hydrateMissingBlobs(done) {
    var d = loadData();
    var missing = false;
    if (d) (d.blocks || []).forEach(function (b) {
      var c = b.content;
      if (!c) return;
      if (c.images) c.images.forEach(function (it) {
        var s = typeof it === 'string' ? it : (it && it.src);
        if (isBlobRef(s) && !blobCache[blobRefId(s)]) missing = true;
      });
      if (isBlobRef(c.pdf) && !blobCache[blobRefId(c.pdf)]) missing = true;
    });
    if (!missing) { if (done) done(false); return; }
    BlobStore.all().then(function (map) {
      Object.keys(map || {}).forEach(function (k) { if (!blobCache[k]) blobCache[k] = map[k]; });
      if (done) done(true);
    }).catch(function () { if (done) done(false); });
  }
  function announce() { if (bc) bc.postMessage({ app: 'tunota', id: id }); }
  function snippet(t) {
    t = (t || '').replace(/\s+/g, ' ').trim();
    return t.length > 48 ? t.slice(0, 48) + '\u2026' : t;
  }
  function logTo(fresh, action, detail) {
    fresh.log = fresh.log || [];
    fresh.log.unshift({ id: uid(), ts: now(), action: action, detail: detail || '' });
    if (fresh.log.length > 500) fresh.log.length = 500;
  }

  // Lectura-mezcla-escritura: minimiza perder cambios de la ventana principal.
  function persist(mutator) {
    var fresh = loadData();
    if (!fresh) return false;
    mutator(fresh);
    fresh.savedAt = now();
    try {
      localStorage.setItem(LS_DATA, JSON.stringify(fresh));
    } catch (e) {
      window.alert('No se pudo guardar: el almacenamiento del navegador est\u00e1 lleno.\nLas im\u00e1genes muy grandes pueden superar el l\u00edmite (~5 MB). Elimina alguna imagen e int\u00e9ntalo de nuevo.');
      return false;
    }
    serverSave(fresh);
    announce();
    return true;
  }

  function getCtx(d) {
    if (!d) return null;
    var b = (d.blocks || []).find(function (x) { return x.id === id; });
    if (!b) return null;
    var note = (d.notes || []).find(function (n) { return n.id === b.noteId; });
    var sec = note ? (d.sections || []).find(function (s) { return s.id === note.sectionId; }) : null;
    var nb = sec ? (d.notebooks || []).find(function (n) { return n.id === sec.notebookId; }) : null;
    return { b: b, note: note, sec: sec, nb: nb };
  }

  // ---------- DOM helper ----------
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else e.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    x: SVG + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    image: SVG + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>',
    bulb: SVG + '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5"/></svg>',
    file: SVG + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    trash: SVG + '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    format: SVG + '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
    edit: SVG + '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    download: SVG + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  };
  function icon(name) { return h('span', { class: 'icon', html: ICONS[name] || '' }); }

  // ---------- Markdown (mismo parser que la app principal) ----------
  function mdEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function mdInline(text) {
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (m, c) { codes.push('<code class="md-code">' + mdEscape(c) + '</code>'); return '\u0000IC' + (codes.length - 1) + '\u0000'; });
    text = mdEscape(text);
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">');
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/\u0000IC(\d+)\u0000/g, function (m, n) { return codes[+n]; });
    return text;
  }
  function mdSplitRow(r) { return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function renderMarkdown(src) {
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    var codeBlocks = [];
    src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, function (m, lang, code) {
      codeBlocks.push('<pre class="md-pre"><code>' + mdEscape(code.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000CB' + (codeBlocks.length - 1) + '\u0000';
    });
    var lines = src.split('\n'), out = [], i = 0;
    var isBlock = function (l) {
      return /^\u0000CB\d+\u0000$/.test(l) || /^(#{1,6})\s+/.test(l) || /^\s*>\s?/.test(l) ||
        /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^\s*([-*_])\1\1+\s*$/.test(l);
    };
    while (i < lines.length) {
      var line = lines[i];
      var cb = line.match(/^\u0000CB(\d+)\u0000$/);
      if (cb) { out.push(codeBlocks[+cb[1]]); i++; continue; }
      if (/^\s*$/.test(line)) { i++; continue; }
      var hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) { var lvl = hm[1].length; out.push('<h' + lvl + '>' + mdInline(hm[2].trim()) + '</h' + lvl + '>'); i++; continue; }
      if (/^\s*([-*_])\1\1+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
        var header = mdSplitRow(line); i += 2; var rows = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) { rows.push(mdSplitRow(lines[i])); i++; }
        var thead = '<thead><tr>' + header.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr></thead>';
        var tbody = '<tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
        out.push('<table class="md-table">' + thead + tbody + '</table>');
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + mdInline(quote.join(' ')) + '</blockquote>');
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        var items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push('<li>' + mdInline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        var oitems = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { oitems.push('<li>' + mdInline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + oitems.join('') + '</ol>');
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlock(lines[i])) { para.push(lines[i]); i++; }
      out.push('<p>' + mdInline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('\n') || '<p class="md-empty">Vac\u00edo</p>';
  }

  // ---------- Mermaid (diagramas) ----------
  var mermaidReady = false;
  function ensureMermaid() {
    if (!window.mermaid) return false;
    if (!mermaidReady) {
      try { window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral', suppressErrorRendering: true, flowchart: { htmlLabels: false }, fontFamily: 'Nunito, system-ui, sans-serif' }); mermaidReady = true; } catch (e) {}
    }
    return true;
  }
  function renderMermaid(view, code, onDone) {
    var src = String(code == null ? '' : code).trim();
    if (!src) { view.innerHTML = '<div class="mmd-empty">Escribe c\u00f3digo Mermaid.</div>'; return; }
    if (!ensureMermaid()) { view.innerHTML = '<div class="mmd-err">Mermaid no est\u00e1 disponible (requiere internet).</div>'; return; }
    var gid = 'mmdw-' + Math.random().toString(36).slice(2);
    try {
      var p = window.mermaid.render(gid, src);
      if (p && typeof p.then === 'function') {
        p.then(function (res) { view.innerHTML = (res && res.svg) || ''; cleanupMmdTemp(gid); if (onDone) onDone(); })
         .catch(function (err) { cleanupMmdTemp(gid); view.innerHTML = '<div class="mmd-err">Error de sintaxis Mermaid:\n' + mdEscape(String((err && err.message) || err)) + '</div>'; });
      } else if (typeof p === 'string') { view.innerHTML = p; cleanupMmdTemp(gid); if (onDone) onDone(); }
    } catch (err) {
      cleanupMmdTemp(gid);
      view.innerHTML = '<div class="mmd-err">Error de sintaxis Mermaid:\n' + mdEscape(String((err && err.message) || err)) + '</div>';
    }
  }
  function cleanupMmdTemp(gid) {
    // Solo elimina nodos temporales colgados del <body>, nunca el <svg> ya insertado.
    ['#' + gid, '#d' + gid].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.parentNode === document.body) el.parentNode.removeChild(el);
    });
  }
  function svgDimensions(svg) {
    var w = 0, hh = 0;
    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) { w = svg.viewBox.baseVal.width; hh = svg.viewBox.baseVal.height; }
    if (!w) { var r = svg.getBoundingClientRect(); w = r.width; hh = r.height; }
    if (!w) { w = 800; hh = 600; }
    return { w: w, h: hh };
  }
  function exportSvgAsPng(svg, filename) {
    var dim = svgDimensions(svg);
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', dim.w); clone.setAttribute('height', dim.h);
    var xml = new XMLSerializer().serializeToString(clone);
    var svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    var img = new Image();
    img.onload = function () {
      var scale = 2;
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(dim.w * scale));
      canvas.height = Math.max(1, Math.round(dim.h * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { dl(svgUrl, filename + '.svg'); return; }
          var url = URL.createObjectURL(blob); dl(url, filename + '.png');
          setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        }, 'image/png');
      } catch (e) { dl(svgUrl, filename + '.svg'); }
    };
    img.onerror = function () { dl(svgUrl, filename + '.svg'); };
    img.src = svgUrl;
    function dl(url, name) { var a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); }
  }

  // ---------- Formateo de texto (respeta enumeraciones y saltos de linea) ----------
  function formatTextContent(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var counter = 0, prevOrdered = false, blankRun = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      var im = line.match(/^([ \t]*)/);
      var indent = (im ? im[1] : '').replace(/\t/g, '  ');
      var body = line.slice(im ? im[1].length : 0);
      if (body === '') {
        blankRun++;
        if (blankRun > 1) { prevOrdered = false; counter = 0; }
        if (out.length === 0 || blankRun > 1) continue;
        out.push('');
        continue;
      }
      blankRun = 0;
      var om = body.match(/^(\d+)[.)]\s+(.*)$/);
      if (om) {
        counter = prevOrdered ? counter + 1 : 1;
        prevOrdered = true;
        out.push(indent + counter + '. ' + om[2].replace(/[ \t]{2,}/g, ' ').trim());
        continue;
      }
      prevOrdered = false; counter = 0;
      var bm = body.match(/^([-*\u2022\u00b7\u2013\u2014])\s+(.*)$/);
      if (bm) {
        out.push(indent + '- ' + bm[2].replace(/[ \t]{2,}/g, ' ').trim());
        continue;
      }
      out.push(indent + body.replace(/[ \t]{2,}/g, ' '));
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }
  function formatTA() {
    if (!refs.ta) return;
    var formatted = formatTextContent(refs.ta.value);
    if (formatted === refs.ta.value) return;
    refs.ta.value = formatted;
    persist(function (fresh) {
      var fb = fresh.blocks.find(function (x) { return x.id === id; });
      if (fb) { fb.content = fb.content || {}; fb.content.text = formatted; fb.updatedAt = now(); }
      logTo(fresh, 'Texto formateado', snippet(formatted));
    });
  }

  // ---------- Im\u00e1genes ----------
  function fileToScaledDataURL(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h2 = img.height;
        var scale = Math.min(1, MAX_DIM / Math.max(w, h2));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h2 * scale));
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        try {
          c.getContext('2d').drawImage(img, 0, 0, cw, ch);
          cb(c.toDataURL('image/jpeg', 0.82));
        } catch (e) { cb(reader.result); }
      };
      img.onerror = function () { cb(reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function imgSrc(it) { return typeof it === 'string' ? it : (it && it.src) || ''; }
  function imgW(it) { return (it && typeof it === 'object' && it.w) ? it.w : 0; }
  function handleFiles(files) {
    if (!files || !files.length) return;
    var arr = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) return;
    var pending = arr.length;
    arr.forEach(function (f) {
      fileToScaledDataURL(f, function (url) {
        persist(function (fresh) {
          var fb = fresh.blocks.find(function (x) { return x.id === id; });
          if (fb) {
            fb.content = fb.content || {};
            fb.content.images = fb.content.images || [];
            fb.content.images.push({ src: storeBlob(url) });
            fb.updatedAt = now();
            logTo(fresh, 'Imagen a\u00f1adida', '');
          }
        });
        pending--;
        if (pending <= 0) render();
      });
    });
  }
  function setImageWidth(index, w) {
    persist(function (fresh) {
      var fb = fresh.blocks.find(function (x) { return x.id === id; });
      if (fb && fb.content && fb.content.images && fb.content.images[index] != null) {
        fb.content.images[index] = { src: imgSrc(fb.content.images[index]), w: w };
        fb.updatedAt = now();
        logTo(fresh, 'Imagen redimensionada', w + ' px');
      }
    });
  }
  function removeImage(index) {
    persist(function (fresh) {
      var fb = fresh.blocks.find(function (x) { return x.id === id; });
      if (fb && fb.content && fb.content.images) {
        var removed = imgSrc(fb.content.images[index]);
        if (isBlobRef(removed)) { delete blobCache[blobRefId(removed)]; BlobStore.del(blobRefId(removed)).catch(function () {}); }
        fb.content.images.splice(index, 1);
        fb.updatedAt = now();
        logTo(fresh, 'Imagen eliminada', '');
      }
    });
    render();
  }

  // ---------- Render ----------
  var root = document.getElementById('noteRoot');
  var refs = {};

  function msg(text) { return h('div', { class: 'nw-msg' }, text); }

  function renderImages(grid, b) {
    grid.innerHTML = '';
    var imgs = (b.content && b.content.images) || [];
    if (!imgs.length) {
      grid.appendChild(h('div', { class: 'nw-empty' }, 'Sin im\u00e1genes a\u00fan. Inserta o pega una imagen (Ctrl+V).'));
      return;
    }
    imgs.forEach(function (it, i) {
      var img = h('img', { src: resolveSrc(imgSrc(it)), alt: '', draggable: 'false' });
      var w = imgW(it);
      if (w) img.style.width = w + 'px';
      var handle = h('span', { class: 'nw-resize', title: 'Arrastra para redimensionar' });
      handle.addEventListener('mousedown', function (e) { startResize(e, i, img); });
      grid.appendChild(
        h('figure', { class: 'nw-fig' },
          img,
          h('button', { class: 'rm', title: 'Eliminar imagen', onclick: function () { removeImage(i); } }, icon('trash')),
          handle
        )
      );
    });
  }
  function startResize(e, index, img) {
    e.preventDefault(); e.stopPropagation();
    var startX = e.clientX, startW = img.offsetWidth || img.naturalWidth || 160;
    function move(ev) {
      var nw = Math.max(48, Math.round(startW + (ev.clientX - startX)));
      img.style.width = nw + 'px';
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setImageWidth(index, img.offsetWidth);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function render() {
    var d = loadData();
    root.innerHTML = '';
    refs = {};
    if (!d) { root.appendChild(msg('No hay datos de tuNota en este navegador.')); return; }
    var ctx = getCtx(d);
    if (!ctx) {
      document.title = 'tuNota';
      root.appendChild(msg('Esta nota fue eliminada o no existe.'));
      root.appendChild(h('div', { style: { textAlign: 'center' } },
        h('button', { class: 'nw-btn', onclick: function () { window.close(); } }, 'Cerrar ventana')));
      return;
    }
    var b = ctx.b, note = ctx.note, isIdea = b.type === 'idea';
    document.title = (note ? note.title : 'Nota') + ' \u00b7 tuNota';

    var route = h('div', { class: 'nw-route' });
    if (ctx.nb) route.appendChild(h('span', { class: 'seg' }, (ctx.nb.emoji ? ctx.nb.emoji + ' ' : '') + ctx.nb.name));
    if (ctx.sec) { route.appendChild(h('span', { class: 'sep' }, '\u203a')); route.appendChild(h('span', { class: 'seg' }, ctx.sec.name)); }
    route.appendChild(h('span', { class: 'sep' }, '\u203a'));

    var titleInput = h('input', { class: 'nw-title', value: note ? note.title : 'Nota', title: 'T\u00edtulo de la nota' });
    if (!note) titleInput.disabled = true;
    titleInput.addEventListener('change', function () {
      var v = titleInput.value.trim() || 'Nota sin t\u00edtulo';
      titleInput.value = v;
      persist(function (fresh) {
        var n = fresh.notes.find(function (x) { return x.id === note.id; });
        if (n) { n.title = v; n.updatedAt = now(); }
        logTo(fresh, 'Renombrado', '\u2192 "' + v + '"');
      });
    });
    refs.title = titleInput;
    route.appendChild(titleInput);

    var head = h('header', { class: 'nw-head' + (isIdea ? ' idea' : '') },
      route,
      h('button', { class: 'icon-btn', title: 'Cerrar (la nota queda guardada)', onclick: function () { window.close(); } }, icon('x'))
    );

    root.appendChild(head);

    if (b.type === 'pdf') {
      root.appendChild(renderPdfBody(b));
    } else if (b.type === 'markdown') {
      root.appendChild(renderMdBody(b));
    } else if (b.type === 'mermaid') {
      root.appendChild(renderMmdBody(b));
    } else if (b.type === 'code' || b.type === 'json' || b.type === 'curl') {
      root.appendChild(renderMonoBody(b));
    } else if (b.type === 'image' || b.type === 'freeimage') {
      root.appendChild(renderImageBody(b));
    } else {
      root.appendChild(renderTextBody(b, isIdea));
    }
  }

  // ---------- Bloques mono: c\u00f3digo / JSON / cURL ----------
  function highlightJSON(str) {
    var frag = document.createElement('span');
    var esc = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var re = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    frag.innerHTML = esc.replace(re, function (m) {
      var cls = 'j-num';
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'j-key' : 'j-str';
      else if (/true|false/.test(m)) cls = 'j-bool';
      else if (/null/.test(m)) cls = 'j-null';
      return '<span class="' + cls + '">' + m + '</span>';
    });
    return frag;
  }
  function renderCurlResponse(resp, out, status) {
    out.style.display = '';
    out.innerHTML = '';
    var body = resp.body || '';
    var ctype = (resp.contentType || '').toLowerCase();
    var pretty = body, isJson = false;
    var looksJson = ctype.indexOf('json') !== -1 || /^\s*[\[{]/.test(body);
    if (looksJson) { try { pretty = JSON.stringify(JSON.parse(body), null, 2); isJson = true; } catch (e) { pretty = body; } }
    if (isJson) out.appendChild(highlightJSON(pretty)); else out.textContent = pretty;
    var ok = resp.status >= 200 && resp.status < 300;
    status.textContent = resp.status + ' ' + (resp.reason || '') + (resp.timeMs != null ? '  \u00b7 ' + resp.timeMs + ' ms' : '');
    status.className = 'mono-status ' + (ok ? 'ok' : 'err');
  }
  function runCurl(b, ta, out, status, runBtn) {
    var cmd = (ta.value || '').trim();
    if (!cmd) { status.textContent = 'Escribe un comando cURL'; status.className = 'mono-status err'; return; }
    if (!window.fetch) { status.textContent = 'Requiere el servidor: py server.py'; status.className = 'mono-status err'; return; }
    status.textContent = 'Ejecutando\u2026'; status.className = 'mono-status';
    runBtn.disabled = true;
    fetch('api/curl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        runBtn.disabled = false;
        if (!resp || resp.ok === false) {
          status.textContent = 'Error'; status.className = 'mono-status err';
          out.style.display = ''; out.textContent = (resp && resp.error) || 'No se pudo ejecutar la petici\u00f3n.';
          return;
        }
        renderCurlResponse(resp, out, status);
        persist(function (fresh) {
          var fb = fresh.blocks.find(function (x) { return x.id === id; });
          if (fb) {
            fb.content = fb.content || {};
            fb.content.text = ta.value;
            fb.content.response = { status: resp.status, reason: resp.reason, body: resp.body, contentType: resp.contentType, timeMs: resp.timeMs };
            fb.updatedAt = now();
          }
          logTo(fresh, 'cURL ejecutado (ventana)', (resp.method || '') + ' ' + resp.status + ' ' + snippet(resp.url || ''));
        });
      })
      .catch(function (err) {
        runBtn.disabled = false;
        status.textContent = 'Error de red (\u00bfservidor?)'; status.className = 'mono-status err';
        out.style.display = ''; out.textContent = 'La ejecuci\u00f3n de cURL necesita el servidor Python.\nInicia con:  py server.py  y abre http://localhost:8765\n\n' + String(err);
      });
  }
  function renderMonoBody(b) {
    b.content = b.content || {};
    var ph = b.type === 'curl' ? 'curl -X GET https://api.ejemplo.com' : (b.type === 'json' ? '{\n  "clave": "valor"\n}' : '// tu c\u00f3digo aqu\u00ed');
    var ta = h('textarea', { class: 'nw-ta mono', spellcheck: 'false', placeholder: ph });
    ta.value = b.content.text || '';
    var saveT;
    function persistText(extra) {
      persist(function (fresh) {
        var fb = fresh.blocks.find(function (x) { return x.id === id; });
        if (fb) { fb.content = fb.content || {}; fb.content.text = ta.value; fb.updatedAt = now(); var fn = fresh.notes.find(function (n) { return n.id === fb.noteId; }); if (fn) fn.updatedAt = now(); }
        if (extra) extra(fresh);
      });
    }
    ta.addEventListener('input', function () { clearTimeout(saveT); saveT = setTimeout(function () { persistText(); }, 250); });
    ta.addEventListener('change', function () { persistText(function (fresh) { logTo(fresh, (b.type === 'json' ? 'JSON' : b.type === 'curl' ? 'cURL' : 'C\u00f3digo') + ' editado (ventana)', snippet(ta.value)); }); });

    if (b.type === 'curl') {
      var status = h('span', { class: 'mono-status' });
      var out = h('pre', { class: 'curl-out', style: { display: 'none' } });
      var runBtn = h('button', { class: 'nw-btn primary', title: 'Ejecutar la petici\u00f3n (Ctrl+Enter)' }, 'Ejecutar');
      runBtn.addEventListener('click', function () { runCurl(b, ta, out, status, runBtn); });
      var copyBtn = h('button', { class: 'nw-btn', title: 'Copiar respuesta' }, 'Copiar');
      copyBtn.addEventListener('click', function () {
        if (!out.textContent) return;
        try { navigator.clipboard.writeText(out.textContent); status.textContent = 'Copiado'; status.className = 'mono-status ok'; } catch (e) {}
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') { e.preventDefault(); var s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCurl(b, ta, out, status, runBtn); }
      });
      if (b.content.response && b.content.response.body != null) renderCurlResponse(b.content.response, out, status);
      var bar = h('div', { class: 'mono-bar' }, runBtn, copyBtn, status);
      return h('div', { class: 'nw-body nw-mono-body' }, ta, bar, out);
    }

    if (b.type === 'json') {
      var jstatus = h('span', { class: 'mono-status' });
      var fmt = h('button', { class: 'nw-btn', title: 'Formatear JSON' }, 'Formatear');
      fmt.addEventListener('click', function () {
        try {
          ta.value = JSON.stringify(JSON.parse(ta.value || 'null'), null, 2);
          persistText();
          jstatus.textContent = 'Formateado'; jstatus.className = 'mono-status ok';
        } catch (e) { jstatus.textContent = 'JSON inv\u00e1lido'; jstatus.className = 'mono-status err'; }
      });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); var s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; } });
      return h('div', { class: 'nw-body nw-mono-body' }, ta, h('div', { class: 'mono-bar' }, fmt, jstatus));
    }

    ta.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); var s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; } });
    return h('div', { class: 'nw-body nw-mono-body' }, ta);
  }

  function renderMmdBody(b) {
    b.content = b.content || {};
    var view = h('div', { class: 'mmd-render nw-mmd' });
    var ta = h('textarea', { class: 'nw-ta mono', spellcheck: 'false', placeholder: 'graph TD\n  A[Inicio] --> B[Fin]' });
    ta.value = b.content.text || '';
    ta.style.display = 'none';
    var editing = false;
    var toggleBtn = h('button', { class: 'nw-btn' }, icon('edit'), 'Editar');
    toggleBtn.addEventListener('click', function () {
      editing = !editing;
      ta.style.display = editing ? '' : 'none';
      view.style.display = editing ? 'none' : '';
      toggleBtn.lastChild.textContent = editing ? 'Ver diagrama' : 'Editar';
      if (editing) ta.focus(); else renderMermaid(view, ta.value);
    });
    var dlBtn = h('button', { class: 'nw-btn', title: 'Descargar diagrama (PNG)' }, icon('download'), 'Descargar');
    dlBtn.addEventListener('click', function () {
      var svg = view.querySelector('svg');
      if (svg) { exportSvgAsPng(svg, 'diagrama-mermaid'); return; }
      renderMermaid(view, ta.value, function () { var s = view.querySelector('svg'); if (s) exportSvgAsPng(s, 'diagrama-mermaid'); else alert('Revisa la sintaxis del diagrama.'); });
    });
    var reT;
    ta.addEventListener('input', function () {
      clearTimeout(reT);
      reT = setTimeout(function () {
        persist(function (fresh) {
          var fb = fresh.blocks.find(function (x) { return x.id === id; });
          if (fb) { fb.content = fb.content || {}; fb.content.text = ta.value; fb.updatedAt = now(); var fn = fresh.notes.find(function (n) { return n.id === fb.noteId; }); if (fn) fn.updatedAt = now(); }
        });
      }, 250);
    });
    ta.addEventListener('change', function () {
      persist(function (fresh) {
        var fb = fresh.blocks.find(function (x) { return x.id === id; });
        if (fb) { fb.content = fb.content || {}; fb.content.text = ta.value; fb.updatedAt = now(); }
        logTo(fresh, 'Diagrama Mermaid editado (ventana)', snippet(ta.value));
      });
    });
    refs.mmdView = view; refs.mmdTa = ta; refs.mmdEditing = function () { return editing; };
    var toolbar = h('div', { class: 'nw-toolbar' }, toggleBtn, dlBtn, h('span', { class: 'nw-hint' }, 'Diagrama Mermaid'));
    renderMermaid(view, b.content.text);
    return h('div', { class: 'nw-body' }, toolbar, view, ta);
  }

  function renderTextBody(b, isIdea) {
    var fileInput = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
    var toolbar = h('div', { class: 'nw-toolbar' },
      h('button', { class: 'nw-btn', title: 'Formatear texto (listas, vi\u00f1etas, saltos de l\u00ednea)', onclick: function () { formatTA(); } }, icon('format'), 'Formatear'),
      h('button', { class: 'nw-btn', onclick: function () { fileInput.click(); } }, icon('image'), 'Insertar imagen'),
      h('span', { class: 'nw-hint' }, 'o pega con Ctrl+V'),
      fileInput
    );

    var ta = h('textarea', { class: 'nw-ta', placeholder: isIdea ? 'Desarrolla tu idea...' : 'Escribe tu nota...' });
    ta.value = (b.content && b.content.text) || '';
    var taT;
    ta.addEventListener('input', function () {
      clearTimeout(taT);
      taT = setTimeout(function () {
        persist(function (fresh) {
          var fb = fresh.blocks.find(function (x) { return x.id === id; });
          if (fb) {
            fb.content = fb.content || {};
            fb.content.text = ta.value;
            fb.updatedAt = now();
            var fn = fresh.notes.find(function (n) { return n.id === fb.noteId; });
            if (fn) fn.updatedAt = now();
          }
        });
      }, 250);
    });
    ta.addEventListener('change', function () {
      persist(function (fresh) {
        var fb = fresh.blocks.find(function (x) { return x.id === id; });
        if (fb) { fb.content = fb.content || {}; fb.content.text = ta.value; fb.updatedAt = now(); }
        logTo(fresh, isIdea ? 'Idea editada (ventana)' : 'Nota editada (ventana)', snippet(ta.value));
      });
    });
    refs.ta = ta;

    var grid = h('div', { class: 'nw-grid' });
    renderImages(grid, b);
    refs.grid = grid;

    return h('div', { class: 'nw-body' },
      toolbar,
      ta,
      h('div', { class: 'nw-imgs-title' }, icon('image'), 'Im\u00e1genes'),
      grid
    );
  }

  function renderImageBody(b) {
    var fileInput = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
    var toolbar = h('div', { class: 'nw-toolbar' },
      h('button', { class: 'nw-btn', onclick: function () { fileInput.click(); } }, icon('image'), 'Insertar imagen'),
      h('span', { class: 'nw-hint' }, 'o pega con Ctrl+V'),
      fileInput
    );
    var grid = h('div', { class: 'nw-grid nw-grid-big' });
    renderImages(grid, b);
    refs.grid = grid;
    return h('div', { class: 'nw-body' }, toolbar, grid);
  }

  function renderMdBody(b) {
    var view = h('div', { class: 'md-render nw-md' });
    view.innerHTML = renderMarkdown((b.content && b.content.text) || '');
    var ta = h('textarea', { class: 'nw-ta mono', placeholder: '# T\u00edtulo\n\nEscribe **Markdown**...' });
    ta.value = (b.content && b.content.text) || '';
    ta.style.display = 'none';
    var editing = false;
    var toggleBtn = h('button', { class: 'nw-btn' }, icon('format'), 'Editar');
    toggleBtn.addEventListener('click', function () {
      editing = !editing;
      ta.style.display = editing ? '' : 'none';
      view.style.display = editing ? 'none' : '';
      toggleBtn.lastChild.textContent = editing ? 'Previsualizar' : 'Editar';
      if (editing) ta.focus(); else view.innerHTML = renderMarkdown(ta.value);
    });
    var mdT;
    ta.addEventListener('input', function () {
      clearTimeout(mdT);
      mdT = setTimeout(function () {
        persist(function (fresh) {
          var fb = fresh.blocks.find(function (x) { return x.id === id; });
          if (fb) {
            fb.content = fb.content || {};
            fb.content.text = ta.value;
            fb.updatedAt = now();
            var fn = fresh.notes.find(function (n) { return n.id === fb.noteId; });
            if (fn) fn.updatedAt = now();
          }
        });
      }, 250);
    });
    ta.addEventListener('change', function () {
      persist(function (fresh) {
        var fb = fresh.blocks.find(function (x) { return x.id === id; });
        if (fb) { fb.content = fb.content || {}; fb.content.text = ta.value; fb.updatedAt = now(); }
        logTo(fresh, 'Markdown editado (ventana)', snippet(ta.value));
      });
    });
    refs.mdView = view; refs.mdTa = ta; refs.mdEditing = function () { return editing; };
    var toolbar = h('div', { class: 'nw-toolbar' }, toggleBtn, h('span', { class: 'nw-hint' }, 'Markdown formateado'));
    return h('div', { class: 'nw-body' }, toolbar, view, ta);
  }

  function renderPdfBody(b) {
    var src = resolveSrc(b.content && b.content.pdf);
    var body = h('div', { class: 'nw-body nw-pdf-body' });
    if (src) {
      body.appendChild(h('iframe', { class: 'nw-pdf', src: src, title: (b.content && b.content.name) || 'PDF' }));
    } else {
      body.appendChild(h('div', { class: 'nw-empty' }, 'Este bloque no contiene un PDF.'));
    }
    return body;
  }

  // ---------- Sincronizaci\u00f3n con la app principal ----------
  function onExternal() {
    var d = loadData();
    var ctx = getCtx(d);
    if (!ctx) { render(); return; }
    var b = ctx.b;
    if (refs.ta && document.activeElement !== refs.ta) {
      var txt = (b.content && b.content.text) || '';
      if (refs.ta.value !== txt) refs.ta.value = txt;
    }
    if (refs.grid) renderImages(refs.grid, b);
    if (refs.mdTa && refs.mdView && !(refs.mdEditing && refs.mdEditing())) {
      var mtxt = (b.content && b.content.text) || '';
      if (refs.mdTa.value !== mtxt) {
        refs.mdTa.value = mtxt;
        refs.mdView.innerHTML = renderMarkdown(mtxt);
      }
    }
    if (refs.title && document.activeElement !== refs.title && ctx.note) {
      if (refs.title.value !== ctx.note.title) refs.title.value = ctx.note.title;
    }
    document.title = (ctx.note ? ctx.note.title : 'Nota') + ' \u00b7 tuNota';
  }
  var syncT;
  function scheduleExternal() {
    clearTimeout(syncT);
    syncT = setTimeout(function () {
      hydrateMissingBlobs(function () { onExternal(); });
    }, 60);
  }
  if (bc) bc.onmessage = function (ev) { if (ev && ev.data && ev.data.app === 'tunota') scheduleExternal(); };
  window.addEventListener('storage', function (e) { if (e.key === LS_DATA) scheduleExternal(); });

  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        var f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });

  if (!id) {
    root.appendChild(msg('Falta el identificador de la nota.'));
  } else {
    // Hidrata los blobs antes del primer render para que imágenes/PDF aparezcan.
    BlobStore.all()
      .then(function (map) { blobCache = map || {}; })
      .catch(function () {})
      .then(render);
  }
})();
