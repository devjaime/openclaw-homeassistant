## 1. Backend: endpoints de cronjobs en server.mjs

- [ ] 1.1 Añadir `GET /api/crons` que llama a `getCronJobs()` existente y retorna la lista con sendJson()
- [ ] 1.2 Añadir `POST /api/crons/:id/pause` que ejecuta `openclaw cron pause <id>` via runShell()
- [ ] 1.3 Añadir `POST /api/crons/:id/resume` que ejecuta `openclaw cron resume <id>` via runShell()
- [ ] 1.4 Añadir `DELETE /api/crons/:id` que ejecuta `openclaw cron delete <id>` via runShell()
- [ ] 1.5 Añadir `POST /api/crons/:id/extend` con body `{ delayMs }` que pausa + reprograma el job
- [ ] 1.6 Verificar que los 5 endpoints responden correctamente con datos del gateway real

## 2. Frontend HTML: sección Cronjobs en index.html

- [ ] 2.1 Añadir sección `<section id="section-crons">` con tabla vacía y skeleton loader
- [ ] 2.2 Añadir columnas: Nombre, Expresión cron, Próxima ejecución, Estado, Acciones
- [ ] 2.3 Añadir botones por fila: Pausar/Reactivar (toggle), Extender (+1h/+24h dropdown), Eliminar
- [ ] 2.4 Añadir modal de confirmación de eliminación con campo nombre del job

## 3. Frontend JS: lógica de cronjobs en app.js

- [ ] 3.1 Añadir función `fetchCrons()` que llama a `/api/crons` y renderiza la tabla
- [ ] 3.2 Añadir función `renderCronTable(jobs)` con dot de estado (verde pulse/gris/rojo) y expresión cron human-readable via cronstrue CDN
- [ ] 3.3 Añadir handlers para pausar/reactivar con confirmación inline en la fila
- [ ] 3.4 Añadir handler de eliminación con modal de confirmación + fade-out de fila al eliminar
- [ ] 3.5 Añadir handler de extensión con dropdown de opciones (+1h, +24h, +1 semana)
- [ ] 3.6 Añadir polling de crons cada 30 segundos con `setInterval`
- [ ] 3.7 Añadir script CDN de cronstrue en index.html y usar `cronstrue.toString(expr)` para traducción

## 4. Verificación y commit

- [ ] 4.1 Probar GET /api/crons con datos reales del gateway
- [ ] 4.2 Probar pause/resume desde la UI
- [ ] 4.3 Commitear y pushear cambios
