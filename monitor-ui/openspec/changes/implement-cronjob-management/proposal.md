## Why

No existe forma visual de ver ni gestionar los cronjobs que OpenClaw crea. El usuario debe usar CLI para listar, pausar o eliminar jobs, lo que es lento y propenso a errores. El dashboard es el lugar natural para exponer esta gestión.

## What Changes

- **Nuevos endpoints API**: `GET /api/crons`, `GET /api/crons/:id/history`, `POST /api/crons/:id/pause`, `POST /api/crons/:id/resume`, `POST /api/crons/:id/extend`, `DELETE /api/crons/:id`
- **Sección "Cronjobs" en el dashboard**: tabla con nombre, expresión cron, próxima ejecución (human-readable), estado (activo/pausado/error), acciones
- **Panel de detalle**: historial de las últimas 10 ejecuciones con resultado expandible
- **Formulario de creación**: presets comunes + expresión custom con preview en tiempo real
- **Notificaciones de fallo**: toast en dashboard cuando un job falla

## Capabilities

### New Capabilities
- `cron-api-backend`: endpoints REST para CRUD de cronjobs sobre el gateway openclaw
- `cron-dashboard-ui`: sección visual en index.html con tabla, detail panel, formulario de creación
- `cron-notifications`: toasts de fallo + polling de estado

### Modified Capabilities
- `cronjob-management`: implementación concreta del spec existente

## Impact

- `monitor-ui/server.mjs`: 6 nuevos endpoints de crons
- `monitor-ui/public/index.html`: nueva sección Cronjobs
- `monitor-ui/public/app.js`: lógica de crons (fetch, render, acciones)
- Sin dependencias nuevas de npm (usar `cronstrue` via CDN para traducción human-readable)
