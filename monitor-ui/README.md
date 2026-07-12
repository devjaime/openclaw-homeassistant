# Monitor UI (español)

Panel local para monitorear OpenClaw + Home Assistant:
- estado de gateway
- modelo actual
- jobs/horarios cron
- eventos Telegram
- logs OpenClaw y Home Assistant
- enlaces rápidos a dashboards
- uso de modelos/tokens (últimos días)
- gasto estimado en USD y CLP
- estadística de commits por proyecto (24h/7d/30d)
- mapa **Imán** para construir agentes y asociar skills, MCPs y memoria local

## Imán

Imán mantiene un grafo local de:

- agentes y su modelo/propósito
- skills referenciadas desde [skills.sh](https://www.skills.sh/)
- MCPs y componentes referenciados desde [AI Templates](https://aitmpl.com/)
- recuerdos privados asociados a cada agente

El agente seleccionado queda disponible mediante `GET /api/iman/map` en el campo
`activeAgentId`. La recomendación por tarea usa las etiquetas y capacidades del
grafo; no instala ni ejecuta automáticamente código de terceros.

La base se guarda por defecto en `~/.openclaw/iman-map.db`.

## Iniciar

```bash
cd /Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/monitor-ui
./start.sh
```

Abrirá:
- `http://127.0.0.1:18990`

## Variables opcionales

- `MONITOR_UI_PORT` (default `18990`)
- `OPENCLAW_CONFIG` (default `~/.openclaw/openclaw.json`)
- `OPENCLAW_GATEWAY_URL` (default `ws://127.0.0.1:18789`)
- `HA_URL` (default `http://127.0.0.1:8123`)
- `USD_CLP_RATE` (default `950`, para conversión estimada)
- `USAGE_LOOKBACK_DAYS` (default `7`)
- `IMAN_DB_PATH` (default `~/.openclaw/iman-map.db`)

## Uso rápido

- Dashboard OpenClaw nativo: `http://127.0.0.1:18789/`
- Home Assistant: `http://127.0.0.1:8123`
