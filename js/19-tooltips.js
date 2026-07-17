/* tuNota — Tooltips con nombre + descripción, tras mantener el ratón 3.5 s sobre el control.
   Reemplaza el tooltip nativo del navegador. Cargado en orden desde index.html. */
'use strict';

(function initTooltips() {
  var TIP_DELAY = 3500; // ms que hay que mantener el ratón encima antes de mostrarlo
  var timer = null, curEl = null, tipEl = null;

  function restore() {
    if (curEl && curEl.getAttribute('data-tiptext') != null) {
      curEl.setAttribute('title', curEl.getAttribute('data-tiptext'));
      curEl.removeAttribute('data-tiptext');
    }
  }
  function hide() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (tipEl) { tipEl.remove(); tipEl = null; }
    restore();
    curEl = null;
  }
  function show(el) {
    var text = el.getAttribute('data-tiptext') || '';
    if (!text) return;
    // Separa "Nombre: descripción" / "Nombre (atajo)" / "Nombre — descripción".
    var m = text.match(/^(.*?)\s*[:—(]\s*(.+)$/);
    var name = m ? m[1].trim() : text.trim();
    var desc = m ? m[2].replace(/\)\s*$/, '').trim() : '';
    tipEl = h('div', { class: 'ui-tip' }, h('div', { class: 'ui-tip-name' }, name));
    if (desc) tipEl.appendChild(h('div', { class: 'ui-tip-desc' }, desc));
    document.body.appendChild(tipEl);
    var r = el.getBoundingClientRect();
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight, m8 = 8;
    var x = Math.min(Math.max(m8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - m8);
    var y = r.bottom + m8;
    if (y + th > window.innerHeight - m8) y = r.top - th - m8; // arriba si no cabe abajo
    tipEl.style.left = x + 'px';
    tipEl.style.top = Math.max(m8, y) + 'px';
    requestAnimationFrame(function () { if (tipEl) tipEl.classList.add('on'); });
  }

  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[title]') : null;
    if (!el || el === curEl) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    var t = el.getAttribute('title');
    if (!t) return;
    hide();
    curEl = el;
    el.setAttribute('data-tiptext', t);
    el.removeAttribute('title'); // suprime el tooltip nativo (mostramos el nuestro a los 3.5 s)
    timer = setTimeout(function () { timer = null; if (curEl === el && el.isConnected) show(el); }, TIP_DELAY);
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (!curEl) return;
    var to = e.relatedTarget;
    if (to && curEl.contains && curEl.contains(to)) return; // sigue dentro del mismo control
    hide();
  }, true);

  document.addEventListener('mousedown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
})();
