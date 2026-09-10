/* tuNota — Editor de texto con formato inmediato: lo que marcas en la barra se ve al momento,
   sin marcadores a la vista.

   El contenido enriquecido vive en b.content.html, pero b.content.text se mantiene siempre al
   día con la versión en texto plano. Eso importa: la IA, el buscador, las tareas, el móvil y
   las plantillas leen `text`, y ninguno de ellos ha tenido que cambiar.

   Las notas que ya tenías se convierten solas la primera vez que las abres, respetando los
   marcadores markdown que hubieras escrito antes y las imágenes intercaladas.
   Cargado en orden desde index.html. */
'use strict';

// ---------- De HTML a texto plano ----------
// Recorre el árbol en vez de tirar de innerText: hay que respetar los marcadores de imagen
// intercalada (índice) y numerar las listas, que es lo que luego lee el buscador.
function richToText(root) {
  var out = [];
  function esBloque(n) {
    return /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|TR)$/.test(n.nodeName);
  }
  function marcadorLista(li) {
    var padre = li.parentNode;
    if (!padre) return '';
    if (padre.nodeName === 'OL') {
      var n = 1, s = li.previousElementSibling;
      while (s) { if (s.nodeName === 'LI') n++; s = s.previousElementSibling; }
      return n + '. ';
    }
    var tarea = li.getAttribute('data-task');
    if (tarea === 'done') return '- [x] ';
    if (tarea === 'todo') return '- [ ] ';
    return '- ';
  }
  function walk(node) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var n = node.childNodes[i];
      if (n.nodeType === 3) { out.push(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      if (n.nodeName === 'BR') { out.push('\n'); continue; }
      if (n.nodeName === 'IMG') {
        var idx = n.getAttribute('data-inline');
        if (idx !== null) out.push('' + idx + '');
        continue;
      }
      var bloque = esBloque(n);
      if (bloque && out.length && out[out.length - 1] !== '\n') out.push('\n');
      if (n.nodeName === 'LI') out.push(marcadorLista(n));
      walk(n);
      if (bloque) out.push('\n');
    }
  }
  walk(root);
  return out.join('')
    .replace(/ /g, ' ')        // los espacios duros del editor son espacios normales
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// ---------- De texto plano a HTML (solo para convertir lo que ya tenías) ----------
// Reutiliza renderMarkdown(), así los **negrita** y ==resaltado== escritos antes se convierten
// en formato de verdad en lugar de quedarse como símbolos sueltos.
function richFromText(b) {
  var texto = (b.content && b.content.text) || '';
  var imgs = (b.content && b.content.inlineImages) || [];
  // Las imágenes intercaladas se apartan antes de pasar por markdown y se reponen después.
  var fichas = [];
  texto = texto.replace(/(\d+)/g, function (m, idx) {
    var item = imgs[parseInt(idx, 10)];
    var raw = item ? (typeof item === 'string' ? item : item.src) : '';
    var src = (typeof resolveSrc === 'function' ? resolveSrc(raw) : raw) || '';
    fichas.push('<img data-inline="' + idx + '" src="' + src + '" alt="">');
    return ' @@IMG' + (fichas.length - 1) + '@@ ';
  });
  var html = texto.trim() ? renderMarkdown(texto) : '';
  html = html.replace(/@@IMG(\d+)@@/g, function (m, n) { return fichas[+n] || ''; });
  return html;
}
// Devuelve el HTML con el que hay que pintar el bloque, generándolo si hace falta.
// `htmlFrom` guarda de qué texto salió: si algo escribe content.text por fuera (la IA, una
// plantilla, la sincronización entre ventanas), deja de coincidir y el HTML se regenera solo.
function ensureRichHtml(b) {
  b.content = b.content || {};
  var txt = b.content.text || '';
  if (typeof b.content.html === 'string' && b.content.htmlFrom === txt) return b.content.html;
  b.content.html = richFromText(b);
  b.content.htmlFrom = txt;
  return b.content.html;
}

