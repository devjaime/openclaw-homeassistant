#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson, openRouterChat, estimateCostUsd } from './openrouter-client.mjs';
import { pickTaskConfig } from './task-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function loadPrompt(name) {
  return fs.readFile(path.join(ROOT, 'prompts', name), 'utf8');
}

async function fetchHomeAssistantEvents() {
  const haUrl = process.env.HA_URL || 'http://127.0.0.1:8123';
  const token = process.env.HA_TOKEN || '';
  const end = new Date();
  const start = new Date(end.getTime() - (24 * 60 * 60 * 1000));

  if (!token) {
    return { source: 'local-fallback', data: 'No HA_TOKEN; ejecuta con datos reales para producción.' };
  }

  const url = `${haUrl}/api/logbook/${start.toISOString()}?end_time=${end.toISOString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Home Assistant API error ${res.status}`);
  }

  const json = await res.json();
  return { source: 'homeassistant-logbook', data: json };
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const runtime = await loadJson(path.join(ROOT, 'config', 'runtime.json'));
  const modelCatalog = await loadJson(path.join(ROOT, 'config', 'models.json'));
  const taskCfg = await pickTaskConfig('daily_summary');
  const prompt = await loadPrompt('daily-log-summary.md');

  const ha = await fetchHomeAssistantEvents();
  const payload = JSON.stringify(ha.data).slice(0, runtime.limits.max_log_chars || 200000);

  const completion = await openRouterChat({
    apiKey,
    model: taskCfg.model,
    max_tokens: taskCfg.max_tokens,
    temperature: taskCfg.temperature,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `Fuente: ${ha.source}\n\nDatos (JSON):\n${payload}` }
    ]
  });

  const text = completion?.choices?.[0]?.message?.content || '(sin contenido)';
  const inTok = completion?.usage?.prompt_tokens || 0;
  const outTok = completion?.usage?.completion_tokens || 0;
  const costUsd = estimateCostUsd(modelCatalog.pricing_usd_per_token, taskCfg.model, inTok, outTok);
  const budget = Number(runtime.openrouter_budget_usd || 10);
  const usedPct = budget > 0 ? ((costUsd / budget) * 100) : 0;

  const reportDate = nowIsoDate();
  const outDir = path.join(ROOT, runtime.daily_report.output_dir || 'reports');
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${runtime.daily_report.filename_prefix || 'homeassistant-daily'}-${reportDate}.md`);
  const ledgerFile = path.join(ROOT, 'data', 'cost-ledger.jsonl');

  const md = `# Resumen Diario Home Assistant (${reportDate})\n\n` +
    `${text}\n\n---\n` +
    `Modelo: \`${taskCfg.model}\`\n` +
    `Tokens in/out: ${inTok}/${outTok}\n` +
    `Costo estimado: USD ${costUsd.toFixed(6)}\n` +
    `Presupuesto configurado: USD ${budget.toFixed(2)}\n` +
    `Uso relativo al presupuesto: ${usedPct.toFixed(2)}%\n`;

  await fs.writeFile(file, md, 'utf8');
  await fs.mkdir(path.dirname(ledgerFile), { recursive: true });
  const ledgerRow = {
    ts: Date.now(),
    source: 'multi-model-foundation',
    task: 'daily_summary',
    provider: 'openrouter',
    model: taskCfg.model,
    inputTokens: inTok,
    outputTokens: outTok,
    costUsd
  };
  await fs.appendFile(ledgerFile, `${JSON.stringify(ledgerRow)}\n`, 'utf8');
  console.log(`Reporte generado: ${file}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
