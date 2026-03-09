## ADDED Requirements

### Requirement: css-design-tokens
El sistema SHALL definir tokens CSS semánticos como custom properties en `:root`.

#### Scenario: dark mode activo por defecto con tokens zinc
- **WHEN** la página carga
- **THEN** `--color-bg` es `#09090b`, `--color-surface` es `#18181b`, `--color-text` es `#fafafa`

#### Scenario: tokens de estado disponibles
- **WHEN** se revisa el CSS
- **THEN** existen `--color-success`, `--color-warning`, `--color-destructive`, `--color-accent`

### Requirement: typography-scale
El sistema SHALL usar Inter para texto y JetBrains Mono para código/logs via Google Fonts CDN.

#### Scenario: fuente mono en bloques de código
- **WHEN** se renderiza un bloque de código en el workroom o en logs
- **THEN** usa font-family JetBrains Mono con fondo `--color-surface`
