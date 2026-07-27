#!/usr/bin/env node
/*
 * tuNota — Grabación del video showcase v2 («Imaginemos una app»).
 * Recorre la app REAL en un Chromium dirigido por Playwright: cursor visible,
 * ondas de clic, tarjetas de capítulo y registro de eventos de sonido (sfx.json).
 * Las respuestas de IA/búsqueda se simulan vía rutas interceptadas (como v1).
 *
 * Uso:  node record.cjs            → recordings/NN-nombre.webm + sfx.json
 * Requisito: sandbox de la app sirviendo en http://localhost:8899
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8899';
const OUT = path.join(__dirname, 'recordings');
const W = 1280, H = 720;
const CHROME = process.env.CHROME || path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell');

fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- sfx log --
const sfx = { scenes: [], events: [] };
let sceneName = null, sceneT0 = 0;
function mark(name) {
  if (!sceneName) return;
  sfx.events.push({ scene: sceneName, t: Math.max(0, (Date.now() - sceneT0) / 1000), name });
}
function saveSfx() {
  fs.writeFileSync(path.join(OUT, 'sfx.json'), JSON.stringify(sfx, null, 2));
  // Sidecar por escena: a prueba de reejecuciones parciales (el combinado se sobrescribe).
  const last = sfx.scenes[sfx.scenes.length - 1];
  if (last) {
    fs.writeFileSync(path.join(OUT, 'sfx-' + last.name + '.json'),
      JSON.stringify({ scene: last, events: sfx.events.filter((e) => e.scene === last.name) }, null, 2));
  }
}

// ------------------------------------------------------------- init script --
// Cursor visible con suavizado + ondas de clic + tarjetas de capítulo/portada.
const INIT = `(function () {
  function boot() {
    if (window.__demo) return;
    var css = document.createElement('style');
    css.textContent = [
      '*{cursor:none!important}',
      '#__cur{position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;',
      '  background:rgba(194,116,91,.92);border:2.5px solid #fff;box-shadow:0 1px 8px rgba(40,30,20,.45);',
      '  z-index:2147483000;pointer-events:none;transition:transform .12s ease;}',
      '#__cur.down{transform:scale(.72)}',
      '.__rip{position:fixed;border-radius:50%;border:3px solid rgba(194,116,91,.85);pointer-events:none;',
      '  z-index:2147482999;animation:__rip .55s ease-out forwards;}',
      '@keyframes __rip{from{opacity:.95;transform:scale(.25)}to{opacity:0;transform:scale(1.6)}}',
      '#__cap{position:fixed;left:36px;bottom:34px;z-index:2147483001;pointer-events:none;display:flex;align-items:center;gap:12px;',
      '  background:rgba(32,29,25,.88);color:#f7f2e8;padding:12px 20px 12px 12px;border-radius:16px;',
      '  font:600 21px Nunito,system-ui,sans-serif;box-shadow:0 10px 34px rgba(20,15,10,.35);',
      '  opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s ease;}',
      '#__cap.on{opacity:1;transform:translateY(0)}',
      '#__cap .n{display:flex;align-items:center;justify-content:center;min-width:38px;height:38px;padding:0 8px;border-radius:11px;',
      '  background:#c2745b;color:#fff;font-weight:800;font-size:19px;}',
      '#__cap small{display:block;font-weight:600;font-size:13.5px;opacity:.75;margin-top:1px}',
      '#__cov{position:fixed;inset:0;z-index:2147483002;display:flex;flex-direction:column;align-items:center;justify-content:center;',
      '  gap:14px;background:rgba(247,243,234,.93);backdrop-filter:blur(7px);pointer-events:none;',
      '  font-family:Nunito,system-ui,sans-serif;color:#33302b;opacity:0;transition:opacity .5s ease;}',
      '#__cov.on{opacity:1}',
      '#__cov .lf{font-size:64px;line-height:1}',
      '#__cov h1{margin:0;font-size:52px;font-weight:800;letter-spacing:-.5px}',
      '#__cov p{margin:0;font-size:23px;color:#6d6557;font-weight:600}',
      '#__cov .ft{margin-top:14px;font-size:19px;color:#8a8378;font-weight:600;display:flex;gap:10px;align-items:center}',
      '#__cov .ft b{color:#c2745b}'
    ].join('\\n');
    document.head.appendChild(css);
    var cur = document.createElement('div'); cur.id = '__cur';
    document.body.appendChild(cur);
    var tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty;
    addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; }, true);
    addEventListener('mousedown', function (e) {
      cur.classList.add('down');
      var r = document.createElement('div'); r.className = '__rip';
      var s = 34;
      r.style.cssText = 'left:' + (e.clientX - s / 2) + 'px;top:' + (e.clientY - s / 2) + 'px;width:' + s + 'px;height:' + s + 'px';
      document.body.appendChild(r); setTimeout(function () { r.remove(); }, 600);
    }, true);
    addEventListener('mouseup', function () { cur.classList.remove('down'); }, true);
    (function loop() { x += (tx - x) * .38; y += (ty - y) * .38; cur.style.left = x + 'px'; cur.style.top = y + 'px'; requestAnimationFrame(loop); })();
    var cap = null, cov = null, capT = null;
    window.__demo = {
      cursor: function (on) { cur.style.display = on ? '' : 'none'; },
      chapter: function (n, title, sub, ms) {
        if (!cap) { cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap); }
        cap.innerHTML = '<span class="n">' + n + '</span><span><span>' + title + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>';
        requestAnimationFrame(function () { cap.classList.add('on'); });
        clearTimeout(capT); capT = setTimeout(function () { cap.classList.remove('on'); }, ms || 3000);
      },
      cover: function (title, sub, foot) {
        if (cov) cov.remove();
        cov = document.createElement('div'); cov.id = '__cov';
        cov.innerHTML = '<div class="lf">🌿</div><h1>' + title + '</h1><p>' + sub + '</p>' + (foot ? '<div class="ft">' + foot + '</div>' : '');
        document.body.appendChild(cov);
        requestAnimationFrame(function () { cov.classList.add('on'); });
      },
      uncover: function () { if (cov) cov.classList.remove('on'); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();`;

// ---------------------------------------------------------------- mocks IA --
const SEARCH_JSON = {
  answer: 'La optimización de rutas (VRP) está muy estudiada: con 10 paradas hay más de 3 millones de órdenes posibles. Las herramientas actuales apuntan a flotas y empresas, no a reparto local en bici.',
  results: [
    { title: 'Last-mile delivery: por qué el último kilómetro es el más caro', url: 'https://logisticahoy.example.com/ultimo-kilometro', content: 'El último kilómetro supone hasta el 53 % del coste total del envío. Optimizar el orden de las paradas es la palanca más directa de ahorro.' },
    { title: 'Routific, Upper y compañía: precios para flotas', url: 'https://saasderutas.example.com/comparativa', content: 'Las soluciones de enrutado para empresas parten de ~39 €/mes por vehículo y asumen flotas motorizadas y repartidores asalariados.' },
    { title: 'Notificaciones proactivas: menos "¿dónde está mi pedido?"', url: 'https://cxnews.example.com/avisos', content: 'Avisar al cliente con la hora estimada reduce ~30 % las consultas de seguimiento y mejora la valoración del servicio.' },
    { title: 'WhatsApp Business: tasas de apertura superiores al 90 %', url: 'https://mensajeria.example.com/apertura', content: 'Los mensajes transaccionales por WhatsApp superan el 90 % de apertura, muy por encima del email.' },
  ],
};
const RESEARCH_MD = [
  '### Búsqueda web',
  '',
  '**La optimización de rutas (VRP)** es un problema clásico: con solo 10 paradas existen **más de 3 millones de órdenes posibles**. Las herramientas actuales (Routific, Upper…) están pensadas para flotas y empresas —desde ~39 €/mes— y dejan fuera al reparto local en bici [2](https://saasderutas.example.com/comparativa).',
  '',
  '- El último kilómetro concentra hasta el **53 % del coste** del envío [1](https://logisticahoy.example.com/ultimo-kilometro)',
  '- Avisar al cliente con su hora estimada **recorta ~30 %** los «¿dónde está mi pedido?» [3](https://cxnews.example.com/avisos)',
  '- **WhatsApp supera el 90 % de apertura**, ideal para los avisos [4](https://mensajeria.example.com/apertura)',
  '',
  '**Conclusión:** hay hueco para una herramienta ligera, sin registro, para repartidores locales.',
].join('\n');
const LEAN_STEPS = {
  steps: [
    { title: 'Problema y cliente', content: '- Repartidores en bici de tiendas locales (bici mensajería, flores, comida).\n- Ordenan las paradas **a mano**, mirando el mapa cada rato.\n- El cliente pregunta constantemente dónde está su pedido.' },
    { title: 'Propuesta de valor / MVP', content: '- Pega las paradas → **ruta ordenada** en segundos.\n- **Aviso automático por WhatsApp** al cliente con su franja.\n- MVP: web app, sin registro, gratis para 20 paradas/día.' },
    { title: 'Hipótesis clave', content: '- Ahorra **≥ 30 min al día** por repartidor.\n- Las tiendas pagarían ~5 €/mes si el ahorro es real.\n- El aviso por WhatsApp reduce las llamadas de seguimiento.' },
    { title: 'Experimentos', content: '- Landing + **10 entrevistas** a tiendas del barrio.\n- Piloto de 1 semana con 2 tiendas, rutas reales.\n- Comparativa manual vs. RutApp en tiempo total.' },
    { title: 'Métricas', content: '- Rutas creadas por semana (activación).\n- Minutos ahorrados por ruta (valor).\n- % de avisos enviados y retención a 4 semanas.' },
    { title: 'Aprender y pivotar', content: '- Si el ahorro no se confirma → pivotar a solo avisos.\n- Si hay tracción → app móvil y cobro por tienda.\n- Documentar todo lo aprendido en el lienzo.' },
  ],
};
const CONCEPT_JSON = {
  tema: 'RutApp 🚲',
  concepts: [
    { name: 'Paradas optimizadas', rel: 'organiza' },
    { name: 'Aviso por WhatsApp', rel: 'notifica con' },
    { name: 'Repartidores en bici', rel: 'lo usan' },
    { name: 'Tiendas locales', rel: 'cliente' },
    { name: 'Ahorro de tiempo', rel: 'beneficio' },
    { name: 'MVP sin registro', rel: 'se valida con' },
    { name: 'Métricas semanales', rel: 'se mide con' },
    { name: 'Último kilómetro', rel: 'contexto' },
  ],
};

function installMocks(ctx) {
  ctx.route('**/api/ai', (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    const msgs = body.messages || [];
    const sys = String((msgs[0] && msgs[0].content) || '');
    let content = 'OK';
    if (/planificador de tuNota/i.test(sys)) {
      content = JSON.stringify({ method: 'lean_startup', razon: 'Es un emprendimiento: toca validar problema, cliente y modelo.' });
    } else if (/experto en/i.test(sys)) {
      content = JSON.stringify(LEAN_STEPS);
    } else if (/MAPA_CONCEPTUAL/i.test(sys)) {
      content = JSON.stringify(CONCEPT_JSON);
    } else if (/búsqueda web/i.test(sys)) {
      content = RESEARCH_MD.replace(/^### Búsqueda web\n\n/, '');
    }
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'demo', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
    });
  });
  ctx.route('**/api/search', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_JSON) });
  });
}

