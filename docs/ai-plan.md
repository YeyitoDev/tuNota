# Plan de IA en tuNota — del asistente al agente de conocimiento

Objetivo: que la IA no sea un chat aparte, sino una capa que **mejora el
conocimiento guardado en las notas**: escribe mejor, extrae insights, conecta
ideas y ayuda a pasar de idea → decisión → ejecución.

## Estado actual (implementado)

- **Infraestructura multi-proveedor** (`js/04-sidebar-theme-ai.js`): OpenAI,
  Groq, OpenRouter, Gemini, Anthropic y endpoints OpenAI-compatibles.
  `callAI(messages)` unifica los tres estilos de API. La clave vive en el
  navegador del usuario (localStorage) — sin backend.
- **Chat de nota** con acciones rápidas: Resumir nota, Ideas, Insights,
  Accionables; cualquier respuesta se puede insertar como bloque.
- **IA sobre bloques** (menú ⋯ de cada tarjeta de texto/idea/markdown/tabla):
  - ✍️ *Mejorar redacción* — reescribe el bloque in situ (Ctrl+Z deshace).
  - 📝 *Resumir* / 💡 *Insights* / 🌱 *Expandir* / ✅ *Accionables* — crean un
    bloque Markdown **enlazado al bloque fuente**, así el grafo de
    conocimiento registra de dónde salió cada análisis.

## Principios

1. **La nota es la fuente de verdad**: la IA propone, el usuario decide;
   toda escritura pasa por `pushUndo` o crea bloques nuevos (nunca destruye).
2. **Procedencia visible**: los resultados de IA nacen enlazados a su fuente
   (aparecen en el grafo y en el lienzo como conexión).
3. **Local-first**: la clave y el contexto salen solo hacia el proveedor
   elegido por el usuario; nada pasa por servidores de tuNota.

## Roadmap

### Corto plazo (siguiente iteración)
- **IA en plantillas**: botón "Rellenar con IA" en cada canvas (BMC, Lean,
  DAFO…) que, a partir de una descripción de una línea, propone contenido
  inicial para cada caja y lo escribe en los bloques de la plantilla.
- **Título automático**: sugerir título de nota a partir de su contenido.
- **Selección múltiple → sintetizar**: con varios bloques seleccionados,
  acción "Combinar con IA" que genera una síntesis enlazada a todos ellos.

### Medio plazo
- **Conexiones sugeridas**: al guardar un bloque, buscar (por embeddings
  locales o por keywords) bloques relacionados en otras notas y proponer
  enlaces ("esto conecta con X en la nota Y"). Es el paso de *notas* a
  *conocimiento*.
- **Resumen semanal**: digest de lo escrito en la semana + tareas pendientes
  detectadas (integrado con recordatorios/Kanban).
- **Streaming** de respuestas y cancelación (mejor UX con textos largos).

### Largo plazo (agente)
- **Flujos de idea → despliegue**: el agente encadena plantillas — de un
  brainstorm genera un Lean Canvas; del canvas, una arquitectura (Mermaid);
  de la arquitectura, tareas en el Kanban. Cada paso revisable.
- **RAG sobre todos los libros**: preguntar "¿qué sabemos de X?" y responder
  citando bloques (requiere índice local, p. ej. embeddings en IndexedDB).
- **Acciones con herramientas**: dejar que el agente ejecute los bloques
  Python/cURL existentes como herramientas para verificar datos de la nota.

## Riesgos y mitigaciones
- *Coste/latencia*: acciones por bloque limitan el contexto a 8k caracteres;
  el usuario elige modelo (p. ej. Groq/Haiku para acciones rápidas).
- *Alucinaciones*: los prompts piden fidelidad al texto fuente; los
  resultados se insertan como bloques separados marcados por su título.
- *Privacidad*: aviso explícito en el panel de configuración; nunca se envía
  nada sin acción del usuario.
