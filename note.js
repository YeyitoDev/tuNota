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
  };
  function icon(name) { return h('span', { class: 'icon', html: ICONS[name] || '' }); }

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
            fb.content.images.push(url);
            fb.updatedAt = now();
            logTo(fresh, 'Imagen a\u00f1adida', '');
          }
        });
        pending--;
        if (pending <= 0) render();
      });
    });
  }
  function removeImage(index) {
    persist(function (fresh) {
      var fb = fresh.blocks.find(function (x) { return x.id === id; });
      if (fb && fb.content && fb.content.images) {
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
    imgs.forEach(function (src, i) {
      grid.appendChild(
        h('figure', { class: 'nw-fig' },
          h('img', { src: src, alt: '' }),
          h('button', { class: 'rm', title: 'Eliminar imagen', onclick: function () { removeImage(i); } }, icon('trash'))
        )
      );
    });
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

    var fileInput = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
    var toolbar = h('div', { class: 'nw-toolbar' },
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

    var body = h('div', { class: 'nw-body' },
      toolbar,
      ta,
      h('div', { class: 'nw-imgs-title' }, icon('image'), 'Im\u00e1genes'),
      grid
    );

    root.appendChild(head);
    root.appendChild(body);
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
    if (refs.title && document.activeElement !== refs.title && ctx.note) {
      if (refs.title.value !== ctx.note.title) refs.title.value = ctx.note.title;
    }
    document.title = (ctx.note ? ctx.note.title : 'Nota') + ' \u00b7 tuNota';
  }
  var syncT;
  function scheduleExternal() { clearTimeout(syncT); syncT = setTimeout(onExternal, 60); }
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
    render();
  }
})();
