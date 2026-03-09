## Context

`getCronJobs()` ya existe en server.mjs (línea ~570) y llama a `openclaw cron list --url ... --token ... --json`. La función retorna `{ ok, jobs[] }`. No existen endpoints REST para pausar/reanudar/eliminar jobs. El gateway expone la API de crons via CLI; se wrappeará con endpoints HTTP en el servidor del dashboard.

## Goals / Non-Goals

**Goals:**
- Exponer CRUD completo de cronjobs via REST en el dashboard server
- UI con tabla, detalle, formulario de creación, acciones inline
- Human-readable para expresiones cron (via `cronstrue` CDN)

**Non-Goals:**
- Edición del código del job (solo nombre, expresión, mensaje)
- Autenticación de crons individual (ya cubierto por dashboard auth)
- Historial persistente de ejecuciones (solo lo que devuelva el gateway)

## Decisions

### D1: Wrappear CLI openclaw en lugar de llamar al gateway directamente
`openclaw cron list/pause/resume/delete` ya funciona. Evita reimplementar el protocolo WS del gateway. Riesgo: latencia de spawn por request → Mitigación: respuestas en <2s, aceptable para operaciones de gestión.

### D2: cronstrue via CDN para traducción human-readable
Sin build step. `https://cdn.jsdelivr.net/npm/cronstrue@latest/dist/cronstrue.min.js` con fallback a mostrar la expresión raw si falla la carga.

### D3: Polling cada 30s para la lista, on-demand para detalle
La lista de crons no cambia frecuentemente. El historial de ejecuciones se carga solo al abrir el panel de detalle.

## Risks / Trade-offs

- **[Riesgo] openclaw cron CLI puede no tener todos los subcomandos**: verificar al implementar `pause`/`resume`/`delete`; fallback a mostrar error descriptivo en UI
- **[Riesgo] Sin historial real**: si el gateway no expone historial de ejecuciones, mostrar "Sin historial disponible" en lugar de datos falsos

## Migration Plan

1. Añadir 6 endpoints a server.mjs
2. Añadir sección HTML en index.html
3. Añadir lógica JS en app.js
4. Verificar con datos reales del gateway
