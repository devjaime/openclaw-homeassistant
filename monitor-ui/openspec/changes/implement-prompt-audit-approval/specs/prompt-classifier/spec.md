## ADDED Requirements

### Requirement: log-parsing-and-classification
El módulo `src/prompt-auditor.mjs` SHALL parsear logs de openclaw y clasificar líneas que contengan patrones de exec/tool-use por criticidad.

#### Scenario: línea con rm -rf clasificada como CRITICAL
- **WHEN** el parser encuentra `rm -rf` en una línea de log
- **THEN** crea un entry con `criticality: "CRITICAL"` y descripción: "Eliminar archivos de forma recursiva e irreversible"

#### Scenario: línea con curl | bash clasificada como HIGH
- **WHEN** el parser encuentra `curl | bash` o `wget | sh`
- **THEN** crea un entry con `criticality: "HIGH"` y descripción: "Descarga y ejecución de script remoto sin verificación"

#### Scenario: línea con git pull clasificada como MEDIUM
- **WHEN** el parser encuentra operaciones de git
- **THEN** crea un entry con `criticality: "MEDIUM"`

### Requirement: audit-log-persistence
Los entries clasificados SHALL persistir en `~/.openclaw/prompt-audit.jsonl` con rotación a 5MB.

#### Scenario: entry escrito con todos los campos
- **WHEN** se clasifica un prompt
- **THEN** el entry tiene: `{ id, ts, command, criticality, criticalityLabel, description, status: "logged" }`