// La acción «🧠 Mapa conceptual»: misma mecánica que «Estructurar idea» (bloques
// + enlaces + grupo nativos), con la respuesta simulada del asistente.
const CONCEPT_PATCH = `(function () {
  if (window.__conceptReady) return; window.__conceptReady = true;
  AI_BLOCK_ACTIONS.push({ key: 'conceptmap', label: '🧠 Mapa conceptual', mode: 'concept',
    prompt: 'MAPA_CONCEPTUAL' });
  var orig = aiBlockAction;
  aiBlockAction = function (b, a) {
    if (!a || a.mode !== 'concept') return orig(b, a);
    var el = cardEl(b.id); if (el) el.classList.add('ai-busy');
    toast('🧠 La IA está organizando tu contenido en un mapa conceptual…');
    callAI([
      { role: 'system', content: 'MAPA_CONCEPTUAL: devuelve SOLO JSON {"tema":"...","concepts":[{"name":"...","rel":"..."}]}, sin fences.' },
      { role: 'user', content: 'Contenido del lienzo:\\n' + currentNoteText().slice(0, 4000) },
    ]).then(function (txt) {
      if (el) el.classList.remove('ai-busy');
      var gen = aiParseJSON(txt) || {}, items = (gen.concepts || []).slice(0, 8);
      if (!items.length) { toast('La IA no devolvió conceptos válidos.', 'warn'); return; }
      pushUndo('Mapa conceptual (IA)');
      var t = now(), made = [], cx = b.x + (b.width || 260) + 560, cy = b.y + 150;
      var cen = { id: uid(), noteId: b.noteId, type: 'shape', x: cx - 120, y: cy - 55, width: 240, height: 110,
        content: { text: gen.tema || 'Tema central', shape: 'ellipse' }, color: 'n', createdAt: t, updatedAt: t };
      data.blocks.push(cen); made.push(cen);
      var R = 330;
      items.forEach(function (c, i) {
        var ang = -Math.PI / 2 + i * (2 * Math.PI / items.length);
        var px = cx + Math.cos(ang) * R * 1.35, py = cy + Math.sin(ang) * R;
        var nb = { id: uid(), noteId: b.noteId, type: 'shape',
          x: Math.round(px - 105), y: Math.round(py - 46), width: 210, height: 92,
          content: { text: c.name, shape: 'ellipse' }, createdAt: t, updatedAt: t };
        data.blocks.push(nb); made.push(nb);
        data.links.push({ id: uid(), noteId: b.noteId, a: cen.id, b: nb.id, label: c.rel || '', createdAt: t });
      });
      data.links.push({ id: uid(), noteId: b.noteId, a: b.id, b: cen.id, label: 'mapa', createdAt: t });
      data.groups.push({ id: uid(), noteId: b.noteId, name: 'Mapa conceptual (IA)',
        color: (groupsOf(b.noteId).length) % GROUP_COLORS.length, blockIds: made.map(function (x) { return x.id; }), createdAt: t });
      touchNote(b.noteId);
      logChange('Mapa conceptual con IA', items.length + ' conceptos');
      save(); renderCanvas();
      made.forEach(function (nb, i) { cardEnterAnim(cardEl(nb.id), i * 110); });
      focusBlock(cen.id);
      toast('Mapa conceptual creado: ' + items.length + ' conceptos enlazados y agrupados. ✔', 'ok');
    }).catch(function (e) { if (el) el.classList.remove('ai-busy'); toast('IA: ' + ((e && e.message) || e), 'warn'); });
  };
})();`;

