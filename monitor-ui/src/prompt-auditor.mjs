/**
 * prompt-auditor.mjs — clasifica y persiste prompts problemáticos de openclaw.
 * Lee logs de /tmp/openclaw/, clasifica por criticidad, escribe en prompt-audit.jsonl.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AUDIT_LOG_PATH = process.env.PROMPT_AUDIT_LOG ||
  path.join(process.env.HOME || '', '.openclaw', 'prompt-audit.jsonl');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB

/** Reglas de criticidad: { re, criticality, label, description } */
export const CRITICALITY_RULES = [
  {
    re: /rm\s+-rf|rm\s+--force|shred\s+|wipefs\s+|dd\s+if=\/dev\/zero/i,
    criticality: 'CRITICAL',
    label: '🔴 CRÍTICO',
    description: 'Eliminar archivos de forma recursiva e irreversible. Puede borrar datos permanentemente.',
  },
  {
    re: /curl[^|]*\|[\s]*(?:bash|sh)|wget[^|]*\|[\s]*(?:bash|sh)|eval\s*\$\(/i,
    criticality: 'CRITICAL',
    label: '🔴 CRÍTICO',
    description: 'Descarga y ejecución de script remoto sin verificación. Riesgo de código malicioso.',
  },
  {
    re: /sudo\s+|chmod\s+777|chown\s+root|passwd\s+/i,
    criticality: 'HIGH',
    label: '🟠 ALTO',
    description: 'Operación con privilegios elevados o cambio de permisos críticos del sistema.',
  },
  {
    re: /DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;/i,
    criticality: 'HIGH',
    label: '🟠 ALTO',
    description: 'Operación destructiva en base de datos. Puede eliminar datos permanentemente.',
  },
  {
    re: /npm\s+install\s+-g|pip\s+install|brew\s+install|apt\s+install/i,
    criticality: 'HIGH',
    label: '🟠 ALTO',
    description: 'Instalación de paquete global en el sistema. Puede modificar el entorno de desarrollo.',
  },
  {
    re: />\s*\/etc\/|>>\s*\/etc\/|>\s*\/usr\/|>\s*~\/\.ssh\//i,
    criticality: 'HIGH',
    label: '🟠 ALTO',
    description: 'Escritura en archivo de configuración del sistema o SSH. Puede comprometer la seguridad.',
  },
  {
    re: /git\s+push|git\s+reset\s+--hard|git\s+rebase/i,
    criticality: 'MEDIUM',
    label: '🟡 MEDIO',
    description: 'Operación de git que modifica historial o publica cambios remotamente.',
  },
  {
    re: /curl\s+|wget\s+|fetch\s+https?:\/\//i,
    criticality: 'MEDIUM',
    label: '🟡 MEDIO',
    description: 'Petición HTTP a un servidor externo.',
  },
  {
    re: /cat\s+~\/\.|less\s+~\/\.|head\s+~\/\.openclaw/i,
    criticality: 'MEDIUM',
    label: '🟡 MEDIO',
    description: 'Lectura de archivo de configuración o credencial local.',
  },
  {
    re: /ls\s+|find\s+|echo\s+|pwd|whoami|uname/i,
    criticality: 'LOW',
    label: '⚪ BAJO',
    description: 'Operación de solo lectura o informativa. Sin riesgo significativo.',
  },
];

/**
 * Clasifica una línea de log por criticidad.
 * @param {string} text
 * @returns {{ criticality, label, description, rule } | null}
 */
export function classifyLine(text) {
  for (const rule of CRITICALITY_RULES) {
    if (rule.re.test(text)) {
      return { criticality: rule.criticality, label: rule.label, description: rule.description };
    }
  }
  return null;
}

/** Rota el log si supera MAX_LOG_BYTES (keep última mitad de líneas). */
function rotateIfNeeded() {
  try {
    const stat = fs.statSync(AUDIT_LOG_PATH);
    if (stat.size > MAX_LOG_BYTES) {
      const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').split('\n').filter(Boolean);
      const keep = lines.slice(Math.floor(lines.length / 2));
      fs.writeFileSync(AUDIT_LOG_PATH, keep.join('\n') + '\n', 'utf8');
    }
  } catch { /* no existe aún */ }
}

/**
 * Escribe un entry de audit en el log.
 * @param {{ command, criticality, label, description, sessionId?, tool? }} entry
 */
export function appendAuditEntry(entry) {
  rotateIfNeeded();
  const record = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    sessionId: entry.sessionId || 'unknown',
    tool: entry.tool || 'exec',
    command: entry.command,
    criticality: entry.criticality,
    label: entry.label,
    description: entry.description,
    status: 'logged',
  };
  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

/**
 * Lee las últimas N entradas del log, opcionalmente filtradas por criticidad.
 * @param {number} limit
 * @param {string} [criticalityFilter]
 * @returns {object[]}
 */
export function readAuditLog(limit = 50, criticalityFilter = '') {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    let entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (criticalityFilter) entries = entries.filter((e) => e.criticality === criticalityFilter.toUpperCase());
    return entries.slice(-limit).reverse(); // más recientes primero
  } catch {
    return [];
  }
}

/**
 * Actualiza campos de un entry existente en el log.
 * @param {string} id
 * @param {object} updates
 */
export function updateAuditEntry(id, updates) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return;
    const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const updated = lines.map((l) => {
      try {
        const entry = JSON.parse(l);
        if (entry.id === id) return JSON.stringify({ ...entry, ...updates });
        return l;
      } catch { return l; }
    });
    fs.writeFileSync(AUDIT_LOG_PATH, updated.join('\n') + '\n', 'utf8');
  } catch { /* silencioso */ }
}
