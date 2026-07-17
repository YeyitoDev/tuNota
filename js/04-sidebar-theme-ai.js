/* tuNota — Render del sidebar, tema/colores personalizables y configuración/panel de IA.
   Módulos cargados en orden desde index.html; comparten el ámbito global (sin build). */
'use strict';

// ---------- Render: Sidebar ----------
function renderSidebar() {
  var aside = document.getElementById('sidebar');
  aside.innerHTML = '';
  var brand = h(
    'div',
    { class: 'brand' },
    h('div', { class: 'brand-ico' }, icon('leaf')),
    h('div', { class: 'brand-txt' }, h('div', { class: 'brand-name' }, 'tuNota'), h('div', { class: 'brand-sub' }, 'ideas que respiran')),
    h('span', { class: 'brand-spacer' }),
    h('button', { class: 'sidebar-collapse-btn', title: 'Ocultar panel', onclick: toggleSidebar }, icon('chevronL'))
  );
  var tree = h('div', { class: 'tree' });
  var nbs = notebooksAll();
  nbs.forEach(function (nb) { tree.appendChild(notebookNode(nb)); });
  if (nbs.length === 0) tree.appendChild(h('p', { class: 'tree-empty' }, 'Crea tu primer libro.'));
  var addBtn = h('button', { class: 'add-nb', onclick: addNotebook }, icon('plus'), 'Nuevo libro');
  aside.appendChild(brand);
  aside.appendChild(tree);
  aside.appendChild(addBtn);
}
// Navega a un grupo desde el árbol: abre su nota si hace falta y centra el lienzo en él.
function goToGroup(noteId, g) {
  if (ui.currentNoteId !== noteId) { selectNote(noteId); requestAnimationFrame(function () { centerOnGroup(g); }); }
  else centerOnGroup(g);
}