// ----------------------------------------------------------------- helpers --
let ctx, browser;

async function newScenePage() {
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#canvas .canvas-content', { timeout: 20000 });
  await page.waitForTimeout(900); // arranque + primer render
  return page;
}

function makeH(page) {
  const h = {};
  h.ev = (fn, arg) => page.evaluate(fn, arg);
  h.wait = (ms) => page.waitForTimeout(ms);
  h.mark = mark;
  h.clickAt = async (x, y) => {
    await page.mouse.move(x, y, { steps: 22 });
    await h.wait(140);
    if (process.env.DBG) {
      const under = await h.ev(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? el.tagName + '.' + String(el.className).slice(0, 40) : 'null';
      }, [x, y]);
      console.log('    clic @(' + Math.round(x) + ',' + Math.round(y) + ') → ' + under);
    }
    mark('click');
    await page.mouse.down(); await h.wait(60); await page.mouse.up();
    await h.wait(160);
  };
  h.clickSel = async (sel, opts) => {
    // Los botones de tarjeta son opacity:0 hasta :hover — primero pasa el ratón por la tarjeta.
    const mCard = /^\.card\[data-id="([^"]+)"\]/.exec(sel);
    if (mCard) {
      const cardLoc = page.locator('.card[data-id="' + mCard[1] + '"]').first();
      const cbb = await cardLoc.boundingBox().catch(() => null);
      if (cbb) {
        await page.mouse.move(cbb.x + cbb.width / 2, cbb.y + Math.min(cbb.height / 2, 60), { steps: 16 });
        await h.wait(380); // transición de opacity
      }
    }
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    const handle = await loc.elementHandle();
    for (let attempt = 0; attempt < 4; attempt++) {
      const bb = await loc.boundingBox();
      if (!bb) break;
      const x = bb.x + (opts && opts.dx != null ? opts.dx : bb.width / 2);
      const y = bb.y + (opts && opts.dy != null ? opts.dy : bb.height / 2);
      // ¿El punto físico cae sobre el objetivo (o algo dentro de él)?
      const hit = await page.evaluate(([el, px, py]) => {
        const top = document.elementFromPoint(px, py);
        if (!top) return 'none';
        return (top === el || el.contains(top)) ? 'ok' : String(top.className || top.tagName).slice(0, 30);
      }, [handle, x, y]);
      if (hit === 'ok') { await h.clickAt(x, y); return bb; }
      if (process.env.DBG) console.log('    objetivo tapado por: ' + hit + ' (reintento ' + attempt + ')');
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
      await h.wait(300); // deja pasar animaciones/re-renders
    }
    // Último recurso: clic JS directo (el cursor queda cerca; el menú ya está abierto).
    await loc.evaluate((el) => el.click());
    mark('click');
    await h.wait(160);
    return null;
  };
  h.dblclickSel = async (sel) => {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    const bb = await loc.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 18 });
    await h.wait(120);
    mark('click');
    await loc.dblclick();
    await h.wait(200);
  };
  h.drag = async (x1, y1, x2, y2, name) => {
    await page.mouse.move(x1, y1, { steps: 16 });
    await h.wait(120);
    await page.mouse.down();
    mark(name || 'draw');
    await page.mouse.move(x2, y2, { steps: 26 });
    await h.wait(100);
    await page.mouse.up();
    await h.wait(160);
  };
  h.type = async (text, cps) => {
    const per = 1000 / (cps || 26);
    for (const ch of text) {
      await page.keyboard.type(ch);
      mark(ch === '\n' ? 'keyEnter' : 'key');
      await h.wait(per * (0.6 + Math.random() * 0.8));
    }
  };
  h.typeInto = async (sel, text, cps) => { await h.clickSel(sel); await h.type(text, cps); };
  h.chapter = async (n, title, sub) => { mark('whoosh'); await h.ev(([n2, t, s]) => window.__demo.chapter(n2, t, s), [n, title, sub]); await h.wait(1050); };
  h.worldToScreen = (wx, wy) => h.ev(([x, y]) => {
    const v = getView(), r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + v.x + x * v.zoom, y: r.top + v.y + y * v.zoom };
  }, [wx, wy]);
  h.blockIdByText = (snip) => h.ev((s) => {
    const b = (data.blocks || []).find((x) => ((x.content && x.content.text) || '').includes(s));
    return b ? b.id : null;
  }, snip);
  h.centerOnWorld = (wx, wy) => h.ev(([x, y]) => centerOn(x, y), [wx, wy]);
  h.zoomTo = (z) => h.ev((zz) => { var v = getView(); v.zoom = zz; applyView(); saveView(); }, z);
  // Encuadra un rectángulo del mundo (x1,y1)-(x2,y2) con margen, de forma determinista.
  h.frameRect = (x1, y1, x2, y2, pad) => h.ev(([rx1, ry1, rx2, ry2, pd]) => {
    var wrap = document.getElementById('canvas'), r = wrap.getBoundingClientRect();
    var v = getView();
    var z = Math.min((r.width - pd * 2) / (rx2 - rx1), (r.height - pd * 2) / (ry2 - ry1), 1.15);
    v.zoom = z;
    v.x = r.width / 2 - ((rx1 + rx2) / 2) * z;
    v.y = r.height / 2 - ((ry1 + ry2) / 2) * z;
    applyView(); saveView();
  }, [x1, y1, x2, y2, pad || 46]);
  // Centra usando el rectángulo RENDERIZADO (inmune a alturas auto-crecidas).
  h.centerCard = (id, fracY) => h.ev(([bid, fy]) => {
    var el = cardEl(bid); if (!el) return;
    var wrap = document.getElementById('canvas'); var r = wrap.getBoundingClientRect();
    var cr = el.getBoundingClientRect(); var v = getView();
    v.x += (r.left + r.width / 2) - (cr.left + cr.width / 2);
    v.y += (r.top + r.height * (fy || 0.5)) - (cr.top + cr.height / 2);
    applyView(); saveViewDebounced();
  }, [id, fracY || 0.5]);
  return h;
}

