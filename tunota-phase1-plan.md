# tuNota — Phase 1 Implementation Spec (Storage Safety)

> **Purpose of this document.** This is a hand-off prompt for an AI coding agent
> (Fable) to implement **Phase 1** of tuNota's hardening plan. It contains
> everything needed: the real architecture, the exact problem, the changes to
> make, what must NOT break, and how to verify. Read the whole thing before
> writing code, then verify every line-number reference against the actual file
> (line numbers below are approximate and may drift).

---

## 0. TL;DR of the task

Make tuNota stop silently losing data.

1. **Move heavy blobs (images, PDFs) out of `localStorage` into IndexedDB.**
2. **Make save failures loud** instead of swallowing them.
3. **Add rolling auto-backups + restore** so there is always a recovery point.

No framework. No rewrite. No new build step. Pure vanilla JS added to the
existing `app.js`, consistent with the current code style (ES5-ish `var`,
`function` declarations, manual DOM building via the `h()` helper).

---

## 1. What tuNota is (context)

tuNota is a local-first visual note app: an infinite canvas where you drop
"blocks" (text, tables, code, Mermaid diagrams, Python, cURL, images, drawings,
etc.). Information architecture: **Notebook → Section → Note → Block**, plus
freeform **links** between blocks, a **knowledge graph** view, a **Kanban**
board, and **reminders**.

**Crucial:** the live app is **NOT** the React/Vite/Dexie stack described in
`PLAN.md` and `package.json`. Those describe an abandoned scaffold in `src/`
that nothing loads. The real app is:

- `index.html` → loads **`app.js`** (a single ~4,230-line vanilla JS file, no
  bundler) + **Mermaid** from a CDN + `styles.css`.
- `note.js` / `note.html` → pop-out single-block windows.
- `server.py` → tiny Python stdlib server: serves static files, plus
  `/api/data` (GET/POST full DB snapshot to `db.json`) and `/api/curl`
  (curl proxy for the cURL block).

**Do all work in `app.js`** (and `styles.css` for any UI). Ignore `src/`.

---

## 2. Architecture facts you must know (verify these in code)

### 2.1 Global state
- A global **`data`** object: `{ notebooks:[], sections:[], notes:[], blocks:[], links:[] }`.
- A global **`ui`** object: view state (zoom/pan, theme, sidebar, kanbanBook, etc.).
- Blocks carry a `content` object whose shape depends on `block.type`.

### 2.2 Persistence (the important part)
- Keys: `LS_DATA = 'tunota.data.v1'`, `LS_UI = 'tunota.ui.v1'`.
- **`save()`** (~line 52) does `localStorage.setItem(LS_DATA, JSON.stringify(data))`
  and `localStorage.setItem(LS_UI, JSON.stringify(ui))`.
- **`debouncedSave()`** (~line 60) wraps it.
- **`saveView()`** (~line 3033) and other spots also write `LS_UI` — several are
  wrapped in `try { ... } catch (e) {}` which **silently swallows errors**.
- Optional server sync: **`serverSave()` / `serverSaveNow()`** (~line 3236) POST
  the full `data` snapshot to `/api/data`; **`serverLoad()`** (~line 3245) GETs it
  on boot and mirrors it into `localStorage`. `mergeFromStorage()` /
  `syncAfterExternal()` reconcile external changes.

### 2.3 How blobs are stored today (the bug's root)
- **Images:** a block of type `image` (and images pasted/imported into other
  cards) stores an array `content.images`, where each item is either a raw
  **base64 data URL string** or `{ src: '<data-url>', w: <px> }`.
  `fileToScaledDataURL()` (~line 2269) reads a File, scales it, and returns a
  base64 **data URL** that is stored directly in `content.images`.
  Helpers: `imgItemSrc()`, `imgItemW()`, `addImagesToBlock()` (~2288),
  `removeCardImage()` (~2308).
- **PDFs:** `pdfBody()` (~line 2187) / `renderPdf()` (~2178) render from a stored
  data URL as well (verify the exact field, likely `content.src` or
  `content.data`).
- **Drawings** (`draw` type): stored as vector strokes (`content.strokes`), NOT
  blobs — usually small, so **leave drawings in localStorage** unless they prove
  large. (Verify size; if a drawing serializes huge, treat like a blob.)

Because these base64 blobs live **inside `data`**, they are serialized into
`localStorage` on every `save()`. `localStorage` is capped at ~5 MB per origin.

