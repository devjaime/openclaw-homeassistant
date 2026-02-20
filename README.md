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