function buildSidebarGroups() {
  if (!ui.currentNoteId) return null;
  var gs = groupsOf(ui.currentNoteId);
  if (!gs.length) return null;
  var wrap = h('div', { class: 'sidebar-groups' });
  wrap.appendChild(h('div', { class: 'sidebar-sec-title' }, icon('shapes'), 'Grupos del lienzo'));
  var list = h('div', { class: 'sidebar-group-list' });
  gs.forEach(function (g) {
    var row = h('div', { class: 'row group-row', title: 'Centrar en ' + g.name });
    row.appendChild(h('span', { class: 'group-dot ' + GROUP_COLORS[g.color % GROUP_COLORS.length] }));
    var nameSpan = h('span', { class: 'item-name' }, g.name);
    row.appendChild(nameSpan);
    var editBtn = h('button', { class: 'act', title: 'Renombrar grupo' }, icon('edit'));
    row.appendChild(editBtn);
    row.appendChild(h('button', { class: 'act danger', title: 'Disolver grupo', onclick: function (e) { e.stopPropagation(); deleteGroup(g); } }, icon('trash')));
    row.addEventListener('click', function () { centerOnGroup(g); });
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var inp = h('input', { class: 'inline-edit', value: g.name });
      nameSpan.replaceWith(inp);
      inp.focus(); inp.select();
      var commit = function () {
        var v = inp.value.trim();
        if (v && v !== g.name) { g.name = v; save(); renderSidebar(); renderCanvas(); }
        else { if (inp.isConnected) inp.replaceWith(nameSpan); }
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') { if (inp.isConnected) inp.replaceWith(nameSpan); } });
      inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

function notebookNode(nb) {
  var open = !!ui.expN[nb.id];
  var editBtn = h('button', { class: 'act', title: 'Renombrar libro' }, icon('edit'));
  var name = editable(h('span', { class: 'item-name' }, nb.name), nb.name, function (v) { rename('nb', nb.id, v); }, editBtn);
  var row = h(
    'div',
    { class: 'row nb-row' },
    h('button', { class: 'chev', onclick: function () { ui.expN[nb.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
    h('span', { class: 'emoji' }, nb.emoji || '\uD83D\uDCD3'),
    name,
    h('button', { class: 'act', title: 'A\u00f1adir secci\u00f3n', onclick: function (e) { e.stopPropagation(); addSection(nb.id); } }, icon('folderPlus')),
    editBtn,
    h('button', { class: 'act danger', title: 'Eliminar libro', onclick: function (e) { e.stopPropagation(); deleteNotebook(nb.id); } }, icon('trash'))
  );
  var wrap = h('div', {}, row);
  if (open) {
    var kids = h('div', { class: 'children' });
    var secs = sectionsOf(nb.id);
    secs.forEach(function (s) { kids.appendChild(sectionNode(s)); });
    if (secs.length === 0) kids.appendChild(h('p', { class: 'tree-empty' }, 'Sin secciones a\u00fan'));
    wrap.appendChild(kids);
  }
  return wrap;
}

function sectionNode(s) {
  var open = !!ui.expS[s.id];
  var editBtn = h('button', { class: 'act', title: 'Renombrar sección' }, icon('edit'));
  var name = editable(h('span', { class: 'item-name' }, s.name), s.name, function (v) { rename('sec', s.id, v); }, editBtn);
  var row = h(
    'div',
    { class: 'row sec-row' },
    h('button', { class: 'chev', onclick: function () { ui.expS[s.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
    name,
    h('button', { class: 'act', title: 'Nueva nota', onclick: function (e) { e.stopPropagation(); addNote(s.id); } }, icon('plus')),
    editBtn,
    h('button', { class: 'act danger', title: 'Eliminar secci\u00f3n', onclick: function (e) { e.stopPropagation(); deleteSection(s.id); } }, icon('trash'))
  );
  var wrap = h('div', {}, row);
  if (open) {
    var kids = h('div', { class: 'children' });
    var ns = notesOf(s.id).filter(function (nn) { return !nn.parentId || !getNote(nn.parentId); }); // solo lienzos de nivel superior; los anidados cuelgan de su nota
    ns.forEach(function (n) { kids.appendChild(noteRow(n)); });
    if (ns.length === 0) kids.appendChild(h('p', { class: 'tree-empty' }, 'Sin notas a\u00fan'));
    wrap.appendChild(kids);
  }
  return wrap;
}

function noteRow(n) {
  var active = ui.currentNoteId === n.id;
  var editBtn = h('button', { class: 'act', title: 'Renombrar nota' }, icon('edit'));
  var name = editable(h('span', { class: 'item-name' }, n.title), n.title, function (v) { rename('note', n.id, v); }, editBtn);
  var row = h(
    'div',
    { class: 'row note-row' + (active ? ' active' : ''), onclick: function () { selectNote(n.id); } },
    icon('file'),
    name,
    editBtn,
    h('button', { class: 'act danger', title: 'Eliminar nota', onclick: function (e) { e.stopPropagation(); deleteNote(n.id); } }, icon('trash'))
  );
  // Sub-lienzos (notas hijas, "lienzo sobre lienzo") y grupos del lienzo, anidados bajo la nota.
  var gs = groupsOf(n.id);
  var children = (data.notes || []).filter(function (x) { return x.parentId === n.id && getNote(n.id); });
  if (!gs.length && !children.length) return row;
  var wrap = h('div', {}, row);
  if (children.length) {
    var ckids = h('div', { class: 'children note-children' });
    children.forEach(function (c) { ckids.appendChild(noteRow(c)); }); // recursivo: lienzos dentro de lienzos
    wrap.appendChild(ckids);
  }
  if (gs.length) {
    var kids = h('div', { class: 'children note-groups' });
    gs.forEach(function (g) {
      var grow = h('div', { class: 'row group-row', title: 'Centrar en «' + g.name + '»' },
        h('span', { class: 'group-dot ' + GROUP_COLORS[g.color % GROUP_COLORS.length] }),
        h('span', { class: 'item-name' }, g.name),
        h('button', { class: 'act', title: 'Guardar el grupo como plantilla', onclick: function (e) { e.stopPropagation(); saveGroupAsTemplate(g); } }, icon('layout')),
        h('button', { class: 'act danger', title: 'Disolver grupo', onclick: function (e) { e.stopPropagation(); deleteGroup(g); } }, icon('trash')));
      if (gs.length > 1) { // "Juntar con otro grupo" solo tiene sentido si hay más de uno
        var mBtn = h('button', { class: 'act', title: 'Juntar con otro grupo…', onclick: function (e) { e.stopPropagation(); goToGroup(n.id, g); openGroupMergePicker(g, mBtn); } }, icon('shapes'));
        grow.insertBefore(mBtn, grow.lastChild); // antes del botón de disolver
      }
      grow.addEventListener('click', function (e) { e.stopPropagation(); goToGroup(n.id, g); });
      kids.appendChild(grow);
    });
    wrap.appendChild(kids);
  }
  return wrap;
}

// ---------- Tema / colores personalizables ----------
var THEME_VARS = [
  ['--bg', 'Fondo'],
  ['--card', 'Tarjetas'],
  ['--fg', 'Texto'],
  ['--secondary', 'Panel lateral'],
  ['--topbar', 'Barra superior'],
  ['--border', 'Bordes'],
  ['--primary', 'Acento'],
  ['--sage', 'Verde'],
  ['--ocre', 'Ocre'],
];
// Colores de las 4 muestras (swatch) del tema por defecto, para la vista previa.
var THEME_DEFAULTS = { '--bg': '#f4ede0', '--card': '#fdfaf3', '--primary': '#c2745b', '--sage': '#8a9a7b', '--ocre': '#d9a35a' };
var THEME_PRESETS = {
  'Cozy (por defecto)': {},
  'Bosque': { '--bg': '#eef1e6', '--card': '#f8faf2', '--secondary': '#e2e8d6', '--border': '#cfd8bf', '--primary': '#5f8d5a', '--sage': '#7a9b6f', '--ocre': '#c99a4e', '--fg': '#2c332a' },
  'Oc\u00e9ano': { '--bg': '#e9eff3', '--card': '#f6fafc', '--secondary': '#d7e3ea', '--border': '#c3d3dd', '--primary': '#3d7ea6', '--sage': '#5aa0a8', '--ocre': '#d99a5a', '--fg': '#26333b' },
  'Menta': { '--bg': '#e8f3ee', '--card': '#f5fbf8', '--secondary': '#d7e9e0', '--border': '#c2ddd0', '--primary': '#3f9b7e', '--sage': '#5fae94', '--ocre': '#d09a5a', '--fg': '#26332d' },
  'Lavanda': { '--bg': '#f0ecf6', '--card': '#faf8fd', '--secondary': '#e5ddf0', '--border': '#d5cae6', '--primary': '#8a6bc2', '--sage': '#9a8ac0', '--ocre': '#d9a35a', '--fg': '#332c3d' },
  'Sakura': { '--bg': '#fbecf1', '--card': '#fef6f9', '--secondary': '#f4d9e3', '--border': '#ecc4d3', '--primary': '#c85f86', '--sage': '#b98aa0', '--ocre': '#d99a6a', '--fg': '#3d2a31' },
  'Durazno': { '--bg': '#fbeee7', '--card': '#fef7f2', '--secondary': '#f6ddd0', '--border': '#efcab7', '--primary': '#d97a54', '--sage': '#c98f74', '--ocre': '#e0a15a', '--fg': '#402e26' },
  'Arena': { '--bg': '#f3ece0', '--card': '#fbf6ec', '--secondary': '#e8dec9', '--border': '#dccdb4', '--primary': '#b07d4e', '--sage': '#9c8f6f', '--ocre': '#cf9a4e', '--fg': '#3a3226' },
  'Noche': { '--bg': '#22242a', '--card': '#2c2f37', '--secondary': '#282b32', '--topbar': 'rgba(40, 43, 50, 0.82)', '--border': '#3a3e48', '--primary': '#d98a6a', '--sage': '#8aa38c', '--ocre': '#d9a35a', '--fg': '#e7e3da', '--muted': '#a09a8f', '--muted2': '#726c62' },
  'Pizarra': { '--bg': '#1f2530', '--card': '#29303c', '--secondary': '#242a34', '--topbar': 'rgba(36, 42, 52, 0.82)', '--border': '#38414f', '--primary': '#6aa0d9', '--sage': '#7fa8a3', '--ocre': '#d9a35a', '--fg': '#e3e7ee', '--muted': '#a3abb8', '--muted2': '#6b7280' },
  'Carb\u00f3n': { '--bg': '#201e1c', '--card': '#2a2724', '--secondary': '#262320', '--topbar': 'rgba(38, 35, 32, 0.82)', '--border': '#3c3733', '--primary': '#d98a6a', '--sage': '#9aa38c', '--ocre': '#d9a35a', '--fg': '#ece7df', '--muted': '#a8a096', '--muted2': '#746c62' },
};
function applyTheme() {
  var root = document.documentElement;
  THEME_VARS.forEach(function (v) { root.style.removeProperty(v[0]); });
  ['--muted', '--muted2'].forEach(function (k) { root.style.removeProperty(k); });
  var t = ui.theme || {};
  Object.keys(t).forEach(function (k) { if (t[k]) root.style.setProperty(k, t[k]); });
  // Los diagramas Mermaid toman sus colores de la paleta: re-tematizarlos.
  if (typeof mmdThemeRefresh === 'function') mmdThemeRefresh();
  // El texto en contraste automático depende de --fg/--card: recalcularlo al cambiar de tema.
  if (typeof applyAutoTextAll === 'function') applyAutoTextAll();
}
function cssVarValue(name) {
  var inline = document.documentElement.style.getPropertyValue(name);
  if (inline) return inline.trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000';
}
function setThemeVar(name, val) {
  ui.theme[name] = val;
  applyTheme();
  debouncedSave();
}
function applyPreset(map) {
  ui.theme = {};
  Object.keys(map).forEach(function (k) { ui.theme[k] = map[k]; });
  applyTheme();
  logChange('Tema aplicado', '');
  save();
}
function resetTheme() { ui.theme = {}; applyTheme(); logChange('Tema restablecido', ''); save(); }
function openTheme() {
  closeTheme();
  var overlay = h('div', { class: 'overlay', id: 'themeOverlay', onclick: function (e) { if (e.target === overlay) closeTheme(); } });
  var panel = h('div', { class: 'log-panel theme-panel' });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('leaf'), 'Personalizar colores'),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeTheme }, icon('x'))
  );
  var body = h('div', { class: 'log-body theme-body' });
  var presets = h('div', { class: 'theme-presets' });
  Object.keys(THEME_PRESETS).forEach(function (name) {
    var map = THEME_PRESETS[name];
    var sw = h('span', { class: 'preset-sw' });
    ['--bg', '--primary', '--sage', '--ocre'].forEach(function (k) {
      sw.appendChild(h('span', { class: 'preset-dot', style: { background: map[k] || THEME_DEFAULTS[k] } }));
    });
    presets.appendChild(h('button', { class: 'theme-preset-btn', title: name, onclick: function () { applyPreset(THEME_PRESETS[name]); openTheme(); } },
      sw, h('span', { class: 'preset-name' }, name)));
  });
  body.appendChild(h('div', { class: 'theme-sec-title' }, 'Paletas'));
  body.appendChild(presets);
  body.appendChild(h('div', { class: 'theme-sec-title' }, 'Colores individuales'));
  var grid = h('div', { class: 'theme-grid' });
  THEME_VARS.forEach(function (v) {
    var inp = h('input', { type: 'color', class: 'theme-color', value: toHex(cssVarValue(v[0])) });
    inp.addEventListener('input', function () { setThemeVar(v[0], inp.value); });
    grid.appendChild(h('label', { class: 'theme-row' }, inp, h('span', {}, v[1])));
  });
  body.appendChild(grid);
  body.appendChild(h('div', { class: 'theme-sec-title' }, 'Legibilidad'));
  var autoCb = h('input', { type: 'checkbox' });
  autoCb.checked = !!ui.autoText;
  autoCb.addEventListener('change', function () { ui.autoText = autoCb.checked; save(); applyAutoTextAll(); });
  body.appendChild(h('label', { class: 'theme-row theme-toggle' }, autoCb,
    h('span', {}, 'Texto en contraste automático con su fondo')));
  var reset = h('button', { class: 'theme-reset-btn', onclick: function () { resetTheme(); openTheme(); } }, 'Restablecer por defecto');
  body.appendChild(reset);
  panel.appendChild(head); panel.appendChild(body);
  overlay.appendChild(panel); document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseTheme);
}
function escCloseTheme(e) { if (e.key === 'Escape') closeTheme(); }
function closeTheme() { var o = document.getElementById('themeOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseTheme); }
function toHex(c) {
  c = String(c || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);
  if (m) { return '#' + [1, 2, 3].map(function (i) { return ('0' + (+m[i]).toString(16)).slice(-2); }).join(''); }
  return '#000000';
}

// ---------- IA (proveedor + API key) ----------
var AI_PROVIDERS = {
  backend: { label: 'Servidor (claves del .env)', style: 'backend', baseUrl: 'api/ai', model: '', keyHint: 'no necesita clave: usa el servidor' },
  opencode: { label: 'OpenCode Go (tu clave)', style: 'openai', baseUrl: 'https://opencode.ai/zen/go/v1', model: 'qwen3.7-plus', keyHint: 'sk-\u2026' },
  openai: { label: 'OpenAI', style: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyHint: 'sk-\u2026' },
  anthropic: { label: 'Anthropic (Claude)', style: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', keyHint: 'sk-ant-\u2026' },
  xai: { label: 'xAI (Grok)', style: 'openai', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-latest', keyHint: 'xai-\u2026' },
  gemini: { label: 'Google Gemini', style: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash', keyHint: 'AIza\u2026' },
  groq: { label: 'Groq', style: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_\u2026' },
  openrouter: { label: 'OpenRouter', style: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', keyHint: 'sk-or-\u2026' },
  custom: { label: 'Personalizado (OpenAI-compat)', style: 'openai', baseUrl: '', model: '', keyHint: 'clave' },
};
// Esfuerzo de razonamiento (reasoning_effort) — solo lo usan modelos "de razonamiento".
var EFFORT_OPTS = [['', 'Auto'], ['minimal', 'Mínimo'], ['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto']];
function buildEffortSelect(cls) {
  var sel = h('select', { class: cls || 'ai-input', title: 'Esfuerzo de razonamiento (solo en modelos que lo soportan)' });
  EFFORT_OPTS.forEach(function (o) {
    var op = h('option', { value: o[0] }, o[1]);
    if ((ui.ai.effort || '') === o[0]) op.selected = true;
    sel.appendChild(op);
  });
  return sel;
}
function aiConfig() {
  var p = AI_PROVIDERS[ui.ai.provider] || AI_PROVIDERS.openai;
  return {
    style: p.style,
    baseUrl: (ui.ai.baseUrl || p.baseUrl || '').replace(/\/+$/, ''),
    model: ui.ai.model || p.model || (p.style === 'backend' ? BACKEND.defaultModel : ''),
    key: ui.ai.apiKey || '',
  };
}
// ¿Autorizado a usar las CLAVES DEL SERVIDOR (IA/búsqueda del dueño)? Si el
// servidor exige token, solo con el token puesto; el resto usa su propia clave.
function backendAuthOk() { return !BACKEND.tokenRequired || !!(ui && ui.token); }
function searchReady() { return !!(BACKEND.search && backendAuthOk()); }
var NEED_TOKEN_MSG = 'La IA del servidor requiere el TOKEN DE ACCESO (panel de IA → icono de llave). Sin token puedes usar tu propia clave: OpenAI, Gemini, Claude, Groq…';
var NEED_TOKEN_SEARCH = 'La búsqueda web usa las claves del servidor y requiere el token de acceso; sin él, la IA razona sin internet.';
function aiReady() {
  var c = aiConfig();
  if (c.style === 'backend') return !!(BACKEND.ai && backendAuthOk() && c.model);
  return !!(c.key && c.baseUrl && c.model);
}
function aiHandleJSON(r) {
  return r.json().catch(function () { return {}; }).then(function (d) {
    if (!r.ok) { throw new Error((d && d.error && (d.error.message || d.error)) || ('HTTP ' + r.status)); }
    return d;
  });
}
// Cuerpo de petición estilo OpenAI con "esfuerzo" de razonamiento opcional
// (ui.ai.effort). Al activar esfuerzo se omite temperature (los modelos de
// razonamiento suelen rechazarla).
function aiBody(model, messages) {
  var body = { model: model, messages: messages };
  var e = ui.ai && ui.ai.effort;
  if (e && e !== 'auto') body.reasoning_effort = e;
  else body.temperature = 0.7;
  return body;
}
// Extrae el texto de una respuesta estilo OpenAI. Los modelos de razonamiento (deepseek,
// glm, minimax…) a veces dejan la respuesta en `reasoning` o la envuelven en <think>…</think>.
function aiPickContent(d) {
  var m = (d.choices && d.choices[0] && d.choices[0].message) || {};
  var c = m.content || '';
  if (!c && (m.reasoning_content || m.reasoning)) c = m.reasoning_content || m.reasoning;
  return String(c).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
function callAI(messages) {
  var c = aiConfig();
  if (c.style === 'backend') {
    if (!BACKEND.ai) return Promise.reject(new Error('El servidor no tiene IA configurada (.env OPENCODE-API).'));
    if (!backendAuthOk()) return Promise.reject(new Error(NEED_TOKEN_MSG));
    return apiFetch(c.baseUrl || 'api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiBody(c.model || BACKEND.defaultModel, messages)),
    }).then(aiHandleJSON).then(aiPickContent);
  }
  if (!c.key) return Promise.reject(new Error('Configura tu API key en el panel de IA.'));
  if (!c.baseUrl) return Promise.reject(new Error('Falta la URL base del proveedor.'));
  if (!c.model) return Promise.reject(new Error('Indica un modelo.'));
  if (c.style === 'openai') {
    var pickContent = aiPickContent;
    // Muchos proveedores (OpenAI, OpenCode…) bloquean las llamadas directas del navegador
    // por CORS. Si hay servidor, enrutamos por él (proxy /api/ai con tu clave: sin CORS y
    // con User-Agent). Si no, intento directo (funciona con proveedores que permiten CORS).
    // El proxy con tu clave (override) NO exige el token del servidor: basta con
    // que el servidor esté vivo (BACKEND.up), aunque /api/data esté protegido.
    if (BACKEND.up || (typeof SERVER !== 'undefined' && SERVER)) {
      return apiFetch('api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(aiBody(c.model, messages), { override: { baseUrl: c.baseUrl, key: c.key } })),
      }).then(aiHandleJSON).then(pickContent).catch(function (e) {
        // Distingue el token de acceso del servidor (proxy) de tu API key del proveedor.
        if (/No autorizado|token Bearer/i.test((e && e.message) || '')) {
          throw new Error('Falta o es incorrecto el TOKEN DE ACCESO del servidor (no tu API key). Configúralo en el icono de llave → «Token servidor», o usa Claude/Gemini (van directos, sin servidor).');
        }
        throw e;
      });
    }
    return fetch(c.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify(aiBody(c.model, messages)),
    }).then(aiHandleJSON).then(pickContent).catch(function (e) {
      if (e instanceof TypeError) {
        throw new Error('No se pudo llamar directamente a ' + c.baseUrl + ' (probable bloqueo CORS del proveedor). Introduce el «Token servidor» (icono de llave) para enrutarlo por el servidor, o usa Claude/Gemini.');
      }
      throw e;
    });
  }
  if (c.style === 'gemini') {
    var sys = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
    var contents = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });
    var body = { contents: contents };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    return fetch(c.baseUrl + '/models/' + encodeURIComponent(c.model) + ':generateContent?key=' + encodeURIComponent(c.key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(aiHandleJSON).then(function (d) {
      var cand = d.candidates && d.candidates[0];
      return (cand && cand.content && cand.content.parts) ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    });
  }
  if (c.style === 'anthropic') {
    var sysA = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
    var msgs = messages.filter(function (m) { return m.role !== 'system'; }).map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }; });
    return fetch(c.baseUrl + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.model, max_tokens: 1024, system: sysA || undefined, messages: msgs }),
    }).then(aiHandleJSON).then(function (d) {
      return (d.content && d.content.length) ? d.content.map(function (x) { return x.text || ''; }).join('') : '';
    });
  }
  return Promise.reject(new Error('Proveedor no soportado.'));
}
// ---------- Reconocimiento de tinta manuscrita (visión + OCR) ----------
function strokesToCanvas(strokes, scale) {
  scale = scale || 3; // mayor resolución para OCR de escritura manuscrita
  if (!strokes || !strokes.length) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach(function (s) {
    (s.points || []).forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  });
  if (!isFinite(minX)) return null;
  var pad = 28;
  var rawW = maxX - minX + pad * 2;
  var rawH = maxY - minY + pad * 2;
  // Tesseract funciona mejor con imágenes no exageradamente anchas; forzamos un mínimo razonable.
  var w = Math.max(160, Math.ceil(rawW * scale));
  var h = Math.max(80, Math.ceil(rawH * scale));
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  // Filtro de alto contraste para acercar a blanco y negro sin depender de getImageData.
  ctx.filter = 'grayscale(100%) contrast(150%)';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  strokes.forEach(function (s) {
    var pts = s.points || [];
    if (!pts.length) return;
    ctx.beginPath();
    ctx.strokeStyle = '#1a1a1a'; // tinta oscura para OCR, sin importar el color real
    // Trazos algo más gruesos en la imagen de OCR para mejorar detección.
    ctx.lineWidth = Math.max(2, (s.size || 3) * scale * 1.3);
    ctx.globalAlpha = s.tool === 'hi' ? 0.85 : 1;
    pts.forEach(function (p, i) {
      var x = (p.x - minX + pad) * scale, y = (p.y - minY + pad) * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  return { canvas: c, x: minX - pad, y: minY - pad, scale: scale };
}
function callAIVision(prompt, dataUrl) {
  var c = aiConfig();
  if (c.style === 'backend' && !BACKEND.ai) return Promise.reject(new Error('El servidor no tiene IA configurada.'));
  if (c.style === 'backend' && !backendAuthOk()) return Promise.reject(new Error(NEED_TOKEN_MSG));
  if (c.style !== 'backend' && (!c.key || !c.baseUrl)) return Promise.reject(new Error('Configura un proveedor de IA con visión.'));
  var messages = [
    { role: 'system', content: 'Eres un asistente que transcriebe texto manuscrito. Responde ÚNICAMENTE con el texto reconocido, sin comentarios, sin explicaciones, manteniendo saltos de línea si los hay.' },
    { role: 'user', content: [
      { type: 'text', text: prompt || 'Transcribe exactamente el texto manuscrito de la imagen. Si está en español, respeta acentos y mayúsculas.' },
      { type: 'image_url', image_url: { url: dataUrl } }
    ] }
  ];
  if (c.style === 'backend') {
    return apiFetch(c.baseUrl || 'api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiBody(c.model || BACKEND.defaultModel, messages)),
    }).then(aiHandleJSON).then(aiPickContent);
  }
  if (c.style === 'openai') {
    if (BACKEND.up || (typeof SERVER !== 'undefined' && SERVER)) {
      return apiFetch('api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(aiBody(c.model, messages), { override: { baseUrl: c.baseUrl, key: c.key } })),
      }).then(aiHandleJSON).then(aiPickContent);
    }
    return fetch(c.baseUrl + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify(aiBody(c.model, messages)),
    }).then(aiHandleJSON).then(aiPickContent);
  }
  if (c.style === 'gemini') {
    var parts = messages[1].content.map(function (x) {
      if (x.type === 'text') return { text: x.text };
      if (x.type === 'image_url') { var m = x.image_url.url.match(/^data:([^;]+);base64,(.+)$/); if (m) return { inlineData: { mimeType: m[1], data: m[2] } }; }
      return { text: '' };
    });
    return fetch(c.baseUrl + '/models/' + encodeURIComponent(c.model) + ':generateContent?key=' + encodeURIComponent(c.key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: parts }] }),
    }).then(aiHandleJSON).then(function (d) {
      var cand = d.candidates && d.candidates[0];
      return (cand && cand.content && cand.content.parts) ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    });
  }
  if (c.style === 'anthropic') {
    var content = messages[1].content.map(function (x) {
      if (x.type === 'text') return { type: 'text', text: x.text };
      if (x.type === 'image_url') { var m = x.image_url.url.match(/^data:([^;]+);base64,(.+)$/); if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }; }
      return { type: 'text', text: '' };
    });
    return fetch(c.baseUrl + '/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.model, max_tokens: 1024, system: messages[0].content, messages: [{ role: 'user', content: content }] }),
    }).then(aiHandleJSON).then(function (d) {
      return (d.content && d.content.length) ? d.content.map(function (x) { return x.text || ''; }).join('') : '';
    });
  }
  return Promise.reject(new Error('Proveedor no soportado para visión.'));
}
function recognizeInkStrokes(strokes) {
  var scaled = strokesToCanvas(strokes, 2);
  if (!scaled) return Promise.reject(new Error('Sin trazos para reconocer.'));
  var dataUrl = scaled.canvas.toDataURL('image/png');
  function withOCR(e) {
    if (typeof Tesseract === 'undefined') return Promise.reject(new Error('OCR no disponible. Carga Tesseract.js o configura un modelo de visión.'));
    return Tesseract.recognize(scaled.canvas, 'spa', { logger: function () {} }).then(function (r) {
      var txt = (r && r.data && r.data.text || '').trim();
      if (!txt) throw new Error('El OCR no detectó texto.');
      return { text: txt, via: 'ocr' };
    });
  }
  if (aiReady() && (ui.ai.provider === 'backend' || ui.ai.provider === 'openai' || ui.ai.provider === 'opencode' || ui.ai.provider === 'gemini' || ui.ai.provider === 'anthropic')) {
    return callAIVision(null, dataUrl).then(function (text) {
      text = (text || '').trim();
      if (text) return { text: text, via: 'ai' };
      return withOCR();
    }).catch(function (e) {
      return withOCR(e);
    });
  }
  return withOCR();
}
function recognizeSelectedInk() {
  var sel = (data.inks || []).filter(function (s) { return s.noteId === ui.currentNoteId && s.selected; });
  if (!sel.length) { toast('Selecciona trazos con la herramienta Lazo primero.', 'warn'); return; }
  toast('Reconociendo tinta…', 'ok');
  recognizeInkStrokes(sel).then(function (res) {
    var text = res.text;
    if (!text) { toast('No se reconoció texto.', 'warn'); return; }
    var b = addBlock(ui.currentNoteId, 'freetext', sel[0].points[0].x, sel[0].points[0].y);
    b.content.text = text;
    b.content.style = defaultFreeStyle();
    touchNote(b.noteId); logChange('Tinta convertida a texto (' + res.via + ')', snippet(text)); save();
    renderCanvas();
    var el = cardEl(b.id);
    if (el) { el.classList.add('selected'); selectedIds[b.id] = true; refreshSelectionUI(); }
    toast('Texto reconocido (' + (res.via === 'ai' ? 'IA' : 'OCR') + '): ' + snippet(text), 'ok');
  }).catch(function (e) {
    toast('No se pudo reconocer: ' + ((e && e.message) || e), 'warn');
  });
}

// ---------- Búsqueda web (Tavily, vía servidor) ----------
function webSearch(query, opts) {
  if (!BACKEND.search) return Promise.reject(new Error('El servidor no tiene búsqueda web (.env TAVILY).'));
  if (!backendAuthOk()) return Promise.reject(new Error(NEED_TOKEN_SEARCH));
  var body = { query: query, max_results: 5, search_depth: 'basic', include_answer: true };
  if (opts) Object.keys(opts).forEach(function (k) { body[k] = opts[k]; });
  return apiFetch('api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(aiHandleJSON);
}
// Respuesta + fuentes de Tavily como Markdown (respaldo si la IA no está disponible).
function webResultsMd(res) {
  var results = (res && res.results) || [];
  return (res && res.answer ? ('**Respuesta:** ' + res.answer + '\n\n') : '') +
    (results.length ? ('**Fuentes:**\n' + results.map(function (r, i) { return (i + 1) + '. [' + (r.title || r.url) + '](' + r.url + ')'; }).join('\n')) : '');
}
// Busca en internet y, si hay IA disponible, redacta una respuesta citando fuentes.
function aiWebSearch(query) {
  query = (query || '').trim();
  if (!query) { pushAIMsg('system-note', 'Escribe primero qué quieres buscar.'); return; }
  if (!searchReady()) { pushAIMsg('system-note', BACKEND.search ? NEED_TOKEN_SEARCH : 'El servidor no tiene búsqueda web. Configura TAVILY en el archivo .env.'); return; }
  pushAIMsg('user', '🌐 Buscar en internet: ' + query);
  var log = aiLogEl();
  var thinking = h('div', { class: 'ai-msg bot thinking' }, 'Buscando en internet…');
  if (log) { log.appendChild(thinking); log.scrollTop = log.scrollHeight; }
  webSearch(query).then(function (res) {
    if (thinking.parentNode) thinking.remove();
    var results = (res && res.results) || [];
    if (!results.length && !(res && res.answer)) { pushAIMsg('system-note', 'Sin resultados para esa búsqueda.'); return; }
    if (!aiReady()) {
      // Sin IA: muestra directamente la respuesta rápida y las fuentes.
      pushAIMsg('assistant', webResultsMd(res) || '(sin resultados)');
      return;
    }
    var ctx = results.map(function (r, i) { return '[' + (i + 1) + '] ' + (r.title || '') + '\n' + r.url + '\n' + (r.content || ''); }).join('\n\n');
    var quick = res.answer ? ('Respuesta rápida del buscador: ' + res.answer + '\n\n') : '';
    var thinking2 = h('div', { class: 'ai-msg bot thinking' }, 'Redactando respuesta con fuentes…');
    if (log) { log.appendChild(thinking2); log.scrollTop = log.scrollHeight; }
    callAI([
      { role: 'system', content: 'Respondes usando resultados de búsqueda web. Responde en el idioma del usuario, en Markdown breve, y cita las fuentes relevantes como [n](url). No inventes datos que no aparezcan en los resultados.' },
      { role: 'user', content: 'Pregunta: ' + query + '\n\n' + quick + 'Resultados:\n' + ctx },
    ]).then(function (text) {
      if (thinking2.parentNode) thinking2.remove();
      pushAIMsg('assistant', text || webResultsMd(res) || '(respuesta vacía)');
    }).catch(function (e) {
      if (thinking2.parentNode) thinking2.remove();
      // Si la IA falla (p. ej. OpenCode sin créditos), mostramos igualmente la búsqueda.
      var fb = webResultsMd(res);
      if (fb) { pushAIMsg('assistant', fb); pushAIMsg('system-note', 'La redacción con IA no está disponible (' + ((e && e.message) || e) + '); te muestro el resultado de la búsqueda.'); }
      else pushAIMsg('system-note', 'Error de IA: ' + ((e && e.message) || e));
    });
  }).catch(function (e) {
    if (thinking.parentNode) thinking.remove();
    pushAIMsg('system-note', 'Error de búsqueda: ' + ((e && e.message) || e));
  });
}
function aiWebSearchFromInput() {
  var o = document.getElementById('aiOverlay');
  var ta = o ? o.querySelector('.ai-textarea') : null;
  var q = ta ? ta.value.trim() : '';
  if (ta) ta.value = '';
  aiWebSearch(q);
}
// Busca en internet a partir del contenido de un bloque y crea un bloque enlazado
// con el resumen y las fuentes (usa la IA si está disponible, si no lista las fuentes).
function aiWebSearchBlock(b) {
  if (!searchReady()) { toast(BACKEND.search ? NEED_TOKEN_SEARCH : 'El servidor no tiene búsqueda web (configura TAVILY en .env).', 'warn'); return; }
  var text = aiBlockText(b).trim();
  if (!text) { toast('El bloque no tiene texto que buscar.', 'warn'); return; }
  var query = text.replace(/\s+/g, ' ').slice(0, 200);
  var el = cardEl(b.id); if (el) el.classList.add('ai-busy');
  toast('Buscando en internet sobre este bloque…');
  function place(md) {
    if (el) el.classList.remove('ai-busy');
    var t = now();
    var nb = {
      id: uid(), noteId: b.noteId, type: 'markdown',
      x: b.x + (b.width || 260) + 56, y: b.y,
      width: 420, height: 320,
      content: { text: md },
      createdAt: t, updatedAt: t,
    };
    data.blocks.push(nb);
    data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: nb.id, createdAt: t });
    touchNote(b.noteId);
    logChange('IA: búsqueda web sobre bloque', snippet(query));
    save();
    renderCanvas();
    cardEnterAnim(cardEl(nb.id));
    focusBlock(nb.id);
    toast('Resultados web añadidos y enlazados al bloque.', 'ok');
  }
  webSearch(query, { max_results: 6 }).then(function (res) {
    var results = (res && res.results) || [];
    if (!results.length && !(res && res.answer)) { if (el) el.classList.remove('ai-busy'); toast('Sin resultados para este bloque.', 'warn'); return; }
    var ctx = results.map(function (r, i) { return '[' + (i + 1) + '] ' + (r.title || '') + '\n' + r.url + '\n' + (r.content || ''); }).join('\n\n');
    if (!aiReady()) {
      place('### Búsqueda web\n\n' + (res.answer ? ('**Resumen:** ' + res.answer + '\n\n') : '') +
        results.map(function (r, i) { return (i + 1) + '. [' + (r.title || r.url) + '](' + r.url + ')'; }).join('\n'));
      return;
    }
    callAI([
      { role: 'system', content: 'Respondes usando resultados de búsqueda web. Usa el idioma del contenido, Markdown breve, y cita fuentes como [n](url). No inventes datos que no aparezcan en los resultados.' },
      { role: 'user', content: 'Contenido del bloque:\n"' + text.slice(0, 1500) + '"\n\nBusca y resume lo relevante de internet sobre ello. ' + (res.answer ? ('Respuesta rápida del buscador: ' + res.answer + '\n\n') : '') + 'Resultados:\n' + ctx },
    ]).then(function (out) {
      place('### Búsqueda web\n\n' + (out || webResultsMd(res)));
    }).catch(function () {
      // Sin IA (p. ej. OpenCode sin créditos): igualmente creamos el bloque con lo de Tavily.
      place('### Búsqueda web\n\n' + webResultsMd(res));
    });
  }).catch(function (e) {
    if (el) el.classList.remove('ai-busy');
    toast('Búsqueda: ' + ((e && e.message) || e), 'warn');
  });
}
// ---------- Imágenes: buscar (Tavily) o generar (backend /api/image) ----------
function imageSearchWeb(prompt) {
  if (!BACKEND.search) return Promise.reject(new Error('El servidor no tiene búsqueda web (.env TAVILY).'));
  if (!backendAuthOk()) return Promise.reject(new Error(NEED_TOKEN_SEARCH));
  return apiFetch('api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: prompt, max_results: 8, include_images: true, include_image_descriptions: true, search_depth: 'basic', include_answer: false }),
  }).then(aiHandleJSON).then(function (d) {
    return (d.images || []).map(function (im) {
      return typeof im === 'string' ? { url: im, description: '' } : { url: im.url, description: im.description || '' };
    }).filter(function (x) { return x.url; });
  });
}
function imageGenerate(prompt) {
  if (!BACKEND.image) return Promise.reject(new Error('El servidor no tiene generación de imágenes (configura IMAGE_API_KEY en .env).'));
  return apiFetch('api/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }),
  }).then(aiHandleJSON).then(function (d) {
    var it = d.data && d.data[0];
    if (it && it.b64_json) return 'data:image/png;base64,' + it.b64_json;
    if (it && it.url) return it.url;
    throw new Error('Respuesta de imagen vacía.');
  });
}
function currentNoteText() {
  if (!ui.currentNoteId) return '';
  var parts = [];
  blocksOf(ui.currentNoteId).forEach(function (b) {
    var t = b.content && b.content.text;
    if (t) parts.push(t);
    if (b.content && b.content.table && b.content.table.rows) {
      parts.push(b.content.table.rows.map(function (r) { return r.join(' | '); }).join('\n'));
    }
  });
  return parts.join('\n\n').slice(0, 8000);
}
var aiChat = [];
function openAI() {
  closeAI();
  var overlay = h('div', { class: 'overlay', id: 'aiOverlay', onclick: function (e) { if (e.target === overlay) closeAI(); } });
  var panel = h('div', { class: 'log-panel ai-panel' });
  var showSettings = !aiReady();
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('spark'), 'Asistente IA'),
    h('span', { class: 'card-spacer', style: { flex: '1' } }),
    h('button', { class: 'icon-btn', title: 'Configuraci\u00f3n', onclick: function () { settings.classList.toggle('open'); } }, icon('key')),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeAI }, icon('x'))
  );
  // Settings
  var settings = h('div', { class: 'ai-settings' + (showSettings ? ' open' : '') });
  var provSel = h('select', { class: 'ai-input' });
  Object.keys(AI_PROVIDERS).forEach(function (k) {
    var lbl = AI_PROVIDERS[k].label;
    if (k === 'backend' && BACKEND.tokenRequired && !ui.token) lbl += ' — requiere token de acceso';
    var o = h('option', { value: k }, lbl);
    if (ui.ai.provider === k) o.selected = true;
    provSel.appendChild(o);
  });
  var modelList = h('datalist', { id: 'aiModelList' });
  (BACKEND.models || []).forEach(function (m) { modelList.appendChild(h('option', { value: m })); });
  var modelInp = h('input', { class: 'ai-input', list: 'aiModelList', placeholder: 'modelo', value: ui.ai.model || '' });
  var baseInp = h('input', { class: 'ai-input', placeholder: 'URL base (opcional)', value: ui.ai.baseUrl || '' });
  var keyInp = h('input', { class: 'ai-input', type: 'password', placeholder: 'API key', value: ui.ai.apiKey || '' });
  var tokenInp = h('input', { class: 'ai-input', type: 'password', placeholder: 'token del servidor (si aplica)', value: ui.token || '' });
  var effortSel = buildEffortSelect();
  var backendNote = h('p', { class: 'ai-warn' }, 'Usa las claves configuradas en el servidor (.env): no necesitas introducir ninguna API key aqu\u00ed.');
  var keyRow = h('div', { class: 'ai-set-row' }, h('label', {}, 'API key'), keyInp);
  var baseRow = h('div', { class: 'ai-set-row' }, h('label', {}, 'URL base'), baseInp);
  function syncHints() {
    var pk = provSel.value;
    var p = AI_PROVIDERS[pk] || AI_PROVIDERS.openai;
    var isBackend = pk === 'backend';
    modelInp.placeholder = isBackend ? (BACKEND.defaultModel || 'modelo del servidor') : (p.model || 'modelo');
    baseInp.placeholder = p.baseUrl || 'URL base';
    keyInp.placeholder = p.keyHint || 'API key';
    keyInp.disabled = isBackend;
    baseInp.disabled = isBackend;
    keyRow.style.opacity = isBackend ? '0.5' : '';
    baseRow.style.opacity = isBackend ? '0.5' : '';
    backendNote.style.display = isBackend ? '' : 'none';
  }
  provSel.addEventListener('change', function () { syncHints(); });
  var saveBtn = h('button', { class: 'ai-save-btn', onclick: function () {
    ui.ai.provider = provSel.value;
    ui.ai.model = modelInp.value.trim();
    ui.ai.baseUrl = baseInp.value.trim();
    ui.ai.apiKey = keyInp.value.trim();
    ui.ai.effort = effortSel.value;
    if (tokenInp.value.trim()) ui.token = tokenInp.value.trim();  // no borrar un token válido por accidente
    save();
    settings.classList.remove('open');
    renderTopbar();
    // Al cambiar el token puede habilitarse el backend protegido: reconecta y refresca.
    loadBackendConfig(function () { if (typeof SERVER !== 'undefined' && !SERVER) serverLoad(function () { renderAll(); }); });
    pushAIMsg('system-note', aiReady() ? 'Configuraci\u00f3n guardada. \u00a1Listo para chatear!' : 'Faltan datos de configuraci\u00f3n.');
  } }, 'Guardar');
  var testBtn = h('button', { class: 'ai-test-btn', title: 'Env\u00eda un mensaje de prueba para validar el proveedor y la clave', onclick: function () {
    ui.ai.provider = provSel.value; ui.ai.model = modelInp.value.trim(); ui.ai.baseUrl = baseInp.value.trim(); ui.ai.apiKey = keyInp.value.trim(); ui.ai.effort = effortSel.value; if (tokenInp.value.trim()) ui.token = tokenInp.value.trim();
    save(); renderTopbar();
    aiTestConnection();
  } }, 'Probar');
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Proveedor'), provSel));
  settings.appendChild(backendNote);
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Modelo'), modelInp, modelList));
  settings.appendChild(baseRow);
  settings.appendChild(keyRow);
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Esfuerzo'), effortSel));
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Token servidor'), tokenInp));
  settings.appendChild(h('p', { class: 'ai-warn' }, 'Las claves y el token se guardan en este navegador (localStorage). No los uses en equipos compartidos.'));
  settings.appendChild(h('div', { class: 'ai-btn-row' }, testBtn, saveBtn));
  syncHints();
  // Barra rápida: modelo + esfuerzo, sin abrir ajustes. Se muestra con cualquier proveedor.
  var modelBar = null;
  var provStyle = (AI_PROVIDERS[ui.ai.provider] || {}).style;
  // El desplegable de modelos aplica al servidor y a "OpenCode Go (tu clave)": mismos modelos.
  var useModelList = (ui.ai.provider === 'backend' || ui.ai.provider === 'opencode') && (BACKEND.models || []).length;
  if (provStyle !== 'gemini' && provStyle !== 'anthropic') {
    var modelCtl;
    if (useModelList) {
      var curModel = ui.ai.model || (AI_PROVIDERS[ui.ai.provider] || {}).model || BACKEND.defaultModel;
      modelCtl = h('select', { class: 'ai-model-sel', title: 'Modelo de IA' });
      BACKEND.models.forEach(function (m) {
        var o = h('option', { value: m }, m);
        if (curModel === m) o.selected = true;
        modelCtl.appendChild(o);
      });
      modelCtl.addEventListener('change', function () { ui.ai.model = modelCtl.value; save(); pushAIMsg('system-note', 'Modelo activo: ' + modelCtl.value); });
    } else {
      // Proveedor con clave propia: campo editable (no tenemos su lista de modelos).
      modelCtl = h('input', { class: 'ai-model-sel', title: 'Modelo', placeholder: (AI_PROVIDERS[ui.ai.provider] || {}).model || 'modelo', value: ui.ai.model || '' });
      modelCtl.addEventListener('change', function () { ui.ai.model = modelCtl.value.trim(); save(); });
    }
    var effBar = buildEffortSelect('ai-effort-sel');
    effBar.addEventListener('change', function () { ui.ai.effort = effBar.value; save(); });
    modelBar = h('div', { class: 'ai-model-bar' }, icon('spark'), h('span', { class: 'ai-model-lbl' }, 'Modelo'), modelCtl, h('span', { class: 'ai-model-lbl' }, 'Esfuerzo'), effBar);
  }
  // Chat
  var log = h('div', { class: 'ai-log' });
  var quick = h('div', { class: 'ai-quick' },
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Resume la siguiente nota en vi\u00f1etas claras y breves:\n\n' + currentNoteText(), 'Resumir nota'); } }, 'Resumir nota'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Sugiere 5 ideas o siguientes pasos a partir de esta nota:\n\n' + currentNoteText(), 'Ideas'); } }, 'Ideas'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Analiza esta nota y extrae de 3 a 5 insights NO obvios: patrones, implicaciones, riesgos y conexiones entre las ideas. Cada insight en negrita con una explicación corta:\n\n' + currentNoteText(), 'Insights de la nota'); } }, 'Insights'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Extrae de esta nota una lista de próximos pasos accionables en Markdown con casillas "- [ ]", ordenados por impacto:\n\n' + currentNoteText(), 'Accionables'); } }, 'Accionables'),
    h('button', { class: 'ai-chip', title: 'Sugiere y aplica un título para la nota actual', onclick: aiSuggestTitle }, 'Título'),
    h('button', { class: 'ai-chip', title: 'Convierte la nota en un diagrama de flujo (Mermaid)', onclick: aiNoteFlowchart }, '🔀 Flujograma'),
    h('button', { class: 'ai-chip', title: 'Busca en internet lo que escribas abajo (Tavily)', onclick: aiWebSearchFromInput }, '🌐 Buscar')
  );
  var input = h('textarea', { class: 'ai-textarea', placeholder: 'Escribe tu mensaje\u2026 (Enter env\u00eda, Shift+Enter salto)' });
  var sendBtn = h('button', { class: 'ai-send-btn', title: 'Enviar', onclick: function () { var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } }, icon('send'));
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } });
  var inbar = h('div', { class: 'ai-inbar' }, input, sendBtn);
  var body = h('div', { class: 'log-body ai-body' }, settings, modelBar, log, quick, inbar);
  panel.appendChild(head); panel.appendChild(body);
  overlay.appendChild(panel); document.body.appendChild(overlay);
  panel._log = log;
  aiChat.forEach(function (m) { renderAIMsg(log, m.role, m.content); });
  if (!aiChat.length) pushAIMsg('assistant', aiReady() ? '\u00a1Hola! Preg\u00fantame o usa una acci\u00f3n r\u00e1pida.' : 'Configura tu proveedor y API key (icono de llave) para empezar.');
  document.addEventListener('keydown', escCloseAI);
  setTimeout(function () { input.focus(); }, 30);
}
function aiLogEl() { var o = document.getElementById('aiOverlay'); return o ? o.querySelector('.ai-log') : null; }
function renderAIMsg(log, role, content) {
  if (!log) return;
  var cls = role === 'user' ? 'ai-msg user' : (role === 'system-note' ? 'ai-msg note' : 'ai-msg bot');
  var msg = h('div', { class: cls });
  if (role === 'assistant') { msg.innerHTML = renderMarkdown(content); msg.classList.add('md-render'); }
  else msg.textContent = content;
  if (role === 'assistant') {
    var ins = h('button', { class: 'ai-insert', title: 'Insertar como nota en el tablero', onclick: function () { insertAINote(content); } }, 'Insertar');
    msg.appendChild(ins);
  }
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}
function pushAIMsg(role, content) { if (role !== 'system-note') aiChat.push({ role: role, content: content }); renderAIMsg(aiLogEl(), role, content); }
function aiAsk(prompt, label) {
  if (!aiReady()) { pushAIMsg('system-note', 'Primero configura tu API key (icono de llave).'); return; }
  pushAIMsg('user', label ? (label + ' \u2192 ' + snippet(prompt)) : prompt);
  var thinking = h('div', { class: 'ai-msg bot thinking' }, 'Pensando\u2026');
  var log = aiLogEl(); if (log) { log.appendChild(thinking); log.scrollTop = log.scrollHeight; }
  var msgs = [{ role: 'system', content: 'Eres un asistente conciso y \u00fatil dentro de tuNota, una app de notas. Responde en el idioma del usuario, usando Markdown breve.' }]
    .concat(aiChat.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-8));
  // Reemplaza el \u00faltimo user por el prompt real (por si venia con label)
  msgs[msgs.length - 1] = { role: 'user', content: prompt };
  callAI(msgs).then(function (text) {
    if (thinking.parentNode) thinking.remove();
    pushAIMsg('assistant', text || '(respuesta vac\u00eda)');
  }).catch(function (e) {
    if (thinking.parentNode) thinking.remove();
    pushAIMsg('system-note', 'Error: ' + ((e && e.message) || e));
  });
}
function insertAINote(text) {
  var b = quickCreate('text');
  if (!b) { closeAI(); return; }
  b.content = b.content || {}; b.content.text = text;
  touchNote(b.noteId); logChange('Nota de IA insertada', snippet(text)); save();
  var el = cardEl(b.id); if (el) { var ta = el.querySelector('.card-ta'); if (ta) ta.value = text; }
  closeAI();
}
// Genera un flujograma (Mermaid) a partir de toda la nota actual y lo pone en el lienzo.
function aiNoteFlowchart() {
  if (!aiReady()) { openAI(); return; }
  var body = currentNoteText();
  if (!body.trim()) { toast('La nota no tiene contenido para diagramar.', 'warn'); return; }
  toast('Generando flujograma de la nota…');
  callAI([
    { role: 'system', content: 'Devuelves SOLO código Mermaid válido, sin explicaciones ni fences de Markdown.' },
    { role: 'user', content: 'Genera un diagrama de flujo (empezando por "flowchart TD") que represente el proceso o las ideas de esta nota:\n\n' + body },
  ]).then(function (code) {
    code = String(code || '').replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!code) { toast('La IA devolvió una respuesta vacía.', 'warn'); return; }
    if (!/^(flowchart|graph)\b/i.test(code)) code = 'flowchart TD\n' + code;
    var b = quickCreate('mermaid');
    if (!b) { closeAI(); return; }
    b.content = b.content || {}; b.content.text = code; b.width = 460; b.height = 340;
    touchNote(b.noteId); logChange('IA: flujograma de la nota', snippet(code)); save();
    renderCanvas(); focusBlock(b.id);
    toast('Flujograma de la nota creado.', 'ok');
    closeAI();
  }).catch(function (e) { toast('IA: ' + ((e && e.message) || e), 'warn'); });
}
function escCloseAI(e) { if (e.key === 'Escape') closeAI(); }
function closeAI() { var o = document.getElementById('aiOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseAI); }
// Prueba la conexión con el proveedor/clave actuales (envía un mensaje mínimo).
function aiTestConnection() {
  var lbl = (AI_PROVIDERS[ui.ai.provider] || {}).label || ui.ai.provider;
  if (!aiReady()) { pushAIMsg('system-note', 'Completa proveedor, modelo y API key antes de probar.'); return; }
  pushAIMsg('system-note', 'Probando conexión con ' + lbl + ' (modelo ' + (ui.ai.model || (AI_PROVIDERS[ui.ai.provider] || {}).model || '') + ')…');
  callAI([{ role: 'user', content: 'Responde solo con la palabra: OK' }]).then(function (t) {
    pushAIMsg('system-note', '✅ Conexión correcta con ' + lbl + '. Respuesta: ' + (String(t || '').trim().slice(0, 60) || '(vacía)'));
  }).catch(function (e) {
    pushAIMsg('system-note', '❌ No se pudo conectar con ' + lbl + ': ' + ((e && e.message) || e));
  });
}

// ---------- IA sobre bloques (mejorar, resumir, insights…) ----------
var AI_BLOCK_ACTIONS = [
  {
    key: 'improve', label: '✍️ Mejorar redacción', mode: 'replace',
    prompt: 'Reescribe el siguiente texto mejorando claridad, estructura y estilo. Mantén el idioma original, el significado y el nivel de detalle; conserva listas y saltos de línea cuando ayuden. Devuelve SOLO el texto reescrito, sin comentarios.',
  },
  {
    key: 'summary', label: '📝 Resumir', mode: 'insert', title: 'Resumen',
    prompt: 'Resume el siguiente texto en viñetas breves y fieles (máximo 6). Mantén el idioma original. Devuelve solo el resumen en Markdown.',
  },
  {
    key: 'insights', label: '💡 Insights', mode: 'insert', title: 'Insights',
    prompt: 'Analiza el siguiente texto y extrae de 3 a 5 insights NO obvios: patrones, implicaciones, riesgos, conexiones con otras ideas y preguntas que valga la pena hacerse. Mantén el idioma original. Devuelve Markdown con viñetas, cada insight en negrita seguido de una explicación corta.',
  },
  {
    key: 'expand', label: '🌱 Expandir', mode: 'insert', title: 'Desarrollo',
    prompt: 'Desarrolla la siguiente idea: contexto necesario, ejemplos concretos y posibles direcciones. Sé útil y específico, no genérico. Mantén el idioma original. Devuelve Markdown breve y bien estructurado.',
  },
  {
    key: 'actions', label: '✅ Accionables', mode: 'insert', title: 'Próximos pasos',
    prompt: 'Extrae del siguiente texto una lista de próximos pasos accionables (verbo + objeto, una línea cada uno), ordenados por impacto. Mantén el idioma original. Devuelve solo la lista en Markdown con casillas "- [ ]".',
  },
  {
    key: 'format', label: '🧹 Formatear', mode: 'replace',
    prompt: 'Da formato claro a este texto: sepáralo en párrafos, añade viñetas "- " o numeración "1." donde ayude y deja líneas en blanco entre ideas. NO cambies el significado ni el idioma; solo mejora la estructura y la legibilidad. Devuelve SOLO el texto formateado.',
  },
  {
    key: 'list', label: '🔢 Enumerar', mode: 'replace',
    prompt: 'Convierte este texto en una lista numerada (1., 2., 3.…) clara y concisa con los puntos clave, en el idioma original. Devuelve SOLO la lista.',
  },
  {
    key: 'flowchart', label: '🔀 Flujograma', mode: 'mermaid',
    prompt: 'Convierte el siguiente texto en un diagrama de flujo. Devuelve SOLO código Mermaid válido que empiece por "flowchart TD" (usa nodos [] para pasos y {} para decisiones con ramas Sí/No). Sin explicaciones ni fences de Markdown.',
  },
];
function aiBlockText(b) {
  var c = b.content || {};
  if (c.table && c.table.rows) return c.table.rows.map(function (r) { return r.join(' | '); }).join('\n');
  return c.text || '';
}
function aiCanActOn(b) {
  if (typeof featureOn === 'function' && !featureOn('ai')) return false;
  if (['text', 'idea', 'freetext', 'markdown', 'table'].indexOf(b.type) < 0) return false;
  return !!aiBlockText(b).trim();
}
function aiBlockAction(b, action) {
  if (!aiReady()) { openAI(); return; }
  var el = cardEl(b.id);
  if (el) el.classList.add('ai-busy');
  var text = aiBlockText(b).slice(0, 8000);
  var msgs = [
    { role: 'system', content: 'Eres el asistente de escritura de tuNota. Sigues instrucciones al pie de la letra y respondes solo con el resultado pedido.' },
    { role: 'user', content: action.prompt + '\n\n---\n\n' + text },
  ];
  callAI(msgs).then(function (result) {
    if (el) el.classList.remove('ai-busy');
    result = (result || '').trim();
    if (!result) { toast('La IA devolvió una respuesta vacía.', 'warn'); return; }
    if (action.mode === 'mermaid') {
      // Genera un bloque Mermaid (flujograma) enlazado a la fuente.
      var code = result.replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      if (!/^(flowchart|graph)\b/i.test(code)) code = 'flowchart TD\n' + code;
      var tm = now();
      var mb = {
        id: uid(), noteId: b.noteId, type: 'mermaid',
        x: b.x + (b.width || 260) + 56, y: b.y, width: 460, height: 340,
        content: { text: code }, createdAt: tm, updatedAt: tm,
      };
      data.blocks.push(mb);
      data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: mb.id, createdAt: tm });
      touchNote(b.noteId);
      logChange('IA: flujograma generado', snippet(code));
      save();
      renderCanvas();
      cardEnterAnim(cardEl(mb.id));
      focusBlock(mb.id);
      toast('Flujograma creado junto al bloque.', 'ok');
    } else if (action.mode === 'replace') {
      pushUndo('IA: ' + (action.label || 'transformar texto'));
      b.content = b.content || {};
      b.content.text = result;
      touchNote(b.noteId);
      logChange('IA: ' + (action.label || 'texto') + ' aplicado', snippet(result));
      save();
      renderCanvas();
      toast('Hecho (Ctrl+Z para deshacer).', 'ok');
    } else {
      var t = now();
      var nb = {
        id: uid(), noteId: b.noteId, type: 'markdown',
        x: b.x + (b.width || 260) + 56, y: b.y,
        width: 400, height: Math.max(240, Math.min(420, (b.height || 240))),
        content: { text: '### ' + action.title + '\n\n' + result },
        createdAt: t, updatedAt: t,
      };
      data.blocks.push(nb);
      data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: nb.id, createdAt: t });
      touchNote(b.noteId);
      logChange('IA: ' + action.title.toLowerCase() + ' generado', snippet(aiBlockText(b)));
      save();
      renderCanvas();
      cardEnterAnim(cardEl(nb.id));
      focusBlock(nb.id);
      toast(action.title + ' añadido junto al bloque, enlazado a la fuente.', 'ok');
    }
  }).catch(function (e) {
    if (el) el.classList.remove('ai-busy');
    toast('IA: ' + ((e && e.message) || e), 'warn');
  });
}

