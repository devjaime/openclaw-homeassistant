## ADDED Requirements

### Requirement: redact-sensitive-keys-recursive
El sistema SHALL aplicar una función `redact(obj)` a todo objeto antes de serializar respuestas JSON, eliminando recursivamente keys que coincidan con el patrón `/token|secret|key|password|credential|auth/i`.

#### Scenario: key sensible es eliminada de respuesta
- **WHEN** un handler retorna `{ status: 'ok', gatewayToken: 'abc123' }`
- **THEN** el cliente recibe `{ status: 'ok' }` sin el campo `gatewayToken`

#### Scenario: redacción es recursiva en objetos anidados
- **WHEN** la respuesta contiene `{ config: { gateway: { auth: { token: 'xyz' } } } }`
- **THEN** el cliente recibe `{ config: { gateway: { auth: {} } } }`

#### Scenario: arrays son procesados elemento a elemento
- **WHEN** la respuesta contiene un array de objetos con keys sensibles
- **THEN** cada elemento del array es redactado individualmente

### Requirement: sendJson-wrapper-centralizes-redaction
El servidor SHALL usar exclusivamente un helper `sendJson(res, data)` para enviar JSON, y ese helper MUST aplicar `redact()` antes de `JSON.stringify`.

#### Scenario: no existen llamadas directas a JSON.stringify con datos de usuario
- **WHEN** se revisa server.mjs después de la implementación
- **THEN** todas las respuestas JSON pasan por `sendJson()`, no hay `res.end(JSON.stringify(...))` directos con datos sin redactar
