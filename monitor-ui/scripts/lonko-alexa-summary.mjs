#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HOME = process.env.HOME || '/Users/devjaime';
const VAULT = path.join(HOME, 'Documents', 'Obsidian Vault', 'LONKO');
const AYLEN = path.join(HOME, '.openclaw', 'workspace', 'projects', 'openclaw-homeassistant', 'monitor-ui', 'scripts', 'aylen-voice.mjs');
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const get = (type) => parts.find((part) => part.type === type)?.value;
const date = `${get('year')}-${get('month')}-${get('day')}`;
const hour = Number(get('hour'));
const daily = path.join(VAULT, 'Daily', `${date}.md`);
const inbox = path.join(VAULT, 'Inbox');

let evidence = '';
let message = '';
let category = 'planning';
if (hour < 12) {
  const reports = fs.existsSync(path.join(VAULT, 'Daily')) ? fs.readdirSync(path.join(VAULT, 'Daily')).filter((file) => file.endsWith('.md')).sort() : [];
  evidence = reports.length ? path.join(VAULT, 'Daily', reports.at(-1)) : '';
  message = evidence ? 'Buenos días, Jaime. El último ciclo de agentes quedó revisado y el foco principal está disponible en tu panel privado.' : '';
} else {
  const todayFiles = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((file) => file.startsWith(date) && file.endsWith('.md')) : [];
  evidence = fs.existsSync(daily) ? daily : todayFiles.length ? path.join(inbox, todayFiles[0]) : '';
  message = fs.existsSync(daily)
    ? 'Cierre del día: el ciclo de agentes terminó, las notas fueron actualizadas y el resultado quedó disponible para tu revisión.'
    : todayFiles.length ? 'Se actualizaron tus notas de conocimiento y quedó disponible un nuevo resultado pendiente de revisión.' : '';
  category = 'system';
}

if (!message || !evidence) process.exit(0);
const result = spawnSync('/opt/homebrew/bin/node', [AYLEN, '--message', message, '--evidence', evidence, '--category', category, '--priority', 'normal'], { encoding: 'utf8', timeout: 45_000, env: process.env });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status || 0;
