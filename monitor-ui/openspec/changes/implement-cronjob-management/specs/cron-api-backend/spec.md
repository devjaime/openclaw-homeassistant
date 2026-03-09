## ADDED Requirements

### Requirement: cron-list-endpoint
El servidor SHALL exponer `GET /api/crons` que retorne todos los cronjobs del gateway con metadata enriquecida.

#### Scenario: lista retorna jobs con próxima ejecución calculada
- **WHEN** se hace GET /api/crons
- **THEN** retorna `{ ok: true, jobs: [{ id, name, expr, enabled, nextRun, lastRun, lastStatus }] }`

### Requirement: cron-pause-resume-endpoints
El servidor SHALL exponer `POST /api/crons/:id/pause` y `POST /api/crons/:id/resume`.

#### Scenario: pause retorna ok true en éxito
- **WHEN** se hace POST /api/crons/abc123/pause
- **THEN** retorna `{ ok: true }` y el job queda con `enabled: false`

#### Scenario: resume reactiva el job
- **WHEN** se hace POST /api/crons/abc123/resume
- **THEN** retorna `{ ok: true }` y el job queda con `enabled: true`

### Requirement: cron-delete-endpoint
El servidor SHALL exponer `DELETE /api/crons/:id`.

#### Scenario: delete retorna ok y el job desaparece de la lista
- **WHEN** se hace DELETE /api/crons/abc123
- **THEN** retorna `{ ok: true }` y el job ya no aparece en GET /api/crons

### Requirement: cron-extend-endpoint
El servidor SHALL exponer `POST /api/crons/:id/extend` que acepta `{ delayMs: number }`.

#### Scenario: extend retrasa la próxima ejecución
- **WHEN** se hace POST /api/crons/abc123/extend con `{ delayMs: 3600000 }`
- **THEN** retorna `{ ok: true, nextRun: <nueva fecha> }`
