# [cronjob-management] Specification

## Purpose

Mostrar, crear, editar, extender, desactivar y eliminar los cronjobs creados por OpenClaw desde
el dashboard monitor-ui, con una interfaz visual clara que explique cada job y su próxima ejecución.

## Background

OpenClaw puede crear cron jobs via la API de crons del gateway. Actualmente no hay forma visual
de ver qué jobs existen, cuándo se ejecutan, o modificarlos sin acceder al CLI. El objetivo es
exponer una UI de gestión completa que consuma el API existente del gateway.

## Requirements

### Requirement: cronjob-list-view
El dashboard debe mostrar todos los cronjobs activos e inactivos registrados por OpenClaw.

#### Scenario: lista de cronjobs con metadata
- GIVEN hay cronjobs registrados en el gateway
- WHEN el usuario navega a la sección "Cronjobs"
- THEN ve una tabla/lista con: nombre del job, expresión cron, próxima ejecución (human-readable), estado (activo/pausado), agente/sesión que lo creó, última ejecución y resultado (success/error)

#### Scenario: próxima ejecución en tiempo humano legible
- GIVEN un job tiene expresión `0 9 * * 1-5`
- WHEN se renderiza en la lista
- THEN muestra "Próxima ejecución: lunes a las 09:00" o "en 2h 15m"

#### Scenario: estado visual diferenciado por color
- GIVEN un job está activo
- WHEN se muestra en la lista
- THEN tiene un dot verde animado (pulse); si está pausado, dot gris; si falló, dot rojo

### Requirement: cronjob-detail-view
Cada cronjob debe tener una vista de detalle con historial de ejecuciones.

#### Scenario: panel de detalle al hacer click en un job
- GIVEN el usuario hace click en un cronjob
- WHEN se abre el panel de detalle
- THEN muestra: expresión cron con visualizador interactivo (tipo cron-expression-descriptor), comando/acción configurada, historial de últimas 10 ejecuciones con timestamp y resultado, y opciones de gestión

#### Scenario: historial de ejecuciones con resultado expandible
- GIVEN hay ejecuciones previas del job
- WHEN se muestra el historial
- THEN cada entrada tiene: timestamp, duración, status (✓/✗), y botón para expandir el output/error de esa ejecución

### Requirement: cronjob-actions
El usuario debe poder gestionar cada cronjob desde la UI.

#### Scenario: pausar/reactivar un cronjob
- GIVEN el usuario ve un job activo
- WHEN hace click en "Pausar"
- THEN aparece confirmación inline ("¿Pausar este job?"), al confirmar el job se pausa, el dot cambia a gris y el botón cambia a "Reactivar"

#### Scenario: editar expresión cron
- GIVEN el usuario hace click en "Editar"
- WHEN se abre el formulario de edición
- THEN puede modificar: nombre, expresión cron (con helper visual que muestra en lenguaje natural qué significa), y el comando/mensaje del agente

#### Scenario: extender/retrasar próxima ejecución
- GIVEN el usuario quiere retrasar un job
- WHEN hace click en "Extender"
- THEN un picker permite elegir: +1h, +24h, +1 semana, o fecha/hora específica, y se actualiza la próxima ejecución sin cambiar la expresión cron base

#### Scenario: eliminar un cronjob con confirmación
- GIVEN el usuario hace click en "Eliminar"
- WHEN aparece el modal de confirmación
- THEN debe escribir el nombre del job para confirmar (prevenir eliminación accidental); al confirmar, el job es eliminado y desaparece de la lista con fade-out animation

### Requirement: cronjob-create
Debe ser posible crear nuevos cronjobs desde el dashboard.

#### Scenario: formulario de creación con preset de expresiones
- GIVEN el usuario hace click en "Nuevo cronjob"
- WHEN se abre el formulario
- THEN puede elegir entre: presets comunes (cada hora, diario 9am, semanal lunes, mensual 1er día) o expresión cron personalizada con preview en tiempo real de cuándo se ejecutará

#### Scenario: asignación a sesión/agente
- GIVEN el usuario está creando un cronjob
- WHEN selecciona el agente destino
- THEN puede elegir entre las sesiones activas (vocari, humanloop, blog, ha) o una sesión custom

#### Scenario: validación de expresión cron antes de guardar
- GIVEN el usuario ingresó una expresión cron
- WHEN la escribe en el campo
- THEN en tiempo real aparece la traducción ("se ejecuta todos los días a las 9:00 AM") y si es inválida, un mensaje de error en rojo

### Requirement: cronjob-notifications
El usuario debe recibir notificaciones cuando un cronjob falla.

#### Scenario: notificación en dashboard al fallar un job
- GIVEN un cronjob falla su ejecución
- WHEN el dashboard hace polling
- THEN aparece un toast de error con el nombre del job, el error, y botón "Ver detalle"

#### Scenario: notificación Telegram al fallar job CRITICAL
- GIVEN un cronjob con tag `critical` falla
- WHEN se detecta el fallo
- THEN se envía mensaje a Telegram con: nombre del job, error, y opción de reintento

## API Endpoints Nuevos en server.mjs

| Método | Path | Descripción |
|--------|------|-------------|
| GET | /api/crons | Lista todos los cronjobs |
| GET | /api/crons/:id | Detalle + historial de un job |
| POST | /api/crons | Crear nuevo cronjob |
| PATCH | /api/crons/:id | Editar job (nombre, cron, comando) |
| POST | /api/crons/:id/pause | Pausar job |
| POST | /api/crons/:id/resume | Reactivar job |
| POST | /api/crons/:id/extend | Extender próxima ejecución |
| DELETE | /api/crons/:id | Eliminar job |
| GET | /api/crons/:id/history | Historial de ejecuciones |

## Implementation Notes

- Fuente de datos: gateway WebSocket o REST API de openclaw en `ws://127.0.0.1:18789`
- Leer cronjobs via `openclaw crons list --json` (o endpoint directo del gateway si existe)
- Parser de cron para traducción humana: usar `cronstrue` npm package (liviano, sin deps)
- El visualizador de próxima ejecución puede usar `cron-parser` para calcular `nextDate`
- Polling de la lista cada 30s; historial de ejecuciones on-demand al abrir detalle
- La sección de Cronjobs debe ser una nueva tab/ruta en el sidebar del shell UI
- Compatibilidad: si el gateway no expone API de crons, hacer fallback a parsear `~/.openclaw/crons.json` si existe
