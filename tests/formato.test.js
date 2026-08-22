// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARCA = '\u0001'; // marcador de imagen intercalada en el texto plano

// El editor enriquecido vive en el DOM, así que estas pruebas corren sobre jsdom cargando
// los módulos reales. Lo que se fija aquí es el contrato que sostiene todo lo demás:
// content.html es lo que ves, content.text es lo que leen la IA, el buscador y las tareas.
function bootApp() {
  const ctx = {
    console, setTimeout, clearTimeout, document, window, navigator,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
  };
  ctx.window = window;
  vm.createContext(ctx);
  for (const f of ['06-markdown-mermaid.js', '25-rich.js']) {
    // Solo se necesitan las piezas puras; el resto del módulo referencia funciones de otros
    // ficheros que aquí no hacen falta porque no se llaman.
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: 'js/' + f });
  }
  ctx.resolveSrc = (s) => s;
  ctx.snippet = (t) => String(t).slice(0, 48);
  ctx.touchNote = () => {};
  ctx.logChange = () => {};
  return ctx;
}
const conHtml = (app, html) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return app.richToText(d);
};

describe('de HTML a texto plano — lo que leerán la IA y el buscador', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('convierte párrafos y saltos en líneas', () => {
    expect(conHtml(app, '<p>uno</p><p>dos</p>')).toBe('uno\ndos');
    expect(conHtml(app, 'uno<br>dos')).toBe('uno\ndos');
  });

  it('numera las listas ordenadas de verdad, no deja los <li> pelados', () => {
    expect(conHtml(app, '<ol><li>alfa</li><li>beta</li><li>gamma</li></ol>')).toBe('1. alfa\n2. beta\n3. gamma');
  });

  it('las viñetas salen con guión', () => {
    expect(conHtml(app, '<ul><li>alfa</li><li>beta</li></ul>')).toBe('- alfa\n- beta');
  });

  it('las casillas conservan su estado', () => {
    expect(conHtml(app, '<ul><li data-task="todo">pendiente</li><li data-task="done">hecha</li></ul>'))
      .toBe('- [ ] pendiente\n- [x] hecha');
  });

  it('el formato desaparece: queda solo el texto', () => {
    expect(conHtml(app, '<p>Hola <strong>mundo</strong> <mark>bonito</mark> y <em>raro</em></p>'))
      .toBe('Hola mundo bonito y raro');
  });

  it('una imagen intercalada vuelve a su marcador, para no perder la referencia', () => {
    const t = conHtml(app, '<p>antes<img data-inline="2" src="x">despues</p>');
    expect(t).toBe('antes' + MARCA + '2' + MARCA + 'despues');
  });

  it('una imagen pegada de fuera (sin índice) no ensucia el texto', () => {
    expect(conHtml(app, '<p>hola<img src="http://x/y.png">adios</p>')).toBe('holaadios');
  });

  it('los títulos y las citas son líneas normales', () => {
    expect(conHtml(app, '<h1>Informe</h1><blockquote>una cita</blockquote><p>fin</p>'))
      .toBe('Informe\nuna cita\nfin');
  });

  it('colapsa los saltos de sobra y recorta los de los extremos', () => {
    expect(conHtml(app, '<p></p><p></p><p>solo</p><p></p>')).toBe('solo');
  });
});

describe('de texto plano a HTML — al abrir una nota que ya tenías', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('los marcadores que hubieras escrito antes se convierten en formato de verdad', () => {
    const b = { content: { text: 'Con **negrita** y ==resaltado== y ++subrayado++' } };
    const html = app.richFromText(b);
    expect(html).toMatch(/<strong>negrita<\/strong>/);
    expect(html).toMatch(/<mark>resaltado<\/mark>/);
    expect(html).toMatch(/<u>subrayado<\/u>/);
  });

  it('una lista escrita a mano pasa a ser una lista de verdad', () => {
    const html = app.richFromText({ content: { text: '1. uno\n2. dos' } });
    expect(html).toMatch(/<ol>/);
    expect(html).toMatch(/<li>uno<\/li>/);
  });

  it('las imágenes intercaladas sobreviven a la conversión', () => {
    const b = { content: { text: 'antes' + MARCA + '0' + MARCA + 'despues', inlineImages: [{ src: 'blob:abc' }] } };
    const html = app.richFromText(b);
    expect(html).toMatch(/<img data-inline="0"/);
    expect(html).toMatch(/src="blob:abc"/);
  });

  it('un bloque vacío no inventa contenido', () => {
    expect(app.richFromText({ content: { text: '' } })).toBe('');
  });
});

