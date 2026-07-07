/* tuNota — Backend JSON opcional, sincronización entre ventanas, historial, integraciones, copias de seguridad (UI), grafo y renderAll.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Backend JSON (opcional) ----------
var SERVER = false, srvT = null;
function normalizeData() {
  data.notebooks = data.notebooks || [];
  data.sections = data.sections || [];
  data.notes = data.notes || [];
  data.blocks = data.blocks || [];
  data.log = data.log || [];
}
function serverSave() {
  if (!SERVER || !window.fetch) return;
  clearTimeout(srvT);
  srvT = setTimeout(serverSaveNow, 500);
}
function serverSaveNow() {
  if (!SERVER || !window.fetch) return;
  // data solo contiene referencias 'blob:<id>' (db.json queda pequeño).
  // Los bytes de los blobs aún NO se sincronizan al servidor (Fase 4: multi-dispositivo).
  fetch('api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(function () {});
}
function serverLoad(done) {
  if (!window.fetch) { done(); return; }
  var local = data;
  fetch('api/data', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (srv) {
      SERVER = true;
      if (srv && srv.notebooks && srv.notebooks.length) {
        var srvAt = srv.savedAt || 0, locAt = (local && local.savedAt) || 0;
        if (srvAt >= locAt) {
          data = srv; normalizeData();
          writeLS(LS_DATA, JSON.stringify(data));
          if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { var n0 = data.notes[0]; if (n0) ui.currentNoteId = n0.id; }
        } else { serverSaveNow(); }
      } else { serverSaveNow(); }
      done();
    })
    .catch(function () { SERVER = false; done(); });
}

// ---------- Ventana emergente / Sincronización ----------
var openWins = {};
var poppedIds = {};
var winWatch = null;
function getBlockById(id) { return data.blocks.find(function (x) { return x.id === id; }); }
function cardEl(id) { return canvasContentEl ? canvasContentEl.querySelector('.card[data-id="' + id + '"]') : null; }

function popOut(id) {
  var ex = openWins[id];
  if (ex && !ex.closed) { try { ex.focus(); } catch (e) {} return; }
  var blk = getBlockById(id);
  var dim = 'width=600,height=680';
  if (blk && blk.type === 'pdf') dim = 'width=980,height=900';
  else if (blk && blk.type === 'image') dim = 'width=820,height=780';
  else if (blk && blk.type === 'markdown') dim = 'width=760,height=820';
  else if (blk && blk.type === 'mermaid') dim = 'width=900,height=760';
  else if (blk && blk.type === 'curl') dim = 'width=820,height=760';
  else if (blk && (blk.type === 'code' || blk.type === 'json')) dim = 'width=760,height=700';
  var w = window.open('note.html?id=' + encodeURIComponent(id), 'tunota_' + id, dim);
  if (!w) {
    window.alert('El navegador bloque\u00f3 la ventana emergente.\n\nPermite las ventanas emergentes (pop-ups) para este sitio y vuelve a intentarlo.');
    return;
  }
  openWins[id] = w;
  poppedIds[id] = true;
  var el = cardEl(id);
  if (el) updateCardPoppedState(el, getBlockById(id));
  startWinWatch();
  try { w.focus(); } catch (e) {}
}
function startWinWatch() {
  if (winWatch) return;
  winWatch = setInterval(function () {
    var any = false;
    Object.keys(openWins).forEach(function (id) {
      var w = openWins[id];
      if (!w || w.closed) {
        delete openWins[id];
        delete poppedIds[id];
        var el = cardEl(id);
        var blk = getBlockById(id);
        if (el && blk) updateCardPoppedState(el, blk);
        scheduleSync();
      } else {
        any = true;
      }
    });
    if (!any) { clearInterval(winWatch); winWatch = null; }
  }, 800);
}

function updateCardMedia(el, b) {
  var imgs = (b.content && b.content.images) || [];
  var chip = el.querySelector('.card-imgs');
  if (chip) {
    chip.innerHTML = '';
    if (imgs.length) { chip.style.display = ''; chip.appendChild(icon('image')); chip.appendChild(document.createTextNode(' ' + imgs.length)); }
    else { chip.style.display = 'none'; }
  }
  var media = el.querySelector('.card-media');
  if (media) {
    if (media.getAttribute('data-resizing') === '1') return;
    media.innerHTML = '';
    if (imgs.length) {
      media.style.display = '';
      imgs.forEach(function (_it, i) { media.appendChild(cardFigure(b, i, el)); });
    } else if (b.type === 'image') {
      media.style.display = '';
      media.appendChild(h('div', { class: 'card-media-empty' }, 'Pega (Ctrl+V) o inserta una imagen'));
    } else { media.style.display = 'none'; }
  }
}
function updateCardPoppedState(el, b) {
  var popped = !!poppedIds[b.id];
  el.classList.toggle('is-popped', popped);
  var ta = el.querySelector('.card-ta');
  if (ta) ta.readOnly = popped;
}

var syncT;
function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(syncAfterExternal, 80); }
function activeCardId() {
  var a = document.activeElement;
  if (a && a.classList && a.classList.contains('card-ta')) { var c = a.closest('.card'); return c ? c.getAttribute('data-id') : null; }
  return null;
}
function syncAfterExternal() {
  var fresh = loadJSON(LS_DATA);
  if (!fresh) return;
  mergeFromStorage(fresh);
  refreshAfterMerge();
  serverSave();
  hydrateMissingBlobs();
}
function mergeFromStorage(fresh) {
  var activeId = activeCardId();
  var have = {};
  data.blocks.forEach(function (b) { have[b.id] = b; });
  var freshIds = {};
  (fresh.blocks || []).forEach(function (fb) {
    freshIds[fb.id] = 1;
    var ex = have[fb.id];
    if (ex) {
      ex.reminder = fb.reminder;
      ex.important = fb.important;
      ex.kanban = fb.kanban; ex.kanbanOrder = fb.kanbanOrder; ex.kanbanAt = fb.kanbanAt;
      if (fb.id !== activeId) {
        ex.content = fb.content;
        ex.x = fb.x; ex.y = fb.y; ex.width = fb.width; ex.height = fb.height; ex.updatedAt = fb.updatedAt;
      }
    } else {
      data.blocks.push(fb);
    }
  });
  data.blocks = data.blocks.filter(function (b) { return freshIds[b.id]; });
  data.notes = fresh.notes || [];
  data.sections = fresh.sections || [];
  data.notebooks = fresh.notebooks || [];
  data.links = fresh.links || [];
  data.log = fresh.log || [];
}
var lastSig = '';
function sidebarSig() {
  return (
    data.notebooks.map(function (n) { return n.id + n.name + (n.emoji || ''); }).join('|') + '#' +
    data.sections.map(function (s) { return s.id + s.name; }).join('|') + '#' +
    data.notes.map(function (n) { return n.id + n.title + n.sectionId; }).join('|')
  );
}
function refreshAfterMerge() {
  var a = document.activeElement;
  var editingInline = a && a.classList && a.classList.contains('inline-edit');
  syncCanvasCards();
  if (!editingInline) {
    var sig = sidebarSig();
    if (sig !== lastSig) { renderSidebar(); lastSig = sig; }
    renderTopbar();
  }
}
function syncCanvasCards() {
  if (!canvasContentEl) return;
  var current = ui.currentNoteId;
  var present = {};
  Array.prototype.forEach.call(canvasContentEl.querySelectorAll('.card'), function (el) {
    var id = el.getAttribute('data-id');
    var blk = getBlockById(id);
    if (!blk || blk.noteId !== current) { el.remove(); return; }
    present[id] = 1;
    var ta = el.querySelector('.card-ta');
    if (ta && document.activeElement !== ta) {
      var txt = (blk.content && blk.content.text) || '';
      if (ta.value !== txt) ta.value = txt;
    }
    el.style.left = blk.x + 'px';
    el.style.top = blk.y + 'px';
    updateCardMedia(el, blk);
    updateCardPoppedState(el, blk);
  });
  if (current) {
    blocksOf(current).forEach(function (blk) {
      if (!present[blk.id]) canvasContentEl.appendChild(card(blk));
    });
  }
  drawLinks();
}

// ---------- Historial de cambios ----------
function openLog() {
  closeLog();
  var overlay = h('div', { class: 'overlay', id: 'logOverlay', onclick: function (e) { if (e.target === overlay) closeLog(); } });
  var panel = h('div', { class: 'log-panel' });
  var head = h(
    'div',
    { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('clock'), 'Historial de cambios'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeLog }, icon('x'))
  );
  var body = h('div', { class: 'log-body' });
  var entries = data.log || [];
  if (entries.length === 0) {
    body.appendChild(h('p', { class: 'tree-empty' }, 'A\u00fan no hay cambios registrados.'));
  } else {
    groupByDate(entries).forEach(function (g) {
      body.appendChild(h('div', { class: 'log-date' }, g.label));
      g.items.forEach(function (it) {
        body.appendChild(
          h(
            'div',
            { class: 'log-item' },
            h('span', { class: 'log-time' }, fmtTime(it.ts)),
            h(
              'div',
              { class: 'log-text' },
              h('div', { class: 'log-action' }, it.action),
              it.detail ? h('div', { class: 'log-detail' }, it.detail) : null
            )
          )
        );
      });
    });
  }
  panel.appendChild(head);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escClose);
}
function escClose(e) { if (e.key === 'Escape') closeLog(); }
function closeLog() {
  var o = document.getElementById('logOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escClose);
}

// ---------- Integraciones y versiones ----------
function getIntegrations() {
  var mmdLoaded = !!window.mermaid;
  var mmdVer = mmdLoaded && window.mermaid.version ? window.mermaid.version : null;
  var serverOn = (typeof SERVER !== 'undefined') && !!SERVER;
  return [
    {
      name: 'Mermaid',
      desc: 'Diagramas de texto (flowchart, secuencia, swimlanes\u2026)',
      version: mmdVer ? mmdVer : '11 (latest)',
      requested: '11 (latest)',
      ok: mmdLoaded,
      statusText: mmdLoaded ? 'Cargado' : 'No disponible (requiere internet)',
      url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    },
    {
      name: 'Servidor local (API)',
      desc: 'Ejecuci\u00f3n de cURL y guardado en disco (server.py)',
      version: 'HTTP api/*',
      requested: 'py server.py',
      ok: serverOn,
      statusText: serverOn ? 'Conectado' : 'Sin conexi\u00f3n (modo solo navegador)',
      url: '',
    },
    {
      name: 'Google Fonts',
      desc: 'Tipograf\u00edas Fraunces y Nunito',
      version: 'CSS2 API',
      requested: 'Fraunces + Nunito',
      ok: true,
      statusText: 'Enlazado',
      url: 'https://fonts.googleapis.com',
    },
  ];
}
function openIntegrations() {
  closeIntegrations();
  var overlay = h('div', { class: 'overlay', id: 'integOverlay', onclick: function (e) { if (e.target === overlay) closeIntegrations(); } });
  var panel = h('div', { class: 'log-panel integ-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('info'), 'Integraciones y versiones'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeIntegrations }, icon('x'))
  );
  var body = h('div', { class: 'log-body' });
  getIntegrations().forEach(function (it) {
    var row = h('div', { class: 'integ-row' },
      h('span', { class: 'integ-dot ' + (it.ok ? 'ok' : 'off') }),
      h('div', { class: 'integ-main' },
        h('div', { class: 'integ-name' }, it.name, h('span', { class: 'integ-ver' }, 'v' + it.version)),
        h('div', { class: 'integ-desc' }, it.desc),
        it.url ? h('a', { class: 'integ-url', href: it.url, target: '_blank', rel: 'noopener' }, it.url) : null
      ),
      h('span', { class: 'integ-status ' + (it.ok ? 'ok' : 'off') }, it.statusText)
    );
    body.appendChild(row);
  });
  body.appendChild(h('p', { class: 'integ-note' }, 'Los swimlanes nativos de Mermaid requieren v11.16.0+ (sintaxis "swimlane-beta", a\u00fan en beta).'));
  panel.appendChild(head);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseInteg);
}
function escCloseInteg(e) { if (e.key === 'Escape') closeIntegrations(); }
function closeIntegrations() {
  var o = document.getElementById('integOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseInteg);
}

// ---------- Copias de seguridad (UI) ----------
function snapCounts(snap) {
  try {
    var d = JSON.parse(snap.json);
    return (d.notes || []).length + ' notas · ' + (d.blocks || []).length + ' bloques';
  } catch (e) { return ''; }
}
function pickBackupFile() {
  var input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', function () {
    if (input.files && input.files[0]) importBackupFile(input.files[0]);
    input.value = '';
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(function () { input.remove(); }, 60000);
}
function openBackups() {
  closeBackups();
  var overlay = h('div', { class: 'overlay', id: 'backupOverlay', onclick: function (e) { if (e.target === overlay) closeBackups(); } });
  var panel = h('div', { class: 'log-panel backup-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('shield'), 'Copias de seguridad'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeBackups }, icon('x'))
  );
  var actions = h('div', { class: 'backup-actions' },
    h('button', { class: 'backup-btn primary', onclick: downloadBackup }, icon('download'), 'Descargar copia completa'),
    h('button', { class: 'backup-btn', onclick: pickBackupFile }, icon('upload'), 'Importar copia')
  );
  var body = h('div', { class: 'log-body' });
  body.appendChild(h('p', { class: 'tree-empty' }, 'Cargando copias…'));
  BlobStore.all('backups').then(function (map) {
    body.innerHTML = '';
    var snaps = Object.keys(map || {}).map(function (k) { return map[k]; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!snaps.length) {
      body.appendChild(h('p', { class: 'tree-empty' }, 'Aún no hay copias automáticas. Se crean solas mientras trabajas.'));
      return;
    }
    body.appendChild(h('div', { class: 'log-date' }, 'Copias automáticas (se guardan las últimas ' + SNAP_MAX + ')'));
    snaps.forEach(function (s) {
      body.appendChild(h('div', { class: 'backup-row' },
        h('div', { class: 'backup-info' },
          h('div', { class: 'backup-when' }, fmtDate(s.ts) + ' · ' + fmtTime(s.ts)),
          h('div', { class: 'backup-meta' }, snapCounts(s))
        ),
        h('button', { class: 'backup-btn', onclick: function () { restoreSnapshot(s); } }, 'Restaurar')
      ));
    });
  }).catch(function () {
    body.innerHTML = '';
    body.appendChild(h('p', { class: 'tree-empty' }, 'No se pudieron leer las copias.'));
  });
  panel.appendChild(head);
  panel.appendChild(actions);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseBackups);
}
function escCloseBackups(e) { if (e.key === 'Escape') closeBackups(); }
function closeBackups() {
  var o = document.getElementById('backupOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseBackups);
}
function groupByDate(entries) {
  var map = {}, order = [];
  entries.forEach(function (e) {
    var k = fmtDate(e.ts);
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(e);
  });
  return order.map(function (k) { return { label: k, items: map[k] }; });
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDate(ts) {
  var d = new Date(ts), today = new Date(), y = new Date();
  y.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, y)) return 'Ayer';
  try { return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch (e) { return d.toLocaleDateString(); }
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(ts).toLocaleTimeString(); }
}

// ---------- Mapa de conocimiento (grafo tipo Obsidian) ----------
function graphBlockLabel(b) {
  if (b.type === 'pdf') return (b.content && b.content.name) || 'PDF';
  if (b.type === 'image') return 'Imagen';
  if (b.type === 'mermaid') return 'Diagrama';
  if (b.type === 'markdown') {
    var t = (b.content && b.content.text) || '';
    var m = t.match(/^#{1,6}\s+(.+)$/m);
    return (m ? m[1].trim() : snippet(t)) || 'Markdown';
  }
  if (b.type === 'code' || b.type === 'json' || b.type === 'curl' || b.type === 'table') return typeMeta(b.type).label;
  return snippet(b.content && b.content.text) || typeMeta(b.type).label;
}
function buildGraphTree() {
  var root = { id: 'root', label: 'tuNota', kind: 'root', children: [] };
  notebooksAll().forEach(function (nb) {
    var nbNode = { id: 'nb-' + nb.id, label: (nb.emoji ? nb.emoji + ' ' : '') + nb.name, kind: 'notebook', children: [] };
    sectionsOf(nb.id).forEach(function (s) {
      var sNode = { id: 'sec-' + s.id, label: s.name, kind: 'section', children: [] };
      notesOf(s.id).forEach(function (n) {
        var nNode = { id: 'note-' + n.id, label: n.title || 'Nota', kind: 'note', noteId: n.id, children: [] };
        blocksOf(n.id).forEach(function (b) {
          if (b.type === 'markdown' || b.type === 'pdf' || b.type === 'image' || b.type === 'mermaid') {
            nNode.children.push({ id: 'blk-' + b.id, label: graphBlockLabel(b), kind: 'doc', docType: b.type, noteId: n.id, blockId: b.id, children: [] });
          }
        });
        sNode.children.push(nNode);
      });
      nbNode.children.push(sNode);
    });
    root.children.push(nbNode);
  });
  return root;
}
function layoutRadial(root) {
  function leaves(node) {
    if (!node.children || !node.children.length) { node._leaves = 1; return 1; }
    var s = 0; node.children.forEach(function (c) { s += leaves(c); }); node._leaves = s; return s;
  }
  leaves(root);
  var RING = 200;
  (function assign(node, depth, a0, a1) {
    var ang = (a0 + a1) / 2;
    var r = depth * RING;
    node._x = Math.cos(ang) * r;
    node._y = Math.sin(ang) * r;
    if (node.children && node.children.length) {
      var acc = a0, span = (a1 - a0);
      node.children.forEach(function (c) { var cs = span * (c._leaves / node._leaves); assign(c, depth + 1, acc, acc + cs); acc += cs; });
    }
  })(root, 0, 0, Math.PI * 2);
  return root;
}
function firstNoteUnder(node) {
  if (node.noteId) return node.noteId;
  var kids = node.children || [];
  for (var i = 0; i < kids.length; i++) { var r = firstNoteUnder(kids[i]); if (r) return r; }
  return null;
}
function onGraphNodeClick(n) {
  if (n.kind === 'doc' && n.noteId) {
    closeGraph();
    selectNote(n.noteId);
    setTimeout(function () { popOut(n.blockId); }, 160);
  } else if (n.noteId) {
    closeGraph();
    selectNote(n.noteId);
  } else {
    var target = firstNoteUnder(n);
    if (target) { closeGraph(); selectNote(target); }
  }
}
function openGraph() {
  closeGraph();
  var overlay = h('div', { class: 'overlay graph-overlay', id: 'graphOverlay', onmousedown: function (e) { if (e.target === overlay) closeGraph(); } });
  var panel = h('div', { class: 'graph-panel' });
  panel.appendChild(h('div', { class: 'graph-head' },
    h('div', { class: 'graph-title' }, icon('graph'), 'Mapa de conocimiento'),
    h('div', { class: 'graph-head-right' },
      h('span', { class: 'graph-hint' }, 'Clic en un nodo para ir a su lienzo \u00b7 Arrastra para mover \u00b7 Rueda: zoom'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeGraph }, icon('x')))
  ));
  var stage = h('div', { class: 'graph-stage', id: 'graphStage' });
  var world = h('div', { class: 'graph-world', id: 'graphWorld' });
  var svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'graph-edges');
  world.appendChild(svg);
  stage.appendChild(world);
  panel.appendChild(stage);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', graphEsc);
  renderGraph(world, svg, stage);
}
function graphEsc(e) { if (e.key === 'Escape') closeGraph(); }
function closeGraph() {
  var o = document.getElementById('graphOverlay');
  if (o) o.remove();
  document.removeEventListener('keydown', graphEsc);
}
function renderGraph(world, svg, stage) {
  var tree = layoutRadial(buildGraphTree());
  var nodes = [], edges = [];
  (function walk(n, parent) { nodes.push(n); if (parent) edges.push([parent, n]); (n.children || []).forEach(function (c) { walk(c, n); }); })(tree, null);
  var cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
  svg.setAttribute('width', stage.clientWidth);
  svg.setAttribute('height', stage.clientHeight);
  svg.innerHTML = '';
  edges.forEach(function (e) {
    var l = document.createElementNS(SVGNS, 'line');
    l.setAttribute('x1', cx + e[0]._x); l.setAttribute('y1', cy + e[0]._y);
    l.setAttribute('x2', cx + e[1]._x); l.setAttribute('y2', cy + e[1]._y);
    l.setAttribute('class', 'graph-edge k-' + e[1].kind);
    svg.appendChild(l);
  });
  nodes.forEach(function (n) {
    var el = h('button', {
      class: 'graph-node k-' + n.kind + (n.docType ? ' doc-' + n.docType : ''),
      style: { left: (cx + n._x) + 'px', top: (cy + n._y) + 'px' },
      title: n.label
    });
    el.appendChild(h('span', { class: 'gn-dot' }, n.kind === 'doc' ? icon(typeMeta(n.docType).icon) : (n.kind === 'note' ? icon('file') : null)));
    el.appendChild(h('span', { class: 'gn-label' }, n.label));
    el.addEventListener('click', function (ev) { ev.stopPropagation(); onGraphNodeClick(n); });
    world.appendChild(el);
  });
  setupGraphNav(world, stage);
}
function setupGraphNav(world, stage) {
  var view = { x: 0, y: 0, z: 1 };
  function apply() { world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'; }
  apply();
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var f = Math.exp(-e.deltaY * 0.0015);
    view.z = Math.max(0.2, Math.min(2.6, view.z * f));
    apply();
  }, { passive: false });
  stage.addEventListener('mousedown', function (e) {
    if (e.target.closest('.graph-node')) return;
    e.preventDefault();
    var sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
    stage.classList.add('grabbing');
    function mv(ev) { view.x = ox + (ev.clientX - sx); view.y = oy + (ev.clientY - sy); apply(); }
    function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); stage.classList.remove('grabbing'); }
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}

// ---------- Render all ----------
function renderAll() {
  renderSidebar();
  renderTopbar();
  renderCanvas();
  applySidebar();
}
