## Context

El dashboard actual (index.html 526 líneas, styles.css 97 líneas, app.js 1825 líneas) usa HTML vanilla con clases CSS ad-hoc. No hay sistema de diseño, los colores están hardcodeados inline. El workroom (workroom.html 288 líneas) tiene estilos propios no compartidos.

Con las nuevas secciones (Audit, Cronjobs), el layout necesita navegación estructurada. Se elige enfoque vanilla + Tailwind CDN para evitar build step y mantener compatibilidad con el servidor Node http nativo.

## Goals / Non-Goals

**Goals:**
- Dark mode por defecto con tokens CSS semánticos
- Sidebar de navegación con 5 secciones: Dashboard, Workroom, Audit, Cronjobs, Settings
- Microanimaciones con CSS transitions y @keyframes (sin dependencias JS de animación)
- Workroom como chat moderno con burbujas diferenciadas
- Responsive 375px+

**Non-Goals:**
- Migrar a React/Vue (mantener vanilla JS)
- Eliminar funcionalidad existente
- Soporte light mode (dark mode por defecto, toggle opcional en v2)

## Decisions

### D1: Tailwind CDN v4 + CSS custom properties para tokens
Tailwind CDN v4 soporta configuración vía `@theme` en CSS. Combinar con `--color-*` custom properties para tokens semánticos. Sin build step.

### D2: Lucide icons via CDN
`https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js`. `lucide.createIcons()` después del DOM load. Iconos SVG inline con `data-lucide="name"`.

### D3: View Transitions API para navegación entre secciones
`document.startViewTransition(() => showSection(id))` — animación suave entre secciones sin router. Fallback: sin animación si la API no está disponible.

### D4: Skeleton loaders con CSS shimmer en lugar de spinners
`@keyframes shimmer` con gradiente animado. Más moderno y menos disruptivo que spinners.

### D5: Toast system propio (sin librerías)
`<div id="toast-container">` fijo bottom-right. Append/remove con CSS classes para animación entrada/salida.

## Risks / Trade-offs

- **[Riesgo] Tailwind CDN v4 puede tener diferencias con Tailwind v3**: verificar clases usadas; preferir CSS custom properties para lo más específico
- **[Riesgo] View Transitions API solo en Chrome/Edge**: Firefox sin soporte aún → Mitigación: el fallback sin animación mantiene funcionalidad completa
- **[Riesgo] app.js 1825 líneas se vuelve difícil de mantener**: al añadir funcionalidad de crons + audit + UI → refactorizar en secciones con comentarios claros, sin partir en módulos (mantener vanilla)

## Migration Plan

1. Reescribir styles.css con design tokens + animaciones
2. Reestructurar index.html con shell layout + sidebar
3. Actualizar app.js: añadir init de Lucide, toast system, skeleton loaders, navegación
4. Reescribir workroom.html + workroom.js con chat bubbles + typing indicator
5. Verificar responsive en 375px, 768px, 1280px