const ONLY = (process.env.SCENES || '').split(',').map((s) => s.trim()).filter(Boolean);
async function scene(name, fn) {
  if (ONLY.length && !ONLY.some((p) => name.startsWith(p))) return;
  sceneName = name;
  const page = await newScenePage();
  const t0 = Date.now();
  sceneT0 = t0;
  const meta = { name, file: name + '.webm', trim: 0.9, dur: 0 };
  const h = makeH(page);
  try {
    await fn(page, h);
  } catch (e) {
    console.error('  ✗ escena ' + name + ': ' + e.message);
    await page.screenshot({ path: path.join(OUT, name + '-error.png') });
    const vv = page.video();
    await page.close();
    if (vv) { try { fs.renameSync(await vv.path(), path.join(OUT, name + '-fail.webm')); } catch (e2) {} }
    throw e;
  }
  await h.wait(500); // cola de respiro
  meta.dur = (Date.now() - t0) / 1000;
  const video = page.video();
  await page.close();
  const vp = await video.path();
  fs.renameSync(vp, path.join(OUT, meta.file));
  sfx.scenes.push(meta);
  saveSfx();
  try { fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(await ctx.storageState())); } catch (e) {}
  console.log('  ✓ ' + name + '  (' + meta.dur.toFixed(1) + 's)');
}

