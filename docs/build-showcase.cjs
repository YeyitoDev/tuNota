#!/usr/bin/env node
/*
 * Genera docs/showcase.html (página dinámica de showcase) a partir de docs/guia-features.md.
 * Sin dependencias. Uso:  node docs/build-showcase.js
 * La página es autocontenida (el contenido se incrusta), con TOC + scroll-spy, buscador
 * y lightbox de capturas. Las imágenes se referencian de forma relativa (screenshots/…),
 * así que funciona abierta directamente (file://) o servida por http.
 */
const fs = require('fs');
const path = require('path');

const DOCS = __dirname;
const MD = path.join(DOCS, 'guia-features.md');
const OUT = path.join(DOCS, 'showcase.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
// Markdown en línea: **negrita**, `código`, [texto](url), *cursiva*.
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

function parse(md) {
  const lines = md.split(/\r?\n/);
  const doc = { title: '', meta: [], lead: [], sections: [] };
  let sec = null, item = null, para = [];
  const flushPara = (target) => { if (para.length && target) target.push({ type: 'p', html: inline(para.join(' ')) }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^#\s+/.test(t)) { doc.title = t.replace(/^#\s+/, ''); continue; }
    // Fila de tabla de metadatos: | **Clave** | Valor |
    const mm = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|$/.exec(t);
    if (mm) { doc.meta.push({ k: mm[1], v: inline(mm[2]) }); continue; }
    if (/^\|/.test(t)) continue; // otras filas de tabla (cabecera/separador)
    if (/^##\s+/.test(t)) { flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead)); sec = { title: t.replace(/^##\s+/, ''), id: slug(t.replace(/^##\s+/, '')), items: [], blocks: [] }; doc.sections.push(sec); item = null; continue; }
    if (/^###\s+/.test(t)) { flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead)); const title = t.replace(/^###\s+/, ''); item = { title: title, id: slug(title), blocks: [] }; (sec ? sec.items : (sec = { title: '', id: '', items: [], blocks: [] }, doc.sections.push(sec), sec.items)).push(item); continue; }
    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(t);
    if (img) { flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead)); (item ? item.blocks : (sec ? sec.blocks : doc.lead)).push({ type: 'img', alt: img[1], src: img[2] }); continue; }
    if (/^---+$/.test(t)) { flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead)); continue; }
    if (!t) { flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead)); continue; }
    para.push(t);
  }
  flushPara(item ? item.blocks : (sec ? sec.blocks : doc.lead));
  return doc;
}

function blocksHtml(blocks) {
  return blocks.map((b) => {
    if (b.type === 'img') return `<figure class="shot"><img loading="lazy" src="${esc(b.src)}" alt="${esc(b.alt)}"><figcaption>${esc(b.alt)}</figcaption></figure>`;
    return `<p>${b.html}</p>`;
  }).join('\n');
}

