#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, exec } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { getSecret } from './src/secrets.mjs';
import { buildSafeEnv } from './src/safe-env.mjs';
import { classifyLine, appendAuditEntry, readAuditLog, updateAuditEntry } from './src/prompt-auditor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = Number(process.env.MONITOR_UI_PORT || 18990);
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(process.env.HOME || '', '.openclaw', 'openclaw.json');
const OPENCLAW_LOG_DIR = '/tmp/openclaw';
const HA_URL = process.env.HA_URL || 'http://127.0.0.1:8123';
const ENV_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/Users/devjaime/Library/pnpm/openclaw';
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
const MODE_LOCAL_MODEL = process.env.MODE_LOCAL_MODEL || 'custom-127-0-0-1-11434/qwen2.5:7b';
const MODE_CLOUD_MODEL = process.env.MODE_CLOUD_MODEL || 'openrouter/minimax/minimax-m2.5';
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

function staticFile(res, relPath, contentType = 'text/plain; charset=utf-8') {
  const file = path.join(PUBLIC_DIR, relPath);
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const data = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
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
  // Inyectar token como variable global antes de cualquier script del cliente
  const tokenScript = `<script>window.DASHBOARD_TOKEN=${JSON.stringify(DASHBOARD_TOKEN || '')};</script>`;
  html = html.replace('</head>', `${tokenScript}\n</head>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
  const availableModels = [...modelMap.values()].sort((a, b) => String(a.model).localeCompare(String(b.model)));
  const modelModeGuess = modelPrimary === MODE_LOCAL_MODEL
    ? 'local'
    : modelPrimary === MODE_CLOUD_MODEL
      ? 'cloud'
      : modelPrimary.includes('gemini')
    ? 'dia (gemini)'
    : modelPrimary.includes('minimax') || modelPrimary.includes('MiniMax')
      ? 'potente (minmax)'
      : modelPrimary.includes('qwen') || modelPrimary.includes('custom-127-0-0-1-11434')
        ? 'noche/local (ollama)'
        : 'custom';
  const resources = collectResourceUsage(runtimePort);
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
    if (action === 'stop' || action === 'restart') {
      runShell(`pkill -9 -f 'openclaw gateway run --bind loopback --port ${port}' || true`);
    }
    if (action === 'start' || action === 'restart') {
      const authFlags = token ? `--auth token --token "${token}"` : '';
      const startCmd = `nohup "${OPENCLAW_BIN}" gateway run --bind loopback --port ${port} ${authFlags} --force > /tmp/openclaw-gateway.log 2>&1 &`;
      const started = runShell(startCmd);
      if (!started.ok) {
        return { ok: false, message: `No se pudo iniciar OpenClaw:\n${started.output}` };
      }
    }
    let running = false;
    for (let i = 0; i < 20; i += 1) {
      running = await checkPort('127.0.0.1', port);
      if (running) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    return {
      ok: true,
      message: `OpenClaw ${action} ejecutado`,
      running,
    };
  }

  const container = service;
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
    const payload = await buildStatus();
    sendJson(res, 200, payload);
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
    const currentVersionRaw = run(`"${OPENCLAW_BIN}" --version`);
    const currentVersion = isErr(currentVersionRaw) ? '' : String(currentVersionRaw || '').trim();
    const out = runShell(`"${OPENCLAW_BIN}" update status --json`, 20000);
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

  if (u.pathname === '/api/service-action' && req.method === 'POST') {
    const cfg = await readOpenClawConfig();
    const body = await readJsonBody(req);
    const service = String(body?.service || '').trim();
    const action = String(body?.action || '').trim();
    const out = await performServiceAction(service, action, cfg);
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

  if (u.pathname === '/app.js') {
    return staticFile(res, 'app.js', 'application/javascript; charset=utf-8');
  }
  if (u.pathname === '/workroom.js') {
    return staticFile(res, 'workroom.js', 'application/javascript; charset=utf-8');
  }
  if (u.pathname === '/styles.css') {
    return staticFile(res, 'styles.css', 'text/css; charset=utf-8');
  }
  if (u.pathname === '/workroom' || u.pathname === '/workroom.html') {
    return serveHtmlWithToken(res, 'workroom.html');
  }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return serveHtmlWithToken(res, 'index.html');
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
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => path.join(dir, f));
      for (const file of files.slice(-3)) { // solo los 3 más recientes
        try {
          const lines = fs.readFileSync(file, 'utf8').split('\n').slice(-200); // últimas 200 líneas
          for (const line of lines) {
            if (!line.trim() || _auditSeenLines.has(line)) continue;
            _auditSeenLines.add(line);
            const cls = classifyLine(line);
            if (cls) appendAuditEntry({ command: line.trim().slice(0, 300), ...cls });
          }
        } catch { /* archivo ilegible */ }
      }
      // Limitar el Set de vistos a 2000 entradas para no crecer indefinidamente
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Monitor UI en http://127.0.0.1:${PORT}`);
});
