/* tuNota — Guía de funciones en versión documento (dentro de la app) + apoyo con Yape.
   Cargado en orden desde index.html; comparte el ámbito global (sin build). */
'use strict';

// Contenido de la guía: mismo recorrido que docs/guia-features.md, con sus capturas.
var GUIA_SECS = [
  { t: 'El lienzo y los bloques', items: [
    { img: '01-vista-general.png', t: 'Vista general', b: 'A la izquierda el panel de Libros → Secciones → Notas; arriba la barra de herramientas (buscar, plantillas, formas, mapa, kanban, IA); en el centro el lienzo infinito con bloques: nota, idea, tabla, código, markdown, formas… Cada bloque se mueve, redimensiona y conecta.' },
    { img: '02-menu-radial.png', t: 'Menú radial: 14 tipos de bloque', b: 'Mantén Alt (o Ctrl+clic) sobre el lienzo para abrir el menú radial: Nota, Texto, Idea, Tabla, Código, Python, JSON, cURL, Imagen, Imagen IA, Forma, Markdown, Mermaid y Dibujo. El doble clic en el vacío crea una nota (configurable en «⋯»).' },
  ] },
  { t: 'Diagramación (estilo Lucid/Visio)', items: [
    { img: '03-formas.png', t: 'Formas / stencils', b: 'Paleta con rectángulos, redondeados, elipses, rombos de decisión, píldoras de inicio/fin y paralelogramos de proceso. El tipo de cada forma se cambia desde su tarjeta.' },
    { img: '30-conexion-rapida.png', t: 'Conexión rápida', b: 'Al pasar el ratón por una forma aparecen 4 manijas «+»: un clic crea un bloque ya conectado en esa dirección (Paso, Decisión, Subproceso, Inicio/Fin o Fin rojo). Un flujograma en segundos. Duplica con Ctrl/⌘+D.' },
    { img: '04-conectores.png', t: 'Conectores con tipo, etiqueta y ruteo', b: 'Flechas direccionales borde a borde, con etiqueta («sí», «requiere»…), tipo semántico con color (relación, depende, bloquea, flujo) y ruteo curvo, recto u ortogonal. Clic en la conexión para editarla.' },
    { img: '05-guias-snap.png', t: 'Guías inteligentes + snap', b: 'Al arrastrar, tuNota muestra líneas guía y engancha el bloque a bordes, centros y rejilla para alinear sin esfuerzo.' },
    { img: '23-mermaid-a-lienzo.png', t: 'Puente Mermaid ↔ lienzo', b: 'Convierte un diagrama Mermaid en formas y conectores nativos editables, y de vuelta: el botón «A diagrama» regenera el código Mermaid desde tus formas.' },
  ] },
  { t: 'Organizar y actuar', items: [
    { img: '06-menu-tarjeta.png', t: 'Menú de tarjeta', b: 'Cada bloque tiene menú (⋯): importante, duplicar, traer al frente / enviar al fondo, color/categoría, acciones de IA (mejorar, resumir, insights, expandir, accionables, buscar en la web) y recordatorios.' },
    { img: '07-seleccion-alinear.png', t: 'Selección múltiple, alinear y distribuir', b: 'Arrastra en el vacío para seleccionar por marco. Con varios bloques: alinear, distribuir, sintetizar con IA o eliminar el grupo. Se mueven juntos.' },
    { img: '12-kanban.png', t: 'Kanban de ideas', b: 'Tablero que organiza tus bloques por estado: por hacer, en curso y hecho, sin salir de tuNota.' },
  ] },
  { t: 'Contenido y multimedia', items: [
    { img: '08-imagen-ia.png', t: 'Imagen IA (buscar o generar)', b: 'Bloque para buscar imágenes en la web o generarlas por prompt y colocarlas en el lienzo.' },
    { img: '09-mermaid.png', t: 'Diagramas Mermaid en vivo', b: 'Flujo, secuencia y más, renderizados al momento; con generación por IA, edición del código y exportación a PNG.' },
  ] },
  { t: 'Plantillas y vistas', items: [
    { img: '10-plantillas.png', t: 'Plantillas de canvas', b: 'Business Model Canvas, Lean Canvas, DAFO, Lluvia de ideas, Arquitectura de software y De la idea al despliegue. La IA puede rellenar las cajas describiendo tu proyecto.' },
    { img: '11-mapa-conocimiento.png', t: 'Mapa de conocimiento', b: 'Grafo de todo tu contenido (libros, secciones, notas, documentos) con zoom y resaltado de vecinos. Clic en un nodo para ir a su lienzo.' },
    { img: '24-navegacion.png', t: 'No perderse en el lienzo', b: 'Botón «Volver al contenido», minimapa con la zona visible, Centrar (Ctrl+0) y Ajustar todo (Ctrl+1).' },
    { img: '13-busqueda-global.png', t: 'Búsqueda global', b: 'Ctrl+K recorre todas las notas y bloques y te lleva al resultado.' },
  ] },
  { t: 'Inteligencia artificial', items: [
    { img: '14-asistente-ia.png', t: 'Asistente de IA', b: 'Chat con acciones rápidas (resumir, ideas, insights, accionables, título). Cada respuesta se puede insertar como bloque.' },
    { img: '15-config-ia.png', t: 'Tu proveedor, tus claves', b: 'Usa el servidor (si está configurado) o tu propia clave: OpenAI, Groq, OpenRouter, Gemini, Anthropic… Tus claves se guardan solo en tu navegador.' },
    { img: '16-busqueda-web.png', t: 'Búsqueda en internet', b: 'El chip «🌐 Buscar» consulta internet y la IA responde citando las fuentes.' },
  ] },
  { t: 'Personalización', items: [
    { img: '17-paletas-color.png', t: '11 temas + ajuste fino', b: 'Cozy, Bosque, Océano, Menta, Lavanda, Sakura, Durazno, Arena, Noche, Pizarra y Carbón, con vista previa y ajuste color por color.' },
    { img: '18-tema-oscuro.png', t: 'Tema oscuro completo', b: 'La personalización afecta a toda la interfaz: lienzo, tarjetas y formas.' },
  ] },
  { t: 'Datos y ayuda', items: [
    { img: '20-copias-seguridad.png', t: 'Copias de seguridad', b: 'Exporta/importa tus datos y restaura instantáneas automáticas. Tus notas viven en tu navegador: haz copias si cambias de equipo.' },
    { img: '19-historial.png', t: 'Historial de cambios', b: 'Registro de acciones recientes para saber qué cambió.' },
    { img: '21-atajos.png', t: 'Atajos de teclado', b: 'Pulsa ? para ver la chuleta completa (crear bloques con una tecla, zoom, deshacer, menú radial…).' },
  ] },
];

