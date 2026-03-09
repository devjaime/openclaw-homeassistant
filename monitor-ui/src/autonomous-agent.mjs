/**
 * autonomous-agent.mjs
 * Self-regulating autonomous agent loop with SQLite persistence and SSE broadcast.
 * Uses node:sqlite (Node 22.5+ built-in) — no external deps.
 */

import { DatabaseSync } from 'node:sqlite';
import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Config ──────────────────────────────────────────────────────────────────
const HOME = process.env.HOME || '';
const DB_PATH = path.join(HOME, '.openclaw', 'autonomous-agent.db');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/Users/devjaime/Library/pnpm/openclaw';
const WORKSPACE_ROOT = path.join(HOME, '.openclaw', 'workspace');
const HA_SCRIPT = path.join(HOME, '.openclaw', 'workspace', 'projects', 'homeassistant', 'ha.sh');
const RUNTIME_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].filter(Boolean).join(':');

// Shell commands allowed for the 'shell' action type
const SHELL_ALLOWLIST = /^(ls(\s|$)|cat\s+[^\s;|&]+$|head\s|tail\s|wc\s|echo\s|git\s+(status|log|diff|show)\b|node\s|jq\s|curl\s+-s\s+https?:\/\/)/;

// ── SQLite database ──────────────────────────────────────────────────────────
let _db = null;

export function initDb() {
  if (_db) return;
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      model TEXT NOT NULL,
      verifierModel TEXT NOT NULL,
      maxIterations INTEGER NOT NULL DEFAULT 15,
      riskLevel TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'idle',
      iteration INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      completedAt TEXT,
      errorMsg TEXT
    );
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      stepN INTEGER NOT NULL,
      phase TEXT NOT NULL,
      content TEXT NOT NULL,
      approved INTEGER,
      riskLevel TEXT,
      ts TEXT NOT NULL,
      FOREIGN KEY(sessionId) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(sessionId, stepN);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(createdAt DESC);
  `);
}

export function createSession({ goal, model, verifierModel, maxIterations, riskLevel }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  _db.prepare(
    `INSERT INTO sessions (id,goal,model,verifierModel,maxIterations,riskLevel,status,iteration,createdAt)
     VALUES (?,?,?,?,?,?,'idle',0,?)`
  ).run(id, goal, model, verifierModel, maxIterations, riskLevel, now);
  return id;
}

export function getSession(id) {
  return _db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
}

export function listSessions(page = 0, limit = 20) {
  const offset = page * limit;
  const rows = _db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
  const { total } = _db.prepare('SELECT COUNT(*) as total FROM sessions').get();
  return { sessions: rows, total };
}

export function appendStep(sessionId, stepN, phase, content, { approved = null, riskLevel = null } = {}) {
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  _db.prepare(
    `INSERT INTO steps (id,sessionId,stepN,phase,content,approved,riskLevel,ts) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, sessionId, stepN, phase, contentStr, approved === null ? null : (approved ? 1 : 0), riskLevel, ts);
  return { id, sessionId, stepN, phase, content, approved, riskLevel, ts };
}

export function listSteps(sessionId, limit = 100) {
  const rows = _db.prepare('SELECT * FROM steps WHERE sessionId = ? ORDER BY stepN ASC, ts ASC LIMIT ?').all(sessionId, limit);
  return rows.map(r => ({ ...r, content: safeJsonParse(r.content), approved: r.approved === null ? null : Boolean(r.approved) }));
}

export function updateSession(id, updates) {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
  const vals = [...Object.values(updates), id];
  _db.prepare(`UPDATE sessions SET ${sets} WHERE id = ?`).run(...vals);
}

// ── In-memory runtime state ──────────────────────────────────────────────────
/** @type {Map<string, { status: string, iteration: number, abortSignal: boolean, pauseSignal: boolean, sseClients: Set<any> }>} */
const activeLoops = new Map();

export function getActiveLoops() {
  const out = {};
  for (const [id, s] of activeLoops) out[id] = { status: s.status, iteration: s.iteration };
  return out;
}

export function stopLoop(sessionId) {
  const loop = activeLoops.get(sessionId);
  if (loop) loop.abortSignal = true;
}

export function pauseLoop(sessionId) {
  const loop = activeLoops.get(sessionId);
  if (loop) loop.pauseSignal = true;
}

export function subscribeSSE(sessionId, res) {
  let loop = activeLoops.get(sessionId);
  if (!loop) {
    // Allow subscribing to completed sessions to receive final state
    loop = { status: 'completed', iteration: 0, abortSignal: true, pauseSignal: false, sseClients: new Set() };
    activeLoops.set(sessionId, loop);
  }
  loop.sseClients.add(res);
}

