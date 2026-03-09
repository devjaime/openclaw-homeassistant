## Context

OpenClaw escribe logs en `/tmp/openclaw/`. El dashboard ya lee estos logs en `getLastLogLines()`. Los prompts de aprobación (`exec-approval`, tool-use) aparecen en esos logs. La idea es parsear esos logs en tiempo real, clasificar por criticidad y exponer un flujo de aprobación.

El bot de Telegram ya está configurado en `~/.openclaw/openclaw.json` (campo `telegram`). Se reutilizará para notificaciones outbound y se añadirá polling de mensajes entrantes para aprobaciones.

## Goals / Non-Goals

**Goals:**
- Capturar y clasificar prompts problemáticos de los logs de openclaw
- Panel visual de audit con filtros y modal de aprobación
- Notificación Telegram para prompts HIGH/CRITICAL

**Non-Goals:**
- Integración con el gateway para interceptar prompts antes de ejecutarse (requiere cambios en core openclaw — fuera de scope)
- Sistema de permisos multi-usuario
- Almacenamiento cifrado del log de audit

## Decisions

### D1: Leer logs existentes en lugar de interceptar el gateway
Parsear `/tmp/openclaw/*.log` es no-invasivo y no requiere cambios en openclaw core. La clasificación es post-hoc (los comandos ya se ejecutaron), pero permite detectar patrones problemáticos y construir historial de riesgo.

Para aprobación preventiva real se necesitaría integrar con el exec-approval hook del gateway — se deja como mejora futura.

### D2: `prompt-audit.jsonl` como store persistente
Append-only JSONL, rotación a 5MB. Cada entry: `{ id, ts, sessionId, tool, command, rawPrompt, criticality, status, approvedBy, approvedAt }`.

### D3: Telegram polling via getUpdates (long polling)
Sin webhook (requiere URL pública). `GET https://api.telegram.org/bot<token>/getUpdates?offset=<last_update_id>&timeout=30` cada 30s. Parsear mensajes `SI <id>` / `NO <id>`.

## Risks / Trade-offs

- **[Riesgo] Bot token no configurado**: si no hay token Telegram, la feature de notificación simplemente no se activa; el audit local sigue funcionando
- **[Riesgo] Falsos positivos en clasificación**: patrones de criticidad pueden matchear comandos inofensivos → Mitigación: descripciones human-friendly en el modal para que el usuario entienda el contexto

## Migration Plan

1. Crear `src/prompt-auditor.mjs`
2. Añadir 4 endpoints + Telegram polling en server.mjs
3. Añadir sección Audit en index.html + app.js
4. Probar con logs de openclaw reales
