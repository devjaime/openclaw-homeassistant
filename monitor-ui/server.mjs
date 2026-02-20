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
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const USD_CLP_RATE = Number(process.env.USD_CLP_RATE || 950);
const USAGE_LOOKBACK_DAYS = Number(process.env.USAGE_LOOKBACK_DAYS || 7);
const USAGE_MAX_FILES = Number(process.env.USAGE_MAX_FILES || 40);

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
};

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

  const raw = run(`openclaw cron list --url ${GATEWAY_URL} --token ${token} --json`);
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

async function collectUsageStats() {
  const now = Date.now();
  const minTs = now - USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
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
        usageByModel.set(key, { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
      }
      const acc = usageByModel.get(key);
      acc.calls += 1;
      acc.input += n(usage.input || usage.input_tokens);
      acc.output += n(usage.output || usage.output_tokens);
      acc.cacheRead += n(usage.cacheRead || usage.cache_read_tokens);
      acc.cacheWrite += n(usage.cacheWrite || usage.cache_write_tokens);
      acc.total = acc.input + acc.output + acc.cacheRead + acc.cacheWrite;

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
    const usd = estimateCostUsd(model, usage);
    return {
      model,
      usage,
      costUsd: usd,
      costClp: usd * USD_CLP_RATE,
      localEstimatedFree:
        model.startsWith('custom-127-0-0-1-11434/') || model.includes('/qwen') || model.includes('/deepseek'),
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
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, costUsd: 0, costClp: 0 },
  );

  return {
    lookbackDays: USAGE_LOOKBACK_DAYS,
    usdClpRate: USD_CLP_RATE,
    models: models.sort((a, b) => b.usage.total - a.usage.total),
    totals,
    daily,
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
  if (!wsUrl) return 'http://127.0.0.1:18789/';
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/?$/, '/');
}

function portFromGatewayUrl(wsUrl) {
  try {
    const u = new URL(wsUrl);
    if (u.port) return Number(u.port);
    return u.protocol === 'wss:' ? 443 : 80;
  } catch {
    return 18789;
  }
}

async function buildStatus() {
  const cfg = await readOpenClawConfig();
  const configuredPort = Number(cfg?.gateway?.port || 18789);
  const runtimePort = portFromGatewayUrl(GATEWAY_URL);
  const openclawListening = await checkPort('127.0.0.1', runtimePort);
  const haListening = await checkPort('127.0.0.1', 8123);
  const haProbe = await httpProbe(HA_URL);

  const openclawLogs = await getOpenClawLogTail(180);
  const haLogs = await getHomeAssistantLogTail(120);
  const cron = await getCronJobs(cfg);
  const usageStats = await collectUsageStats();
  const projectStats = await collectProjectStats();

  const errCount = openclawLogs.filter((l) => /\berror\b|failed|unauthorized|timeout/i.test(l)).length;
  const telegramEvents = openclawLogs.filter((l) => /telegram/i.test(l)).slice(-10);

  const modelPrimary = cfg?.agents?.defaults?.model?.primary || 'desconocido';
  const modelModeGuess = modelPrimary.includes('gemini')
    ? 'dia (gemini)'
    : modelPrimary.includes('minimax') || modelPrimary.includes('MiniMax')
      ? 'potente (minmax)'
      : modelPrimary.includes('qwen') || modelPrimary.includes('custom-127-0-0-1-11434')
        ? 'noche/local (ollama)'
        : 'custom';

  return {
    nowIso: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    openclaw: {
      configPath: OPENCLAW_CONFIG,
      gatewayUrl: GATEWAY_URL,
      dashboardUrl: toDashboardHttp(GATEWAY_URL),
      port: runtimePort,
      configuredPort,
      listening: openclawListening,
      modelPrimary,
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
    projects: projectStats,
    logs: {
      openclaw: openclawLogs.slice(-120),
      homeassistant: haLogs.slice(-120),
    },
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

  if (u.pathname === '/app.js') {
    return staticFile(res, 'app.js', 'application/javascript; charset=utf-8');
  }
  if (u.pathname === '/styles.css') {
    return staticFile(res, 'styles.css', 'text/css; charset=utf-8');
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
