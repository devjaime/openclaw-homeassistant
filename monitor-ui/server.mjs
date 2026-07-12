#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, exec, spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { getSecret } from './src/secrets.mjs';
import { buildSafeEnv } from './src/safe-env.mjs';
import { classifyLine, appendAuditEntry, readAuditLog, updateAuditEntry } from './src/prompt-auditor.mjs';
import {
  initImanDb,
  getImanMap,
  createImanAgent,
  selectImanAgent,
  addImanMemory,
  recommendImanAgent,
} from './src/iman-store.mjs';
import {
  initDb as initAutonomousDb,
  createSession as createAutoSession,
  getSession as getAutoSession,
  listSessions as listAutoSessions,
  appendStep as appendAutoStep,
  listSteps as listAutoSteps,
  updateSession as updateAutoSession,
  getActiveLoops,
  startLoop as startAutoLoop,
  stopLoop as stopAutoLoop,
  pauseLoop as pauseAutoLoop,
  subscribeSSE as subscribeAutoSSE,
  unsubscribeSSE as unsubscribeAutoSSE,
} from './src/autonomous-agent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = Number(process.env.MONITOR_UI_PORT || 18990);
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(process.env.HOME || '', '.openclaw', 'openclaw.json');
const OPENCLAW_LOG_DIR = '/tmp/openclaw';
const HA_URL = process.env.HA_URL || 'http://127.0.0.1:8123';
const ENV_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const AGENTWORKROOM_ROOT = process.env.AGENTWORKROOM_ROOT || path.join(process.env.HOME || '', 'Projects', 'AgentWorkroom');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || path.join(AGENTWORKROOM_ROOT, 'dist', 'index.js');
const OPENCLAW_UPDATE_BIN = process.env.OPENCLAW_UPDATE_BIN || '/Users/devjaime/Library/pnpm/openclaw';
const AGENTWORKROOM_START = process.env.AGENTWORKROOM_START || path.join(AGENTWORKROOM_ROOT, 'scripts', 'agentworkroom-start-local.sh');
const AGENTWORKROOM_STOP = process.env.AGENTWORKROOM_STOP || path.join(AGENTWORKROOM_ROOT, 'scripts', 'agentworkroom-stop-local.sh');
const AGENTWORKROOM_STATUS = process.env.AGENTWORKROOM_STATUS || path.join(AGENTWORKROOM_ROOT, 'scripts', 'agentworkroom-status-local.sh');
const DOCKER_BIN = process.env.DOCKER_BIN || (
  fs.existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' :
  fs.existsSync('/opt/homebrew/bin/docker') ? '/opt/homebrew/bin/docker' :
  '/Applications/Docker.app/Contents/Resources/bin/docker'
);
const RUNTIME_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  process.env.PATH || '',
].filter(Boolean).join(':');
const USD_CLP_RATE = Number(process.env.USD_CLP_RATE || 950);
const OPENROUTER_BUDGET_USD = Number(process.env.OPENROUTER_BUDGET_USD || 10);
const USAGE_LOOKBACK_DAYS = Number(process.env.USAGE_LOOKBACK_DAYS || 7);
const USAGE_MAX_FILES = Number(process.env.USAGE_MAX_FILES || 40);
const EXTERNAL_COST_LEDGER = process.env.EXTERNAL_COST_LEDGER || '/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant/openclaw-config/multi-model-foundation/data/cost-ledger.jsonl';
const USAGE_RESET_STATE_PATH = process.env.USAGE_RESET_STATE_PATH || path.join(process.env.HOME || '', '.openclaw', 'monitor-usage-reset.json');
const OPENROUTER_CREDITS_URL = process.env.OPENROUTER_CREDITS_URL || 'https://openrouter.ai/api/v1/credits';
const HA_SECRETS_ENV_PATH = process.env.HA_SECRETS_ENV_PATH || path.join(process.env.HOME || '', '.openclaw', 'secrets.env');
const MODE_LOCAL_MODEL = process.env.MODE_LOCAL_MODEL || 'custom-127-0-0-1-11434/minimax-m2.5:cloud';
const MODE_CLOUD_MODEL = process.env.MODE_CLOUD_MODEL || 'openrouter/minimax/minimax-m2.7';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OPENCODE_BIN = process.env.OPENCODE_BIN || '/Users/devjaime/.opencode/bin/opencode';
const OPENCODE_PORT = Number(process.env.OPENCODE_PORT || 4096);
const CLAUDE_SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR || path.join(process.env.HOME || '', '.claude', 'skills');
const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.HOME || '', '.hermes');
const HERMES_CLI = process.env.HERMES_CLI || path.join(HERMES_HOME, 'hermes-agent', 'venv', 'bin', 'python');

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runAgentWorkroomScript(scriptPath, timeout = 60000) {
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, code: 1, output: `Script not found: ${scriptPath}` };
  }
  return runShell(`cd ${quoteShell(AGENTWORKROOM_ROOT)} && /bin/bash ${quoteShell(scriptPath)}`, timeout);
}

// ── Model capability database ─────────────────────────────────────────────────
// Keyed by partial model name (lowercased). First match wins.
const MODEL_CAPABILITY_DB = [
  {
    match: ['qwen2.5vl', 'qwen2-vl', 'llava', 'minicpm-v', 'moondream', 'bakllava', 'cogvlm'],
    caps: ['multimodal', 'vision', 'text'],
    badge: '👁️ Multimodal',
    description: 'Entiende imágenes y texto. Ideal para analizar screenshots, diagramas, fotos y documentos visuales.',
    strengths: ['Análisis de imágenes', 'OCR visual', 'Descripción de UI', 'Respuesta a preguntas sobre fotos'],
    bestFor: ['vision', 'multimodal', 'performance'],
    notGoodFor: ['code-generation', 'math'],
  },
  {
    match: ['deepseek-coder', 'codegemma', 'codellama', 'starcoder', 'wizardcoder', 'phind-codellama'],
    caps: ['code', 'text'],
    badge: '💻 Código',
    description: 'Especialista en programación. Optimizado para generación, revisión y debug de código.',
    strengths: ['Completado de código', 'Debugging', 'Code review', 'Refactoring'],
    bestFor: ['github-actions', 'vitest', 'playwright-testing', 'vite'],
    notGoodFor: ['vision', 'long-context'],
  },
  {
    match: ['deepseek-r1', 'qwq', 'o1', 'o3', 'thinking'],
    caps: ['reasoning', 'math', 'text'],
    badge: '🧠 Razonamiento',
    description: 'Modelo con cadena de pensamiento extendida (chain-of-thought). Ideal para problemas complejos, matemáticas y análisis.',
    strengths: ['Problemas matemáticos', 'Lógica compleja', 'Análisis profundo', 'Planificación'],
    bestFor: ['data-sql-optimization', 'database-schema-design', 'coverage-analysis'],
    notGoodFor: ['speed', 'vision'],
  },
  {
    match: ['llama3.1', 'llama3.2', 'llama3.3', 'llama-3'],
    caps: ['text', 'chat', 'tools'],
    badge: '🦙 Propósito general',
    description: 'Meta Llama 3.1 — equilibrio entre calidad y velocidad. Buen soporte de herramientas (function calling) y contexto largo.',
    strengths: ['Conversación fluida', 'Function calling', 'Resumen', 'Contexto largo (128k)'],
    bestFor: ['i18n-localization', 'performance', 'find-skills'],
    notGoodFor: ['vision', 'code-expert'],
  },
  {
    match: ['qwen2.5:', 'qwen2.5-'],
    caps: ['text', 'chat', 'multilingual', 'code'],
    badge: '🌐 Multilingüe + código',
    description: 'Qwen 2.5 — excelente en chino e inglés, buen razonamiento y código. 128k contexto en versiones mayores.',
    strengths: ['Español/Inglés/Chino', 'Código Python/JS', 'Instrucciones precisas', 'Larga memoria'],
    bestFor: ['i18n-localization', 'github-actions', 'supabase-workflow', 'vercel-deployment'],
    notGoodFor: ['vision'],
  },
  {
    match: ['minimax-m2.7'],
    caps: ['text', 'chat', 'reasoning', 'long-context', 'tools'],
    badge: '🚀 Cloud · M2.7 (nuevo)',
    description: 'MiniMax M2.7 — sucesor de M2.5 con mayor precisión de razonamiento, context 204k y mejor function calling.',
    strengths: ['Razonamiento mejorado vs M2.5', 'Contexto 204k tokens', 'Function calling avanzado', 'Menor latencia en streaming', 'Multilingüe'],
    bestFor: ['data-sql-optimization', 'database-schema-design', 'postgresql-expert', 'supabase-expert', 'github-actions'],
    notGoodFor: ['local'],
  },
  {
    match: ['minimax-m2.5', 'minimax-m2.1'],
    caps: ['text', 'chat', 'reasoning', 'long-context'],
    badge: '☁️ Cloud · Razonamiento avanzado',
    description: 'MiniMax M2.5 — modelo cloud de 230B con razonamiento avanzado y contexto ultra-largo. Alta calidad en tareas complejas.',
    strengths: ['Razonamiento profundo', 'Contexto 1M tokens', 'Análisis de documentos', 'Multilingüe'],
    bestFor: ['data-sql-optimization', 'database-schema-design', 'postgresql-expert', 'supabase-expert'],
    notGoodFor: ['speed', 'local'],
  },
  {
    match: ['kimi-k2.5', 'kimi'],
    caps: ['text', 'chat', 'reasoning', 'long-context'],
    badge: '☁️ Cloud · Contexto largo',
    description: 'Kimi K2.5 — especializado en contextos muy largos (hasta 2M tokens). Ideal para analizar codebases completas.',
    strengths: ['Contexto 2M tokens', 'Análisis de repos', 'Documentación técnica', 'Research'],
    bestFor: ['coverage-analysis', 'playwright-testing', 'supabase-workflow'],
    notGoodFor: ['speed', 'local'],
  },
  {
    match: ['minimax-32k'],
    caps: ['text', 'chat', 'long-context'],
    badge: '📄 Contexto 32k',
    description: 'Variante MiniMax optimizada para 32k tokens de contexto. Buena para documentos medianos.',
    strengths: ['Documentos largos', 'Resumen', 'Análisis de logs'],
    bestFor: ['i18n-localization', 'performance'],
    notGoodFor: ['code-expert', 'vision'],
  },
  // Fallback
  {
    match: [],
    caps: ['text', 'chat'],
    badge: '💬 Propósito general',
    description: 'Modelo de lenguaje general. Apto para chat, resumen, redacción y tareas de texto.',
    strengths: ['Conversación', 'Resumen', 'Redacción'],
    bestFor: [],
    notGoodFor: [],
  },
];

function getModelCapabilities(modelName) {
  const lower = String(modelName || '').toLowerCase();
  for (const entry of MODEL_CAPABILITY_DB) {
    if (entry.match.length === 0) continue; // skip fallback in loop
    if (entry.match.some((kw) => lower.includes(kw))) return entry;
  }
  return MODEL_CAPABILITY_DB[MODEL_CAPABILITY_DB.length - 1]; // fallback
}

// ── Claude skills reader ───────────────────────────────────────────────────────
function readClaudeSkills() {
  const skills = [];
  try {
    if (!fs.existsSync(CLAUDE_SKILLS_DIR)) return skills;
    const dirs = fs.readdirSync(CLAUDE_SKILLS_DIR).filter((d) => {
      try { return fs.statSync(path.join(CLAUDE_SKILLS_DIR, d)).isDirectory(); } catch { return false; }
    });
    for (const dir of dirs) {
      const base = path.join(CLAUDE_SKILLS_DIR, dir);
      const skillFile = fs.existsSync(path.join(base, 'SKILL.md'))
        ? path.join(base, 'SKILL.md')
        : fs.existsSync(path.join(base, 'skill.md'))
          ? path.join(base, 'skill.md')
          : null;
      if (!skillFile) continue;
      try {
        const content = fs.readFileSync(skillFile, 'utf8');
        // Extract frontmatter description
        const descMatch = content.match(/^description:\s*["']?(.+?)["']?\s*$/m);
        const nameMatch = content.match(/^name:\s*(.+)\s*$/m);
        const versionMatch = content.match(/^(?:version|metadata:\s*\n\s+version):\s*["']?(.+?)["']?\s*$/m);
        const desc = descMatch?.[1]?.trim() || '';
        const name = nameMatch?.[1]?.trim() || dir;
        // Infer category tags from name/description
        const tags = inferSkillTags(name, desc);
        skills.push({ id: dir, name, description: desc.slice(0, 140), tags, version: versionMatch?.[1]?.trim() || '' });
      } catch { /* skip unreadable */ }
    }
  } catch { /* ignore */ }
  return skills;
}

function inferSkillTags(name, desc) {
  const text = `${name} ${desc}`.toLowerCase();
  const tags = [];
  if (/test|vitest|playwright|coverage|jest/.test(text)) tags.push('testing');
  if (/sql|postgres|database|schema|supabase/.test(text)) tags.push('database');
  if (/deploy|vercel|ci|cd|github.actions|pipeline/.test(text)) tags.push('devops');
  if (/react|next|vite|tailwind|css|frontend|ui/.test(text)) tags.push('frontend');
  if (/performance|optimiz|speed|bundle/.test(text)) tags.push('performance');
  if (/i18n|translat|locale|multilingual/.test(text)) tags.push('multilingual');
  if (/video|remotion|animation/.test(text)) tags.push('multimedia');
  if (/code|program|develop/.test(text)) tags.push('code');
  if (tags.length === 0) tags.push('general');
  return tags;
}

// RAM requirements per model size class (GB unified memory, Apple Silicon)
const MODEL_SIZE_RAM = {
  '1b': 1.5, '3b': 2.5, '7b': 5, '8b': 6, '13b': 9, '14b': 10,
  '30b': 20, '32b': 22, '70b': 45, '72b': 48, '110b': 70, '405b': 230,
};

function parseModelSizeGb(name) {
  const m = String(name).toLowerCase().match(/(\d+(?:\.\d+)?)b/);
  if (!m) return null;
  const param = parseFloat(m[1]);
  // Approximate Q4 size: ~0.55 bytes/param for 4-bit quant → GB
  return Math.round(param * 0.55 * 10) / 10;
}

function modelRamRequirementGb(name) {
  const lower = String(name).toLowerCase();
  for (const [key, gb] of Object.entries(MODEL_SIZE_RAM)) {
    if (lower.includes(`:${key}`) || lower.endsWith(key) || lower.includes(`-${key}-`) || lower.includes(`_${key}`)) {
      return gb;
    }
  }
  // Try raw number parse
  const m = lower.match(/[:\-_](\d+)b/);
  if (m) {
    const params = Number(m[1]);
    return Math.round(params * 0.55 * 10) / 10;
  }
  return null;
}

function fetchOllamaJson(apiPath) {
  return new Promise((resolve) => {
    const ollamaPort = Number(new URL(OLLAMA_URL).port || 11434);
    const req = http.request({ hostname: '127.0.0.1', port: ollamaPort, path: apiPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve(safeJsonParse(body, null)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}
const RESOURCE_HISTORY_PATH = process.env.RESOURCE_HISTORY_PATH || path.join(process.env.HOME || '', '.openclaw', 'monitor-resource-history.jsonl');
const RESOURCE_SAMPLE_INTERVAL_MS = Number(process.env.RESOURCE_SAMPLE_INTERVAL_MS || 60000);
const RESOURCE_RETENTION_DAYS = Number(process.env.RESOURCE_RETENTION_DAYS || 35);
const RESOURCE_SERIES_MAX_POINTS = Number(process.env.RESOURCE_SERIES_MAX_POINTS || 480);

let lastResourceSampleAtMs = 0;
let lastResourcePruneAtMs = 0;

// ── Security: DASHBOARD_TOKEN auth ───────────────────────────────────────────
const DASHBOARD_TOKEN = getSecret('dashboardToken');
if (!DASHBOARD_TOKEN) {
  console.warn('[WARN] DASHBOARD_TOKEN not set — dashboard auth disabled (dev mode)');
}

/**
 * Determina si una clave de objeto es un credential sensible.
 * Usa whitelist de sufijos/nombres exactos para evitar falsos positivos
 * como "totalTokens" (contador) o "tokenizer" (nombre de herramienta).
 */
function isSensitiveKey(k) {
  const norm = k.toLowerCase().replace(/[_\-. ]/g, '');
  // Sufijos de credential reales
  const CRED_SUFFIXES = ['token', 'secret', 'password', 'apikey', 'accesskey', 'credential', 'authtoken'];
  for (const suffix of CRED_SUFFIXES) {
    if (norm === suffix || norm.endsWith(suffix)) return true;
  }
  return false;
}

/** Redacta recursivamente keys sensibles de un objeto antes de enviarlo al cliente. */
function redact(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) continue;
    out[k] = redact(v);
  }
  return out;
}

/** Helper centralizado para enviar JSON — aplica redact() antes de serializar. */
function sendJson(res, statusCode, data) {
  const safe = redact(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(safe));
}

/** Verifica el header X-Dashboard-Token. Retorna true si la request está autorizada. */
function isAuthorized(req) {
  if (!DASHBOARD_TOKEN) return true; // dev mode: sin token configurado, todo permitido
  return req.headers['x-dashboard-token'] === DASHBOARD_TOKEN;
}

// ── Workroom: in-memory agent sessions per desk ──────────────────────────────
const WORKROOM_DESKS = ['vocari', 'humanloop', 'blog', 'ha'];

const WORKROOM_SESSIONS = {
  vocari:    { sessionId: 'wr_vocari',    messages: [], busy: false },
  humanloop: { sessionId: 'wr_humanloop', messages: [], busy: false },
  blog:      { sessionId: 'wr_blog',      messages: [], busy: false },
  ha:        { sessionId: 'wr_ha',        messages: [], busy: false },
};

const WORKROOM_CONTEXT = {
  vocari:    'You are a senior software engineer dedicated to vocari.cl (orienta-ai vocational platform). Repo: ~/.openclaw/workspace/orienta-ai. Be concise and practical.',
  humanloop: 'You are a senior software engineer dedicated to humanloop.cl (Airbnb automation + n8n flows). Repo: ~/.openclaw/workspace/humanloop. Be concise and practical.',
  blog:      'You are a senior software engineer dedicated to jaimehernandez.dev (personal blog, content pipeline). Repo: ~/.openclaw/workspace/projects/devjaimeblog. Be concise and practical.',
  ha:        'You are a senior home-automation engineer for Home Assistant. Scripts: ~/.openclaw/workspace/projects/homeassistant. Be concise and practical.',
};

const MODEL_PRICE_PER_TOKEN_USD = {
  'google/gemini-2.5-flash-lite': {
    input: 0.1 / 1_000_000,
    output: 0.4 / 1_000_000,
    cacheRead: 0.025 / 1_000_000,
    cacheWrite: 0.1 / 1_000_000,
  },
  'minimax-portal/MiniMax-M2.5': {
    input: 0.6 / 1_000_000,
    output: 2.4 / 1_000_000,
    cacheRead: 0.15 / 1_000_000,
    cacheWrite: 0.6 / 1_000_000,
  },
  // OpenRouter paid models used in this setup (values in USD/token).
  'minimax/minimax-m2.5': {
    input: 0.0000003,
    output: 0.0000011,
    cacheRead: 0,
    cacheWrite: 0,
  },
  'minimax/minimax-m2.7': {
    input: 0.0000003,
    output: 0.0000012,
    cacheRead: 0,
    cacheWrite: 0,
  },
  'openrouter/minimax/minimax-m2.7': {
    input: 0.0000003,
    output: 0.0000012,
    cacheRead: 0,
    cacheWrite: 0,
  },
  'google/gemini-3-flash-preview': {
    input: 0.0000005,
    output: 0.000003,
    cacheRead: 0,
    cacheWrite: 0,
  },
  'moonshotai/kimi-k2.5': {
    input: 0.00000045,
    output: 0.0000022,
    cacheRead: 0,
    cacheWrite: 0,
  },
};

// Precio de referencia "equivalente cloud" para modelos locales/gratuitos.
// Usamos GPT-4o-mini como referencia de modelo small de bajo costo.
const CLOUD_EQUIVALENT_PRICE = {
  input:  0.15 / 1_000_000,  // USD por token input  (GPT-4o-mini ref)
  output: 0.60 / 1_000_000,  // USD por token output (GPT-4o-mini ref)
};

function isLocalModel(modelKey) {
  const k = String(modelKey || '').toLowerCase();
  return (
    k.startsWith('custom-127-0-0-1-11434/') ||
    k.includes('qwen') || k.includes('deepseek') || k.includes('ollama') ||
    k.includes(':free') ||          // OpenRouter free tier
    k.startsWith('huggingface/')    // HuggingFace serverless (generalmente gratis)
  );
}

function equivalentCloudCostUsd(usage) {
  return (
    n(usage.input)  * CLOUD_EQUIVALENT_PRICE.input +
    n(usage.output) * CLOUD_EQUIVALENT_PRICE.output
  );
}

const PROJECT_REPOS = [
  { id: 'humanloop', label: 'humanloop.cl', path: '/Users/devjaime/.openclaw/workspace/humanloop' },
  { id: 'vocari', label: 'vocari.cl (orienta-ai)', path: '/Users/devjaime/.openclaw/workspace/orienta-ai' },
  { id: 'openclaw-ha', label: 'openclaw-homeassistant', path: '/Users/devjaime/.openclaw/workspace/projects/openclaw-homeassistant' },
];

const startedAt = Date.now();

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// Ensure standard bin dirs are always in PATH for child processes
const EXTENDED_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH].filter(Boolean).join(':');

function run(cmd, timeoutMs = 5000) {
  try {
    return execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      encoding: 'utf8',
      env: { ...process.env, PATH: EXTENDED_PATH },
    }).trim();
  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr).trim() : '';
    const msg = stderr || String(err?.message || 'command failed');
    return `__ERR__ ${msg}`;
  }
}

function isErr(out) {
  return typeof out === 'string' && out.startsWith('__ERR__');
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function checkPort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finalize = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });
}

function runShell(cmd, timeout = 12000) {
  try {
    const out = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      encoding: 'utf8',
      shell: '/bin/bash',
      env: { ...process.env, PATH: RUNTIME_PATH },
    }).trim();
    return { ok: true, output: out };
  } catch (err) {
    const stdout = err?.stdout ? String(err.stdout).trim() : '';
    const stderr = err?.stderr ? String(err.stderr).trim() : '';
    return {
      ok: false,
      output: [stdout, stderr, String(err?.message || 'command failed')].filter(Boolean).join('\n'),
    };
  }
}

