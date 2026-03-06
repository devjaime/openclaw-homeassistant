#!/usr/bin/env node
import fs from 'node:fs/promises';

export async function loadJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

export function estimateCostUsd(pricing, model, inputTokens, outputTokens) {
  const p = pricing?.[model];
  if (!p) return 0;
  return (Number(inputTokens || 0) * Number(p.input || 0)) + (Number(outputTokens || 0) * Number(p.output || 0));
}

export async function openRouterChat({ apiKey, model, messages, max_tokens, temperature }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no definida');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://127.0.0.1',
      'X-Title': 'OpenClaw Multi-Model Foundation'
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}
