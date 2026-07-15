import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, fakeBlobStore, flush } from './harness.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQ';

function bootApp() {
  const app = loadApp(['01-storage.js', '02-state.js', '12-boot.js']);
  app.BlobStore = fakeBlobStore();
  app.serverSave = () => {};
  app.renderCanvas = () => {};
  app.syncCanvasCards = () => {};
  app.ui = { currentNoteId: 'n1', expN: {}, expS: {}, views: {} };
  return app;
}

describe('12-boot.js — migrateInlineBlobs', () => {
  let app;
  beforeEach(() => {
    app = bootApp();
    app.data = {
      notebooks: [], sections: [], notes: [{ id: 'n1' }], links: [], log: [],
      blocks: [
        { id: 'b1', noteId: 'n1', type: 'image', content: { images: [PNG, { src: PNG, w: 200 }] } },
        { id: 'b2', noteId: 'n1', type: 'pdf', content: { pdf: PDF, name: 'doc.pdf' } },
        { id: 'b3', noteId: 'n1', type: 'python', content: { result: { img: 'iVBORrawbase64' } } },
        { id: 'b4', noteId: 'n1', type: 'text', content: { text: 'sin medios' } },
      ],
    };
  });

  it('convierte data URLs inline (string y {src}), pdf y gráfico de Python en refs', async () => {
    const moved = app.migrateInlineBlobs();
    expect(moved).toBe(4);
    const [b1, b2, b3] = app.data.blocks;
    expect(app.isBlobRef(b1.content.images[0].src || b1.content.images[0])).toBe(true);
    expect(app.isBlobRef(b1.content.images[1].src)).toBe(true);
    expect(b1.content.images[1].w).toBe(200); // conserva el ancho
    expect(app.isBlobRef(b2.content.pdf)).toBe(true);
    expect(b2.content.name).toBe('doc.pdf');
    expect(app.isBlobRef(b3.content.result.img)).toBe(true);
    await flush();
    expect(app.BlobStore._stores.blobs.size).toBe(4);
    // los bytes siguen siendo resolubles para el render
    expect(app.resolveSrc(b2.content.pdf)).toBe(PDF);
    // quedó registrado en el historial y persistido
    expect(app.data.log[0].action).toMatch(/migradas/i);
  });

  it('es idempotente: una segunda pasada no mueve nada', () => {
    expect(app.migrateInlineBlobs()).toBe(4);
    expect(app.migrateInlineBlobs()).toBe(0);
  });

  it('con skipSave no escribe en localStorage (lo usa la importación de copias)', () => {
    app.migrateInlineBlobs(true);
    expect(app.localStorage.getItem('tunota.data.v1')).toBeNull();
  });
});

describe('12-boot.js — gcBlobs', () => {
  it('borra huérfanos y conserva lo referenciado por data o por snapshots', async () => {
    const app = bootApp();
    const refData = app.storeBlob(PNG);   // referenciado por data
    const refSnap = app.storeBlob(PNG);   // referenciado solo por un snapshot
    const refOrfano = app.storeBlob(PNG); // nadie lo referencia
    await flush();
    app.data = { blocks: [{ content: { images: [refData] } }], notes: [], log: [] };
    app.BlobStore._stores.backups.set(1, {
      ts: 1,
      json: JSON.stringify({ blocks: [{ content: { pdf: refSnap } }] }),
    });
    app.gcBlobs();
    await flush(); await flush(); await flush();
    const ids = [refData, refSnap, refOrfano].map(app.blobRefId);
    expect(app.BlobStore._stores.blobs.has(ids[0])).toBe(true);
    expect(app.BlobStore._stores.blobs.has(ids[1])).toBe(true);
    expect(app.BlobStore._stores.blobs.has(ids[2])).toBe(false);
    expect(app.blobCache[ids[2]]).toBeUndefined();
  });
});

describe('12-boot.js — hydrateMissingBlobs', () => {
  it('trae al espejo en memoria los blobs añadidos por otra ventana', async () => {
    const app = bootApp();
    app.BlobStore._stores.blobs.set('ext1', PNG);
    app.data = { blocks: [{ content: { images: ['blob:ext1'] } }], notes: [], log: [] };
    expect(app.resolveSrc('blob:ext1')).toBe(''); // aún no hidratado
    app.hydrateMissingBlobs();
    await flush(); await flush();
    expect(app.resolveSrc('blob:ext1')).toBe(PNG);
  });

  it('no hace nada si no falta ningún blob', async () => {
    const app = bootApp();
    let llamado = false;
    app.BlobStore.all = () => { llamado = true; return Promise.resolve({}); };
    app.data = { blocks: [], notes: [], log: [] };
    app.hydrateMissingBlobs();
    await flush();
    expect(llamado).toBe(false);
  });
});
