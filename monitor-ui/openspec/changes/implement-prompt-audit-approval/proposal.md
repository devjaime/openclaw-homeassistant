## Why

OpenClaw ejecuta comandos shell y herramientas sin log persistente ni clasificación de riesgo. No hay forma de saber qué prompts problemáticos se aprobaron, cuándo, ni de implementar aprobación condicional por criticidad. Esto crea un punto ciego de seguridad en el uso diario.

## What Changes

- **`src/prompt-auditor.mjs`**: captura y clasifica prompts por criticidad (CRITICAL/HIGH/MEDIUM/LOW), persiste en `~/.openclaw/prompt-audit.jsonl`
- **Nuevos endpoints**: `GET /api/audit/pending`, `GET /api/audit/log`, `POST /api/audit/approve`, `POST /api/audit/deny`
- **Sección "Audit" en dashboard**: lista de prompts pendientes con badges de criticidad, modal de aprobación con explicación human-friendly
- **Notificación Telegram**: prompts HIGH/CRITICAL notifican al bot con botones SI/NO `<id>`
- **Polling de respuestas Telegram**: el servidor escucha mensajes entrantes y procesa aprobaciones

## Capabilities

### New Capabilities
- `prompt-classifier`: módulo que clasifica prompts por patrones de criticidad con descripciones legibles
- `audit-log`: persistencia y rotación del log de prompts auditados
- `audit-dashboard-ui`: sección visual con lista, filtros, modal de aprobación
- `telegram-approval-flow`: notificación + aprobación via Telegram para prompts HIGH/CRITICAL

### Modified Capabilities
- `prompt-audit-approval`: implementación concreta del spec existente

## Impact

- `monitor-ui/src/prompt-auditor.mjs`: nuevo módulo
- `monitor-ui/server.mjs`: 4 nuevos endpoints + interceptor de logs de openclaw
- `monitor-ui/public/index.html`: sección Audit
- `monitor-ui/public/app.js`: lógica audit (fetch, modal, badges)
