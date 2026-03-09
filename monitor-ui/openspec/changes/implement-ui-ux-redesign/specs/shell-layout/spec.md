## ADDED Requirements

### Requirement: sidebar-navigation
El dashboard SHALL tener un sidebar fijo a la izquierda con iconos Lucide y labels para las 5 secciones.

#### Scenario: sidebar muestra secciones con iconos
- **WHEN** el usuario carga el dashboard
- **THEN** ve sidebar con: Dashboard (LayoutDashboard), Workroom (MessageSquare), Audit (Shield), Cronjobs (Clock), Settings (Settings)

#### Scenario: sección activa tiene highlight visual
- **WHEN** el usuario está en la sección Cronjobs
- **THEN** el item Cronjobs del sidebar tiene fondo `--color-accent` y texto blanco

#### Scenario: sidebar colapsa en mobile
- **WHEN** la pantalla es < 768px
- **THEN** el sidebar se oculta; un botón hamburger lo muestra con slide-in animation

### Requirement: header-gateway-status
El header SHALL mostrar estado del gateway en tiempo real con dot animado.

#### Scenario: gateway online muestra dot verde pulse
- **WHEN** el gateway está accesible
- **THEN** header muestra dot verde con animación pulse + texto "Online" + modelo activo en badge
