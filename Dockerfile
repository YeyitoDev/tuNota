# tuNota — estáticos + server.py (solo stdlib de Python)
FROM python:3.12-alpine

WORKDIR /app
COPY server.py index.html note.html note.js styles.css manifest.json sw.js legal.html LICENSE ./
COPY js ./js
COPY public ./public
# Solo lo público de docs/: showcase y capturas (los planes internos no se despliegan).
COPY docs/showcase.html ./docs/showcase.html
COPY docs/screenshots ./docs/screenshots

EXPOSE 8080
CMD ["python", "server.py"]
