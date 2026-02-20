# openclaw-homeassistant

Base de trabajo para version custom de OpenClaw + Home Assistant.

## Estructura
- `openclaw/`: snapshot del codigo fuente de OpenClaw
- `homeassistant-tools/`: scripts operativos (camara, HA API, Alexa)
- `homeassistant-infra/`: docker compose para correr Home Assistant

## Inicio rapido
```bash
cd homeassistant-infra
docker compose up -d
```

## Scripts utiles
```bash
./homeassistant-tools/ha.sh ping
./homeassistant-tools/cam.sh list
./homeassistant-tools/alexa.sh discover
```

## Nota
No se versionan secretos ni config privada de Home Assistant.

## Alexa (voz) en Home Assistant

1. Instalar componente custom Alexa Media Player:
```bash
cd homeassistant-infra
./scripts/install-alexa-media.sh
```

2. Completar login Amazon en la UI:
- `Settings` -> `Devices & Services` -> `Add Integration`
- Buscar `Alexa Media Player`
- Iniciar sesion (incluye 2FA/captcha)

3. Verificar rutas de voz disponibles:
```bash
./homeassistant-tools/alexa.sh discover
```

Cuando aparezcan `notify.alexa_*` o `media_player.echo_*`, ya queda operativo el envio de voz.
