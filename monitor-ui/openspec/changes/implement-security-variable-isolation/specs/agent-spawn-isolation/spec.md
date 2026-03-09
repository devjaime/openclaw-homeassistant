## ADDED Requirements

### Requirement: safe-env-whitelist-for-child-processes
El sistema SHALL proveer `src/safe-env.mjs` con la función `buildSafeEnv()` que retorna un objeto de entorno mínimo para procesos hijo, usando whitelist explícita de variables permitidas.

#### Scenario: env resultante contiene solo variables whitelisted
- **WHEN** `buildSafeEnv()` es llamado con `process.env` completo
- **THEN** el objeto retornado contiene únicamente: `PATH`, `HOME`, `TERM`, `LANG`, `NODE_ENV`, `OPENCLAW_BIN`, `OPENCLAW_CONFIG` (ruta no-sensible)

#### Scenario: HA_TOKEN no está en el env de agentes workroom
- **WHEN** un agente workroom es spawneado con `{ env: buildSafeEnv() }`
- **THEN** el proceso hijo no puede acceder a `process.env.HA_TOKEN`

#### Scenario: OPENROUTER_API_KEY no está en el env de agentes workroom
- **WHEN** un agente workroom es spawneado con `{ env: buildSafeEnv() }`
- **THEN** el proceso hijo no puede acceder a `process.env.OPENROUTER_API_KEY`

### Requirement: workroom-exec-uses-safe-env
Todos los `child_process.exec` que lanzan agentes workroom (`openclaw agent ...`) SHALL usar `{ env: buildSafeEnv() }` como opción.

#### Scenario: dispatchAgentMessage usa buildSafeEnv
- **WHEN** `dispatchAgentMessage()` ejecuta el comando openclaw
- **THEN** la llamada a `exec()` incluye `{ env: buildSafeEnv() }` en las opciones
