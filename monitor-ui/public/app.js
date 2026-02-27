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
function fmtMaybeMoney(value, currency = 'USD') {
  const num = Number(value);
  return Number.isFinite(num) ? fmtMoney(num, currency) : '—';
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
  // Show: real cost + equivalent cloud cost side by side as doughnut
  const allLabels = [];
  const allData   = [];
  const allColors = [];
  models.forEach((m, i) => {
    const baseColor = CHART_COLORS[i % CHART_COLORS.length];
    if (m.localEstimatedFree) {
      // local: show equivalent cloud cost in yellow
      allLabels.push(`${m.model.split('/').pop()} (equiv.☁️)`);
      allData.push(m.equivalentCostUsd || 0);
      allColors.push('rgba(245,158,11,0.75)');
    } else {
      allLabels.push(m.model.split('/').pop());
      allData.push(m.costUsd || 0);
      allColors.push(baseColor);
    }
  });
  return {
    labels: allLabels,
    datasets: [{ data: allData, backgroundColor: allColors, borderWidth: 0 }],
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
          tooltip: {
            backgroundColor: '#1a1d27', titleColor: '#e2e8f0', bodyColor: '#94a3b8',
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                return val === 0 ? ' $0 (gratis)' : ` US$${val.toFixed(4)}`;
              },
            },
          },
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

async function callServiceAction(service, action) {
  const res = await fetch('/api/service-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, action }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = data?.message || `Fallo en ${service} ${action}`;
    throw new Error(err);
  }
  return data;
}

