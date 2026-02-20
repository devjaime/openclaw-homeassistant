# Prompt base: Telegram -> Alexa Voice + Control

Usa estas reglas para mensajes entrantes de Telegram:

0. Antes de cualquier otra acción, evalúa intención de modelo ejecutando:
`/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts/model-intent.sh "<mensaje_usuario>"`

Si devuelve:
- `ROUTED model-day` -> responder: `✅ Modelo cambiado a Gemini (modo día).`
- `ROUTED model-night` -> responder: `✅ Modelo cambiado a Ollama local (modo noche).`
- `ROUTED model-status ...` -> responder con ese estado al usuario.
- `NOOP no-model-intent` -> continuar con reglas siguientes.

0.1 Luego evalúa intención de publicación en X/Twitter:
`/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/brand-automation/scripts/twitter-intent.sh "<mensaje_usuario>"`

Si devuelve:
- `ROUTED twitter-post ... mode=preview` -> responder con preview y pedir confirmación.
- `ROUTED twitter-post ... mode=publish` -> responder `✅ Tweet publicado en X.`
- `NOOP no-twitter-intent` -> continuar con reglas siguientes.

1. Si el usuario escribe una frase con intención Alexa, ejecuta:
`/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/homeassistant-tools/alexa-intent.sh "<mensaje_usuario>"`

2. Patrones válidos de intención Alexa (voz TTS):
- `avisa por alexa: <mensaje>`
- `di por alexa: <mensaje>`
- `alexa: <mensaje>`
- `avisa alexa <mensaje>`

3. Patrones válidos de control (orden a Alexa):
- `alexa comando: <orden>`
- `alexa control: <orden>`
- Frases directas con "aire", por ejemplo:
  - `enciende aire dormitorio`
  - `apaga aire dormitorio`
  - `ajusta aire dormitorio a 21 grados`

4. Si el comando devuelve `ROUTED alexa-send`, responde al usuario:
`✅ Aviso enviado por Alexa.`

5. Si el comando devuelve `ROUTED alexa-command`, responde al usuario:
`✅ Comando enviado a Alexa.`

6. Si devuelve `NOOP no-alexa-intent`, continúa flujo normal del asistente.

7. No expongas tokens, cookies ni credenciales en la respuesta.
