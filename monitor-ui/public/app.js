function fmtDate(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleString('es-CL');
}

function cls(ok) {
  return ok ? 'ok' : 'bad';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderSummary(data) {
  const box = document.getElementById('summary');
  const kpis = [
    { label: 'OpenClaw', value: data.openclaw.listening ? 'Activo' : 'Caído', className: cls(data.openclaw.listening) },
    { label: 'Home Assistant', value: data.homeassistant.httpOk ? `HTTP ${data.homeassistant.httpStatus}` : 'Sin respuesta', className: data.homeassistant.httpOk ? 'ok' : 'warn' },
    { label: 'Errores recientes', value: String(data.openclaw.errorCountRecent), className: data.openclaw.errorCountRecent > 0 ? 'warn' : 'ok' },
    { label: 'Uptime panel', value: `${Math.floor(data.uptimeSeconds / 60)} min`, className: 'ok' },
  ];
  box.innerHTML = kpis.map((k) => `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`).join('');
}

function renderConnections(data) {
  const el = document.getElementById('connections');
  const items = [
    `Gateway OpenClaw runtime (${data.openclaw.port}): ${data.openclaw.listening ? 'conectado' : 'sin escuchar'}`,
    `Gateway configurado (openclaw.json): ${data.openclaw.configuredPort}`,
    `Home Assistant (8123): ${data.homeassistant.listening8123 ? 'puerto activo' : 'puerto cerrado'}`,
    `Probe HTTP Home Assistant: ${data.homeassistant.httpOk ? 'OK' : `ERROR (${data.homeassistant.httpError || 'n/a'})`}`,
    `Telegram bot: ${data.openclaw.telegramEnabled ? `habilitado (${data.openclaw.telegramBot || 'default'})` : 'deshabilitado'}`,
  ];
  el.innerHTML = items.map((i) => `<li>${i}</li>`).join('');
}

function renderModel(data) {
  const el = document.getElementById('modelInfo');
  el.innerHTML = `
    <p><strong>Modelo actual:</strong> <code>${data.openclaw.modelPrimary}</code></p>
    <p><strong>Modo estimado:</strong> ${data.openclaw.modelModeGuess}</p>
    <p><strong>Gateway URL:</strong> <code>${data.openclaw.gatewayUrl}</code></p>
    <p><strong>Config:</strong> <code>${data.openclaw.configPath}</code></p>
  `;
  const openDash = document.getElementById('openDashboard');
  openDash.href = data.openclaw.dashboardUrl;
}

function renderJobs(data) {
  const tbody = document.getElementById('jobs');
  const rows = data.activity.cronJobs || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5">Sin jobs o no se pudo leer cron (${data.activity.cronError || 'n/a'})</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((j) => `
      <tr>
        <td>${j.name || '-'}</td>
        <td><code>${j.expr || '-'}</code></td>
        <td>${j.tz || '-'}</td>
        <td>${fmtDate(j.nextRunAtMs)}</td>
        <td class="${j.enabled ? 'ok' : 'warn'}">${j.enabled ? 'sí' : 'no'}</td>
      </tr>
    `)
    .join('');
}

function renderLogs(data) {
  setText('telegramEvents', (data.activity.telegramEvents || []).join('\n') || 'Sin eventos recientes');
  setText('openclawLogs', (data.logs.openclaw || []).join('\n') || 'Sin logs');
  setText('haLogs', (data.logs.homeassistant || []).join('\n') || 'Sin logs locales de Home Assistant');
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-CL');
}

function fmtMoney(n, currency = 'USD') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 4 }).format(Number(n || 0));
}

function renderUsage(data) {
  const usage = data.usage || {};
  const totals = usage.totals || {};
  const summary = document.getElementById('usageSummary');
  summary.innerHTML = [
    { label: `Tokens (${usage.lookbackDays || 7}d)`, value: fmtNum(totals.total), className: 'ok' },
    { label: 'Input', value: fmtNum(totals.input), className: 'ok' },
    { label: 'USD estimado', value: fmtMoney(totals.costUsd, 'USD'), className: 'warn' },
    { label: `CLP estimado (1 USD=${fmtNum(usage.usdClpRate || 0)})`, value: fmtMoney(totals.costClp, 'CLP'), className: 'warn' },
  ].map((k) => `<div class=\"kpi\"><div class=\"label\">${k.label}</div><div class=\"value ${k.className}\">${k.value}</div></div>`).join('');

  const tbody = document.getElementById('usageModels');
  const rows = usage.models || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan=\"5\">Sin datos de uso.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td><code>${r.model}</code>${r.localEstimatedFree ? ' <span class=\"ok\">(local)</span>' : ''}</td>
      <td>${fmtNum(r.usage.calls)}</td>
      <td>${fmtNum(r.usage.total)}</td>
      <td>${fmtMoney(r.costUsd, 'USD')}</td>
      <td>${fmtMoney(r.costClp, 'CLP')}</td>
    </tr>
  `).join('');
}

function renderProjects(data) {
  const projects = data.projects || {};
  const totals = projects.totals || {};
  const summary = document.getElementById('projectSummary');
  summary.innerHTML = [
    { label: 'Commits 24h', value: fmtNum(totals.commits24h), className: 'ok' },
    { label: 'Commits 7d', value: fmtNum(totals.commits7d), className: 'ok' },
    { label: 'Commits 30d', value: fmtNum(totals.commits30d), className: 'ok' },
  ].map((k) => `<div class=\"kpi\"><div class=\"label\">${k.label}</div><div class=\"value ${k.className}\">${k.value}</div></div>`).join('');

  const tbody = document.getElementById('projects');
  const rows = projects.projects || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan=\"5\">Sin repos detectados.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((p) => {
    if (!p.exists) {
      return `<tr><td>${p.label}</td><td colspan=\"4\" class=\"warn\">No encontrado en path configurado</td></tr>`;
    }
    const last = p.lastCommit ? `${p.lastCommit.date?.slice(0, 16) || ''} · ${p.lastCommit.author || ''} · ${p.lastCommit.subject || ''}` : '-';
    return `
      <tr>
        <td>${p.label}</td>
        <td>${fmtNum(p.commits24h)}</td>
        <td>${fmtNum(p.commits7d)}</td>
        <td>${fmtNum(p.commits30d)}</td>
        <td>${last}</td>
      </tr>
    `;
  }).join('');
}

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
    renderLogs(data);
    setText('lastUpdate', `Última actualización: ${new Date().toLocaleString('es-CL')}`);
  } catch (e) {
    setText('lastUpdate', `Error de actualización: ${String(e.message || e)}`);
  }
}

document.getElementById('refreshBtn').addEventListener('click', load);
load();
setInterval(load, 10000);
