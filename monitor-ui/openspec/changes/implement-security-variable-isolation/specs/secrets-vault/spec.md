## ADDED Requirements

### Requirement: secrets-module-singleton
El sistema SHALL proveer un módulo ESM `src/secrets.mjs` que cargue secretos una sola vez al inicializar y los selle con `Object.freeze`, exponiendo únicamente la función `getSecret(key)`.

#### Scenario: getSecret retorna valor existente
- **WHEN** se llama `getSecret('haToken')` y el token existe en secrets.env
- **THEN** retorna el string del token sin exponer el objeto completo de secrets

#### Scenario: getSecret retorna null para key inexistente
- **WHEN** se llama `getSecret('unknownKey')`
- **THEN** retorna `null` sin lanzar error

#### Scenario: objeto interno no es mutable
- **WHEN** código externo intenta modificar el objeto retornado por el módulo
- **THEN** la mutación falla silenciosamente (Object.freeze en strict mode lanza TypeError)

### Requirement: secrets-loaded-from-env-file
El módulo SHALL leer secretos desde `~/.openclaw/secrets.env` y variables de entorno del proceso, en ese orden de precedencia.

#### Scenario: secrets.env tiene prioridad sobre process.env
- **WHEN** `HA_TOKEN` está en secrets.env y también en process.env con diferente valor
- **THEN** `getSecret('haToken')` retorna el valor de secrets.env

#### Scenario: arranque sin secrets.env no lanza error
- **WHEN** el archivo secrets.env no existe
- **THEN** el módulo carga sin error, usando solo process.env como fallback