// ---------- Limpieza de lo que se pega ----------
// Se acepta el formato (negritas, listas, enlaces) y se tira lo peligroso o lo que arrastraría
// los estilos de otra web: scripts, clases ajenas, medidas raras de Word…
var RICH_TAGS = {
  B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, MARK: 1, CODE: 1, PRE: 1,
  P: 1, DIV: 1, BR: 1, SPAN: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, HR: 1,
  H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, A: 1, IMG: 1, SUB: 1, SUP: 1, FONT: 1,
};
var RICH_STYLES = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration'];
// Estas se tiran ENTERAS, con lo que llevan dentro. Al resto de etiquetas desconocidas se les
// quita la envoltura pero se conserva el texto; con un <script> eso dejaría su código a la
// vista como si fuera contenido de la nota.
var RICH_DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1, TEMPLATE: 1, LINK: 1, META: 1, TITLE: 1 };
function sanitizeRich(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = String(html == null ? '' : html);
  (function limpia(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 8) { n.remove(); return; }              // comentarios
      if (n.nodeType !== 1) return;
      if (RICH_DROP[n.nodeName]) { n.remove(); return; }         // fuera con todo su contenido
      if (!RICH_TAGS[n.nodeName]) {                              // etiqueta no permitida: se
        while (n.firstChild) node.insertBefore(n.firstChild, n); // conserva lo que contenía
        n.remove();
        return;
      }
      Array.prototype.slice.call(n.attributes).forEach(function (at) {
        var nombre = at.name.toLowerCase();
        if (nombre === 'href' || nombre === 'src') {
          if (/^\s*javascript:/i.test(at.value)) n.removeAttribute(at.name);
          return;
        }
        if (nombre === 'data-inline' || nombre === 'data-task' || nombre === 'alt' || nombre === 'color' || nombre === 'face') return;
        if (nombre === 'style') {
          var guardar = [];
          RICH_STYLES.forEach(function (p) {
            var v = n.style.getPropertyValue(p);
            if (v) guardar.push(p + ':' + v);
          });
          if (guardar.length) n.setAttribute('style', guardar.join(';'));
          else n.removeAttribute('style');
          return;
        }
        n.removeAttribute(at.name);
      });
      limpia(n);
    });
  })(tmp);
  return tmp.innerHTML;
}

// ---------- El editor ----------
// Un contenteditable por bloque. Guarda html y, a la vez, el texto plano equivalente.
function richCommit(b, ed, label) {
  b.content = b.content || {};
  b.content.html = sanitizeRich(ed.innerHTML);
  b.content.text = richToText(ed);
  b.content.htmlFrom = b.content.text;   // el html ya está al día con el texto
  touchNote(b.noteId);
  if (label) logChange(label, snippet(b.content.text));
}
function buildRichEditor(b, opts) {
  opts = opts || {};
  var ed = h('div', {
    class: 'rich-ed' + (opts.cls ? ' ' + opts.cls : ''),
    contenteditable: 'true',
    spellcheck: opts.spellcheck === false ? 'false' : 'true',
    'data-ph': opts.placeholder || 'Escribe…',
  });
  ed.innerHTML = sanitizeRich(ensureRichHtml(b));
  if (typeof applyNoteTextStyle === 'function') applyNoteTextStyle(ed, b);

  var guardar = function () {
    richCommit(b, ed);
    if (opts.onInput) opts.onInput(ed);
    debouncedSave();
  };
  ed.addEventListener('input', guardar);
  ed.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  // El lienzo usa las flechas y las teclas sueltas para sus atajos; escribiendo, no.
  ed.addEventListener('keydown', function (e) { e.stopPropagation(); });
  ed.addEventListener('blur', function () {
    richCommit(b, ed, 'Texto editado');
    save();
    if (opts.onInput) opts.onInput(ed);
  });
  // Al pegar se conserva el formato pero se limpia lo que venga de fuera.
  ed.addEventListener('paste', function (e) {
    var dt = e.clipboardData;
    if (!dt) return;
    if (typeof clipboardImageFiles === 'function' && clipboardImageFiles(dt).length && opts.onPasteImages) {
      e.preventDefault();
      opts.onPasteImages(clipboardImageFiles(dt));
      return;
    }
    var html = dt.getData('text/html');
    e.preventDefault();
    if (html) document.execCommand('insertHTML', false, sanitizeRich(html));
    else document.execCommand('insertText', false, dt.getData('text/plain'));
    guardar();
  });
  return ed;
}

