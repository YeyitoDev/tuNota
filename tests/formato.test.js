import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './harness.js';

// La barra de texto escribe marcadores markdown en un textarea. Estas pruebas fijan el
// comportamiento del toggle, que es donde más fácil se cuela un error de índices.
function bootApp() {
  const app = loadApp(['01-storage.js', '02-state.js', '24-formato.js']);
  app.h = () => ({ style: {}, appendChild() {}, addEventListener() {} });
  app.pushUndo = () => {};
  app.touchNote = () => {};
  app.snippet = (t) => String(t).slice(0, 48);
  app.save = () => {};
  app.serverSave = () => {};
  app.cardEl = () => null;
  app.positionFmtBar = () => {};
  app.data = { notebooks: [], sections: [], notes: [], blocks: [], links: [], log: [], plan: [] };
  app.ui = {};
  return app;
}
// Un textarea de mentira: value + selección, que es todo lo que toca el código.
function fakeTa(value, start, end) {
  return { value, selectionStart: start, selectionEnd: end ?? start, isConnected: false, focus() {} };
}
function aplicar(app, texto, ini, fin, marca) {
  const ta = fakeTa(texto, ini, fin);
  const b = { id: 'b1', noteId: 'n1', content: { text: texto } };
  app.applyCharMark(b, ta, marca);
  return { texto: ta.value, sel: [ta.selectionStart, ta.selectionEnd], guardado: b.content.text };
}

describe('estilo de carácter — poner y quitar', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('envuelve la selección y deja seleccionado el texto, no los marcadores', () => {
    const r = aplicar(app, 'hola mundo', 5, 10, 'bold');
    expect(r.texto).toBe('hola **mundo**');
    expect(r.texto.slice(r.sel[0], r.sel[1])).toBe('mundo');
  });

  it('el mismo botón lo quita si ya estaba puesto', () => {
    const r = aplicar(app, 'hola **mundo**', 5, 14, 'bold');
    expect(r.texto).toBe('hola mundo');
  });

  it('también lo quita si seleccionaste el texto sin los marcadores', () => {
    const r = aplicar(app, 'hola **mundo**', 7, 12, 'bold');
    expect(r.texto).toBe('hola mundo');
    expect(r.texto.slice(r.sel[0], r.sel[1])).toBe('mundo');
  });

  it('sin selección actúa sobre la palabra bajo el cursor', () => {
    const r = aplicar(app, 'hola mundo', 7, 7); // cursor dentro de "mundo"
    const s = aplicar(app, 'hola mundo', 7, 7, 'italic');
    expect(s.texto).toBe('hola _mundo_');
  });

  it('cada marca usa su propio par de marcadores', () => {
    expect(aplicar(app, 'x', 0, 1, 'underline').texto).toBe('++x++');
    expect(aplicar(app, 'x', 0, 1, 'highlight').texto).toBe('==x==');
    expect(aplicar(app, 'x', 0, 1, 'strike').texto).toBe('~~x~~');
    expect(aplicar(app, 'x', 0, 1, 'code').texto).toBe('`x`');
  });

  it('se pueden anidar dos estilos sobre el mismo texto', () => {
    const uno = aplicar(app, 'clave', 0, 5, 'bold');
    const ta = fakeTa(uno.texto, uno.sel[0], uno.sel[1]);
    const b = { id: 'b1', noteId: 'n1', content: {} };
    app.applyCharMark(b, ta, 'highlight');
    expect(ta.value).toBe('**==clave==**');
  });

  it('guarda el resultado en el bloque', () => {
    const r = aplicar(app, 'hola', 0, 4, 'bold');
    expect(r.guardado).toBe('**hola**');
  });

  it('una marca desconocida no toca nada', () => {
    const ta = fakeTa('hola', 0, 4);
    const b = { id: 'b1', noteId: 'n1', content: {} };
    app.applyCharMark(b, ta, 'inventada');
    expect(ta.value).toBe('hola');
  });
});

