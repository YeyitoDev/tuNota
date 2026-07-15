# tuNota — estáticos + server.py (solo stdlib de Python)
FROM python:3.12-alpine

WORKDIR /app
COPY server.py index.html note.html note.js styles.css ./
COPY js ./js
COPY public ./public
# Guía visual/showcase (docs/showcase.html + capturas) para servirla desde la app.
COPY docs ./docs

EXPOSE 8080
CMD ["python", "server.py"]
