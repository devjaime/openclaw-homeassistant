// ── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-CL');
}
function fmtMoney(n, currency = 'USD') {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency,
    maximumFractionDigits: currency === 'CLP' ? 0 : 4,
  }).format(Number(n || 0));
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function cls(ok) { return ok ? 'ok' : 'bad'; }

// ── log coloring ──────────────────────────────────────────────────────────────
const TS_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s*/;
const LEVEL_RE = /\b(ERROR|error|WARN|warn|WARNING|warning|INFO|info|DEBUG|debug|OK|ok|FAIL|fail|CRITICAL|critical)\b/;

function detectLevel(line) {
  if (/error|failed|exception|critical|panic/i.test(line)) return 'error';
  if (/warn|warning/i.test(line)) return 'warn';
  if (/\bok\b|success|ready|started|listening|connected/i.test(line)) return 'ok';
  if (/debug/i.test(line)) return 'debug';
  return 'info';
}

function parseLine(raw) {
  let rest = raw;
  let ts = '';
  const tsMatch = rest.match(TS_RE);
  if (tsMatch) {
    ts = tsMatch[1];
    rest = rest.slice(tsMatch[0].length);
  }
  const level = detectLevel(raw);
  return { ts, level, msg: rest };
}

function renderLogContainer(containerId, lines) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sorted = [...(lines || [])].reverse(); // más reciente primero
  if (!sorted.length) {
    el.innerHTML = '<div class="log-line"><span class="log-msg" style="color:var(--text2)">Sin logs disponibles</span></div>';
    return;
  }
  el.innerHTML = sorted.map((raw) => {
    const { ts, level, msg } = parseLine(raw);
    const tsStr = ts ? `<span class="log-ts">${ts.slice(0, 19).replace('T', ' ')}</span>` : '';
    const lvlStr = `<span class="log-level level-${level}">${level.toUpperCase()}</span>`;
    const escaped = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="log-line">${tsStr}${lvlStr}<span class="log-msg">${escaped}</span></div>`;
  }).join('');
}

// ── telegram events ───────────────────────────────────────────────────────────
function classifyTelegramLine(line) {
  if (/error|fail|unauthorized|conflict/i.test(line)) return 'err';
  if (/send|sent|reply|response|message/i.test(line)) return 'out';
  return 'in';
}

function extractTelegramTs(line) {
  const m = line.match(TS_RE);
  return m ? m[1].slice(0, 19).replace('T', ' ') : '';
}

function renderTelegram(lines) {
  const el = document.getElementById('telegramList');
  if (!el) return;
  const sorted = [...(lines || [])].reverse();
  if (!sorted.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:8px">Sin eventos recientes</div>';
    return;
  }
  el.innerHTML = sorted.map((raw) => {
    const type = classifyTelegramLine(raw);
    const ts = extractTelegramTs(raw);
    const msg = raw.replace(TS_RE, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const labels = { in: 'ENTRADA', out: 'SALIDA', err: 'ERROR' };
    return `
      <div class="tg-card">
        <span class="tg-badge ${type}">${labels[type]}</span>
        <div class="tg-body">
          <div class="tg-ts">${ts}</div>
          <div class="tg-text">${msg}</div>
        </div>
      </div>`;
  }).join('');
}

// ── charts ────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  'rgba(59,130,246,0.85)',
  'rgba(167,139,250,0.85)',
  'rgba(249,115,22,0.85)',
  'rgba(34,197,94,0.85)',
  'rgba(6,182,212,0.85)',
  'rgba(245,158,11,0.85)',
  'rgba(239,68,68,0.85)',
];

const chartOptions = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
    title: title ? { display: true, text: title, color: '#94a3b8', font: { size: 12 } } : undefined,
    tooltip: { backgroundColor: '#1a1d27', titleColor: '#e2e8f0', bodyColor: '#94a3b8' },
  },
  scales: {
    x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
    y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
  },
});

let chartDaily = null;
let chartModels = null;

function buildDailyData(usageData) {
  const daily = usageData.daily || {};
  const days = Object.keys(daily).sort();
  const last7 = days.slice(-7);
  const modelSet = new Set();
  last7.forEach((d) => Object.keys(daily[d] || {}).forEach((m) => modelSet.add(m)));
  const models = [...modelSet];

  const labels = last7.map((d) => {
    const [, , day] = d.split('-');
    return `${day}/${d.slice(5, 7)}`;
  });

  const datasets = models.map((model, i) => ({
    label: model.split('/').pop(),
    data: last7.map((d) => (daily[d] && daily[d][model] ? daily[d][model].total : 0)),
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    borderRadius: 4,
  }));

  return { labels, datasets };
}

function buildModelPieData(usageData) {
  const models = (usageData.models || []).filter((m) => m.usage.total > 0);
  return {
    labels: models.map((m) => m.model.split('/').pop()),
    datasets: [{
      data: models.map((m) => m.usage.total),
      backgroundColor: models.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
      borderWidth: 0,
    }],
  };
}

function updateCharts(usageData) {
  const dailyCtx = document.getElementById('chartDaily');
  const modelCtx  = document.getElementById('chartModels');

  const dailyData = buildDailyData(usageData);

  if (chartDaily) {
    chartDaily.data = dailyData;
    chartDaily.update();
  } else {
    chartDaily = new Chart(dailyCtx, {
      type: 'bar',
      data: dailyData,
      options: {
        ...chartOptions(),
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { stacked: true, ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
        },
      },
    });
  }

  const pieData = buildModelPieData(usageData);
  if (chartModels) {
    chartModels.data = pieData;
    chartModels.update();
  } else {
    chartModels = new Chart(modelCtx, {
      type: 'doughnut',
      data: pieData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
          tooltip: { backgroundColor: '#1a1d27', titleColor: '#e2e8f0', bodyColor: '#94a3b8' },
        },
      },
    });
  }
}

// ── sections ──────────────────────────────────────────────────────────────────
function renderSummary(data) {
  const box = document.getElementById('summary');
  const oc = data.openclaw;
  const ha = data.homeassistant;
  const kpis = [
    { label: 'OpenClaw', value: oc.listening ? '● Activo' : '✕ Caído', className: oc.listening ? 'ok' : 'bad' },
    { label: 'Home Assistant', value: ha.httpOk ? `● HTTP ${ha.httpStatus}` : '✕ Sin respuesta', className: ha.httpOk ? 'ok' : 'warn' },
    { label: 'Telegram', value: oc.telegramEnabled ? `● ${oc.telegramBot || 'activo'}` : '— deshabilitado', className: oc.telegramEnabled ? 'ok' : 'warn' },
    { label: 'Errores recientes', value: String(oc.errorCountRecent), className: oc.errorCountRecent > 0 ? 'bad' : 'ok' },
    { label: 'Jobs cron', value: String((data.activity.cronJobs || []).length), className: 'info' },
    { label: 'Uptime panel', value: `${Math.floor(data.uptimeSeconds / 60)} min`, className: 'ok' },
  ];
  box.innerHTML = kpis.map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
  ).join('');
}

function renderConnections(data) {
  const el = document.getElementById('connections');
  const items = [
    { ok: data.openclaw.listening, label: `Gateway OpenClaw :${data.openclaw.port}` },
    { ok: data.homeassistant.listening8123, label: 'Home Assistant :8123' },
    { ok: data.homeassistant.httpOk, label: `HA HTTP ${data.homeassistant.httpOk ? 'OK' : (data.homeassistant.httpError || 'ERROR')}` },
    { ok: data.openclaw.telegramEnabled, label: `Telegram bot (${data.openclaw.telegramBot || '-'})` },
  ];
  el.innerHTML = items.map(({ ok, label }) =>
    `<li><div class="dot ${ok ? 'green' : 'red'}"></div>${label}</li>`
  ).join('');
}

function modelBadgeClass(model) {
  if (!model) return 'model-other';
  if (model.includes('gemini') || model.includes('google')) return 'model-gemini';
  if (model.includes('minimax') || model.includes('MiniMax')) return 'model-minmax';
  if (model.includes('qwen') || model.includes('ollama') || model.includes('127-0-0-1')) return 'model-local';
  return 'model-other';
}

function renderModel(data) {
  const el = document.getElementById('modelInfo');
  const badge = modelBadgeClass(data.openclaw.modelPrimary);
  el.innerHTML = `
    <p style="margin-bottom:8px">
      <span class="model-badge ${badge}">${data.openclaw.modelPrimary}</span>
    </p>
    <p style="font-size:12px;color:var(--text2)">Modo: <strong style="color:var(--text)">${data.openclaw.modelModeGuess}</strong></p>
    <p style="font-size:12px;color:var(--text2);margin-top:4px">Gateway: <code>${data.openclaw.gatewayUrl}</code></p>
  `;
  const openDash = document.getElementById('openDashboard');
  if (openDash) openDash.href = data.openclaw.dashboardUrl;
}

function renderJobs(data) {
  const tbody = document.getElementById('jobs');
  const rows = (data.activity.cronJobs || []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--text2)">Sin jobs / cron no disponible</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((j) => `
    <tr>
      <td>${j.name || '-'}</td>
      <td><code>${j.expr || '-'}</code></td>
      <td>${fmtDate(j.nextRunAtMs)}</td>
      <td class="${j.enabled ? 'ok' : 'warn'}">${j.enabled ? '● sí' : '○ no'}</td>
    </tr>`
  ).join('');
}

function renderUsage(data) {
  const usage = data.usage || {};
  const totals = usage.totals || {};
  const summary = document.getElementById('usageSummary');
  summary.innerHTML = [
    { label: `Tokens total (${usage.lookbackDays || 7}d)`, value: fmtNum(totals.total), className: 'ok' },
    { label: 'Input tokens', value: fmtNum(totals.input), className: 'info' },
    { label: 'Output tokens', value: fmtNum(totals.output), className: 'info' },
    { label: 'USD estimado', value: fmtMoney(totals.costUsd, 'USD'), className: totals.costUsd > 0.5 ? 'warn' : 'ok' },
    { label: `CLP estimado`, value: fmtMoney(totals.costClp, 'CLP'), className: totals.costClp > 500 ? 'warn' : 'ok' },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
  ).join('');

  const tbody = document.getElementById('usageModels');
  const rows = usage.models || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text2)">Sin datos de uso todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    const badge = modelBadgeClass(r.model);
    return `<tr>
      <td><span class="model-badge ${badge}">${r.model.split('/').pop()}</span>
        ${r.localEstimatedFree ? '<span class="ok" style="font-size:10px;margin-left:4px">local $0</span>' : ''}</td>
      <td>${fmtNum(r.usage.calls)}</td>
      <td>${fmtNum(r.usage.input)}</td>
      <td>${fmtNum(r.usage.output)}</td>
      <td>${fmtNum(r.usage.total)}</td>
      <td>${r.localEstimatedFree ? '<span style="color:var(--text2)">~$0</span>' : fmtMoney(r.costUsd, 'USD')}</td>
      <td>${r.localEstimatedFree ? '<span style="color:var(--text2)">~$0</span>' : fmtMoney(r.costClp, 'CLP')}</td>
    </tr>`;
  }).join('');
}

function renderProjects(data) {
  const projects = data.projects || {};
  const totals = projects.totals || {};
  const summary = document.getElementById('projectSummary');
  summary.innerHTML = [
    { label: 'Commits 24h', value: fmtNum(totals.commits24h), className: 'ok' },
    { label: 'Commits 7d',  value: fmtNum(totals.commits7d),  className: 'ok' },
    { label: 'Commits 30d', value: fmtNum(totals.commits30d), className: 'ok' },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
  ).join('');

  const tbody = document.getElementById('projects');
  const rows = projects.projects || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text2)">Sin repos.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((p) => {
    if (!p.exists) return `<tr><td>${p.label}</td><td colspan="4" class="warn">No encontrado en path</td></tr>`;
    const last = p.lastCommit ? `${(p.lastCommit.date || '').slice(0, 16)} · ${p.lastCommit.subject || ''}` : '-';
    return `<tr>
      <td><strong>${p.label}</strong></td>
      <td class="${p.commits24h > 0 ? 'ok' : ''}">${fmtNum(p.commits24h)}</td>
      <td>${fmtNum(p.commits7d)}</td>
      <td>${fmtNum(p.commits30d)}</td>
      <td style="font-size:11px;color:var(--text2)">${last}</td>
    </tr>`;
  }).join('');
}

// ── tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`tab-${name}`);
    if (panel) panel.classList.add('active');
  });
});

// ── main load ─────────────────────────────────────────────────────────────────
async function load() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const data = await res.json();
    renderSummary(data);
    renderConnections(data);
    renderModel(data);
    renderJobs(data);
    renderUsage(data);
    renderProjects(data);
    renderTelegram(data.activity.telegramEvents || []);
    renderLogContainer('openclawLogs', data.logs.openclaw || []);
    renderLogContainer('haLogs', data.logs.homeassistant || []);
    updateCharts(data.usage || {});
    setText('lastUpdate', `Última actualización: ${new Date().toLocaleString('es-CL')}`);
  } catch (e) {
    setText('lastUpdate', `Error: ${String(e.message || e)}`);
  }
}

document.getElementById('refreshBtn').addEventListener('click', load);
load();
setInterval(load, 30000);