function runShellWithEnv(cmd, extraEnv = {}, timeout = 12000) {
  try {
    const out = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      encoding: 'utf8',
      shell: '/bin/bash',
      env: { ...process.env, PATH: RUNTIME_PATH, ...extraEnv },
    }).trim();
    return { ok: true, output: out };
  } catch (err) {
    const stdout = err?.stdout ? String(err.stdout).trim() : '';
    const stderr = err?.stderr ? String(err.stderr).trim() : '';
    return {
      ok: false,
      output: [stdout, stderr, String(err?.message || 'command failed')].filter(Boolean).join('\n'),
    };
  }
}

/** Like runShell but truly async (non-blocking) with extra env vars for safe escaping. */
function runShellAsync(cmd, extraEnv = {}, timeoutMs = 120000) {
  return new Promise((resolve) => {
    exec(cmd, {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: '/bin/bash',
      env: { ...process.env, PATH: RUNTIME_PATH, ...extraEnv },
    }, (err, stdout, stderr) => {
      if (err) {
        const out = [stdout?.trim(), stderr?.trim(), String(err?.message || 'command failed')]
          .filter(Boolean).join('\n');
        resolve({ ok: false, output: out });
      } else {
        resolve({ ok: true, output: (stdout || '').trim() });
      }
    });
  });
}

function parsePercent(text) {
  const m = String(text || '').match(/([-+]?[0-9]*\.?[0-9]+)\s*%/);
  return m ? n(m[1]) : 0;
}

function parseSizeToMb(text) {
  const m = String(text || '').trim().match(/^([-+]?[0-9]*\.?[0-9]+)\s*([KMGTP]i?)?B?$/i);
  if (!m) return 0;
  const value = n(m[1]);
  const unit = String(m[2] || 'B').toUpperCase();
  const mul = {
    B: 1 / (1024 * 1024),
    K: 1 / 1024,
    KI: 1 / 1024,
    M: 1,
    MI: 1,
    G: 1024,
    GI: 1024,
    T: 1024 * 1024,
    TI: 1024 * 1024,
    P: 1024 * 1024 * 1024,
    PI: 1024 * 1024 * 1024,
  }[unit] ?? 0;
  return value * mul;
}

