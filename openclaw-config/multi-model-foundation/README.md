# OpenClaw Multi-Model Foundation

Base inicial para enrutar tareas entre modelos vía OpenRouter con control de costos/tokens.

## Objetivos

- Resumen diario de actividad (cámaras / Home Assistant)
- Enrutamiento por tipo de tarea
- Control de `max_tokens`, `temperature`, presupuesto y costo estimado

## Modelos por tarea

- Desarrollo y tareas generales: `minimax/minimax-m2.5`
- Resumen diario de logs largos: `google/gemini-3-flash-preview`
- Análisis de imágenes: `moonshotai/kimi-k2.5`

## Estructura

- `config/models.json`: mapeo de tareas -> modelo + límites
- `config/runtime.json`: presupuesto y defaults de ejecución
- `prompts/*.md`: plantillas base por caso
- `scripts/openrouter-client.mjs`: cliente OpenRouter
- `scripts/task-router.mjs`: selección de modelo por tipo de tarea
- `scripts/daily-ha-summary.mjs`: job diario (resumen HA)
- `scripts/run-daily-summary.sh`: runner simple
- `scripts/setup-cron-example.sh`: ejemplo de cron OpenClaw
- `reports/`: salidas markdown

## Variables de entorno

- `OPENROUTER_API_KEY` (requerida)
- `HA_URL` (default `http://127.0.0.1:8123`)
- `HA_TOKEN` (opcional, para API Home Assistant)
- `OPENROUTER_BUDGET_USD` (default `10`)

## Ejecución rápida

```bash
cd /Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/openclaw-config/multi-model-foundation
./scripts/run-daily-summary.sh
```

## Nota de costos

El job guarda en el reporte:

- tokens de entrada/salida
- costo estimado por ejecución
- porcentaje de presupuesto usado
