const LANG_KEY = 'monitor_lang';
let lang = localStorage.getItem(LANG_KEY) || 'es';
if (!['es', 'en'].includes(lang)) lang = 'es';

const I18N = {
  es: {
    title: 'Sala de trabajo OpenClaw',
    subtitle: 'Agentes de software en paralelo por proyecto',
    refresh: '↻ Actualizar',
    active: 'Activo', idle: 'En espera', down: 'Caído', unknown: 'Sin datos',
    workingOn: 'Trabajando en', lastEvent: 'Último evento',
    noMessage: 'Sin actividad detectada',
    kpiOpenclaw: 'OpenClaw', kpiHA: 'Home Assistant', kpiMode: 'Modo', kpiErrors: 'Errores recientes',
    taskVocari: 'Roadmap vocacional + contenidos',
    taskHumanloop: 'Flujos Airbnb + automatización',
    taskBlog: 'Borradores de marca personal',
    taskHA: 'Dispositivos, cámaras y automatizaciones',
    chatEmpty: 'Escribe un mensaje\npara iniciar la sesión del agente',
    thinking: 'Agente pensando',
    busy: 'Agente ocupado — espera la respuesta',
    clearConfirm: '¿Iniciar nueva sesión? Se perderá el historial.',
    sendError: 'Error al enviar',
  },
  en: {
    title: 'OpenClaw Workroom',
    subtitle: 'Parallel software agents per project',
    refresh: '↻ Refresh',
    active: 'Active', idle: 'Idle', down: 'Down', unknown: 'No data',
    workingOn: 'Working on', lastEvent: 'Last event',
    noMessage: 'No activity detected',
    kpiOpenclaw: 'OpenClaw', kpiHA: 'Home Assistant', kpiMode: 'Mode', kpiErrors: 'Recent errors',
    taskVocari: 'Vocational roadmap + content',
    taskHumanloop: 'Airbnb flows + automation',
    taskBlog: 'Personal brand drafts',
    taskHA: 'Devices, cameras and automations',
    chatEmpty: 'Type a message\nto start the agent session',
    thinking: 'Agent thinking',
    busy: 'Agent busy — wait for reply',
    clearConfirm: 'Start new session? History will be cleared.',
    sendError: 'Send error',
  },
};

