## Why

El dashboard actual usa HTML/CSS vanilla con estilos dispersos, sin sistema de diseño, sin microanimaciones y con UX deficiente en móvil. La experiencia visual no refleja la potencia del sistema subyacente. Con las nuevas secciones (Audit, Cronjobs), el layout necesita una navegación lateral estructurada.

## What Changes

- **Shell layout**: sidebar de navegación con iconos Lucide, header con estado del gateway, área de contenido
- **Design tokens**: dark mode por defecto (zinc-950), variables CSS semánticas (surface, muted, accent, destructive, success, warning)
- **Microanimaciones**: fade+slide en tarjetas, skeleton loaders, counter-animation en métricas, dot pulse en estados
- **Workroom redesign**: burbujas de chat, estado "escribiendo" (3 dots bounce), código con fondo diferenciado
- **Status cards**: metric cards con sparkline SVG, canales con iconos de marca
- **Responsive**: grid adaptativo, workroom fullscreen en móvil
- **Toasts**: notificaciones animadas entrada/salida desde abajo-derecha

## Capabilities

### New Capabilities
- `design-system`: tokens CSS, dark mode, paleta semántica zinc/violet/emerald/rose/amber
- `shell-layout`: sidebar colapsable + header + área de contenido principal
- `microanimations`: fade-slide, skeleton, counter, pulse, toast
- `workroom-chat-ui`: burbujas diferenciadas, typing indicator, syntax highlight
- `responsive-layout`: grid adaptativo 1/2/3-4 col, mobile workroom fullscreen

### Modified Capabilities
- `ui-ux-redesign`: implementación concreta del spec existente

## Impact

- `monitor-ui/public/index.html`: reestructura completa con nuevo shell
- `monitor-ui/public/styles.css`: reescritura con Tailwind CDN v4 + tokens CSS + animaciones
- `monitor-ui/public/app.js`: render functions actualizadas para nuevo markup
- `monitor-ui/public/workroom.html` + `workroom.js`: redesign de burbujas y typing indicator
- Sin build step: Tailwind CDN v4 + Lucide CDN + CSS nativo
