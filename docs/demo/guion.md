# Guión del video de presentación — tuNota (54 s)

Video: `docs/demo/tunota-demo.mp4` (1280×720, también en .webm). Grabado sobre la app real,
con cursor visible. Tiempos aproximados para narrar encima (o para regrabar por partes).

| Tiempo | Escena | Qué se ve | Narración sugerida |
|---|---|---|---|
| 0:00–0:07 | Landing | La página de funcionalidades, scroll por «qué problemas resuelve» | «¿Tus ideas viven regadas entre mil apps? Esto es tuNota: un lienzo infinito para pensar, diagramar y avanzar.» |
| 0:07–0:10 | La app | El lienzo con notas de bienvenida | «Sin cuentas y sin instalación: abres y trabajas. Tus notas se quedan en tu navegador.» |
| 0:10–0:17 | Crear y clasificar | Doble clic crea una nota; se escribe «Lanzar tuNota esta semana 🚀»; clic en la insignia: Idea → Importante → Crucial (el color cambia) | «Doble clic y escribe. Cada nota se clasifica con un clic —relevante, idea, importante, crucial— y el color te lo dice de un vistazo.» |
| 0:17–0:24 | Lista → flujograma | Una nota con pasos numerados; Formatear → «Lista → flujograma»; aparece el diagrama completo | «¿Una lista de pasos? Un clic y es un flujograma: decisiones, ramas Sí/No y flechas que se conectan solas.» |
| 0:24–0:38 | Mermaid ↔ formas | Un bloque Mermaid se «explota» a formas nativas; se arrastra una caja y las flechas la siguen; se selecciona todo y vuelve a código Mermaid | «¿Vienes de Mermaid? Pega tu código, conviértelo en formas editables, muévelas como quieras… y expórtalo de vuelta a Mermaid.» |
| 0:38–0:40 | Mapa de conocimiento | El grafo libro → sección → nota → grupos | «Todo tu contenido, conectado en un mapa.» |
| 0:40–0:49 | Plan del día | Se añade una tarea, dos acciones (una se marca con su hora), recordatorio en 15 min con aviso | «Y para avanzar de verdad: el plan del día. Tareas, las acciones que ya hiciste con su hora, y recordatorios que suenan.» |
| 0:49–0:52 | Cafecito | El botón ☕ se expande a «Un cafecito»; se abre el modal con el QR de Yape | «tuNota es gratis. Si te sirve, me invitas un cafecito.» |
| 0:52–0:54 | Cierre | La landing con el CTA | «tuNota — tunota.fly.dev. Abre y empieza.» |

## Consejos de uso
- Para LinkedIn/X sube el **.mp4** (compatibilidad universal); dura <60 s, ideal para feed.
- Graba la narración encima con cualquier grabadora (QuickTime → «Grabación de audio») y
  únelas: `ffmpeg -i tunota-demo.mp4 -i voz.m4a -c:v copy -map 0:v -map 1:a salida.mp4`.
- Si quieres regrabar el video tras nuevos cambios, el script está en el historial del
  proyecto (Playwright + cursor inyectado): pídemelo y lo regenero en un minuto.
