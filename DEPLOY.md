# Entornos de tuNota

Solo hay **dos** entornos:

| Entorno | Rama | Despliegue | IA |
|---|---|---|---|
| **test** | cualquier rama distinta de `main` (recomendada: `test`) | local (`python3 server.py`) | tus claves en `.env`, o las del usuario |
| **prod** | `main` | Fly.io (automático por GitHub Actions) | **solo claves propias del usuario** (las del dueño están desactivadas) |

## test (local)

```bash
git checkout test
python3 server.py          # http://localhost:8765
```

- Para probar como en producción (sin usar tus claves), añade `TUNOTA_DISABLE_AI=1`:
  ```bash
  TUNOTA_PUBLIC=1 TUNOTA_DISABLE_AI=1 python3 server.py
  ```
- Los tests unitarios: `npm test`. Se ejecutan solos en GitHub (workflow «Pruebas (test)») en cada push que no sea a `main` y en los PR hacia `main`.

## prod (Fly.io)

El push a `main` dispara el workflow **`.github/workflows/deploy-prod.yml`**, que hace `flyctl deploy`.

**Preparación (una sola vez):**

1. Crea un token de Fly y guárdalo como secreto del repo:
   ```bash
   fly tokens create deploy -x 999999h        # copia el token
   gh secret set FLY_API_TOKEN --repo YeyitoDev/tuNota   # pega el token
   ```
2. Asegúrate de que en Fly **no** están las claves de IA del dueño (para no gastar tu límite):
   ```bash
   fly secrets unset OPENCODE_API TAVILY IMAGE_API_KEY OPENAI_API_KEY --app tunota
   ```
   `fly.toml` ya fuerza `TUNOTA_DISABLE_AI=1`, así que aunque existieran, no se usarían.
3. (Opcional) Token de acceso maestro para habilitar tu propia IA de servidor en el futuro (plan pago):
   ```bash
   fly secrets set TUNOTA_TOKEN=<un-token-largo> --app tunota
   ```

**Publicar:**

```bash
git checkout main
git merge test           # o la rama con los cambios ya probados
git push origin main     # ← esto despliega a producción
```

## IA en producción

- Por defecto la IA del servidor está **desactivada** (`TUNOTA_DISABLE_AI=1`): los endpoints `/api/ai`, `/api/search` e `/api/image` **no** usan tus claves.
- Los usuarios usan **su propia clave** (BYOK) desde el panel de IA; funciona sin tocar tus llaves.
- Para un futuro **plan pago** con tus claves: en `fly.toml` pon `TUNOTA_DISABLE_AI = "0"`, define `OPENCODE_API`/`TAVILY` como `fly secrets`, y reparte el `TUNOTA_TOKEN` a quien pague (la IA del servidor solo responde con ese Bearer token).

## Control de funcionalidades (usuario maestro)

En la app, menú «⋯» → **«Control de funcionalidades (maestro)»**. Pide el código maestro
(`MASTER_CODE` en `js/02-state.js` — **cámbialo** antes de publicar; también sirve el
`TUNOTA_TOKEN`). Desde ahí puedes ocultar funciones que aún estás puliendo (diagramas,
mapa, kanban, sync…) mientras te enfocas en el lienzo. Los visitantes ven la configuración
por defecto.