export function unsubscribeSSE(sessionId, res) {
  activeLoops.get(sessionId)?.sseClients.delete(res);
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────
function broadcastSse(sessionId, payload) {
  const loop = activeLoops.get(sessionId);
  if (!loop) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...loop.sseClients]) {
    try { client.write(data); } catch { loop.sseClients.delete(client); }
  }
}

// ── Shell helper ─────────────────────────────────────────────────────────────
function shellAsync(cmd, extraEnv = {}, timeoutMs = 120000) {
  return new Promise((resolve) => {
    exec(cmd, {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      shell: '/bin/bash',
      env: { ...process.env, PATH: RUNTIME_PATH, ...extraEnv },
    }, (err, stdout, stderr) => {
      if (err) {
        const out = [stdout?.trim(), stderr?.trim(), String(err?.message || '')].filter(Boolean).join('\n');
        resolve({ ok: false, output: out });
      } else {
        resolve({ ok: true, output: (stdout || '').trim() });
      }
    });
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────
function safeJsonParse(text, fallback = null) {
  try {
    if (typeof text !== 'string') return text;
    // Extract first JSON object from potentially verbose text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    return JSON.parse(text);
  } catch { return fallback; }
}

function sanitizePath(p) {
  const resolved = path.resolve(p.startsWith('~') ? p.replace('~', HOME) : p);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Path outside workspace: ${resolved}`);
  }
  return resolved;
}

function truncate(s, max = 800) {
  if (typeof s !== 'string') s = JSON.stringify(s) || '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function buildSafeEnv() {
  const WHITELIST = ['PATH', 'HOME', 'TERM', 'LANG', 'LC_ALL', 'NODE_ENV', 'TMPDIR', 'USER', 'LOGNAME'];
  const safe = { PATH: RUNTIME_PATH };
  for (const key of WHITELIST) {
    if (process.env[key] !== undefined) safe[key] = process.env[key];
  }
  return safe;
}

// ── Action execution router ──────────────────────────────────────────────────
async function executeAction(action, sessionId) {
  const type = (action.type || '').toLowerCase();

  if (type === 'web_search' || type === 'browse') {
    const query = action.query || action.url || '';
    const msg = `Busca en internet y responde: ${query}. Responde con los hallazgos más relevantes en texto plano.`;
    return shellAsync(
      `"${OPENCLAW_BIN}" agent --session-id autono_web_${sessionId} --message "$AA_CMD" --json`,
      { ...buildSafeEnv(), AA_CMD: msg },
      180000
    );
  }

  if (type === 'agent_message' || type === 'agent_msg') {
    const msg = action.message || action.query || '';
    return shellAsync(
      `"${OPENCLAW_BIN}" agent --session-id autono_exec_${sessionId} --message "$AA_CMD" --json`,
      { ...buildSafeEnv(), AA_CMD: msg },
      180000
    );
  }

  if (type === 'ha_control') {
    const haCmd = `bash "${HA_SCRIPT}" ${action.service || ''} ${action.entity || ''} ${action.data || ''}`.trim();
    return shellAsync(haCmd, buildSafeEnv(), 30000);
  }

  if (type === 'write_file') {
    try {
      const safePath = sanitizePath(action.path || '');
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, action.content || '', 'utf8');
      return { ok: true, output: `Written: ${safePath}` };
    } catch (err) {
      return { ok: false, output: err.message };
    }
  }

  if (type === 'read_file') {
    try {
      const safePath = sanitizePath(action.path || '');
      const content = await fs.readFile(safePath, 'utf8');
      return { ok: true, output: content.slice(0, 4000) };
    } catch (err) {
      return { ok: false, output: err.message };
    }
  }

  if (type === 'shell') {
    const cmd = (action.command || '').trim();
    if (!SHELL_ALLOWLIST.test(cmd)) {
      return { ok: false, output: `Command not in allowlist: ${cmd}` };
    }
    return shellAsync(cmd, buildSafeEnv(), 30000);
  }

  if (type === 'db_query') {
    try {
      const sql = (action.sql || '').trim();
      if (!/^SELECT\s/i.test(sql)) {
        return { ok: false, output: 'Only SELECT queries allowed' };
      }
      const rows = _db.prepare(sql).all();
      return { ok: true, output: JSON.stringify(rows, null, 2).slice(0, 4000) };
    } catch (err) {
      return { ok: false, output: err.message };
    }
  }

  if (type === 'goal_complete' || type === 'done') {
    return { ok: true, output: 'GOAL_COMPLETE', done: true };
  }

  return { ok: false, output: `Unknown action type: ${type}` };
}

// ── Autonomous loop ───────────────────────────────────────────────────────────
export function startLoop(sessionId) {
  // Non-blocking: fire and forget
  runAutonomousLoop(sessionId).catch((err) => {
    console.error(`[autonomous] Loop error for ${sessionId}:`, err);
    try {
      updateSession(sessionId, { status: 'error', completedAt: new Date().toISOString(), errorMsg: err.message });
    } catch {}
    broadcastSse(sessionId, { type: 'error', message: err.message });
  });
}

async function runAutonomousLoop(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const { goal, model, verifierModel, maxIterations, riskLevel } = session;

  // Register in active loops map
  const loopState = { status: 'running', iteration: 0, abortSignal: false, pauseSignal: false, sseClients: new Set() };
  activeLoops.set(sessionId, loopState);

  updateSession(sessionId, { status: 'running' });
  broadcastSse(sessionId, { type: 'status', status: 'running', iteration: 0 });

  // Accumulate step summaries for context
  const stepSummaries = [];

  for (let i = 0; i < maxIterations; i++) {
    // Check abort
    if (loopState.abortSignal) {
      updateSession(sessionId, { status: 'error', completedAt: new Date().toISOString(), errorMsg: 'Stopped by user', iteration: i });
      broadcastSse(sessionId, { type: 'status', status: 'error', message: 'Stopped by user' });
      activeLoops.delete(sessionId);
      return;
    }

    // Check pause
    if (loopState.pauseSignal) {
      loopState.pauseSignal = false;
      loopState.status = 'paused';
      updateSession(sessionId, { status: 'paused', iteration: i });
      broadcastSse(sessionId, { type: 'status', status: 'paused', iteration: i });
      // Wait until unpaused (abortSignal or manual resume — for simplicity we wait 30s then check again)
      await new Promise(r => setTimeout(r, 30000));
      if (loopState.abortSignal) continue;
      loopState.status = 'running';
      updateSession(sessionId, { status: 'running' });
    }

    loopState.iteration = i + 1;
    loopState.status = 'thinking';
    updateSession(sessionId, { iteration: i + 1 });

    // ── THINKING PHASE ────────────────────────────────────────────────────────
    const contextSummary = stepSummaries.slice(-6).join('\n');
    const thinkingPrompt = [
      `Eres un agente autónomo. Tu objetivo es: "${goal}"`,
      contextSummary ? `\nPasos previos:\n${contextSummary}` : '',
      `\nIteración ${i + 1} de ${maxIterations}.`,
      `\nResponde ÚNICAMENTE con un JSON válido con este formato:`,
      `{ "type": "<tipo_accion>", "reasoning": "<por qué>", "risk": "<LOW|MEDIUM|HIGH|CRITICAL>", ... }`,
      `Tipos de acción disponibles: web_search (query), agent_message (message), ha_control (service,entity), write_file (path,content), read_file (path), shell (command), db_query (sql), goal_complete.`,
      `Si el objetivo ya se cumplió, usa type: "goal_complete".`,
      `Sé concreto. No incluyas texto fuera del JSON.`,
    ].join('');

    broadcastSse(sessionId, { type: 'step', phase: 'thinking', stepN: i + 1, ts: new Date().toISOString() });

    const thinkRes = await shellAsync(
      `"${OPENCLAW_BIN}" agent --session-id autono_think_${sessionId} --message "$AA_MSG" --json --thinking low`,
      { ...buildSafeEnv(), AA_MSG: thinkingPrompt },
      180000
    );

    let parsed = null;
    if (thinkRes.ok) {
      // Try to extract JSON from agent output (may wrap in { reply/response/text })
      let rawText = thinkRes.output;
      const wrapper = safeJsonParse(rawText);
      rawText = wrapper?.reply || wrapper?.response || wrapper?.text || rawText;
      parsed = safeJsonParse(rawText);
    }

    if (!parsed || !parsed.type) {
      const errContent = { error: 'Could not parse thinking output', raw: truncate(thinkRes.output) };
      const step = appendStep(sessionId, i + 1, 'thinking', errContent, { riskLevel: 'LOW' });
      broadcastSse(sessionId, { type: 'step', ...step, phase: 'thinking' });
      stepSummaries.push(`Iter ${i + 1}: parse error`);
      continue;
    }

    const action = parsed;
    const step = appendStep(sessionId, i + 1, 'thinking', action, { riskLevel: action.risk });
    broadcastSse(sessionId, { type: 'step', ...step, phase: 'thinking' });

    // Check goal_complete
    if (action.type === 'goal_complete' || action.type === 'done') {
      updateSession(sessionId, { status: 'completed', completedAt: new Date().toISOString(), iteration: i + 1 });
      broadcastSse(sessionId, { type: 'status', status: 'completed', iteration: i + 1 });
      activeLoops.delete(sessionId);
      return;
    }

    // ── VERIFYING PHASE ───────────────────────────────────────────────────────
    loopState.status = 'verifying';
    const verifierPrompt = [
      `Eres un agente verificador de seguridad. Evalúa si la siguiente acción es segura y apropiada.`,
      `Objetivo del agente: "${goal}"`,
      `Acción propuesta: ${JSON.stringify(action)}`,
      `Riesgo declarado: ${action.risk}`,
      `Nivel máximo permitido: ${riskLevel}`,
      `\nResponde ÚNICAMENTE con JSON: { "approved": true|false, "reason": "<explicación breve>" }`,
      `Rechaza si: el riesgo es superior al nivel permitido, la acción es destructiva, accede a datos sensibles, o no está alineada con el objetivo.`,
    ].join('\n');

    broadcastSse(sessionId, { type: 'step', phase: 'verifying', stepN: i + 1, ts: new Date().toISOString() });

    const verifyRes = await shellAsync(
      `"${OPENCLAW_BIN}" agent --session-id autono_verify_${sessionId} --message "$AA_MSG" --json --thinking low`,
      { ...buildSafeEnv(), AA_MSG: verifierPrompt },
      120000
    );

    let verdict = { approved: false, reason: 'Verifier parse error' };
    if (verifyRes.ok) {
      let rawText = verifyRes.output;
      const wrapper = safeJsonParse(rawText);
      rawText = wrapper?.reply || wrapper?.response || wrapper?.text || rawText;
      const vp = safeJsonParse(rawText);
      if (vp && typeof vp.approved !== 'undefined') verdict = vp;
    }

    // Policy enforcement: block HIGH/CRITICAL regardless of verifier
    const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const actionRisk = (action.risk || 'MEDIUM').toUpperCase();
    const maxRisk = (riskLevel || 'MEDIUM').toUpperCase();
    if ((RISK_ORDER[actionRisk] ?? 2) > (RISK_ORDER[maxRisk] ?? 1)) {
      verdict = { approved: false, reason: `Risk ${actionRisk} exceeds allowed ${maxRisk}` };
    }

    const verifyStep = appendStep(sessionId, i + 1, 'verifying', verdict, {
      approved: verdict.approved,
      riskLevel: actionRisk,
    });
    broadcastSse(sessionId, { type: 'step', ...verifyStep, phase: 'verifying' });

    if (!verdict.approved) {
      const blockedStep = appendStep(sessionId, i + 1, 'blocked', { reason: verdict.reason }, { approved: false });
      broadcastSse(sessionId, { type: 'step', ...blockedStep, phase: 'blocked' });
      stepSummaries.push(`Iter ${i + 1}: BLOQUEADO — ${verdict.reason}`);
      continue;
    }

    // ── EXECUTING PHASE ───────────────────────────────────────────────────────
    loopState.status = 'executing';
    const execStep = appendStep(sessionId, i + 1, 'executing', { action: action.type, params: action });
    broadcastSse(sessionId, { type: 'step', ...execStep, phase: 'executing' });

    const execResult = await executeAction(action, sessionId);

    const resultContent = { ok: execResult.ok, output: truncate(execResult.output) };
    const resultStep = appendStep(sessionId, i + 1, 'result', resultContent, {
      approved: true,
      riskLevel: actionRisk,
    });
    broadcastSse(sessionId, { type: 'step', ...resultStep, phase: 'result' });

    stepSummaries.push(
      `Iter ${i + 1}: ${action.type} → ${execResult.ok ? 'OK' : 'ERROR'}: ${truncate(execResult.output, 120)}`
    );

    if (execResult.done) {
      updateSession(sessionId, { status: 'completed', completedAt: new Date().toISOString(), iteration: i + 1 });
      broadcastSse(sessionId, { type: 'status', status: 'completed', iteration: i + 1 });
      activeLoops.delete(sessionId);
      return;
    }

    // Small delay between iterations to avoid hammering the gateway
    await new Promise(r => setTimeout(r, 1500));
  }

  // Max iterations reached
  updateSession(sessionId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    iteration: maxIterations,
    errorMsg: 'Max iterations reached',
  });
  broadcastSse(sessionId, { type: 'status', status: 'completed', message: 'Max iterations reached' });
  activeLoops.delete(sessionId);
}
