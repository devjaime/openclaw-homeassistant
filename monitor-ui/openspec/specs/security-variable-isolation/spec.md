# [security-variable-isolation] Specification

## Purpose

Mitigar el acceso de OpenClaw a variables sensibles expuestas en el dashboard monitor-ui.
El servidor actualmente expone en memoria y via API valores como tokens HA, credenciales OpenRouter,
rutas de archivos de secrets y configuración de gateway. Este spec define cómo aislar esas variables
para que OpenClaw (agentes embebidos, workroom desks) no puedan leerlas ni exfiltrarlas.

## Background

`server.mjs` carga en variables de módulo:
- `HA_SECRETS_ENV_PATH` → apunta a `~/.openclaw/secrets.env` (token HA, etc.)
- `OPENCLAW_CONFIG` → `~/.openclaw/openclaw.json` (gateway auth token, model config)
- `OPENROUTER_CREDITS_URL` → usado con token real en headers
- `EXTERNAL_COST_LEDGER` → ruta a datos de costo con modelo
- Los endpoints `/api/config`, `/api/ha/*`, `/api/usage` devuelven datos que podrían filtrar info

## Requirements

### Requirement: redact-sensitive-api-responses
Las respuestas de los endpoints del dashboard no deben incluir tokens, paths de archivos de credenciales,
ni el auth token del gateway en texto plano.

#### Scenario: GET /api/config no expone auth token
- GIVEN el servidor está corriendo y un agente openclaw hace GET /api/config
- WHEN la respuesta es parseada
- THEN no debe contener el campo `gateway.auth.token` ni ninguna key con patrón `*token*`, `*secret*`, `*key*`, `*password*`

#### Scenario: GET /api/status no expone rutas absolutas de archivos sensibles
- GIVEN un agente consulta el estado del gateway
- WHEN la respuesta se devuelve al cliente
- THEN las rutas como `~/.openclaw/secrets.env` o `~/.openclaw/openclaw.json` deben ser omitidas o reemplazadas por `[redacted]`

### Requirement: secrets-not-in-process-env-for-agents
Los agentes spawneados por workroom (`openclaw agent ...`) no deben heredar variables de entorno con tokens.

#### Scenario: spawn de agente workroom no hereda HA_TOKEN
- GIVEN el servidor tiene `HA_TOKEN` en su entorno (leído de secrets.env)
- WHEN se hace `child_process.exec('openclaw agent ...')`
- THEN el proceso hijo recibe un env saneado sin `HA_TOKEN`, `OPENROUTER_API_KEY` ni `OPENCLAW_GATEWAY_TOKEN`

#### Scenario: spawn de agente workroom tiene solo variables necesarias
- GIVEN se lanza un agente para el desk `ha`
- WHEN el proceso hijo se inicializa
- THEN solo recibe `PATH`, `HOME`, `TERM`, `LANG` y variables explícitamente whitelisted

### Requirement: dashboard-access-control
El dashboard debe requerir autenticación básica para evitar acceso no autorizado desde la red local.

#### Scenario: acceso sin token es rechazado
- GIVEN el servidor está corriendo en 0.0.0.0:18990 o loopback
- WHEN se hace una request sin header `X-Dashboard-Token`
- THEN el servidor responde 401 Unauthorized

#### Scenario: acceso con token correcto es permitido
- GIVEN el token está configurado en `DASHBOARD_TOKEN` env var
- WHEN se hace una request con `X-Dashboard-Token: <valor correcto>`
- THEN la request es procesada normalmente

### Requirement: memory-isolation-for-agents
Los datos sensibles no deben almacenarse en variables globales accesibles por closures que los agentes puedan triggear.

#### Scenario: handler de workroom no tiene acceso a HA_TOKEN en scope
- GIVEN se refactoriza el servidor para aislar secrets
- WHEN el módulo de workroom handlers es evaluado
- THEN `HA_TOKEN`, `GATEWAY_TOKEN` y similares no están en su scope léxico

## Implementation Notes

- Crear `src/secrets.mjs` como módulo sellado: carga secrets una vez, expone solo funciones de consulta por clave, nunca el objeto completo
- Añadir middleware de redacción en `serveApiResponse()` que filtre keys sensibles recursivamente
- Usar `Object.freeze()` en el objeto de config interno para prevenir mutación
- El spawn de agentes debe usar `{ env: buildSafeEnv() }` — función explícita que construye env mínimo
- Añadir `DASHBOARD_TOKEN` a `.env.example` con instrucciones de configuración
- Tests: agregar `monitor-ui/server.test.mjs` con casos para los escenarios de este spec
