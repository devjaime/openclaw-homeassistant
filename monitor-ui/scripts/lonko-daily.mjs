#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HOME = process.env.HOME || '/Users/devjaime';
const OPENCLAW = process.env.OPENCLAW_BIN || path.join(HOME, 'Library', 'pnpm', 'openclaw');
const VAULT = process.env.LONKO_VAULT || path.join(HOME, 'Documents', 'Obsidian Vault', 'LONKO');
const TELEGRAM_TARGET = process.env.LONKO_TELEGRAM_TARGET || '1540433103';
const DRY_RUN = process.argv.includes('--dry-run');
const NO_TELEGRAM = process.argv.includes('--no-telegram');

const roles = [
  { id: 'lonko', name: 'LONKO', focus: 'Revisa dispersión y selecciona un proyecto principal, uno experimental y uno de contenido.' },
  { id: 'pillan', name: 'PILLÁN', focus: 'Propón una mejora técnica pequeña y verificable para IA local, backend, observabilidad o arquitectura. No modifiques repositorios.' },
  { id: 'antu', name: 'ANTÜ', focus: 'Define una acción sostenible de carrera, inglés técnico o Google Cloud conectada con evidencia real.' },
  { id: 'ruka', name: 'RUKA', focus: 'Prepara un análisis financiero conservador. No inventes cifras; si faltan datos, entrega una checklist.' },
  { id: 'kimun', name: 'KIMÜN', focus: 'Detecta decisiones, relaciones y conocimiento que convenga conservar, sin secretos.' },
  { id: 'werken', name: 'WERKÉN', focus: 'Prepara una idea de contenido técnico anonimizada; debe permanecer como borrador.' },
  { id: 'kume', name: 'KÜME', focus: 'Revisa carga y sostenibilidad sin diagnosticar; propón una reducción concreta o una pregunta de energía.' },
];

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function runOpenClaw(args, timeout = 240_000) {
  const result = spawnSync(OPENCLAW, args, { encoding: 'utf8', timeout, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` } });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `openclaw exit ${result.status}`).trim());
  return result.stdout.trim();
}

function runAgent(agentId, prompt, sessionSuffix) {
  const raw = runOpenClaw(['agent', '--agent', agentId, '--session-id', `lonko-daily-${localDate()}-${sessionSuffix}`, '--message', prompt, '--thinking', 'off', '--timeout', '180', '--json']);
  const result = JSON.parse(raw);
  const text = result?.result?.payloads?.map((payload) => payload?.text).filter(Boolean).join('\n').trim();
  if (!text) throw new Error(`${agentId} no produjo texto`);
  return { text, durationMs: result?.result?.meta?.durationMs || 0, model: result?.result?.meta?.agentMeta?.model || 'qwen3.5:4b' };
}

function readLatestDaily() {
  const dir = path.join(VAULT, 'Daily');
  try {
    const latest = fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().at(-1);
    return latest ? fs.readFileSync(path.join(dir, latest), 'utf8').slice(0, 5000) : 'Sin reporte anterior.';
  } catch { return 'Sin reporte anterior.'; }
}

function writeNote(folder, filename, type, agent, body) {
  const dir = path.join(VAULT, folder);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, filename);
  const content = `---\ntype: ${type}\nagent: ${agent}\ndate: ${localDate()}\nstatus: completed\n---\n\n${body.trim()}\n`;
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, target);
  return target;
}

function main() {
  const date = localDate();
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' }).format(new Date());
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
  const specialist = roles[weekday];
  const previous = readLatestDaily();
  const specialistPrompt = `Fecha ${date}. Actúa como ${specialist.name}. ${specialist.focus}\nUsa este reporte anterior solo como contexto:\n${previous}\nEntrega Markdown breve con Situación, Trabajo ejecutado, Evidencia, Riesgos y Próxima acción. No uses herramientas ni ejecutes acciones externas.`;
  if (DRY_RUN) { console.log(JSON.stringify({ date, specialist, vault: VAULT, telegram: !NO_TELEGRAM }, null, 2)); return; }

  const specialistResult = runAgent(specialist.id, specialistPrompt, specialist.id);
  const specialistPath = writeNote('Inbox', `${date}-${specialist.id}.md`, 'lonko-specialist-result', specialist.name, specialistResult.text);

  const auditPrompt = `Fecha ${date}. Actúa como WEICHAFE. Audita el siguiente resultado de ${specialist.name}. Revisa evidencia, privacidad, autorización, coherencia y riesgos. Devuelve veredicto APROBADO, CONDICIONADO o RECHAZADO con correcciones concretas. No uses herramientas.\n\n${specialistResult.text}`;
  const auditResult = runAgent('weichafe', auditPrompt, 'weichafe');
  const auditPath = writeNote('Audits', `${date}-weichafe.md`, 'lonko-audit', 'WEICHAFE', auditResult.text);

  const dailyPrompt = `Fecha ${date}. Actúa como LONKO. Consolida el trabajo y auditoría siguientes. Conserva solo hechos verificables, máximo tres prioridades y cualquier decisión que requiera aprobación. Devuelve Markdown breve con Estado general, Trabajo realizado, Evidencia, Riesgos, Decisiones pendientes y Próxima acción. No uses herramientas.\n\nRESULTADO ${specialist.name}:\n${specialistResult.text}\n\nAUDITORÍA WEICHAFE:\n${auditResult.text}`;
  const dailyResult = runAgent('lonko', dailyPrompt, 'lonko');
  const dailyPath = writeNote('Daily', `${date}.md`, 'lonko-daily-report', 'LONKO', dailyResult.text);

  if (!NO_TELEGRAM) {
    const message = `🧭 LONKO · ${date}\n\n${dailyResult.text}`.slice(0, 3500);
    runOpenClaw(['message', 'send', '--channel', 'telegram', '--target', TELEGRAM_TARGET, '--message', message, '--json'], 60_000);
  }
  console.log(JSON.stringify({ ok: true, date, specialist: specialist.id, files: [specialistPath, auditPath, dailyPath], telegram: !NO_TELEGRAM, durationsMs: { specialist: specialistResult.durationMs, audit: auditResult.durationMs, lonko: dailyResult.durationMs } }, null, 2));
}

try { main(); } catch (error) { console.error(`[lonko-daily] ${error.message}`); process.exitCode = 1; }
