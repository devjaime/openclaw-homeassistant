#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HOME = process.env.HOME || '/Users/devjaime';
const HA = process.env.LONKO_HA_SCRIPT || path.join(HOME, '.openclaw', 'workspace', 'projects', 'homeassistant', 'ha.sh');
const ALEXA = process.env.LONKO_ALEXA_SCRIPT || path.join(HOME, '.openclaw', 'workspace', 'projects', 'homeassistant', 'alexa.sh');
const STATE_DIR = path.join(HOME, '.openclaw', 'voice');
const EVENTS = path.join(STATE_DIR, 'events.jsonl');
const STATE = path.join(STATE_DIR, 'state.json');
const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ''; };
const forceTest = args.includes('--force-test');
const dryRun = args.includes('--dry-run');
const message = value('--message').trim();
const evidence = value('--evidence').trim();
const category = value('--category') || 'system';
const priority = value('--priority') || 'normal';

function run(command, commandArgs, timeout = 20_000) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` } });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return result.stdout.trim();
}

function chileParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), hour: Number(get('hour')) };
}

function rejectReason(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 6 || words.length > 35) return 'length_out_of_bounds';
  if (/[\\/](Users|Volumes|home|etc)[\\/]|\.openclaw|\.env|api[_ -]?key|token|contraseña|password|secret/i.test(text)) return 'sensitive_path_or_secret';
  if (/\$|€|UF\b|CLP\b|USD\b|\b\d+[.,]?\d*\s*(pesos|dólares|dolares)|sueldo|deuda|ahorro|patrimonio|bancari|crédito|credito/i.test(text)) return 'financial_content';
  if (/diagnóstic|diagnostic|tratamiento|medicamento|síntoma|sintoma|enfermedad|salud mental|terapia/i.test(text)) return 'medical_content';
  if (/cliente|compañero|companero|jefatura|líder|lider|correo|empresa|corporativ|provisión|provision/i.test(text)) return 'corporate_or_personal_content';
  return '';
}

function haState(entityId) {
  try { return JSON.parse(run(HA, ['state', entityId], 8_000)); } catch { return null; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { date: '', spoken: 0, hashes: [], lastSpokenAt: null }; }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temporary = `${STATE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, STATE);
}

function record(event) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(EVENTS, `${JSON.stringify(event)}\n`);
}

function nextEventNumber(date) {
  try {
    return fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((event) => String(event.event_id || '').startsWith(`VOICE-${date.replaceAll('-', '')}-`)).length + 1;
  } catch { return 1; }
}

function main() {
  if (!message) throw new Error('message_required');
  if (!evidence || !fs.existsSync(evidence)) throw new Error('verified_evidence_required');
  const reason = rejectReason(message);
  if (reason) throw new Error(`blocked:${reason}`);
  const now = new Date();
  const local = chileParts();
  const hash = crypto.createHash('sha256').update(message).digest('hex');
  let state = loadState();
  if (state.date !== local.date) state = { date: local.date, spoken: 0, hashes: [], lastSpokenAt: null };
  const event = {
    event_id: `VOICE-${local.date.replaceAll('-', '')}-${String(nextEventNumber(local.date)).padStart(3, '0')}`,
    timestamp: now.toISOString(), category, verified: true, evidence_type: 'file', sensitivity: 'PUBLIC_SAFE', priority,
    expires_at: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(), message, spoken: false,
  };
  if (state.hashes.includes(hash)) throw new Error('blocked:duplicate');
  if (state.spoken >= 3) throw new Error('blocked:daily_limit');
  if (!forceTest) {
    if (['Sat', 'Sun'].includes(local.weekday) || local.hour < 9 || local.hour >= 19) throw new Error('blocked:outside_schedule');
    const dnd = haState('switch.echo_dot_de_jaime_do_not_disturb');
    if (!dnd || dnd.state !== 'off') throw new Error('blocked:dnd_or_unknown');
    const home = haState(process.env.LONKO_PRESENCE_ENTITY || 'zone.home');
    const present = home && (home.state === 'home' || Number(home.state) > 0);
    if (!present) throw new Error('blocked:presence_not_verified');
    if (state.lastSpokenAt && now.getTime() - Date.parse(state.lastSpokenAt) < 4 * 60 * 60 * 1000) throw new Error('blocked:cooldown');
  }
  if (!dryRun) run(ALEXA, ['send', message, 'media_player.echo_dot_de_jaime'], 30_000);
  event.spoken = !dryRun;
  record(event);
  if (!dryRun) {
    state.spoken += 1;
    state.hashes.push(hash);
    state.lastSpokenAt = now.toISOString();
    saveState(state);
  }
  console.log(JSON.stringify({ ok: true, event, dryRun, forceTest }, null, 2));
}

try { main(); } catch (error) { console.error(`[aylen] ${error.message}`); process.exitCode = 2; }
