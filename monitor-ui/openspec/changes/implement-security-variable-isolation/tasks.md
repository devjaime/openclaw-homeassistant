## 1. Módulo secrets.mjs

- [x]1.1 Crear `monitor-ui/src/secrets.mjs` que lea `~/.openclaw/secrets.env` y `process.env`, selle el objeto con `Object.freeze` y exporte solo `getSecret(key)`
- [x]1.2 Reemplazar en `server.mjs` todos los accesos directos a variables sensibles (HA_TOKEN, GATEWAY_TOKEN, OPENROUTER_API_KEY) por llamadas a `getSecret()`
- [x]1.3 Verificar que el servidor arranca sin error con y sin `secrets.env` presente

## 2. Módulo safe-env.mjs

- [x]2.1 Crear `monitor-ui/src/safe-env.mjs` con `buildSafeEnv()` que retorne whitelist: `PATH, HOME, TERM, LANG, NODE_ENV, OPENCLAW_BIN, OPENCLAW_CONFIG`
- [x]2.2 Actualizar `dispatchAgentMessage()` en `server.mjs` para pasar `{ env: buildSafeEnv() }` al `exec()` de openclaw agent
- [x]2.3 Verificar que agentes workroom aún funcionan con el env reducido (openclaw agent puede resolver su binario)

## 3. Middleware de redacción

- [x]3.1 Añadir función `redact(obj)` en `server.mjs` (o importarla de `src/redact.mjs`) que elimine recursivamente keys sensibles por regex `/token|secret|key|password|credential|auth/i`
- [x]3.2 Crear o actualizar el helper `sendJson(res, statusCode, data)` para que aplique `redact()` antes de `JSON.stringify`
- [x]3.3 Reemplazar todos los `res.end(JSON.stringify(...))` en server.mjs por llamadas al helper `sendJson()`
- [x]3.4 Probar manualmente que `GET /api/status` y `GET /api/config` no devuelven tokens en la respuesta

## 4. Auth por header X-Dashboard-Token

- [x]4.1 Añadir middleware de auth al inicio del router HTTP en `server.mjs` que verifique `X-Dashboard-Token` en requests a `/api/*`
- [x]4.2 Si `DASHBOARD_TOKEN` está vacío, loguear `[WARN] DASHBOARD_TOKEN not set — auth disabled` al arrancar y omitir la verificación
- [x]4.3 Asegurar que rutas de assets estáticos (`/`, `*.html`, `*.js`, `*.css`) bypass el middleware de auth

## 5. Frontend: envío de token en requests

- [x]5.1 Añadir helper `apiFetch(path, options)` en `public/app.js` que incluya automáticamente `X-Dashboard-Token` en headers, leyendo el valor de `window.DASHBOARD_TOKEN` (inyectado en HTML) o `localStorage.getItem('dashboard_token')`
- [x]5.2 Añadir helper equivalente en `public/workroom.js` o reutilizar el mismo módulo
- [x]5.3 Actualizar `index.html` y `workroom.html` para inyectar `window.DASHBOARD_TOKEN` desde una variable de configuración del servidor (o instrucciones de configuración en README)
- [x]5.4 Migrar todos los `fetch('/api/...')` existentes en app.js y workroom.js para usar `apiFetch()`

## 6. Commit y verificación final

- [x]6.1 Commitear `src/secrets.mjs`, `src/safe-env.mjs`, cambios en `server.mjs`, `app.js`, `workroom.js`, `index.html`, `workroom.html`
- [x]6.2 Reiniciar el servidor y verificar que el workroom de los 4 desks sigue funcionando
- [x]6.3 Verificar con `curl -s http://127.0.0.1:18990/api/status | grep -i token` que no hay tokens en respuestas
- [x]6.4 Actualizar README/`.env.example` con instrucciones de `DASHBOARD_TOKEN`
