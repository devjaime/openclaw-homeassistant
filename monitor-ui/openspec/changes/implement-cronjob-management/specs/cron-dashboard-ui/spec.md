## ADDED Requirements

### Requirement: cron-table-section
El dashboard SHALL mostrar una sección "Cronjobs" con tabla de todos los jobs.

#### Scenario: tabla muestra nombre, expresión, próxima ejecución y estado
- **WHEN** el usuario navega a la sección Cronjobs
- **THEN** ve columnas: Nombre | Expresión | Próxima ejecución | Estado | Acciones

#### Scenario: estado visual con dot animado
- **WHEN** un job está activo
- **THEN** muestra dot verde con animación pulse; pausado=gris; error=rojo

### Requirement: cron-actions-inline
Cada fila de la tabla SHALL tener botones de acción: Pausar/Reactivar, Extender, Eliminar.

#### Scenario: pausar con confirmación inline
- **WHEN** el usuario hace click en Pausar
- **THEN** aparece confirmación inline en la fila; al confirmar, el dot cambia a gris

#### Scenario: eliminar requiere confirmación
- **WHEN** el usuario hace click en Eliminar
- **THEN** aparece modal con nombre del job para confirmar; al confirmar, la fila desaparece con fade-out

### Requirement: cron-polling
La lista de cronjobs SHALL refrescarse automáticamente cada 30 segundos.

#### Scenario: lista se actualiza sin recargar página
- **WHEN** pasan 30 segundos desde el último fetch
- **THEN** la tabla se actualiza con el estado actual de los jobs
