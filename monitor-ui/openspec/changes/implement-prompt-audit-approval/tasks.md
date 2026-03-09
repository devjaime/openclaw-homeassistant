## 1. Módulo src/prompt-auditor.mjs

- [ ] 1.1 Crear `src/prompt-auditor.mjs` con array `CRITICALITY_RULES` (patrones regex + nivel + descripción human-friendly)
- [ ] 1.2 Añadir función `classifyLine(text)` que retorna `{ criticality, description }` o null si no matchea
- [ ] 1.3 Añadir función `appendAuditEntry(entry)` que escribe en `~/.openclaw/prompt-audit.jsonl` con rotación a 5MB
- [ ] 1.4 Añadir función `readAuditLog(limit)` que lee las últimas N entradas del log
- [ ] 1.5 Exportar `{ classifyLine, appendAuditEntry, readAuditLog, CRITICALITY_RULES }`

## 2. Integración en server.mjs

- [ ] 2.1 Importar prompt-auditor en server.mjs
- [ ] 2.2 Añadir función `scanLogsForAudit()` que lee las últimas líneas de `/tmp/openclaw/*.log`, clasifica con `classifyLine()` y persiste entries nuevos
- [ ] 2.3 Añadir `GET /api/audit/log?limit=50&criticality=` que retorna entries filtrados
- [ ] 2.4 Añadir `GET /api/audit/pending` que retorna entries con status pending/logged (CRITICAL y HIGH)
- [ ] 2.5 Añadir `POST /api/audit/approve` con body `{ id }` que actualiza status a `approved`
- [ ] 2.6 Añadir `POST /api/audit/deny` con body `{ id }` que actualiza status a `denied`
- [ ] 2.7 Invocar `scanLogsForAudit()` en el intervalo de status (cada 15s) para mantener el log actualizado

## 3. Notificación Telegram (si bot configurado)

- [ ] 3.1 Añadir función `sendTelegramAlert(entry)` que notifica al chat con mensaje: nivel 🚨, comando, ID de aprobación, instrucciones `SI <id>` / `NO <id>`
- [ ] 3.2 Añadir polling Telegram `getUpdates` cada 30s que parsea mensajes `SI/NO <id>` y llama a approve/deny
- [ ] 3.3 Invocar `sendTelegramAlert` solo para entries CRITICAL y HIGH al momento de clasificarlos

## 4. Frontend: sección Audit en index.html + app.js

- [ ] 4.1 Añadir sección `<section id="section-audit">` con filtros de criticidad (chips/tabs) y lista de entries
- [ ] 4.2 Añadir función `renderAuditEntry(entry)` con badge de color (rojo/naranja/amarillo/gris) y botón "Revisar" para CRITICAL/HIGH
- [ ] 4.3 Añadir modal de aprobación con: nivel, comando, descripción human-friendly ("¿Qué significa esto?"), botones Aprobar/Denegar
- [ ] 4.4 Añadir handlers de filtro por criticality y status
- [ ] 4.5 Polling de `/api/audit/pending` cada 30s para actualizar badges de pendientes en el nav

## 5. Verificación y commit

- [ ] 5.1 Probar clasificación con logs reales de openclaw en /tmp/openclaw/
- [ ] 5.2 Probar flujo modal approve/deny desde la UI
- [ ] 5.3 Commitear y pushear