### 2.4 Rendering model (constrains the solution)
Render functions (`card()` ~950, `imageBody()` ~1262, `cardFigure()` ~2373,
`pdfBody()` ~2187, `renderCanvas()` ~884) are **synchronous** DOM builders. Any
blob solution must let these functions get a blob's src **synchronously** during
render. → We solve this with an in-memory blob cache hydrated at boot (see §4.1).

---

## 3. The problem (why Phase 1 exists)

1. **Silent data loss.** When `localStorage` exceeds its ~5 MB quota (a handful
   of pasted images does it), `setItem` throws `QuotaExceededError`. The current
   `catch (e) {}` **ignores it**. The user keeps working, sees no warning, and
   their notes are silently not persisted. On reload, work is gone.
2. **Blobs bloat the snapshot.** Base64 images also bloat `db.json` and every
   `/api/data` POST, making server sync slow and fragile.
3. **No recovery.** There is no backup/restore path if the store is corrupted,
   cleared, or overflowed.

---

## 4. Phase 1 scope — implement all three

### 4.1 Workstream A — Move blobs to IndexedDB (keep render synchronous)

**Design:** an IndexedDB-backed blob store + an in-memory cache. `localStorage`
keeps only structure/text/**blob references** (small). Blobs live in IndexedDB;
a `Map` mirrors them in memory so synchronous render code can read them.

**A1. Add a tiny IndexedDB wrapper** near the top of `app.js` (no libraries):

```js
// ---------- Blob store (IndexedDB) ----------
var BlobStore = (function () {
  var DB_NAME = 'tunota-blobs', STORE = 'blobs', VERSION = 1;
  var dbP = null;
  function open() {
    if (dbP) return dbP;
    dbP = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbP;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  return {
    put: function (id, value) { return tx('readwrite', function (s) { s.put(value, id); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    del: function (id) { return tx('readwrite', function (s) { s.delete(id); }); },
    keys: function () { return tx('readonly', function (s) { return s.getAllKeys(); }); },
    all: function () {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, 'readonly');
          var s = t.objectStore(STORE);
          var out = {};
          var kReq = s.getAllKeys(), vReq = s.getAll();
          t.oncomplete = function () {
            var ks = kReq.result || [], vs = vReq.result || [];
            for (var i = 0; i < ks.length; i++) out[ks[i]] = vs[i];
            resolve(out);
          };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
  };
})();
```

**A2. In-memory cache + reference scheme.**
- Add `var blobCache = {};  // id -> data URL string`.
- A blob **reference** is a string: `'blob:' + id`, where `id` is generated with
  the existing `uid()`.
- Helper functions:

```js
function isBlobRef(s) { return typeof s === 'string' && s.indexOf('blob:') === 0; }
function blobRefId(s) { return s.slice(5); }
function resolveSrc(s) {            // synchronous: used by render code
  if (isBlobRef(s)) return blobCache[blobRefId(s)] || '';  // '' until hydrated
  return s || '';                    // legacy inline data URL still works
}
function storeBlob(dataUrl) {        // returns a ref immediately; writes async
  var id = uid();
  blobCache[id] = dataUrl;
  BlobStore.put(id, dataUrl).catch(function () { onSaveError('blob'); });
  return 'blob:' + id;
}
```

**A3. Hydrate cache at boot.** In `boot()` (~line 4214), **before** the first
render, load all blobs into memory:

```js
BlobStore.all().then(function (map) { blobCache = map || {}; renderAll(); })
              .catch(function () { renderAll(); });
```

Ensure `serverLoad()` / initial `renderAll()` ordering still works — hydrate
blobs, then render. If a render happens before hydration (race), images show
empty then fill on next render; call `renderCanvas()` again after hydration to
be safe.

**A4. Route blob writes through `storeBlob()`.**
- In `fileToScaledDataURL()` callers (`addImagesToBlock` ~2288, `importFiles`
  ~2203, paste handlers), replace *"push the data URL into `content.images`"*
  with *"push `storeBlob(dataUrl)` (a ref) into `content.images`"* — keep the
  `{ src, w }` shape, but `src` becomes a ref.
- For PDFs, store the data URL via `storeBlob()` and keep the ref in the block.

**A5. Route blob reads through `resolveSrc()`.**
- Everywhere an image/PDF src is read for rendering — `imgItemSrc()`,
  `imageBody()`, `cardFigure()`, `pdfBody()`, `updateCardMedia()`,
  `exportSvgAsPng()` if relevant — wrap with `resolveSrc(...)`. Since
  `imgItemSrc()` already centralizes this, updating it to
  `return resolveSrc(typeof it === 'string' ? it : (it && it.src) || '')`
  covers most cases. Verify all read sites.

**A6. Delete blobs on cleanup.** In `removeCardImage()` (~2308),
`deleteBlock()` (~272), and PDF removal, if the removed item is a blob ref, call
`BlobStore.del(blobRefId(ref))` and `delete blobCache[id]`. (Optional: a
periodic GC that removes IndexedDB keys not referenced by any block — nice to
have, not required for Phase 1.)

**A7. Migration of existing inline blobs.** On boot, after data load, scan all
blocks; for any `content.images[i]` (or PDF field) whose src is a raw
`data:` URL (not a ref), move it into the blob store and replace with a ref,
then `save()`. Do this once and idempotently:

```js
function migrateInlineBlobs() {
  var moved = 0;
  data.blocks.forEach(function (b) {
    var imgs = b.content && b.content.images;
    if (imgs) imgs.forEach(function (it, i) {
      var src = typeof it === 'string' ? it : (it && it.src);
      if (src && src.indexOf('data:') === 0) {
        var ref = storeBlob(src);
        if (typeof it === 'string') imgs[i] = ref; else it.src = ref;
        moved++;
      }
    });
    // TODO: same for PDF field once its shape is confirmed
  });
  if (moved) { logChange('Migración de imágenes a IndexedDB', moved + ' movidas'); save(); }
}
```

Call it once during boot after data is loaded and cache hydrated.

**A8. Keep server sync working.** `serverSave()` posts `data`. After migration,
`data` contains refs, not blobs — so `db.json` stays small (good). **Note in a
code comment** that blob bytes are NOT yet synced to the server (that's Phase 4:
multi-device). Local single-device use is fully functional. Do **not** break
`serverLoad()`/`mergeFromStorage()`.

**A9. Export/Import must stay whole.** The existing export (see `openImport()`
~2195 and any export function) must produce a file that still contains the actual
image bytes, or restore will be empty. Update export to **inline** blobs
(resolve refs → data URLs) when exporting, and update import to **re-store**
inline data URLs as blobs (reuse `migrateInlineBlobs` logic). This keeps backups
portable across machines. **This is required, not optional** — a backup that
omits images is a data-loss trap of its own.

---

### 4.2 Workstream B — Make saves loud (no more silent failure)

**B1. Centralize the write.** Replace the raw `localStorage.setItem` inside
`save()` with a guarded writer, and route every other `setItem(LS_DATA/LS_UI...)`
through it. Remove the empty `catch (e) {}` swallows (lines ~481, ~3033, ~4047 —
verify).

```js
var saveHealthy = true;
function writeLS(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    if (!saveHealthy) { saveHealthy = true; clearSaveBanner(); }
    return true;
  } catch (e) {
    saveHealthy = false;
    onSaveError(e && e.name === 'QuotaExceededError' ? 'quota' : 'unknown', e);
    return false;
  }
}
```

**B2. Surface it in the UI.** Add a persistent, non-blocking banner/toast (style
in `styles.css`, cozy palette to match). Copy (Spanish, matches app language):

- quota: **"⚠ No se pudo guardar: almacenamiento lleno. Exporta una copia de
  seguridad para no perder cambios."** with a **"Exportar copia"** button that
  calls the backup download (§4.3).
- unknown: **"⚠ No se pudo guardar tus cambios."**

Provide `onSaveError(kind, e)` (shows/updates banner + `console.error`) and
`clearSaveBanner()`.

**B3. Optional resilience:** on `quota`, automatically trigger a backup download
once (guard so it doesn't spam), because after Phase 1's blob move a quota error
means the *structure* itself got huge — a real emergency.

---

### 4.3 Workstream C — Rolling auto-backups + restore

Structure-only snapshots are tiny (blobs are separate now), so keep several.

**C1. Snapshot store.** Reuse `BlobStore` with an id prefix, or add a second
object store `backups`. Each snapshot: `{ ts, data }` (structure incl. blob
refs). On each successful debounced save, write a snapshot; keep the **last 10**
(drop oldest). Throttle to at most one snapshot per ~2 min to avoid churn.

**C2. Full downloadable backup.** `downloadBackup()` builds a single JSON file
`{ version, exportedAt, data, blobs }` where `blobs` inlines referenced blob
data URLs (resolve every ref). Trigger a file download (reuse
`downloadDataUrl()` ~2171 pattern). Wire it to the save-error banner button and
to a menu entry (e.g. near the log/integrations buttons in the topbar).

**C3. Restore UI.** A small dialog listing snapshots (timestamp + counts) with a
**"Restaurar"** action that swaps `data`, re-`save()`s, and `renderAll()`s. Plus
**"Importar copia"** to load a downloaded backup file (re-store its inline blobs
via §4.1 A9). Confirm before overwriting current data.

---

## 5. Must-NOT-break checklist

- All 13 block types still render and edit: `text, freetext, idea, table, code,
  json, curl, python, markdown, mermaid, image, draw, pdf`.
- Canvas zoom/pan, marquee select, drag, resize, links, graph, Kanban,
  reminders, pop-out windows (`note.js`), theme editor, undo.
- `server.py` sync (`/api/data`) and the cURL proxy (`/api/curl`) still work.
- Existing users' data auto-migrates on first load **without loss** (§4.1 A7).
- Export → Import round-trip preserves images/PDFs (§4.1 A9).
- No new npm dependency, no build step; app still runs by opening `index.html`
  (or via `server.py`) with zero install.

---

## 6. Acceptance criteria (definition of done)

1. Paste/import 20+ large images across several notes. `localStorage` size
   (`JSON.stringify(localStorage).length`) stays small (KB, not MB); images live
   in IndexedDB (`tunota-blobs`). Reload → all images reappear.
2. Force a quota failure (temporarily shrink the guard or fill LS) → a visible
   banner appears; no silent loss; "Exportar copia" produces a complete backup.
3. Kill the tab mid-edit, reopen → last snapshot is restorable from the UI.
4. Export a notebook with images, wipe `localStorage` + IndexedDB, import the
   file → everything (including images/PDFs) is back.
5. Existing pre-migration data (inline base64) loads, migrates once, and looks
   identical.
6. All Must-NOT-break items pass a manual smoke test.

---

## 7. Manual test script (run in browser console + UI)

```
1. Fresh load, create a notebook/section/note.
2. Import 2 images + 1 PDF into a note. Confirm they render.
3. console: JSON.stringify(localStorage['tunota.data.v1']).length  → should be small.
4. console: indexedDB — verify 'tunota-blobs' has entries.
5. Reload. Images/PDF still render (from IndexedDB via cache).
6. Delete one image → its IndexedDB key is gone (verify).
7. Export backup → open the JSON, confirm it contains image bytes.
8. Clear localStorage + delete IndexedDB db → Import the backup → all restored.
9. Trigger quota (temporarily): confirm banner + backup button work.
10. Smoke-test every block type + graph + kanban + reminders + pop-out.
```

## 8. Suggested commits

1. `feat(storage): add IndexedDB BlobStore + in-memory cache`
2. `feat(storage): route images/PDF through blob refs; hydrate at boot`
3. `feat(storage): one-time migration of inline base64 blobs`
4. `feat(export): inline blobs on export / re-store on import`
5. `feat(reliability): guarded localStorage writes + save-error banner`
6. `feat(backup): rolling snapshots + download/restore UI`

Keep each commit runnable. Verify line numbers before editing — the file evolves.

---

## Appendix — where Phase 1 sits in the bigger plan

The live app is vanilla JS, so the common "React/Vite/Dexie" SaaS roadmap does
**not** apply as written. The correct order to make tuNota production-grade:

1. **Phase 1 — Storage safety (THIS DOC).** Stop silent data loss. ~2–3 days.
2. **Phase 2 — Modularize `app.js`** into files (canvas / blocks / storage / ai /
   kanban). One 4,230-line file blocks all future work + testing. ~1–2 days.
3. **Phase 3 — Tests** (Vitest on the pure storage/data modules; no React
   needed). ~2 days.
4. **Phase 4 — Multi-device sync + auth** (Supabase or the existing Google Drive
   plan in `docs/google-drive-plan.md`). This is the *only* change that truly
   needs a backend; it also syncs the blobs Phase 1 kept local. ~5–7 days.
5. **Phase 5 — Lean into the niche:** polish the developer blocks (Mermaid,
   Python, cURL, code, JSON) + global search + shortcuts. This is the real moat
   vs Notion. Position as *"the visual canvas for developers & technical teams."*
6. **Phase 6 — Commercialize:** freemium limits, Stripe, landing, analytics —
   only after 1–4 make it trustworthy.

Principle: **reliability → maintainability → sync → niche → sell.** Do not build
the storefront before the floor is safe.
