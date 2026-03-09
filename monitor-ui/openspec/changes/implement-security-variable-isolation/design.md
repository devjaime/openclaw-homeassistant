## Context

`server.mjs` (2057 líneas) carga en el scope del módulo ESM variables como `OPENCLAW_CONFIG`, `HA_SECRETS_ENV_PATH`, tokens leídos de `secrets.env`, y el auth token del gateway. Todos los handlers HTTP y los closures de workroom tienen acceso léxico a estas variables. Los agentes embebidos (workroom desks) spawneados via `child_process.exec` heredan el entorno completo del proceso padre.

Restricciones: Node.js ESM (no CommonJS), server.mjs monolítico, sin framework HTTP (http nativo), sin TypeScript en este proyecto.

## Goals / Non-Goals

**Goals:**
- Centralizar acceso a secretos en un módulo sellado (`secrets.mjs`)
- Sanitizar automáticamente todas las respuestas API antes de enviarlas
- Proveer env mínimo a procesos hijo de agentes workroom
- Requerir `X-Dashboard-Token` en todas las requests al servidor

**Non-Goals:**
- Reescribir server.mjs completo o migrar a framework HTTP
- Implementar OAuth o autenticación multiusuario
- Cifrar secrets en disco (eso es responsabilidad del OS)
- Afectar el comportamiento funcional de ningún endpoint

## Decisions

### D1: Módulo `secrets.mjs` con `Object.freeze` en lugar de closure privada

**Alternativas consideradas:**
- A) Closure privada con WeakMap: más difícil de debuggear, complejidad innecesaria
- B) Class con métodos privados (#): requires transpilación o Node 18.7+
- **Elegida C) Módulo ESM + Object.freeze**: el módulo ESM ya actúa como singleton sellado; `freeze` previene mutación del objeto leído; `get(key)` como única interfaz de acceso

```js
// secrets.mjs
const _secrets = Object.freeze({ haToken: '...', gatewayToken: '...' });
export const getSecret = (key) => _secrets[key] ?? null;
```

### D2: Middleware de redacción como función wrapper, no interceptor global

**Alternativas:**
- A) Proxy en el objeto `res`: invasivo, difícil de testear
- B) Interceptor en `http.createServer`: afecta streaming
- **Elegida C) `redact(obj)` puro**: función recursiva que filtra keys por pattern antes de `JSON.stringify`; se llama explícitamente en cada `sendJson()` helper — localizado y testeable

Patrones redactados: `/token|secret|key|password|credential|auth/i`

### D3: `buildSafeEnv()` whitelist explícita en lugar de blacklist

**Alternativa blacklist**: eliminar keys conocidas del `process.env` — frágil, siempre hay keys no anticipadas.
**Elegida whitelist**: `{ PATH, HOME, TERM, LANG, NODE_ENV, OPENCLAW_BIN }` — cualquier key no listada queda fuera.

### D4: Auth por header `X-Dashboard-Token` sin sesión/cookie

Sesiones y cookies agregan complejidad de estado. El dashboard es single-user local. Un token estático en env var es suficiente y compatible con el acceso desde `workroom.js` (fetch con header).

Excepción: rutas de assets estáticos (`/`, `*.js`, `*.css`, `*.html`) no requieren token para evitar que el navegador rompa la carga inicial.

## Risks / Trade-offs

- **[Riesgo] Ruptura de workroom si `fetch` no envía header**: los fetch de `workroom.js` y `app.js` deben añadir `X-Dashboard-Token` → Mitigación: añadir el header en el helper `apiFetch()` del frontend leyendo `localStorage` o variable de entorno inyectada al cargar la página
- **[Riesgo] `DASHBOARD_TOKEN` vacío bloquea el dashboard**: si el usuario no configura la variable → Mitigación: si `DASHBOARD_TOKEN` está vacío, loguear advertencia y permitir acceso (modo desarrollo), nunca denegar por token vacío/faltante

## Migration Plan

1. Crear `monitor-ui/src/secrets.mjs` y `monitor-ui/src/safe-env.mjs`
2. Modificar `server.mjs`: importar módulos, reemplazar accesos directos a vars sensibles
3. Añadir `redact()` y envolver `sendJson()`
4. Añadir middleware auth antes del router principal
5. Actualizar `workroom.js` y `app.js` para enviar `X-Dashboard-Token` si está configurado
6. Reiniciar servidor y verificar que todos los endpoints existentes funcionan igual

**Rollback**: revertir `server.mjs` al commit anterior (los módulos nuevos son aditivos, no rompen nada al eliminarse).

## Open Questions

- ¿Dónde expone el usuario `DASHBOARD_TOKEN`? → Propuesta: en `~/.openclaw/secrets.env` junto a HA_TOKEN, el servidor ya lo lee
- ¿Los agentes workroom necesitan alguna variable adicional en el env seguro? → Revisar al implementar; añadir a whitelist si es necesario para que `openclaw agent` funcione
