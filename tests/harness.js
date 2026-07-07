// Arnés de tests: carga los módulos reales de js/ (scripts globales, sin build)
// en un contexto vm de Node con stubs mínimos de navegador. Así se testea la
// lógica pura sin tocar DOM real ni IndexedDB.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function fakeLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
}

// BlobStore en memoria con la misma interfaz que el real (js/01-storage.js).
export function fakeBlobStore() {
  const stores = { blobs: new Map(), backups: new Map() };
  return {
    _stores: stores,
    put: (s, id, v) => { stores[s].set(id, v); return Promise.resolve(); },
    get: (s, id) => Promise.resolve(stores[s].get(id)),
    del: (s, id) => { stores[s].delete(id); return Promise.resolve(); },
    keys: (s) => Promise.resolve([...stores[s].keys()]),
    all: (s) => Promise.resolve(Object.fromEntries(stores[s])),
  };
}

export function loadApp(files, { localStorage } = {}) {
  const ls = localStorage || fakeLocalStorage();
  const document = {
    readyState: 'loading', // evita que 12-boot.js arranque boot() al cargar
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: null,
  };
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: ls,
    document,
    addEventListener() {},
    removeEventListener() {},
    fetch: undefined,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(code, ctx, { filename: 'js/' + f });
  }
  return ctx;
}

// Espera a que se vacíe la cola de microtareas (promesas del BlobStore fake).
export const flush = () => new Promise((r) => setTimeout(r, 0));