function renderServiceControls(data) {
  const root = document.getElementById('serviceControls');
  if (!root) return;
  const services = data.services || {};
  const ordered = ['openclaw', 'homeassistant', 'n8n']
    .map((id) => services[id])
    .filter(Boolean);

  root.innerHTML = ordered.map((s) => `
    <div class="svc-card" data-service="${s.id}">
      <div class="svc-head">
        <div class="svc-title">${s.label}</div>
        <span class="svc-state ${s.running ? 'on' : 'off'}">${s.running ? 'ACTIVO' : 'CAIDO'}</span>
      </div>
      <div class="svc-detail">${s.detail || ''}</div>
      <div class="svc-actions">
        <button class="svc-btn start" data-action="start">Iniciar</button>
        <button class="svc-btn restart" data-action="restart">Reiniciar</button>
        <button class="svc-btn stop" data-action="stop">Detener</button>
      </div>
      <div class="svc-feedback" id="svc-msg-${s.id}"></div>
    </div>
  `).join('');

  root.querySelectorAll('.svc-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.svc-card');
      if (!card) return;
      const service = card.dataset.service;
      const action = btn.dataset.action;
      const msg = document.getElementById(`svc-msg-${service}`);
      const buttons = card.querySelectorAll('.svc-btn');
      buttons.forEach((b) => { b.disabled = true; });
      if (msg) msg.textContent = `Ejecutando ${action}...`;
      try {
        const out = await callServiceAction(service, action);
        if (msg) msg.textContent = out.message || 'OK';
        await load();
      } catch (e) {
        if (msg) msg.textContent = `Error: ${String(e.message || e)}`;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
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
  const budget = usage.budget || {};
  const credits = usage.openrouterCredits || {};
  const spendSource = budget.openrouterSpendSource === 'openrouter_api_reset_window'
    ? 'OpenRouter API (desde reset)'
    : budget.openrouterSpendSource === 'openrouter_api_total'
      ? 'OpenRouter API (total cuenta)'
      : 'logs + ledger (estimado)';
  const summary = document.getElementById('usageSummary');
  const resetInfo = document.getElementById('usageResetInfo');
  summary.innerHTML = [
    { label: `Tokens total (${usage.lookbackDays || 7}d)`, value: fmtNum(totals.total), className: 'ok' },
    { label: 'Input tokens', value: fmtNum(totals.input), className: 'info' },
    { label: 'Output tokens', value: fmtNum(totals.output), className: 'info' },
    { label: 'Costo real USD', value: fmtMoney(totals.costUsd, 'USD'), className: totals.costUsd > 0.5 ? 'warn' : 'ok' },
    { label: 'Costo real CLP', value: fmtMoney(totals.costClp, 'CLP'), className: totals.costClp > 500 ? 'warn' : 'ok' },
    { label: '☁️ Equiv. cloud USD', value: fmtMoney((totals.costUsd || 0) + (totals.equivalentCostUsd || 0), 'USD'), className: 'warn' },
    { label: '💰 Ahorro USD (local)', value: fmtMoney(totals.savedUsd || 0, 'USD'), className: 'ok' },
    { label: `OpenRouter usado (${(budget.openrouterUsedPct || 0).toFixed(1)}%)`, value: `${fmtMoney(budget.openrouterUsdSpent || 0, 'USD')} / ${fmtMoney(budget.openrouterUsdBudget || 0, 'USD')}`, className: (budget.openrouterUsedPct || 0) > 80 ? 'bad' : ((budget.openrouterUsedPct || 0) > 60 ? 'warn' : 'ok') },
    { label: 'OpenRouter restante (crédito)', value: credits.ok ? fmtMoney(credits.remainingUsd || 0, 'USD') : fmtMoney(budget.openrouterUsdRemaining || 0, 'USD'), className: (budget.openrouterUsdRemaining || 0) < 2 ? 'warn' : 'ok' },
    { label: 'Fuente de gasto OpenRouter', value: spendSource, className: 'info' },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
  ).join('');
  if (resetInfo) {
    if (usage.resetAtMs) {
      resetInfo.textContent = `Contadores reseteados el ${fmtDate(usage.resetAtMs)} · ventana activa desde ${fmtDate(usage.windowStartAtMs)}`;
    } else {
      resetInfo.textContent = `Sin reset manual activo · ventana activa desde ${fmtDate(usage.windowStartAtMs)}`;
    }
  }

  const tbody = document.getElementById('usageModels');
  const rows = usage.models || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="color:var(--text2)">Sin datos de uso todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    const badge = modelBadgeClass(r.model);
    const realCost = r.localEstimatedFree
      ? `<span style="color:var(--green);font-weight:700">$0 <span style="font-size:10px;font-weight:400">(gratis)</span></span>`
      : fmtMoney(r.costUsd, 'USD');
    const realCostClp = r.localEstimatedFree
      ? `<span style="color:var(--green);font-weight:700">$0</span>`
      : fmtMoney(r.costClp, 'CLP');
    const eqCost = r.localEstimatedFree
      ? `<span style="color:var(--yellow)">${fmtMoney(r.equivalentCostUsd, 'USD')}</span>`
      : `<span style="color:var(--text2)">—</span>`;
    const eqCostClp = r.localEstimatedFree
      ? `<span style="color:var(--yellow)">${fmtMoney(r.equivalentCostClp, 'CLP')}</span>`
      : `<span style="color:var(--text2)">—</span>`;
    const sourceLabel = r.costSource === 'reported'
      ? '<span style="color:var(--green)">reportado API</span>'
      : '<span style="color:var(--yellow)">estimado</span>';
    return `<tr>
      <td><span class="model-badge ${badge}">${r.model.split('/').pop()}</span>
        ${r.localEstimatedFree ? ' <span style="font-size:10px;color:var(--green)">● local</span>' : ''}</td>
      <td>${fmtNum(r.usage.calls)}</td>
      <td>${fmtNum(r.usage.input)}</td>
      <td>${fmtNum(r.usage.output)}</td>
      <td>${fmtNum(r.usage.total)}</td>
      <td>${realCost}</td>
      <td>${realCostClp}</td>
      <td>${eqCost}</td>
      <td>${eqCostClp}</td>
      <td>${sourceLabel}</td>
    </tr>`;
  }).join('');
}

