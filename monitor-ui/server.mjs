#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import net from 'node:net';

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

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, encoding: 'utf8' }).trim();
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
  const raw = run(`openclaw cron list --url ${gatewayUrl} --token ${token} --json`);
  if (isErr(raw)) {
    return { ok: false, error: raw.replace('__ERR__ ', ''), jobs: [] };
  }
  const parsed = safeJsonParse(raw, {});
  const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
  const compact = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    enabled: Boolean(j.enabled),
    expr: j?.schedule?.expr || j?.cron?.expr || '',
    tz: j?.schedule?.tz || j?.cron?.tz || '',
    nextRunAtMs: j?.state?.nextRunAtMs || null,
  }));
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

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (u.pathname === '/api/status') {
    const payload = await buildStatus();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (u.pathname === '/api/gateway-auth') {
    const cfg = await readOpenClawConfig();
    const gatewayUrl = resolveGatewayUrl(cfg);
    const token = String(cfg?.gateway?.auth?.token || '').trim();
    if (!token) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, message: 'Token de gateway no configurado' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, gatewayUrl, token }));
    return;
  }

  if (u.pathname === '/api/update-status') {
    const currentVersionRaw = run(`"${OPENCLAW_BIN}" --version`);
    const currentVersion = isErr(currentVersionRaw) ? '' : String(currentVersionRaw || '').trim();
    const out = runShell(`"${OPENCLAW_BIN}" update status --json`, 20000);
    if (!out.ok) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, message: 'No se pudo consultar update status' }));
      return;
    }
    const parsed = extractTrailingJsonObject(out.output);
    if (!parsed) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, message: 'Salida no parseable de update status' }));
      return;
    }
    const installed = String(currentVersion || parsed?.update?.currentVersion || '').trim();
    const latest = String(parsed?.availability?.latestVersion || parsed?.update?.registry?.latestVersion || '').trim();
    const available = Boolean(parsed?.availability?.available);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      available,
      installed: installed || (available ? '' : latest),
      latest: latest || installed,
      channel: parsed?.channel?.label || 'stable',
    }));
    return;
  }

  if (u.pathname === '/api/openclaw') {
    const data = await getOpenClawLogTail(300);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ lines: data }));
    return;
  }

  if (u.pathname === '/api/homeassistant') {
    const data = await getHomeAssistantLogTail(300);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ lines: data }));
    return;
  }

  if (u.pathname === '/api/service-action' && req.method === 'POST') {
    const cfg = await readOpenClawConfig();
    const body = await readJsonBody(req);
    const service = String(body?.service || '').trim();
    const action = String(body?.action || '').trim();
    const out = await performServiceAction(service, action, cfg);
    const statusCode = out.ok ? 200 : 400;
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(out));
    return;
  }

  if (u.pathname === '/api/model-mode' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const mode = String(body?.mode || '').trim();
    const out = await setModelMode(mode);
    res.writeHead(out.ok ? 200 : 400, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(out));
    return;
  }

  if (u.pathname === '/api/usage/reset' && req.method === 'POST') {
    const cfg = await readOpenClawConfig();
    const snapshot = await fetchOpenRouterCredits(cfg);
    const payload = await writeUsageResetState(Date.now(), snapshot.ok ? snapshot : null);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, ...payload, openrouterSnapshot: snapshot }));
    return;
  }

  if (u.pathname === '/api/apple/notify' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = String(body?.target || '').trim();
    const message = String(body?.message || '').trim();
    if (!/^notify\.[a-zA-Z0-9_]+$/.test(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'Target inválido. Ejemplo: notify.mobile_app_iphone' }));
      return;
    }
    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'Mensaje vacío' }));
      return;
    }
    const service = target.split('.')[1];
    const out = await haApi(`/api/services/notify/${service}`, {
      method: 'POST',
      body: { message },
    });
    if (!out.ok) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: out.error || 'No se pudo enviar' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: `Enviado a ${target}` }));
    return;
  }

  if (u.pathname === '/api/vacuum/action' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const entityId = String(body?.entityId || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    const segmentIdsInput = Array.isArray(body?.segmentIds) ? body.segmentIds : [];

    if (!entityId || !entityId.startsWith('vacuum.')) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'entityId inválido (esperado vacuum.*)' }));
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
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'segmentIds vacío para clean_zone' }));
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
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          message: sr?.error || out.error || 'No se pudo ejecutar clean_zone',
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        message: `Limpieza por zona enviada (${segmentIds.join(', ')})`,
      }));
      return;
    }

    const service = actionMap[action];
    if (!service) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: `Acción inválida: ${action}` }));
      return;
    }

    const out = await haApi(`/api/services/vacuum/${service}`, {
      method: 'POST',
      body: { entity_id: entityId },
    });
    if (!out.ok) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: out.error || `No se pudo ejecutar ${action}` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: `Acción ${action} enviada` }));
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
    return staticFile(res, 'workroom.html', 'text/html; charset=utf-8');
  }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return staticFile(res, 'index.html', 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Monitor UI en http://127.0.0.1:${PORT}`);
});