// ------------------------------------------------------------------ scenes --
async function main() {
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-lcd-text', '--force-device-scale-factor=1'] });
  const stateFile = path.join(OUT, 'state.json');
  const resume = ONLY.length && !ONLY.some((p) => '01-portada'.startsWith(p)) && fs.existsSync(stateFile);
  if (resume) console.log('  ↩ reanudando con el estado de recordings/state.json');
  ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    locale: 'es-ES',
    ...(resume ? { storageState: stateFile } : {}),
  });
  await ctx.addInitScript(INIT);
  installMocks(ctx);

  // S01 — Portada + preparación del escenario (libro, nota, IA simulada).
  await scene('01-portada', async (page, h) => {
    await h.ev(() => {
      // Escenario limpio: un libro y una nota para nuestro proyecto.
      var t = now();
      data.notebooks = [{ id: 'nb1', name: 'Proyectos', emoji: '🚀', order: 0, createdAt: t }];
      data.sections = [{ id: 'sec1', notebookId: 'nb1', name: 'RutApp', order: 0 }];
      data.notes = [{ id: 'note1', sectionId: 'sec1', title: 'RutApp — de la idea al plan', createdAt: t, updatedAt: t }];
      data.blocks = []; data.links = []; data.groups = []; data.plan = [];
      ui.tourSeen = true;
      ui.dblType = 'text';
      ui.ai = { provider: 'openai', model: 'demo-creative-1', apiKey: 'demo', baseUrl: 'https://api.demo-ai.local/v1', effort: 'auto' };
      ui.expN = { nb1: true };
      save();
      BACKEND.search = true; BACKEND.ai = true;
      renderSidebar(); selectNote('note1');
      ensurePyodide().catch(function () {}); // precalienta Python para la escena 10
    });
    mark('intro');
    await h.ev(() => window.__demo.cover('Imaginemos algo…', 'vamos a crear una app, de la idea al plan de acción', 'todo dentro de <b>tuNota</b>'));
    await h.wait(2600);
    mark('whoosh');
    await h.ev(() => window.__demo.uncover());
    await h.wait(700);
  });

  // S02 — Tour guiado real (3 pasos).
  await scene('02-tour', async (page, h) => {
    await h.chapter('01', 'Un tour te enseña lo esencial', '30 segundos y ya sabes moverte');
    await h.ev(() => startTour(0));
    await page.waitForSelector('.tour-pop', { timeout: 5000 });
    mark('pop');
    await h.wait(1400);
    await h.clickSel('.tour-nav .tour-btn:not(.ghost)'); // Empezar
    mark('pop');
    await h.wait(1300);
    await h.clickSel('.tour-nav .tour-btn:not(.ghost)'); // Siguiente
    mark('pop');
    await h.wait(1500);
    await page.keyboard.press('Escape');
    await h.wait(500);
  });

  // S03 — Capturar la idea (doble clic → escribir).
  await scene('03-captura', async (page, h) => {
    await h.chapter('02', 'Captura la idea al vuelo', 'doble clic en el lienzo y escribe');
    await h.ev(() => { ui.dblType = 'text'; save(); });
    const p = await h.worldToScreen(120, 90);
    await h.ev(([x, y]) => {
      document.querySelector('.canvas-content').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }));
    }, [p.x, p.y]);
    await h.wait(500);
    mark('pop');
    await h.typeInto('.card:last-of-type .card-ta, .card .card-ta',
      'RutApp 🚲\nUna app para repartidores en bici: metes las paradas del día y te da el orden óptimo, con aviso al cliente por WhatsApp.', 24);
    await h.wait(400);
    // Coloca la tarjeta con orden y centra.
    await h.ev(() => {
      var bs = blocksOf('note1'); var b = bs[bs.length - 1];
      b.x = 90; b.y = 70; b.width = 340; save(); renderCanvas(); centerView();
    });
    mark('keyEnter');
    await h.wait(600);
  });

  // S04 — Clasificar (idea / crucial / importante) + segunda nota con pendientes.
  await scene('04-clasifica', async (page, h) => {
    await h.chapter('03', 'Clasifica cada nota', 'idea · importante · crucial — el color habla');
    const card = page.locator('.card').first();
    await h.clickSel('.card .card-menu');
    mark('pop');
    await h.wait(500);
    await h.clickSel('.rank-chip-idea');
    mark('ding');
    await h.wait(800);
    // Segunda nota: pendientes.
    const p = await h.worldToScreen(90, 420);
    await h.ev(([x, y]) => {
      document.querySelector('.canvas-content').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }));
    }, [p.x, p.y]);
    await h.wait(450);
    const tas = page.locator('.card .card-ta');
    await h.clickSel('.card[data-id] .card-ta >> nth=' + ((await tas.count()) - 1));
    await h.type('Hablar con 5 tiendas del barrio\nComparar Routific y Upper\nPrototipo del mapa con paradas\nMedir el tiempo de reparto real', 26);
    await h.wait(350);
    await h.ev(() => { var bs = blocksOf('note1'); var b = bs[bs.length - 1]; b.width = 320; save(); renderCanvas(); });
    const tasksId0 = await h.blockIdByText('Hablar con 5 tiendas');
    await h.centerCard(tasksId0);
    await h.wait(600);
    // Crucial + estrella.
    const tasksId2 = await h.blockIdByText('Hablar con 5 tiendas');
    if (process.env.DBG) {
      console.log('    tasksId2 =', tasksId2);
      console.log('    menuBtns =', await h.ev(() => Array.prototype.map.call(document.querySelectorAll('.card-menu'), function (m) {
        var r = m.getBoundingClientRect(); var c = m.closest('.card');
        return { id: c && c.getAttribute('data-id'), x: Math.round(r.x), y: Math.round(r.y) };
      })));
      console.log('    blocks =', await h.ev(() => data.blocks.map(function (b) { return b.id.slice(0, 6) + ':' + ((b.content.text || '').slice(0, 18)); })));
    }
    await h.clickSel('.card[data-id="' + tasksId2 + '"] .card-menu');
    await h.wait(350);
    await h.clickSel('.rank-chip-crucial');
    mark('ding');
    await h.wait(700);
    await h.clickSel('.card[data-id="' + tasksId2 + '"] .card-menu');
    await h.wait(350);
    await h.clickSel('.card-menu-pop .cm-item:has-text("Marcar como importante")');
    mark('success');
    await h.wait(700);
  });

  // S05 — Viñetas y casillas con la barra flotante.
  await scene('05-vinetas', async (page, h) => {
    await h.chapter('04', 'Del texto suelto a la lista', 'viñetas y casillas con un clic');
    const tasksId = await h.blockIdByText('Hablar con 5 tiendas');
    await h.centerCard(tasksId);
    await h.wait(600);
    const ta = page.locator('.card[data-id="' + tasksId + '"] .card-ta');
    await h.clickSel('.card[data-id="' + tasksId + '"] .card-ta');
    await page.waitForSelector('.sel-fmt-bar.show', { timeout: 5000 });
    mark('pop');
    await h.wait(400);
    await h.clickSel('.sel-fmt-btn[title="Viñetas"]');
    mark('ding');
    await h.wait(800);
    await h.clickSel('.sel-fmt-btn[title="Casillas de tarea"]');
    mark('ding');
    await h.wait(800);
    // Marca la primera tarea como hecha (clic real en "- [ ]").
    const bb = await ta.boundingBox();
    await h.clickAt(bb.x + 16, bb.y + 22);
    const ok = await h.ev(() => {
      var b = blocksOf('note1').find(function (x) { return (x.content.text || '').indexOf('[x]') >= 0; });
      return !!b;
    });
    if (ok) mark('success');
    await h.wait(500);
    await page.keyboard.press('Escape');
  });

  // S06 — Investigar en internet (búsqueda simulada con fuentes citadas).
  await scene('06-internet', async (page, h) => {
    await h.ev(CONCEPT_PATCH);
    await h.chapter('05', 'Investiga sin salir del lienzo', 'búsqueda web con fuentes citadas');
    const ideaId = await h.blockIdByText('RutApp 🚲');
    await h.ev((id) => { BACKEND.search = true; BACKEND.ai = true; focusBlock(id); }, ideaId);
    await h.wait(600);
    await h.clickSel('.card[data-id="' + ideaId + '"] .card-menu');
    await h.wait(450);
    mark('search');
    await h.clickSel('.cm-ai .cm-chip:has-text("Buscar en la web")');
    await page.waitForSelector('.card.md', { timeout: 15000 });
    mark('magic');
    await h.wait(1600);
    await h.ev(() => { var md = blocksOf('note1').find(function (x) { return x.type === 'markdown'; }); if (md) focusBlock(md.id); });
    mark('success');
    await h.wait(1400);
  });

  // S07 — La IA ordena el contenido en un mapa conceptual.
  await scene('07-mapa-conceptual', async (page, h) => {
    await h.ev(CONCEPT_PATCH);
    await h.chapter('06', 'Mucho contenido → un mapa', 'la IA lo ordena en un mapa conceptual');
    const ideaId2 = await h.blockIdByText('RutApp 🚲');
    await h.ev((id) => { BACKEND.ai = true; focusBlock(id); }, ideaId2);
    await h.wait(500);
    await h.clickSel('.card[data-id="' + ideaId2 + '"] .card-menu');
    await h.wait(450);
    mark('magic');
    await h.clickSel('.cm-ai .cm-chip:has-text("Mapa conceptual")');
    await page.waitForSelector('.card.shape', { timeout: 15000 });
    for (let i = 0; i < 8; i++) { mark('pop'); await h.wait(105); }
    await h.wait(1400);
    // Encuadra el mapa.
    await h.ev(() => {
      var g = groupsOf('note1').find(function (x) { return /Mapa conceptual/.test(x.name); });
      if (g) { var bb = groupBounds(g); centerOn(bb.x + bb.w / 2, bb.y + bb.h / 2); }
    });
    mark('success');
    await h.wait(1500);
  });

  // S08 — Estructurar la idea (Lean Startup, 6 fases agrupadas).
  await scene('08-estructura', async (page, h) => {
    await h.ev(CONCEPT_PATCH);
    await h.chapter('07', 'De la idea al plan, fase a fase', 'la IA elige la metodología y lo desarrolla');
    // Sitúa la idea a la vista y sin solapes con lo que viene.
    await h.ev(() => {
      BACKEND.ai = true;
      var idea = blocksOf('note1')[0];
      var md = blocksOf('note1').find(function (x) { return x.type === 'markdown'; });
      if (md) { md.x = 90; md.y = 1080; }
      var g = groupsOf('note1').find(function (x) { return /Mapa conceptual/.test(x.name); });
      if (g) { // mueve el mapa conceptual completo abajo
        var bb = groupBounds(g);
        var dx = 240 - bb.x, dy = 1420 - bb.y;
        g.blockIds.forEach(function (id) { var mb = getBlockById(id); if (mb) { mb.x += dx; mb.y += dy; } });
      }
      save(); renderCanvas(); focusBlock(idea.id);
    });
    await h.wait(600);
    const ideaId3 = await h.blockIdByText('RutApp 🚲');
    await h.clickSel('.card[data-id="' + ideaId3 + '"] .card-menu');
    await h.wait(450);
    mark('magic');
    await h.clickSel('.cm-ai .cm-chip-idea:has-text("Estructurar idea")');
    await page.waitForSelector('.group-head', { timeout: 20000 });
    await h.wait(2200);
    for (let i = 0; i < 6; i++) { mark('pop'); await h.wait(120); }
    await h.ev(() => fitView());
    mark('whoosh');
    await h.wait(1600);
  });

  // S09 — Lista numerada → flujograma con decisión.
  await scene('09-flujograma', async (page, h) => {
    await h.chapter('08', 'Tu proceso, como flujograma', 'escribe la lista y conviértela con un clic');
    // Limpieza de intentos anteriores (lista, formas y grupo del flujo).
    await h.ev(() => {
      data.blocks = data.blocks.filter(function (x) {
        if (x.noteId !== 'note1') return true;
        var t = (x.content && x.content.text) || '';
        if (t.indexOf('repartidor mete las paradas') >= 0) return false;
        if (x.type === 'shape' && x.y >= 2100) return false;
        return true;
      });
      data.links = data.links.filter(function (l) { return getBlockById(l.a) && getBlockById(l.b); });
      data.groups = data.groups.filter(function (g) { return !/Flujo del repartidor/.test(g.name); });
      save(); renderCanvas(); renderSidebar();
    });
    await h.zoomTo(1); await h.centerOnWorld(250, 2410); await h.wait(500);
    const p = await h.worldToScreen(90, 2300);
    await h.ev(([x, y]) => {
      document.querySelector('.canvas-content').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }));
    }, [p.x, p.y]);
    await h.wait(450);
    const tas = page.locator('.card .card-ta');
    const n = await tas.count();
    await h.clickSel('.card .card-ta >> nth=' + (n - 1));
    await h.type('1. El repartidor mete las paradas del día', 26);
    await page.keyboard.press('Enter');            // → "2. "
    await h.type('¿Hay cierres o tráfico?', 26);
    await page.keyboard.press('Enter');            // → "3. "
    await page.keyboard.press('Tab');              // → "2.1. " (rama del paso 2)
    mark('keyEnter');
    await h.type('Sí: recalcula el orden al momento', 26);
    await page.keyboard.press('Enter');            // → "2.2. "
    await h.type('No: sigue la ruta prevista', 26);
    await page.keyboard.press('Enter');            // → "2.3. "
    await page.keyboard.press('Shift+Tab');        // → "3. " (vuelve al nivel raíz)
    mark('keyEnter');
    await h.type('Avisa al cliente por WhatsApp', 26);
    await h.wait(350);
    const listTxt = await h.ev(() => {
      var bs = blocksOf('note1'); var b = bs[bs.length - 1];
      b.x = 90; b.y = 2300; b.width = 320; save(); renderCanvas();
      return b.content.text;
    });
    console.log('    lista: ' + JSON.stringify(listTxt));
    await page.keyboard.press('Escape');
    await h.wait(300);
    const listId = await h.blockIdByText('El repartidor mete las paradas');
    await h.centerCard(listId);
    await h.wait(400);
    await h.clickSel('.card[data-id="' + listId + '"] .card-fmt-btn:not(.card-analyze-btn)');
    await h.wait(450);
    mark('whoosh');
    await h.clickSel('.card-menu-pop .cm-item:has-text("Lista → flujograma")');
    await page.waitForFunction(() => blocksOf('note1').some(function (x) { return x.type === 'shape' && x.y > 2200; }), null, { timeout: 10000 });
    await h.wait(900);
    for (let i = 0; i < 6; i++) { mark('pop'); await h.wait(80); }
    await h.frameRect(80, 2240, 1060, 2880, 60);
    mark('success');
    await h.wait(1500);
  });

  // S10 — Python ejecutable (Pyodide real).
  await scene('10-python', async (page, h) => {
    await h.chapter('09', 'Ejecuta Python en tus notas', 'cálculos y prototipos sin salir');
    await h.ev(() => {
      data.blocks = data.blocks.filter(function (x) { return !(x.noteId === 'note1' && x.type === 'python'); });
      var v = getView(); v.zoom = 1; applyView(); saveView();
      var b = addBlock('note1', 'python', 560, 2300);
      b.width = 420; b.height = 300;
      save(); renderCanvas(); centerOn(b.x + 210, b.y + 150);
      ensurePyodide().catch(function () {});
    });
    await h.wait(700);
    const pyId = await h.blockIdByText('Escribe Python y pulsa Ejecutar');
    await h.clickSel('.card[data-id="' + pyId + '"] .card-ta');
    await page.keyboard.press('Meta+a');
    await h.type('paradas = 8\nkm_entre_paradas = 1.8\ntotal = paradas * km_entre_paradas\nprint(f"{paradas} paradas ≈ {total:.1f} km")\nprint(f"En bici (~15 km/h): {total / 15 * 60:.0f} min de ruta")\nprint("Ahorro estimado: 35 min al día")', 34);
    await h.wait(300);
    mark('run');
    await h.clickSel('.card[data-id="' + pyId + '"] .mono-fmt.run');
    await page.waitForSelector('.card[data-id="' + pyId + '"] .mono-status.ok', { timeout: 60000 });
    mark('success');
    await h.wait(1700);
  });

  // S11 — cURL contra una API real.
  await scene('11-curl', async (page, h) => {
    await h.chapter('10', 'Lanza peticiones cURL', 'prueba tu API mientras diseñas');
    await h.ev(() => {
      data.blocks = data.blocks.filter(function (x) { return !(x.noteId === 'note1' && x.type === 'curl'); });
      var v = getView(); v.zoom = 1; applyView(); saveView();
      var b = addBlock('note1', 'curl', 1060, 2300);
      b.width = 430; b.height = 280;
      save(); renderCanvas(); centerOn(b.x + 215, b.y + 140);
    });
    await h.wait(500);
    const curlId = await h.ev(() => {
      var bs = blocksOf('note1'); var b = bs[bs.length - 1]; return b.id;
    });
    const target = process.env.CURL_TARGET || 'curl -s "https://api.open-meteo.com/v1/forecast?latitude=40.42&longitude=-3.7&current=temperature_2m,wind_speed_10m"';
    await h.typeInto('.card[data-id="' + curlId + '"] .card-ta', target, 30);
    await h.wait(250);
    mark('run');
    await h.clickSel('.card[data-id="' + curlId + '"] .mono-fmt.run');
    await page.waitForSelector('.card[data-id="' + curlId + '"] .mono-status.ok, .card[data-id="' + curlId + '"] .mono-status.err', { timeout: 30000 });
    mark('success');
    await h.wait(3200); // deja leer el JSON con calma
  });

  // S12 — Anotar y recortar una captura (editor de imagen real).
  await scene('12-imagen', async (page, h) => {
    // Captura real del lienzo (las fases Lean) como "mockup de referencia".
    await h.ev(() => { window.__demo.cursor(false); window.__demo.chapter('x', '', '', 1); centerOn(860, 400); });
    await h.wait(600);
    const shot = await page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(OUT, 'mockup-fuente.png'), shot);
    await h.ev(() => window.__demo.cursor(true));
    await h.chapter('11', 'Anota y recorta tus capturas', 'flechas, texto y recorte sin salir');
    const b64 = shot.toString('base64');
    const imgId = await h.ev((b64d) => {
      // Limpia posibles restos de intentos anteriores (blobs huérfanos).
      data.blocks = data.blocks.filter(function (x) { return !(x.type === 'image' && x.noteId === 'note1'); });
      var bytes = Uint8Array.from(atob(b64d), function (c) { return c.charCodeAt(0); });
      var file = new File([bytes], 'mockup-rutapp.png', { type: 'image/png' });
      var v = getView(); v.zoom = 1; applyView(); saveView();
      var b = addBlock('note1', 'image', 90, 2900);
      window.__demoImgId = b.id;
      b.title = 'Mockup de referencia';
      save(); renderCanvas();
      addImagesToBlock(b, [file], function () {
        save(); renderCanvas();
        var el = cardEl(b.id); if (el && typeof fitImageCard === 'function') fitImageCard(el, b);
        centerOn(b.x + 260, b.y + 200);
      });
      return b.id;
    }, b64);
    await h.wait(1200);
    // Cursor sobre la imagen y doble clic directo (el handler vive en el propio <img>).
    const imgSel = '.card[data-id="' + imgId + '"] .img-media img';
    const imgBb = await page.locator(imgSel).first().boundingBox();
    if (imgBb) { await page.mouse.move(imgBb.x + imgBb.width / 2, imgBb.y + imgBb.height / 2, { steps: 18 }); await h.wait(250); }
    mark('click');
    await h.ev((sel2) => document.querySelector(sel2).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), imgSel);
    await h.wait(300);
    await page.waitForSelector('#imgEditor .imed-canvas', { timeout: 8000 });
    mark('whoosh');
    await h.wait(900);
    let cb = await page.locator('#imgEditor .imed-canvas').boundingBox();
    // 1) Recorte del área útil.
    await h.clickSel('.imed-tool[data-tool="crop"]');
    await h.drag(cb.x + cb.width * 0.10, cb.y + cb.height * 0.10, cb.x + cb.width * 0.92, cb.y + cb.height * 0.88);
    await h.clickSel('.imed-btn[title="Aplicar el recorte marcado"]');
    mark('ding');
    await h.wait(900);
    cb = await page.locator('#imgEditor .imed-canvas').boundingBox();
    // 2) Flecha roja señalando.
    await h.clickSel('.imed-tool[data-tool="arrow"]');
    await h.drag(cb.x + cb.width * 0.16, cb.y + cb.height * 0.78, cb.x + cb.width * 0.44, cb.y + cb.height * 0.42);
    mark('draw');
    await h.wait(500);
    // 3) Nota de texto sobre la imagen.
    await h.clickSel('.imed-tool[data-tool="text"]');
    await h.clickAt(cb.x + cb.width * 0.10, cb.y + cb.height * 0.14);
    await page.waitForSelector('.imed-text-input', { timeout: 4000 });
    await h.type('¡Esta pantalla es la clave!', 26);
    await page.keyboard.press('Enter');
    mark('pop');
    await h.wait(600);
    // 4) Aplicar.
    mark('success');
    await h.clickSel('.imed-btn.primary');
    await h.wait(1100);
  });

  // S13 — Agrupar lo relacionado.
  await scene('13-grupos', async (page, h) => {
    await h.chapter('12', 'Agrupa lo que va junto', 'selecciona, agrupa y ponle nombre');
    // Baja python/curl para que el marquee abarque solo el flujograma.
    await h.ev(() => {
      blocksOf('note1').forEach(function (x) {
        if (x.type === 'python') { x.x = 560; x.y = 3150; }
        if (x.type === 'curl') { x.x = 1060; x.y = 3150; }
      });
      data.groups = data.groups.filter(function (g) { return !/Flujo del repartidor/.test(g.name); });
      save(); renderCanvas(); renderSidebar();
    });
    await h.frameRect(480, 2180, 1040, 2980, 50);
    await h.wait(500);
    const a = await h.worldToScreen(500, 2200);
    const bpt = await h.worldToScreen(1020, 2960);
    await h.drag(a.x, a.y, bpt.x, bpt.y, 'whoosh');
    await page.waitForSelector('.sel-bar .sel-group', { timeout: 5000 });
    mark('pop');
    await h.wait(400);
    await h.clickSel('.sel-bar .sel-group');
    await page.waitForSelector('.group-head', { timeout: 6000 });
    mark('success');
    await h.wait(900);
    // Renombrar el grupo.
    await h.dblclickSel('.group-head[data-ghead] .group-name >> nth=-1');
    const gInp = page.locator('.group-head input');
    await gInp.waitFor({ state: 'visible', timeout: 4000 });
    await h.wait(400);
    mark('keyEnter');
    await gInp.fill('Flujo del repartidor'); // fill atómico: sin carrera de foco
    await h.wait(550);
    mark('ding');
    await gInp.press('Enter');
    await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('.group-name'), function (el) { return /Flujo del repartidor/.test(el.textContent); }), null, { timeout: 5000 });
    await h.wait(1100);
  });

  // S14 — Kanban.
  await scene('14-kanban', async (page, h) => {
    await h.chapter('13', 'Tu avance, en un Kanban', 'por hacer · en curso · hecho');
    // Manda la nota de pendientes al tablero (menú real).
    await h.ev(() => {
      data.blocks = data.blocks.filter(function (x) { var t = (x.content && x.content.text) || ''; return t.indexOf('Presentar el piloto') < 0; });
      var t2 = blocksOf('note1').find(function (x) { return (x.content.text || '').indexOf('Hablar con 5 tiendas') >= 0; });
      if (t2) { delete t2.kanban; delete t2.kanbanAt; delete t2.kanbanOrder; }
      save(); renderCanvas();
    });
    const tasksId = await h.blockIdByText('Hablar con 5 tiendas');
    await h.ev((id) => { var v = getView(); v.zoom = 1; applyView(); saveView(); focusBlock(id); }, tasksId);
    await h.centerCard(tasksId, 0.55);
    await h.wait(600);
    await h.clickSel('.card[data-id="' + tasksId + '"] .card-menu');
    await h.wait(400);
    await h.clickSel('.card-menu-pop .cm-item:has-text("Enviar a Kanban")');
    mark('pop');
    await h.wait(600);
    mark('whoosh');
    await h.clickSel('[title^="Kanban"]');
    await page.waitForSelector('.kanban-panel', { timeout: 5000 });
    await h.wait(800);
    await h.typeInto('.kanban-add-inp', 'Presentar el piloto a 3 tiendas', 26);
    await page.keyboard.press('Enter');
    mark('pop');
    await h.wait(800);
    // Mueve la tarjeta de pendientes a "En progreso".
    const cardSel = '.kanban-card:has-text("Hablar con 5 tiendas")';
    await h.clickSel(cardSel + ' .kc-btn[title="Mover a la derecha"]');
    mark('ding');
    await h.wait(900);
    await h.clickSel('.kanban-head .icon-btn[title="Cerrar"]');
    await h.wait(500);
  });

  // S15 — Recordatorio con alarma real.
  await scene('15-alarma', async (page, h) => {
    await h.chapter('14', 'Recordatorios que suenan', 'la alarma te avisa estés donde estés');
    const tasksId = await h.blockIdByText('Hablar con 5 tiendas');
    await h.ev((id) => { var v = getView(); v.zoom = 1; applyView(); focusBlock(id); }, tasksId);
    await h.centerCard(tasksId, 0.55);
    await h.wait(600);
    await h.clickSel('.card[data-id="' + tasksId + '"] .card-menu');
    await h.wait(400);
    await h.clickSel('.card-menu-pop .cm-chip:has-text("En 15 min")');
    mark('ding');
    await h.wait(900);
    // Adelanta el reloj para la demo: que venza en un suspiro.
    await h.ev((id) => {
      var b = getBlockById(id);
      b.reminder.at = now() + 2600;
      save(); renderCanvas();
      setTimeout(function () { checkReminders(); }, 2900);
    }, tasksId);
    await page.waitForSelector('#alarmOverlay', { timeout: 9000 });
    mark('alarm');
    await h.wait(2600);
    await h.clickSel('#alarmOverlay .alarm-item .alarm-btn:not(.ghost)');
    mark('click');
    await h.wait(700);
  });

  // S16 — No perderte en el lienzo infinito.
  await scene('16-perdido', async (page, h) => {
    await h.chapter('15', 'Un lienzo infinito sin perderte', 'minimapa, «volver al contenido» y «ver todo»');
    await h.ev(() => { var v = getView(); v.zoom = 0.9; applyView(); saveView(); centerOn(700, 1400); });
    await h.wait(700);
    // Salta con el minimapa.
    const mm = await page.locator('#miniMap').boundingBox().catch(() => null);
    if (mm) { await h.clickAt(mm.x + mm.width * 0.5, mm.y + mm.height * 0.75); mark('pop'); await h.wait(600); }
    // Vete muy lejos con la rueda.
    await page.mouse.move(640, 380);
    mark('whoosh');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1700); await h.wait(280); }
    await h.wait(700);
    let hasHint = await page.$('#lostHint');
    if (!hasHint) { await h.ev(() => updateLostHint()); await h.wait(400); }
    await h.clickSel('#lostHint');
    mark('ding');
    await h.wait(900);
    mark('whoosh');
    await h.clickSel('[title^="Ver todo el lienzo"]');
    mark('success');
    await h.wait(2200);
  });

  // S17 — Cierre.
  await scene('17-cierre', async (page, h) => {
    await h.ev(() => fitView());
    await h.wait(800);
    mark('magic');
    await h.ev(() => window.__demo.cover('tuNota', 'tu lienzo infinito con IA: ideas, mapas, código, kanban y alarmas',
      'gratis y en tu navegador · <b>tunota.fly.dev</b> &nbsp;·&nbsp; si te sirve, invítame un cafecito ☕'));
    await h.wait(3400);
    await h.ev(() => window.__demo.uncover());
    await h.wait(600);
  });

  await browser.close();
  saveSfx();
  console.log('\nGrabación completa → ' + OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
