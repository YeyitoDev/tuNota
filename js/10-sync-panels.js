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
  if (!Array.isArray(data.links)) data.links = [];
  if (!Array.isArray(data.groups)) data.groups = [];
  // Migración: el tipo 'idea' pasa a ser una nota clasificada como idea (sin perder datos).
  (data.blocks || []).forEach(function (b) {
    if (b && b.type === 'idea') {
      b.type = 'text';
      b.content = b.content || {};
      if (!b.content.rank) b.content.rank = 'idea';
    }
  });
}
function serverSave() {
  if (!SERVER || !window.fetch) return;
  clearTimeout(srvT);
  srvT = setTimeout(serverSaveNow, 500);
}
function serverSaveNow() {
  if (!SERVER || !window.fetch) return;
  if (BACKEND.publicMode) return; // modo público: no hay base de datos compartida (todo local)
  // data solo contiene referencias 'blob:<id>' (db.json queda pequeño).
  // Los bytes de los blobs aún NO se sincronizan al servidor (Fase 4: multi-dispositivo).
  apiFetch('api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(function () {});
}
function serverLoad(done) {
  if (!window.fetch) { done(); return; }
  var local = data;
  apiFetch('api/data', { cache: 'no-store' })
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
  else if (blk && blk.type === 'image' || blk && blk.type === 'freeimage') dim = 'width=820,height=780';
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
      media.appendChild(h('div', { class: 'card-media-empty' }, 'Pega (' + MOD + '+V) o inserta una imagen'));
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
  if (b.type === 'image' || b.type === 'freeimage') return 'Imagen';
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
        // Jerarquía: libro → sección → nota → grupos (no se mapean imágenes ni documentos).
        groupsOf(n.id).forEach(function (g) {
          nNode.children.push({ id: 'grp-' + g.id, label: g.name || 'Grupo', kind: 'group', noteId: n.id, groupId: g.id, children: [] });
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
  if (n.kind === 'group' && n.noteId) {
    var g = (data.groups || []).find(function (x) { return x.id === n.groupId; });
    closeGraph();
    if (g && typeof goToGroup === 'function') goToGroup(n.noteId, g);
    else selectNote(n.noteId);
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
    h('div', { class: 'graph-title' }, icon('graph'), 'Mapa de conocimiento', h('span', { class: 'graph-count', id: 'graphCount' })),
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
    // Arista curva (bezier cuadrática) con un ligero abombado para un aire orgánico.
    var x1 = cx + e[0]._x, y1 = cy + e[0]._y, x2 = cx + e[1]._x, y2 = cy + e[1]._y;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    var ctrlX = mx - dy * 0.08, ctrlY = my + dx * 0.08;
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M' + x1 + ',' + y1 + ' Q' + ctrlX + ',' + ctrlY + ' ' + x2 + ',' + y2);
    p.setAttribute('class', 'graph-edge k-' + e[1].kind);
    p.setAttribute('data-from', e[0].id); p.setAttribute('data-to', e[1].id);
    svg.appendChild(p);
  });
  nodes.forEach(function (n) {
    var el = h('button', {
      class: 'graph-node k-' + n.kind + (n.docType ? ' doc-' + n.docType : ''),
      style: { left: (cx + n._x) + 'px', top: (cy + n._y) + 'px' },
      title: n.label
    });
    el.appendChild(h('span', { class: 'gn-dot' }, n.kind === 'note' ? icon('file') : (n.kind === 'group' ? icon('shapes') : null)));
    el.appendChild(h('span', { class: 'gn-label' }, n.label));
    el.setAttribute('data-id', n.id);
    el.addEventListener('mouseenter', function () { highlightGraph(svg, world, n.id, true); });
    el.addEventListener('mouseleave', function () { highlightGraph(svg, world, n.id, false); });
    el.addEventListener('click', function (ev) { ev.stopPropagation(); onGraphNodeClick(n); });
    world.appendChild(el);
  });
  // Aristas de relación entre lienzos (portales / hipervínculos), con flecha.
  var notePos = {};
  nodes.forEach(function (nn) { if (nn.kind === 'note' && nn.noteId) notePos[nn.noteId] = nn; });
  var defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = '<marker id="graphRelArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c2745b"/></marker>';
  svg.appendChild(defs);
  noteRelations().forEach(function (r) {
    var a = notePos[r.from], b2 = notePos[r.to];
    if (!a || !b2) return;
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M' + (cx + a._x) + ',' + (cy + a._y) + ' L' + (cx + b2._x) + ',' + (cy + b2._y));
    p.setAttribute('class', 'graph-rel graph-rel-' + r.kind);
    p.setAttribute('marker-end', 'url(#graphRelArrow)');
    svg.appendChild(p);
  });
  var notes = nodes.filter(function (n) { return n.kind === 'note'; }).length;
  var groups = nodes.filter(function (n) { return n.kind === 'group'; }).length;
  var countEl = document.getElementById('graphCount');
  if (countEl) countEl.textContent = notes + ' notas · ' + groups + ' grupos';
  setupGraphNav(world, stage, nodes);
}
// Resalta un nodo y sus aristas/vecinos; atenúa el resto.
function highlightGraph(svg, world, id, on) {
  var connected = {};
  Array.prototype.forEach.call(svg.querySelectorAll('.graph-edge'), function (e) {
    var f = e.getAttribute('data-from'), t = e.getAttribute('data-to');
    var hit = f === id || t === id;
    e.classList.toggle('hl', on && hit);
    e.classList.toggle('dim', on && !hit);
    if (hit) { connected[f] = 1; connected[t] = 1; }
  });
  Array.prototype.forEach.call(world.querySelectorAll('.graph-node'), function (nd) {
    var nid = nd.getAttribute('data-id');
    nd.classList.toggle('dim', on && !connected[nid] && nid !== id);
    nd.classList.toggle('hl', on && nid === id);
  });
}
function setupGraphNav(world, stage, nodes) {
  var view = { x: 0, y: 0, z: 1 };
  function apply() { world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')'; }
  function fit() {
    if (!nodes || !nodes.length) { view = { x: 0, y: 0, z: 1 }; apply(); return; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) { minX = Math.min(minX, n._x); minY = Math.min(minY, n._y); maxX = Math.max(maxX, n._x); maxY = Math.max(maxY, n._y); });
    var pad = 90, w = (maxX - minX) + pad * 2, hh = (maxY - minY) + pad * 2;
    var z = Math.min(stage.clientWidth / w, stage.clientHeight / hh, 1.4);
    z = Math.max(0.2, z);
    view.z = z;
    view.x = -((minX + maxX) / 2) * z;
    view.y = -((minY + maxY) / 2) * z;
    apply();
  }
  function zoomBy(f) { view.z = Math.max(0.2, Math.min(2.6, view.z * f)); apply(); }
  fit();
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015));
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
  var ctl = h('div', { class: 'graph-ctl' },
    h('button', { class: 'zoom-btn', title: 'Alejar', onclick: function () { zoomBy(1 / 1.2); } }, '−'),
    h('button', { class: 'zoom-btn', title: 'Acercar', onclick: function () { zoomBy(1.2); } }, '+'),
    h('button', { class: 'zoom-btn', title: 'Ajustar a la vista', onclick: fit }, icon('fit'))
  );
  stage.appendChild(ctl);
}

// ---------- Render all ----------
function renderAll() {
  renderSidebar();
  renderTopbar();
  if (typeof renderNoteTabs === 'function') renderNoteTabs();
  renderCanvas();
  applySidebar();
}
// Relaciones entre lienzos (hojas): portales de sub-lienzo (bloque 'canvas'), hijos (parentId)
// e hipervínculos de texto a otra nota. Para dibujarlas sobre el mapa de conocimiento.
function noteRelations() {
  var edges = [], seen = {};
  function add(from, to, kind) {
    if (!from || !to || from === to || !getNote(from) || !getNote(to)) return;
    var key = from + '>' + to; if (seen[key]) return; seen[key] = 1;
    edges.push({ from: from, to: to, kind: kind });
  }
  (data.blocks || []).forEach(function (b) {
    if (b.type === 'canvas' && b.content && b.content.noteRef) add(b.noteId, b.content.noteRef, 'portal');
    if (b.content && b.content.hlinks) b.content.hlinks.forEach(function (hl) { if (hl.type === 'note') add(b.noteId, hl.target, 'link'); });
  });
  (data.notes || []).forEach(function (n) { if (n.parentId) add(n.parentId, n.id, 'portal'); });
  return edges;
}
