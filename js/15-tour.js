/* tuNota — Tour visual guiado (coach marks), a demanda.
   Cargado en orden desde index.html; comparte el ámbito global (sin build). */
'use strict';

// Cada paso resalta un elemento real de la interfaz y explica qué hace.
var TOUR_STEPS = [
  { sel: '#canvas', title: '¡Bienvenido a tuNota!', body: 'Un lienzo infinito para tus ideas: notas, tablas, código, diagramas, imágenes y IA. Te enseño lo esencial en 30 segundos — pulsa Siguiente (o Esc para saltar).', place: 'center' },
  { sel: '#sidebar .brand', title: 'Tus libros', body: 'Organiza todo en Libros → Secciones → Notas. Crea uno nuevo con “Nuevo libro”.', place: 'right' },
  { sel: '#canvas', title: 'El lienzo infinito', body: 'Doble clic en el vacío crea una nota. Mantén ' + ALTKEY + ' (o ' + MOD + '+clic) para el menú con los 14 tipos de bloque (incluidas Formas).', place: 'center' },
  { sel: '[title^="Buscar en todo"]', title: 'Buscar en todo', body: 'Con ' + MOD + '+K encuentras cualquier nota o bloque al instante.', place: 'bottom' },
  { sel: '[title^="Plantillas de canvas"]', title: 'Plantillas', body: 'Empieza rápido con Business Model Canvas, DAFO, arquitectura… y la IA puede rellenarlas.', place: 'bottom' },
  { sel: '[title^="Formas para diagramar"]', title: 'Formas para diagramar', body: 'Rectángulos, rombos, elipses… Conéctalos con flechas que siguen a las cajas al moverlas.', place: 'bottom' },
  { sel: '[title^="Mapa de conocimiento"]', title: 'Mapa de conocimiento', body: 'Un grafo de todo tu contenido para ver cómo se conecta. Clic en un nodo para ir allí.', place: 'bottom' },
  { sel: '[title^="Kanban"]', title: 'Kanban de ideas', body: 'Organiza tus bloques por estado: por hacer, en curso y hecho.', place: 'bottom' },
  { sel: '.ai-btn', title: 'Asistente IA', body: 'Resume, expande, genera ideas, busca en internet y crea imágenes. Usa las claves del servidor o las tuyas.', place: 'bottom' },
  { sel: '.zoom-ctl', title: 'No te pierdas', body: 'Centra la vista (100% + contenido), ajusta todo a la pantalla y usa el minimapa para orientarte.', place: 'top' },
  { sel: '[title^="Más opciones"]', title: 'Y mucho más', body: 'Colores y temas, copias de seguridad, atajos (pulsa ?) y este tour, siempre disponibles aquí.', place: 'bottom' },
];
var tourIdx = 0, tourDom = null;

function tourBuild() {
  var catcher = h('div', { class: 'tour-catch', onmousedown: function (e) { e.preventDefault(); tourNext(); } });
  var spot = h('div', { class: 'tour-spot' });
  var pop = h('div', { class: 'tour-pop', onmousedown: function (e) { e.stopPropagation(); } });
  document.body.appendChild(catcher);
  document.body.appendChild(spot);
  document.body.appendChild(pop);
  tourDom = { catcher: catcher, spot: spot, pop: pop };
}
// Auto-lanza el tour una sola vez (primera visita), tras un instante para que la UI
// esté lista y sin la puerta de acceso delante.
function maybeAutoTour() {
  if (!ui || ui.tourSeen) return;
  setTimeout(function () {
    if (!ui.tourSeen && !document.getElementById('tokenGate')) startTour(0);
  }, 500);
}
function startTour(idx) {
  if (typeof closeTopbarMenu === 'function') closeTopbarMenu();
  tourIdx = typeof idx === 'number' ? idx : 0;
  if (!tourDom) tourBuild();
  document.body.classList.add('tour-on');
  document.addEventListener('keydown', tourKey, true);
  window.addEventListener('resize', tourReposition);
  tourShow();
  if (ui) { ui.tourSeen = true; try { writeLS(LS_UI, JSON.stringify(ui)); } catch (e) {} }
}
function endTour() {
  if (tourDom) { tourDom.catcher.remove(); tourDom.spot.remove(); tourDom.pop.remove(); tourDom = null; }
  document.body.classList.remove('tour-on');
  document.removeEventListener('keydown', tourKey, true);
  window.removeEventListener('resize', tourReposition);
}
function tourNext() { tourIdx++; if (tourIdx >= TOUR_STEPS.length) { endTour(); return; } tourShow(); }
function tourPrev() { if (tourIdx <= 0) return; tourIdx--; tourShow(); }
function tourReposition() { if (tourDom) tourShow(); }
function tourKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); endTour(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tourNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tourPrev(); }
}
function tourShow() {
  var step = TOUR_STEPS[tourIdx];
  var el = step.sel ? document.querySelector(step.sel) : null;
  if (step.sel && !el) { // salta pasos cuyo elemento no está presente
    if (tourIdx < TOUR_STEPS.length - 1) { tourIdx++; tourShow(); return; }
    endTour(); return;
  }
  var pad = 6;
  var r = el ? el.getBoundingClientRect()
             : { left: window.innerWidth / 2 - 1, top: window.innerHeight / 2 - 1, width: 2, height: 2, right: window.innerWidth / 2 + 1, bottom: window.innerHeight / 2 + 1 };
  var spot = tourDom.spot;
  spot.style.left = (r.left - pad) + 'px';
  spot.style.top = (r.top - pad) + 'px';
  spot.style.width = (r.width + pad * 2) + 'px';
  spot.style.height = (r.height + pad * 2) + 'px';
  var pop = tourDom.pop;
  pop.innerHTML = '';
  pop.appendChild(h('div', { class: 'tour-step' }, (tourIdx + 1) + ' / ' + TOUR_STEPS.length));
  pop.appendChild(h('div', { class: 'tour-title' }, step.title));
  pop.appendChild(h('div', { class: 'tour-body' }, step.body));
  var right = h('span', { class: 'tour-nav-right' });
  if (tourIdx > 0) right.appendChild(h('button', { class: 'tour-btn ghost', onclick: tourPrev }, 'Anterior'));
  right.appendChild(h('button', { class: 'tour-btn', onclick: tourNext }, tourIdx === TOUR_STEPS.length - 1 ? 'Finalizar' : 'Siguiente'));
  pop.appendChild(h('div', { class: 'tour-nav' }, h('button', { class: 'tour-skip', onclick: endTour }, 'Saltar'), right));
  tourPlacePop(pop, r, step.place || 'bottom');
}
function tourPlacePop(pop, r, place) {
  pop.style.left = '0px'; pop.style.top = '0px';
  var pw = pop.offsetWidth, ph = pop.offsetHeight, m = 14, vw = window.innerWidth, vh = window.innerHeight, x, y;
  if (place === 'center') { x = (vw - pw) / 2; y = (vh - ph) / 2; }
  else if (place === 'top') { x = r.left + r.width / 2 - pw / 2; y = r.top - ph - m; }
  else if (place === 'right') { x = r.right + m; y = r.top + r.height / 2 - ph / 2; }
  else if (place === 'left') { x = r.left - pw - m; y = r.top + r.height / 2 - ph / 2; }
  else { x = r.left + r.width / 2 - pw / 2; y = r.bottom + m; }
  x = Math.max(m, Math.min(x, vw - pw - m));
  y = Math.max(m, Math.min(y, vh - ph - m));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
