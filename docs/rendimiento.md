# Rendimiento — selección y arrastre fluidos

Documento de las modificaciones enfocadas al rendimiento de tuNota, en concreto la
**fluidez al seleccionar y mover varias notas, imágenes o elementos** a la vez.

## El problema

Al arrastrar una selección o al dibujar el marco de selección (marquee), la interfaz daba
tirones cuando había varios elementos. No era por la *cantidad* de elementos en sí, sino
porque **cada movimiento del ratón volvía a medir todos los bloques leyendo el DOM y
reconstruía todos los conectores, sin límite de fotogramas**.

### Causas raíz

1. **Layout thrashing (reflujos sincrónicos repetidos).** Los manejadores de `mousemove`
   leían `offsetWidth`/`offsetHeight` de cada tarjeta en bucle, intercalado con escrituras
   de estilo. Cada lectura obliga al navegador a recalcular el layout **una vez por bloque,
   por fotograma**.
   - Arrastre: `js/09-interactions.js` medía todos los bloques no seleccionados para las
     guías de alineación, y además `drawLinks()` volvía a medir todos los bloques.
   - Marco: `selectInRect()` medía todos los bloques en cada movimiento.

2. **`cardEl()` era un `querySelector` en cada llamada** (`js/10-sync-panels.js`), y se
   invocaba decenas de veces por fotograma.

3. **`drawLinks()` se ejecutaba en cada `mousemove`**, borrando y reconstruyendo el SVG
   completo de conectores.

4. **Sin *throttling*:** el evento `mousemove` puede dispararse más de 100 veces por
   segundo, y cada vez se repetía todo el trabajo.

Con imágenes grandes el coste de cada reflujo sube, por eso se notaba más con imágenes.

## Las modificaciones

Ninguna cambia el comportamiento; solo el rendimiento. Verificadas con Playwright
(el marco sigue seleccionando, el arrastre múltiple sigue moviendo) y `npm test` (28/28).

### 1. Caché de medidas durante la interacción (`js/09-interactions.js`)

Como los tamaños de las tarjetas **no cambian mientras arrastras o seleccionas**, se miden
**una sola vez** al empezar la interacción y se guardan en un mapa `{ id: { el, w, h } }`:

```js
var _measureCache = null;              // activo solo durante arrastre/marco
function buildMeasureCache() { ... }   // mide todas las tarjetas una vez
function clearMeasureCache() { _measureCache = null; }
function blockRect(b) {                // {x,y,w,h} desde la caché si está activa
  var c = _measureCache && _measureCache[b.id];
  if (c) return { x: b.x, y: b.y, w: c.w, h: c.h };
  ... // fallback: mide el DOM (fuera de interacciones)
}
```

- `cardEl()` (`js/10-sync-panels.js`) devuelve el elemento cacheado si la caché está activa,
  evitando el `querySelector`.
- `rectOf()`, `selectInRect()`, `drawLinks()` (cálculo del tamaño del lienzo) y
  `groupBounds()` (`js/05`) usan `blockRect()` → **cero lecturas de layout por fotograma**.

### 2. *Throttle* con `requestAnimationFrame`

Los manejadores de `mousemove` del arrastre (`attachDragHandler`) y del marco
(`attachMarquee`) agrupan los eventos y hacen **como máximo un recálculo por fotograma**
(~60 fps), aunque el ratón dispare más rápido:

```js
var move = function (ev) {
  lastEv = ev;
  if (rafId) return;
  rafId = requestAnimationFrame(function () { rafId = 0; doMove(lastEv); });
};
```

Al soltar (`mouseup`) se cancela cualquier fotograma pendiente y se limpia la caché.

### 3. Rectángulos estáticos precomputados en el arrastre

Los bloques **no seleccionados no se mueven** durante un arrastre, así que sus rectángulos
(para las guías de alineación / *snap*) se calculan **una sola vez** al primer movimiento,
en vez de en cada fotograma.

### 4. Selección con el marco sin re-consultar el DOM

`refreshSelectionUI()` reutiliza los elementos ya cacheados (evita `querySelectorAll('.card')`
en cada fotograma del marco) y solo alterna la clase `selected`.

## Resultado

- Se eliminan prácticamente todos los reflujos sincrónicos y los `querySelector` por
  fotograma durante la selección y el arrastre.
- El trabajo por fotograma pasa de *O(nº de bloques) mediciones del DOM* a lecturas de
  memoria (la caché), limitado además a 60 fps.
- Fuera de las interacciones (render normal) el comportamiento es idéntico: la caché está
  inactiva y todo mide el DOM como antes.

## Cómo comprobarlo

Con muchas notas/imágenes: dibuja un marco de selección grande y arrastra la selección.
El movimiento debe seguir el cursor sin tirones. En *DevTools → Performance*, durante el
arrastre ya no aparecen barras moradas de *Layout/Recalculate Style* en cascada por cada
`mousemove`.
