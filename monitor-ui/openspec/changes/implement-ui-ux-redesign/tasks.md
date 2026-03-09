## 1. Design system: styles.css

- [ ] 1.1 Reescribir styles.css con custom properties: `--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-success`, `--color-warning`, `--color-destructive`
- [ ] 1.2 Añadir `@keyframes shimmer` (gradiente animado para skeleton loaders)
- [ ] 1.3 Añadir `@keyframes fadeSlideUp` (opacity 0→1 + translateY 8px→0, 200ms ease-out)
- [ ] 1.4 Añadir `@keyframes pulse` (escala 1→1.05→1 para dots de estado)
- [ ] 1.5 Añadir `@keyframes bounce3dots` para typing indicator (3 elementos con delay)
- [ ] 1.6 Añadir clases `.skeleton`, `.toast`, `.toast-enter`, `.toast-exit`, `.chat-bubble-user`, `.chat-bubble-agent`
- [ ] 1.7 Añadir `@import` de Inter + JetBrains Mono desde Google Fonts

## 2. Shell layout: index.html

- [ ] 2.1 Añadir en `<head>`: CDN Lucide, CDN cronstrue, Google Fonts (Inter + JetBrains Mono)
- [ ] 2.2 Reestructurar `<body>` con: `#app-shell` > `#sidebar` + `#main-area` > `#header` + `#content`
- [ ] 2.3 Añadir `#sidebar` con 5 nav items (`data-section="dashboard|workroom|audit|crons|settings"`) y sus iconos Lucide (`data-lucide="..."`)
- [ ] 2.4 Añadir `#header` con: dot de gateway (pulse), texto estado, badge modelo activo, botón hamburger para mobile
- [ ] 2.5 Añadir `#toast-container` fijo bottom-right para el sistema de toasts
- [ ] 2.6 Asegurar que las secciones existentes (status, workroom embed, audit, crons) tienen id `section-*` y se muestran/ocultan con class `active`

## 3. Navegación y toasts en app.js

- [ ] 3.1 Añadir `initLucide()` que llama a `lucide.createIcons()` después del DOM load
- [ ] 3.2 Añadir `navigateTo(sectionId)` que usa `document.startViewTransition` si está disponible, con fallback sin animación
- [ ] 3.3 Añadir click handlers en los nav items del sidebar para llamar `navigateTo()`
- [ ] 3.4 Añadir `showToast(message, type)` que crea un `<div class="toast toast-enter">`, lo inserta en `#toast-container`, y lo elimina tras 3s con clase `toast-exit`
- [ ] 3.5 Añadir hamburger toggle para sidebar en mobile (clase `sidebar-open` en `#app-shell`)
- [ ] 3.6 Reemplazar spinners existentes por skeleton loaders con clase `.skeleton` durante fetches

## 4. Workroom redesign

- [ ] 4.1 Reescribir `renderMessages(messages)` en workroom.js para generar burbujas `.chat-bubble-user` (derecha) y `.chat-bubble-agent` (izquierda) con avatar inicial, timestamp relativo
- [ ] 4.2 Añadir typing indicator: cuando `busy: true`, insertar burbuja `.typing-indicator` con 3 spans `.dot` que usan `@keyframes bounce3dots`
- [ ] 4.3 Detectar bloques de código markdown en respuestas del agente y renderizarlos con `<pre><code>` y clase `code-block` (fondo surface, fuente mono, botón Copiar)
- [ ] 4.4 Actualizar workroom.html con nuevo markup de shell de chat compatible con las clases CSS nuevas

## 5. Metric cards con status dots

- [ ] 5.1 Actualizar `renderStatus(data)` en app.js para que los indicadores de estado usen dots CSS con clase `status-dot status-dot--online|offline|warn` (pulse animation para online)
- [ ] 5.2 Actualizar los cards de canales para incluir ícono de marca (emoji o Lucide) y latencia en ms si está disponible

## 6. Responsive

- [ ] 6.1 Añadir media queries: sidebar colapsado en <768px, grid 1-col en <640px, 2-col en 640-1024px, 3-col en >1024px
- [ ] 6.2 Añadir `@media (prefers-reduced-motion: reduce)` que desactiva todas las animaciones

## 7. Verificación y commit

- [ ] 7.1 Verificar el dashboard en viewport 375px, 768px y 1280px
- [ ] 7.2 Verificar que las secciones Audit y Cronjobs son accesibles desde el sidebar
- [ ] 7.3 Commitear todo y pushear
