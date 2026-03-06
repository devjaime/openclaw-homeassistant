#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson } from './openrouter-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export async function pickTaskConfig(taskType) {
  const models = await loadJson(path.join(ROOT, 'config', 'models.json'));
  return models.tasks[taskType] || models.tasks.fallback;
}
