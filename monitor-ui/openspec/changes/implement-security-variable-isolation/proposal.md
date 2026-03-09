## Why

El dashboard monitor-ui expone tokens de Home Assistant, credenciales de OpenRouter y el auth token del gateway como variables de módulo globales. Los agentes de OpenClaw embebidos en workroom pueden triggear endpoints y closures que acceden a estos valores, creando un vector de exfiltración involuntaria.

## What Changes

- **Nuevo módulo `secrets.mjs`**: carga y sella secretos una vez al arrancar; expone solo funciones de consulta por clave, nunca el objeto completo
- **Middleware de redacción**: filtra recursivamente keys sensibles (`*token*`, `*secret*`, `*key*`, `*password*`) de todas las respuestas API
- **Env saneado en spawn de agentes**: función `buildSafeEnv()` que construye env mínimo (PATH, HOME, TERM, LANG) para `child_process.exec` de workroom
- **Auth básico de dashboard**: header `X-Dashboard-Token` obligatorio; 401 sin él
- **Aislamiento de scope**: handlers de workroom no tienen acceso léxico a tokens del gateway ni HA

## Capabilities

### New Capabilities
- `secrets-vault`: módulo sellado que centraliza acceso a secretos y previene exposición a closures no autorizados
- `api-response-redaction`: middleware que sanitiza automáticamente respuestas antes de enviarlas al cliente
- `agent-spawn-isolation`: env controlado para procesos hijo de openclaw agent
- `dashboard-auth`: autenticación por header token para el servidor HTTP

### Modified Capabilities
- `security-variable-isolation`: ahora incluye implementación concreta de los 4 controles definidos en el spec existente

## Impact

- `monitor-ui/server.mjs`: refactor de carga de secrets, spawn de agentes, handlers HTTP
- Nuevo archivo: `monitor-ui/src/secrets.mjs`
- Nuevo archivo: `monitor-ui/src/safe-env.mjs`
- Variables de entorno: añadir `DASHBOARD_TOKEN` a configuración
- Sin cambios en la API pública del servidor (mismos endpoints, mismas respuestas, solo redactadas)
