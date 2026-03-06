const LANG_KEY = 'monitor_lang';
let lang = localStorage.getItem(LANG_KEY) || 'es';
if (!['es', 'en'].includes(lang)) lang = 'es';

const I18N = {
  es: {
    title: 'Sala de trabajo OpenClaw',
    subtitle: 'Visual de tareas activas por proyecto y domótica',
    refresh: '↻ Actualizar',
    active: 'Activo',
    idle: 'En espera',
    down: 'Caído',
    unknown: 'Sin datos',
    workingOn: 'Trabajando en',
    lastEvent: 'Último evento',
    noMessage: 'Sin actividad detectada',
    kpiOpenclaw: 'OpenClaw',
    kpiHA: 'Home Assistant',
    kpiMode: 'Modo',
    kpiErrors: 'Errores recientes',
    taskVocari: 'Roadmap vocacional + contenidos',
    taskHumanloop: 'Flujos Airbnb + automatización',
    taskBlog: 'Borradores de marca personal',
    taskHA: 'Dispositivos, cámaras y automatizaciones',
  },
  en: {
    title: 'OpenClaw Workroom',
    subtitle: 'Live view of active tasks across projects and home automation',
    refresh: '↻ Refresh',
    active: 'Active',
    idle: 'Idle',
    down: 'Down',
    unknown: 'No data',
    workingOn: 'Working on',
    lastEvent: 'Last event',
    noMessage: 'No activity detected',
    kpiOpenclaw: 'OpenClaw',
    kpiHA: 'Home Assistant',
    kpiMode: 'Mode',
    kpiErrors: 'Recent errors',
    taskVocari: 'Vocational roadmap + content',
    taskHumanloop: 'Airbnb flows + automation',
    taskBlog: 'Personal brand drafts',
    taskHA: 'Devices, cameras and automations',
  },
};

const tr = (k) => I18N[lang]?.[k] || I18N.es[k] || k;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'es-CL') : '—');

function setTopText() {
  document.documentElement.lang = lang;
  const t = I18N[lang] || I18N.es;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('refreshBtn').textContent = t.refresh;
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = lang;
}

function kpi(label, value, cls = '') {
  return `<div class="kpi"><div class="k">${label}</div><div class="v ${cls}">${value}</div></div>`;
}

function getProjectRow(projects, id) {
  return (projects?.projects || []).find((p) => p.id === id || (p.label || '').toLowerCase().includes(id)) || null;
}

function computeDeskStatus(data, deskId) {
  const openclawUp = Boolean(data?.openclaw?.listening);
  const lastMsg = String(data?.lastActivity?.msg || '');
  const nowTask = lastMsg || tr('noMessage');
  const ts = data?.lastActivity?.ts || null;
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
    const active = openclawUp && Number(row?.commits7d || 0) >= 0;
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
    const active = openclawUp && Number(row?.commits7d || 0) >= 0;
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
    last: `${tr('lastEvent')}: ${nowTask.slice(0, 80)}`,
  };
}

function paintDesk(id, desk) {
  const root = document.getElementById(`desk-${id}`);
  if (!root) return;
  const state = root.querySelector('[data-state]');
  const screen = root.querySelector('[data-screen]');
  const task = root.querySelector('[data-task]');
  const last = root.querySelector('[data-last]');
  if (state) {
    state.className = `desk-state ${desk.stateClass}`;
    state.textContent = desk.state || tr('unknown');
  }
  if (screen) screen.textContent = desk.screen || tr('unknown');
  if (task) task.textContent = `${tr('workingOn')}: ${desk.task || tr('unknown')}`;
  if (last) last.textContent = desk.last || '';
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

async function load() {
  const res = await fetch('/api/status', { cache: 'no-store' });
  const data = await res.json();
  renderSummary(data);
  paintDesk('vocari', computeDeskStatus(data, 'vocari'));
  paintDesk('humanloop', computeDeskStatus(data, 'humanloop'));
  paintDesk('blog', computeDeskStatus(data, 'blog'));
  paintDesk('ha', computeDeskStatus(data, 'ha'));
}

document.getElementById('refreshBtn')?.addEventListener('click', load);
document.getElementById('langSelect')?.addEventListener('change', async (e) => {
  const next = String(e.target?.value || 'es');
  if (!['es', 'en'].includes(next)) return;
  lang = next;
  localStorage.setItem(LANG_KEY, next);
  setTopText();
  await load();
});

setTopText();
load();
setInterval(load, 15000);
