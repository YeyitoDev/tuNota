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

function notebookNode(nb) {
  var open = !!ui.expN[nb.id];
  var name = editable(h('span', { class: 'item-name' }, nb.name), nb.name, function (v) { rename('nb', nb.id, v); });
  var row = h(
    'div',
    { class: 'row nb-row' },
    h('button', { class: 'chev', onclick: function () { ui.expN[nb.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
    h('span', { class: 'emoji' }, nb.emoji || '\uD83D\uDCD3'),
    name,
    h('button', { class: 'act', title: 'A\u00f1adir secci\u00f3n', onclick: function (e) { e.stopPropagation(); addSection(nb.id); } }, icon('folderPlus')),
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
  var name = editable(h('span', { class: 'item-name' }, s.name), s.name, function (v) { rename('sec', s.id, v); });
  var row = h(
    'div',
    { class: 'row sec-row' },
    h('button', { class: 'chev', onclick: function () { ui.expS[s.id] = !open; save(); renderSidebar(); } }, icon(open ? 'chevronDown' : 'chevron')),
    name,
    h('button', { class: 'act', title: 'Nueva nota', onclick: function (e) { e.stopPropagation(); addNote(s.id); } }, icon('plus')),
    h('button', { class: 'act danger', title: 'Eliminar secci\u00f3n', onclick: function (e) { e.stopPropagation(); deleteSection(s.id); } }, icon('trash'))
  );
  var wrap = h('div', {}, row);
  if (open) {
    var kids = h('div', { class: 'children' });
    var ns = notesOf(s.id);
    ns.forEach(function (n) { kids.appendChild(noteRow(n)); });
    if (ns.length === 0) kids.appendChild(h('p', { class: 'tree-empty' }, 'Sin notas a\u00fan'));
    wrap.appendChild(kids);
  }
  return wrap;
}

function noteRow(n) {
  var active = ui.currentNoteId === n.id;
  var name = editable(h('span', { class: 'item-name' }, n.title), n.title, function (v) { rename('note', n.id, v); });
  return h(
    'div',
    { class: 'row note-row' + (active ? ' active' : ''), onclick: function () { selectNote(n.id); } },
    icon('file'),
    name,
    h('button', { class: 'act danger', title: 'Eliminar nota', onclick: function (e) { e.stopPropagation(); deleteNote(n.id); } }, icon('trash'))
  );
}

// ---------- Tema / colores personalizables ----------
var THEME_VARS = [
  ['--bg', 'Fondo'],
  ['--card', 'Tarjetas'],
  ['--fg', 'Texto'],
  ['--secondary', 'Panel lateral'],
  ['--border', 'Bordes'],
  ['--primary', 'Acento'],
  ['--sage', 'Verde'],
  ['--ocre', 'Ocre'],
];
var THEME_PRESETS = {
  'Cozy (por defecto)': {},
  'Bosque': { '--bg': '#eef1e6', '--card': '#f8faf2', '--secondary': '#e2e8d6', '--border': '#cfd8bf', '--primary': '#5f8d5a', '--sage': '#7a9b6f', '--ocre': '#c99a4e', '--fg': '#2c332a' },
  'Oc\u00e9ano': { '--bg': '#e9eff3', '--card': '#f6fafc', '--secondary': '#d7e3ea', '--border': '#c3d3dd', '--primary': '#3d7ea6', '--sage': '#5aa0a8', '--ocre': '#d99a5a', '--fg': '#26333b' },
  'Lavanda': { '--bg': '#f0ecf6', '--card': '#faf8fd', '--secondary': '#e5ddf0', '--border': '#d5cae6', '--primary': '#8a6bc2', '--sage': '#9a8ac0', '--ocre': '#d9a35a', '--fg': '#332c3d' },
  'Noche': { '--bg': '#22242a', '--card': '#2c2f37', '--secondary': '#282b32', '--border': '#3a3e48', '--primary': '#d98a6a', '--sage': '#8aa38c', '--ocre': '#d9a35a', '--fg': '#e7e3da', '--muted': '#a09a8f', '--muted2': '#726c62' },
};
function applyTheme() {
  var root = document.documentElement;
  THEME_VARS.forEach(function (v) { root.style.removeProperty(v[0]); });
  ['--muted', '--muted2'].forEach(function (k) { root.style.removeProperty(k); });
  var t = ui.theme || {};
  Object.keys(t).forEach(function (k) { if (t[k]) root.style.setProperty(k, t[k]); });
  // Los diagramas Mermaid toman sus colores de la paleta: re-tematizarlos.
  if (typeof mmdThemeRefresh === 'function') mmdThemeRefresh();
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
    presets.appendChild(h('button', { class: 'theme-preset-btn', onclick: function () { applyPreset(THEME_PRESETS[name]); openTheme(); } }, name));
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
  openai: { label: 'OpenAI', style: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyHint: 'sk-\u2026' },
  groq: { label: 'Groq', style: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_\u2026' },
  openrouter: { label: 'OpenRouter', style: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', keyHint: 'sk-or-\u2026' },
  gemini: { label: 'Google Gemini', style: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash', keyHint: 'AIza\u2026' },
  anthropic: { label: 'Anthropic (Claude)', style: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest', keyHint: 'sk-ant-\u2026' },
  custom: { label: 'Personalizado (OpenAI-compat)', style: 'openai', baseUrl: '', model: '', keyHint: 'clave' },
};
function aiConfig() {
  var p = AI_PROVIDERS[ui.ai.provider] || AI_PROVIDERS.openai;
  return {
    style: p.style,
    baseUrl: (ui.ai.baseUrl || p.baseUrl || '').replace(/\/+$/, ''),
    model: ui.ai.model || p.model,
    key: ui.ai.apiKey || '',
  };
}
function aiReady() { var c = aiConfig(); return !!(c.key && c.baseUrl && c.model); }
function aiHandleJSON(r) {
  return r.json().catch(function () { return {}; }).then(function (d) {
    if (!r.ok) { throw new Error((d && d.error && (d.error.message || d.error)) || ('HTTP ' + r.status)); }
    return d;
  });
}
function callAI(messages) {
  var c = aiConfig();
  if (!c.key) return Promise.reject(new Error('Configura tu API key en el panel de IA.'));
  if (!c.baseUrl) return Promise.reject(new Error('Falta la URL base del proveedor.'));
  if (!c.model) return Promise.reject(new Error('Indica un modelo.'));
  if (c.style === 'openai') {
    return fetch(c.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages: messages, temperature: 0.7 }),
    }).then(aiHandleJSON).then(function (d) {
      return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
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
    var o = h('option', { value: k }, AI_PROVIDERS[k].label);
    if (ui.ai.provider === k) o.selected = true;
    provSel.appendChild(o);
  });
  var modelInp = h('input', { class: 'ai-input', placeholder: 'modelo', value: ui.ai.model || '' });
  var baseInp = h('input', { class: 'ai-input', placeholder: 'URL base (opcional)', value: ui.ai.baseUrl || '' });
  var keyInp = h('input', { class: 'ai-input', type: 'password', placeholder: 'API key', value: ui.ai.apiKey || '' });
  function syncHints() {
    var p = AI_PROVIDERS[provSel.value] || AI_PROVIDERS.openai;
    modelInp.placeholder = p.model || 'modelo';
    baseInp.placeholder = p.baseUrl || 'URL base';
    keyInp.placeholder = p.keyHint || 'API key';
  }
  provSel.addEventListener('change', function () { syncHints(); });
  syncHints();
  var saveBtn = h('button', { class: 'ai-save-btn', onclick: function () {
    ui.ai.provider = provSel.value;
    ui.ai.model = modelInp.value.trim();
    ui.ai.baseUrl = baseInp.value.trim();
    ui.ai.apiKey = keyInp.value.trim();
    save();
    settings.classList.remove('open');
    renderTopbar();
    pushAIMsg('system-note', aiReady() ? 'Configuraci\u00f3n guardada. \u00a1Listo para chatear!' : 'Faltan datos de configuraci\u00f3n.');
  } }, 'Guardar');
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Proveedor'), provSel));
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'Modelo'), modelInp));
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'URL base'), baseInp));
  settings.appendChild(h('div', { class: 'ai-set-row' }, h('label', {}, 'API key'), keyInp));
  settings.appendChild(h('p', { class: 'ai-warn' }, 'La clave se guarda en este navegador (localStorage). No la uses en equipos compartidos.'));
  settings.appendChild(saveBtn);
  // Chat
  var log = h('div', { class: 'ai-log' });
  var quick = h('div', { class: 'ai-quick' },
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Resume la siguiente nota en vi\u00f1etas claras y breves:\n\n' + currentNoteText(), 'Resumir nota'); } }, 'Resumir nota'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Sugiere 5 ideas o siguientes pasos a partir de esta nota:\n\n' + currentNoteText(), 'Ideas'); } }, 'Ideas'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Analiza esta nota y extrae de 3 a 5 insights NO obvios: patrones, implicaciones, riesgos y conexiones entre las ideas. Cada insight en negrita con una explicación corta:\n\n' + currentNoteText(), 'Insights de la nota'); } }, 'Insights'),
    h('button', { class: 'ai-chip', onclick: function () { aiAsk('Extrae de esta nota una lista de próximos pasos accionables en Markdown con casillas "- [ ]", ordenados por impacto:\n\n' + currentNoteText(), 'Accionables'); } }, 'Accionables'),
    h('button', { class: 'ai-chip', title: 'Sugiere y aplica un título para la nota actual', onclick: aiSuggestTitle }, 'Título')
  );
  var input = h('textarea', { class: 'ai-textarea', placeholder: 'Escribe tu mensaje\u2026 (Enter env\u00eda, Shift+Enter salto)' });
  var sendBtn = h('button', { class: 'ai-send-btn', title: 'Enviar', onclick: function () { var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } }, icon('send'));
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var v = input.value.trim(); if (v) { input.value = ''; aiAsk(v); } } });
  var inbar = h('div', { class: 'ai-inbar' }, input, sendBtn);
  var body = h('div', { class: 'log-body ai-body' }, settings, log, quick, inbar);
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
function escCloseAI(e) { if (e.key === 'Escape') closeAI(); }
function closeAI() { var o = document.getElementById('aiOverlay'); if (o) o.remove(); document.removeEventListener('keydown', escCloseAI); }

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
];
function aiBlockText(b) {
  var c = b.content || {};
  if (c.table && c.table.rows) return c.table.rows.map(function (r) { return r.join(' | '); }).join('\n');
  return c.text || '';
}
function aiCanActOn(b) {
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
    if (action.mode === 'replace') {
      pushUndo('IA: mejorar redacción');
      b.content = b.content || {};
      b.content.text = result;
      touchNote(b.noteId);
      logChange('IA: redacción mejorada', snippet(result));
      save();
      renderCanvas();
      toast('Texto mejorado (Ctrl+Z para deshacer).', 'ok');
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
