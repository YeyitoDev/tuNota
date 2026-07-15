import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, fakeBlobStore, fakeLocalStorage } from './harness.js';

function freshApp(lsData) {
  const ls = fakeLocalStorage(lsData || {});
  const app = loadApp(['01-storage.js', '02-state.js'], { localStorage: ls });
  app.BlobStore = fakeBlobStore();
  // stubs de módulos posteriores que save()/undo() invocan
  app.serverSave = () => {};
  app.renderCanvas = () => {};
  return app;
}

const baseData = () => ({
  notebooks: [{ id: 'nb1', name: 'Libro', order: 0 }],
  sections: [{ id: 's1', notebookId: 'nb1', name: 'Sec', order: 0 }],
  notes: [{ id: 'n1', sectionId: 's1', title: 'Nota', createdAt: 1, updatedAt: 1 }],
  blocks: [{ id: 'b1', noteId: 'n1', type: 'text', x: 0, y: 0, content: { text: 'hola' } }],
  links: [],
  log: [],
  savedAt: 1,
});

describe('02-state.js — initState', () => {
  it('siembra datos y ui cuando no hay nada guardado', () => {
    const app = freshApp();
    app.seed = () => ({ ...baseData() });
    app.initState();
    expect(app.data.notebooks.length).toBe(1);
    expect(app.ui.currentNoteId).toBe('n1');
    expect(app.ui.expN.nb1).toBe(true);
    // save() persistió vía writeLS
    expect(JSON.parse(app.localStorage.getItem('tunota.data.v1')).notebooks[0].id).toBe('nb1');
  });

  it('normaliza estructuras que falten en datos existentes', () => {
    const d = baseData();
    delete d.log;
    delete d.links;
    const app = freshApp({
      'tunota.data.v1': JSON.stringify(d),
      'tunota.ui.v1': JSON.stringify({ currentNoteId: 'n1' }),
    });
    app.initState();
    expect(app.data.log).toEqual([]);
    expect(Array.isArray(app.data.links)).toBe(true);
    expect(app.ui.expN).toEqual({});
    expect(app.ui.theme).toEqual({});
    expect(app.ui.ai.provider).toBe('openai');
  });
});

describe('02-state.js — helpers puros', () => {
  const app = freshApp();

  it('pair crea un mapa {id:true}', () => {
    expect(app.pair('x')).toEqual({ x: true });
  });

  it('snippet recorta a 48 caracteres y colapsa espacios', () => {
    expect(app.snippet('  hola \n mundo  ')).toBe('hola mundo');
    const largo = 'a'.repeat(60);
    expect(app.snippet(largo).length).toBe(49);
    expect(app.snippet(largo).endsWith('…')).toBe(true);
  });

  it('logChange antepone entradas y limita a 500', () => {
    app.data = baseData();
    for (let i = 0; i < 505; i++) app.logChange('acción ' + i, '');
    expect(app.data.log.length).toBe(500);
    expect(app.data.log[0].action).toBe('acción 504');
  });
});

describe('02-state.js — selectores y deshacer', () => {
  let app;
  beforeEach(() => {
    app = freshApp();
    app.data = baseData();
    app.ui = { currentNoteId: 'n1', expN: {}, expS: {}, views: {} };
  });

  it('getNote / getSection / getNotebook', () => {
    expect(app.getNote('n1').title).toBe('Nota');
    expect(app.getSection('s1').name).toBe('Sec');
    expect(app.getNotebook('nb1').name).toBe('Libro');
    expect(app.getNote('nope')).toBeUndefined();
  });

  it('pushUndo + undo restauran bloques y enlaces', () => {
    app.pushUndo('Eliminar bloque');
    app.data.blocks = [];
    app.data.links = [{ a: 'b1', b: 'b2' }];
    app.undo();
    expect(app.data.blocks.length).toBe(1);
    expect(app.data.blocks[0].id).toBe('b1');
    expect(app.data.links).toEqual([]);
    expect(app.data.log[0].action).toBe('Deshacer');
  });

  it('la pila de deshacer se limita a 40 entradas', () => {
    for (let i = 0; i < 45; i++) app.pushUndo('paso ' + i);
    expect(app.undoStack.length).toBe(40);
    expect(app.undoStack[0].label).toBe('paso 5');
  });

  it('undo con la pila vacía no rompe nada', () => {
    const antes = JSON.stringify(app.data);
    app.undo();
    expect(JSON.stringify(app.data)).toBe(antes);
  });
});
