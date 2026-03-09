## ADDED Requirements

### Requirement: card-entrance-animation
Las tarjetas SHALL entrar con fade+slide-up al montarse en el DOM.

#### Scenario: tarjeta nueva entra con animación
- **WHEN** una tarjeta se inserta en el DOM
- **THEN** anima `opacity: 0→1` + `translateY: 8px→0` en 200ms ease-out

### Requirement: skeleton-loaders
Secciones en carga SHALL mostrar skeleton loaders con shimmer en lugar de spinners.

#### Scenario: shimmer durante fetch de /api/status
- **WHEN** el fetch de status está pendiente
- **THEN** se muestran rectángulos con animación shimmer (gradiente animado) en lugar del contenido

### Requirement: toast-notifications
El sistema SHALL mostrar toasts animados bottom-right para resultados de acciones.

#### Scenario: toast de éxito aparece y desaparece
- **WHEN** una acción (pausar cron, aprobar prompt) tiene éxito
- **THEN** aparece toast verde con slide-up 200ms, espera 3s, sale con fade-out 150ms

### Requirement: workroom-typing-indicator
Cuando el agente está procesando SHALL mostrarse indicador de "escribiendo" con 3 dots bounce.

#### Scenario: typing indicator durante busy: true
- **WHEN** el polling detecta que el agente está ocupado
- **THEN** aparece burbuja con 3 dots que hacen bounce secuencial (delay 0ms, 150ms, 300ms)

### Requirement: chat-bubbles-differentiated
Los mensajes del workroom SHALL tener burbujas diferenciadas por rol.

#### Scenario: mensajes usuario a la derecha, agente a la izquierda
- **WHEN** se renderizan mensajes del workroom
- **THEN** mensajes de usuario: burbuja derecha con `--color-accent`; agente: burbuja izquierda con `--color-surface`
