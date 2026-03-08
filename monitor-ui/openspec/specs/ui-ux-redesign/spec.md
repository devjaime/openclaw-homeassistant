# [ui-ux-redesign] Specification

## Purpose

Rediseñar la interfaz del dashboard monitor-ui con un stack moderno (shadcn/ui, Tailwind CSS v4,
microanimaciones fluidas) siguiendo principios de UX pro-max: jerarquía visual clara, feedback
inmediato, estados de carga elegantes, y diseño coherente en todos los paneles (status, workroom,
audit, cronjobs).

## Background

El dashboard actual usa HTML/CSS vanilla con estilos inline dispersos. No hay sistema de diseño,
los colores son inconsistentes, no hay microanimaciones ni feedback visual en acciones, y la
experiencia en móvil es deficiente. El objetivo es llevar la calidad visual al nivel de un producto
profesional sin perder la funcionalidad actual.

## Stack de Diseño

- **Framework UI**: shadcn/ui (componentes headless accesibles)
- **CSS**: Tailwind CSS v4 (utility-first, design tokens)
- **Animaciones**: Framer Motion (React) o CSS transitions + View Transitions API (si se mantiene vanilla)
- **Iconos**: Lucide icons (consistentes con shadcn)
- **Tipografía**: Inter (sans) + JetBrains Mono (código/logs)
- **Color system**: dark mode primario, light mode opcional, tokens semánticos (surface, muted, accent, destructive)

## Requirements

### Requirement: design-system-tokens
Definir un sistema de tokens de diseño coherente antes de implementar componentes.

#### Scenario: dark mode es el modo por defecto
- GIVEN el usuario abre el dashboard por primera vez
- WHEN la página carga
- THEN el tema dark está activo con fondo `#09090b` (zinc-950), texto `#fafafa` (zinc-50)

#### Scenario: tokens semánticos disponibles en CSS
- GIVEN el sistema de diseño está implementado
- WHEN se revisa el CSS
- THEN existen variables `--color-surface`, `--color-surface-elevated`, `--color-muted`, `--color-accent`, `--color-destructive`, `--color-success`, `--color-warning`

### Requirement: layout-shell
El shell principal del dashboard debe tener navegación lateral colapsable, header con estado global y área de contenido principal.

#### Scenario: sidebar navigation con iconos y labels
- GIVEN el usuario está en el dashboard
- WHEN ve el sidebar
- THEN encuentra: Dashboard (home), Workroom (chat), Audit (shield), Cronjobs (clock), Settings (gear) — con iconos Lucide y labels

#### Scenario: sidebar colapsa en mobile (< 768px)
- GIVEN el usuario está en pantalla móvil
- WHEN el sidebar está colapsado
- THEN solo se ven iconos, labels ocultos; un hamburger button lo expande con slide-in animation

#### Scenario: header muestra estado del gateway en tiempo real
- GIVEN el gateway está online
- WHEN el header se renderiza
- THEN muestra un dot animado verde con "Gateway Online" y el modelo activo en badge

### Requirement: microanimations
Todas las interacciones deben tener feedback visual inmediato con animaciones sutiles y fluidas.

#### Scenario: botones tienen hover + active states animados
- GIVEN cualquier botón del dashboard
- WHEN el usuario hace hover
- THEN el botón escala 1.02 con transition 150ms ease-out y cambia de color con 100ms

#### Scenario: tarjetas tienen entrada con fade+slide-up
- GIVEN una tarjeta de status o métrica se monta en el DOM
- WHEN aparece por primera vez
- THEN entra con `opacity: 0 → 1` y `translateY: 8px → 0` en 200ms con ease-out

#### Scenario: notificaciones/toasts con animación de entrada/salida
- GIVEN una operación se completa (aprobación, denial, restart)
- WHEN se muestra el toast
- THEN entra desde abajo-derecha con slide-up 200ms, sale con fade-out 150ms tras 3s

#### Scenario: skeleton loaders durante fetch
- GIVEN una sección del dashboard está cargando datos de la API
- WHEN los datos aún no llegan
- THEN se muestran skeleton loaders animados (shimmer effect) en lugar de spinners o espacios vacíos

#### Scenario: números/métricas animan al cambiar valor
- GIVEN una métrica (costo USD, tokens usados, uptime) cambia de valor
- WHEN el nuevo valor se renderiza
- THEN el número hace counter-animation del valor anterior al nuevo en 400ms

### Requirement: workroom-panel-redesign
Los paneles de workroom deben verse como una app de mensajería moderna.

#### Scenario: burbujas de chat diferenciadas por rol
- GIVEN hay mensajes en un desk de workroom
- WHEN se renderizan
- THEN mensajes del usuario aparecen a la derecha (color accent), respuestas del agente a la izquierda (color surface-elevated), con avatar inicial y timestamp

#### Scenario: estado "escribiendo" del agente
- GIVEN un agente está procesando una respuesta
- WHEN el polling detecta `busy: true`
- THEN aparece una burbuja con 3 dots animados (bounce sequencial) indicando actividad

#### Scenario: código en respuestas del agente con syntax highlighting
- GIVEN la respuesta del agente contiene bloques de código markdown
- WHEN se renderiza en el panel
- THEN el código aparece con fondo diferenciado, fuente mono, y botón "Copiar"

### Requirement: status-cards-redesign
Las tarjetas de status del home deben ser ricas en información con indicadores visuales claros.

#### Scenario: metric cards con sparkline
- GIVEN hay histórico de uso de recursos (CPU, RAM)
- WHEN se muestra una metric card
- THEN incluye un mini-sparkline SVG de las últimas 24h además del valor actual

#### Scenario: estado de canales con iconos por tipo
- GIVEN hay canales configurados (Telegram, WhatsApp, Discord, etc.)
- WHEN se muestra la sección de canales
- THEN cada canal tiene su icono de marca, color de estado (verde/rojo/amarillo) y latencia en ms

### Requirement: responsive-mobile
El dashboard debe ser usable en pantalla de teléfono (375px+).

#### Scenario: grid de métricas adapta columnas
- GIVEN el usuario está en móvil (< 640px)
- WHEN ve la sección de métricas
- THEN el grid es de 1 columna, en tablet 2 columnas, en desktop 3-4 columnas

#### Scenario: workroom en móvil ocupa pantalla completa
- GIVEN el usuario selecciona un desk en móvil
- WHEN el panel se abre
- THEN ocupa toda la pantalla con back button para volver a la lista de desks

## Implementation Notes

- Si se migra a React: usar Vite + React 19 + shadcn/ui CLI (`npx shadcn@latest init`)
- Si se mantiene vanilla: usar Tailwind CDN v4 + View Transitions API + CSS `@keyframes` para animaciones
- Skills a usar: `shadcn-ui` (giuseppe-trisciuoglio/developer-kit), `ui-ux-pro-max` (nextlevelbuilder), `web-design-guidelines` (vercel-labs)
- Paleta de colores base: zinc para neutros, violet para accent primario, emerald para success, rose para destructive, amber para warning
- Todos los componentes deben ser ARIA accesibles (roles, labels, focus-visible)
- Añadir `prefers-reduced-motion` query para desactivar animaciones si el usuario lo prefiere
- Mantener compatibilidad con los endpoints existentes de server.mjs; solo cambia el frontend
