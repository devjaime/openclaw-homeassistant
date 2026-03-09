/**
 * safe-env.mjs — construye un entorno mínimo para procesos hijo (agentes workroom).
 * Usa whitelist explícita para evitar heredar tokens/credenciales del proceso padre.
 */

/** Variables permitidas para procesos hijo de openclaw agent. */
const WHITELIST = [
  'PATH',
  'HOME',
  'TERM',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'OPENCLAW_BIN',
  'OPENCLAW_CONFIG',
  'TMPDIR',
  'USER',
  'LOGNAME',
];

/**
 * Retorna un objeto de entorno seguro con solo las variables whitelisted.
 * @returns {Record<string, string>}
 */
export function buildSafeEnv() {
  const safe = {};
  for (const key of WHITELIST) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key];
    }
  }
  return safe;
}