// Combina los bloques seleccionados en una síntesis enlazada a todas las fuentes.
function aiSynthesizeSelection() {
  if (!aiReady()) { openAI(); return; }
  var blocks = Object.keys(selectedIds).map(function (id) {
    return data.blocks.find(function (x) { return x.id === id; });
  }).filter(function (b) { return b && aiCanActOn(b); });
  if (blocks.length < 2) { toast('Selecciona al menos 2 bloques con texto.', 'warn'); return; }
  var parts = blocks.map(function (b, i) { return '[Bloque ' + (i + 1) + ']\n' + aiBlockText(b); });
  toast('Sintetizando ' + blocks.length + ' bloques…');
  blocks.forEach(function (b) { var el = cardEl(b.id); if (el) el.classList.add('ai-busy'); });
  function clearBusy() { blocks.forEach(function (b) { var el = cardEl(b.id); if (el) el.classList.remove('ai-busy'); }); }
  callAI([
    { role: 'system', content: 'Eres el asistente de síntesis de tuNota. Combinas varias notas en una síntesis fiel, clara y accionable, sin inventar información.' },
    { role: 'user', content: 'Sintetiza estos ' + blocks.length + ' bloques en un solo texto: idea central, puntos en común, tensiones o contradicciones y conclusión. Mantén el idioma original. Devuelve Markdown breve.\n\n' + parts.join('\n\n').slice(0, 9000) },
  ]).then(function (result) {
    clearBusy();
    result = (result || '').trim();
    if (!result) { toast('La IA devolvió una respuesta vacía.', 'warn'); return; }
    var t = now();
    var maxX = -Infinity, minY = Infinity;
    blocks.forEach(function (b) { maxX = Math.max(maxX, b.x + (b.width || 260)); minY = Math.min(minY, b.y); });
    var nb = {
      id: uid(), noteId: blocks[0].noteId, type: 'markdown',
      x: Math.round(maxX + 64), y: Math.round(minY),
      width: 420, height: 320,
      content: { text: '### Síntesis\n\n' + result },
      createdAt: t, updatedAt: t,
    };
    data.blocks.push(nb);
    blocks.forEach(function (b) {
      data.links.push({ id: uid(), noteId: nb.noteId, a: b.id, b: nb.id, createdAt: t });
    });
    touchNote(nb.noteId);
    logChange('IA: síntesis de ' + blocks.length + ' bloques', snippet(result));
    save();
    renderCanvas();
    cardEnterAnim(cardEl(nb.id));
    focusBlock(nb.id);
    toast('Síntesis creada, enlazada a los ' + blocks.length + ' bloques.', 'ok');
  }).catch(function (e) {
    clearBusy();
    toast('IA: ' + ((e && e.message) || e), 'warn');
  });
}
// Sugiere y aplica un título para la nota actual a partir de su contenido.
function aiSuggestTitle() {
  if (!aiReady()) { openAI(); return; }
  var note = ui.currentNoteId && getNote(ui.currentNoteId);
  if (!note) { toast('Abre una nota primero.', 'warn'); return; }
  var body = currentNoteText();
  if (!body.trim()) { toast('La nota aún no tiene contenido.', 'warn'); return; }
  callAI([
    { role: 'system', content: 'Devuelves SOLO un título corto (máximo 6 palabras), sin comillas ni punto final, en el idioma del contenido.' },
    { role: 'user', content: 'Título para esta nota:\n\n' + body },
  ]).then(function (title) {
    title = (title || '').replace(/^["“”']+|["“”'.]+$/g, '').trim();
    if (!title) { toast('La IA devolvió una respuesta vacía.', 'warn'); return; }
    var old = note.title;
    note.title = title.slice(0, 80);
    note.updatedAt = now();
    logChange('IA: título de nota', old + ' → ' + note.title);
    save();
    renderTopbar();
    renderSidebar();
    pushAIMsg('system-note', 'Título aplicado: “' + note.title + '” (antes: “' + old + '”). Edítalo con F2 si no encaja.');
  }).catch(function (e) {
    pushAIMsg('system-note', 'Error: ' + ((e && e.message) || e));
  });
}

// ---------- Puerta de acceso por token (para instancias protegidas) ----------
// Aparece al entrar cuando el servidor exige token y aún no estamos autenticados
// (típico en la app desplegada). En local, el token se auto-rellena y no aparece.
function closeTokenGate() { var g = document.getElementById('tokenGate'); if (g) g.remove(); }
function showTokenGate() {
  if (document.getElementById('tokenGate')) return;
  var overlay = h('div', { class: 'overlay token-gate', id: 'tokenGate' });
  var input = h('input', { class: 'gate-input', type: 'text', placeholder: 'Pega aquí tu token de acceso', autocomplete: 'off', spellcheck: 'false' });
  input.value = ui.token || '';
  var msg = h('div', { class: 'gate-msg' });
  var btn = h('button', { class: 'gate-btn' }, 'Entrar');
  function submit() {
    var v = input.value.trim();
    if (!v) { msg.className = 'gate-msg err'; msg.textContent = 'Introduce el token que te compartieron.'; return; }
    ui.token = v; writeLS(LS_UI, JSON.stringify(ui));
    btn.disabled = true; msg.className = 'gate-msg'; msg.textContent = 'Comprobando…';
    loadBackendConfig(function () {
      serverLoad(function () {
        btn.disabled = false;
        if (typeof SERVER !== 'undefined' && SERVER) {
          closeTokenGate(); renderAll();
          if (typeof toast === 'function') toast('¡Acceso concedido! Ya puedes usar todas las funciones.', 'ok');
          if (typeof maybeAutoTour === 'function') maybeAutoTour();
        } else {
          msg.className = 'gate-msg err'; msg.textContent = 'Token incorrecto. Revisa que lo hayas pegado completo.';
        }
      });
    });
  }
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  var card = h('div', { class: 'gate-card', onmousedown: function (e) { e.stopPropagation(); } },
    h('div', { class: 'gate-ico' }, icon('shield')),
    h('h2', { class: 'gate-title' }, 'Acceso a tuNota'),
    h('p', { class: 'gate-sub' }, 'Esta versión está protegida. Pega el token que te compartieron para empezar a usar todas las funciones.'),
    h('div', { class: 'gate-row' }, input, btn),
    msg,
    h('button', { class: 'gate-skip', onclick: function () { closeTokenGate(); if (typeof maybeAutoTour === 'function') maybeAutoTour(); } }, 'Entrar sin conexión (solo en este navegador)')
  );
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  setTimeout(function () { input.focus(); }, 40);
}
// Decide si mostrar la puerta: solo si el servidor exige token y no logramos entrar.
// Devuelve true si la mostró (para que el arranque no lance el tour por encima).
function maybeShowTokenGate() {
  // En modo público la app entra libre: el token solo habilita la IA/búsqueda del
  // servidor (cada visitante usa su propia clave; nadie gasta las del dueño).
  if (BACKEND.publicMode) return false;
  if (BACKEND.tokenRequired && (typeof SERVER === 'undefined' || !SERVER)) { showTokenGate(); return true; }
  return false;
}

// ---------- Utilidad: extraer JSON de una respuesta de IA ----------
function aiParseJSON(text) {
  var t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  var m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// ---------- Chat flotante del lienzo: planner → agente especializado ----------
// Flujo: 1) el PLANNER lee tu pedido (+ el bloque referenciado) y elige el mejor
// agente con un prompt preciso; 2) el AGENTE ejecuta; 3) el resultado se aplica
// al bloque (o se muestra en el chat si no hay referencia).
var FC_AGENTS = {
  editor: { label: 'Editor de textos', sys: 'Eres un editor de textos experto: mejoras claridad, estructura, ortografía y tono sin cambiar el significado. Devuelve SOLO el texto final, sin comentarios.' },
  game: { label: 'Diseñador de juegos', sys: 'Eres un diseñador de videojuegos senior: mecánicas, loops, progresión, economía y alcance. Respondes concreto y accionable, en Markdown breve.' },
  lean: { label: 'Estratega Lean Startup', sys: 'Eres un estratega de emprendimiento y marketing (Lean Startup): hipótesis, MVP, experimentos, canales y métricas. Markdown breve y accionable.' },
  organizer: { label: 'Organizador', sys: 'Eres un organizador de información: conviertes lo que recibes en estructuras claras (listas numeradas, secciones, pasos). Devuelve SOLO el resultado.' },
  diagram: { label: 'Diagramador', sys: 'Eres experto en Mermaid 11. Devuelves SOLO código Mermaid válido que empieza por "flowchart TD", sin explicaciones ni fences.' },
  general: { label: 'Asistente general', sys: 'Eres un asistente útil y conciso dentro de tuNota. Respondes en el idioma del usuario, en Markdown breve.' },
};
var FC_PLANNER_SYS = 'Eres el planificador de agentes de tuNota. Analiza el pedido del usuario (y el bloque adjunto si lo hay) y elige el MEJOR agente: "editor" (reescribir/corregir/mejorar textos), "game" (diseño de juegos), "lean" (emprendimiento/marketing/negocio), "organizer" (estructurar/enumerar/planificar contenido), "diagram" (flujogramas/diagramas), "general" (lo demás). Escribe también un prompt PRECISO y completo para ese agente (qué hacer exactamente, tono, formato de salida). Devuelve SOLO JSON: {"agent":"...","prompt":"..."}';
var fcRef = null, fcPicking = false;
function fcRefBlock() { return fcRef ? getBlockById(fcRef) : null; }
function toggleFloatChat() {
  var p = document.getElementById('floatChat');
  if (p) { p.remove(); return; }
  var panel = h('div', { class: 'float-chat', id: 'floatChat' });
  panel.appendChild(h('div', { class: 'fc-head' },
    icon('spark'), h('span', { class: 'fc-title' }, 'Chat del lienzo'),
    h('span', { class: 'card-spacer' }),
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: function () { panel.remove(); } }, icon('x'))));
  var refBar = h('div', { class: 'fc-refbar', id: 'fcRefBar' });
  panel.appendChild(refBar);
  panel.appendChild(h('div', { class: 'fc-log', id: 'fcLog' }));
  var input = h('textarea', { class: 'fc-input', placeholder: 'Pide un cambio… p. ej. "resume esto en 3 puntos"' });
  var sendB = h('button', { class: 'fc-send', title: 'Enviar', onclick: function () { var v = input.value.trim(); if (v) { input.value = ''; fcSend(v); } } }, icon('send'));
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var v = input.value.trim(); if (v) { input.value = ''; fcSend(v); } } });
  panel.appendChild(h('div', { class: 'fc-inbar' }, input, sendB));
  document.body.appendChild(panel);
  fcRenderRef();
  fcMsg('note', 'Pulsa 🎯 y haz clic en un bloque para dármelo como referencia; luego dime qué modificarle.');
  setTimeout(function () { input.focus(); }, 30);
}
function fcMsg(kind, text) {
  var log = document.getElementById('fcLog');
  if (!log) return;
  var el = h('div', { class: 'fc-msg ' + kind });
  if (kind === 'bot') { el.innerHTML = renderMarkdown(text); el.classList.add('md-render'); }
  else el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
function fcRenderRef() {
  var bar = document.getElementById('fcRefBar');
  if (!bar) return;
  bar.innerHTML = '';
  var pick = h('button', { class: 'fc-pick' + (fcPicking ? ' on' : ''), title: 'Haz clic aquí y luego en un bloque del lienzo', onclick: fcStartPick }, '🎯 Elegir bloque');
  bar.appendChild(pick);
  var b = fcRefBlock();
  if (b) {
    bar.appendChild(h('span', { class: 'fc-ref-chip', title: aiBlockText(b).slice(0, 200) },
      icon(typeMeta(b.type).icon), (b.title || snippet(aiBlockText(b)) || typeMeta(b.type).label),
      h('button', { class: 'fc-ref-x', onclick: function () { fcSetRef(null); } }, '×')));
  }
}
function fcSetRef(id) {
  var prev = fcRef ? cardEl(fcRef) : null;
  if (prev) prev.classList.remove('fc-linked');
  fcRef = id;
  var el = id ? cardEl(id) : null;
  if (el) el.classList.add('fc-linked');
  fcRenderRef();
}
function fcStartPick() {
  fcPicking = true;
  document.body.classList.add('fc-picking');
  fcRenderRef();
  toast('Haz clic en el bloque que quieres referenciar…');
  var onPick = function (e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    document.removeEventListener('mousedown', onPick, true);
    document.body.classList.remove('fc-picking');
    fcPicking = false;
    if (card && card.getAttribute('data-id')) {
      e.preventDefault(); e.stopPropagation();
      fcSetRef(card.getAttribute('data-id'));
    } else fcRenderRef();
  };
  setTimeout(function () { document.addEventListener('mousedown', onPick, true); }, 30);
}
function fcSend(text) {
  if (!aiReady()) { fcMsg('note', 'Configura la IA primero (panel IA → llave).'); return; }
  var b = fcRefBlock();
  fcMsg('user', (b ? '🔗 ' + (b.title || snippet(aiBlockText(b))) + ' — ' : '') + text);
  fcMsg('note', '🧭 Eligiendo el mejor agente…');
  var ctx = b ? ('\n\nBloque adjunto (' + typeMeta(b.type).label + '):\n"""\n' + aiBlockText(b).slice(0, 4000) + '\n"""') : '';
  callAI([
    { role: 'system', content: FC_PLANNER_SYS },
    { role: 'user', content: 'Pedido: ' + text + ctx },
  ]).then(function (planTxt) {
    var plan = aiParseJSON(planTxt) || { agent: 'general', prompt: text };
    var agent = FC_AGENTS[plan.agent] || FC_AGENTS.general;
    fcMsg('note', '🤝 Agente: ' + agent.label);
    return callAI([
      { role: 'system', content: agent.sys },
      { role: 'user', content: (plan.prompt || text) + ctx },
    ]).then(function (result) {
      result = String(result || '').trim();
      if (!result) { fcMsg('note', 'El agente devolvió una respuesta vacía.'); return; }
      if (b && agent === FC_AGENTS.diagram) {
        var code = result.replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!/^(flowchart|graph)\b/i.test(code)) code = 'flowchart TD\n' + code;
        var t = now();
        var mb = { id: uid(), noteId: b.noteId, type: 'mermaid', x: b.x + (b.width || 260) + 56, y: b.y, width: 460, height: 340, content: { text: code }, createdAt: t, updatedAt: t };
        data.blocks.push(mb);
        data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: mb.id, type: 'flow', createdAt: t });
        touchNote(b.noteId); save(); renderCanvas(); focusBlock(mb.id);
        fcSetRef(b.id);
        fcMsg('bot', 'Flujograma creado junto al bloque. ✔');
      } else if (b && ['text', 'idea', 'freetext', 'markdown'].indexOf(b.type) >= 0) {
        pushUndo('Chat: modificar bloque');
        b.content = b.content || {};
        b.content.text = result;
        touchNote(b.noteId);
        logChange('Chat del lienzo: bloque modificado', snippet(result));
        save(); renderCanvas();
        fcSetRef(b.id);
        fcMsg('bot', 'Aplicado al bloque (Ctrl+Z para deshacer):\n\n' + result.slice(0, 400) + (result.length > 400 ? '…' : ''));
      } else {
        fcMsg('bot', result);
      }
    });
  }).catch(function (e) { fcMsg('note', 'Error: ' + ((e && e.message) || e)); });
}