function renderOpenRouter(data) {
  const usage = data.usage || {};
  const orUsage = usage.openrouter || {};
  const totals = orUsage.totals || {};
  const budget = usage.budget || {};
  const credits = usage.openrouterCredits || {};
  const spendSource = budget.openrouterSpendSource === 'openrouter_api_reset_window'
    ? 'OpenRouter API (desde reset)'
    : budget.openrouterSpendSource === 'openrouter_api_total'
      ? 'OpenRouter API (total cuenta)'
      : 'Logs/Ledger';
  const summary = document.getElementById('openrouterSummary');
  if (summary) {
    summary.innerHTML = [
      { label: 'OpenRouter calls', value: fmtNum(totals.calls), className: 'info' },
      { label: 'Tokens OpenRouter', value: fmtNum(totals.totalTokens), className: 'ok' },
      { label: 'Crédito total OpenRouter', value: fmtMaybeMoney(credits.totalCreditsUsd, 'USD'), className: 'info' },
      { label: 'Crédito restante OpenRouter', value: fmtMaybeMoney(credits.remainingUsd, 'USD'), className: (Number(credits.remainingUsd) < 2 ? 'warn' : 'ok') },
      { label: 'Gasto total API OpenRouter', value: fmtMaybeMoney(credits.totalUsageUsd, 'USD'), className: 'warn' },
      { label: 'Gasto OpenRouter desde reset', value: fmtMoney(budget.openrouterUsdSpent || 0, 'USD'), className: (budget.openrouterUsedPct || 0) > 80 ? 'bad' : 'ok' },
      { label: 'Gasto OpenRouter por logs', value: fmtMoney(budget.openrouterLogsWindowUsd || totals.costUsd || 0, 'USD'), className: 'info' },
      { label: 'Fuente de gasto', value: spendSource, className: 'info' },
      { label: 'Ledger externo', value: fmtMoney(budget.externalLedgerUsd || 0, 'USD'), className: 'info' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
  }

  const tbody = document.getElementById('openrouterModels');
  if (!tbody) return;
  const rows = orUsage.models || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text2)">Sin uso OpenRouter en la ventana actual.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    const sourceLabel = r.costSource === 'reported'
      ? '<span style="color:var(--green)">reportado API</span>'
      : '<span style="color:var(--yellow)">estimado</span>';
    return `<tr>
      <td><span class="model-badge model-other">${r.model.split('/').pop()}</span></td>
      <td>${fmtNum(r.usage.calls)}</td>
      <td>${fmtNum(r.usage.input)}</td>
      <td>${fmtNum(r.usage.output)}</td>
      <td>${fmtNum(r.usage.total)}</td>
      <td>${fmtMoney(r.costUsd, 'USD')}</td>
      <td>${fmtMoney(r.costClp, 'CLP')}</td>
      <td>${sourceLabel}</td>
    </tr>`;
  }).join('');
}

// ── última actividad ──────────────────────────────────────────────────────────
const TRIGGER_ICONS = {
  telegram: '✈️ Telegram',
  cron:     '⏰ Cron job',
  discord:  '💬 Discord',
  slack:    '🔔 Slack',
  'api/manual': '🖥️ API / manual',
};