function findListeningPid(port) {
  const out = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -F pc`);
  if (isErr(out) || !out) return null;
  const lines = String(out).split('\n').filter(Boolean);
  let pid = null;
  let command = '';
  for (const line of lines) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || null;
    if (line.startsWith('c')) command = line.slice(1);
  }
  if (!pid) return null;
  return { pid, command };
}

function collectDockerUsage(containerName) {
  const out = run(`${DOCKER_BIN} stats --no-stream --format '{{json .}}' ${containerName}`);
  if (isErr(out) || !out) {
    return {
      running: dockerIsRunning(containerName),
      container: containerName,
      cpuPct: 0,
      ramPct: 0,
      ramMb: 0,
      pids: 0,
      source: 'docker',
    };
  }
  const row = safeJsonParse(String(out).split('\n').find(Boolean) || '', null);
  if (!row || typeof row !== 'object') {
    return {
      running: dockerIsRunning(containerName),
      container: containerName,
      cpuPct: 0,
      ramPct: 0,
      ramMb: 0,
      pids: 0,
      source: 'docker',
    };
  }
  const memUsageRaw = String(row.MemUsage || '');
  const memUsedPart = memUsageRaw.split('/')[0]?.trim() || '';
  return {
    running: true,
    container: containerName,
    cpuPct: parsePercent(row.CPUPerc),
    ramPct: parsePercent(row.MemPerc),
    ramMb: parseSizeToMb(memUsedPart),
    pids: n(row.PIDs),
    source: 'docker',
  };
}

function parseEtimeToSec(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const daySplit = s.split('-');
  let days = 0;
  let timePart = s;
  if (daySplit.length === 2) {
    days = n(daySplit[0]);
    timePart = daySplit[1];
  }
  const parts = timePart.split(':').map((x) => n(x));
  if (parts.length === 3) return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return days * 86400 + parts[0] * 60 + parts[1];
  if (parts.length === 1) return days * 86400 + parts[0];
  return 0;
}

function collectResourceUsage(runtimePort) {
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = Math.max(0, totalMemBytes - freeMemBytes);
  const host = {
    ramTotalMb: Math.round(totalMemBytes / (1024 * 1024)),
    ramUsedMb: Math.round(usedMemBytes / (1024 * 1024)),
    ramFreeMb: Math.round(freeMemBytes / (1024 * 1024)),
    ramUsedPct: totalMemBytes > 0 ? (usedMemBytes / totalMemBytes) * 100 : 0,
    loadAvg1m: n(os.loadavg()?.[0]),
    cpuCount: n(os.cpus()?.length),
  };

  const openclaw = {
    running: false,
    pid: null,
    command: '',
    cpuPct: 0,
    rssKb: 0,
    rssMb: 0,
    ramHostPct: 0,
    etimeSec: 0,
  };

  const listener = findListeningPid(runtimePort);
  if (!listener?.pid) {
    return {
      host,
      services: {
        openclaw,
        homeassistant: collectDockerUsage('homeassistant'),
        n8n: collectDockerUsage('n8n'),
      },
    };
  }

  const ps = run(`ps -p ${listener.pid} -o %cpu=,rss=,etime=,comm=`);
  if (isErr(ps) || !ps) {
    return {
      host,
      services: {
        openclaw: {
          ...openclaw,
          running: true,
          pid: listener.pid,
          command: listener.command || '',
        },
        homeassistant: collectDockerUsage('homeassistant'),
        n8n: collectDockerUsage('n8n'),
      },
    };
  }

  const line = String(ps).trim();
  const m = line.match(/^([0-9.]+)\s+([0-9]+)\s+([0-9:-]+)\s+(.+)$/);
  const cpuPct = m ? n(m[1]) : 0;
  const rssKb = m ? n(m[2]) : 0;
  const etimeRaw = m ? String(m[3]) : '';
  const etimeSec = parseEtimeToSec(etimeRaw);
  const command = m ? String(m[4] || '') : (listener.command || '');
  const rssBytes = rssKb * 1024;
  return {
    host,
    services: {
      openclaw: {
        running: true,
        pid: listener.pid,
        command,
        cpuPct,
        rssKb,
        ramMb: rssKb / 1024,
        ramPct: totalMemBytes > 0 ? (rssBytes / totalMemBytes) * 100 : 0,
        etimeSec,
        source: 'process',
      },
      homeassistant: collectDockerUsage('homeassistant'),
      n8n: collectDockerUsage('n8n'),
    },
  };
}

function collectDiskUsage() {
  try {
    const out = run("df -k | grep -E '^/dev/disk' | grep -v 'devfs' | tail -10");
    if (isErr(out) || !out) return { disks: [], error: 'df failed' };
    const lines = String(out).split('\n').filter(Boolean);
    return {
      disks: lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) return null;
        return {
          mount: parts[parts.length - 1] || '',
          totalGb: parseFloat((n(parts[1]) / 1024 / 1024).toFixed(1)),
          usedGb: parseFloat((n(parts[2]) / 1024 / 1024).toFixed(1)),
          availGb: parseFloat((n(parts[3]) / 1024 / 1024).toFixed(1)),
          usePct: n(parts[4].replace(/%/g, '')),
        };
      }).filter(Boolean),
    };
  } catch (e) {
    return { disks: [], error: String(e.message) };
  }
}

function collectTopProcesses(limit) {
  limit = limit || 10;
  try {
    const cmd = 'ps aux | head -' + String(limit + 1);
    const out = run(cmd);
    if (isErr(out) || !out) return { processes: [], error: 'ps failed' };
    const lines = String(out).split('\n').slice(1).filter(Boolean);
    return {
      processes: lines.slice(0, limit).map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) return null;
        return {
          user: parts[0],
          pid: n(parts[1]),
          cpuPct: n(parts[2]),
          memPct: n(parts[3]),
          rssMb: parseFloat((n(parts[5]) / 1024).toFixed(1)),
          command: (parts.slice(10).join(' ') || '').slice(0, 80),
        };
      }).filter(Boolean),
    };
  } catch (e) {
    return { processes: [], error: String(e.message) };
  }
}

function collectProcessNetworkTrace(pid) {
  const procPid = n(pid);
  if (!procPid) {
    return { ok: false, reason: 'pid unavailable', connections: [], listeners: [] };
  }
  const out = run(`lsof -nP -a -p ${procPid} -iTCP`);
  if (isErr(out) || !out) {
    return { ok: false, reason: String(out || 'lsof failed'), connections: [], listeners: [] };
  }
  const lines = String(out).split('\n').slice(1).filter(Boolean);
  const listeners = [];
  const connections = [];
  for (const line of lines) {
    const nameMatch = line.match(/([^\s]+)\s+\((LISTEN|ESTABLISHED|CLOSE_WAIT|SYN_SENT|TIME_WAIT)\)$/);
    if (!nameMatch) continue;
    const endpoint = String(nameMatch[1] || '').trim();
    const state = String(nameMatch[2] || '').trim();
    const row = {
      endpoint,
      state,
      raw: line.trim(),
    };
    if (state === 'LISTEN') listeners.push(row);
    else connections.push(row);
  }
  return {
    ok: true,
    pid: procPid,
    listeners: listeners.slice(0, 40),
    connections: connections.slice(0, 80),
  };
}

async function readResourceHistory() {
  try {
    if (!fs.existsSync(RESOURCE_HISTORY_PATH)) return [];
    const raw = await fsp.readFile(RESOURCE_HISTORY_PATH, 'utf8');
    return raw.split('\n')
      .filter(Boolean)
      .map((line) => safeJsonParse(line, null))
      .filter((row) => row && typeof row === 'object' && n(row.ts) > 0);
  } catch {
    return [];
  }
}

async function writeResourceSample(resources) {
  const now = Date.now();
  if (now - lastResourceSampleAtMs < RESOURCE_SAMPLE_INTERVAL_MS) return;
  lastResourceSampleAtMs = now;
  const payload = {
    ts: now,
    openclaw: {
      cpuPct: n(resources?.services?.openclaw?.cpuPct),
      ramPct: n(resources?.services?.openclaw?.ramPct),
      ramMb: n(resources?.services?.openclaw?.ramMb),
      running: Boolean(resources?.services?.openclaw?.running),
    },
    homeassistant: {
      cpuPct: n(resources?.services?.homeassistant?.cpuPct),
      ramPct: n(resources?.services?.homeassistant?.ramPct),
      ramMb: n(resources?.services?.homeassistant?.ramMb),
      running: Boolean(resources?.services?.homeassistant?.running),
    },
    n8n: {
      cpuPct: n(resources?.services?.n8n?.cpuPct),
      ramPct: n(resources?.services?.n8n?.ramPct),
      ramMb: n(resources?.services?.n8n?.ramMb),
      running: Boolean(resources?.services?.n8n?.running),
    },
  };
  await fsp.appendFile(RESOURCE_HISTORY_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function pruneResourceHistory(nowMs = Date.now()) {
  if (nowMs - lastResourcePruneAtMs < 6 * 60 * 60 * 1000) return;
  lastResourcePruneAtMs = nowMs;
  try {
    if (!fs.existsSync(RESOURCE_HISTORY_PATH)) return;
    const minTs = nowMs - RESOURCE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const rows = await readResourceHistory();
    const kept = rows.filter((row) => n(row.ts) >= minTs);
    const output = kept.map((row) => JSON.stringify(row)).join('\n');
    await fsp.writeFile(RESOURCE_HISTORY_PATH, output ? `${output}\n` : '', 'utf8');
  } catch {}
}

function summarizeResourceHistory(rows, nowMs = Date.now()) {
  const windows = {
    day: 24 * 60 * 60 * 1000,
    days7: 7 * 24 * 60 * 60 * 1000,
    days30: 30 * 24 * 60 * 60 * 1000,
  };
  const services = ['openclaw', 'homeassistant', 'n8n'];
  const peaks = {};

  for (const svc of services) {
    peaks[svc] = {};
    for (const [windowKey, windowMs] of Object.entries(windows)) {
      let cpu = { value: 0, ts: null };
      let ram = { value: 0, ts: null };
      const minTs = nowMs - windowMs;
      for (const row of rows) {
        const ts = n(row.ts);
        if (ts < minTs) continue;
        const cpuPct = n(row?.[svc]?.cpuPct);
        const ramPct = n(row?.[svc]?.ramPct);
        if (cpuPct > cpu.value) cpu = { value: cpuPct, ts };
        if (ramPct > ram.value) ram = { value: ramPct, ts };
      }
      peaks[svc][windowKey] = { cpu, ram };
    }
  }

  const oneDayMinTs = nowMs - windows.day;
  const dayRows = rows.filter((row) => n(row.ts) >= oneDayMinTs);
  const stride = dayRows.length > RESOURCE_SERIES_MAX_POINTS
    ? Math.ceil(dayRows.length / RESOURCE_SERIES_MAX_POINTS)
    : 1;
  const series24h = dayRows
    .filter((_, idx) => idx % stride === 0)
    .map((row) => ({
      ts: n(row.ts),
      openclaw: row.openclaw || {},
      homeassistant: row.homeassistant || {},
      n8n: row.n8n || {},
    }));

  return {
    peaks,
    series24h,
    totalSamples: rows.length,
  };
}

function extractTrailingJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  // openclaw sometimes prints warnings before JSON; parse from last JSON object.
  const idx = text.lastIndexOf('\n{');
  const candidate = idx >= 0 ? text.slice(idx + 1) : text;
  const parsed = safeJsonParse(candidate, null);
  if (parsed && typeof parsed === 'object') return parsed;
  // fallback: try from first "{"
  const first = text.indexOf('{');
  if (first >= 0) {
    return safeJsonParse(text.slice(first), null);
  }
  return null;
}

function dockerIsRunning(name) {
  const out = run(`${DOCKER_BIN} inspect -f '{{.State.Running}}' ${name}`);
  return out === 'true';
}

async function httpProbe(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function readOpenClawConfig() {
  try {
    const raw = await fsp.readFile(OPENCLAW_CONFIG, 'utf8');
    const cfg = safeJsonParse(raw, {});
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

async function getOpenClawLogTail(limit = 120) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(OPENCLAW_LOG_DIR, `openclaw-${today}.log`);
    if (!fs.existsSync(file)) return [];
    const raw = await fsp.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

async function getHomeAssistantLogTail(limit = 120) {
  const candidates = [
    path.join(process.env.HOME || '', '.homeassistant', 'home-assistant.log'),
    '/config/home-assistant.log',
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = await fsp.readFile(file, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      return lines.slice(-limit);
    } catch {}
  }
  return [];
}

async function ensureNeo4jBridge() {
  const bridgeUrl = 'http://127.0.0.1:7575/memory/health';
  try {
    const response = await fetch(bridgeUrl, { signal: AbortSignal.timeout(2500) });
    const data = await response.json();
    if (response.ok && data?.neo4j === 'connected') return true;
  } catch {}

  const listener = findListeningPid(7575);
  if (listener?.pid) {
    const command = run(`ps -p ${listener.pid} -o command=`);
    if (!isErr(command) && String(command).includes('openclaw-neo4j-memory/server/main.py')) {
      try { process.kill(listener.pid, 'SIGTERM'); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else {
      return false;
    }
  }

  const credentialsPath = path.join(process.env.HOME || '', '.local', 'share', 'neo4j-local', 'openclaw-memory', 'credentials.json');
  const scriptPath = path.join(process.env.HOME || '', '.openclaw', 'extensions', 'openclaw-neo4j-memory', 'server', 'main.py');
  if (!fs.existsSync(credentialsPath) || !fs.existsSync(scriptPath)) return false;
  const credentials = safeJsonParse(fs.readFileSync(credentialsPath, 'utf8'), {});
  if (!credentials?.username || !credentials?.password) return false;
  const python = '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3';
  if (!fs.existsSync(python)) return false;
  const logFd = fs.openSync('/tmp/openclaw-neo4j-bridge.log', 'a');
  const child = spawn(python, [scriptPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      NEO4J_URI: 'bolt://127.0.0.1:7687',
      NEO4J_USER: credentials.username,
      NEO4J_PASSWORD: credentials.password,
      AGENT_ID: 'main',
      BRIDGE_PORT: '7575',
    },
  });
  child.unref();
  fs.closeSync(logFd);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      const response = await fetch(bridgeUrl, { signal: AbortSignal.timeout(2000) });
      const data = await response.json();
      if (response.ok && data?.neo4j === 'connected') return true;
    } catch {}
  }
  return false;
}

function messageText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.filter((part) => part?.type === 'text' && part?.text).map((part) => part.text).join('\n').trim();
}

async function collectOpenClawActivity(limit = 8) {
  const root = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions');
  let files = [];
  try {
    files = fs.readdirSync(root)
      .filter((name) => name.endsWith('.jsonl') && !name.endsWith('.trajectory.jsonl'))
      .map((name) => ({ file: path.join(root, name), mtime: fs.statSync(path.join(root, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  } catch { return []; }

  return Promise.all(files.map(async ({ file, mtime }) => {
    const rows = (await readLastLines(file, 700)).map((line) => safeJsonParse(line, null)).filter(Boolean);
    const messages = rows.filter((row) => row.type === 'message' && row.message);
    const modelRow = [...rows].reverse().find((row) => row.type === 'model_change' || row?.message?.model);
    const users = messages.filter((row) => row.message.role === 'user').map((row) => messageText(row.message.content)).filter(Boolean);
    const assistants = messages.filter((row) => row.message.role === 'assistant').map((row) => messageText(row.message.content)).filter(Boolean);
    const tools = messages.filter((row) => row.message.role === 'toolResult').map((row) => row.message.toolName).filter(Boolean);
    const lastRow = messages.at(-1);
    return {
      id: path.basename(file, '.jsonl'),
      updatedAt: lastRow?.timestamp || new Date(mtime).toISOString(),
      model: modelRow?.modelId || modelRow?.message?.model || '',
      title: users.at(-1)?.slice(0, 120) || 'Sesión sin título',
      summary: assistants.at(-1)?.slice(0, 360) || '',
      messageCount: messages.length,
      toolCount: tools.length,
      tools: [...new Set(tools)].slice(0, 8),
      source: 'openclaw',
    };
  }));
}

function collectHermesActivity(limit = 8) {
  const dbPath = path.join(HERMES_HOME, 'state.db');
  if (!fs.existsSync(dbPath)) return [];
  let hermesDb;
  try {
    hermesDb = new DatabaseSync(dbPath, { readOnly: true });
    const sessions = hermesDb.prepare(`
      SELECT id, source, model, started_at, ended_at, message_count, tool_call_count,
             input_tokens, output_tokens
      FROM sessions ORDER BY started_at DESC LIMIT ?
    `).all(limit);
    const lastMessages = hermesDb.prepare(`
      SELECT role, content, timestamp FROM messages
      WHERE session_id = ? AND role IN ('user','assistant')
      ORDER BY timestamp DESC LIMIT 12
    `);
    return sessions.map((session) => {
      const messages = lastMessages.all(session.id);
      const lastUser = messages.find((row) => row.role === 'user');
      const lastAssistant = messages.find((row) => row.role === 'assistant');
      return {
        id: session.id,
        updatedAt: new Date(Number(session.ended_at || session.started_at) * 1000).toISOString(),
        model: session.model || '',
        title: String(lastUser?.content || `${session.source || 'Hermes'} session`).slice(0, 120),
        summary: String(lastAssistant?.content || '').slice(0, 360),
        messageCount: Number(session.message_count || 0),
        toolCount: Number(session.tool_call_count || 0),
        tokens: Number(session.input_tokens || 0) + Number(session.output_tokens || 0),
        source: 'hermes',
      };
    });
  } catch { return []; }
  finally { try { hermesDb?.close(); } catch {} }
}

function collectHermesMemories() {
  const memoryFile = path.join(HERMES_HOME, 'memories', 'MEMORY.md');
  try {
    const raw = fs.readFileSync(memoryFile, 'utf8');
    const sections = raw.split(/(?=^#\s+)/m).map((part) => part.trim()).filter(Boolean);
    return sections.slice(0, 20).map((section, index) => {
      const lines = section.split('\n');
      return { id: `hermes-memory-${index}`, title: lines[0].replace(/^#+\s*/, ''), summary: lines.slice(1).join(' ').replace(/\s+/g, ' ').slice(0, 300) };
    });
  } catch { return []; }
}

function collectAgentUpdates() {
  const updateBin = fs.existsSync(OPENCLAW_UPDATE_BIN) ? OPENCLAW_UPDATE_BIN : OPENCLAW_BIN;
  const currentRaw = run(`"${updateBin}" --version`);
  const status = runShell(`"${updateBin}" update status --json`, 20000);
  const update = status.ok ? extractTrailingJsonObject(status.output) : null;
  const hermesVersion = fs.existsSync(HERMES_CLI)
    ? runShell(`"${HERMES_CLI}" -m hermes_cli.main --version`, 12000)
    : { ok: false, output: '' };
  const hermesLines = String(hermesVersion.output || '').split('\n');
  return {
    openclaw: {
      installed: isErr(currentRaw) ? '' : String(currentRaw).trim(),
      latest: update?.availability?.latestVersion || update?.update?.registry?.latestVersion || '',
      updateAvailable: Boolean(update?.availability?.available),
      channel: update?.channel?.label || 'stable',
    },
    hermes: {
      installed: hermesLines.find((line) => line.startsWith('Hermes Agent '))?.replace('Hermes Agent ', '') || '',
      updateAvailable: hermesLines.some((line) => /update available/i.test(line)),
      updateDetail: hermesLines.find((line) => /update available/i.test(line)) || '',
    },
  };
}

async function getCronJobs(cfg) {
  const token = cfg?.gateway?.auth?.token;
  if (!token) return { ok: false, error: 'token no disponible', jobs: [] };
  const gatewayUrl = resolveGatewayUrl(cfg);
  const raw = run(`"${OPENCLAW_BIN}" cron list --url ${gatewayUrl} --token ${token} --json`);
  if (isErr(raw)) {
    return { ok: false, error: raw.replace('__ERR__ ', ''), jobs: [] };
  }
  const parsed = safeJsonParse(raw, {});
  const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
  const compact = jobs.map((j) => {
    // Build human-readable schedule expression
    let expr = j?.schedule?.expr || j?.cron?.expr || '';
    const kind = j?.schedule?.kind || '';
    if (!expr && kind === 'every' && j?.schedule?.everyMs) {
      const ms = j.schedule.everyMs;
      const mins = Math.round(ms / 60000);
      if (mins < 60) expr = `every ${mins}m`;
      else if (mins < 1440) expr = `every ${Math.round(mins / 60)}h`;
      else expr = `every ${Math.round(mins / 1440)}d`;
    }
    return {
      id: j.id,
      name: j.name,
      enabled: Boolean(j.enabled),
      expr,
      kind,
      tz: j?.schedule?.tz || j?.cron?.tz || '',
      nextRunAtMs: j?.state?.nextRunAtMs || null,
      lastRunAtMs: j?.state?.lastRunAtMs || null,
      lastStatus: j?.state?.lastStatus || j?.state?.lastRunStatus || null,
    };
  });
  return { ok: true, jobs: compact };
}

async function listRecentJsonlFiles(root, maxFiles = 30) {
  const out = [];
  async function walk(dir, depth = 0) {
    if (depth > 4) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p, depth + 1);
      } else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          const st = await fsp.stat(p);
          out.push({ path: p, mtimeMs: st.mtimeMs });
        } catch {}
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, maxFiles).map((x) => x.path);
}

async function readLastLines(file, maxLines = 1200) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

async function readUsageResetState() {
  try {
    if (!fs.existsSync(USAGE_RESET_STATE_PATH)) return { resetAtMs: null, resetAtIso: null };
    const raw = await fsp.readFile(USAGE_RESET_STATE_PATH, 'utf8');
    const parsed = safeJsonParse(raw, {});
    const resetAtMs = n(parsed?.resetAtMs) || null;
    return {
      resetAtMs,
      resetAtIso: resetAtMs ? new Date(resetAtMs).toISOString() : null,
      openrouterTotalCreditsAtResetUsd: n(parsed?.openrouterTotalCreditsAtResetUsd) || null,
      openrouterTotalUsageAtResetUsd: n(parsed?.openrouterTotalUsageAtResetUsd) || null,
      openrouterRemainingAtResetUsd: n(parsed?.openrouterRemainingAtResetUsd) || null,
      openrouterSnapshotAtMs: n(parsed?.openrouterSnapshotAtMs) || null,
    };
  } catch {
    return { resetAtMs: null, resetAtIso: null };
  }
}

async function writeUsageResetState(resetAtMs = Date.now(), snapshot = null) {
  const totalCredits = n(snapshot?.totalCreditsUsd);
  const totalUsage = n(snapshot?.totalUsageUsd);
  const remaining = n(snapshot?.remainingUsd);
  const payload = {
    resetAtMs,
    resetAtIso: new Date(resetAtMs).toISOString(),
    updatedAtMs: Date.now(),
    openrouterTotalCreditsAtResetUsd: totalCredits > 0 ? totalCredits : null,
    openrouterTotalUsageAtResetUsd: totalUsage > 0 ? totalUsage : null,
    openrouterRemainingAtResetUsd: (totalCredits > 0 || totalUsage > 0) ? remaining : null,
    openrouterSnapshotAtMs: (totalCredits > 0 || totalUsage > 0) ? Date.now() : null,
  };
  await fsp.writeFile(USAGE_RESET_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

async function fetchOpenRouterCredits(cfg) {
  const apiKey = String(cfg?.models?.providers?.openrouter?.apiKey || '').trim();
  if (!apiKey || apiKey === 'OPENROUTER_API_KEY') {
    return { ok: false, reason: 'apiKey no configurada' };
  }
  try {
    const res = await fetch(OPENROUTER_CREDITS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const payload = await res.json().catch(() => null);
    const totalCreditsUsd = n(payload?.data?.total_credits);
    const totalUsageUsd = n(payload?.data?.total_usage);
    const remainingUsd = Math.max(0, totalCreditsUsd - totalUsageUsd);
    return {
      ok: true,
      totalCreditsUsd,
      totalUsageUsd,
      remainingUsd,
      fetchedAtMs: Date.now(),
    };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err || 'error desconocido') };
  }
}

function normalizeModelKey(provider, model) {
  const p = String(provider || '').trim();
  const m = String(model || '').trim();
  if (!p && !m) return 'desconocido';
  if (m.includes('/')) return m;
  if (!p) return m;
  return `${p}/${m}`;
}

function estimateCostUsd(modelKey, usage) {
  const rate = MODEL_PRICE_PER_TOKEN_USD[modelKey];
  if (!rate) return 0;
  return (
    n(usage.input) * n(rate.input) +
    n(usage.output) * n(rate.output) +
    n(usage.cacheRead) * n(rate.cacheRead) +
    n(usage.cacheWrite) * n(rate.cacheWrite)
  );
}

async function collectUsageStats(cfg) {
  const now = Date.now();
  const lookbackMinTs = now - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const resetState = await readUsageResetState();
  const openrouterCredits = await fetchOpenRouterCredits(cfg);
  const minTs = Math.max(lookbackMinTs, n(resetState.resetAtMs));
  const usageByModel = new Map();
  // daily[YYYY-MM-DD][modelKey] = { calls, input, output, cacheRead, cacheWrite, total }
  const daily = {};

  const sessionRoot = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions');
  const cronRoot = path.join(process.env.HOME || '', '.openclaw', 'cron', 'runs');
  const files = [
    ...(await listRecentJsonlFiles(sessionRoot, USAGE_MAX_FILES)),
    ...(await listRecentJsonlFiles(cronRoot, USAGE_MAX_FILES)),
  ];

  for (const file of files) {
    const lines = await readLastLines(file, 1500);
    for (const line of lines) {
      const row = safeJsonParse(line, null);
      if (!row || typeof row !== 'object') continue;
      const ts = n(row.timestamp ? Date.parse(row.timestamp) : row.ts);
      if (ts && ts < minTs) continue;

      const message = row.message && typeof row.message === 'object' ? row.message : null;
      const usage =
        (message && message.usage && typeof message.usage === 'object' ? message.usage : null) ||
        (row.usage && typeof row.usage === 'object' ? row.usage : null);
      if (!usage) continue;

      const provider = (message && message.provider) || row.provider || '';
      const model = (message && message.model) || row.model || '';
      const key = normalizeModelKey(provider, model);

      // aggregate totals
      if (!usageByModel.has(key)) {
        usageByModel.set(key, {
          calls: 0,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
          costUsdReported: 0,
          providerCounts: {},
        });
      }
      const acc = usageByModel.get(key);
      acc.calls += 1;
      acc.input += n(usage.input || usage.input_tokens);
      acc.output += n(usage.output || usage.output_tokens);
      acc.cacheRead += n(usage.cacheRead || usage.cache_read_tokens);
      acc.cacheWrite += n(usage.cacheWrite || usage.cache_write_tokens);
      acc.total = acc.input + acc.output + acc.cacheRead + acc.cacheWrite;
      acc.costUsdReported += n(usage?.cost?.total || usage?.costUsd || usage?.cost_usd);
      const providerKey = String(provider || 'unknown').toLowerCase();
      acc.providerCounts[providerKey] = n(acc.providerCounts[providerKey]) + 1;

      // daily breakdown
      const day = ts
        ? new Date(ts).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      if (!daily[day]) daily[day] = {};
      if (!daily[day][key]) daily[day][key] = { calls: 0, input: 0, output: 0, total: 0 };
      daily[day][key].calls += 1;
      daily[day][key].input += n(usage.input || usage.input_tokens);
      daily[day][key].output += n(usage.output || usage.output_tokens);
      daily[day][key].total = daily[day][key].input + daily[day][key].output;
    }
  }

  const models = Array.from(usageByModel.entries()).map(([model, usage]) => {
    const isLocal = isLocalModel(model);
    const reportedUsd = n(usage.costUsdReported);
    const estimatedUsd = isLocal ? 0 : estimateCostUsd(model, usage);
    const usd = reportedUsd > 0 ? reportedUsd : estimatedUsd;
    const openrouterModel = n(usage?.providerCounts?.openrouter) > 0;
    const eqUsd = isLocal ? equivalentCloudCostUsd(usage) : 0;
    return {
      model,
      usage,
      reportedCostUsd: reportedUsd,
      estimatedCostUsd: estimatedUsd,
      costSource: reportedUsd > 0 ? 'reported' : 'estimated',
      costUsd: usd,
      costClp: usd * USD_CLP_RATE,
      equivalentCostUsd: eqUsd,
      equivalentCostClp: eqUsd * USD_CLP_RATE,
      localEstimatedFree: isLocal,
      openrouterModel,
    };
  });

  const totals = models.reduce(
    (acc, m) => {
      acc.input += m.usage.input;
      acc.output += m.usage.output;
      acc.cacheRead += m.usage.cacheRead;
      acc.cacheWrite += m.usage.cacheWrite;
      acc.total += m.usage.total;
      acc.costUsd += m.costUsd;
      acc.costClp += m.costClp;
      acc.equivalentCostUsd += m.equivalentCostUsd;
      acc.equivalentCostClp += m.equivalentCostClp;
      acc.savedUsd += m.localEstimatedFree ? m.equivalentCostUsd : 0;
      acc.savedClp += m.localEstimatedFree ? m.equivalentCostClp : 0;
      acc.openrouterSpentUsd += m.openrouterModel ? m.costUsd : 0;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0,
      costUsd: 0, costClp: 0, equivalentCostUsd: 0, equivalentCostClp: 0,
      savedUsd: 0, savedClp: 0, openrouterSpentUsd: 0 },
  );

  // Add external spend produced by standalone jobs (outside OpenClaw session logs).
  let externalOpenrouterSpentUsd = 0;
  try {
    if (fs.existsSync(EXTERNAL_COST_LEDGER)) {
      const raw = await fsp.readFile(EXTERNAL_COST_LEDGER, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      for (const line of lines) {
        const row = safeJsonParse(line, null);
        if (!row || typeof row !== 'object') continue;
        const ts = n(row.ts);
        if (ts && ts < minTs) continue;
        const provider = String(row.provider || '').toLowerCase();
        if (provider !== 'openrouter') continue;
        externalOpenrouterSpentUsd += n(row.costUsd);
      }
    }
  } catch {}

  totals.openrouterSpentUsd += externalOpenrouterSpentUsd;
  totals.costUsd += externalOpenrouterSpentUsd;
  totals.costClp += externalOpenrouterSpentUsd * USD_CLP_RATE;

  const openrouterModels = models.filter((m) => m.openrouterModel);
  const openrouterTotals = openrouterModels.reduce(
    (acc, m) => {
      acc.calls += n(m.usage.calls);
      acc.input += n(m.usage.input);
      acc.output += n(m.usage.output);
      acc.totalTokens += n(m.usage.total);
      acc.costUsd += n(m.costUsd);
      acc.costClp += n(m.costClp);
      return acc;
    },
    { calls: 0, input: 0, output: 0, totalTokens: 0, costUsd: 0, costClp: 0 },
  );
  openrouterTotals.costUsd += externalOpenrouterSpentUsd;
  openrouterTotals.costClp += externalOpenrouterSpentUsd * USD_CLP_RATE;

  const openrouterApiSinceResetUsd = (
    openrouterCredits.ok &&
    resetState.openrouterTotalUsageAtResetUsd != null
  )
    ? Math.max(0, n(openrouterCredits.totalUsageUsd) - n(resetState.openrouterTotalUsageAtResetUsd))
    : null;

  const openrouterBudgetUsd = openrouterCredits.ok
    ? n(openrouterCredits.totalCreditsUsd)
    : OPENROUTER_BUDGET_USD;
  const openrouterUsdSpent = openrouterApiSinceResetUsd != null
    ? openrouterApiSinceResetUsd
    : (openrouterCredits.ok ? n(openrouterCredits.totalUsageUsd) : totals.openrouterSpentUsd);
  const openrouterRemaining = openrouterCredits.ok
    ? n(openrouterCredits.remainingUsd)
    : Math.max(0, openrouterBudgetUsd - openrouterUsdSpent);
  const openrouterUsedPct = openrouterBudgetUsd > 0
    ? Math.min(100, (openrouterUsdSpent / openrouterBudgetUsd) * 100)
    : 0;

  return {
    lookbackDays: USAGE_LOOKBACK_DAYS,
    windowStartAtMs: minTs,
    windowStartAtIso: new Date(minTs).toISOString(),
    resetAtMs: resetState.resetAtMs,
    resetAtIso: resetState.resetAtIso,
    usdClpRate: USD_CLP_RATE,
    openrouterBudgetUsd,
    cloudEquivalentRef: 'GPT-4o-mini ($0.15/$0.60 por 1M tokens)',
    models: models.sort((a, b) => b.usage.total - a.usage.total),
    totals,
    budget: {
      openrouterUsdBudget: openrouterBudgetUsd,
      openrouterUsdSpent,
      openrouterUsdRemaining: openrouterRemaining,
      openrouterUsedPct: openrouterUsedPct,
      externalLedgerUsd: externalOpenrouterSpentUsd,
      openrouterSpendSource: openrouterApiSinceResetUsd != null
        ? 'openrouter_api_reset_window'
        : (openrouterCredits.ok ? 'openrouter_api_total' : 'logs_estimate'),
      openrouterLogsWindowUsd: totals.openrouterSpentUsd,
      openrouterApiSinceResetUsd,
    },
    openrouter: {
      models: openrouterModels.sort((a, b) => b.costUsd - a.costUsd),
      totals: openrouterTotals,
    },
    openrouterCredits,
    resetState,
    daily,
  };
}

// ── última actividad del agente ───────────────────────────────────────────────
async function collectLastActivity() {
  const sessionRoot = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'sessions');
  const cronRoot    = path.join(process.env.HOME || '', '.openclaw', 'cron', 'runs');

  async function newestJsonl(root) {
    const files = await listRecentJsonlFiles(root, 5);
    return files[0] || null;
  }

  async function parseActivity(file, trigger) {
    if (!file) return null;
    const lines = await readLastLines(file, 200);
    let lastTs = null;
    let lastMsg = null;
    let lastRole = null;
    for (const line of lines) {
      const row = safeJsonParse(line, null);
      if (!row) continue;
      const ts = row.timestamp ? Date.parse(row.timestamp) : (row.ts || null);
      if (ts) lastTs = ts;
      // detect message content
      const content =
        row.content || row.text ||
        (row.message && typeof row.message === 'string' ? row.message : null) ||
        (row.message && row.message.content ? row.message.content : null);
      const role = row.role || row.type || (row.message && row.message.role) || null;
      if (content && typeof content === 'string' && content.length > 2) {
        lastMsg = content.slice(0, 200);
        lastRole = role;
      }
    }
    return lastTs ? { ts: lastTs, msg: lastMsg, role: lastRole, trigger, file: path.basename(file) } : null;
  }

  const [sessionFile, cronFile] = await Promise.all([
    newestJsonl(sessionRoot),
    newestJsonl(cronRoot),
  ]);

  const [sessionAct, cronAct] = await Promise.all([
    parseActivity(sessionFile, 'session'),
    parseActivity(cronFile, 'cron'),
  ]);

  // determine actual trigger from path/content
  function refineTrigger(act) {
    if (!act) return act;
    const fname = (act.file || '').toLowerCase();
    const msg   = (act.msg  || '').toLowerCase();
    if (fname.includes('telegram') || msg.includes('telegram')) return { ...act, trigger: 'telegram' };
    if (fname.includes('cron') || act.trigger === 'cron')       return { ...act, trigger: 'cron' };
    if (fname.includes('discord'))   return { ...act, trigger: 'discord' };
    if (fname.includes('slack'))     return { ...act, trigger: 'slack' };
    return { ...act, trigger: 'api/manual' };
  }

  const candidates = [refineTrigger(sessionAct), refineTrigger(cronAct)].filter(Boolean);
  candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return candidates[0] || null;
}

function inferTriggerFromArtifacts(filePath = '', text = '') {
  const f = String(filePath || '').toLowerCase();
  const t = String(text || '').toLowerCase();
  if (f.includes('/cron/') || t.includes('cron')) return 'cron';
  if (t.includes('telegram') || f.includes('telegram')) return 'telegram';
  if (t.includes('scheduler') || f.includes('scheduler')) return 'scheduler';
  if (t.includes('discord') || f.includes('discord')) return 'discord';
  if (t.includes('slack') || f.includes('slack')) return 'slack';
  return 'session';
}

function extractPromptText(row) {
  const extractFromContentParts = (parts) => {
    if (!Array.isArray(parts)) return '';
    const texts = [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text.trim());
      if (typeof part.thinking === 'string' && part.thinking.trim()) texts.push(part.thinking.trim());
      if (part.type === 'toolCall' && part.arguments) {
        const args = typeof part.arguments === 'string' ? part.arguments : JSON.stringify(part.arguments);
        texts.push(`toolCall:${part.name || 'unknown'} ${args || ''}`.trim());
      }
    }
    return texts.join('\n').trim();
  };

  const candidates = [
    row?.prompt,
    row?.text,
    row?.content,
    row?.input,
    row?.body,
    row?.message?.content,
    row?.message?.text,
    row?.message?.body,
    extractFromContentParts(row?.message?.content),
    extractFromContentParts(row?.content),
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim().length > 0) {
      return item.trim();
    }
    if (Array.isArray(item)) {
      const text = extractFromContentParts(item);
      if (text) return text;
    }
  }
  return '';
}

function collectSensitiveIndicators(params) {
  const out = [];
  const text = String(params?.text || '');
  const ts = params?.ts || null;
  const trigger = params?.trigger || 'session';
  const source = params?.source || '';

  const rules = [
    { id: 'private_key', re: /(id_rsa|id_ed25519|private[_-]?key|BEGIN\s+RSA\s+PRIVATE\s+KEY)/i, severity: 'critical', category: 'credenciales' },
    { id: 'api_key', re: /(api[_-]?key|openrouter|gemini_api_key|token\s*[:=]|bearer\s+[a-z0-9._-]+)/i, severity: 'high', category: 'credenciales' },
    { id: 'password', re: /(password|passwd|contrase(?:n|ñ)a|secret)/i, severity: 'high', category: 'credenciales' },
    { id: 'dot_env', re: /(\.env|secrets\.env|openclaw\.json|credentials?\/)/i, severity: 'high', category: 'archivos_sensibles' },
    { id: 'home_path', re: /(\/users\/[^/\s]+\/|~\/)/i, severity: 'medium', category: 'filesystem' },
    { id: 'ssh_path', re: /(\/\.ssh\/|~\/\.ssh\/)/i, severity: 'high', category: 'filesystem' },
  ];

  for (const rule of rules) {
    const m = text.match(rule.re);
    if (!m) continue;
    out.push({
      ts,
      trigger,
      severity: rule.severity,
      category: rule.category,
      indicator: rule.id,
      match: String(m[0]).slice(0, 120),
      source,
      detail: String(text).slice(0, 220),
    });
  }
  return out;
}

async function collectPromptAndSensitiveHistory() {
  const agentsBase = path.join(process.env.HOME || '', '.openclaw', 'agents');
  const sessionRoots = [];
  try {
    if (fs.existsSync(agentsBase)) {
      for (const dirent of fs.readdirSync(agentsBase, { withFileTypes: true })) {
        if (!dirent.isDirectory()) continue;
        const sessionsPath = path.join(agentsBase, dirent.name, 'sessions');
        if (fs.existsSync(sessionsPath)) sessionRoots.push(sessionsPath);
      }
    }
  } catch {}
  if (!sessionRoots.length) {
    sessionRoots.push(path.join(agentsBase, 'main', 'sessions'));
  }
  const cronRoot = path.join(process.env.HOME || '', '.openclaw', 'cron', 'runs');
  const files = [];
  for (const root of sessionRoots) {
    files.push(...(await listRecentJsonlFiles(root, 16)));
  }
  files.push(...(await listRecentJsonlFiles(cronRoot, 16)));

  const promptHistory = [];
  const sensitiveAccess = [];
  const dedupe = new Set();

  for (const file of files) {
    const lines = await readLastLines(file, 900);
    for (const line of lines) {
      const row = safeJsonParse(line, null);
      if (!row || typeof row !== 'object') continue;
      const tsRaw = row.timestamp ? Date.parse(row.timestamp) : n(row.ts);
      const ts = Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : null;
      const text = extractPromptText(row);
      const trigger = inferTriggerFromArtifacts(file, `${line}\n${text}`);
      const source = path.basename(file);
      const role = String(row.role || row.type || row?.message?.role || '').trim() || 'unknown';

      if (text && text.length > 1) {
        promptHistory.push({
          ts,
          trigger,
          role,
          source,
          prompt: text.slice(0, 360),
        });
      }

      const indicators = collectSensitiveIndicators({
        text: `${line}\n${text}`,
        ts,
        trigger,
        source,
      });
      for (const item of indicators) {
        const key = `${item.ts || 0}|${item.severity}|${item.indicator}|${item.match}|${item.source}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        sensitiveAccess.push(item);
      }
    }
  }

  promptHistory.sort((a, b) => n(b.ts) - n(a.ts));
  sensitiveAccess.sort((a, b) => n(b.ts) - n(a.ts));

  const severityCounts = sensitiveAccess.reduce((acc, item) => {
    const key = String(item.severity || 'low');
    acc[key] = n(acc[key]) + 1;
    return acc;
  }, {});

  return {
    promptHistory: promptHistory.slice(0, 120),
    sensitiveAccess: sensitiveAccess.slice(0, 120),
    stats: {
      promptCount: promptHistory.length,
      sensitiveCount: sensitiveAccess.length,
      severityCounts,
    },
  };
}

