## ADDED Requirements

### Requirement: audit-section-with-badges
El dashboard SHALL mostrar una sección "Audit" con lista de prompts clasificados y badges de criticidad con colores.

#### Scenario: badges de color por criticidad
- **WHEN** se muestra un entry de audit
- **THEN** CRITICAL=rojo, HIGH=naranja, MEDIUM=amarillo, LOW=gris con texto y color diferenciado

### Requirement: audit-modal-approval
Entries CRITICAL y HIGH SHALL tener botón "Revisar" que abre un modal con descripción y botones Aprobar/Denegar.

#### Scenario: modal muestra qué significa dar acceso
- **WHEN** el usuario hace click en Revisar
- **THEN** el modal muestra: nivel, comando, descripción human-friendly ("Esto permite eliminar archivos permanentemente"), botones Aprobar/Denegar

#### Scenario: aprobación actualiza el entry
- **WHEN** el usuario hace click en Aprobar
- **THEN** el entry cambia a `status: approved` con timestamp, el badge cambia a verde con ✓

### Requirement: audit-log-filter
La sección SHALL permitir filtrar por criticidad y por estado.

#### Scenario: filtro por CRITICAL muestra solo esos entries
- **WHEN** el usuario selecciona filtro "CRITICAL"
- **THEN** solo se muestran entries con criticality CRITICAL
