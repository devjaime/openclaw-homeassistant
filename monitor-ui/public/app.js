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

async function load() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const data = await res.json();
    renderSummary(data);
    renderConnections(data);
    renderModel(data);
    renderJobs(data);
    renderLogs(data);
    setText('lastUpdate', `Última actualización: ${new Date().toLocaleString('es-CL')}`);
  } catch (e) {
    setText('lastUpdate', `Error de actualización: ${String(e.message || e)}`);
  }
}

document.getElementById('refreshBtn').addEventListener('click', load);
load();
setInterval(load, 10000);
