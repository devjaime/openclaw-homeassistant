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

## Uso rápido

- Dashboard OpenClaw nativo: `http://127.0.0.1:18789/`
- Home Assistant: `http://127.0.0.1:8123`
