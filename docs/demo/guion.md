# Guión del video — «Construyamos una app con tuNota» (1:45)

Video: `docs/demo/tunota-demo.mp4` (1280×720, con música ambiental de fondo; también en
.webm). Grabado sobre la app real con cursor visible, ondas de clic y tarjetas de título
por escena. **Escenario narrativo**: planear una app real —«PlantSwap», trueque de plantas
entre vecinos— de la idea al plan de acción.

| Tiempo | Escena | Qué se ve | Narración sugerida |
|---|---|---|---|
| 0:00–0:05 | Portada | El lienzo + tarjeta «tuNota — Construyamos una app» | «Hoy vamos a planear una app de verdad, de la idea al plan. Todo en tuNota.» |
| 0:05–0:13 | Tour | El tour guiado real (2 pasos con foco) | «La primera vez, un tour te enseña lo esencial en 30 segundos.» |
| 0:13–0:32 | Capturar y clasificar | Se escribe la idea PlantSwap; la insignia la marca como IDEA; otra nota con pendientes se convierte en viñetas y se marca CRUCIAL (los colores cambian) | «Doble clic y escribes. Cada nota se clasifica —idea, importante, crucial— y el color habla por sí solo. ¿Líneas sueltas? Un clic y son viñetas.» |
| 0:32–0:44 | Investigar en internet | «🌐 Buscar en la web» sobre la idea: aparece un bloque conectado con el resumen y las fuentes citadas | «Investiga sin salir del lienzo: tuNota busca en internet y te deja un bloque con las fuentes citadas.» |
| 0:44–0:58 | La IA lo ordena todo | «🧭 Estructurar idea»: la IA elige Lean Startup y crea 6 fases numeradas, conectadas y agrupadas | «Y aquí la magia: la IA elige la metodología, ordena todo tu contenido en fases numeradas y te lo deja agrupado. De caos a mapa en segundos.» |
| 0:58–1:08 | Lista → flujograma | Una lista numerada del flujo de la app se convierte en flujograma con decisión Sí/No | «¿El flujo de la app? Escríbelo como lista y conviértelo en flujograma con un clic.» |
| 1:08–1:20 | Código y cURL | Un bloque Python se ejecuta (cálculo real); un cURL consulta una API y muestra el JSON | «Ejecuta Python y peticiones cURL dentro de tus notas. Ideal para probar tu API mientras diseñas.» |
| 1:20–1:31 | Anotar imágenes | Doble clic sobre una imagen abre el editor: flecha roja de anotación y Aplicar | «¿Una captura? Ábrela, dibuja encima, recorta y aplica. Sin salir de la app.» |
| 1:31–1:39 | Nunca te pierdes | El lienzo se va lejos; botón «Volver al contenido» + «Ver todo» reencuadran | «¿Te perdiste en el lienzo infinito? Minimapa, "Volver al contenido" y listo.» |
| 1:39–1:46 | Kanban | El tablero con «Diseñar el logo de PlantSwap» en Por hacer | «Tu avance, en un kanban: por hacer, en curso, hecho.» |
| 1:46–1:53 | Alarmas | Un recordatorio vence: suena y aparece el aviso en pantalla | «Y los recordatorios suenan de verdad, estés donde estés.» |
| 1:53–1:45* | Cierre | El cafecito ☕ + la landing con el CTA | «tuNota es gratis. Si te sirve, me invitas un cafecito. tunota.fly.dev» |

\* Los tiempos son aproximados (±2 s); el video dura 1:45.

## Sonido
- Lleva una **pista ambiental generada** (acorde suave con fade in/out) para que no quede
  mudo. Para la versión final te recomiendo cambiarla por música con licencia (YouTube
  Audio Library, por ejemplo):
  `ffmpeg -i tunota-demo.mp4 -i tu-musica.mp3 -map 0:v -map 1:a -c:v copy -shortest final.mp4`
- Para narrarlo con tu voz encima de la música actual:
  `ffmpeg -i tunota-demo.mp4 -i voz.m4a -filter_complex "[0:a]volume=0.25[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy final.mp4`

## Nota técnica
Las escenas de IA (buscar en internet y estructurar la idea) usan **respuestas simuladas**
del asistente para la demo — son las funciones reales de la app respondiendo como lo haría
el modelo del usuario con su clave. El resto (flujogramas, Python, cURL, editor de imagen,
kanban, alarmas) es 100 % real y en vivo.