// ---------- Estructurar una idea con metodología (planner → layout numerado) ----------
var IDEA_METHODS = {
  design_thinking: { label: 'Design Thinking', phases: ['Empatizar', 'Definir', 'Idear', 'Prototipar', 'Testear'] },
  lean_startup: { label: 'Lean Startup', phases: ['Problema y cliente', 'Propuesta de valor / MVP', 'Hipótesis clave', 'Experimentos', 'Métricas', 'Aprender y pivotar'] },
  game_design: { label: 'Game Design', phases: ['Concepto y pilares', 'Mecánicas core', 'Loop de juego', 'Progresión y dificultad', 'Arte y sonido', 'Alcance del MVP'] },
  marketing: { label: 'Marketing', phases: ['Cliente objetivo', 'Propuesta de valor', 'Canales', 'Mensaje', 'Experimentos', 'Métricas'] },
};
function aiStructureIdea(b) {
  if (!aiReady()) { openAI(); return; }
  var ideaText = aiBlockText(b).trim();
  if (!ideaText) { toast('Escribe primero la idea en el bloque.', 'warn'); return; }
  var el = cardEl(b.id); if (el) el.classList.add('ai-busy');
  toast('🧭 Eligiendo metodología…');
  // 1) Planner: clasifica la idea y elige metodología.
  callAI([
    { role: 'system', content: 'Eres el planificador de tuNota. Clasifica la idea y elige la metodología más adecuada: "design_thinking" (proyectos/productos generales), "lean_startup" (emprendimientos/negocios), "game_design" (videojuegos), "marketing" (campañas/crecimiento). Devuelve SOLO JSON: {"method":"...","razon":"una frase"}' },
    { role: 'user', content: 'Idea: ' + ideaText.slice(0, 2000) },
  ]).then(function (planTxt) {
    var plan = aiParseJSON(planTxt) || {};
    var mk = IDEA_METHODS[plan.method] ? plan.method : 'design_thinking';
    var method = IDEA_METHODS[mk];
    toast('🤝 Metodología: ' + method.label + '. Generando fases…');
    // 2) Agente: rellena cada fase de la metodología para ESTA idea.
    return callAI([
      { role: 'system', content: 'Eres un experto en ' + method.label + '. Devuelves SOLO JSON válido, sin fences.' },
      { role: 'user', content: 'Idea: """' + ideaText.slice(0, 2000) + '"""\n\nDesarrolla la idea fase a fase usando EXACTAMENTE estas fases de ' + method.label + ': ' + method.phases.join(', ') + '.\nPara cada fase escribe contenido CONCRETO para esta idea (3-6 viñetas o 2-4 frases, Markdown). Devuelve SOLO JSON: {"steps":[{"title":"<fase>","content":"<markdown>"}]} en el mismo orden.' },
    ]).then(function (genTxt) {
      if (el) el.classList.remove('ai-busy');
      var gen = aiParseJSON(genTxt);
      var steps = (gen && gen.steps) || [];
      if (!steps.length) { toast('La IA no devolvió fases válidas.', 'warn'); return; }
      pushUndo('Estructurar idea');
      var t = now(), created = [], w = el ? el.offsetWidth : (b.width || 240);
      var x0 = b.x + w + 130, y0 = Math.max(0, b.y - 40);
      steps.forEach(function (s, i) {
        var nb = {
          id: uid(), noteId: b.noteId, type: 'markdown',
          x: x0 + (i % 2) * 460, y: y0 + Math.floor(i / 2) * 300,
          width: 420, height: 260,
          title: (i + 1) + '. ' + (s.title || method.phases[i] || 'Fase'),
          content: { text: '### ' + (i + 1) + '. ' + (s.title || '') + '\n\n' + (s.content || '') },
          createdAt: t, updatedAt: t,
        };
        data.blocks.push(nb); created.push(nb);
      });
      data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: created[0].id, type: 'flow', createdAt: t });
      for (var i = 0; i < created.length - 1; i++) data.links.push({ id: uid(), noteId: b.noteId, a: created[i].id, b: created[i + 1].id, type: 'flow', createdAt: t });
      data.groups.push({ id: uid(), noteId: b.noteId, name: method.label + ' — ' + snippet(ideaText).slice(0, 30), color: groupsOf(b.noteId).length % GROUP_COLORS.length, blockIds: created.map(function (x) { return x.id; }), createdAt: t });
      touchNote(b.noteId);
      logChange('Idea estructurada (' + method.label + ')', snippet(ideaText));
      save(); renderCanvas();
      focusBlock(created[0].id);
      toast('Idea estructurada en ' + created.length + ' fases de ' + method.label + ' (agrupadas). ✔', 'ok');
    });
  }).catch(function (e) {
    if (el) el.classList.remove('ai-busy');
    toast('IA: ' + ((e && e.message) || e), 'warn');
  });
}