describe('ensureRichHtml — cuándo se regenera', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('la primera vez lo genera y recuerda de qué texto salió', () => {
    const b = { content: { text: 'hola **mundo**' } };
    const html = app.ensureRichHtml(b);
    expect(html).toMatch(/<strong>/);
    expect(b.content.htmlFrom).toBe('hola **mundo**');
  });

  it('si nada cambió, devuelve el mismo html sin rehacerlo', () => {
    const b = { content: { text: 'hola' } };
    app.ensureRichHtml(b);
    b.content.html = '<p>editado a mano</p>';
    expect(app.ensureRichHtml(b)).toBe('<p>editado a mano</p>');
  });

  it('si algo reescribe el texto por fuera (la IA), el html se rehace solo', () => {
    const b = { content: { text: 'viejo' } };
    app.ensureRichHtml(b);
    b.content.text = 'nuevo **desde la IA**';          // la IA escribe content.text
    const html = app.ensureRichHtml(b);
    expect(html).toMatch(/<strong>desde la IA<\/strong>/);
    expect(b.content.htmlFrom).toBe('nuevo **desde la IA**');
  });
});

describe('limpieza de lo que se pega', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('conserva el formato útil', () => {
    const out = app.sanitizeRich('<p>Hola <strong>mundo</strong> <em>bonito</em></p><ul><li>uno</li></ul>');
    expect(out).toMatch(/<strong>mundo<\/strong>/);
    expect(out).toMatch(/<li>uno<\/li>/);
  });

  it('descarta el script pero se queda con el texto que envolvía otra etiqueta', () => {
    const out = app.sanitizeRich('<div>seguro<script>alert(1)</script></div>');
    expect(out).not.toMatch(/alert/);
    expect(out).toMatch(/seguro/);
  });

  it('quita un enlace con javascript: y deja el texto', () => {
    const out = app.sanitizeRich('<a href="javascript:alert(1)">pincha</a>');
    expect(out).not.toMatch(/javascript:/);
    expect(out).toMatch(/pincha/);
  });

  it('tira los manejadores de eventos y las clases ajenas', () => {
    const out = app.sanitizeRich('<p onclick="robar()" class="de-otra-web" id="x">texto</p>');
    expect(out).not.toMatch(/onclick|de-otra-web|id=/);
    expect(out).toMatch(/texto/);
  });

  it('de los estilos solo deja los de texto', () => {
    const out = app.sanitizeRich('<span style="color:red;position:fixed;width:900px">rojo</span>');
    expect(out).toMatch(/color:\s*red/);
    expect(out).not.toMatch(/position|width/);
  });

  it('respeta los datos propios: el índice de imagen y el estado de la casilla', () => {
    const out = app.sanitizeRich('<img data-inline="3" src="blob:x"><li data-task="done">ya</li>');
    expect(out).toMatch(/data-inline="3"/);
    expect(out).toMatch(/data-task="done"/);
  });
});

describe('ida y vuelta: escribir, guardar y volver a abrir', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('el texto plano que se deriva vuelve a producir el mismo formato', () => {
    const b = { content: { text: '1. uno\n2. dos\n\nUn parrafo' } };
    const html1 = app.ensureRichHtml(b);
    const d = document.createElement('div');
    d.innerHTML = html1;
    const texto = app.richToText(d);
    expect(texto).toBe('1. uno\n2. dos\n\nUn parrafo');   // la ida y vuelta es exacta
    // Y ese texto vuelve a componer la misma lista
    expect(app.richFromText({ content: { text: texto } })).toMatch(/<ol>/);
  });
});