function gitCount(repo, sinceExpr) {
  const out = run(`git -C "${repo}" rev-list --count --since="${sinceExpr}" HEAD`);
  if (isErr(out)) return null;
  return Number(out) || 0;
}

function gitLastCommit(repo) {
  const out = run(`git -C "${repo}" log -1 --date=iso --pretty=%cd|%an|%s`);
  if (isErr(out) || !out) return null;
  const [date, author, subject] = String(out).split('|');
  return { date: date || '', author: author || '', subject: subject || '' };
}

async function collectProjectStats() {
  const projects = [];
  for (const p of PROJECT_REPOS) {
    if (!fs.existsSync(path.join(p.path, '.git'))) {
      projects.push({ ...p, exists: false });
      continue;
    }
    const c24 = gitCount(p.path, '24 hours ago');
    const c7 = gitCount(p.path, '7 days ago');
    const c30 = gitCount(p.path, '30 days ago');
    const last = gitLastCommit(p.path);
    projects.push({
      ...p,
      exists: true,
      commits24h: c24,
      commits7d: c7,
      commits30d: c30,
      lastCommit: last,
    });
  }
  const totals = projects.reduce(
    (acc, p) => {
      acc.commits24h += n(p.commits24h);
      acc.commits7d += n(p.commits7d);
      acc.commits30d += n(p.commits30d);
      return acc;
    },
    { commits24h: 0, commits7d: 0, commits30d: 0 },
  );
  return { projects, totals };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.br': 'application/brotli',
    '.gz': 'application/gzip',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function staticFile(req, res, relPath, contentType = 'text/plain; charset=utf-8') {
  const file = path.join(PUBLIC_DIR, relPath);
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const acceptEncoding = req?.headers?.['accept-encoding'] || '';
  const isVersioned = /\?v=\d+/.test(relPath) || /\/[a-f0-9]{8,}\./.test(relPath);
  const cacheControl = isVersioned
    ? 'public, max-age=31536000, immutable'
    : 'no-store, no-cache, must-revalidate, proxy-revalidate';

  const data = fs.readFileSync(file);

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Pragma': cacheControl.includes('no-cache') ? 'no-cache' : undefined,
    'Expires': isVersioned ? new Date(Date.now() + 31536000000).toUTCString() : '0',
    'Vary': 'Accept-Encoding',
  };

  const useBrotli = acceptEncoding.includes('br') && !contentType.includes('image');
  const useGzip = !useBrotli && acceptEncoding.includes('gzip') && !contentType.includes('image');

  if (useBrotli) {
    const compressed = zlib.brotliCompressSync(data, { quality: 11 });
    headers['Content-Encoding'] = 'br';
    headers['Content-Length'] = compressed.length;
    res.writeHead(200, headers);
    res.end(compressed);
  } else if (useGzip) {
    const compressed = zlib.gzipSync(data, { level: 9 });
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = compressed.length;
    res.writeHead(200, headers);
    res.end(compressed);
  } else {
    headers['Content-Length'] = data.length;
    res.writeHead(200, headers);
    res.end(data);
  }
}

function publicAssetsVersion() {
  const files = ['app.js', 'workroom.js', 'styles.css'].map((f) => path.join(PUBLIC_DIR, f));
  let latest = 0;
  for (const file of files) {
    try {
      const mtime = fs.statSync(file).mtimeMs || 0;
      if (mtime > latest) latest = mtime;
    } catch {
      // ignore missing asset
    }
  }
  return String(Math.floor(latest || Date.now()));
}

/** Sirve un HTML inyectando window.DASHBOARD_TOKEN antes de </head> (task 5.3). */
function serveHtmlWithToken(res, relPath) {
  const file = path.join(PUBLIC_DIR, relPath);
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  let html = fs.readFileSync(file, 'utf8');
  const version = publicAssetsVersion();
  html = html
    .replace(/href="\/styles\.css(?:\?[^"]*)?"/g, `href="/styles.css?v=${version}"`)
    .replace(/src="\/app\.js(?:\?[^"]*)?"/g, `src="/app.js?v=${version}"`)
    .replace(/src="\/workroom\.js(?:\?[^"]*)?"/g, `src="/workroom.js?v=${version}"`);
  // Inyectar token como variable global antes de cualquier script del cliente
  const tokenScript = `<script>window.DASHBOARD_TOKEN=${JSON.stringify(DASHBOARD_TOKEN || '')};</script>`;
  html = html.replace('</head>', `${tokenScript}\n</head>`);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(html);
}

