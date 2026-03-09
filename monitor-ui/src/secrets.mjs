/**
 * secrets.mjs — módulo sellado de acceso a secretos.
 * Carga secrets.env una vez, sella el objeto con Object.freeze.
 * Única interfaz pública: getSecret(key).
 */
import fs from 'node:fs';
import path from 'node:path';

const SECRETS_ENV_PATH =
  process.env.HA_SECRETS_ENV_PATH ||
  path.join(process.env.HOME || '', '.openclaw', 'secrets.env');

/** Parsea un archivo .env estilo KEY=VALUE, ignora comentarios y líneas vacías. */
function parseEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const result = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      // Quitar comillas opcionales
      v = v.replace(/^['"]|['"]$/g, '');
      result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

// Carga: secrets.env tiene prioridad sobre process.env
const _fileSecrets = parseEnvFile(SECRETS_ENV_PATH);

/** Mapa normalizado: clave semántica → valor string. */
const _secrets = Object.freeze({
  haToken:          _fileSecrets.HA_TOKEN          ?? process.env.HA_TOKEN          ?? '',
  gatewayToken:     _fileSecrets.GATEWAY_TOKEN      ?? process.env.GATEWAY_TOKEN      ?? '',
  openrouterApiKey: _fileSecrets.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '',
  dashboardToken:   _fileSecrets.DASHBOARD_TOKEN    ?? process.env.DASHBOARD_TOKEN    ?? '',
});

/**
 * Accede a un secreto por clave semántica.
 * @param {'haToken'|'gatewayToken'|'openrouterApiKey'|'dashboardToken'} key
 * @returns {string|null}
 */
export function getSecret(key) {
  return _secrets[key] ?? null;
}