// ---------- Revisar idea: consulta a un prompt especializado tras analizar el contexto ----------
// Se dispara desde el botón «Revisar idea» del topbar (la lupa). Toma el contexto —el
// bloque de idea/texto seleccionado o, si no hay, el contenido de la nota actual—, lo
// deja editable y lo consulta a un analista especializado (con evidencia web si está
// disponible). El resultado se puede insertar en el lienzo.
function closeIdeaReview() { var o = document.getElementById('ideaRevOverlay'); if (o) o.remove(); }
// Decide qué contexto revisar: bloque seleccionado (idea/texto/markdown) o la nota actual.
function ideaReviewContext() {
  var blk = null;
  var ids = Object.keys(selectedIds || {}).filter(function (id) { return getBlockById(id); });
  if (ids.length === 1) {
    var one = getBlockById(ids[0]);
    if (one && ['idea', 'text', 'freetext', 'markdown'].indexOf(one.type) >= 0) blk = one;
  }
  if (!blk && ui.currentNoteId) {
    var ideas = blocksOf(ui.currentNoteId).filter(function (b) { return b.type === 'idea'; });
    if (ideas.length === 1) blk = ideas[0];
  }
  var text = blk ? ((blk.content && blk.content.text) || '') : currentNoteText();
  return { block: blk, text: (text || '').trim(), fromNote: !blk };
}
// Posición en el mundo (coordenadas del lienzo) del centro de la vista actual.
function centerWorldPos() {
  var wrap = document.getElementById('canvas');
  if (!wrap || typeof toContent !== 'function') return { x: 120, y: 120 };
  var r = wrap.getBoundingClientRect();
  var p = toContent(r.left + r.width / 2, r.top + r.height / 2);
  return { x: Math.max(0, p.x - 200), y: Math.max(0, p.y - 40) };
}
function openIdeaReview(sourceBlock, prefillText) {
  if (!aiReady()) { toast('Configura tu IA (proveedor, clave y modelo) para revisar la idea.', 'warn'); openAI(); return; }
  var ctx = (sourceBlock === undefined && prefillText === undefined)
    ? ideaReviewContext()
    : { block: sourceBlock || null, text: (prefillText != null ? prefillText : (sourceBlock && sourceBlock.content && sourceBlock.content.text) || ''), fromNote: !sourceBlock };
  var srcBlock = ctx.block;
  closeIdeaReview();
  var overlay = h('div', { class: 'overlay', id: 'ideaRevOverlay', onclick: function (e) { if (e.target === overlay) closeIdeaReview(); } });
  var input = h('textarea', { class: 'idea-rev-input', placeholder: 'Escribe o pega la idea a revisar… (se analiza el contexto y se consulta a un prompt especializado)' });
  input.value = ctx.text || '';
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } });
  var runBtn = h('button', { class: 'tour-btn idea-rev-go', onclick: function () { run(); } }, icon('search'), 'Revisar idea');
  var status = h('div', { class: 'idea-rev-status' }); status.style.display = 'none';
  var body = h('div', { class: 'idea-rev-body' });
  var actions = h('div', { class: 'idea-rev-actions' });
  var panel = h('div', { class: 'log-panel idea-rev-panel' },
    h('div', { class: 'log-head' },
      h('div', { class: 'log-title' }, icon('search'), 'Revisar idea'),
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeIdeaReview }, icon('x'))),
    h('div', { class: 'idea-rev-src' }, srcBlock ? 'Contexto: el bloque seleccionado.' : 'Contexto: la nota actual. Edita la idea si quieres.'),
    input,
    h('div', { class: 'idea-rev-run' }, runBtn),
    status, body, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  input.focus();

  function run() {
    var idea = input.value.trim();
    if (!idea) { toast('Escribe la idea a revisar.', 'warn'); input.focus(); return; }
    body.innerHTML = ''; actions.innerHTML = '';
    runBtn.disabled = true;
    status.style.display = '';
    status.textContent = searchReady() ? 'Buscando evidencia en internet…' : 'Analizando con tu IA…';
    var sources = [];
    var pre = searchReady()
      ? webSearch(idea, { max_results: 5, include_answer: true }).then(function (d) {
          sources = (d && d.results) || [];
          return (d && d.answer) || '';
        }).catch(function () { return ''; })
      : Promise.resolve('');
    pre.then(function (webAnswer) {
      status.textContent = 'Analizando la idea con tu IA…';
      var extra = sources.length
        ? '\n\nEvidencia de la web:\n' + sources.map(function (s, i) {
            return '[' + (i + 1) + '] ' + (s.title || '') + ' — ' + String(s.content || '').slice(0, 300) + ' (' + s.url + ')';
          }).join('\n') + (webAnswer ? '\nResumen del buscador: ' + webAnswer : '')
        : '';
      return callAI([
        { role: 'system', content: 'Eres un analista pragmático y honesto que valida ideas en español, sin adular. Primero analiza el contexto que te dan; luego responde SOLO en Markdown con exactamente estas secciones: "## Veredicto" (nota 1-10 y una frase directa), "## Fortalezas" (3 viñetas), "## Riesgos" (3 viñetas), "## Competencia o alternativas" (qué ya existe), "## Cómo validarla barato" (3 pasos concretos para esta semana). ' + (extra ? 'Apóyate en la evidencia de la web y cítala como [n].' : 'No hay búsqueda web disponible: razona con tu conocimiento y dilo en el veredicto.') },
        { role: 'user', content: 'Idea/contexto a validar:\n' + idea + extra },
      ]);
    }).then(function (res) {
      runBtn.disabled = false; status.style.display = 'none';
      var md = String(res || '').trim();
      if (!md) { body.textContent = 'La IA devolvió una respuesta vacía.'; return; }
      if (sources.length) {
        md += '\n\n## Fuentes\n' + sources.map(function (s, i) {
          return (i + 1) + '. [' + (s.title || s.url) + '](' + s.url + ')';
        }).join('\n');
      }
      body.innerHTML = renderMarkdown(md);
      actions.innerHTML = '';
      actions.appendChild(h('button', { class: 'tour-btn', onclick: function () { insertIdeaReview(srcBlock, md); } }, 'Insertar en el lienzo'));
      actions.appendChild(h('button', { class: 'tour-btn ghost', title: 'Crea un bloque Imagen IA, listo para buscar imágenes de la idea', onclick: function () { insertIdeaImages(srcBlock, idea); } }, 'Buscar imágenes'));
    }).catch(function (e) {
      runBtn.disabled = false; status.style.display = 'none';
      body.textContent = 'No se pudo revisar la idea: ' + ((e && e.message) || e);
    });
  }
}
// Inserta el informe como bloque Markdown; si viene de un bloque, lo enlaza.
function insertIdeaReview(sourceBlock, md) {
  var t = now();
  var noteId = sourceBlock ? sourceBlock.noteId : ui.currentNoteId;
  if (!noteId) { toast('Abre una nota para insertar la revisión.', 'warn'); return; }
  var pos = sourceBlock ? { x: sourceBlock.x + (sourceBlock.width || 260) + 56, y: sourceBlock.y } : centerWorldPos();
  var mb = {
    id: uid(), noteId: noteId, type: 'markdown',
    x: pos.x, y: pos.y, width: 430, height: 380,
    content: { text: '# Revisión de la idea\n\n' + md }, createdAt: t, updatedAt: t,
  };
  data.blocks.push(mb);
  if (sourceBlock) data.links.push({ id: uid(), noteId: sourceBlock.noteId, a: sourceBlock.id, b: mb.id, label: 'validación', createdAt: t });
  touchNote(noteId);
  logChange('Idea revisada con IA', snippet(md));
  save();
  renderCanvas();
  closeIdeaReview();
  cardEnterAnim(cardEl(mb.id));
  focusBlock(mb.id);
  toast('Revisión insertada en el lienzo.', 'ok');
}
// Crea un bloque "Imagen IA" precargado con la idea; si viene de un bloque, lo enlaza.
function insertIdeaImages(sourceBlock, idea) {
  var t = now();
  var noteId = sourceBlock ? sourceBlock.noteId : ui.currentNoteId;
  if (!noteId) { toast('Abre una nota para crear el bloque de imágenes.', 'warn'); return; }
  var pos = sourceBlock ? { x: sourceBlock.x, y: sourceBlock.y + (sourceBlock.height || 130) + 56 } : centerWorldPos();
  var ib = {
    id: uid(), noteId: noteId, type: 'aiimage',
    x: pos.x, y: pos.y, width: 320, height: 260,
    content: { prompt: idea.slice(0, 120), mode: 'search', images: [] }, createdAt: t, updatedAt: t,
  };
  data.blocks.push(ib);
  if (sourceBlock) data.links.push({ id: uid(), noteId: sourceBlock.noteId, a: sourceBlock.id, b: ib.id, createdAt: t });
  touchNote(noteId);
  save();
  renderCanvas();
  closeIdeaReview();
  cardEnterAnim(cardEl(ib.id));
  focusBlock(ib.id);
  toast('Bloque de imágenes creado: pulsa Buscar.', 'ok');
}