function toDashboardHttp(wsUrl) {
  if (!wsUrl) return 'http://127.0.0.1:18889/';
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/?$/, '/');
}

function portFromGatewayUrl(wsUrl) {
  try {
    const u = new URL(wsUrl);
    if (u.port) return Number(u.port);
    return u.protocol === 'wss:' ? 443 : 80;
  } catch {
    return 18889;
  }
}

function resolveGatewayUrl(cfg) {
  if (ENV_GATEWAY_URL) return ENV_GATEWAY_URL;
  const port = Number(cfg?.gateway?.port || 18889);
  return `ws://127.0.0.1:${port}`;
}

function readHaTokenFromSecrets() {
  try {
    if (!fs.existsSync(HA_SECRETS_ENV_PATH)) return '';
    const raw = fs.readFileSync(HA_SECRETS_ENV_PATH, 'utf8');
    const line = raw.split('\n').find((l) => /^\s*HA_TOKEN=/.test(l));
    if (!line) return '';
    const value = line.replace(/^\s*HA_TOKEN=/, '').trim();
    return value.replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

function getHaToken() {
  return String(process.env.HA_TOKEN || readHaTokenFromSecrets() || '').trim();
}

async function haApi(pathname, opts = {}) {
  const token = getHaToken();
  if (!token) return { ok: false, status: 0, error: 'HA_TOKEN no configurado' };
  const url = `${HA_URL}${pathname}`;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const json = safeJsonParse(text, null);
    if (!res.ok) {
      return { ok: false, status: res.status, error: (json?.message || text || `HTTP ${res.status}`).slice(0, 300) };
    }
    return { ok: true, status: res.status, data: json };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err || 'error HA') };
  }
}

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  const raw = String(value).trim();
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

