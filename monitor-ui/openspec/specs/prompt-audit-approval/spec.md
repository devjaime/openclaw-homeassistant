# [prompt-audit-approval] Specification

## Purpose

Capturar, analizar y clasificar los prompts problemáticos que OpenClaw genera al solicitar acciones
sensibles (ejecutar programas, acceder a red, modificar archivos del sistema, etc.), y exponer un
flujo de aprobación granular por nivel de criticidad accesible desde el dashboard UI y/o Telegram.

## Background

OpenClaw genera prompts de exec-approval y tool-use que actualmente se aprueban/rechazan de forma
binaria. No existe log persistente de qué prompts fueron problemáticos, con qué frecuencia, ni
un mecanismo de aprobación condicional por contexto. El objetivo es añadir una capa de auditoría
y control sin romper el flujo de trabajo normal.

## Requirements

### Requirement: prompt-log-capture
Todos los prompts de aprobación generados por openclaw deben ser capturados y almacenados con metadata.

#### Scenario: exec prompt es capturado en log
- GIVEN openclaw solicita ejecutar un comando shell (`exec: rm -rf /tmp/foo`)
- WHEN el gateway procesa la solicitud de tool-use
- THEN el prompt es guardado en `~/.openclaw/prompt-audit.jsonl` con: timestamp, sessionId, tool, command, criticality, status (pending/approved/denied)

#### Scenario: log incluye el texto completo del prompt
- GIVEN se captura un prompt
- WHEN se escribe en el log
- THEN el campo `rawPrompt` contiene el texto completo tal como llegó del agente

### Requirement: criticality-classification
Cada prompt capturado debe clasificarse automáticamente por nivel de criticidad.

#### Scenario: clasificación de nivel CRITICAL
- GIVEN el prompt contiene patrones como `rm -rf`, `DROP TABLE`, `sudo`, `chmod 777`, `curl | bash`, escritura en `/etc/`, `/usr/`
- WHEN se clasifica el prompt
- THEN el nivel es `CRITICAL` y se bloquea la ejecución hasta recibir aprobación explícita

#### Scenario: clasificación de nivel HIGH
- GIVEN el prompt involucra escritura de archivos fuera del workspace, apertura de puertos, instalación de paquetes
- WHEN se clasifica el prompt
- THEN el nivel es `HIGH` y se notifica por Telegram con el botón de aprobación

#### Scenario: clasificación de nivel MEDIUM
- GIVEN el prompt involucra lectura de archivos de config, consultas de red GET, operaciones de git
- WHEN se clasifica el prompt
- THEN el nivel es `MEDIUM`, se registra en log y se puede aprobar desde el dashboard sin bloquear

#### Scenario: clasificación de nivel LOW
- GIVEN el prompt es una operación de lectura local, listado de archivos, llamada a API pública sin auth
- WHEN se clasifica el prompt
- THEN el nivel es `LOW`, se registra y se auto-aprueba

### Requirement: dashboard-approval-ui
El dashboard debe mostrar los prompts pendientes con su criticidad y permitir aprobación/rechazo.

#### Scenario: panel de audit muestra prompts pendientes
- GIVEN hay prompts con status `pending` en el log
- WHEN el usuario abre el dashboard
- THEN ve una sección "Prompt Audit" con lista de prompts pendientes, su nivel de criticidad (badge de color), comando solicitado y agente/sesión

#### Scenario: popup de aprobación para CRITICAL/HIGH
- GIVEN hay un prompt CRITICAL o HIGH pendiente
- WHEN el usuario hace click en "Revisar"
- THEN aparece un modal/popup con: descripción del comando, nivel de criticidad, explicación de qué significa dar acceso, y botones "Aprobar" / "Denegar"

#### Scenario: aprobación queda registrada en log
- GIVEN el usuario aprueba un prompt desde el dashboard
- WHEN se procesa la aprobación
- THEN el entry en `prompt-audit.jsonl` se actualiza con `status: approved`, `approvedBy: dashboard`, `approvedAt: <timestamp>`

### Requirement: telegram-approval-flow
Prompts HIGH y CRITICAL deben poder aprobarse/rechazarse respondiendo a un mensaje de Telegram.

#### Scenario: notificación de Telegram para prompt HIGH/CRITICAL
- GIVEN se captura un prompt de criticidad HIGH o CRITICAL
- WHEN el clasificador lo procesa
- THEN se envía un mensaje al bot de Telegram del usuario con: nivel de criticidad, comando solicitado, ID de aprobación, e instrucciones (`responde SI <id>` o `NO <id>`)

#### Scenario: respuesta "SI <id>" en Telegram aprueba el prompt
- GIVEN el usuario responde `SI abc123` en el chat de Telegram
- WHEN el gateway recibe el mensaje
- THEN el prompt con id `abc123` es aprobado y openclaw puede continuar la ejecución

#### Scenario: timeout de aprobación deniega automáticamente
- GIVEN un prompt HIGH/CRITICAL lleva más de 5 minutos sin respuesta
- WHEN se cumple el timeout
- THEN el prompt es denegado automáticamente, openclaw recibe deny, y se registra en log con `status: timeout-denied`

### Requirement: audit-log-viewer
El dashboard debe permitir ver y filtrar el historial completo de prompts auditados.

#### Scenario: filtrar por criticidad
- GIVEN el usuario está en la sección de audit log
- WHEN selecciona filtro "CRITICAL"
- THEN solo se muestran entries con `criticality: CRITICAL`

#### Scenario: exportar log
- GIVEN el usuario quiere exportar el audit log
- WHEN hace click en "Exportar"
- THEN descarga `prompt-audit.jsonl` o un CSV equivalente

## Implementation Notes

- Nuevo archivo: `monitor-ui/src/prompt-auditor.mjs` — captura, clasifica y persiste prompts
- Patrones de criticidad en `monitor-ui/src/criticality-rules.mjs` (array de regex con nivel y descripción legible)
- API endpoints nuevos: `POST /api/audit/approve`, `POST /api/audit/deny`, `GET /api/audit/pending`, `GET /api/audit/log`
- Integración Telegram: reutilizar la config de bot existente en `~/.openclaw/openclaw.json`; escuchar mensajes entrantes via polling
- El log `prompt-audit.jsonl` debe rotar si supera 10MB (keep last 5 files)
- La descripción de criticidad (qué significa dar acceso) debe ser human-friendly, no técnica