// ---------- Clasificar + analizar una nota con IA (salida bajo la nota, tipo cURL) ----------
// Construye el panel de análisis que se muestra debajo de la nota (solo si ya hay análisis).
// Cabecera del panel de análisis (robot + título + cerrar).
function noteAnalysisHead(b) {
  return h('div', { class: 'note-analysis-head' },
    h('span', { class: 'note-analysis-robot' }, '🤖'), h('span', { class: 'note-analysis-title' }, 'Análisis IA'),
    h('span', { class: 'card-spacer' }),
    h('button', { class: 'note-analysis-x', title: 'Quitar análisis', onclick: function (e) {
      e.stopPropagation(); b.content.analysis = ''; touchNote(b.noteId); save();
      var p = cardEl(b.id) && cardEl(b.id).querySelector('.note-analysis'); if (p) { p.classList.add('anim-out'); setTimeout(function () { renderCanvas(); }, 180); }
    } }, icon('x')));
}
function buildNoteAnalysis(b) {
  var just = b.content && b.content._justAnalyzed;
  if (just) delete b.content._justAnalyzed;
  var wrap = h('div', { class: 'note-analysis' + (just ? ' anim-in' : '') });
  wrap.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  wrap.addEventListener('wheel', function (e) { e.stopPropagation(); });
  var body = h('div', { class: 'note-analysis-body' });
  body.innerHTML = renderMarkdown(b.content.analysis || '');
  wrap.appendChild(noteAnalysisHead(b));
  wrap.appendChild(body);
  return wrap;
}
// Ejecuta el análisis: muestra al instante un recuadro adyacente «pensando» (círculo de carga)
// y, cuando la IA responde, lo rellena con el análisis y clasifica la nota (color).
function analyzeNote(b, el, btn) {
  if (!aiReady()) { toast('Configura tu IA para clasificar y analizar la nota.', 'warn'); openAI(); return; }
  var text = ((b.content && b.content.text) || '').trim();
  if (!text) { toast('Escribe algo en la nota primero.', 'warn'); return; }
  b.content = b.content || {};
  if (!el) el = cardEl(b.id);
  // Recuadro de feedback inmediato (estilo bloque cURL): «Buscando información…» + círculo.
  var prev = el && el.querySelector('.note-analysis'); if (prev) prev.remove();
  var loadBody = h('div', { class: 'note-analysis-body' },
    h('div', { class: 'note-analysis-loading' }, h('span', { class: 'note-spinner' }), 'Buscando información…'));
  var panel = h('div', { class: 'note-analysis anim-in' }, noteAnalysisHead(b), loadBody);
  panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  if (el) el.appendChild(panel);
  if (btn) btn.classList.add('busy');
  callAI([
    { role: 'system', content: 'Clasificas y analizas una nota en español. Devuelve SOLO un objeto JSON válido con dos claves: "clasificacion" (exactamente uno de: relevant, idea, important, crucial — según su importancia real) y "analisis" (Markdown breve: una frase de resumen, 2-3 puntos clave y, si aplica, un siguiente paso). Sé honesto, sin adular.' },
    { role: 'user', content: 'Nota:\n' + text },
  ]).then(function (res) {
    if (btn) btn.classList.remove('busy');
    var parsed = aiParseJSON(res) || {};
    var rank = ['relevant', 'idea', 'important', 'crucial'].indexOf(parsed.clasificacion) >= 0 ? parsed.clasificacion : noteRank(b);
    var md = (parsed.analisis || String(res || '').trim()) || 'Sin análisis.';
    b.content.analysis = md;
    b.content._justAnalyzed = true;       // para animar la aparición del panel al re-renderizar
    b.content.rank = rank;                 // clasificación → color
    touchNote(b.noteId);
    logChange('Nota analizada con IA', rankMeta(rank).label);
    save();
    renderCanvas();
    var card = cardEl(b.id); if (card) { var p = card.querySelector('.note-analysis'); if (p) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    toast('Nota clasificada como «' + rankMeta(rank).label + '».', 'ok');
  }).catch(function (e) {
    if (btn) btn.classList.remove('busy');
    loadBody.innerHTML = '';
    loadBody.appendChild(h('div', { class: 'note-analysis-loading err' }, 'No se pudo analizar: ' + ((e && e.message) || e)));
  });
}