function renderLastActivity(data) {
  const el = document.getElementById('lastActivity');
  if (!el) return;
  const act = data.lastActivity;
  if (!act) {
    el.innerHTML = '<span style="color:var(--text2);font-size:13px">Sin actividad detectada todavía.</span>';
    return;
  }
  const tsStr = act.ts ? new Date(act.ts).toLocaleString('es-CL', { dateStyle: 'full', timeStyle: 'medium' }) : '—';
  const triggerLabel = TRIGGER_ICONS[act.trigger] || act.trigger || '—';
  const roleLabel = act.role ? `<span style="color:var(--text2);font-size:11px">[${act.role}]</span> ` : '';
  const msgEscaped = (act.msg || 'Sin detalle disponible').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  el.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div class="kpi" style="min-width:180px">
        <div class="label">Fecha y hora</div>
        <div class="value ok" style="font-size:14px">${tsStr}</div>
      </div>
      <div class="kpi" style="min-width:140px">
        <div class="label">Llamado por</div>
        <div class="value info" style="font-size:15px">${triggerLabel}</div>
      </div>
      <div class="kpi" style="flex:1;min-width:260px">
        <div class="label">Último mensaje / acción</div>
        <div style="font-size:12px;font-family:var(--font);margin-top:4px;color:var(--text);word-break:break-word">
          ${roleLabel}${msgEscaped}
        </div>
      </div>
    </div>`;
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

function renderApple(data) {
  const apple = data.apple || {};
  const summary = document.getElementById('appleSummary');
  const devices = Array.isArray(apple.devices) ? apple.devices : [];
  const metrics = Array.isArray(apple.metrics) ? apple.metrics : [];
  const notifyTargets = Array.isArray(apple.notifyTargets) ? apple.notifyTargets : [];
  const mapHint = document.getElementById('appleMapHint');

  if (summary) {
    summary.innerHTML = [
      { label: 'Apple devices detectados', value: fmtNum(devices.length), className: devices.length ? 'ok' : 'warn' },
      { label: 'Sensores Apple', value: fmtNum(metrics.length), className: metrics.length ? 'ok' : 'warn' },
      { label: 'Canales notify disponibles', value: fmtNum(notifyTargets.length), className: notifyTargets.length ? 'ok' : 'warn' },
      { label: 'Estado integración', value: apple.ok ? 'Conectado' : `Error: ${apple.error || 'sin token'}`, className: apple.ok ? 'ok' : 'bad' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
  }

  if (mapHint) {
    if (apple.mapCenter && Number.isFinite(Number(apple.mapCenter.latitude)) && Number.isFinite(Number(apple.mapCenter.longitude))) {
      const lat = Number(apple.mapCenter.latitude).toFixed(6);
      const lon = Number(apple.mapCenter.longitude).toFixed(6);
      mapHint.innerHTML = `Centro de mapa sugerido: <code>${lat},${lon}</code> · <a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}">Abrir mapa</a>`;
    } else {
      mapHint.textContent = 'Sin coordenadas GPS disponibles (revisa permisos de ubicación en app Home Assistant Companion).';
    }
  }

  const deviceBody = document.getElementById('appleDevices');
  if (deviceBody) {
    if (!devices.length) {
      deviceBody.innerHTML = '<tr><td colspan="6" style="color:var(--text2)">Sin dispositivos Apple detectados en device_tracker.</td></tr>';
    } else {
      deviceBody.innerHTML = devices.map((d) => {
        const hasGps = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude));
        const gps = hasGps ? `${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}` : '—';
        const map = hasGps
          ? `<a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${Number(d.latitude).toFixed(6)}&mlon=${Number(d.longitude).toFixed(6)}#map=16/${Number(d.latitude).toFixed(6)}/${Number(d.longitude).toFixed(6)}">Ver mapa</a>`
          : '—';
        const battery = d.battery != null ? `${d.battery}%` : '—';
        return `<tr>
          <td>${d.name}</td>
          <td>${d.state || '-'}</td>
          <td>${battery}</td>
          <td>${gps}</td>
          <td>${map}</td>
          <td>${d.lastUpdated ? new Date(d.lastUpdated).toLocaleString('es-CL') : '-'}</td>
        </tr>`;
      }).join('');
    }
  }

  const metricsBody = document.getElementById('appleMetrics');
  if (metricsBody) {
    if (!metrics.length) {
      metricsBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2)">Sin métricas Apple disponibles.</td></tr>';
    } else {
      metricsBody.innerHTML = metrics.slice(0, 40).map((m) => `<tr>
        <td>${m.name}</td>
        <td>${m.state ?? '-'}</td>
        <td>${m.unit || '-'}</td>
        <td>${m.deviceClass || '-'}</td>
        <td>${m.lastUpdated ? new Date(m.lastUpdated).toLocaleString('es-CL') : '-'}</td>
      </tr>`).join('');
    }
  }

  const notifySelect = document.getElementById('appleNotifyTarget');
  if (notifySelect) {
    const prev = notifySelect.value;
    const opts = notifyTargets.length
      ? notifyTargets.map((t) => `<option value="${t.id}">${t.id}</option>`).join('')
      : '<option value="">Sin canales notify.mobile_app</option>';
    notifySelect.innerHTML = opts;
    if (prev && [...notifySelect.options].some((o) => o.value === prev)) notifySelect.value = prev;
  }
}

