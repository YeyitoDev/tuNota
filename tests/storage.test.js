import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, fakeBlobStore, flush } from './harness.js';

describe('01-storage.js — helpers base', () => {
  const app = loadApp(['01-storage.js']);

  it('uid genera ids únicos y cortos', () => {
    const a = app.uid(), b = app.uid();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-z0-9]+$/);
  });

  it('loadJSON devuelve null con JSON inválido o clave ausente', () => {
    app.localStorage.setItem('rota', '{no es json');
    expect(app.loadJSON('rota')).toBeNull();
    expect(app.loadJSON('no-existe')).toBeNull();
  });
});

describe('01-storage.js — referencias de blobs', () => {
  let app;
  beforeEach(() => {
    app = loadApp(['01-storage.js']);
    app.BlobStore = fakeBlobStore();
  });

  it('isBlobRef / blobRefId distinguen refs de data URLs', () => {
    expect(app.isBlobRef('blob:abc123')).toBe(true);
    expect(app.isBlobRef('data:image/png;base64,xx')).toBe(false);
    expect(app.isBlobRef(null)).toBe(false);
    expect(app.blobRefId('blob:abc123')).toBe('abc123');
  });

  it('storeBlob guarda en cache y en el store, y devuelve una ref', async () => {
    const ref = app.storeBlob('data:image/png;base64,AAA');
    expect(app.isBlobRef(ref)).toBe(true);
    const id = app.blobRefId(ref);
    expect(app.blobCache[id]).toBe('data:image/png;base64,AAA');
    await flush();
    expect(app.BlobStore._stores.blobs.get(id)).toBe('data:image/png;base64,AAA');
  });

  it('resolveSrc: ref hidratada, ref sin hidratar y data URL heredada', () => {
    const ref = app.storeBlob('data:image/png;base64,BBB');
    expect(app.resolveSrc(ref)).toBe('data:image/png;base64,BBB');
    expect(app.resolveSrc('blob:desconocida')).toBe('');
    expect(app.resolveSrc('data:image/png;base64,CCC')).toBe('data:image/png;base64,CCC');
    expect(app.resolveSrc(undefined)).toBe('');
  });

  it('deleteBlobRef borra cache y store, e ignora no-refs', async () => {
    const ref = app.storeBlob('data:image/png;base64,DDD');
    const id = app.blobRefId(ref);
    await flush();
    app.deleteBlobRef(ref);
    await flush();
    expect(app.blobCache[id]).toBeUndefined();
    expect(app.BlobStore._stores.blobs.has(id)).toBe(false);
    app.deleteBlobRef('data:image/png;base64,x'); // no debe lanzar
  });

  it('pyImgSrc soporta el formato heredado (base64 crudo) y refs', () => {
    expect(app.pyImgSrc('iVBORw0KGgo')).toBe('data:image/png;base64,iVBORw0KGgo');
    const ref = app.storeBlob('data:image/png;base64,EEE');
    expect(app.pyImgSrc(ref)).toBe('data:image/png;base64,EEE');
  });

  it('eachBlobRef recorre imágenes (string y {src}), pdf y resultado de Python', () => {
    const d = {
      blocks: [
        { content: { images: ['blob:i1', { src: 'blob:i2' }, 'data:image/png;base64,inline'] } },
        { content: { pdf: 'blob:p1' } },
        { content: { result: { img: 'blob:g1' } } },
        { content: {} },
        {},
      ],
    };
    const seen = [];
    app.eachBlobRef(d, (r) => seen.push(r));
    expect(seen.sort()).toEqual(['blob:g1', 'blob:i1', 'blob:i2', 'blob:p1']);
  });

  it('collectBlobsFor inlina solo los blobs hidratados y referenciados', () => {
    const r1 = app.storeBlob('data:image/png;base64,UNO');
    app.storeBlob('data:image/png;base64,HUERFANO'); // no referenciado
    const d = { blocks: [{ content: { images: [r1] } }, { content: { pdf: 'blob:sin-bytes' } }] };
    const out = app.collectBlobsFor(d);
    expect(Object.keys(out)).toEqual([app.blobRefId(r1)]);
    expect(out[app.blobRefId(r1)]).toBe('data:image/png;base64,UNO');
  });
});

describe('01-storage.js — escritura protegida (writeLS)', () => {
  it('escribe y mantiene saveHealthy', () => {
    const app = loadApp(['01-storage.js']);
    expect(app.writeLS('k', 'v')).toBe(true);
    expect(app.localStorage.getItem('k')).toBe('v');
    expect(app.saveHealthy).toBe(true);
  });

  it('con cuota llena devuelve false y marca saveHealthy=false; se recupera al volver a escribir', () => {
    const app = loadApp(['01-storage.js']);
    const realSet = app.localStorage.setItem;
    let full = true;
    app.localStorage.setItem = (k, v) => {
      if (full) {
        const e = new Error('lleno');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return realSet(k, v);
    };
    expect(app.writeLS('k', 'v')).toBe(false);
    expect(app.saveHealthy).toBe(false);
    full = false;
    expect(app.writeLS('k', 'v2')).toBe(true);
    expect(app.saveHealthy).toBe(true);
    expect(app.localStorage.getItem('k')).toBe('v2');
  });
});

describe('01-storage.js — snapshots automáticos', () => {
  let app;
  beforeEach(() => {
    app = loadApp(['01-storage.js']);
    app.BlobStore = fakeBlobStore();
    app.lastSnapAt = 0;
  });

  it('crea un snapshot y aplica el throttle de 2 min', async () => {
    app.maybeSnapshot('{"v":1}');
    await flush();
    expect(app.BlobStore._stores.backups.size).toBe(1);
    app.maybeSnapshot('{"v":2}'); // demasiado pronto: ignorado
    await flush();
    expect(app.BlobStore._stores.backups.size).toBe(1);
    app.lastSnapAt = 0; // simula que pasaron >2 min
    app.maybeSnapshot('{"v":3}');
    await flush();
    expect(app.BlobStore._stores.backups.size).toBe(2);
  });

  it('conserva como mucho SNAP_MAX snapshots (borra los más viejos)', async () => {
    for (let i = 1; i <= 12; i++) app.BlobStore._stores.backups.set(i, { ts: i, json: '{}' });
    app.maybeSnapshot('{"v":"nuevo"}');
    await flush(); await flush();
    expect(app.BlobStore._stores.backups.size).toBe(app.SNAP_MAX);
    // los más viejos (1, 2, 3) cayeron
    expect(app.BlobStore._stores.backups.has(1)).toBe(false);
    expect(app.BlobStore._stores.backups.has(2)).toBe(false);
    expect(app.BlobStore._stores.backups.has(3)).toBe(false);
    expect(app.BlobStore._stores.backups.has(12)).toBe(true);
  });
});