function render(doc) {
  const nav = doc.sections.map((s) => {
    const kids = s.items.filter((it) => it.title).map((it) => `<a href="#${it.id}" class="nav-sub">${esc(it.title)}</a>`).join('');
    return `<div class="nav-group"><a href="#${s.id}" class="nav-sec">${esc(s.title)}</a>${kids}</div>`;
  }).join('\n');

  const meta = doc.meta.map((m) => `<span class="badge"><b>${esc(m.k)}</b> ${m.v}</span>`).join('');
  const lead = blocksHtml(doc.lead);

  const main = doc.sections.map((s) => {
    const intro = blocksHtml(s.blocks);
    const items = s.items.map((it) => {
      if (!it.title) return blocksHtml(it.blocks);
      const searchText = esc((it.title + ' ' + it.blocks.map((b) => b.html || b.alt || '').join(' ')).toLowerCase());
      return `<article class="feature" id="${it.id}" data-search="${searchText}">
        <h3>${esc(it.title)}</h3>
        <div class="feature-body">${blocksHtml(it.blocks)}</div>
      </article>`;
    }).join('\n');
    return `<section class="sec" id="${s.id}"><h2>${esc(s.title)}</h2>${intro}${items}</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
  :root{ --bg:#f4ede0; --fg:#33302b; --card:#fdfaf3; --muted:#8a8378; --border:#e4dccc; --secondary:#ece4d6; --primary:#c2745b; --sage:#8a9a7b; --ocre:#d9a35a; --shadow:0 2px 12px -2px rgba(58,51,44,.1); --shadow-lg:0 12px 34px -10px rgba(58,51,44,.22); }
  *{box-sizing:border-box} html{scroll-behavior:smooth}
  body{margin:0;font-family:'Nunito',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);line-height:1.55}
  a{color:var(--primary);text-decoration:none} a:hover{text-decoration:underline}
  code{background:var(--secondary);padding:1px 6px;border-radius:6px;font-size:.9em;font-family:ui-monospace,Menlo,monospace}
  .hero{padding:54px 24px 30px;max-width:1080px;margin:0 auto;text-align:center}
  .hero h1{font-family:Georgia,'Times New Roman',serif;font-size:40px;margin:0 0 8px;font-weight:700}
  .hero .lead p{font-size:17px;color:var(--muted);max-width:680px;margin:6px auto}
  .badges{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:18px 0 6px}
  .badge{background:var(--card);border:1px solid var(--border);border-radius:999px;padding:5px 12px;font-size:12.5px;box-shadow:var(--shadow)}
  .badge b{color:var(--sage)}
  .search-wrap{margin:22px auto 0;max-width:460px}
  .search-wrap input{width:100%;padding:11px 16px;border:1px solid var(--border);border-radius:999px;background:var(--card);color:var(--fg);font:inherit;font-size:15px;box-shadow:var(--shadow)}
  .layout{display:grid;grid-template-columns:250px 1fr;gap:32px;max-width:1180px;margin:12px auto 60px;padding:0 24px}
  nav.toc{position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow:auto;font-size:14px}
  .nav-group{margin-bottom:10px}
  .nav-sec{display:block;font-weight:800;color:var(--fg);padding:6px 8px;border-radius:8px}
  .nav-sub{display:block;color:var(--muted);padding:4px 8px 4px 18px;border-radius:8px;font-size:13px}
  nav.toc a.active{background:var(--secondary);color:var(--primary)}
  nav.toc a:hover{background:var(--secondary);text-decoration:none}
  main{min-width:0}
  .sec{margin-bottom:20px}
  .sec>h2{font-family:Georgia,serif;font-size:24px;border-bottom:2px solid var(--border);padding-bottom:8px;margin:34px 0 18px}
  .feature{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px 22px;margin:16px 0;box-shadow:var(--shadow)}
  .feature h3{margin:0 0 10px;font-size:19px}
  .feature-body{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;align-items:start}
  .feature-body p{margin:0 0 10px}
  figure.shot{margin:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--secondary);cursor:zoom-in}
  figure.shot img{display:block;width:100%;height:auto}
  figure.shot figcaption{display:none}
  .feature:has(figure) .feature-body{grid-template-columns:1fr 1.2fr}
  @media(max-width:820px){ .layout{grid-template-columns:1fr} nav.toc{display:none} .feature-body{grid-template-columns:1fr} }
  .lightbox{position:fixed;inset:0;background:rgba(24,20,17,.86);display:none;align-items:center;justify-content:center;z-index:100;cursor:zoom-out;padding:24px}
  .lightbox.open{display:flex}
  .lightbox img{max-width:96vw;max-height:92vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .empty-note{color:var(--muted);text-align:center;padding:40px}
  footer{text-align:center;color:var(--muted);font-size:13px;padding:30px}
</style>
</head>
<body>
  <header class="hero">
    <h1>${esc(doc.title)}</h1>
    <div class="lead">${lead}</div>
    <div class="badges">${meta}</div>
    <div class="search-wrap"><input id="q" type="search" placeholder="Buscar una funcionalidad…" autocomplete="off"></div>
  </header>
  <div class="layout">
    <nav class="toc">${nav}</nav>
    <main>${main}<p class="empty-note" id="noResults" style="display:none">Sin resultados para tu búsqueda.</p></main>
  </div>
  <div class="lightbox" id="lightbox"><img id="lightbox-img" alt=""></div>
  <footer>Generado desde <code>docs/guia-features.md</code> · tuNota</footer>
<script>
  // Lightbox
  var lb = document.getElementById('lightbox'), lbi = document.getElementById('lightbox-img');
  document.querySelectorAll('figure.shot img').forEach(function(img){
    img.addEventListener('click', function(){ lbi.src = img.src; lbi.alt = img.alt; lb.classList.add('open'); });
  });
  lb.addEventListener('click', function(){ lb.classList.remove('open'); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') lb.classList.remove('open'); });
  // Buscador
  var q = document.getElementById('q'), feats = Array.prototype.slice.call(document.querySelectorAll('.feature')), noRes = document.getElementById('noResults');
  q.addEventListener('input', function(){
    var v = q.value.trim().toLowerCase(), shown = 0;
    feats.forEach(function(f){ var hit = !v || (f.getAttribute('data-search')||'').indexOf(v) >= 0; f.style.display = hit ? '' : 'none'; if(hit) shown++; });
    document.querySelectorAll('.sec').forEach(function(s){ var any = s.querySelector('.feature:not([style*="display: none"])'); s.style.display = (v && !any) ? 'none' : ''; });
    noRes.style.display = shown ? 'none' : '';
  });
  // Scroll-spy del TOC
  var links = {}; document.querySelectorAll('nav.toc a').forEach(function(a){ links[a.getAttribute('href').slice(1)] = a; });
  var targets = Array.prototype.slice.call(document.querySelectorAll('.sec, .feature'));
  var spy = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ var a = links[en.target.id]; if(a){ Object.keys(links).forEach(function(k){ links[k].classList.remove('active'); }); a.classList.add('active'); } } });
  }, { rootMargin: '-10% 0px -80% 0px' });
  targets.forEach(function(t){ if(t.id) spy.observe(t); });
</script>
</body>
</html>`;
}

const md = fs.readFileSync(MD, 'utf8');
fs.writeFileSync(OUT, render(parse(md)));
console.log('showcase generado → ' + path.relative(process.cwd(), OUT));
