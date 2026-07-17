/* tuNota — Topbar, lienzo (tarjetas), cuerpos por tipo y dibujo a mano.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// Tipos que puede crear el doble clic en el lienzo (configurable por el usuario).
var DBL_TYPES = [
  { key: 'freetext', label: 'Texto libre', hint: 'texto libre' },
  { key: 'text', label: 'Nota', hint: 'una nota' },
];
function dblType() { return (typeof ui !== 'undefined' && ui && ui.dblType) || 'freetext'; }
function dblTypeHint() {
  var k = dblType();
  for (var i = 0; i < DBL_TYPES.length; i++) if (DBL_TYPES[i].key === k) return DBL_TYPES[i].hint;
  return 'un bloque';
}
function dblTypeLabel() {
  var k = dblType();
  for (var i = 0; i < DBL_TYPES.length; i++) if (DBL_TYPES[i].key === k) return DBL_TYPES[i].label;
  return 'Bloque';
}

// ---------- Barra de pestañas: cambio rápido entre lienzos abiertos/recientes ----------
function pushRecentNote(id) {
  if (!id || !getNote(id)) return;
  // Mantiene el orden: solo limpia las borradas. Una hoja nueva entra al principio de la
  // cola; las ya presentes NO se reordenan al visitarlas (así conservan su sitio).
  ui.recentNotes = (ui.recentNotes || []).filter(function (x) { return getNote(x); });
  if (ui.recentNotes.indexOf(id) < 0) {
    ui.recentNotes.unshift(id);
    if (ui.recentNotes.length > 12) ui.recentNotes = ui.recentNotes.slice(0, 12);
  }
}
function closeNoteTab(id) {
  ui.recentNotes = (ui.recentNotes || []).filter(function (x) { return x !== id; });
  save(); renderNoteTabs();
}
function renderNoteTabs() {
  var el = document.getElementById('noteTabs');
  if (!el) return;
  var recents = (ui.recentNotes || []).filter(function (x) { return getNote(x); });
  if (ui.currentNoteId && getNote(ui.currentNoteId) && recents.indexOf(ui.currentNoteId) < 0) recents.unshift(ui.currentNoteId);
  el.innerHTML = '';
  if (recents.length <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  recents.forEach(function (id) {
    var n = getNote(id); if (!n) return;
    var active = id === ui.currentNoteId;
    var tab = h('button', { class: 'note-tab' + (active ? ' active' : ''), title: n.title || 'Nota', onclick: function () { if (!active) selectNote(id); } },
      icon('file'), h('span', { class: 'note-tab-title' }, n.title || 'Nota'));
    tab.appendChild(h('span', { class: 'note-tab-close', title: 'Cerrar pestaña', onclick: function (e) { e.stopPropagation(); closeNoteTab(id); } }, '×'));
    el.appendChild(tab);
  });
}

// ---------- Render: Topbar ----------
function renderTopbar() {
  var bar = document.getElementById('topbar');
  bar.innerHTML = '';
  var note = ui.currentNoteId ? getNote(ui.currentNoteId) : null;
  var sec = note ? getSection(note.sectionId) : null;
  var nb = sec ? getNotebook(sec.notebookId) : null;

  var crumb = h('div', { class: 'crumb' });
  if (nb) crumb.appendChild(h('span', {}, (nb.emoji ? nb.emoji + ' ' : '') + nb.name));
  if (sec) {
    crumb.appendChild(h('span', { class: 'sep' }, '/'));
    crumb.appendChild(h('span', {}, sec.name));
  }

  var title;
  if (note) {
    title = editable(h('div', { class: 'note-title' }, note.title), note.title, function (v) { rename('note', note.id, v); });
  } else {
    title = h('div', { class: 'note-title is-muted' }, 'tuNota');
  }

  var sidebarBtn = h('button', { class: 'icon-btn tb-sidebar-btn', title: 'Mostrar/ocultar panel', onclick: toggleSidebar }, icon('panel'));
  var left = h('div', { class: 'tb-left' }, sidebarBtn, crumb, title);
  var hint = h('div', { class: 'hint' }, icon('cursor'), 'Doble clic crea ' + dblTypeHint() + ' \u00b7 pulsa ? para ver los atajos');
  var searchBtn = h('button', { class: 'icon-btn', title: 'Buscar en todo (' + MOD + '+K)', onclick: openSearch }, icon('search'));
  var fitBtn = h('button', { class: 'icon-btn', title: 'Ver todo el lienzo (recupera el zoom y los controles)', onclick: function () { if (typeof fitView === 'function') fitView(); } }, icon('fit'));
  var tplBtn = h('button', { class: 'icon-btn', title: 'Plantillas de canvas (BMC, DAFO, arquitectura…)', onclick: openTemplates }, icon('layout'));
  var shapeBtn = h('button', { class: 'icon-btn', title: 'Formas para diagramar (rectángulo, elipse, rombo…)', onclick: function (e) { e.stopPropagation(); openShapePalette(shapeBtn); } }, icon('shapes'));
  var graphBtn = h('button', { class: 'icon-btn', title: 'Mapa de conocimiento (grafo)', onclick: openGraph }, icon('graph'));
  var kanBtn = h('button', { class: 'icon-btn', title: 'Kanban de ideas', onclick: openKanban }, icon('board'));
  var tabletBtn = h('button', { class: 'icon-btn' + (ui.tablet ? ' on' : ''), title: 'Modo tablet: escribir/dibujar con lápiz o dedo', onclick: toggleTabletMode }, icon('pen'));
  var moreBtn = h('button', { class: 'icon-btn', title: 'Más opciones', onclick: function (e) { e.stopPropagation(); openTopbarMenu(moreBtn); } }, icon('more'));
  var reviewBtn = h('button', { class: 'idea-review-top', title: 'Revisar idea: analiza el contexto (idea seleccionada o la nota) y lo consulta a un prompt especializado', onclick: function () { openIdeaReview(); } }, icon('search'), 'Revisar idea');
  // Botón de apoyo combinado: mitad café (izq.) y mitad corazón (der.); al elegir, abre Yape/Stripe.
  var supportBtn = h('div', { class: 'support-btn', title: 'Invítame un cafecito o mándame un poco de amor' },
    h('button', { class: 'support-half support-coffee', title: 'Invítame un cafecito', onclick: function () { openDonate('coffee'); } }, icon('coffee'), h('span', { class: 'support-lbl' }, 'Un cafecito')),
    h('button', { class: 'support-half support-heart', title: 'Mándame un poco de amor', onclick: function () { openDonate('heart'); } }, icon('heart'), h('span', { class: 'support-lbl' }, 'Un poco de amor')));
  var ai = h('button', { class: 'ai-btn' + (aiReady() ? ' ready' : ''), title: aiReady() ? 'Asistente IA' : 'Configurar IA (API key)', onclick: openAI }, icon('spark'), 'IA');
  bar.appendChild(left);
  bar.appendChild(hint);
  bar.appendChild(searchBtn);
  bar.appendChild(fitBtn);
  if (featureOn('templates')) bar.appendChild(tplBtn);
  if (featureOn('diagrams')) bar.appendChild(shapeBtn);
  if (featureOn('graph')) bar.appendChild(graphBtn);
  if (featureOn('kanban')) bar.appendChild(kanBtn);
  if (featureOn('tablet')) bar.appendChild(tabletBtn);
  bar.appendChild(moreBtn);
  if (featureOn('ai') && featureOn('ideaReview')) bar.appendChild(reviewBtn);
  if (featureOn('donate')) bar.appendChild(supportBtn);
  if (featureOn('ai')) bar.appendChild(ai);
}

// Menú "⋯" del topbar: acciones menos frecuentes, con etiqueta.
function openTopbarMenu(anchor) {
  closeTopbarMenu();
  var backdrop = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === backdrop) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop topbar-pop', onmousedown: function (e) { e.stopPropagation(); } });
  // Selector: qué crea el doble clic en el lienzo (se recuerda).
  pop.appendChild(h('div', { class: 'cm-label' }, icon('cursor'), 'Doble clic crea'));
  var dblRow = h('div', { class: 'cm-quick' });
  DBL_TYPES.forEach(function (o) {
    var chip = h('button', { class: 'cm-chip' + (dblType() === o.key ? ' on' : ''), title: 'El doble clic en el lienzo creará: ' + o.label, onclick: function (e) {
      e.stopPropagation();
      ui.dblType = o.key; save();
      Array.prototype.forEach.call(dblRow.children, function (c) { c.classList.toggle('on', c === chip); });
      renderTopbar();
    } }, o.label);
    dblRow.appendChild(chip);
  });
  pop.appendChild(dblRow);
  pop.appendChild(h('div', { class: 'cm-sep' }));
  [
    ['layout', 'Nuevo sub-lienzo (lienzo sobre lienzo)', newSubCanvas, true],
    ['image', 'Organizar fotos en cuadrícula', organizePhotos, true],
    ['panel', 'Vista vertical (importantes primero)', openVerticalView, true],
    ['send', 'Enviar nota por Telegram', function () { telegramShare(currentNoteText()); }, featureOn('telegram')],
    ['bell', 'Recordatorios a iOS (.ics)', exportNoteRemindersICS, true],
    ['clock', 'Sincronización (Apple · Google Drive)', openSyncPanel, featureOn('sync')],
    ['map', 'Tour visual (guía interactiva)', function () { startTour(0); }, true],
    ['book', 'Guía de funciones (documento)', openGuide, true],
    ['layout', 'Showcase de funcionalidades', function () { window.open('docs/showcase.html', '_blank'); }, true],
    ['download', 'Importar Markdown (.md) o PDF', openImport, true],
    ['clock', 'Historial de cambios', openLog, true],
    ['shield', 'Copias de seguridad', openBackups, true],
    ['palette', 'Personalizar colores', openTheme, true],
    ['help', 'Atajos de teclado', openShortcuts, true],
    ['info', 'Integraciones y versiones', openIntegrations, true],
    ['heart', 'Apoyar tuNota (donación Yape)', openDonate, featureOn('donate')],
    ['shield', 'Privacidad, términos y créditos', function () { window.open('legal.html', '_blank'); }, true],
    ['shield', 'Control de funcionalidades (maestro)', openFeatureControl, true],
  ].forEach(function (it) {
    if (it[3] === false) return;
    pop.appendChild(h('button', { class: 'cm-item', onclick: function () { closeTopbarMenu(); it[2](); } },
      icon(it[0]), h('span', {}, it[1])));
  });
  backdrop.appendChild(pop);
  document.body.appendChild(backdrop);
  positionPop(pop, anchor, 250);
}
function closeTopbarMenu() { var bd = document.getElementById('topbarMenuBackdrop'); if (bd) bd.remove(); }

// ---------- Render: Canvas ----------
var canvasContentEl = null;
var topZ = 10;
var selectedIds = {};
var lastMouse = { x: 0, y: 0, over: false };

// ---------- Grupos: área de color con nombre detrás de bloques combinados ----------
var GROUP_COLORS = ['g-sage', 'g-blue', 'g-ocre', 'g-lila', 'g-rose'];
function groupsOf(noteId) { return (data.groups || []).filter(function (g) { return g.noteId === noteId; }); }
function groupMembers(g) { return (g.blockIds || []).map(getBlockById).filter(Boolean); }
function groupBounds(g) {
  var ms = groupMembers(g);
  if (!ms.length) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ms.forEach(function (b) {
    var el = cardEl(b.id);
    var w = el ? el.offsetWidth : (b.width || 200), hh = el ? el.offsetHeight : (b.height || 120);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + w); maxY = Math.max(maxY, b.y + hh);
  });
  return { x: minX - 18, y: minY - 46, w: (maxX - minX) + 36, h: (maxY - minY) + 64 };
}
function createGroupFromSelection() {
  var ids = Object.keys(selectedIds).filter(function (id) { return getBlockById(id); });
  if (ids.length < 1) { toast('Selecciona al menos un bloque para agruparlo.', 'warn'); return; }
  pushUndo('Combinar en grupo');
  var g = { id: uid(), noteId: getBlockById(ids[0]).noteId, name: 'Grupo ' + (groupsOf(ui.currentNoteId).length + 1), color: groupsOf(ui.currentNoteId).length % GROUP_COLORS.length, blockIds: ids, createdAt: now() };
  data.groups.push(g);
  touchNote(g.noteId);
  logChange('Grupo creado', g.name + ' (' + ids.length + ' bloques)');
  save();
  renderCanvas();
  renderSidebar(); // el grupo aparece en el árbol lateral bajo su nota
  toast('Grupo «' + g.name + '» creado: doble clic en su nombre para renombrarlo.', 'ok');
}
function deleteGroup(g) {
  data.groups = data.groups.filter(function (x) { return x.id !== g.id; });
  logChange('Grupo disuelto', g.name);
  save();
  renderCanvas();
  renderSidebar();
}
// ---------- Juntar (fusionar) grupos ----------
// Los bloques de `source` pasan a `target`; `source` se disuelve. Sobrevive `target` (nombre y color).
function mergeGroups(target, source) {
  if (!target || !source || target.id === source.id) return;
  pushUndo('Juntar grupos');
  target.blockIds = target.blockIds || [];
  (source.blockIds || []).forEach(function (id) {
    if (getBlockById(id) && target.blockIds.indexOf(id) < 0) target.blockIds.push(id);
  });
  data.groups = data.groups.filter(function (x) { return x.id !== source.id; });
  touchNote(target.noteId);
  logChange('Grupos juntados', source.name + ' → ' + target.name);
  save();
  renderCanvas();
  renderSidebar();
  toast('«' + source.name + '» se unió a «' + target.name + '» (' + target.blockIds.length + ' bloques).', 'ok');
}
// Selector: elige con qué otro grupo del lienzo juntar `g` (g sobrevive y absorbe al elegido).
function openGroupMergePicker(g, anchor) {
  closeTopbarMenu();
  var others = groupsOf(g.noteId).filter(function (x) { return x.id !== g.id; });
  if (!others.length) { toast('No hay otro grupo en este lienzo para juntar.', 'warn'); return; }
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, 'Juntar «' + g.name + '» con…'));
  others.forEach(function (o) {
    pop.appendChild(h('button', { class: 'cm-item', title: 'Sus bloques pasan a «' + g.name + '» y «' + o.name + '» se disuelve',
      onclick: function () { closeTopbarMenu(); mergeGroups(g, o); } },
      h('span', { class: 'group-dot ' + GROUP_COLORS[o.color % GROUP_COLORS.length] }),
      h('span', {}, o.name + '  ·  ' + (o.blockIds || []).length + ' bloques')));
  });
  pop.appendChild(h('div', { class: 'cm-info' }, h('span', {}, 'El grupo elegido se disuelve; sus bloques pasan a «' + g.name + '».')));
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 240);
}
// ---------- Meter/sacar un bloque de un grupo (contenido dentro de contenido) ----------
function groupOfBlock(blockId) {
  return (data.groups || []).find(function (g) { return (g.blockIds || []).indexOf(blockId) >= 0; });
}
function addBlockToGroup(g, blockId) {
  g.blockIds = g.blockIds || [];
  if (g.blockIds.indexOf(blockId) >= 0) return false;
  // Un bloque pertenece a un solo grupo: quítalo del anterior si lo tenía.
  (data.groups || []).forEach(function (x) { if (x !== g && x.blockIds) x.blockIds = x.blockIds.filter(function (id) { return id !== blockId; }); });
  g.blockIds.push(blockId);
  touchNote(g.noteId); logChange('Bloque añadido al grupo', g.name); save();
  renderCanvas(); renderSidebar();
  toast('Añadido a «' + g.name + '».', 'ok');
  return true;
}
function removeBlockFromGroup(g, blockId) {
  if (!g || !g.blockIds) return;
  g.blockIds = g.blockIds.filter(function (id) { return id !== blockId; });
  if (!g.blockIds.length) { data.groups = data.groups.filter(function (x) { return x.id !== g.id; }); logChange('Grupo disuelto (vacío)', g.name); }
  else logChange('Bloque quitado del grupo', g.name);
  touchNote(g.noteId); save();
  renderCanvas(); renderSidebar();
}
// Al soltar un bloque, si su centro cae dentro de otro grupo del que no es miembro, se une.
function maybeJoinGroupOnDrop(b) {
  var el = cardEl(b.id);
  var w = el ? el.offsetWidth : (b.width || 200), hh = el ? el.offsetHeight : (b.height || 120);
  var cx = b.x + w / 2, cy = b.y + hh / 2, target = null;
  groupsOf(b.noteId).forEach(function (g) {
    if ((g.blockIds || []).indexOf(b.id) >= 0) return; // ya es miembro
    var bb = groupBounds(g); if (!bb) return;
    if (cx >= bb.x && cx <= bb.x + bb.w && cy >= bb.y && cy <= bb.y + bb.h) target = g;
  });
  if (target) return addBlockToGroup(target, b.id);
  return false;
}
function centerOnGroup(g) {
  var bb = groupBounds(g);
  if (bb) centerOn(bb.x + bb.w / 2, bb.y + bb.h / 2);
}
function startGroupNameEdit(g, nameEl) {
  var inp = h('input', { class: 'group-name-input', value: g.name });
  inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
  inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } if (ev.key === 'Escape') { inp.value = g.name; inp.blur(); } });
  inp.addEventListener('blur', function () {
    var v = inp.value.trim();
    if (v && v !== g.name) { g.name = v; logChange('Grupo renombrado', v); save(); renderSidebar(); renderCanvas(); }
    else { if (inp.parentNode) inp.replaceWith(nameEl); }
  });
  nameEl.replaceWith(inp); inp.focus(); inp.select();
}
function renderGroups(content) {
  groupsOf(ui.currentNoteId).forEach(function (g) {
    var bb = groupBounds(g);
    if (!bb) return;
    var area = h('div', { class: 'group-area ' + GROUP_COLORS[g.color % GROUP_COLORS.length], 'data-gid': g.id });
    area.style.left = bb.x + 'px'; area.style.top = bb.y + 'px'; area.style.width = bb.w + 'px'; area.style.height = bb.h + 'px';
    var nameEl = h('span', { class: 'group-name', title: 'Doble clic para renombrar' }, g.name);
    nameEl.addEventListener('dblclick', function (e) { e.stopPropagation(); startGroupNameEdit(g, nameEl); });
    var editBtn = h('button', { class: 'group-edit', title: 'Renombrar grupo', onclick: function (e) { e.stopPropagation(); startGroupNameEdit(g, nameEl); } }, icon('edit'));
    var colorBtn = h('button', { class: 'group-color', title: 'Cambiar color', onclick: function (e) { e.stopPropagation(); g.color = (g.color + 1) % GROUP_COLORS.length; save(); renderCanvas(); } });
    var delBtn = h('button', { class: 'group-del', title: 'Disolver grupo (los bloques se conservan)', onclick: function (e) { e.stopPropagation(); deleteGroup(g); } }, '×');
    var tplBtn = h('button', { class: 'group-tpl', title: 'Guardar el grupo como plantilla reutilizable', onclick: function (e) { e.stopPropagation(); saveGroupAsTemplate(g); } }, icon('layout'));
    tplBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); }); // no arrastrar el grupo al pulsarlo
    var head = h('div', { class: 'group-head ' + GROUP_COLORS[g.color % GROUP_COLORS.length], 'data-ghead': g.id }, colorBtn, nameEl, editBtn, h('span', { class: 'card-spacer' }));
    // Botón "Juntar" — solo si hay otro grupo en el lienzo con el que fusionar.
    var mergeBtn = null;
    if (groupsOf(g.noteId).length > 1) {
      mergeBtn = h('button', { class: 'group-merge', title: 'Juntar con otro grupo…', onclick: function (e) { e.stopPropagation(); openGroupMergePicker(g, mergeBtn); } }, icon('shapes'));
      mergeBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); }); // no arrastrar el grupo al pulsarlo
      head.appendChild(mergeBtn);
    }
    head.appendChild(tplBtn); head.appendChild(delBtn);
    // Arrastrar la cabecera mueve todos los bloques del grupo.
    head.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target === delBtn || e.target === colorBtn || e.target === editBtn || e.target.tagName === 'INPUT') return;
      e.preventDefault(); e.stopPropagation();
      var z = getView().zoom || 1, sx = e.clientX, sy = e.clientY;
      var starts = {};
      groupMembers(g).forEach(function (b) { starts[b.id] = { x: b.x, y: b.y }; });
      var mv = function (ev) {
        var dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
        groupMembers(g).forEach(function (b) {
          b.x = Math.max(0, starts[b.id].x + dx); b.y = Math.max(0, starts[b.id].y + dy);
          var cel = cardEl(b.id); if (cel) { cel.style.left = b.x + 'px'; cel.style.top = b.y + 'px'; }
        });
        updateGroupRects();
        drawLinks();
      };
      var up = function () {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        groupMembers(g).forEach(function (b) { b.x = Math.round(b.x); b.y = Math.round(b.y); });
        save();
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
    // El fondo (área) va detrás de las tarjetas; la cabecera va como hermano de las tarjetas y POR ENCIMA
    // de ellas (z-index sobre topZ) para que sus botones sean siempre clicables aunque una tarjeta solape
    // la franja del título del grupo.
    head.style.left = bb.x + 'px'; head.style.top = bb.y + 'px'; head.style.width = bb.w + 'px';
    head.style.zIndex = String(topZ + 1);
    content.appendChild(area);
    content.appendChild(head);
  });
}
// Recoloca las áreas de grupo y sus cabeceras (llamado en vivo durante arrastres).
function updateGroupRects() {
  if (!canvasContentEl) return;
  groupsOf(ui.currentNoteId).forEach(function (g) {
    var bb = groupBounds(g);
    if (!bb) return;
    var el = canvasContentEl.querySelector('.group-area[data-gid="' + g.id + '"]');
    if (el) { el.style.left = bb.x + 'px'; el.style.top = bb.y + 'px'; el.style.width = bb.w + 'px'; el.style.height = bb.h + 'px'; }
    var hd = canvasContentEl.querySelector('.group-head[data-ghead="' + g.id + '"]');
    if (hd) { hd.style.left = bb.x + 'px'; hd.style.top = bb.y + 'px'; hd.style.width = bb.w + 'px'; }
  });
}
// Pestañas de acceso rápido a los grupos de la nota.
function buildGroupTabs() {
  var gs = groupsOf(ui.currentNoteId);
  if (!gs.length) return null;
  var bar = h('div', { class: 'group-tabs' });
  gs.forEach(function (g) {
    bar.appendChild(h('button', { class: 'group-tab ' + GROUP_COLORS[g.color % GROUP_COLORS.length], title: 'Ir al grupo', onclick: function () { centerOnGroup(g); } },
      h('span', { class: 'group-tab-dot' }), g.name));
  });
  return bar;
}

function renderCanvas() {
  var wrap = document.getElementById('canvas');
  wrap.classList.toggle('tablet-active', !!ui.tablet);
  wrap.innerHTML = '';
  canvasContentEl = null;
  clearSelection();
  hideSelFmtBar();
  closeTabletToolbar();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) {
    wrap.appendChild(emptyState());
    return;
  }
  var content = h('div', { class: 'canvas-content' + (ui.tablet ? ' tablet-mode' : '') });
  canvasContentEl = content;
  if (linkMode) content.classList.add('link-mode');
  var linkLayer = document.createElementNS(SVGNS, 'svg');
  linkLayer.setAttribute('class', 'link-layer');
  content.appendChild(linkLayer);
  var inkLayer = document.createElementNS(SVGNS, 'svg');
  inkLayer.setAttribute('class', 'ink-layer');
  content.appendChild(inkLayer);
  wrap.appendChild(content);
  blocksOf(ui.currentNoteId).forEach(function (b) { content.appendChild(card(b)); });
  renderGroups(content); // áreas de grupo (van al fondo por z-index)
  drawLinks();
  drawInks();
  attachInkInput(inkLayer);
  refreshSelectionUI();
  wrap.appendChild(buildZoomControl());
  wrap.appendChild(h('button', { class: 'float-chat-btn', title: 'Chat del lienzo: referencia un bloque y pídele cambios (planner → agentes)', onclick: toggleFloatChat }, '💬'));
  if (ui.tablet) wrap.appendChild(buildTabletToolbar());
  var gTabs = buildGroupTabs();
  if (gTabs) wrap.appendChild(gTabs);
  applyView();
}

function emptyState() {
  return h(
    'div',
    { class: 'empty-state' },
    h('div', { class: 'empty-ico' }, icon('leaf')),
    h('p', { class: 'empty-title' }, 'Selecciona o crea una nota'),
    h('p', { class: 'empty-sub' }, 'Tus ideas viven dentro de libros y secciones, como un cuaderno tranquilo.'),
    h('div', { class: 'empty-keys' },
      h('span', { class: 'empty-key' }, h('kbd', {}, 'Doble clic'), ' ' + dblTypeLabel().toLowerCase()),
      h('span', { class: 'empty-key' }, h('kbd', {}, ALTKEY), ' menú de bloques'),
      h('span', { class: 'empty-key' }, h('kbd', {}, MOD + '+K'), ' buscar'),
      h('span', { class: 'empty-key' }, h('kbd', {}, '?'), ' atajos')
    ),
    h('button', { class: 'empty-tour-btn', onclick: function () { startTour(0); } }, icon('map'), '¿Primera vez? Haz el tour')
  );
}

// ---------- Tinta libre sobre el lienzo (modo tablet) ----------
function pfGetStroke(points, options) {
  if (typeof window !== 'undefined' && window.getStroke) return window.getStroke(points, options);
  if (typeof window !== 'undefined' && window.perfectFreehand && window.perfectFreehand.getStroke) return window.perfectFreehand.getStroke(points, options);
  return [];
}
function getSvgPathFromStroke(stroke) {
  if (!stroke || !stroke.length) return '';
  var d = stroke.reduce(function (acc, _ref, i, arr) {
    var x0 = _ref[0], y0 = _ref[1];
    var next = arr[(i + 1) % arr.length];
    var x1 = next[0], y1 = next[1];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', stroke[0][0], stroke[0][1], 'Q']);
  d.push('Z');
  return d.join(' ');
}
function strokeToPoints(stroke) {
  return (stroke.points || []).map(function (p) {
    // perfect-freehand entiende [x, y, pressure]. Si no hay presión real, simula por velocidad.
    return (p.p == null || p.p === 0) ? [p.x, p.y] : [p.x, p.y, p.p];
  });
}
function strokeOptions(stroke) {
  var tool = stroke.tool || 'pen';
  var size = stroke.size || 3;
  // Marcador: poco afinamiento, extremos planos, opaco; Lápiz: extremos redondeados y afinamiento natural.
  return {
    size: size,
    thinning: tool === 'hi' ? 0.15 : 0.7,
    smoothing: 0.5,
    streamline: 0.5,
    easing: function (t) { return t; },
    start: { cap: tool !== 'hi', taper: 0, easing: function (t) { return t; } },
    end: { cap: tool !== 'hi', taper: 0, easing: function (t) { return t; } },
    simulatePressure: tool === 'hi' || stroke.points.every(function (p) { return p.p == null || p.p === 0; })
  };
}
function renderStrokePath(stroke) {
  var pts = strokeToPoints(stroke);
  if (!pts.length) return '';
  if (pts.length === 1) {
    var p = pts[0];
    var r = (stroke.size || 3) / 2;
    return 'M' + (p[0] - r) + ',' + p[1] + ' A' + r + ',' + r + ' 0 1,0 ' + (p[0] + r) + ',' + p[1] + ' A' + r + ',' + r + ' 0 1,0 ' + (p[0] - r) + ',' + p[1];
  }
  var outline = pfGetStroke(pts, strokeOptions(stroke));
  return getSvgPathFromStroke(outline);
}
function inkLayerBox() {
  if (!canvasContentEl) return { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  var maxX = 4000, maxY = 3000;
  blocksOf(ui.currentNoteId).forEach(function (b) {
    var el = cardEl(b.id);
    maxX = Math.max(maxX, b.x + (el ? el.offsetWidth : (b.width || 200)));
    maxY = Math.max(maxY, b.y + (el ? el.offsetHeight : (b.height || 120)));
  });
  (data.inks || []).forEach(function (s) {
    (s.points || []).forEach(function (p) { maxX = Math.max(maxX, p.x + 60); maxY = Math.max(maxY, p.y + 60); });
  });
  return { minX: 0, minY: 0, maxX: maxX, maxY: maxY };
}
function drawInks() {
  if (!canvasContentEl) return;
  var svg = canvasContentEl.querySelector('.ink-layer');
  if (!svg) return;
  var box = inkLayerBox();
  svg.setAttribute('width', String(box.maxX));
  svg.setAttribute('height', String(box.maxY));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  inksOf(ui.currentNoteId).forEach(function (s) {
    var d = renderStrokePath(s);
    if (!d) return;
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'ink-path' + (s.tool === 'hi' ? ' ink-hi' : '') + (s.selected ? ' ink-selected' : ''));
    path.setAttribute('fill', s.color || '#33302b');
    if (s.tool === 'hi') path.setAttribute('fill-opacity', '0.55');
    path.setAttribute('stroke', 'none');
    path.setAttribute('data-id', s.id);
    svg.appendChild(path);
  });
}
function clearInkSelection() {
  (data.inks || []).forEach(function (s) { s.selected = false; });
  drawInks();
}
function selectInk(id, on) {
  var s = data.inks && data.inks.find(function (x) { return x.id === id; });
  if (s) s.selected = on;
}

var tabletToolbarEl = null;
function closeTabletToolbar() { if (tabletToolbarEl && tabletToolbarEl.parentNode) tabletToolbarEl.remove(); tabletToolbarEl = null; }
function updateTabletToolbarUI() {
  if (!tabletToolbarEl) return;
  var tool = ui.pen.tool || 'pen';
  Array.prototype.forEach.call(tabletToolbarEl.querySelectorAll('[data-pen-tool]'), function (btn) {
    btn.classList.toggle('on', btn.getAttribute('data-pen-tool') === tool);
  });
}
function setPenTool(tool) {
  ui.pen = ui.pen || {};
  ui.pen.tool = tool;
  if (tool === 'hi' && (!ui.pen.color || ui.pen.color === '#33302b')) ui.pen.color = '#facc15';
  save();
  updateTabletToolbarUI();
  if (tabletToolbarEl) {
    var c = tabletToolbarEl.querySelector('.tablet-color');
    if (c) c.value = ui.pen.color;
  }
}
function setInkColor(c) { ui.pen = ui.pen || {}; ui.pen.color = c; save(); }
function setInkSize(v) { ui.pen = ui.pen || {}; ui.pen.size = Math.max(1, Math.min(48, +v || 3)); save(); }
function toggleTabletMode() {
  ui.tablet = !ui.tablet;
  save();
  renderCanvas();
  renderTopbar();
}
function undoInk() {
  var list = inksOf(ui.currentNoteId);
  if (!list.length) return;
  var last = list[list.length - 1];
  pushUndo('Deshacer trazo');
  dropInksFor(last.id);
  save(); drawInks();
}
function clearAllInk() {
  var list = inksOf(ui.currentNoteId);
  if (!list.length) return;
  if (!window.confirm('\u00bfBorrar toda la tinta de esta nota?')) return;
  pushUndo('Borrar tinta');
  list.forEach(function (s) { dropInksFor(s.id); });
  save(); drawInks();
}
function buildTabletToolbar() {
  closeTabletToolbar();
  var el = h('div', { class: 'tablet-toolbar', id: 'tabletToolbar' });
  tabletToolbarEl = el;
  function btn(tool, name, icn, title) {
    var b = h('button', { class: 'tablet-tool' + ((ui.pen.tool || 'pen') === tool ? ' on' : ''), 'data-pen-tool': tool, title: title, onclick: function () { setPenTool(tool); } }, icon(icn), h('span', { class: 'tt-lbl' }, name));
    return b;
  }
  var colorInp = h('input', { type: 'color', class: 'tablet-color', value: ui.pen.color || '#33302b', title: 'Color' });
  colorInp.addEventListener('input', function () { setInkColor(colorInp.value); });
  colorInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var sizeInp = h('input', { type: 'range', class: 'tablet-size', min: '1', max: '24', value: String(ui.pen.size || 3), title: 'Grosor' });
  sizeInp.addEventListener('input', function () { setInkSize(sizeInp.value); });
  sizeInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var row1 = h('div', { class: 'tablet-row' },
    btn('pen', 'Lápiz', 'pen', 'Lápiz'),
    btn('hi', 'Marcador', 'highlighter', 'Marcador semitransparente'),
    btn('eraser', 'Borrador', 'eraser', 'Borrar trazos'),
    btn('lasso', 'Lazo', 'lasso', 'Seleccionar trazos')
  );
  var row2 = h('div', { class: 'tablet-row' },
    colorInp,
    sizeInp,
    h('button', { class: 'tablet-tool', title: 'Convertir selección a texto (IA/OCR)', onclick: function () { recognizeSelectedInk(); } }, icon('textOcr'), h('span', { class: 'tt-lbl' }, 'Texto')),
    h('button', { class: 'tablet-tool', title: 'Deshacer último trazo', onclick: undoInk }, icon('x'), h('span', { class: 'tt-lbl' }, 'Deshacer')),
    h('button', { class: 'tablet-tool', title: 'Limpiar toda la tinta', onclick: clearAllInk }, icon('trash'), h('span', { class: 'tt-lbl' }, 'Limpiar'))
  );
  el.appendChild(row1);
  el.appendChild(row2);
  return el;
}

function quickCreate(type) {
  if (!ui.currentNoteId || !canvasContentEl) return null;
  var cx, cy;
  if (lastMouse.over) { cx = lastMouse.x; cy = lastMouse.y; }
  else {
    var wrap = document.getElementById('canvas');
    var r = wrap ? wrap.getBoundingClientRect() : null;
    cx = r ? r.left + r.width / 2 : 300;
    cy = r ? r.top + r.height / 2 : 240;
  }
  return createAt(cx, cy, type);
}
function createAt(clientX, clientY, type) {
  if (!ui.currentNoteId || !canvasContentEl) return null;
  var p = toContent(clientX, clientY);
  var x = Math.max(0, p.x - 8);
  var y = Math.max(0, p.y - 8);
  var b = addBlock(ui.currentNoteId, type || 'text', x, y);
  var el = card(b);
  canvasContentEl.appendChild(el);
  cardEnterAnim(el);
  if (b.type === 'markdown') el.classList.add('editing-md'); // empezar en modo edici\u00f3n
  var ta = el.querySelector('textarea');
  if (ta) ta.focus();
  return b;
}

function card(b) {
  var meta = typeMeta(b.type);
  var isText = b.type === 'text' || b.type === 'idea';
  var isAiImage = b.type === 'aiimage';
  var isShape = b.type === 'shape';
  var isImage = b.type === 'image';
  var isFreeImage = b.type === 'freeimage';
  var isMd = b.type === 'markdown';
  var isPdf = b.type === 'pdf';
  var isMermaid = b.type === 'mermaid';
  var isFree = b.type === 'freetext';
  var isDraw = b.type === 'draw';
  var isMono = b.type === 'code' || b.type === 'json' || b.type === 'curl' || b.type === 'python';
  var hasMedia = isText || isImage || isFreeImage;
  var el = h('div', {
    class: 'card' + (meta.cls ? ' ' + meta.cls : '') + (isText ? ' rank-' + noteRank(b) : '') + (b.color ? ' card-c-' + b.color : '') + (selectedIds[b.id] ? ' selected' : '') + (b.reminder && !b.reminder.done ? ' reminder-on' : '') + (b.important ? ' important' : '') + (isImage && b.content && b.content.desc ? ' has-desc' : ''),
    'data-id': b.id,
    style: { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px', zIndex: String(++topZ) },
  });

  var del = h('button', { class: 'card-del', title: 'Eliminar', onclick: function (e) { e.stopPropagation(); delete selectedIds[b.id]; deleteBlock(b.id); el.remove(); updateSelInfo(); } }, icon('trash'));
  var remActive = b.reminder && !b.reminder.done;
  var menuBtn = h('button', { class: 'card-menu', title: 'Opciones: importante, recordatorio, Kanban', onclick: function (e) { e.stopPropagation(); openCardMenu(b, menuBtn); } }, icon('more'));
  // Título editable del bloque: doble clic sobre la etiqueta para ponerle nombre.
  var labelEl = h('span', { class: 'card-label' + (b.title ? ' has-title' : ''), title: 'Doble clic para ponerle título' }, b.title || meta.label);
  labelEl.addEventListener('dblclick', function (e) {
    e.stopPropagation(); e.preventDefault();
    var inp = h('input', { class: 'card-title-input', value: b.title || '' });
    inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = b.title || ''; inp.blur(); } });
    inp.addEventListener('blur', function () {
      b.title = inp.value.trim();
      labelEl.textContent = b.title || meta.label;
      labelEl.classList.toggle('has-title', !!b.title);
      if (inp.parentNode) inp.replaceWith(labelEl);
      touchNote(b.noteId); logChange('Título de bloque', b.title || '(quitado)'); save();
    });
    labelEl.replaceWith(inp);
    inp.focus(); inp.select();
  });
  var head = h('div', { class: 'card-head' },
    icon(meta.icon),
    labelEl,
    h('span', { class: 'card-spacer' })
  );
  if (b.important) head.appendChild(h('span', { class: 'card-imp-badge', title: 'Importante' }, icon('star')));
  if (remActive) head.appendChild(h('span', { class: 'card-remind-badge', title: fmtWhen(b.reminder.at) }, icon('clock'), fmtShort(b.reminder.at)));
  if (b.kanban) head.appendChild(h('span', { class: 'card-kanban-badge k-' + b.kanban, title: 'Kanban: ' + kanbanLabel(b.kanban) }, icon('board')));
  if (b.color && CARD_COLOR_LABEL[b.color]) head.appendChild(h('span', { class: 'card-cat-badge cat-' + b.color, title: 'Categor\u00eda: ' + CARD_COLOR_LABEL[b.color] }, CARD_COLOR_LABEL[b.color]));
  if (isText && noteRank(b) !== 'relevant') { var _rk = rankMeta(noteRank(b)); head.appendChild(h('span', { class: 'card-rank-badge rank-' + noteRank(b), title: 'Clasificaci\u00f3n: ' + _rk.label }, icon(_rk.icon), _rk.label)); }
  if (hasMedia) {
    head.appendChild(h('span', { class: 'card-imgs' }));
    if (isText) head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formatear texto: enumerar, vi\u00f1etas, casillas\u2026', onclick: function (e) { e.stopPropagation(); openTextFormatMenu(b, el, e.currentTarget); } }, icon('format')));
    if (isText) head.appendChild(h('button', { class: 'card-fmt-btn card-analyze-btn', title: 'Analizar y clasificar la nota con IA', onclick: function (e) { e.stopPropagation(); analyzeNote(b, el, e.currentTarget); } }, h('span', { class: 'analyze-emoji' }, '\ud83e\udd16')));
    if (isImage) head.appendChild(h('button', { class: 'card-desc-btn', title: 'A\u00f1adir/editar una descripci\u00f3n al lado de la imagen', onclick: function (e) { e.stopPropagation(); toggleImageDesc(b, el); } }, icon('type')));
    head.appendChild(h('button', { class: 'card-img-btn', title: 'Insertar imagen (o pega con Ctrl+V)', onclick: function (e) { e.stopPropagation(); pickImagesFor(b, el); } }, icon('image')));
    head.appendChild(h('button', { class: 'card-dl-all', title: 'Descargar todas las imágenes', onclick: function (e) { e.stopPropagation(); downloadAllCardImages(b); } }, icon('download')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMd) {
    head.appendChild(h('button', { class: 'card-md-edit', title: 'Editar / previsualizar Markdown', onclick: function (e) { e.stopPropagation(); toggleMdEdit(b, el); } }, icon('edit')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isPdf) {
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana (calidad completa)', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMermaid) {
    head.appendChild(h('button', { class: 'card-mmd-type', title: 'Tipo de diagrama, formas rápidas y generar con IA', onclick: function (e) { e.stopPropagation(); openDiagramMenu(b, el, e.currentTarget); } }, icon('flow')));
    head.appendChild(h('button', { class: 'card-mmd-explode', title: 'Explotar a formas del lienzo (editar con flechas que siguen a las cajas)', onclick: function (e) { e.stopPropagation(); mermaidToCanvas(b); } }, icon('shapes')));
    head.appendChild(h('button', { class: 'card-mmd-move', title: 'Modo interactivo: mover / escalar objetos, editar texto y zoom', onclick: function (e) { e.stopPropagation(); toggleMmdMove(b, el); } }, icon('move')));
    head.appendChild(h('button', { class: 'card-mmd-edit', title: 'Editar / ver diagrama', onclick: function (e) { e.stopPropagation(); toggleMmdEdit(b, el); } }, icon('edit')));
    head.appendChild(h('button', { class: 'card-mmd-dl', title: 'Descargar diagrama (PNG)', onclick: function (e) { e.stopPropagation(); downloadMermaid(b, el); } }, icon('download')));
    head.appendChild(h('button', { class: 'card-pop', title: 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isMono && b.type !== 'python') {
    head.appendChild(h('button', { class: 'card-pop', title: b.type === 'curl' ? 'Abrir en ventana (ejecutar cURL)' : 'Abrir en ventana', onclick: function (e) { e.stopPropagation(); popOut(b.id); } }, icon('popout')));
  }
  if (isFree) {
    head.appendChild(h('button', { class: 'card-fmt-btn', title: 'Formato: tama\u00f1o, color, sombra, subrayado', onclick: function (e) { e.stopPropagation(); openFreeFormat(b, el); } }, icon('format')));
  }
  if (isShape) {
    head.appendChild(h('button', { class: 'card-shape-type', title: 'Cambiar tipo de forma', onclick: function (e) { e.stopPropagation(); openShapePicker(b, e.currentTarget); } }, icon('shapes')));
  }
  head.appendChild(menuBtn);
  head.appendChild(del);

  el.appendChild(head);
  if (b.type === 'table') appendChild(el, tableBody(b));
  else if (isMono) appendChild(el, monoBody(b));
  else if (isAiImage) appendChild(el, aiImageBody(b));
  else if (isShape) appendChild(el, shapeBody(b));
  else if (isFreeImage) appendChild(el, freeImageBody(b));
  else if (isImage) appendChild(el, imageBody(b));
  else if (isMd) appendChild(el, markdownBody(b));
  else if (isPdf) appendChild(el, pdfBody(b));
  else if (isMermaid) appendChild(el, mermaidBody(b));
  else if (isFree) appendChild(el, freeTextBody(b));
  else if (isDraw) appendChild(el, drawBody(b));
  else if (b.type === 'canvas') appendChild(el, canvasBody(b));
  else appendChild(el, textBody(b));

  attachDragHandler(isFreeImage ? el : head, el, b);
  var anchor = h('button', { class: 'card-link-anchor', title: 'Arrastra hasta otro bloque para conectarlos' });
  anchor.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); startLinkDrag(b, e); });
  anchor.addEventListener('click', function (e) { e.stopPropagation(); });
  el.appendChild(anchor);
  if (hasMedia || isMd || isPdf || isMermaid || (isMono && b.type !== 'python')) {
    head.addEventListener('dblclick', function (e) {
      if (e.target.closest('.card-del') || e.target.closest('.card-pop') || e.target.closest('.card-menu') || e.target.closest('.card-md-edit') || e.target.closest('.card-mmd-edit') || e.target.closest('.card-mmd-dl') || e.target.closest('.card-mmd-move') || e.target.closest('.card-label') || e.target.closest('.card-title-input')) return;
      if (isFreeImage) return;
      popOut(b.id);
    });
    if (hasMedia && !isFreeImage) updateCardMedia(el, b);
  }
  if (isImage || isFreeImage) {
    head.appendChild(h('button', { class: 'card-dl', title: 'Descargar imagen', onclick: function (e) { e.stopPropagation(); downloadCardImage(b); } }, icon('download')));
    head.appendChild(h('button', { class: 'card-copy', title: 'Copiar imagen al portapapeles', onclick: function (e) { e.stopPropagation(); copyCardImage(b); } }, icon('copy')));
    head.appendChild(h('button', { class: 'card-crop', title: 'Recortar selección libre de la imagen', onclick: function (e) { e.stopPropagation(); openImageCropper(b, el); } }, icon('crop')));
    var grip = h('span', { class: 'img-card-resize', title: 'Arrastra para redimensionar (mantiene proporci\u00f3n)' });
    grip.addEventListener('mousedown', function (e) { startImageCardResize(e, b, el); });
    el.appendChild(grip);
  }
  if (isText) {
    // Por defecto el alto se auto-adapta al contenido; al redimensionar a mano se fija
    // (manualH) y el tirador mueve ancho Y alto. Doble clic en el tirador vuelve a auto.
    var manual = !!(b.content && b.content.manualH);
    el.classList.add(manual ? 'note-manual' : 'note-auto');
    var tgrip = h('span', { class: 'text-card-resize', title: 'Arrastra para cambiar ancho y alto · doble clic para alto automático' });
    tgrip.addEventListener('mousedown', function (e) { startNoteResize(e, b, el); });
    tgrip.addEventListener('dblclick', function (e) {
      e.stopPropagation(); e.preventDefault();
      b.content = b.content || {}; b.content.manualH = false;
      el.classList.remove('note-manual'); el.classList.add('note-auto');
      el.style.height = 'auto';
      var ta = el.querySelector('.card-ta'); if (ta) autoGrowNote(ta);
      b.height = el.offsetHeight; touchNote(b.noteId); save(); drawLinks();
    });
    el.appendChild(tgrip);
  }
  if (isShape) {
    // Manijas de conexi\u00f3n r\u00e1pida (+) en los 4 costados: crean un bloque conectado.
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      var hnd = h('button', {
        class: 'qc-handle qc-' + side, title: 'Conectar un nuevo bloque hacia aqu\u00ed',
        onmousedown: function (e) { e.preventDefault(); e.stopPropagation(); },
        onclick: function (e) { e.stopPropagation(); openQuickConnect(b, side, hnd); },
      }, '+');
      el.appendChild(hnd);
    });
    var sgrip = h('span', { class: 'shape-resize', title: 'Redimensionar' });
    sgrip.addEventListener('mousedown', function (e) { startBlockResize(e, b, el); });
    el.appendChild(sgrip);
  }
  if (isFree) {
    var fgrip = h('span', { class: 'free-resize', title: 'Arrastra para cambiar el ancho y el alto del cuadro de texto' });
    fgrip.addEventListener('mousedown', function (e) { startFreeResize(e, b, el); });
    el.appendChild(fgrip);
  }
  updateCardPoppedState(el, b);

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      if (!el.isConnected) return;
      b.width = el.offsetWidth;
      b.height = el.offsetHeight;
      debouncedSave();
      drawLinks();
    });
    ro.observe(el);
  }
  return el;
}

// El alto de la nota (texto/idea) se auto-adapta al contenido: el textarea crece con el texto
// y el card (height:auto) lo sigue. El ancho lo controla el tirador.
function autoGrowNote(ta) {
  if (!ta) return;
  var card = ta.closest('.card');
  if (!card || !card.classList.contains('note-auto')) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(22, ta.scrollHeight) + 'px';
}
// ---------- Cuerpos por tipo ----------
function textBody(b) {
  var isIdea = b.type === 'idea';
  b.content = b.content || {};
  var ta = h('textarea', { class: 'card-ta', placeholder: isIdea ? 'Escribe tu idea\u2026 p. ej. "app de recetas con lo que hay en la nevera". Luego pulsa \u00abRevisar idea\u00bb para validarla con internet + IA' : 'Escribe...' });
  ta.value = b.content.text || '';
  attachListAutoContinue(ta, function () { b.content.text = ta.value; autoGrowNote(ta); touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('input', function () { b.content.text = ta.value; autoGrowNote(ta); touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange(isIdea ? 'Idea editada' : 'Nota editada', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) {
      e.preventDefault();
      var el = ta.closest('.card');
      addImagesToBlock(b, files, function () { if (el) updateCardMedia(el, b); });
    }
  });
  attachSelFmtBar(ta, b);                                   // barra flotante de formato sobre la selección
  ta.addEventListener('click', function () { toggleTaskAtCaret(ta, b); }); // clic en "- [ ]" marca la tarea
  requestAnimationFrame(function () { refreshAutoText(ta); autoGrowNote(ta); }); // contraste + ajuste de alto al contenido
  var hlinks = h('div', { class: 'card-hlinks' });          // chips de hipervínculo (texto → bloque/nota)
  renderHlinksInto(hlinks, b);
  var out = [ta, hlinks, h('div', { class: 'card-media' })];
  if (b.content && b.content.analysis && typeof buildNoteAnalysis === 'function') out.push(buildNoteAnalysis(b));
  return out;
}
// Tipos de letra disponibles para el texto libre (usa las fuentes cargadas + las del sistema).
var FREE_FONTS = [
  { key: 'sans', label: 'Redonda', css: "'Nunito', system-ui, sans-serif" },
  { key: 'serif', label: 'Serif', css: "'Fraunces', Georgia, serif" },
  { key: 'mono', label: 'Mono', css: 'ui-monospace, Menlo, Consolas, monospace' },
  { key: 'system', label: 'Sistema', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];
function freeFontCss(key) { for (var i = 0; i < FREE_FONTS.length; i++) if (FREE_FONTS[i].key === key) return FREE_FONTS[i].css; return FREE_FONTS[0].css; }
function applyFreeStyle(ta, st) {
  st = st || {};
  ta.style.fontSize = (st.size || 20) + 'px';
  ta.style.color = st.color || '';
  ta.style.fontFamily = freeFontCss(st.font || 'sans');
  ta.style.fontWeight = st.bold ? '700' : '400';
  ta.style.fontStyle = st.italic ? 'italic' : 'normal';
  var deco = [];
  if (st.underline) deco.push('underline');
  if (st.strike) deco.push('line-through');
  ta.style.textDecoration = deco.length ? deco.join(' ') : 'none';
  ta.style.textShadow = st.shadow ? '0 2px 6px rgba(0,0,0,0.35)' : 'none';
  ta.style.textAlign = st.align || 'left';
  ta.style.lineHeight = String(st.lineHeight || 1.3);
  ta.style.letterSpacing = (st.letterSpacing || 0) + 'px';
  // Caja: fondo (convierte el texto en una etiqueta/callout) y relleno interno.
  ta.style.background = st.bg || 'transparent';
  var pad = (st.pad != null ? st.pad : 4);
  ta.style.padding = pad + 'px ' + (pad + 4) + 'px';
  ta.style.borderRadius = st.bg ? '8px' : '';
}
function autoGrowFree(ta) {
  var card = ta.closest('.card');
  ta.style.height = 'auto';
  var hh = Math.max(ta.scrollHeight, 24);
  ta.style.height = hh + 'px';
  if (card) {
    var b = getBlockById(card.getAttribute('data-id'));
    var minH = (b && b.content && b.content.style && b.content.style.minH) || 0;
    card.style.height = Math.max(hh, minH) + 'px'; // crece con el texto; nunca por debajo del alto elegido
  }
}
// Redimensiona el cuadro de texto libre: ancho y alto mínimo. El alto siempre crece con el
// contenido (si el texto supera el alto elegido, la caja se dinamiza y no recorta).
function startFreeResize(e, b, el) {
  e.preventDefault(); e.stopPropagation();
  b.content = b.content || {}; b.content.style = b.content.style || defaultFreeStyle();
  var ta = el.querySelector('.free-ta');
  var sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight, z = getView().zoom || 1;
  document.body.classList.add('resizing-free');
  function mv(ev) {
    var nw = Math.max(80, Math.round(sw + (ev.clientX - sx) / z));
    var nh = Math.max(24, Math.round(sh + (ev.clientY - sy) / z));
    el.style.width = nw + 'px';
    b.width = nw;
    b.content.style.minH = nh;
    if (ta) autoGrowFree(ta);
    drawLinks();
  }
  function up() {
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('resizing-free');
    b.width = el.offsetWidth; b.height = el.offsetHeight;
    touchNote(b.noteId); logChange('Cuadro de texto redimensionado', b.width + '×' + b.height); save(); drawLinks();
  }
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}
function freeTextBody(b) {
  b.content = b.content || {};
  if (!b.content.style) b.content.style = defaultFreeStyle();
  var ta = h('textarea', { class: 'card-ta free-ta', rows: '1', placeholder: 'Texto\u2026', spellcheck: 'false' });
  ta.value = b.content.text || '';
  applyFreeStyle(ta, b.content.style);
  ta.addEventListener('input', function () { b.content.text = ta.value; autoGrowFree(ta); touchNote(b.noteId); debouncedSave(); drawLinks(); });
  attachListAutoContinue(ta, function () { b.content.text = ta.value; autoGrowFree(ta); touchNote(b.noteId); debouncedSave(); drawLinks(); }); // listas multinivel con Enter/Tab
  ta.addEventListener('change', function () { logChange('Texto editado', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  setTimeout(function () { autoGrowFree(ta); }, 0);
  return [ta];
}
// Ventana de configuraci\u00f3n del texto libre: tipo de letra, estilo, color, tama\u00f1o y espaciado.
function openFreeFormat(b, el) {
  closeCardMenu();
  closeFreeFormat();
  el = el || cardEl(b.id);
  var ta = el && el.querySelector('.free-ta');
  if (!ta) return;
  b.content.style = b.content.style || defaultFreeStyle();
  var st = b.content.style;
  function persist(logMsg) { applyFreeStyle(ta, st); autoGrowFree(ta); touchNote(b.noteId); if (logMsg) logChange(logMsg, ''); save(); drawLinks(); }

  var bd = h('div', { class: 'pop-backdrop', id: 'freeFmtBackdrop', onmousedown: function (e) { if (e.target === bd) closeFreeFormat(); } });
  var pop = h('div', { class: 'free-fmt-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'free-fmt-head' },
    h('div', { class: 'free-fmt-title' }, icon('type'), 'Personalizar texto'),
    h('button', { class: 'icon-btn', title: 'Cerrar (Esc)', onclick: closeFreeFormat }, icon('x'))));
  var body = h('div', { class: 'free-fmt-body' });

  // Tipo de letra
  body.appendChild(h('div', { class: 'free-sec' }, 'Tipo de letra'));
  var fontRow = h('div', { class: 'free-font-row' });
  FREE_FONTS.forEach(function (f) {
    var btn = h('button', { class: 'free-font' + ((st.font || 'sans') === f.key ? ' on' : ''), style: { fontFamily: f.css } }, f.label);
    btn.addEventListener('click', function () { st.font = f.key; Array.prototype.forEach.call(fontRow.children, function (c) { c.classList.remove('on'); }); btn.classList.add('on'); persist('Tipo de letra'); });
    fontRow.appendChild(btn);
  });
  body.appendChild(fontRow);

  // Estilo + alineaci\u00f3n
  body.appendChild(h('div', { class: 'free-sec' }, 'Estilo'));
  function toggle(label, key, title, cls) {
    var btn = h('button', { class: 'free-chip' + (cls || '') + (st[key] ? ' on' : ''), title: title }, label);
    btn.addEventListener('click', function () { st[key] = !st[key]; btn.classList.toggle('on', st[key]); persist('Estilo de texto'); });
    return btn;
  }
  body.appendChild(h('div', { class: 'free-row' },
    toggle('B', 'bold', 'Negrita', ' fc-b'),
    toggle('i', 'italic', 'Cursiva', ' fc-i'),
    toggle('U', 'underline', 'Subrayado', ' fc-u'),
    toggle('S', 'strike', 'Tachado', ' fc-s'),
    toggle('Sombra', 'shadow', 'Sombra del texto')
  ));
  var aligns = [['left', '\u27f8'], ['center', '\u27fa'], ['right', '\u27f9']];
  var alignRow = h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Alinear'));
  aligns.forEach(function (a) {
    var btn = h('button', { class: 'free-chip' + (st.align === a[0] ? ' on' : ''), title: a[0] }, a[1]);
    btn.addEventListener('click', function () { st.align = a[0]; Array.prototype.forEach.call(alignRow.querySelectorAll('.free-chip'), function (x) { x.classList.remove('on'); }); btn.classList.add('on'); persist('Alineaci\u00f3n'); });
    alignRow.appendChild(btn);
  });
  body.appendChild(alignRow);

  // Color
  body.appendChild(h('div', { class: 'free-sec' }, 'Color'));
  var color = h('input', { type: 'color', value: st.color ? toHex(st.color) : toHex(cssVarValue('--fg')), class: 'free-color' });
  color.addEventListener('input', function () { st.color = color.value; persist(); });
  var clearColor = h('button', { class: 'free-chip', title: 'Color por defecto (seg\u00fan el fondo)', onclick: function () { st.color = ''; persist('Color de texto'); } }, 'Auto');
  body.appendChild(h('div', { class: 'free-row' }, color, clearColor));

  // Caja: ancho, fondo (callout) y relleno interno. El alto se ajusta solo al texto.
  body.appendChild(h('div', { class: 'free-sec' }, 'Caja'));
  slider('Ancho', 80, 800, 10, b.width || 260, ' px', function (v) { b.width = v; if (el) el.style.width = v + 'px'; if (ta) autoGrowFree(ta); touchNote(b.noteId); save(); drawLinks(); });
  var bg = h('input', { type: 'color', value: st.bg ? toHex(st.bg) : '#fff3d6', class: 'free-color' });
  bg.addEventListener('input', function () { st.bg = bg.value; persist(); });
  var noBg = h('button', { class: 'free-chip', title: 'Sin fondo (transparente)', onclick: function () { st.bg = ''; persist('Fondo de caja'); } }, 'Ninguno');
  body.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, 'Fondo'), bg, noBg));
  slider('Relleno', 0, 24, 1, st.pad != null ? st.pad : 4, ' px', function (v) { st.pad = v; persist(); });

  // Tama\u00f1o / interlineado / espaciado
  body.appendChild(h('div', { class: 'free-sec' }, 'Tama\u00f1o y espaciado'));
  function slider(label, min, max, step, val, unit, onInput) {
    var out = h('span', { class: 'free-size-lbl' }, val + unit);
    var r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), class: 'free-size' });
    r.addEventListener('input', function () { out.textContent = r.value + unit; onInput(parseFloat(r.value)); });
    body.appendChild(h('div', { class: 'free-row' }, h('span', { class: 'free-lbl' }, label), r, out));
  }
  slider('Tama\u00f1o', 12, 120, 1, st.size || 20, ' px', function (v) { st.size = v; persist(); });
  slider('Interlineado', 1, 2.5, 0.05, st.lineHeight || 1.3, '', function (v) { st.lineHeight = v; persist(); });
  slider('Espaciado', -1, 8, 0.5, st.letterSpacing || 0, ' px', function (v) { st.letterSpacing = v; persist(); });

  pop.appendChild(body);
  bd.appendChild(pop);
  document.body.appendChild(bd);
  positionFreeFmtPop(pop, el);
  document.addEventListener('keydown', escCloseFree);
}
// Coloca el panel flotante al costado del bloque (a la derecha; a la izquierda si no cabe).
function positionFreeFmtPop(pop, el) {
  if (!el) return;
  var cr = el.getBoundingClientRect();
  var pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 420;
  var left = cr.right + 12;
  if (left + pw > window.innerWidth - 8) left = cr.left - pw - 12;   // no cabe a la derecha → al lado izquierdo
  if (left < 8) left = Math.min(Math.max(8, cr.left), window.innerWidth - pw - 8);
  var top = Math.min(Math.max(56, cr.top), window.innerHeight - ph - 8);
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}
function escCloseFree(e) { if (e.key === 'Escape') closeFreeFormat(); }
function closeFreeFormat() { var o = document.getElementById('freeFmtBackdrop'); if (o) o.remove(); document.removeEventListener('keydown', escCloseFree); }
// ---------- Dibujo a mano (Apple Pencil / mouse / t\u00e1ctil) ----------
function drawBody(b) {
  b.content = b.content || {};
  if (!Array.isArray(b.content.strokes)) b.content.strokes = [];
  if (!b.content.color) b.content.color = '#33302b';
  if (!b.content.size) b.content.size = 3;
  var wrap = h('div', { class: 'draw-wrap' });
  var canvas = h('canvas', { class: 'draw-canvas' });
  var ctx = canvas.getContext('2d');
  var state = { drawing: false, cur: null, erase: false, dpr: window.devicePixelRatio || 1 };

  function resize() {
    var rect = wrap.getBoundingClientRect();
    var w = Math.max(20, rect.width), hh = Math.max(20, rect.height);
    state.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(hh * state.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = hh + 'px';
    redraw();
  }
  function drawStroke(s) {
    if (!s.points || s.points.length === 0) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = s.color;
    if (s.points.length === 1) {
      var p0 = s.points[0];
      ctx.beginPath(); ctx.fillStyle = s.color;
      ctx.arc(p0.x * canvas.width, p0.y * canvas.height, Math.max(0.5, (s.size * (p0.p || 1)) / 2) * state.dpr, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (var i = 1; i < s.points.length; i++) {
      var a = s.points[i - 1], c = s.points[i];
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.5, s.size * ((a.p || 1) + (c.p || 1)) / 2) * state.dpr;
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(c.x * canvas.width, c.y * canvas.height);
      ctx.stroke();
    }
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    b.content.strokes.forEach(drawStroke);
    if (state.cur) drawStroke(state.cur);
  }
  function ptFrom(e) {
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left) / rect.width;
    var py = (e.clientY - rect.top) / rect.height;
    var pr = (e.pointerType === 'pen') ? (e.pressure || 0.5) : (e.pressure && e.pressure !== 0.5 ? e.pressure : 1);
    return { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)), p: pr };
  }
  function down(e) {
    if (e.button != null && e.button !== 0) return;
    e.stopPropagation();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    state.drawing = true;
    state.erase = e.button === 2 || state.forceErase;
    if (state.erase) { eraseAt(ptFrom(e)); return; }
    state.cur = { color: b.content.color, size: b.content.size, points: [ptFrom(e)] };
    redraw();
  }
  function move(e) {
    if (!state.drawing) return;
    e.stopPropagation();
    var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    if (state.erase) { for (var k = 0; k < evs.length; k++) eraseAt(ptFrom(evs[k])); return; }
    for (var i = 0; i < evs.length; i++) state.cur.points.push(ptFrom(evs[i]));
    redraw();
  }
  function up(e) {
    if (!state.drawing) return;
    e.stopPropagation();
    state.drawing = false;
    if (state.cur && state.cur.points.length) { b.content.strokes.push(state.cur); }
    state.cur = null;
    touchNote(b.noteId); logChange('Dibujo actualizado', ''); save();
    redraw();
  }
  function eraseAt(pt) {
    var before = b.content.strokes.length;
    b.content.strokes = b.content.strokes.filter(function (s) {
      return !s.points.some(function (q) { return Math.hypot(q.x - pt.x, q.y - pt.y) < 0.03; });
    });
    if (b.content.strokes.length !== before) { redraw(); debouncedSave(); }
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.style.touchAction = 'none';

  // Barra de herramientas
  var colorInp = h('input', { type: 'color', class: 'draw-color', value: b.content.color, title: 'Color' });
  colorInp.addEventListener('input', function () { b.content.color = colorInp.value; debouncedSave(); });
  colorInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var sizeInp = h('input', { type: 'range', class: 'draw-size', min: '1', max: '24', value: String(b.content.size), title: 'Grosor' });
  sizeInp.addEventListener('input', function () { b.content.size = +sizeInp.value; debouncedSave(); });
  sizeInp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  var eraseBtn = h('button', { class: 'draw-tool', title: 'Borrador (o clic derecho)' }, icon('eraser'));
  eraseBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  eraseBtn.addEventListener('click', function (e) { e.stopPropagation(); state.forceErase = !state.forceErase; eraseBtn.classList.toggle('on', state.forceErase); });
  var clearBtn = h('button', { class: 'draw-tool', title: 'Limpiar todo' }, icon('trash'));
  clearBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  clearBtn.addEventListener('click', function (e) { e.stopPropagation(); if (!b.content.strokes.length) return; b.content.strokes = []; state.cur = null; redraw(); touchNote(b.noteId); logChange('Dibujo borrado', ''); save(); });
  var toolbar = h('div', { class: 'draw-toolbar' }, colorInp, sizeInp, eraseBtn, clearBtn);

  wrap.appendChild(canvas);
  wrap.appendChild(toolbar);
  if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (canvas.isConnected) resize(); }); ro.observe(wrap); }
  setTimeout(resize, 0);
  return [wrap];
}
// ---------- Formas / stencils (diagramación) ----------
var SHAPES = [
  { key: 'rect', label: 'Rectángulo' },
  { key: 'round', label: 'Redondeado' },
  { key: 'ellipse', label: 'Elipse' },
  { key: 'diamond', label: 'Rombo (decisión)' },
  { key: 'pill', label: 'Píldora (inicio/fin)' },
  { key: 'parallelogram', label: 'Proceso' },
];
// ---------- Lienzo sobre lienzo: bloque "portal" que abre una nota (lienzo) anidada ----------
function canvasBody(b) {
  b.content = b.content || {};
  var wrap = h('div', { class: 'canvas-portal' });
  updateCanvasPortalInto(wrap, b);
  return [wrap];
}
function updateCanvasPortalInto(wrap, b) {
  wrap.innerHTML = '';
  var ref = b.content && b.content.noteRef, n = ref && getNote(ref);
  if (!n) {
    var mk = h('button', { class: 'portal-btn', onclick: function (e) { e.stopPropagation(); createSubCanvas(b); } }, icon('layout'), 'Crear lienzo anidado');
    mk.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    wrap.appendChild(mk);
    return;
  }
  var open = h('button', { class: 'portal-open', title: 'Abrir el lienzo «' + n.title + '»', onclick: function (e) { e.stopPropagation(); selectNote(n.id); } },
    icon('layout'), h('span', { class: 'portal-title' }, n.title), h('span', { class: 'portal-arrow' }, '→'));
  open.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  wrap.appendChild(open);
}
function updateCanvasPortal(el, b) { var w = el && el.querySelector('.canvas-portal'); if (w) updateCanvasPortalInto(w, b); }
// Crea una nota (lienzo) hija de la actual y enlaza este bloque con ella (aparece en el árbol).
function createSubCanvas(b) {
  var note = getNote(ui.currentNoteId);
  if (!note) { toast('Abre una nota primero.', 'warn'); return; }
  pushUndo('Crear sub-lienzo');
  var t = now();
  var child = { id: uid(), sectionId: note.sectionId, parentId: note.id, title: 'Lienzo anidado', createdAt: t, updatedAt: t };
  data.notes.push(child);
  b.content = b.content || {};
  b.content.noteRef = child.id;
  touchNote(note.id);
  logChange('Sub-lienzo creado', '');
  save();
  renderSidebar();
  updateCanvasPortal(cardEl(b.id), b);
  toast('Sub-lienzo creado: haz clic en «' + child.title + ' →» para entrar (también está en el árbol).', 'ok');
}
// Inserta un bloque-lienzo nuevo y le crea su lienzo anidado (acción de "lienzo sobre lienzo").
function newSubCanvas() {
  var b = quickCreate('canvas');
  if (!b) { toast('Abre una nota primero.', 'warn'); return; }
  createSubCanvas(b);
}
function shapeBody(b) {
  b.content = b.content || {};
  var box = h('div', { class: 'shape-box shape-' + (b.content.shape || 'rect') });
  var ta = h('textarea', { class: 'shape-ta', placeholder: 'Texto…' });
  ta.value = b.content.text || '';
  ta.addEventListener('input', function () { b.content.text = ta.value; touchNote(b.noteId); debouncedSave(); });
  ta.addEventListener('change', function () { logChange('Forma editada', snippet(ta.value)); save(); });
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  box.appendChild(ta);
  return box;
}
function setShapeType(b, key) {
  b.content = b.content || {};
  b.content.shape = key;
  var el = cardEl(b.id);
  var box = el && el.querySelector('.shape-box');
  if (box) box.className = 'shape-box shape-' + key;
  touchNote(b.noteId); logChange('Tipo de forma', key); save();
}
function openShapePicker(b, anchor) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop shape-pop', onmousedown: function (e) { e.stopPropagation(); } });
  SHAPES.forEach(function (s) {
    pop.appendChild(h('button', { class: 'shape-opt' + ((b.content && b.content.shape) === s.key ? ' on' : ''), title: s.label, onclick: function () { setShapeType(b, s.key); closeTopbarMenu(); } },
      h('span', { class: 'shape-mini shape-' + s.key }), h('span', { class: 'shape-opt-lbl' }, s.label)));
  });
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 220);
}
// Paleta de formas del topbar: inserta una forma nueva en el lienzo.
function openShapePalette(anchor) {
  closeTopbarMenu();
  if (!ui.currentNoteId || !getNote(ui.currentNoteId)) { toast('Abre una nota primero.', 'warn'); return; }
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop shape-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('shapes'), 'Insertar forma'));
  var grid = h('div', { class: 'shape-grid' });
  SHAPES.forEach(function (s) {
    grid.appendChild(h('button', { class: 'shape-tile', title: s.label, onclick: function () { closeTopbarMenu(); insertShape(s.key); } },
      h('span', { class: 'shape-mini shape-' + s.key }), h('span', { class: 'shape-tile-lbl' }, s.label)));
  });
  pop.appendChild(grid);
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 250);
}
function insertShape(key) {
  var b = quickCreate('shape');
  if (!b) return;
  b.content.shape = key || 'rect';
  save();
  var el = cardEl(b.id);
  var box = el && el.querySelector('.shape-box');
  if (box) box.className = 'shape-box shape-' + b.content.shape;
}
// ---------- Conexión rápida: crear un bloque conectado desde el costado de una forma ----------
var QC_SHAPES = [
  { key: 'rect', color: '', label: '▭ Paso' },
  { key: 'diamond', color: '', label: '◇ Decisión' },
  { key: 'round', color: '', label: '▢ Subproceso' },
  { key: 'pill', color: '', label: '⬭ Inicio / Fin' },
  { key: 'pill', color: 'q', label: '⬤ Fin del proceso (rojo)' },
];
function openQuickConnect(b, side, anchor) {
  closeTopbarMenu();
  var bd = h('div', { class: 'pop-backdrop', id: 'topbarMenuBackdrop', onmousedown: function (e) { if (e.target === bd) closeTopbarMenu(); } });
  var pop = h('div', { class: 'card-menu-pop shape-pop', onmousedown: function (e) { e.stopPropagation(); } });
  pop.appendChild(h('div', { class: 'cm-label' }, icon('shapes'), 'Conectar nuevo bloque'));
  QC_SHAPES.forEach(function (s) {
    pop.appendChild(h('button', { class: 'shape-opt', onclick: function () { quickConnect(b, side, s.key, s.color); closeTopbarMenu(); } },
      h('span', { class: 'shape-mini shape-' + s.key + (s.color ? ' qc-red' : '') }), h('span', { class: 'shape-opt-lbl' }, s.label)));
  });
  bd.appendChild(pop); document.body.appendChild(bd);
  positionPop(pop, anchor, 220);
}
function quickConnect(b, side, shapeKey, color) {
  var el = cardEl(b.id);
  var w = el ? el.offsetWidth : (b.width || 176), hh = el ? el.offsetHeight : (b.height || 104);
  var nw = 176, nh = 104, gap = 72, nx, ny;
  if (side === 'right') { nx = b.x + w + gap; ny = b.y + (hh - nh) / 2; }
  else if (side === 'left') { nx = b.x - nw - gap; ny = b.y + (hh - nh) / 2; }
  else if (side === 'bottom') { nx = b.x + (w - nw) / 2; ny = b.y + hh + gap; }
  else { nx = b.x + (w - nw) / 2; ny = b.y - nh - gap; }
  nx = Math.max(0, Math.round(nx)); ny = Math.max(0, Math.round(ny));
  pushUndo('Conectar nuevo bloque');
  var t = now();
  var nb = { id: uid(), noteId: b.noteId, type: 'shape', x: nx, y: ny, width: nw, height: nh, content: { text: '', shape: shapeKey }, createdAt: t, updatedAt: t };
  if (color) nb.color = color;
  data.blocks.push(nb);
  data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: nb.id, type: 'flow', createdAt: t });
  touchNote(b.noteId);
  logChange('Bloque conectado', shapeKey);
  save();
  renderCanvas();
  cardEnterAnim(cardEl(nb.id));
  focusBlock(nb.id);
  var ne = cardEl(nb.id), ta = ne && ne.querySelector('.shape-ta');
  if (ta) setTimeout(function () { ta.focus(); }, 60);
}
// Redimensiona un bloque arrastrando su manija (formas). Actualiza los conectores en vivo.
// Redimensiona una nota/idea en ambos ejes: fija el alto (manualH) y ajusta ancho y alto.
function startNoteResize(e, b, el) {
  e.preventDefault(); e.stopPropagation();
  b.content = b.content || {}; b.content.manualH = true;
  el.classList.remove('note-auto'); el.classList.add('note-manual');
  var sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight, z = getView().zoom || 1;
  function mv(ev) {
    var nw = Math.max(140, Math.round(sw + (ev.clientX - sx) / z));
    var nh = Math.max(64, Math.round(sh + (ev.clientY - sy) / z));
    el.style.width = nw + 'px'; el.style.height = nh + 'px';
    b.width = nw; b.height = nh;
    drawLinks();
  }
  function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); touchNote(b.noteId); save(); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
function startBlockResize(e, b, el) {
  e.preventDefault(); e.stopPropagation();
  var sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight, z = getView().zoom || 1;
  function mv(ev) {
    var nw = Math.max(96, Math.round(sw + (ev.clientX - sx) / z));
    var nh = Math.max(60, Math.round(sh + (ev.clientY - sy) / z));
    el.style.width = nw + 'px'; el.style.height = nh + 'px';
    b.width = nw; b.height = nh;
    drawLinks();
  }
  function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); touchNote(b.noteId); save(); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}

function imageBody(b) {
  b.content = b.content || {};
  b.content.images = b.content.images || [];
  var media = h('div', { class: 'card-media img-media', tabindex: '0' });
  media.addEventListener('mousedown', function (e) { if (e.target === media) media.focus(); });
  media.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) {
      e.preventDefault(); e.stopPropagation();
      var el = media.closest('.card');
      addImagesToBlock(b, files, function () { if (el) { updateCardMedia(el, b); drawLinks(); } });
    }
  });
  return [h('div', { class: 'img-row' }, media, buildImageDesc(b))];
}
// Panel de descripción que aparece AL LADO de la imagen (se muestra si hay texto o al pulsar el botón).
function buildImageDesc(b) {
  var wrap = h('div', { class: 'img-desc' });
  var ta = h('textarea', { class: 'img-desc-ta', placeholder: 'Escribe una descripción al lado de la imagen…', spellcheck: 'false' });
  ta.value = (b.content && b.content.desc) || '';
  ta.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  ta.addEventListener('input', function () {
    b.content = b.content || {}; b.content.desc = ta.value;
    var card = wrap.closest('.card'); if (card) card.classList.toggle('has-desc', !!ta.value.trim());
    touchNote(b.noteId); debouncedSave(); drawLinks();
  });
  ta.addEventListener('change', function () { logChange('Descripción de imagen', snippet(ta.value)); save(); });
  ta.addEventListener('blur', function () {
    var card = wrap.closest('.card');
    if (card && !ta.value.trim()) card.classList.remove('desc-open'); // vacía → se oculta el panel
  });
  wrap.appendChild(ta);
  return wrap;
}
// Muestra el panel de descripción al lado de la imagen y lo enfoca (ensancha la tarjeta si hace falta).
function toggleImageDesc(b, el) {
  el = el || cardEl(b.id);
  if (!el) return;
  el.classList.add('desc-open');
  if (el.offsetWidth < 340) { el.style.width = '360px'; b.width = 360; save(); }
  var ta = el.querySelector('.img-desc-ta');
  if (ta) setTimeout(function () { ta.focus(); }, 0);
  drawLinks();
}
function renderFreeImage(wrap, b) {
  wrap.innerHTML = '';
  var imgs = (b.content && b.content.images) || [];
  if (!imgs.length) return;
  var it = imgs[0];
  var img = h('img', { src: imgItemSrc(it), alt: '' });
  setupImageDrag(img, b);
  wrap.appendChild(img);
}
function freeImageBody(b) {
  b.content = b.content || {};
  b.content.images = b.content.images || [];
  var wrap = h('div', { class: 'card-media freeimg-media' });
  renderFreeImage(wrap, b);
  return [wrap];
}
