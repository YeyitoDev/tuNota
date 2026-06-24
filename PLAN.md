# tuNota — Plan de proyecto

> App de **anotaciones rápidas** que combina la organización de **OneNote**
> (libros → secciones → notas libres en un lienzo) con las **conexiones de
> conocimiento de Obsidian**, potenciada con **IA** que entiende tu escritura
> veloz y te ayuda a ordenarla. Estética **cozy, minimalista y natural**, con
> colores cálidos.

---

## 1. Visión

Capturar ideas a la velocidad a la que se te ocurren, sin fricción:
- Haces **click** en el lienzo → nace una nota donde apuntaste.
- Haces **Ctrl + click** → menú rápido para insertar tabla, cuadro de texto,
  imagen (por prompt) o "idea".
- La **IA** lee tu texto rápido/desordenado y lo **entiende y reorganiza**.
- Con el tiempo, todo se **conecta** como en Obsidian (enlaces + grafo).

---

## 2. Conceptos (arquitectura de información)

| Concepto      | Equivalente OneNote | Descripción                                   |
|---------------|---------------------|-----------------------------------------------|
| **Libro**     | Notebook            | Contenedor principal (proyecto, área de vida) |
| **Sección**   | Pestaña/Sección     | Carpeta dentro de un libro                     |
| **Nota**      | Página              | Lienzo libre donde colocas bloques             |
| **Bloque**    | Contenido           | Texto, tabla, imagen, idea... posicionable     |

---

## 3. Interacciones clave

- **Click en lienzo vacío** → crea una nota de texto en esa posición y entra en
  modo edición al instante.
- **Ctrl + click** → menú radial/rápido con: `Tabla`, `Cuadro de texto`,
  `Imagen (prompt)`, `Idea`.
- **Arrastrar** bloques para reposicionar; **redimensionar** y **borrar**.
- **Seleccionar texto → "Ordéname esto"** → la IA limpia y estructura.
- **`[[doble corchete]]`** → enlaza con otra nota (autocompletado).
- **Vista grafo** → mapa de conexiones entre notas.

---

## 4. Stack técnico

- **Vite + React + TypeScript** — base rápida y moderna.
- **TailwindCSS + shadcn/ui + Lucide** — UI y componentes.
- **@xyflow/react (React Flow)** — lienzo infinito (bloques) y vista de grafo.
- **Zustand** — estado de la app y del lienzo.
- **Dexie.js (IndexedDB)** — persistencia local (sin backend al inicio).
- **Framer Motion** — animaciones suaves "cozy".
- **IA** — proveedor a definir (ver sección 7).

---

## 5. Estructura del proyecto

```
tuNota/
├── src/
│   ├── components/
│   │   ├── layout/      # Sidebar, topbar, paneles
│   │   ├── canvas/      # Lienzo libre (React Flow)
│   │   ├── nodes/       # Bloques: texto, tabla, imagen, idea
│   │   ├── graph/       # Vista grafo de conexiones
│   │   ├── ai/          # Panel/acciones de IA
│   │   └── ui/          # shadcn/ui
│   ├── store/           # Zustand (libros, notas, lienzo)
│   ├── lib/             # db (Dexie), ai client, utils
│   ├── hooks/
│   ├── types/
│   └── styles/          # tema, tokens de color
└── PLAN.md
```

---

## 6. Fases de desarrollo

### Fase 1 — Núcleo (MVP)
- [ ] Scaffold (Vite + Tailwind + shadcn).
- [ ] Tema cozy/naturaleza (paleta, tipografías, layout).
- [ ] Modelo de datos + persistencia local (Dexie).
- [ ] Sidebar: Libros → Secciones → Notas (crear/renombrar/borrar).
- [ ] Lienzo libre: **click = nota de texto** editable y arrastrable.

### Fase 2 — Bloques ricos
- [ ] Menú **Ctrl + click**.
- [ ] Bloque **Tabla**.
- [ ] Bloque **Cuadro de texto**.
- [ ] Bloque **Idea** (estilo destacado).
- [ ] Bloque **Imagen** (placeholder → luego IA).
- [ ] Redimensionar / borrar / duplicar bloques.

### Fase 3 — IA
- [ ] **Limpiar/organizar** texto seleccionado.
- [ ] **Generar imagen** desde prompt.
- [ ] **Sugerir título/resumen** de una nota.
- [ ] (Opcional) **Voz a texto** para captura ultrarrápida.

### Fase 4 — Conexiones (Obsidian)
- [ ] `[[wikilinks]]` con autocompletado.
- [ ] Panel de **backlinks**.
- [ ] **Vista grafo** interactiva.
- [ ] **Conexiones sugeridas por IA** (similitud semántica).

### Fase 5 — Pulido
- [ ] Animaciones, atajos de teclado, búsqueda global.
- [ ] Exportar/importar, deploy.

---

## 7. IA — opciones

| Capacidad         | Opción A (OpenAI)        | Opción B (Anthropic + img aparte) |
|-------------------|--------------------------|-----------------------------------|
| Entender/ordenar  | GPT-4o-mini              | Claude (Haiku/Sonnet)             |
| Generar imagen    | gpt-image-1 / DALL·E     | Proveedor externo (p. ej. SDXL)   |
| Embeddings (grafo)| text-embedding-3-small   | Voyage / OpenAI                   |

> Requiere **API key** del proveedor. Se guardará de forma segura (variable de
> entorno / ajustes locales), **nunca** escrita en el código.

---

## 8. Diseño — tema cozy / natural

**Paleta (colores cálidos):**
- Fondo crema: `#FAF6F0` / `#F5EFE6`
- Superficie: `#FFFDF9`
- Terracota (primario): `#C17767`
- Salvia (acento natural): `#8A9A7B`
- Ocre (ideas): `#E0A458`
- Texto marrón cálido: `#3A332C`
- Apagado: `#9B9186`

**Estilo:**
- Esquinas redondeadas, sombras suaves, textura sutil tipo papel.
- Tipografía serif cálida para títulos + sans cómoda para cuerpo.
- Mucho espacio en blanco, cromo mínimo, animaciones gentiles.

---

## 9. Próximo paso

Confirmar decisiones de la sección 7 (proveedor de IA) y persistencia, y
comenzar por la **Fase 1 (MVP)**.