// ---------- Aplicar formato a lo seleccionado ----------
// document.execCommand está anticuado pero es lo único que todos los navegadores implementan
// para esto; styleWithCSS evita que genere etiquetas <font> antiguas.
// Solo el color y la tipografía necesitan escribirse como CSS. Para negrita, cursiva o
// subrayado se dejan las etiquetas de siempre (<b>, <i>, <u>): el HTML guardado queda limpio
// y el tema puede darles estilo, en vez de acabar con <span style="font-weight:bold"> por todas partes.
var RICH_CSS_CMDS = { foreColor: 1, hiliteColor: 1, fontName: 1, fontSize: 1, backColor: 1 };
function richExec(b, ed, cmd, valor) {
  if (!ed) return;
  ed.focus();
  try { document.execCommand('styleWithCSS', false, !!RICH_CSS_CMDS[cmd]); } catch (err) {}
  try { document.execCommand(cmd, false, valor === undefined ? null : valor); } catch (err) {}
  richCommit(b, ed, 'Texto: formato');
  save();
  if (typeof autoGrowRich === 'function') autoGrowRich(ed);
}
// Resaltar con <mark> en vez de un fondo suelto: así sobrevive al cambio de tema y se
// distingue de un color de fondo cualquiera.
function richToggleMark(b, ed) {
  ed.focus();
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var r = sel.getRangeAt(0);
  var dentro = r.commonAncestorContainer;
  var marca = dentro.nodeType === 1 ? dentro.closest('mark') : (dentro.parentNode && dentro.parentNode.closest('mark'));
  if (marca && ed.contains(marca)) {
    while (marca.firstChild) marca.parentNode.insertBefore(marca.firstChild, marca);
    marca.remove();
  } else {
    if (r.collapsed) return;
    var m = document.createElement('mark');
    try { r.surroundContents(m); } catch (err) {
      m.appendChild(r.extractContents());
      r.insertNode(m);
    }
  }
  richCommit(b, ed, 'Texto: resaltar');
  save();
}
// ¿La selección ya tiene este estilo? Sirve para encender los botones de la barra.
function richHasStyle(ed, cmd) {
  if (!ed) return false;
  if (cmd === 'mark') {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    var n = sel.getRangeAt(0).commonAncestorContainer;
    var el = n.nodeType === 1 ? n : n.parentNode;
    return !!(el && el.closest && el.closest('mark') && ed.contains(el.closest('mark')));
  }
  try { return document.queryCommandState(cmd); } catch (err) { return false; }
}

// ---------- Alto automático ----------
// El contenteditable ya crece solo; esto solo mantiene al día la tarjeta que lo envuelve.
// Texto libre: la caja NO crece al escribir. Mide lo que eligió el usuario (b.height, o
// st.minH mientras arrastra el asa) y, cuando el texto llega al borde inferior, el editor
// hace scroll interno (overflow-y: auto en .free-rich) y se desplaza para que el cursor
// siga a la vista. Solo el asa de redimensión cambia el tamaño de la caja.
function autoGrowRich(ed) {
  if (!ed) return;
  var card = ed.closest('.card');
  if (!card) return;
  if (ed.classList.contains('free-rich')) {
    var b = getBlockById(card.getAttribute('data-id'));
    var st = (b && b.content && b.content.style) || {};
    var fixed = st.minH || (b && b.height) || 70;
    var prev = card.style.height;
    card.style.height = Math.max(fixed, 24) + 'px';
    richScrollCaretIntoView(ed);
    if (prev !== card.style.height && typeof drawLinks === 'function') drawLinks();
  }
}
// Desplaza el editor (no el lienzo) para que el cursor quede dentro de la caja. Las medidas de
// getClientRects van en píxeles de pantalla y scrollTop en píxeles del elemento: se corrige el zoom.
function richScrollCaretIntoView(ed) {
  if (!ed || ed.scrollHeight <= ed.clientHeight + 1) return;
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var r = sel.getRangeAt(0);
  if (!ed.contains(r.startContainer)) return;
  var rect = r.getClientRects()[0];
  if (!rect && r.startContainer.nodeType === 1) {
    var n = r.startContainer.childNodes[r.startOffset] || r.startContainer;
    if (n.nodeType === 1) rect = n.getBoundingClientRect();
  }
  if (!rect) return;
  var er = ed.getBoundingClientRect();
  var z = (typeof getView === 'function' && getView().zoom) || 1;
  if (rect.bottom > er.bottom) ed.scrollTop += (rect.bottom - er.bottom) / z + 4;
  else if (rect.top < er.top) ed.scrollTop -= (er.top - rect.top) / z + 4;
}