async function sendAppleNotify() {
  const target = document.getElementById('appleNotifyTarget')?.value || '';
  const message = document.getElementById('appleNotifyMessage')?.value?.trim() || '';
  const statusEl = document.getElementById('appleNotifyStatus');
  if (!target) {
    if (statusEl) statusEl.textContent = 'No hay target notify seleccionado.';
    return;
  }
  if (!message) {
    if (statusEl) statusEl.textContent = 'Escribe un mensaje antes de enviar.';
    return;
  }
  if (statusEl) statusEl.textContent = 'Enviando...';
  try {
    const res = await fetch('/api/apple/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'Error enviando notify');
    if (statusEl) statusEl.textContent = data.message || 'Mensaje enviado.';
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${String(e.message || e)}`;
  }
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
    renderServiceControls(data);
    renderJobs(data);
    renderUsage(data);
    renderOpenRouter(data);
    renderProjects(data);
    renderApple(data);
    renderTelegram(data.activity.telegramEvents || []);
    renderLogContainer('openclawLogs', data.logs.openclaw || []);
    renderLogContainer('haLogs', data.logs.homeassistant || []);
    renderLastActivity(data);
    updateCharts(data.usage || {});
    setText('lastUpdate', `Última actualización: ${new Date().toLocaleString('es-CL')}`);
  } catch (e) {
    setText('lastUpdate', `Error: ${String(e.message || e)}`);
  }
}

async function copyGatewayAuth() {
  const btn = document.getElementById('copyGatewayAuthBtn');
  const original = btn ? btn.textContent : '';
  try {
    if (btn) btn.textContent = 'Copiando...';
    const res = await fetch('/api/gateway-auth', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || 'No se pudo leer auth del gateway');
    }
    const text = `URL: ${data.gatewayUrl}\nTOKEN: ${data.token}`;
    await navigator.clipboard.writeText(text);
    if (btn) btn.textContent = '✅ Copiado';
  } catch (e) {
    if (btn) btn.textContent = '❌ Error';
    alert(`No se pudo copiar token: ${String(e.message || e)}`);
  } finally {
    if (btn) setTimeout(() => { btn.textContent = original || '🔑 Copiar token'; }, 1600);
  }
}

async function refreshUpdateStatus() {
  const pill = document.getElementById('updateStatusPill');
  if (!pill) return;
  try {
    const res = await fetch('/api/update-status', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'status no disponible');
    const installed = data.installed || '-';
    const latest = data.latest || '-';
    if (data.available) {
      pill.className = 'update-pill warn';
      pill.textContent = `Update: ${installed} -> ${latest}`;
    } else {
      pill.className = 'update-pill ok';
      pill.textContent = `Update: al día (${installed})`;
    }
  } catch (e) {
    pill.className = 'update-pill bad';
    pill.textContent = 'Update: error';
  }
}

async function resetUsageCounters() {
  const ok = confirm('Esto reseteará los contadores de tokens y costos desde este momento. ¿Continuar?');
  if (!ok) return;
  const btn = document.getElementById('resetUsageBtn');
  const original = btn ? btn.textContent : '';
  try {
    if (btn) {
      btn.textContent = 'Reseteando...';
      btn.disabled = true;
    }
    const res = await fetch('/api/usage/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'No se pudo resetear métricas');
    await load();
    const snap = data?.openrouterSnapshot?.ok
      ? ` Crédito OpenRouter al reset: ${fmtMoney(data.openrouterSnapshot.remainingUsd, 'USD')}.`
      : '';
    alert(`Contadores reseteados en ${fmtDate(data.resetAtMs)}.${snap}`);
  } catch (e) {
    alert(`Error al resetear métricas: ${String(e.message || e)}`);
  } finally {
    if (btn) {
      btn.textContent = original || '⟲ Reset métricas';
      btn.disabled = false;
    }
  }
}

document.getElementById('refreshBtn').addEventListener('click', load);
document.getElementById('resetUsageBtn')?.addEventListener('click', resetUsageCounters);
document.getElementById('refreshUpdateBtn')?.addEventListener('click', refreshUpdateStatus);
document.getElementById('copyGatewayAuthBtn')?.addEventListener('click', copyGatewayAuth);
document.getElementById('appleNotifySend')?.addEventListener('click', sendAppleNotify);
load();
refreshUpdateStatus();
setInterval(load, 30000);
setInterval(refreshUpdateStatus, 60000);