function normalizeHaAssetUrl(urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${HA_URL}${raw}`;
  return `${HA_URL}/${raw}`;
}

function parseRoomMapping(value) {
  const rooms = Array.isArray(value) ? value : [];
  return rooms
    .filter((r) => Array.isArray(r))
    .map((r) => ({
      segmentId: r[0] ?? null,
      roomId: r[1] ?? null,
      name: r[2] || `Segment ${r[0] ?? '?'}`,
    }));
}

function parseCleanHistory(cleanRecord) {
  const rows = Array.isArray(cleanRecord?.history_list) ? cleanRecord.history_list : [];
  return rows.slice(0, 24).map((row) => ({
    label: String(row?.label || ''),
    startTs: n(row?.stime) > 0 ? n(row.stime) : null,
  }));
}

async function collectAppleStatus() {
  const statesRes = await haApi('/api/states');
  if (!statesRes.ok) {
    return {
      ok: false,
      error: statesRes.error || 'No se pudo leer estados HA',
      devices: [],
      metrics: [],
      notifyTargets: [],
    };
  }
  const servicesRes = await haApi('/api/services');
  const states = Array.isArray(statesRes.data) ? statesRes.data : [];
  const services = Array.isArray(servicesRes?.data) ? servicesRes.data : [];

  const appleHint = /(iphone|ipad|watch|apple|macbook|airpods|ios)/i;
  const trackers = states.filter((s) => String(s?.entity_id || '').startsWith('device_tracker.'));
  const sensors = states.filter((s) => String(s?.entity_id || '').startsWith('sensor.'));

  const devices = trackers
    .filter((s) => {
      const eid = String(s.entity_id || '');
      const fn = String(s.attributes?.friendly_name || '');
      const vendor = String(s.attributes?.manufacturer || '');
      return appleHint.test(eid) || appleHint.test(fn) || /apple/i.test(vendor);
    })
    .map((s) => {
      const lat = n(s.attributes?.latitude);
      const lon = n(s.attributes?.longitude);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
      return {
        entityId: s.entity_id,
        name: s.attributes?.friendly_name || s.entity_id,
        state: s.state || 'unknown',
        battery: s.attributes?.battery_level ?? null,
        latitude: hasCoords ? lat : null,
        longitude: hasCoords ? lon : null,
        gpsAccuracy: s.attributes?.gps_accuracy ?? null,
        lastUpdated: s.last_updated || null,
      };
    });

  const metrics = sensors
    .filter((s) => {
      const eid = String(s.entity_id || '');
      const fn = String(s.attributes?.friendly_name || '');
      return appleHint.test(eid) || appleHint.test(fn);
    })
    .filter((s) => !['unknown', 'unavailable', 'none'].includes(String(s.state || '').toLowerCase()))
    .slice(0, 80)
    .map((s) => ({
      entityId: s.entity_id,
      name: s.attributes?.friendly_name || s.entity_id,
      state: s.state,
      unit: s.attributes?.unit_of_measurement || '',
      deviceClass: s.attributes?.device_class || '',
      lastUpdated: s.last_updated || null,
    }));

  const notifyTargets = services
    .filter((d) => d?.domain === 'notify')
    .flatMap((d) => Array.isArray(d.services) ? Object.keys(d.services).map((svc) => ({ domain: 'notify', service: svc })) : [])
    .filter((s) => /(mobile_app|iphone|ipad|watch|ios|apple)/i.test(s.service))
    .map((s) => ({ id: `${s.domain}.${s.service}`, service: s.service }));

  return {
    ok: true,
    devices,
    metrics,
    notifyTargets,
    mapCenter: devices.find((d) => d.latitude != null && d.longitude != null) || null,
  };
}

async function collectVacuumStatus() {
  const statesRes = await haApi('/api/states');
  if (!statesRes.ok) {
    return {
      ok: false,
      error: statesRes.error || 'No se pudo leer estados HA',
      vacuums: [],
      primary: null,
    };
  }

  const states = Array.isArray(statesRes.data) ? statesRes.data : [];
  const vacuumStates = states.filter((s) => String(s?.entity_id || '').startsWith('vacuum.'));
  const cameraStates = states.filter((s) => String(s?.entity_id || '').startsWith('camera.'));

  const vacuums = vacuumStates.map((s) => {
    const attrs = s?.attributes && typeof s.attributes === 'object' ? s.attributes : {};
    const mapManagement = parseMaybeJson(attrs['vacuum_map.map_management']);
    const mapObj = parseMaybeJson(attrs['vacuum_map.map_obj_name']);
    const trajectoryObj = parseMaybeJson(attrs['vacuum_map.trajectory_obj_name']);
    const cleanRecord = parseMaybeJson(attrs['vacuum_map.clean_record']);
    const roomMapping = parseRoomMapping(attrs.room_mapping);
    const zoneIdsRaw = String(attrs['vacuum.zone_ids'] || '').trim();
    const zoneIds = zoneIdsRaw ? zoneIdsRaw.split(/[,\s]+/).filter(Boolean) : [];
    const maps = Array.isArray(mapManagement?.map_array)
      ? mapManagement.map_array.map((m) => ({
          mapId: m?.map_id ?? null,
          mapName: String(m?.map_name || '').trim() || '(sin nombre)',
          objectName: String(m?.obj_name || ''),
          isCurrent: Boolean(m?.is_current),
          temp: n(m?.temp),
        }))
      : [];

    let mapImagePath = String(attrs.entity_picture || '');
    let mapImageEntityId = '';
    if (!mapImagePath) {
      const cam = cameraStates.find((c) => {
        const eid = String(c.entity_id || '').toLowerCase();
        const fn = String(c.attributes?.friendly_name || '').toLowerCase();
        return /vacuum|robot|miot|xiaomi|map/.test(eid) || /vacuum|robot|miot|xiaomi|map/.test(fn);
      });
      if (cam?.attributes?.entity_picture) {
        mapImagePath = String(cam.attributes.entity_picture);
        mapImageEntityId = String(cam.entity_id || '');
      }
    }

    const mapImageUrl = normalizeHaAssetUrl(mapImagePath);
    const cleanArea = n(attrs['vacuum.cleaning_area'] ?? attrs.clean_area);
    const cleanMinutes = n(attrs['vacuum.cleaning_time'] ?? attrs.clean_time);
    const battery = n(attrs.battery_level);
    const lastCleanTs = n(attrs['vacuum.last_clean_time']) > 0
      ? n(attrs['vacuum.last_clean_time']) * 1000
      : null;
    const cleanHistory = parseCleanHistory(cleanRecord);

    return {
      entityId: s.entity_id,
      name: attrs.friendly_name || s.entity_id,
      state: s.state || 'unknown',
      statusDesc: String(attrs['vacuum.status_desc'] || attrs.status || '').trim(),
      battery: Number.isFinite(battery) ? battery : null,
      fanSpeed: attrs.fan_speed || attrs.fan_level || '',
      cleanArea,
      cleanMinutes,
      lastCleanTs,
      lastUpdated: s.last_updated || null,
      roomMapping,
      zoneIds,
      map: {
        hasImage: Boolean(mapImageUrl),
        imageUrl: mapImageUrl,
        imageEntityId: mapImageEntityId,
        objectName: String(mapObj?.obj_name || ''),
        trajectoryObjectName: String(trajectoryObj?.obj_name || ''),
        currentMapId: attrs['vacuum_map.current_map_id'] ?? null,
        maps,
        mapCount: maps.length,
      },
      cleanHistory,
    };
  });

  return {
    ok: true,
    vacuums,
    primary: vacuums[0] || null,
  };
}

async function buildStatus() {
  const cfg = await readOpenClawConfig();
  const gatewayUrl = resolveGatewayUrl(cfg);
  const configuredPort = Number(cfg?.gateway?.port || 18889);
  const runtimePort = portFromGatewayUrl(gatewayUrl);
  const openclawListening = await checkPort('127.0.0.1', runtimePort);
  const haListening = await checkPort('127.0.0.1', 8123);
  const haProbe = await httpProbe(HA_URL);

  const openclawLogs = await getOpenClawLogTail(180);
  const haLogs = await getHomeAssistantLogTail(120);
  const cron = await getCronJobs(cfg);
  const usageStats = await collectUsageStats(cfg);
  const projectStats = await collectProjectStats();
  const lastActivity = await collectLastActivity();
  const security = await collectPromptAndSensitiveHistory();
  const apple = await collectAppleStatus();
  const vacuum = await collectVacuumStatus();

  const errCount = openclawLogs.filter((l) => /\berror\b|failed|unauthorized|timeout/i.test(l)).length;
  const telegramEvents = openclawLogs.filter((l) => /telegram/i.test(l)).slice(-10);

  const modelPrimary = cfg?.agents?.defaults?.model?.primary || 'desconocido';
  const configuredModels = Object.entries(cfg?.agents?.defaults?.models || {})
    .map(([key, value]) => ({
      model: key,
      alias: value?.alias || '',
      source: 'config',
    }))
    .filter((m) => typeof m.model === 'string' && m.model.trim().length > 0);
  const usageModels = ((usageStats?.models || []).map((m) => ({
    model: m?.model || '',
    alias: '',
    source: 'usage',
  }))).filter((m) => m.model);
  const modelMap = new Map();
  for (const row of [...configuredModels, ...usageModels]) {
    if (!modelMap.has(row.model)) {
      modelMap.set(row.model, row);
    } else if (!modelMap.get(row.model)?.alias && row.alias) {
      modelMap.set(row.model, row);
    }
  }
  // Quality cloud models — shown first, recommended for complex tasks
  const PREFERRED_CLOUD = new Set([
    'openrouter/moonshotai/kimi-k2.5',
    'openrouter/minimax/minimax-m2.7',
    'openrouter/minimax/minimax-m2.5',
    'openrouter/google/gemini-3-flash-preview',
    'google/gemini-2.5-flash-lite',
    'openrouter/deepseek/deepseek-r1-0528:free',
    'openrouter/qwen/qwen3-coder:free',
    'openrouter/openai/gpt-oss-120b:free',
    'huggingface/moonshotai/Kimi-K2.5',
  ]);
  // Models to skip from UI (internal/delivery/bare usage)
  const SKIP_MODELS = new Set(['openclaw/delivery-mirror', 'minimax/minimax-m2.5', 'minimax/minimax-m2.7', 'moonshotai/kimi-k2.5']);
  const enrichModel = (m) => {
    const key = m.model;
    const isLocal = key.startsWith('custom-127-0-0-1-11434/');
    const isSkip = SKIP_MODELS.has(key);
    const isPreferred = PREFERRED_CLOUD.has(key);
    return {
      ...m,
      tier: isSkip ? 'skip' : isLocal ? 'local' : 'cloud',
      preferred: isPreferred,
    };
  };
  const availableModels = [...modelMap.values()]
    .map(enrichModel)
    .filter((m) => m.tier !== 'skip')
    .sort((a, b) => {
      // preferred cloud first, then other cloud, then local
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (a.tier !== b.tier) return a.tier === 'cloud' ? -1 : 1;
      return String(a.model).localeCompare(String(b.model));
    });
  const primaryLower = String(modelPrimary || '').toLowerCase();
  const modelModeGuess = modelPrimary === MODE_LOCAL_MODEL
    ? 'noche (minimax 2.5)'
    : modelPrimary === MODE_CLOUD_MODEL
      ? 'dia (minimax 2.7)'
      : primaryLower.includes('minimax-m2.7')
        ? 'dia (minimax 2.7)'
        : primaryLower.includes('minimax-m2.5')
          ? 'noche/ollama (minimax 2.5)'
          : primaryLower.includes('gemini')
            ? 'dia (gemini)'
            : primaryLower.includes('qwen') || primaryLower.includes('custom-127-0-0-1-11434')
              ? 'noche/local (ollama)'
              : 'custom';
  const resources = collectResourceUsage(runtimePort);
  const networkTrace = collectProcessNetworkTrace(resources?.services?.openclaw?.pid);
  await writeResourceSample(resources);
  await pruneResourceHistory();
  const resourceRows = await readResourceHistory();
  const resourceStats = summarizeResourceHistory(resourceRows);

  const services = {
    openclaw: {
      id: 'openclaw',
      label: 'OpenClaw Gateway',
      running: openclawListening,
      detail: `127.0.0.1:${runtimePort}`,
    },
    telegram: {
      id: 'telegram',
      label: 'Telegram',
      running: Boolean(cfg?.channels?.telegram?.enabled && cfg?.channels?.telegram?.botToken),
      detail: cfg?.channels?.telegram?.name || 'bot no configurado',
    },
    homeassistant: {
      id: 'homeassistant',
      label: 'Home Assistant',
      running: dockerIsRunning('homeassistant'),
      detail: 'docker:homeassistant',
    },
    n8n: {
      id: 'n8n',
      label: 'n8n',
      running: dockerIsRunning('n8n'),
      detail: 'docker:n8n',
    },
  };

  return {
    nowIso: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    openclaw: {
      configPath: OPENCLAW_CONFIG,
      gatewayUrl,
      dashboardUrl: toDashboardHttp(gatewayUrl),
      port: runtimePort,
      configuredPort,
      listening: openclawListening,
      modelPrimary,
      availableModels,
      modeLocalModel: MODE_LOCAL_MODEL,
      modeCloudModel: MODE_CLOUD_MODEL,
      modelModeGuess,
      telegramEnabled: Boolean(cfg?.channels?.telegram?.enabled),
      telegramBot: cfg?.channels?.telegram?.name || '',
      errorCountRecent: errCount,
    },
    homeassistant: {
      url: HA_URL,
      listening8123: haListening,
      httpOk: haProbe.ok,
      httpStatus: haProbe.status || null,
      httpError: haProbe.error || null,
    },
    activity: {
      telegramEvents,
      cronJobs: cron.jobs || [],
      cronOk: Boolean(cron.ok),
      cronError: cron.error || null,
    },
    resources: {
      ...resources,
      peaks: resourceStats.peaks,
      series24h: resourceStats.series24h,
      totalSamples: resourceStats.totalSamples,
    },
    networkTrace,
    usage: usageStats,
    security,
    projects: projectStats,
    lastActivity,
    apple,
    vacuum,
    services,
    logs: {
      openclaw: openclawLogs.slice(-120),
      homeassistant: haLogs.slice(-120),
    },
  };
}

const STATUS_PAYLOAD_TTL_MS = 5 * 60 * 1000;
let statusPayloadCache = null;
let statusPayloadAtMs = 0;
let statusPayloadInflight = null;

function invalidateStatusPayloadCache() {
  statusPayloadCache = null;
  statusPayloadAtMs = 0;
  statusPayloadInflight = null;
}

async function getStatusPayload(force = false) {
  const now = Date.now();
  const fresh = statusPayloadCache && ((now - statusPayloadAtMs) < STATUS_PAYLOAD_TTL_MS);
  if (!force && fresh) return statusPayloadCache;
  if (!force && statusPayloadInflight) return statusPayloadInflight;
  statusPayloadInflight = (async () => {
    const payload = await buildStatus();
    statusPayloadCache = payload;
    statusPayloadAtMs = Date.now();
    return payload;
  })()
    .finally(() => {
      statusPayloadInflight = null;
    });
  return statusPayloadInflight;
}

async function setModelMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!['local', 'cloud'].includes(normalized)) {
    return { ok: false, message: `Modo inválido: ${mode}` };
  }

  let cfg = await readOpenClawConfig();
  if (!cfg || typeof cfg !== 'object') {
    cfg = {};
  }

  const targetModel = normalized === 'local' ? MODE_LOCAL_MODEL : MODE_CLOUD_MODEL;
  cfg.agents = cfg.agents && typeof cfg.agents === 'object' ? cfg.agents : {};
  cfg.agents.defaults =
    cfg.agents.defaults && typeof cfg.agents.defaults === 'object' ? cfg.agents.defaults : {};
  cfg.agents.defaults.model =
    cfg.agents.defaults.model && typeof cfg.agents.defaults.model === 'object'
      ? cfg.agents.defaults.model
      : {};
  cfg.agents.defaults.model.primary = targetModel;

  cfg.agents.defaults.models =
    cfg.agents.defaults.models && typeof cfg.agents.defaults.models === 'object'
      ? cfg.agents.defaults.models
      : {};
  cfg.agents.defaults.models[MODE_LOCAL_MODEL] = {
    ...(cfg.agents.defaults.models[MODE_LOCAL_MODEL] || {}),
    alias: 'modo_local',
  };
  cfg.agents.defaults.models[MODE_CLOUD_MODEL] = {
    ...(cfg.agents.defaults.models[MODE_CLOUD_MODEL] || {}),
    alias: 'modo_cloud',
  };

  cfg.channels = cfg.channels && typeof cfg.channels === 'object' ? cfg.channels : {};
  cfg.channels.telegram =
    cfg.channels.telegram && typeof cfg.channels.telegram === 'object' ? cfg.channels.telegram : {};
  const currentCustom = Array.isArray(cfg.channels.telegram.customCommands)
    ? cfg.channels.telegram.customCommands
    : [];
  cfg.channels.telegram.customCommands = [
    ...currentCustom,
    { command: 'modo_local', description: 'Cambiar a modo local' },
    { command: 'modo_cloud', description: 'Cambiar a modo cloud' },
  ].filter((entry, idx, arr) => arr.findIndex((x) => x.command === entry.command) === idx);

  await fsp.writeFile(OPENCLAW_CONFIG, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  const restart = await performServiceAction('openclaw', 'restart', cfg);
  if (!restart.ok) {
    return {
      ok: false,
      message: `Modo ${normalized} guardado, pero falló reinicio de OpenClaw: ${restart.message}`,
      mode: normalized,
      modelPrimary: targetModel,
    };
  }
  return {
    ok: true,
    message: `Modo ${normalized} aplicado (${targetModel})`,
    mode: normalized,
    modelPrimary: targetModel,
    restart,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return safeJsonParse(raw, {});
}

async function performServiceAction(service, action, cfg) {
  const allowedServices = new Set(['openclaw', 'homeassistant', 'n8n']);
  const allowedActions = new Set(['start', 'stop', 'restart']);
  if (!allowedServices.has(service)) {
    return { ok: false, message: `Servicio inválido: ${service}` };
  }
  if (!allowedActions.has(action)) {
    return { ok: false, message: `Acción inválida: ${action}` };
  }

  if (service === 'openclaw') {
    const gatewayUrl = resolveGatewayUrl(cfg);
    const port = portFromGatewayUrl(gatewayUrl);
    const token = String(cfg?.gateway?.auth?.token || '').trim();
    const openclawEnv = token ? { OPENCLAW_GATEWAY_TOKEN: token } : {};

    if (action === 'stop' || action === 'restart') {
      const stopped = runAgentWorkroomScript(AGENTWORKROOM_STOP, 30000);
      if (!stopped.ok) {
        return { ok: false, message: `No se pudo detener servicio OpenClaw:\n${stopped.output}` };
      }
      // Clean stale memory bridge processes that may survive abrupt restarts.
      runShell(`pkill -f '/Users/devjaime/.openclaw/extensions/openclaw-neo4j-memory/server/main.py' >/dev/null 2>&1 || true`, 5000);
    }
    if (action === 'start' || action === 'restart') {
      const started = runAgentWorkroomScript(AGENTWORKROOM_START, 120000);
      if (!started.ok) {
        return { ok: false, message: `No se pudo iniciar servicio OpenClaw:\n${started.output}` };
      }
    }
    let running = false;
    for (let i = 0; i < 20; i += 1) {
      running = await checkPort('127.0.0.1', port);
      if (running) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    let rpcOk = false;
    if (running) {
      const statusCheck = fs.existsSync(AGENTWORKROOM_STATUS)
        ? runAgentWorkroomScript(AGENTWORKROOM_STATUS, 30000)
        : null;
      if (statusCheck && !statusCheck.ok) {
        return {
          ok: false,
          message: `OpenClaw levantó el puerto, pero AgentWorkroom reportó estado no saludable:\n${statusCheck.output}`,
          running,
          rpcOk: false,
        };
      }
      const rpc = runShellWithEnv(
        `"${OPENCLAW_BIN}" gateway status --url "${gatewayUrl}" --require-rpc --json`,
        openclawEnv,
        20000,
      );
      rpcOk = rpc.ok;
      if (!rpcOk) {
        return {
          ok: false,
          message: `OpenClaw está escuchando en puerto, pero RPC falló:\n${rpc.output}`,
          running,
          rpcOk,
        };
      }
    }
    return {
      ok: true,
      message: `OpenClaw ${action} ejecutado`,
      running,
      rpcOk,
    };
  }

  const container = service;
  let dockerReady = runShell(`${DOCKER_BIN} info --format '{{.ServerVersion}}'`, 5000).ok;
  if (!dockerReady && (action === 'start' || action === 'restart')) {
    runShell('open -a Docker', 5000);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      dockerReady = runShell(`${DOCKER_BIN} info --format '{{.ServerVersion}}'`, 5000).ok;
      if (dockerReady) break;
    }
  }
  if (!dockerReady) return { ok: false, message: 'Docker Engine no está disponible. Abre Docker Desktop y vuelve a intentar.' };
  const result = runShell(`${DOCKER_BIN} ${action} ${container}`);
  if (!result.ok) {
    return { ok: false, message: result.output || `Fallo docker ${action} ${container}` };
  }
  await new Promise((r) => setTimeout(r, 800));
  const running = dockerIsRunning(container);
  return {
    ok: true,
    message: `${container} ${action} ejecutado`,
    running,
  };
}

// ── Workroom agent dispatcher ─────────────────────────────────────────────────
async function dispatchAgentMessage(deskId, userMessage) {
  const session = WORKROOM_SESSIONS[deskId];
  const isFirst = session.messages.filter((m) => m.role === 'user').length <= 1;
  const fullMessage = isFirst
    ? `[CONTEXT: ${WORKROOM_CONTEXT[deskId]}]\n\n${userMessage}`
    : userMessage;

  try {
    const out = await runShellAsync(
      `"${OPENCLAW_BIN}" agent --session-id ${session.sessionId} --message "$WR_MSG" --json`,
      { ...buildSafeEnv(), WR_MSG: fullMessage },
      120000,
    );
    if (out.ok) {
      const parsed = extractTrailingJsonObject(out.output);
      // gateway mode:   { result: { payloads: [{ text: "..." }] } }
      // embedded mode:  { payloads: [{ text: "..." }], meta: {...} }
      const reply = String(
        parsed?.result?.payloads?.[0]?.text ||
        parsed?.payloads?.[0]?.text ||
        parsed?.reply || parsed?.response || parsed?.text ||
        out.output || '(sin respuesta)'
      );
      session.messages.push({ role: 'agent', text: reply, ts: Date.now() });
    } else {
      session.messages.push({ role: 'error', text: out.output || 'Error desconocido', ts: Date.now() });
    }
  } catch (e) {
    session.messages.push({ role: 'error', text: String(e?.message || e), ts: Date.now() });
  } finally {
    session.busy = false;
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // ── Auth middleware: /api/* requiere X-Dashboard-Token (tasks 4.1-4.3) ──────
  const isStaticAsset = !u.pathname.startsWith('/api/');
  if (!isStaticAsset && !isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (u.pathname === '/api/status') {
    const force = u.searchParams.get('force') === '1';
    const payload = await getStatusPayload(force);
    sendJson(res, 200, payload);
    return;
  }

  if (u.pathname === '/api/userspace') {
    const diskData = collectDiskUsage();
    const procData = collectTopProcesses(15);
    sendJson(res, 200, { ok: true, disk: diskData, processes: procData });
    return;
  }

  if (u.pathname === '/api/gateway-auth') {
    const cfg = await readOpenClawConfig();
    const gatewayUrl = resolveGatewayUrl(cfg);
    const token = String(cfg?.gateway?.auth?.token || '').trim();
    if (!token) {
      sendJson(res, 400, { ok: false, message: 'Token de gateway no configurado' });
      return;
    }
    // Devuelve ok + gatewayUrl; el token es redactado por sendJson/redact()
    sendJson(res, 200, { ok: true, gatewayUrl, gatewayToken: token });
    return;
  }

  if (u.pathname === '/api/update-status') {
    const updateBin = fs.existsSync(OPENCLAW_UPDATE_BIN) ? OPENCLAW_UPDATE_BIN : OPENCLAW_BIN;
    const currentVersionRaw = run(`"${updateBin}" --version`);
    const currentVersion = isErr(currentVersionRaw) ? '' : String(currentVersionRaw || '').trim();
    const out = runShell(`"${updateBin}" update status --json`, 20000);
    if (!out.ok) {
      sendJson(res, 500, { ok: false, message: 'No se pudo consultar update status' });
      return;
    }
    const parsed = extractTrailingJsonObject(out.output);
    if (!parsed) {
      sendJson(res, 500, { ok: false, message: 'Salida no parseable de update status' });
      return;
    }
    const installed = String(currentVersion || parsed?.update?.currentVersion || '').trim();
    const latest = String(parsed?.availability?.latestVersion || parsed?.update?.registry?.latestVersion || '').trim();
    const available = Boolean(parsed?.availability?.available);
    sendJson(res, 200, {
      ok: true,
      available,
      installed: installed || (available ? '' : latest),
      latest: latest || installed,
      channel: parsed?.channel?.label || 'stable',
    });
    return;
  }

  if (u.pathname === '/api/openclaw') {
    const data = await getOpenClawLogTail(300);
    sendJson(res, 200, { lines: data });
    return;
  }

  if (u.pathname === '/api/homeassistant') {
    const data = await getHomeAssistantLogTail(300);
    sendJson(res, 200, { lines: data });
    return;
  }

  if (u.pathname === '/api/ha/states' && req.method === 'GET') {
    const statesRes = await haApi('/api/states');
    if (!statesRes.ok) {
      sendJson(res, 500, { ok: false, error: statesRes.error });
      return;
    }
    const states = statesRes.data || [];
    const cameras = states.filter(s => String(s?.entity_id || '').startsWith('camera.'));
    const vacuums = states.filter(s => String(s?.entity_id || '').startsWith('vacuum.'));
    const lights = states.filter(s => String(s?.entity_id || '').startsWith('light.'));
    const switches = states.filter(s => String(s?.entity_id || '').startsWith('switch.'));
    sendJson(res, 200, { ok: true, states, cameras, vacuums, lights, switches, total: states.length });
    return;
  }

  if (u.pathname === '/api/ha/cameras' && req.method === 'GET') {
    const statesRes = await haApi('/api/states');
    if (!statesRes.ok) {
      sendJson(res, 500, { ok: false, error: statesRes.error });
      return;
    }
    const cameras = (statesRes.data || [])
      .filter(s => String(s?.entity_id || '').startsWith('camera.'))
      .map(c => ({
        entityId: c.entity_id,
        name: c.attributes?.friendly_name || c.entity_id,
        state: c.state,
        lastChanged: c.last_changed,
        thumbnail: c.attributes?.entity_picture || null,
      }));
    sendJson(res, 200, { ok: true, cameras });
    return;
  }

  if (u.pathname === '/api/ha/vacuum' && req.method === 'GET') {
    const vacuumData = await collectVacuumStatus();
    sendJson(res, 200, vacuumData);
    return;
  }

  if (u.pathname === '/api/ha/services' && req.method === 'GET') {
    const servicesRes = await haApi('/api/services');
    if (!servicesRes.ok) {
      sendJson(res, 500, { ok: false, error: servicesRes.error });
      return;
    }
    sendJson(res, 200, { ok: true, services: servicesRes.data || {} });
    return;
  }

  if (u.pathname === '/api/ha/call-service' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const domain = String(body?.domain || '').trim();
    const service = String(body?.service || '').trim();
    const entityId = String(body?.entityId || '').trim();
    const data = body?.data || {};

    if (!domain || !service) {
      sendJson(res, 400, { ok: false, message: 'domain y service son requeridos' });
      return;
    }

    const payload = { ...data };
    if (entityId) payload.entity_id = entityId;

    const out = await haApi(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: payload,
    });

    sendJson(res, out.ok ? 200 : 500, out);
    return;
  }

  if (u.pathname === '/api/ha/entity' && req.method === 'GET') {
    const entityId = u.searchParams.get('entity_id');
    if (!entityId) {
      sendJson(res, 400, { ok: false, message: 'entity_id es requerido' });
      return;
    }
    const out = await haApi(`/api/states/${entityId}`);
    if (out.ok) {
      sendJson(res, 200, { ok: true, state: out.data });
    } else {
      sendJson(res, 404, { ok: false, error: out.error });
    }
    return;
  }

  if (u.pathname === '/api/n8n/status' && req.method === 'GET') {
    const n8nPort = 5678;
    let running = false;
    let status = 0;
    try {
      const check = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: n8nPort, path: '/healthz/readiness', method: 'GET' }, (res) => resolve({ running: res.statusCode === 200, status: res.statusCode || 0 }));
        req.on('error', () => resolve({ running: false, status: 0 }));
        req.setTimeout(2000, () => { req.destroy(); resolve({ running: false, status: 0 }); });
        req.end();
      });
      running = check.running;
      status = check.status;
    } catch { running = false; }
    sendJson(res, 200, { ok: true, running, ready: running, status, containerRunning: dockerIsRunning('n8n'), url: `http://127.0.0.1:${n8nPort}` });
    return;
  }

  if (u.pathname === '/api/openclaw/status' && req.method === 'GET') {
    const openclawPort = 18789;
    let running = false;
    let version = '';
    try {
      const check = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: openclawPort, path: '/status', method: 'GET' }, (res) => resolve(true));
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
        req.end();
      });
      running = check;
    } catch { running = false; }
    try {
      const versionBin = fs.existsSync(OPENCLAW_UPDATE_BIN) ? OPENCLAW_UPDATE_BIN : OPENCLAW_BIN;
      version = execSync(`"${versionBin}" --version 2>/dev/null || echo ""`, { timeout: 3000 }).toString().trim();
    } catch {}
    sendJson(res, 200, { ok: true, running, port: openclawPort, version, url: `http://127.0.0.1:${openclawPort}` });
    return;
  }

  if (u.pathname === '/api/hermes/status' && req.method === 'GET') {
    const HERMES_CONFIG = path.join(process.env.HOME || '', '.hermes', 'config.yaml');
    const HERMES_ENV = path.join(process.env.HOME || '', '.hermes', '.env');
    let model = 'unknown';
    let provider = 'unknown';
    let memoryEnabled = false;
    try {
      const configContent = fs.readFileSync(HERMES_CONFIG, 'utf8');
      const modelMatch = configContent.match(/default:\s*(\S+)/);
      const providerMatch = configContent.match(/provider:\s*(\S+)/);
      if (modelMatch) model = modelMatch[1];
      if (providerMatch) provider = providerMatch[1];
      memoryEnabled = configContent.includes('memory_enabled: true');
    } catch {}
    const running = Boolean(run('pgrep -f "hermes_cli.main gateway run"') && !isErr(run('pgrep -f "hermes_cli.main gateway run"')));
    const versionOut = fs.existsSync(HERMES_CLI) ? runShell(`"${HERMES_CLI}" -m hermes_cli.main --version`, 12000) : { ok: false, output: '' };
    const versionLines = String(versionOut.output || '').split('\n');
    sendJson(res, 200, {
      ok: true, running, model, provider, memoryEnabled,
      version: versionLines.find((line) => line.startsWith('Hermes Agent '))?.replace('Hermes Agent ', '') || '',
      updateAvailable: versionLines.some((line) => /update available/i.test(line)),
    });
    return;
  }

  if (u.pathname === '/api/services/health' && req.method === 'GET') {
    const [ha, n8n, openclaw] = await Promise.all([
      haApi('/api/'),
      httpProbe('http://127.0.0.1:5678/healthz/readiness'),
      httpProbe('http://127.0.0.1:18789/status'),
    ]);
    const docker = runShell(`${DOCKER_BIN} info --format '{{.ServerVersion}}'`, 5000);
    sendJson(res, 200, {
      ok: true,
      docker: { running: docker.ok, version: docker.ok ? docker.output : '', error: docker.ok ? '' : 'Docker Engine no disponible' },
      services: {
        homeassistant: { running: ha.ok, containerRunning: dockerIsRunning('homeassistant'), url: HA_URL, error: ha.ok ? '' : ha.error },
        n8n: { running: n8n.ok && n8n.status === 200, containerRunning: dockerIsRunning('n8n'), url: 'http://127.0.0.1:5678', status: n8n.status || 0 },
        openclaw: { running: openclaw.ok, url: 'http://127.0.0.1:18789', status: openclaw.status || 0 },
        hermes: { running: Boolean(run('pgrep -f "hermes_cli.main gateway run"') && !isErr(run('pgrep -f "hermes_cli.main gateway run"'))) },
      },
    });
    return;
  }

  if (u.pathname === '/api/agents/activity' && req.method === 'GET') {
    const [openclawSessions] = await Promise.all([collectOpenClawActivity(8)]);
    const hermesSessions = collectHermesActivity(8);
    const memories = collectHermesMemories();
    const updates = collectAgentUpdates();
    let neo4jBridgeRunning = false;
    try {
      const healthResponse = await fetch('http://127.0.0.1:7575/memory/health', { signal: AbortSignal.timeout(3000) });
      const healthData = await healthResponse.json();
      neo4jBridgeRunning = healthResponse.ok && healthData?.neo4j === 'connected';
    } catch {}
    const allSessions = [...openclawSessions, ...hermesSessions]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 14);
    const graphNodes = new Map();
    const graphEdges = [];
    const addNode = (node) => { if (!graphNodes.has(node.id)) graphNodes.set(node.id, node); };
    const addEdge = (source, target, relation) => graphEdges.push({ id: `${source}:${relation}:${target}`, source, target, relation });
    addNode({ id: 'platform-openclaw', type: 'platform', label: 'OpenClaw', detail: updates.openclaw.installed });
    addNode({ id: 'platform-hermes', type: 'platform', label: 'Hermes', detail: updates.hermes.installed });
    addNode({ id: 'memory-neo4j', type: 'database', label: 'Neo4j Memory', detail: neo4jBridgeRunning ? 'Conectado' : 'Degradado' });
    for (const session of allSessions) {
      const sessionId = `session-${session.source}-${session.id}`;
      addNode({ id: sessionId, type: 'session', label: session.title.slice(0, 54), detail: session.summary, source: session.source, updatedAt: session.updatedAt });
      addEdge(`platform-${session.source}`, sessionId, 'session');
      if (session.model) {
        const modelId = `model-${session.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        addNode({ id: modelId, type: 'model', label: session.model, detail: 'Modelo utilizado' });
        addEdge(sessionId, modelId, 'uses_model');
      }
      for (const tool of (session.tools || [])) {
        const toolId = `tool-${tool.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        addNode({ id: toolId, type: 'tool', label: tool, detail: 'Herramienta utilizada' });
        addEdge(sessionId, toolId, 'used_tool');
      }
    }
    for (const memory of memories) {
      addNode({ id: memory.id, type: 'memory', label: memory.title, detail: memory.summary });
      addEdge('platform-hermes', memory.id, 'remembers');
      addEdge(memory.id, 'memory-neo4j', 'indexed_in');
    }
    sendJson(res, 200, {
      ok: true,
      updates,
      sessions: allSessions,
      memory: { items: memories, count: memories.length, neo4jBridgeRunning },
      graph: { nodes: [...graphNodes.values()], edges: graphEdges },
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  if (u.pathname === '/api/service-action' && req.method === 'POST') {
    const cfg = await readOpenClawConfig();
    const body = await readJsonBody(req);
    const service = String(body?.service || '').trim();
    const action = String(body?.action || '').trim();
    const out = await performServiceAction(service, action, cfg);
    if (out.ok) invalidateStatusPayloadCache();
    const statusCode = out.ok ? 200 : 400;
    sendJson(res, statusCode, out);
    return;
  }

  if (u.pathname === '/api/model-mode' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const mode = String(body?.mode || '').trim();
    const out = await setModelMode(mode);
    sendJson(res, out.ok ? 200 : 400, out);
    return;
  }

  if (u.pathname === '/api/usage/reset' && req.method === 'POST') {
    const cfg = await readOpenClawConfig();
    const snapshot = await fetchOpenRouterCredits(cfg);
    const payload = await writeUsageResetState(Date.now(), snapshot.ok ? snapshot : null);
    sendJson(res, 200, { ok: true, ...payload, openrouterSnapshot: snapshot });
    return;
  }

  if (u.pathname === '/api/apple/notify' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = String(body?.target || '').trim();
    const message = String(body?.message || '').trim();
    if (!/^notify\.[a-zA-Z0-9_]+$/.test(target)) {
      sendJson(res, 400, { ok: false, message: 'Target inválido. Ejemplo: notify.mobile_app_iphone' });
      return;
    }
    if (!message) {
      sendJson(res, 400, { ok: false, message: 'Mensaje vacío' });
      return;
    }
    const service = target.split('.')[1];
    const out = await haApi(`/api/services/notify/${service}`, {
      method: 'POST',
      body: { message },
    });
    if (!out.ok) {
      sendJson(res, 500, { ok: false, message: out.error || 'No se pudo enviar' });
      return;
    }
    sendJson(res, 200, { ok: true, message: `Enviado a ${target}` });
    return;
  }

  if (u.pathname === '/api/vacuum/action' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const entityId = String(body?.entityId || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    const segmentIdsInput = Array.isArray(body?.segmentIds) ? body.segmentIds : [];

    if (!entityId || !entityId.startsWith('vacuum.')) {
      sendJson(res, 400, { ok: false, message: 'entityId inválido (esperado vacuum.*)' });
      return;
    }

    const actionMap = {
      start: 'start',
      pause: 'pause',
      stop: 'stop',
      dock: 'return_to_base',
      locate: 'locate',
    };

    if (action === 'clean_zone') {
      const segmentIds = segmentIdsInput
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (!segmentIds.length) {
        sendJson(res, 400, { ok: false, message: 'segmentIds vacío para clean_zone' });
        return;
      }
      const out = await haApi('/api/services/xiaomi_miot/send_command?return_response', {
        method: 'POST',
        body: {
          entity_id: entityId,
          method: 'app_segment_clean',
          params: [{ segments: segmentIds, repeat: 1 }],
        },
      });
      const sr = out?.data?.service_response;
      if (!out.ok || sr?.error) {
        sendJson(res, 500, {
          ok: false,
          message: sr?.error || out.error || 'No se pudo ejecutar clean_zone',
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        message: `Limpieza por zona enviada (${segmentIds.join(', ')})`,
      });
      return;
    }

    const service = actionMap[action];
    if (!service) {
      sendJson(res, 400, { ok: false, message: `Acción inválida: ${action}` });
      return;
    }

    const out = await haApi(`/api/services/vacuum/${service}`, {
      method: 'POST',
      body: { entity_id: entityId },
    });
    if (!out.ok) {
      sendJson(res, 500, { ok: false, message: out.error || `No se pudo ejecutar ${action}` });
      return;
    }
    sendJson(res, 200, { ok: true, message: `Acción ${action} enviada` });
    return;
  }

  // ── Workroom API ──────────────────────────────────────────────────────────
  if (u.pathname === '/api/workroom/send' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const deskId = String(body?.deskId || '').trim().toLowerCase();
    const message = String(body?.message || '').trim();

    if (!WORKROOM_DESKS.includes(deskId) || !message) {
      sendJson(res, 400, { ok: false, message: 'deskId o mensaje inválido' });
      return;
    }
    const session = WORKROOM_SESSIONS[deskId];
    if (session.busy) {
      sendJson(res, 409, { ok: false, busy: true, message: 'Agente ocupado, espera la respuesta anterior.' });
      return;
    }
    session.messages.push({ role: 'user', text: message, ts: Date.now() });
    session.busy = true;
    // Dispatch without awaiting so HTTP response returns immediately
    dispatchAgentMessage(deskId, message).catch(() => {});
    sendJson(res, 202, { ok: true, pending: true });
    return;
  }

  if (u.pathname === '/api/workroom/history' && req.method === 'GET') {
    const payload = {};
    for (const id of WORKROOM_DESKS) {
      const s = WORKROOM_SESSIONS[id];
      payload[id] = { messages: s.messages, busy: s.busy, sessionId: s.sessionId };
    }
    sendJson(res, 200, payload);
    return;
  }

  if (u.pathname === '/api/workroom/clear' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const deskId = String(body?.deskId || '').trim().toLowerCase();
    if (!WORKROOM_DESKS.includes(deskId)) {
      sendJson(res, 400, { ok: false, message: 'deskId inválido' });
      return;
    }
    const session = WORKROOM_SESSIONS[deskId];
    session.messages = [];
    session.busy = false;
    // New session ID so the next message starts a fresh agent context
    session.sessionId = `wr_${deskId}_${Date.now()}`;
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Cronjob management endpoints (implement-cronjob-management) ──────────────
  if (u.pathname === '/api/crons' && req.method === 'GET') {
    const cfg = await readOpenClawConfig();
    const result = await getCronJobs(cfg);
    sendJson(res, 200, result);
    return;
  }

  const cronIdMatch = u.pathname.match(/^\/api\/crons\/([^/]+)\/(pause|resume|extend)$/);
  if (cronIdMatch && req.method === 'POST') {
    const [, cronId, action] = cronIdMatch;
    const cfg = await readOpenClawConfig();
    const token = cfg?.gateway?.auth?.token;
    const gatewayUrl = resolveGatewayUrl(cfg);
    if (!token) { sendJson(res, 400, { ok: false, message: 'Token de gateway no disponible' }); return; }
    if (action === 'extend') {
      const body = await readJsonBody(req);
      const delayMs = Number(body?.delayMs || 3600000);
      // Pause then schedule a one-time resume: best-effort via CLI flags
      const out = runShell(`"${OPENCLAW_BIN}" cron pause ${cronId} --url ${gatewayUrl} --json`, 15000);
      sendJson(res, 200, { ok: out.ok, message: out.ok ? `Job pausado ${delayMs}ms` : out.output });
    } else {
      const subcmd = action === 'pause' ? 'pause' : 'resume';
      const out = runShell(`"${OPENCLAW_BIN}" cron ${subcmd} ${cronId} --url ${gatewayUrl} --json`, 15000);
      const parsed = safeJsonParse(out.output, {});
      sendJson(res, out.ok ? 200 : 500, { ok: out.ok, ...parsed });
    }
    return;
  }

  const cronDeleteMatch = u.pathname.match(/^\/api\/crons\/([^/]+)$/);
  if (cronDeleteMatch && req.method === 'DELETE') {
    const [, cronId] = cronDeleteMatch;
    const cfg = await readOpenClawConfig();
    const gatewayUrl = resolveGatewayUrl(cfg);
    const out = runShell(`"${OPENCLAW_BIN}" cron delete ${cronId} --url ${gatewayUrl} --json`, 15000);
    const parsed = safeJsonParse(out.output, {});
    sendJson(res, out.ok ? 200 : 500, { ok: out.ok, ...parsed });
    return;
  }

  // ── Prompt audit endpoints (implement-prompt-audit-approval) ─────────────────
  if (u.pathname === '/api/audit/log' && req.method === 'GET') {
    const limit = Number(u.searchParams.get('limit') || 50);
    const criticality = u.searchParams.get('criticality') || '';
    const entries = readAuditLog(limit, criticality);
    sendJson(res, 200, { ok: true, entries });
    return;
  }

  if (u.pathname === '/api/audit/pending' && req.method === 'GET') {
    const entries = readAuditLog(100).filter((e) => ['CRITICAL', 'HIGH'].includes(e.criticality) && e.status === 'logged');
    sendJson(res, 200, { ok: true, entries });
    return;
  }

  if (u.pathname === '/api/audit/approve' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const id = String(body?.id || '').trim();
    if (!id) { sendJson(res, 400, { ok: false, message: 'id requerido' }); return; }
    updateAuditEntry(id, { status: 'approved', approvedBy: 'dashboard', approvedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (u.pathname === '/api/audit/deny' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const id = String(body?.id || '').trim();
    if (!id) { sendJson(res, 400, { ok: false, message: 'id requerido' }); return; }
    updateAuditEntry(id, { status: 'denied', deniedBy: 'dashboard', deniedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Autonomous agent endpoints ──────────────────────────────────────────────
  if (u.pathname === '/api/autonomous/start' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const goal = String(body?.goal || '').trim();
    const model = String(body?.model || 'openrouter/minimax/minimax-m2.7').trim();
    const maxIterations = Math.min(50, Math.max(5, Number(body?.maxIterations || 15)));
    const riskLevel = ['LOW', 'MEDIUM'].includes(String(body?.riskLevel || '').toUpperCase())
      ? String(body.riskLevel).toUpperCase() : 'MEDIUM';
    if (!goal) { sendJson(res, 400, { ok: false, message: 'goal requerido' }); return; }
    // Pick a different verifier model
    // Pick a different verifier model so thinker and verifier don't echo each other
    const verifierModel = model.includes('minimax')
      ? 'openrouter/moonshotai/kimi-k2.5'
      : model.includes('kimi')
        ? 'openrouter/minimax/minimax-m2.7'
        : model.includes('gemini') || model.includes('google')
          ? 'openrouter/minimax/minimax-m2.7'
          : 'openrouter/moonshotai/kimi-k2.5';
    const sessionId = createAutoSession({ goal, model, verifierModel, maxIterations, riskLevel });
    startAutoLoop(sessionId);
    sendJson(res, 202, { ok: true, sessionId, verifierModel });
    return;
  }

  if (u.pathname === '/api/autonomous/stop' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const sessionId = String(body?.sessionId || '').trim();
    if (!sessionId) { sendJson(res, 400, { ok: false, message: 'sessionId requerido' }); return; }
    stopAutoLoop(sessionId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (u.pathname === '/api/autonomous/pause' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const sessionId = String(body?.sessionId || '').trim();
    if (!sessionId) { sendJson(res, 400, { ok: false, message: 'sessionId requerido' }); return; }
    pauseAutoLoop(sessionId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (u.pathname === '/api/autonomous/status' && req.method === 'GET') {
    const sessionId = u.searchParams.get('sessionId') || '';
    const activeMap = getActiveLoops();
    const activeIds = Object.keys(activeMap);
    const sid = sessionId || activeIds[0] || null;
    const session = sid ? getAutoSession(sid) : null;
    const lastSteps = sid ? listAutoSteps(sid, 10).slice(-10) : [];
    sendJson(res, 200, { ok: true, session, lastSteps, activeLoops: activeMap, activeCount: activeIds.length });
    return;
  }

  if (u.pathname === '/api/autonomous/history' && req.method === 'GET') {
    const page = Math.max(0, Number(u.searchParams.get('page') || 0));
    const limit = Math.min(50, Math.max(1, Number(u.searchParams.get('limit') || 20)));
    const { sessions, total } = listAutoSessions(page, limit);
    sendJson(res, 200, { ok: true, sessions, total, page, limit });
    return;
  }

  if (u.pathname === '/api/autonomous/steps' && req.method === 'GET') {
    const sessionId = u.searchParams.get('sessionId') || '';
    if (!sessionId) { sendJson(res, 400, { ok: false, message: 'sessionId requerido' }); return; }
    const steps = listAutoSteps(sessionId);
    sendJson(res, 200, { ok: true, steps });
    return;
  }

  if (u.pathname === '/api/autonomous/stream' && req.method === 'GET') {
    const sessionId = u.searchParams.get('sessionId') || '';
    if (!sessionId) { res.writeHead(400); res.end('sessionId required'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
    subscribeAutoSSE(sessionId, res);
    req.on('close', () => unsubscribeAutoSSE(sessionId, res));
    return;
  }

  // ── Multi-Agent: agents, sessions, subagents, spawn ──────────────────────────
  if (u.pathname === '/api/multiagent/agents' && req.method === 'GET') {
    const out = runShell(`"${OPENCLAW_BIN}" agents list --json`, 10000);
    const agents = safeJsonParse(out.output, []);
    const b = runShell(`"${OPENCLAW_BIN}" agents bindings --json`, 8000);
    const bindings = safeJsonParse(b.output, []);
    sendJson(res, 200, { ok: true, agents: Array.isArray(agents) ? agents : [], bindings: Array.isArray(bindings) ? bindings : [] });
    return;
  }

  if (u.pathname === '/api/multiagent/sessions' && req.method === 'GET') {
    const agentId = u.searchParams.get('agentId') || '';
    const limit = Math.min(50, Number(u.searchParams.get('limit') || 20));
    const sessionsDir = path.join(process.env.HOME || '', '.openclaw', 'agents');
    const sessions = [];
    try {
      if (fs.existsSync(sessionsDir)) {
        const agentDirs = fs.readdirSync(sessionsDir).filter(Boolean);
        for (const aid of agentDirs) {
          if (agentId && aid !== agentId) continue;
          const sessDir = path.join(sessionsDir, aid, 'sessions');
          if (!fs.existsSync(sessDir)) continue;
          const files = fs.readdirSync(sessDir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => ({ f, mtime: fs.statSync(path.join(sessDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, limit)
            .map(({ f }) => f);
          for (const file of files) {
            try {
              const lines = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n').filter(Boolean);
              const first = safeJsonParse(lines[0], {});
              const last = safeJsonParse(lines[lines.length - 1], {});
              const sessionId = file.replace('.jsonl', '');
              sessions.push({
                agentId: aid,
                sessionId,
                sessionKey: first?.sessionKey || sessionId,
                turns: lines.length,
                createdAt: first?.ts || first?.timestamp || null,
                updatedAt: last?.ts || last?.timestamp || null,
                model: first?.model || null,
              });
            } catch { /* skip unreadable */ }
          }
        }
      }
    } catch { /* ignore */ }
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    sendJson(res, 200, { ok: true, sessions: sessions.slice(0, limit) });
    return;
  }

  if (u.pathname === '/api/multiagent/spawn' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const task = String(body?.task || '').trim();
    const agentId = String(body?.agentId || 'main').trim();
    const model = String(body?.model || '').trim();
    const thinking = String(body?.thinking || 'low').trim();
    if (!task) { sendJson(res, 400, { ok: false, message: 'task requerido' }); return; }
    const sessionId = `spawn_${Date.now()}`;
    const modelFlag = model ? `--model "${model}"` : '';
    const thinkingFlag = `--thinking ${thinking}`;
    const cmd = `"${OPENCLAW_BIN}" agent --agent ${agentId} --session-id ${sessionId} --message "$SPAWN_TASK" ${modelFlag} ${thinkingFlag} --json`;
    runShellAsync(cmd, { ...buildSafeEnv(), SPAWN_TASK: task }, 300000)
      .then((out) => console.log(`[spawn] session=${sessionId} ok=${out.ok}`))
      .catch((e) => console.error(`[spawn] session=${sessionId}`, e.message));
    sendJson(res, 202, { ok: true, sessionId, agentId, pending: true, message: 'Sub-agente lanzado' });
    return;
  }

  if (u.pathname === '/api/multiagent/config' && req.method === 'GET') {
    const cfg = await readOpenClawConfig();
    sendJson(res, 200, {
      ok: true,
      agentToAgentEnabled: cfg?.tools?.agentToAgent?.enabled || false,
      maxSpawnDepth: cfg?.agents?.defaults?.subagents?.maxSpawnDepth ?? 1,
      sessionVisibility: cfg?.tools?.sessions?.visibility || 'tree',
      maxPingPongTurns: cfg?.session?.agentToAgent?.maxPingPongTurns ?? 5,
      threadBindingsEnabled: cfg?.session?.threadBindings?.enabled || false,
      acpEnabled: cfg?.acp?.enabled || false,
    });
    return;
  }

  if (u.pathname === '/api/multiagent/config' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const changes = [];
    if (typeof body.agentToAgentEnabled === 'boolean') {
      const out = runShell(`"${OPENCLAW_BIN}" config set tools.agentToAgent.enabled ${body.agentToAgentEnabled} --json`, 8000);
      changes.push({ key: 'tools.agentToAgent.enabled', ok: out.ok });
    }
    if (typeof body.maxSpawnDepth === 'number') {
      const depth = Math.min(5, Math.max(1, body.maxSpawnDepth));
      const out = runShell(`"${OPENCLAW_BIN}" config set agents.defaults.subagents.maxSpawnDepth ${depth} --json`, 8000);
      changes.push({ key: 'agents.defaults.subagents.maxSpawnDepth', ok: out.ok });
    }
    sendJson(res, 200, { ok: true, changes });
    return;
  }

  // ── Neo4j Memory Bridge proxy ─────────────────────────────────────────────────
  const NEO4J_BRIDGE_PORT = Number(process.env.NEO4J_BRIDGE_PORT || 7575);
  const NEO4J_BRIDGE_URL = `http://127.0.0.1:${NEO4J_BRIDGE_PORT}`;

  if (u.pathname === '/api/neo4j/health' && req.method === 'GET') {
    try {
      const r = await fetch(`${NEO4J_BRIDGE_URL}/memory/health`, { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      const healthy = r.ok && !data?.detail && data?.neo4j !== 'error';
      sendJson(res, 200, { ok: healthy, ...data });
    } catch (e) {
      sendJson(res, 200, { ok: false, error: 'Bridge no disponible', detail: e.message });
    }
    return;
  }

  if (u.pathname === '/api/neo4j/stats' && req.method === 'GET') {
    try {
      const r = await fetch(`${NEO4J_BRIDGE_URL}/memory/stats`, { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      const healthy = r.ok && !data?.detail && !data?.error;
      sendJson(res, 200, { ok: healthy, ...data });
    } catch (e) {
      sendJson(res, 200, { ok: false, error: 'Bridge no disponible' });
    }
    return;
  }

  if (u.pathname === '/api/neo4j/recall' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body);
      const r = await fetch(`${NEO4J_BRIDGE_URL}/memory/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsed.query || '', limit: parsed.limit || 5 }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      sendJson(res, 200, { ok: true, ...data });
    } catch (e) {
      sendJson(res, 200, { ok: false, error: e.message });
    }
    return;
  }

  if (u.pathname === '/api/neo4j/store' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body);
      const r = await fetch(`${NEO4J_BRIDGE_URL}/memory/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      sendJson(res, 200, { ok: true, ...data });
    } catch (e) {
      sendJson(res, 200, { ok: false, error: e.message });
    }
    return;
  }

  if (u.pathname === '/api/neo4j/query' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body);
      const r = await fetch(`${NEO4J_BRIDGE_URL}/memory/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cypher: parsed.cypher || '', params: parsed.params, limit: parsed.limit || 25 }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      sendJson(res, 200, { ok: true, ...data });
    } catch (e) {
      sendJson(res, 200, { ok: false, error: e.message });
    }
    return;
  }

  // ── Skills list ───────────────────────────────────────────────────────────────
  if (u.pathname === '/api/skills/list' && req.method === 'GET') {
    const skills = readClaudeSkills();
    sendJson(res, 200, { ok: true, skills, dir: CLAUDE_SKILLS_DIR });
    return;
  }

  // ── Model capabilities + skill matching ──────────────────────────────────────
  if (u.pathname === '/api/models/capabilities' && req.method === 'GET') {
    const cfg = await readOpenClawConfig();
    const skills = readClaudeSkills();
    const primary = String(cfg?.agents?.defaults?.model?.primary || '');
    const fallbacks = Array.isArray(cfg?.agents?.defaults?.model?.fallbacks) ? cfg.agents.defaults.model.fallbacks : [];
    const providers = cfg?.models?.providers || {};
    const models = [];
    for (const [provider, providerConfig] of Object.entries(providers)) {
      for (const configured of (providerConfig?.models || [])) {
        const fullId = `${provider}/${configured.id}`;
        const caps = getModelCapabilities(configured.id);
        const matchedSkills = skills.filter((skill) => caps.bestFor.includes(skill.id) || skill.tags.some((tag) => caps.caps.includes(tag)))
          .map((skill) => ({ id: skill.id, name: skill.name, description: skill.description.slice(0, 80) }));
        models.push({
          id: fullId,
          name: configured.name || configured.id,
          provider,
          api: configured.api || providerConfig.api || '',
          reasoning: Boolean(configured.reasoning),
          input: configured.input || ['text'],
          contextWindow: Number(configured.contextWindow || 0),
          maxTokens: Number(configured.maxTokens || 0),
          cost: configured.cost || {},
          caps: caps.caps,
          badge: caps.badge,
          description: caps.description,
          strengths: caps.strengths,
          matchedSkills,
          active: fullId === primary,
          fallback: fallbacks.includes(fullId),
          isCloud: provider !== 'ollama' && !String(providerConfig.baseUrl || '').includes('127.0.0.1'),
        });
      }
    }
    if (primary && !models.some((model) => model.id === primary)) {
      const [provider, ...modelParts] = primary.split('/');
      const modelId = modelParts.join('/');
      const caps = getModelCapabilities(modelId);
      models.unshift({
        id: primary, name: modelId || primary, provider, api: providers?.[provider]?.api || '',
        reasoning: true, input: ['text'], contextWindow: 0, maxTokens: 0, cost: {},
        caps: caps.caps, badge: caps.badge, description: caps.description, strengths: caps.strengths,
        matchedSkills: [], active: true, fallback: false,
        isCloud: provider !== 'ollama',
      });
    }
    const hermesConfigPath = path.join(HERMES_HOME, 'config.yaml');
    try {
      const hermesConfig = fs.readFileSync(hermesConfigPath, 'utf8');
      const defaultModel = hermesConfig.match(/^model:\s*\n\s+default:\s*(.+)$/m)?.[1]?.trim();
      const provider = hermesConfig.match(/^model:\s*\n(?:.*\n){0,3}?\s+provider:\s*(.+)$/m)?.[1]?.trim() || 'hermes';
      const id = `hermes/${provider}/${defaultModel}`;
      if (defaultModel && !models.some((model) => model.id === id)) {
        const caps = getModelCapabilities(defaultModel);
        models.push({ id, name: `${defaultModel} (Hermes)`, provider: `Hermes · ${provider}`, api: 'hermes-agent', reasoning: true, input: ['text'], contextWindow: 0, maxTokens: 0, cost: {}, caps: caps.caps, badge: caps.badge, description: caps.description, strengths: caps.strengths, matchedSkills: [], active: true, fallback: false, isCloud: true });
      }
    } catch {}
    sendJson(res, 200, { ok: true, models, skills, primary, fallbacks, providers: Object.keys(providers) });
    return;
  }

  // ── Local models: Ollama + hardware compatibility ─────────────────────────────
  if (u.pathname === '/api/models/local' && req.method === 'GET') {
    const [tagsData, psData] = await Promise.all([
      fetchOllamaJson('/api/tags'),
      fetchOllamaJson('/api/ps'),
    ]);
    const ollamaRunning = tagsData !== null;
    const ollamaModelsPath = path.join(process.env.HOME || '', '.ollama', 'models');
    let storage = { path: ollamaModelsPath, available: fs.existsSync(ollamaModelsPath), external: false, target: '' };
    try {
      if (fs.lstatSync(ollamaModelsPath).isSymbolicLink()) {
        storage.external = true;
        storage.target = fs.readlinkSync(ollamaModelsPath);
        storage.available = fs.existsSync(ollamaModelsPath);
      }
    } catch {}
    const installedModels = (tagsData?.models || []).map((m) => {
      const sizeGb = parseFloat((m.size / 1_073_741_824).toFixed(2));
      const ramReq = modelRamRequirementGb(m.name);
      return {
        name: m.name,
        sizeGb,
        modifiedAt: m.modified_at,
        digest: (m.digest || '').slice(0, 12),
        family: m.details?.family || '',
        parameterSize: m.details?.parameter_size || '',
        quantization: m.details?.quantization_level || '',
        ramRequiredGb: ramReq,
      };
    });
    const runningModels = (psData?.models || []).map((m) => ({
      name: m.name,
      sizeVram: parseFloat((m.size_vram / 1_073_741_824).toFixed(2)),
      expiresAt: m.expires_at,
    }));
    // System hardware info
    let totalRamGb = null;
    let cpuBrand = '';
    try {
      totalRamGb = Math.round(Number(execSync('sysctl -n hw.memsize', { timeout: 2000 }).toString().trim()) / 1_073_741_824);
    } catch { /* ignore */ }
    try {
      cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { timeout: 2000 }).toString().trim();
    } catch { /* ignore */ }
    // Disk usage: sum sizes reported by Ollama API (actual files may be in container/VM)
    const totalBytes = (tagsData?.models || []).reduce((sum, m) => sum + (m.size || 0), 0);
    const ollamaDiskGb = totalBytes > 0 ? `${(totalBytes / 1_073_741_824).toFixed(1)} GB` : '—';
    // Mark compatibility per model
    const modelsWithCompat = installedModels.map((m) => {
      let canRun = null;
      let warning = null;
      if (totalRamGb !== null && m.ramRequiredGb !== null) {
        const headroom = totalRamGb - m.ramRequiredGb;
        canRun = headroom >= 1;
        if (!canRun) warning = `Necesita ~${m.ramRequiredGb}GB, tienes ${totalRamGb}GB`;
        else if (headroom < 3) warning = `Ajustado (${headroom.toFixed(1)}GB libre tras carga)`;
      }
      const isLoaded = runningModels.some((r) => r.name === m.name);
      return { ...m, canRun, warning, isLoaded };
    });
    sendJson(res, 200, {
      ok: true,
      ollamaRunning,
      hardware: { totalRamGb, cpuBrand },
      ollamaDiskUsed: ollamaDiskGb,
      models: modelsWithCompat,
      runningModels,
      storage,
      diagnostic: !storage.available && storage.external
        ? `El volumen externo de modelos no está disponible: ${storage.target}`
        : !ollamaRunning ? 'Ollama está instalado pero no está ejecutándose' : installedModels.length === 0 ? 'Ollama está operativo, sin modelos descargados' : '',
    });
    return;
  }

  // ── OpenCode integration ───────────────────────────────────────────────────────
  if (u.pathname === '/api/opencode/status' && req.method === 'GET') {
    const isRunning = await checkPort('127.0.0.1', OPENCODE_PORT);
    let version = '';
    try {
      version = execSync(`"${OPENCODE_BIN}" --version 2>/dev/null || echo ""`, { timeout: 3000 }).toString().trim();
    } catch { /* ignore */ }
    // List recent sessions via opencode CLI
    let sessions = [];
    try {
      const out = runShell(`"${OPENCODE_BIN}" session list --json 2>/dev/null`, 8000);
      if (out.ok) sessions = safeJsonParse(out.output, []) || [];
    } catch { /* ignore */ }
    sendJson(res, 200, {
      ok: true,
      running: isRunning,
      port: OPENCODE_PORT,
      version,
      url: `http://127.0.0.1:${OPENCODE_PORT}`,
      sessions: Array.isArray(sessions) ? sessions.slice(0, 20) : [],
      projects: PROJECT_REPOS,
    });
    return;
  }

  if (u.pathname === '/api/opencode/start' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const projectPath = String(body?.projectPath || PROJECT_REPOS[0]?.path || '').trim();
    // Validate project path is in the allowed list
    const allowed = PROJECT_REPOS.map((p) => p.path);
    if (!allowed.includes(projectPath)) {
      sendJson(res, 400, { ok: false, message: 'Proyecto no permitido' });
      return;
    }
    const already = await checkPort('127.0.0.1', OPENCODE_PORT);
    if (already) {
      sendJson(res, 200, { ok: true, message: 'OpenCode ya está corriendo', url: `http://127.0.0.1:${OPENCODE_PORT}` });
      return;
    }
    const cmd = `nohup "${OPENCODE_BIN}" serve --port ${OPENCODE_PORT} --hostname 127.0.0.1 > /tmp/opencode-serve.log 2>&1 &`;
    const result = runShell(cmd);
    await new Promise((r) => setTimeout(r, 1500));
    const running = await checkPort('127.0.0.1', OPENCODE_PORT);
    sendJson(res, running ? 200 : 500, { ok: running, message: running ? 'OpenCode iniciado' : 'No pudo iniciar', url: `http://127.0.0.1:${OPENCODE_PORT}` });
    return;
  }

  if (u.pathname === '/api/opencode/stop' && req.method === 'POST') {
    runShell(`pkill -f "opencode serve" || pkill -f "opencode web" || true`);
    sendJson(res, 200, { ok: true, message: 'OpenCode detenido' });
    return;
  }

  if (u.pathname === '/api/opencode/logs' && req.method === 'GET') {
    let lines = [];
    try {
      const logPath = '/tmp/opencode-serve.log';
      if (fs.existsSync(logPath)) {
        lines = fs.readFileSync(logPath, 'utf8').split('\n').slice(-100).filter(Boolean);
      }
    } catch { /* ignore */ }
    sendJson(res, 200, { ok: true, lines });
    return;
  }

  // ── Imán: mapa persistente de agentes y capacidades ────────────────────────
  if (u.pathname === '/api/iman/map' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, ...getImanMap() });
    return;
  }

  if (u.pathname === '/api/iman/agents' && req.method === 'POST') {
    try {
      const id = createImanAgent(await readJsonBody(req));
      sendJson(res, 201, { ok: true, id, ...getImanMap() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (u.pathname === '/api/iman/select' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const activeAgentId = selectImanAgent(String(body?.agentId || ''));
      sendJson(res, 200, { ok: true, activeAgentId });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (u.pathname === '/api/iman/memory' && req.method === 'POST') {
    try {
      const id = addImanMemory(await readJsonBody(req));
      sendJson(res, 201, { ok: true, id, ...getImanMap() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (u.pathname === '/api/iman/recommend' && req.method === 'POST') {
    const body = await readJsonBody(req);
    sendJson(res, 200, { ok: true, ...recommendImanAgent(body?.task || '') });
    return;
  }

  if (u.pathname === '/app.js' || u.pathname === '/workroom.js') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  if (u.pathname.startsWith('/assets/')) {
    const relPath = u.pathname.slice(1);
    return staticFile(req, res, relPath, getMimeType(relPath));
  }

  if (u.pathname === '/styles.css') {
    const assetsDir = path.join(PUBLIC_DIR, 'assets');
    try {
      const files = fs.readdirSync(assetsDir);
      const cssFile = files.find(f => f.startsWith('index-') && f.endsWith('.css'));
      if (cssFile) {
        return staticFile(req, res, `assets/${cssFile}`, 'text/css; charset=utf-8');
      }
    } catch {}
    return staticFile(req, res, 'assets/index-BCeuojQC.css', 'text/css; charset=utf-8');
  }

  if (u.pathname === '/workroom' || u.pathname === '/workroom.html') {
    return staticFile(req, res, 'index.html', 'text/html; charset=utf-8');
  }

  if (u.pathname === '/' || u.pathname === '/index.html') {
    return staticFile(req, res, 'index.html', 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
});

// ── Prompt audit: scan openclaw logs periodically ────────────────────────────
const OPENCLAW_LOG_DIRS = [OPENCLAW_LOG_DIR, path.join(process.env.HOME || '', '.openclaw', 'logs')];
const _auditSeenLines = new Set();

async function scanLogsForAudit() {
  for (const dir of OPENCLAW_LOG_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }));
      files.sort((a, b) => b.mtime - a.mtime);
      for (const { file } of files.slice(0, 3)) { // solo los 3 más recientes
        try {
          const stat = fs.statSync(file);
          if (stat.size > 100 * 1024 * 1024) continue; // skip files > 100MB
          const content = fs.readFileSync(file, 'utf8');
          const lines = content.split('\n').slice(-200);
          for (const line of lines) {
            if (!line.trim() || _auditSeenLines.has(line)) continue;
            _auditSeenLines.add(line);
            const cls = classifyLine(line);
            if (cls) appendAuditEntry({ command: line.trim().slice(0, 300), ...cls });
          }
        } catch { /* archivo ilegible */ }
      }
      if (_auditSeenLines.size > 2000) {
        const arr = [..._auditSeenLines];
        arr.splice(0, arr.length - 1000).forEach((l) => _auditSeenLines.delete(l));
      }
    } catch { /* directorio ilegible */ }
  }
}

// Escanear logs cada 15s
setInterval(scanLogsForAudit, 15000);
scanLogsForAudit(); // primera vez al arrancar

initAutonomousDb(); // init autonomous agent SQLite DB
initImanDb(); // init persistent agent/capability graph

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Monitor UI en http://127.0.0.1:${PORT}`);
  ensureNeo4jBridge().then((ready) => {
    if (!ready) console.warn('[WARN] Neo4j memory bridge unavailable');
  }).catch((error) => console.warn(`[WARN] Neo4j bridge startup failed: ${error.message}`));
});
