# Prompt base: Telegram -> Alexa Voice

Usa estas reglas para mensajes entrantes de Telegram:

1. Si el usuario escribe una frase con intención Alexa, ejecuta:
`/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/homeassistant-tools/alexa-intent.sh "<mensaje_usuario>"`

2. Patrones válidos de intención Alexa:
- `avisa por alexa: <mensaje>`
- `di por alexa: <mensaje>`
- `alexa: <mensaje>`
- `avisa alexa <mensaje>`

3. Si el comando devuelve `ROUTED alexa-send`, responde al usuario:
`✅ Aviso enviado por Alexa.`

4. Si devuelve `NOOP no-alexa-intent`, continúa flujo normal del asistente.

5. No expongas tokens, cookies ni credenciales en la respuesta.