// ---------- Cuerpo de nota / idea ----------
// Un solo editor por bloque: las imágenes intercaladas viven dentro del propio HTML, así que
// ya no hace falta partir el contenido en varios cuadros de texto.
function richNoteBody(b) {
  var isIdea = b.type === 'idea';
  b.content = b.content || {};
  b.content.inlineImages = b.content.inlineImages || [];
  var ed = buildRichEditor(b, {
    cls: 'card-rich',
    placeholder: isIdea ? 'Escribe tu idea… p. ej. "app de recetas con lo que hay en la nevera". Luego pulsa «Revisar idea» para validarla con internet + IA' : 'Escribe...',
    onInput: function (e) { autoGrowRich(e); },
    onPasteImages: function (files) { richInsertImages(b, ed, files); },
  });
  ed.addEventListener('dragover', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
      e.preventDefault(); ed.classList.add('drag-over');
    }
  });
  ed.addEventListener('dragleave', function () { ed.classList.remove('drag-over'); });
  ed.addEventListener('drop', function (e) {
    var files = [];
    if (e.dataTransfer) {
      for (var i = 0; i < e.dataTransfer.files.length; i++) {
        if (/^image\//.test(e.dataTransfer.files[i].type)) files.push(e.dataTransfer.files[i]);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    ed.classList.remove('drag-over');
    richInsertImages(b, ed, files);
  });
  if (typeof attachFmtBar === 'function') attachFmtBar(ed, b);
  requestAnimationFrame(function () { autoGrowRich(ed); });
  // Lo que la nota llevaba debajo del texto sigue igual: vínculos, media y el análisis de IA.
  var elementos = [ed];
  var hlinks = h('div', { class: 'card-hlinks' });
  renderHlinksInto(hlinks, b);
  elementos.push(hlinks);
  elementos.push(h('div', { class: 'card-media' }));
  if (b.content && b.content.analysis && typeof buildNoteAnalysis === 'function') elementos.push(buildNoteAnalysis(b));
  return elementos;
}
// Guarda las imágenes como blob (igual que antes) y las mete en el cursor como <img>.
function richInsertImages(b, ed, files) {
  convertHeicFilesIfNeeded(files, function (arr) {
    arr = arr.filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) return;
    b.content.inlineImages = b.content.inlineImages || [];
    var slots = new Array(arr.length), pendientes = arr.length, fallidas = 0;
    arr.forEach(function (f, i) {
      fileToScaledDataURL(f, function (url, cw) {
        if (url) {
          var dw = cw ? Math.min(cw, DEFAULT_IMG_W) : 0;
          var ref = storeBlob(url);
          slots[i] = dw ? { src: ref, w: dw } : { src: ref };
        } else { fallidas++; }
        pendientes--;
        if (pendientes > 0) return;
        var html = '';
        slots.forEach(function (it) {
          if (!it) return;
          var idx = b.content.inlineImages.length;
          b.content.inlineImages.push(it);
          html += '<img data-inline="' + idx + '" src="' + resolveSrc(it.src) + '" alt="">';
        });
        if (html) {
          ed.focus();
          document.execCommand('insertHTML', false, html);
          richCommit(b, ed, 'Imagen insertada en nota');
          save();
          autoGrowRich(ed);
        }
        if (fallidas) warnUnreadableImages(fallidas);
      });
    });
  });
}

// ---------- Cuerpo de texto libre ----------
function richFreeBody(b) {
  b.content = b.content || {};
  if (!b.content.style) b.content.style = defaultFreeStyle();
  var ed = buildRichEditor(b, {
    cls: 'free-rich', spellcheck: false, placeholder: 'Texto…',
    onInput: function (e) { autoGrowRich(e); },
  });
  applyFreeStyle(ed, b.content.style);
  if (typeof attachFmtBar === 'function') attachFmtBar(ed, b);
  setTimeout(function () { autoGrowRich(ed); }, 0);
  return [ed];
}
