# Twitter nocturno con OpenClaw (sin API)

Este flujo publica en X/Twitter mientras duermes, usando sesión web del navegador controlado por OpenClaw.

## Seguridad recomendada

- No compartas usuario/clave con el bot.
- Inicia sesión tú manualmente una vez en X.
- Usa límites de publicación (este setup: máximo 2 tweets por ejecución).
- Si falla login, el flujo se detiene y lo reporta por Telegram.

## Archivos

- `nightly_prompt.md`: reglas editoriales y de seguridad.
- `prepare-twitter-session.sh`: abre X para login manual.
- `setup-twitter-cron.sh`: crea/actualiza job nocturno.
- `run-once-twitter.sh`: prueba manual inmediata.
- `enable-twitter-cron.sh`: habilita job.
- `disable-twitter-cron.sh`: pausa job.

## Paso a paso

1. Preparar sesión de X

```bash
cd /Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/twitter
./prepare-twitter-session.sh
```

Inicia sesión manual en X en la ventana que se abre.

2. Crear el cron nocturno

```bash
./setup-twitter-cron.sh
```

Config actual:
- Hora: `03:20`
- Zona horaria: `America/Santiago`
- Reporte de resultado: Telegram (`1540433103`)

3. Probar una vez ahora

```bash
./run-once-twitter.sh
```

4. Pausar o reactivar

```bash
./disable-twitter-cron.sh
./enable-twitter-cron.sh
```

## Notas

- Si cambias la hora, edita `CRON_EXPR` en `setup-twitter-cron.sh`.
- Si quieres solo 1 tweet por noche, ajústalo en `nightly_prompt.md`.
- Si X pide verificación/captcha, no fuerces automatización: vuelve a iniciar sesión manual.