describe('quitar todo el formato', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('deja el texto limpio de marcadores de carácter y de párrafo', () => {
    const ta = fakeTa('## Título\n**negrita** y ==resaltado== y ++sub++ y ~~tachado~~ y `code`\n> cita', 0, 0);
    const b = { id: 'b1', noteId: 'n1', content: {} };
    app.clearFormatting(b, ta);
    expect(ta.value).toBe('Título\nnegrita y resaltado y sub y tachado y code\ncita');
  });

  it('sin selección limpia el bloque entero; con selección solo esa parte', () => {
    const ta = fakeTa('**uno** **dos**', 0, 7);
    const b = { id: 'b1', noteId: 'n1', content: {} };
    app.clearFormatting(b, ta);
    expect(ta.value).toBe('uno **dos**');
  });
});

describe('transformaciones de párrafo', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('el título sustituye al que ya hubiera, no se acumula', () => {
    expect(app.headingFn(2)('## Hola')).toBe('## Hola');
    expect(app.headingFn(1)('### Hola')).toBe('# Hola');
    expect(app.headingFn(0)('### Hola')).toBe('Hola');
  });

  it('la cita se pone y se quita con el mismo botón', () => {
    expect(app.quoteFn('uno\ndos')).toBe('> uno\n> dos');
    expect(app.quoteFn('> uno\n> dos')).toBe('uno\ndos');
  });

  it('la sangría respeta las líneas en blanco y no baja de cero', () => {
    expect(app.indentFn(1)('a\n\nb')).toBe('  a\n\n  b');
    expect(app.indentFn(-1)('  a\n\n  b')).toBe('a\n\nb');
    expect(app.indentFn(-1)('a')).toBe('a');
  });
});

describe('estilo del bloque', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('cada familia conocida tiene su css y las demás caen en la predeterminada', () => {
    expect(app.textFontCss('mono')).toMatch(/monospace/);
    expect(app.textFontCss('serif')).toMatch(/Fraunces/);
    expect(app.textFontCss('')).toBe('');
    expect(app.textFontCss('inventada')).toBe('');
  });

  it('guarda el ajuste y lo borra al restablecerlo', () => {
    const b = { id: 'b1', noteId: 'n1', content: { text: 'x' } };
    app.setNoteTextStyle(b, 'size', 22, 'tamaño');
    expect(b.content.size).toBe(22);
    app.setNoteTextStyle(b, 'size', '', 'tamaño');
    expect('size' in b.content).toBe(false);
  });
});

describe('recorte de la selección — el marcador tiene que quedar pegado al texto', () => {
  let app;
  beforeEach(() => { app = bootApp(); });
  const marcar = (texto, ini, fin, k = 'bold') => {
    const ta = fakeTa(texto, ini, fin);
    app.applyCharMark({ id: 'b1', noteId: 'n1', content: {} }, ta, k);
    return ta.value;
  };

  it('deja fuera los espacios de los extremos', () => {
    expect(marcar('hola mundo cruel', 4, 11)).toBe('hola **mundo** cruel');
  });

  it('deja fuera un salto de línea al principio de la selección', () => {
    expect(marcar('titulo\nprimera linea', 6, 14)).toBe('titulo\n**primera** linea');
  });

  it('no marca nada si solo seleccionaste espacios', () => {
    expect(marcar('hola   mundo', 4, 7)).toBe('hola   mundo');
  });

  it('una selección de varias líneas se recorta por fuera, no por dentro', () => {
    expect(marcar('  uno\ndos  ', 0, 11)).toBe('  **uno\ndos**  ');
  });
});

describe('convertir en lista una línea que era título o cita', () => {
  let app;
  beforeEach(() => { app = bootApp(); });

  it('quita la almohadilla y el signo de cita antes de numerar', () => {
    expect(app.listSource('# Titulo\n> cita\nnormal')).toBe('Titulo\ncita\nnormal');
  });

  it('respeta la sangría y no toca las almohadillas de dentro del texto', () => {
    expect(app.listSource('  ## Sub')).toBe('  Sub');
    expect(app.listSource('el #1 de la lista')).toBe('el #1 de la lista');
  });
});
