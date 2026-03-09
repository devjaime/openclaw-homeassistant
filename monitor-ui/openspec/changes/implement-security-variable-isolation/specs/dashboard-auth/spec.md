## ADDED Requirements

### Requirement: x-dashboard-token-header-required
El servidor SHALL rechazar con 401 cualquier request a endpoints de API (`/api/*`) que no incluya el header `X-Dashboard-Token` con el valor correcto, excepto cuando `DASHBOARD_TOKEN` está vacío (modo desarrollo).

#### Scenario: request sin header a /api/* retorna 401
- **WHEN** se hace GET `/api/status` sin el header `X-Dashboard-Token`
- **THEN** el servidor retorna HTTP 401 con body `{ error: 'Unauthorized' }`

#### Scenario: request con token correcto es procesada
- **WHEN** se hace GET `/api/status` con `X-Dashboard-Token: <valor de DASHBOARD_TOKEN>`
- **THEN** el servidor procesa la request normalmente

#### Scenario: DASHBOARD_TOKEN vacío desactiva auth (modo dev)
- **WHEN** `DASHBOARD_TOKEN` no está definido o es string vacío
- **THEN** el servidor acepta todas las requests sin verificar header, y logea un warning al arrancar

### Requirement: static-assets-bypass-auth
Los archivos estáticos del dashboard (HTML, JS, CSS) SHALL ser servidos sin requerir autenticación.

#### Scenario: index.html se sirve sin token
- **WHEN** el navegador carga `/` o `/index.html` sin header de auth
- **THEN** recibe el archivo HTML con status 200

#### Scenario: workroom.js se sirve sin token
- **WHEN** el navegador carga `/workroom.js` sin header de auth
- **THEN** recibe el archivo JS con status 200

### Requirement: frontend-sends-token-in-api-requests
El frontend (app.js, workroom.js) SHALL incluir `X-Dashboard-Token` en todos los fetch a `/api/*`, leyendo el valor de una variable global inyectada en el HTML o de `localStorage`.

#### Scenario: apiFetch helper envía el header automáticamente
- **WHEN** el frontend llama al helper `apiFetch('/api/status')`
- **THEN** el fetch incluye `X-Dashboard-Token` en los headers sin que el caller lo especifique