const tr = (k) => I18N[lang]?.[k] ?? I18N.es[k] ?? k;
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'es-CL') : '—';
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal Markdown → HTML for agent replies (headings, bold, code, tables, lists). */
function renderMarkdown(raw) {
  const lines = String(raw ?? '').split('\n');
  const out = [];
  let inCode = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      if (!inCode) {
        if (inTable) { out.push('</table>'); inTable = false; }
        const lang = line.trim().slice(3).trim();
        out.push(`<pre class="md-code"><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>`);
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) { out.push(escapeHtml(line)); continue; }

    // Table rows
    if (line.trim().startsWith('|')) {
      if (!inTable) { out.push('<table class="md-table">'); inTable = true; }
      const isSep = /^\|[-| :]+\|$/.test(line.trim());
      if (isSep) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const tag = out.some((l) => l === '<table class="md-table">') && !out.some((l) => l.startsWith('<tr')) ? 'th' : 'td';
      out.push(`<tr>${cells.map((c) => `<${tag}>${inlineMarkdown(c)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    if (inTable) { out.push('</table>'); inTable = false; }

    // Headings
    const hm = line.match(/^(#{1,4})\s+(.*)/);
    if (hm) { out.push(`<h${hm[1].length} class="md-h">${inlineMarkdown(hm[2])}</h${hm[1].length}>`); continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) { out.push('<hr class="md-hr">'); continue; }

    // List items
    const lm = line.match(/^(\s*[-*+]|\s*\d+\.)\s+(.*)/);
    if (lm) { out.push(`<div class="md-li">${inlineMarkdown(lm[2])}</div>`); continue; }

    // Blank line
    if (!line.trim()) { out.push('<br>'); continue; }

    // Normal paragraph
    out.push(`<div class="md-p">${inlineMarkdown(line)}</div>`);
  }

  if (inCode) out.push('</code></pre>');
  if (inTable) out.push('</table>');
  return out.join('\n');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function setTopText() {
  document.documentElement.lang = lang;
  document.getElementById('title').textContent = tr('title');
  document.getElementById('subtitle').textContent = tr('subtitle');
  document.getElementById('refreshBtn').textContent = tr('refresh');
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = lang;
}

function kpi(label, value, cls = '') {
  return `<div class="kpi"><div class="k">${label}</div><div class="v ${cls}">${value}</div></div>`;
}

function getProjectRow(projects, id) {
  return (projects?.projects || []).find((p) => p.id === id || (p.label || '').toLowerCase().includes(id)) ?? null;
}

function computeDeskStatus(data, deskId) {
  const openclawUp = Boolean(data?.openclaw?.listening);
  const lastMsg = String(data?.lastActivity?.msg || '');
  const ts = data?.lastActivity?.ts ?? null;

  if (deskId === 'ha') {
    const haUp = Boolean(data?.homeassistant?.httpOk);
    const appleN = Number(data?.apple?.devices?.length || 0);
    return {
      state: haUp ? tr('active') : tr('down'),
      stateClass: haUp ? 'state-ok' : 'state-bad',
      screen: `ha:http:${haUp ? '200' : 'ERR'}\napple_devices:${appleN}\nservices:camera,ac,vacuum`,
      task: tr('taskHA'),
      last: `${tr('lastEvent')}: ${fmtDate(ts)}`,
    };
  }
  if (deskId === 'vocari') {
    const row = getProjectRow(data?.projects, 'vocari');
    const active = openclawUp && Number(row?.commits7d ?? 0) >= 0;
    return {
      state: active ? tr('active') : tr('idle'),
      stateClass: active ? 'state-ok' : 'state-warn',
      screen: `repo:vocari.cl\ncommits_7d:${row?.commits7d ?? 0}\nbranch:main`,
      task: tr('taskVocari'),
      last: `${tr('lastEvent')}: ${row?.lastCommit?.subject || tr('noMessage')}`,
    };
  }
  if (deskId === 'humanloop') {
    const row = getProjectRow(data?.projects, 'humanloop');
    const active = openclawUp && Number(row?.commits7d ?? 0) >= 0;
    return {
      state: active ? tr('active') : tr('idle'),
      stateClass: active ? 'state-ok' : 'state-warn',
      screen: `repo:humanloop.cl\ncommits_7d:${row?.commits7d ?? 0}\nstatus:tracking`,
      task: tr('taskHumanloop'),
      last: `${tr('lastEvent')}: ${row?.lastCommit?.subject || tr('noMessage')}`,
    };
  }
  const blogActive = /blog|youtube|twitter|tiktok|marca personal/i.test(lastMsg);
  return {
    state: blogActive ? tr('active') : tr('idle'),
    stateClass: blogActive ? 'state-ok' : 'state-warn',
    screen: 'site:jaimehernandez.dev\ncontent_pipeline:ready\npublish_queue:watching',
    task: tr('taskBlog'),
    last: `${tr('lastEvent')}: ${(lastMsg || tr('noMessage')).slice(0, 80)}`,
  };
}

function paintDesk(id, desk) {
  const root = document.getElementById(`desk-${id}`);
  if (!root) return;
  const stateEl = root.querySelector('[data-state]');
  const screenEl = root.querySelector('[data-screen]');
  const lastEl = root.querySelector('[data-last]');
  if (stateEl) { stateEl.className = `desk-state ${desk.stateClass}`; stateEl.textContent = desk.state || tr('unknown'); }
  if (screenEl) screenEl.textContent = desk.screen || tr('unknown');
  if (lastEl) lastEl.textContent = desk.last || '';
}

function renderSummary(data) {
  const root = document.getElementById('summary');
  if (!root) return;
  const ocUp = Boolean(data?.openclaw?.listening);
  const haUp = Boolean(data?.homeassistant?.httpOk);
  const mode = data?.openclaw?.modelModeGuess || 'custom';
  const errors = Number(data?.openclaw?.errorCountRecent || 0);
  root.innerHTML = [
    kpi(tr('kpiOpenclaw'), ocUp ? tr('active') : tr('down'), ocUp ? 'ok' : 'bad'),
    kpi(tr('kpiHA'), haUp ? 'HTTP 200' : 'offline', haUp ? 'ok' : 'bad'),
    kpi(tr('kpiMode'), mode, 'warn'),
    kpi(tr('kpiErrors'), String(errors), errors > 0 ? 'warn' : 'ok'),
  ].join('');
}

// ── Chat state & rendering ─────────────────────────────────────────────────────

const DESKS = ['vocari', 'humanloop', 'blog', 'ha'];

// Local shadow of server-side conversation state
const chatState = Object.fromEntries(DESKS.map((id) => [id, { messages: [], busy: false, lastLen: 0 }]));

function renderChat(deskId) {
  const state = chatState[deskId];
  const chatEl = document.querySelector(`[data-chat="${deskId}"]`);
  if (!chatEl) return;

  if (!state.messages.length && !state.busy) {
    chatEl.innerHTML = `<div class="chat-empty">${escapeHtml(tr('chatEmpty'))}</div>`;
    return;
  }

  const wasAtBottom = chatEl.scrollTop + chatEl.clientHeight >= chatEl.scrollHeight - 30;

  const msgHtml = state.messages.map((m) => {
    const cls = m.role === 'user' ? 'user' : m.role === 'error' ? 'error' : 'agent';
    const timeStr = m.ts ? `<div class="chat-ts">${fmtTime(m.ts)}</div>` : '';
    const body = m.role === 'agent'
      ? renderMarkdown(m.text)
      : `${m.role === 'error' ? '✗ ' : '▷ '}${escapeHtml(m.text)}`;
    return `<div class="chat-msg ${cls}">${body}${timeStr}</div>`;
  }).join('');

  const thinkingHtml = state.busy
    ? `<div class="chat-thinking">${escapeHtml(tr('thinking'))}</div>`
    : '';

  chatEl.innerHTML = msgHtml + thinkingHtml;

  if (wasAtBottom || state.messages.length !== state.lastLen) {
    chatEl.scrollTop = chatEl.scrollHeight;
    state.lastLen = state.messages.length;
  }
}

function setSendBusy(deskId, busy) {
  const btn = document.querySelector(`[data-send="${deskId}"]`);
  const inp = document.querySelector(`[data-input="${deskId}"]`);
  if (btn) btn.disabled = busy;
  if (inp) inp.disabled = busy;
}

// ── Send message ───────────────────────────────────────────────────────────────

async function sendMessage(deskId) {
  const inputEl = document.querySelector(`[data-input="${deskId}"]`);
  if (!inputEl) return;
  const message = inputEl.value.trim();
  if (!message || chatState[deskId].busy) return;

  inputEl.value = '';
  chatState[deskId].busy = true;
  chatState[deskId].messages.push({ role: 'user', text: message, ts: Date.now() });
  setSendBusy(deskId, true);
  renderChat(deskId);

  try {
    const res = await fetch('/api/workroom/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deskId, message }),
    });
    if (res.status === 409) {
      // Server says busy — revert and show hint
      chatState[deskId].messages.pop();
      chatState[deskId].busy = false;
      setSendBusy(deskId, false);
      inputEl.value = message;
      renderChat(deskId);
    }
    // 202 = accepted, pending — poll will pick up the reply
  } catch (e) {
    chatState[deskId].messages.push({ role: 'error', text: `${tr('sendError')}: ${e?.message || e}`, ts: Date.now() });
    chatState[deskId].busy = false;
    setSendBusy(deskId, false);
    renderChat(deskId);
  }
}

// ── Poll workroom history (2s) ─────────────────────────────────────────────────

async function loadWorkroomHistory() {
  try {
    const res = await fetch('/api/workroom/history', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();

    for (const deskId of DESKS) {
      const srv = data?.[deskId];
      if (!srv) continue;
      const srvMsgs = Array.isArray(srv.messages) ? srv.messages : [];
      const srvBusy = Boolean(srv.busy);

      // Adopt server messages when server has more (agent replied)
      if (srvMsgs.length > chatState[deskId].messages.length) {
        chatState[deskId].messages = srvMsgs;
      }
      // Sync busy state — also unblock UI when agent finished
      const wasBusy = chatState[deskId].busy;
      chatState[deskId].busy = srvBusy;
      if (wasBusy && !srvBusy) {
        setSendBusy(deskId, false);
      }
      renderChat(deskId);
    }
  } catch { /* network hiccup — ignore */ }
}

// ── Poll status (15s) ─────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const data = await res.json();
    renderSummary(data);
    for (const id of ['vocari', 'humanloop', 'blog', 'ha']) {
      paintDesk(id, computeDeskStatus(data, id));
    }
  } catch { /* ignore */ }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

document.getElementById('refreshBtn')?.addEventListener('click', () => {
  loadStatus();
  loadWorkroomHistory();
});

document.getElementById('langSelect')?.addEventListener('change', async (e) => {
  const next = String(e.target?.value || 'es');
  if (!['es', 'en'].includes(next)) return;
  lang = next;
  localStorage.setItem(LANG_KEY, next);
  setTopText();
  await loadStatus();
  for (const id of DESKS) renderChat(id);
});

document.querySelectorAll('[data-send]').forEach((btn) => {
  btn.addEventListener('click', () => sendMessage(btn.dataset.send));
});

document.querySelectorAll('[data-input]').forEach((inp) => {
  const deskId = inp.dataset.input;
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage(deskId);
    }
  });
});

document.querySelectorAll('[data-clear]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const deskId = btn.dataset.clear;
    if (!confirm(tr('clearConfirm'))) return;
    await fetch('/api/workroom/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deskId }),
    });
    chatState[deskId].messages = [];
    chatState[deskId].busy = false;
    chatState[deskId].lastLen = 0;
    setSendBusy(deskId, false);
    renderChat(deskId);
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

setTopText();
for (const id of DESKS) renderChat(id); // show empty state immediately
loadStatus();
loadWorkroomHistory();

setInterval(loadStatus, 15000);
setInterval(loadWorkroomHistory, 2000);
