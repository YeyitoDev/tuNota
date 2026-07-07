/* tuNota — Formateo de texto y bloques ejecutables: cURL, Python (Pyodide) y tablas.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Formateo de texto (respeta enumeraciones y saltos de l\u00ednea) ----------
function formatTextContent(text) {
  var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  var out = [];
  var counter = 0, prevOrdered = false, blankRun = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, '');           // quita espacios al final
    var im = line.match(/^([ \t]*)/);
    var indent = (im ? im[1] : '').replace(/\t/g, '  ');
    var body = line.slice(im ? im[1].length : 0);

    if (body === '') {                                  // l\u00ednea en blanco
      blankRun++;
      if (blankRun > 1) { prevOrdered = false; counter = 0; } // salto de p\u00e1rrafo: reinicia la lista
      // una sola l\u00ednea en blanco NO reinicia la numeraci\u00f3n (listas con doble espacio)
      if (out.length === 0 || blankRun > 1) continue;   // colapsa blancos y quita los del inicio
      out.push('');
      continue;
    }
    blankRun = 0;

    var om = body.match(/^(\d+)[.)]\s+(.*)$/);          // lista numerada: "1." o "1)"
    if (om) {
      counter = prevOrdered ? counter + 1 : 1;
      prevOrdered = true;
      out.push(indent + counter + '. ' + om[2].replace(/[ \t]{2,}/g, ' ').trim());
      continue;
    }
    prevOrdered = false; counter = 0;

    var bm = body.match(/^([-*\u2022\u00b7\u2013\u2014])\s+(.*)$/); // vi\u00f1etas: - * \u2022 \u00b7 \u2013 \u2014
    if (bm) {
      out.push(indent + '- ' + bm[2].replace(/[ \t]{2,}/g, ' ').trim());
      continue;
    }

    out.push(indent + body.replace(/[ \t]{2,}/g, ' ')); // texto normal: colapsa espacios internos
  }
  while (out.length && out[out.length - 1] === '') out.pop(); // quita blancos al final
  return out.join('\n');
}
function formatCardText(b, el) {
  var ta = el.querySelector('.card-ta');
  if (!ta) return;
  var formatted = formatTextContent(ta.value);
  if (formatted === ta.value) return;
  ta.value = formatted;
  b.content = b.content || {};
  b.content.text = formatted;
  touchNote(b.noteId);
  logChange((b.type === 'idea' ? 'Idea' : 'Nota') + ' formateada', snippet(formatted));
  save();
}
function monoBody(b) {
  b.content = b.content || {};
  var ph = b.type === 'curl' ? 'curl -X GET https://api.ejemplo.com' : (b.type === 'json' ? '{\n  "clave": "valor"\n}' : (b.type === 'python' ? 'print("Hola")' : '// tu c\u00f3digo aqu\u00ed'));
  var ta = h('textarea', { class: 'card-ta mono', spellcheck: 'false', placeholder: ph });
  ta.value = b.content.text || '';
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange(typeMeta(b.type).label + ' editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(ta, '  '); b.content.text = ta.value; debouncedSave(); }
    if (b.type === 'curl' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCurlBlock(b, ta, out, status, runBtn); }
    if (b.type === 'python' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPythonBlock(b, ta, out, status, runBtn); }
  });
  if (b.type === 'python') {
    ta.classList.add('curl-input');
    var status = h('span', { class: 'mono-status' });
    var out = h('div', { class: 'py-out' });
    var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar el código (Ctrl+Enter)', onclick: function (e) {
      e.stopPropagation(); runPythonBlock(b, ta, out, status, runBtn);
    } }, 'Ejecutar');
    runBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var copyBtn = h('button', { class: 'mono-fmt', title: 'Copiar salida', onclick: function (e) {
      e.stopPropagation();
      var txt = out.textContent || '';
      if (!txt || out.classList.contains('empty')) return;
      try { navigator.clipboard.writeText(txt); status.textContent = 'Copiado'; status.className = 'mono-status ok'; } catch (err) {}
    } }, 'Copiar');
    copyBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('wheel', function (e) { e.stopPropagation(); });
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la salida' });
    var outH = (b.content.ui && b.content.ui.outH) || 150;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.result) renderPyResult(b.content.result, out, status);
    else { out.classList.add('empty'); out.textContent = 'La salida aparecerá aquí tras ejecutar (Ctrl+Enter).'; }
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, status), resize, out];
  }
  if (b.type === 'curl') {
    ta.classList.add('curl-input');
    var status = h('span', { class: 'mono-status' });
    var out = h('pre', { class: 'curl-out' });
    var runBtn = h('button', { class: 'mono-fmt run', title: 'Ejecutar la petici\u00f3n (Ctrl+Enter)', onclick: function (e) {
      e.stopPropagation(); runCurlBlock(b, ta, out, status, runBtn);
    } }, 'Ejecutar');
    runBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var copyBtn = h('button', { class: 'mono-fmt', title: 'Copiar respuesta', onclick: function (e) {
      e.stopPropagation();
      if (!out.textContent || out.classList.contains('empty')) return;
      try { navigator.clipboard.writeText(out.textContent); status.textContent = 'Copiado'; status.className = 'mono-status ok'; } catch (err) {}
    } }, 'Copiar');
    copyBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    out.addEventListener('wheel', function (e) { e.stopPropagation(); });
    var resize = h('div', { class: 'curl-resize', title: 'Arrastra para ajustar el alto de la respuesta' });
    var outH = (b.content.ui && b.content.ui.outH) || 130;
    out.style.height = outH + 'px';
    attachCurlResize(resize, out, b);
    if (b.content.response && b.content.response.body != null) renderCurlResponse(b.content.response, out, status);
    else { out.classList.add('empty'); out.textContent = 'La respuesta aparecer\u00e1 aqu\u00ed tras ejecutar.'; }
    return [ta, h('div', { class: 'mono-bar' }, runBtn, copyBtn, status), resize, out];
  }
  if (b.type !== 'json') return [ta];
  var status = h('span', { class: 'mono-status' });
  var fmt = h('button', { class: 'mono-fmt', title: 'Formatear JSON', onclick: function (e) {
    e.stopPropagation();
    try {
      ta.value = JSON.stringify(JSON.parse(ta.value || 'null'), null, 2);
      b.content.text = ta.value; save();
      status.textContent = 'Formateado'; status.className = 'mono-status ok';
    } catch (err) {
      status.textContent = 'JSON inv\u00e1lido'; status.className = 'mono-status err';
    }
  } }, 'Formatear');
  fmt.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  return [ta, h('div', { class: 'mono-bar' }, fmt, status)];
}

// ---------- Ejecuci\u00f3n de cURL ----------
function attachCurlResize(handle, out, b) {
  handle.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var startY = e.clientY;
    var startH = out.getBoundingClientRect().height;
    var card = out.closest('.card');
    document.body.classList.add('curl-resizing');
    function move(ev) {
      var dy = startY - ev.clientY; // arrastrar hacia arriba agranda la respuesta
      var hgt = Math.max(40, startH + dy);
      if (card) { var maxH = card.clientHeight - 150; if (maxH > 60) hgt = Math.min(hgt, maxH); }
      out.style.height = Math.round(hgt) + 'px';
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('curl-resizing');
      b.content = b.content || {};
      b.content.ui = b.content.ui || {};
      b.content.ui.outH = Math.round(out.getBoundingClientRect().height);
      debouncedSave();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
function renderCurlResponse(resp, out, status) {
  out.style.display = '';
  out.classList.remove('empty');
  out.innerHTML = '';
  var body = resp.body || '';
  var ctype = (resp.contentType || '').toLowerCase();
  var pretty = body, isJson = false;
  var looksJson = ctype.indexOf('json') !== -1 || /^\s*[\[{]/.test(body);
  if (looksJson) {
    try { pretty = JSON.stringify(JSON.parse(body), null, 2); isJson = true; } catch (e) { pretty = body; }
  }
  if (isJson) out.appendChild(highlightJSON(pretty));
  else out.textContent = pretty;
  var ok = resp.status >= 200 && resp.status < 300;
  status.textContent = resp.status + ' ' + (resp.reason || '') + (resp.timeMs != null ? '  \u00b7 ' + resp.timeMs + ' ms' : '');
  status.className = 'mono-status ' + (ok ? 'ok' : 'err');
}
function runCurlBlock(b, ta, out, status, runBtn) {
  b.content.text = ta.value;
  var cmd = (ta.value || '').trim();
  if (!cmd) { status.textContent = 'Escribe un comando cURL'; status.className = 'mono-status err'; return; }
  if (!SERVER || !window.fetch) {
    status.textContent = 'Requiere el servidor: py server.py'; status.className = 'mono-status err';
    out.style.display = ''; out.classList.remove('empty'); out.textContent = 'La ejecuci\u00f3n de cURL necesita el servidor Python (api/curl).\nInicia con:  py server.py  y abre http://localhost:8765';
    return;
  }
  status.textContent = 'Ejecutando\u2026'; status.className = 'mono-status';
  runBtn.disabled = true;
  fetch('api/curl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) })
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      runBtn.disabled = false;
      if (!resp || resp.ok === false) {
        status.textContent = 'Error'; status.className = 'mono-status err';
        out.style.display = ''; out.classList.remove('empty'); out.textContent = (resp && resp.error) || 'No se pudo ejecutar la petici\u00f3n.';
        return;
      }
      b.content.response = { status: resp.status, reason: resp.reason, body: resp.body, contentType: resp.contentType, timeMs: resp.timeMs };
      renderCurlResponse(resp, out, status);
      logChange('cURL ejecutado', (resp.method || '') + ' ' + resp.status + ' ' + snippet(resp.url || ''));
      save();
    })
    .catch(function (err) {
      runBtn.disabled = false;
      status.textContent = 'Error de red'; status.className = 'mono-status err';
      out.style.display = ''; out.classList.remove('empty'); out.textContent = String(err);
    });
}
// ---------- Ejecuci\u00f3n de Python (Pyodide, en el navegador) ----------
var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';
var _pyodide = null, _pyLoading = null;
function ensurePyodide() {
  if (_pyodide) return Promise.resolve(_pyodide);
  if (_pyLoading) return _pyLoading;
  _pyLoading = new Promise(function (resolve, reject) {
    function boot() {
      if (!window.loadPyodide) { reject(new Error('Pyodide no disponible.')); return; }
      window.loadPyodide({ indexURL: PYODIDE_URL })
        .then(function (py) { _pyodide = py; resolve(py); })
        .catch(reject);
    }
    if (window.loadPyodide) return boot();
    var s = document.createElement('script');
    s.src = PYODIDE_URL + 'pyodide.js';
    s.onload = boot;
    s.onerror = function () { reject(new Error('No se pudo cargar Pyodide (requiere conexi\u00f3n a internet).')); };
    document.head.appendChild(s);
  });
  return _pyLoading;
}
var PY_HARNESS = [
  'import sys, io, traceback, contextlib',
  '_buf = io.StringIO()',
  '_err = None',
  '_img = None',
  'try:',
  '    with contextlib.redirect_stdout(_buf), contextlib.redirect_stderr(_buf):',
  "        exec(compile(_USER_CODE, '<tunota>', 'exec'), globals())",
  '    try:',
  '        import matplotlib',
  '        import matplotlib.pyplot as _plt',
  '        if _plt.get_fignums():',
  '            import base64, io as _io2',
  '            _b = _io2.BytesIO()',
  "            _plt.savefig(_b, format='png', bbox_inches='tight', dpi=110)",
  "            _plt.close('all')",
  "            _img = base64.b64encode(_b.getvalue()).decode('ascii')",
  '    except Exception:',
  '        pass',
  'except Exception:',
  '    _err = traceback.format_exc()',
  '_out_text = _buf.getvalue()',
].join('\n');
function runPythonBlock(b, ta, out, status, runBtn) {
  b.content.text = ta.value;
  var code = ta.value || '';
  if (!code.trim()) { status.textContent = 'Escribe c\u00f3digo Python'; status.className = 'mono-status err'; return; }
  status.textContent = 'Cargando Python\u2026'; status.className = 'mono-status';
  runBtn.disabled = true;
  var t0 = Date.now();
  ensurePyodide().then(function (py) {
    status.textContent = 'Preparando paquetes\u2026';
    return py.loadPackagesFromImports(code).catch(function () {}).then(function () { return py; });
  }).then(function (py) {
    status.textContent = 'Ejecutando\u2026';
    py.globals.set('_USER_CODE', code);
    return py.runPythonAsync(PY_HARNESS).then(function () { return py; });
  }).then(function (py) {
    var text = py.globals.get('_out_text');
    var err = py.globals.get('_err');
    var img = py.globals.get('_img');
    var res = { text: text ? String(text) : '', error: err ? String(err) : '', img: img ? storeBlob('data:image/png;base64,' + String(img)) : '', timeMs: Date.now() - t0 };
    b.content.result = res;
    renderPyResult(res, out, status);
    logChange('Python ejecutado', res.error ? 'con error' : 'ok');
    save();
    runBtn.disabled = false;
  }).catch(function (e) {
    runBtn.disabled = false;
    status.textContent = 'Error'; status.className = 'mono-status err';
    out.style.display = ''; out.classList.remove('empty'); out.innerHTML = '';
    out.appendChild(h('pre', { class: 'py-err' }, String((e && e.message) || e)));
  });
}
function renderPyResult(res, out, status) {
  out.style.display = ''; out.classList.remove('empty'); out.innerHTML = '';
  if (res.text) out.appendChild(h('pre', { class: 'py-stdout' }, res.text));
  if (res.img) out.appendChild(h('img', { class: 'py-img', src: pyImgSrc(res.img), alt: 'gr\u00e1fico' }));
  if (res.error) out.appendChild(h('pre', { class: 'py-err' }, res.error));
  if (!res.text && !res.img && !res.error) out.textContent = '(sin salida)';
  if (res.error) { status.textContent = 'Error \u00b7 ' + res.timeMs + ' ms'; status.className = 'mono-status err'; }
  else { status.textContent = 'OK \u00b7 ' + res.timeMs + ' ms'; status.className = 'mono-status ok'; }
}

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

// ---------- Tablas ----------
function newRow(n) { var r = []; for (var i = 0; i < n; i++) r.push(''); return r; }
function tableBody(b) {
  b.content = b.content || {};
  if (!b.content.table || !b.content.table.rows || !b.content.table.rows.length) b.content.table = { rows: [['', ''], ['', '']] };
  var wrap = h('div', { class: 'card-table-wrap' });
  renderTable(wrap, b);
  return wrap;
}
function renderTable(wrap, b) {
  wrap.innerHTML = '';
  var rows = b.content.table.rows;
  var table = h('table', { class: 'mini-table' });
  rows.forEach(function (row, r) {
    var tr = h('tr', r === 0 ? { class: 'thead' } : {});
    row.forEach(function (cell, c) {
      var inp = h('input', { class: 'cell', value: cell });
      inp.addEventListener('input', function () { b.content.table.rows[r][c] = inp.value; touchNote(b.noteId); debouncedSave(); });
      inp.addEventListener('change', save);
      inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      tr.appendChild(h('td', {}, inp));
    });
    table.appendChild(tr);
  });
  var mk = function (label, op, title) {
    var btn = h('button', { class: 'tbl-btn', title: title, onclick: function (e) { e.stopPropagation(); resizeTable(b, wrap, op); } }, label);
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    return btn;
  };
  var tools = h('div', { class: 'tbl-tools' },
    mk('+ fila', 'addRow', 'Agregar fila'),
    mk('\u2212 fila', 'delRow', 'Quitar fila'),
    mk('+ col', 'addCol', 'Agregar columna'),
    mk('\u2212 col', 'delCol', 'Quitar columna')
  );
  wrap.appendChild(table);
  wrap.appendChild(tools);
}
function resizeTable(b, wrap, op) {
  var rows = b.content.table.rows;
  var nCols = rows[0] ? rows[0].length : 0;
  if (op === 'addRow') rows.push(newRow(nCols));
  else if (op === 'delRow') { if (rows.length > 1) rows.pop(); }
  else if (op === 'addCol') rows.forEach(function (r) { r.push(''); });
  else if (op === 'delCol') { if (nCols > 1) rows.forEach(function (r) { r.pop(); }); }
  touchNote(b.noteId);
  logChange('Tabla modificada', rows.length + '\u00d7' + (rows[0] ? rows[0].length : 0));
  save();
  renderTable(wrap, b);
}