function closeGuide() { var o = document.getElementById('guideOverlay'); if (o) o.remove(); }
function openGuide() {
  closeGuide();
  var overlay = h('div', { class: 'overlay', id: 'guideOverlay', onclick: function (e) { if (e.target === overlay) closeGuide(); } });
  var panel = h('div', { class: 'log-panel guide-panel' });
  var search = h('input', { class: 'guide-search', type: 'search', placeholder: 'Filtrar funciones…', oninput: function () { guideFilter(body, toc, this.value); } });
  var head = h('div', { class: 'log-head' },
    h('div', { class: 'log-title' }, icon('book'), 'Guía de funciones'),
    search,
    h('button', { class: 'icon-btn', title: 'Cerrar', onclick: closeGuide }, icon('x'))
  );
  var toc = h('nav', { class: 'guide-toc' });
  var body = h('div', { class: 'log-body guide-body' });
  GUIA_SECS.forEach(function (sec, si) {
    var anchor = 'guia-sec-' + si;
    toc.appendChild(h('button', { class: 'guide-toc-item', onclick: function () {
      var el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, sec.t));
    body.appendChild(h('div', { class: 'log-date guide-sec-title', id: anchor }, sec.t));
    sec.items.forEach(function (it) {
      var img = h('img', { class: 'guide-img', src: 'docs/screenshots/' + it.img, alt: it.t, loading: 'lazy',
        onclick: function () { guideLightbox(this.src, it.t); },
        onerror: function () { this.style.display = 'none'; } });
      body.appendChild(h('article', { class: 'guide-item', 'data-text': (it.t + ' ' + it.b).toLowerCase() },
        h('h3', { class: 'guide-item-title' }, it.t),
        h('p', { class: 'guide-item-body' }, it.b),
        img));
    });
  });
  var main = h('div', { class: 'guide-main' }, toc, body);
  panel.appendChild(head);
  panel.appendChild(main);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  search.focus();
}
function guideFilter(body, toc, q) {
  q = (q || '').trim().toLowerCase();
  var bySec = {};
  Array.prototype.forEach.call(body.querySelectorAll('.guide-item'), function (el) {
    var show = !q || el.getAttribute('data-text').indexOf(q) !== -1;
    el.style.display = show ? '' : 'none';
  });
  // Oculta los títulos de sección sin resultados visibles.
  Array.prototype.forEach.call(body.querySelectorAll('.guide-sec-title'), function (tit) {
    var any = false, el = tit.nextElementSibling;
    while (el && !el.classList.contains('guide-sec-title')) {
      if (el.classList.contains('guide-item') && el.style.display !== 'none') any = true;
      el = el.nextElementSibling;
    }
    tit.style.display = any ? '' : 'none';
  });
}
function guideLightbox(src, alt) {
  var lb = h('div', { class: 'guide-lightbox', onclick: function () { lb.remove(); } },
    h('img', { src: src, alt: alt || '' }));
  document.body.appendChild(lb);
}

// ---------- Apoyar tuNota (Yape para Perú · Stripe/Apple Pay para el resto) ----------
// Enlace de pago de Stripe (soporta tarjeta, Apple Pay y Google Pay automáticamente).
// Pega aquí tu Payment Link de Stripe (https://buy.stripe.com/…) cuando lo tengas.
var STRIPE_LINK = '';
function closeDonate() { var o = document.getElementById('donateOverlay'); if (o) o.remove(); }
function openDonate(pref) {
  closeDonate();
  var heart = pref === 'coffee' ? icon('coffee') : icon('heart');
  var title = pref === 'coffee' ? 'Invítame un cafecito' : 'Mándame un poco de amor';
  var overlay = h('div', { class: 'overlay', id: 'donateOverlay', onclick: function (e) { if (e.target === overlay) closeDonate(); } });

  // --- Yape (Perú) ---
  var qr = h('img', { class: 'donate-qr', src: 'public/yape-qr.png', alt: 'QR de Yape',
    onerror: function () { this.replaceWith(h('div', { class: 'donate-qr-missing' }, 'QR no disponible todavía. Busca «Sergio Martin Ramos Manrique» en Yape.')); } });
  var yapePane = h('div', { class: 'donate-pane', 'data-pane': 'yape' },
    h('div', { class: 'donate-qr-frame' }, qr),
    h('div', { class: 'donate-pill' }, 'Escanea con Yape'),
    h('p', { class: 'donate-small' }, 'Yape opera en soles (S/) y solo dentro de Perú. ¡Gracias! 💜'));

  // --- Stripe (tarjeta / Apple Pay / Google Pay) ---
  var stripeBtn = STRIPE_LINK
    ? h('a', { class: 'donate-stripe-btn', href: STRIPE_LINK, target: '_blank', rel: 'noopener' }, icon('heart'), 'Pagar con tarjeta o  Apple Pay')
    : h('div', { class: 'donate-qr-missing' }, 'Pago con tarjeta / Apple Pay: en cuanto configure Stripe. (Pega tu Payment Link en STRIPE_LINK).');
  var stripePane = h('div', { class: 'donate-pane', 'data-pane': 'stripe', style: { display: 'none' } },
    h('p', { class: 'donate-text' }, 'Paga con tarjeta, Apple Pay o Google Pay desde cualquier país (procesado por Stripe).'),
    stripeBtn,
    h('p', { class: 'donate-small' }, 'Pago seguro con Stripe · Apple Pay y Google Pay aparecen automáticamente en tu dispositivo.'));

  // --- Pestañas Yape / Tarjeta ---
  function selectTab(which) {
    Array.prototype.forEach.call(card.querySelectorAll('.donate-tab'), function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === which); });
    yapePane.style.display = which === 'yape' ? '' : 'none';
    stripePane.style.display = which === 'stripe' ? '' : 'none';
  }
  var tabs = h('div', { class: 'donate-tabs' },
    h('button', { class: 'donate-tab on', 'data-tab': 'yape', onclick: function () { selectTab('yape'); } }, 'Yape (Perú)'),
    h('button', { class: 'donate-tab', 'data-tab': 'stripe', onclick: function () { selectTab('stripe'); } }, 'Tarjeta · Apple Pay'));

  var card = h('div', { class: 'donate-card' },
    h('button', { class: 'icon-btn donate-close', title: 'Cerrar', onclick: closeDonate }, icon('x')),
    h('div', { class: 'donate-heart' }, heart),
    h('h2', { class: 'donate-title' }, title),
    h('p', { class: 'donate-text' }, 'tuNota es gratis y sin anuncios. Si te resulta útil, invítame un cafecito o mándame un poco de amor :)'),
    tabs, yapePane, stripePane);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
