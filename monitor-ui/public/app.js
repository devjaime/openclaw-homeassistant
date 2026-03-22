// ── helpers ──────────────────────────────────────────────────────────────────
const SECTION_AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const SECTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const AUTO_REFRESH_ENABLED_KEY = 'monitor_auto_refresh_enabled';
const AUTO_REFRESH_INTERVAL_KEY = 'monitor_auto_refresh_interval_ms';
const DEFAULT_AUTO_REFRESH_INTERVAL_MS = 120000;
const ACTIVITY_REFRESH_DEBOUNCE_MS = 12000;

let inactivityRefreshTimerId = null;
let autoRefreshEnabled = true;
let autoRefreshIntervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS;
let lastUserActivityAtMs = Date.now();
let worldUserLocation = null;
let worldUserLocationState = 'idle';
let worldUserLocationMessage = '';
const TOOLBAR_ADVANCED_COLLAPSED_KEY = 'monitor_toolbar_advanced_collapsed';
let toolbarAdvancedCollapsed = true;
const sectionFetchedAt = new Map();
let statusCache = { data: null, fetchedAt: 0, signature: '' };
let worldMap = null;
let worldNodeLayer = null;
let worldLinkLayer = null;
let worldMapHasFitted = false;
let worldMapLastOriginKey = '';

function isUserEditing() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

function getIntervalLabel(ms) {
  const n = Number(ms || DEFAULT_AUTO_REFRESH_INTERVAL_MS);
  if (!Number.isFinite(n) || n <= 0) return '2m';
  if (n < 60000) return `${Math.round(n / 1000)}s`;
  return `${Math.round(n / 60000)}m`;
}

function normalizeAutoRefreshInterval(ms) {
  const n = Number(ms);
  const allowed = [30000, 60000, 120000, 300000];
  return allowed.includes(n) ? n : DEFAULT_AUTO_REFRESH_INTERVAL_MS;
}

function updateToolbarAdvancedUi() {
  const box = document.getElementById('toolbarAdvanced');
  const btn = document.getElementById('toolbarToggleBtn');
  if (box) box.classList.toggle('collapsed', toolbarAdvancedCollapsed);
  if (btn) btn.setAttribute('aria-expanded', toolbarAdvancedCollapsed ? 'false' : 'true');
}

function renderAutoRefreshStatus() {
  const statusEl = document.getElementById('autoRefreshStatus');
  const toggleEl = document.getElementById('autoRefreshToggle');
  const intervalEl = document.getElementById('autoRefreshInterval');
  if (toggleEl) toggleEl.checked = !!autoRefreshEnabled;
  if (intervalEl) intervalEl.value = String(autoRefreshIntervalMs);
  if (!statusEl) return;
  const state = autoRefreshEnabled ? t('autoOn') : t('autoOff');
  const effectiveIntervalMs = Math.max(autoRefreshIntervalMs, STATUS_CACHE_TTL_MS);
  statusEl.textContent = t('autoRefreshStatus', {
    state,
    interval: getIntervalLabel(effectiveIntervalMs),
  });
}

function resetInactivityRefreshTimer() {
  if (inactivityRefreshTimerId) clearTimeout(inactivityRefreshTimerId);
  inactivityRefreshTimerId = null;
  if (!autoRefreshEnabled) return;
  const effectiveIntervalMs = Math.max(autoRefreshIntervalMs, STATUS_CACHE_TTL_MS);
  inactivityRefreshTimerId = setTimeout(async () => {
    if (!autoRefreshEnabled) return;
    if (isUserEditing()) {
      resetInactivityRefreshTimer();
      return;
    }
    await load({ showLoading: false });
    await refreshUpdateStatus();
    resetInactivityRefreshTimer();
  }, effectiveIntervalMs);
}

function registerUserActivity() {
  if (!autoRefreshEnabled) return;
  const now = Date.now();
  if ((now - lastUserActivityAtMs) < ACTIVITY_REFRESH_DEBOUNCE_MS) return;
  lastUserActivityAtMs = now;
  resetInactivityRefreshTimer();
}

function scheduleGlobalRefreshTimers() {
  if (inactivityRefreshTimerId) clearTimeout(inactivityRefreshTimerId);
  inactivityRefreshTimerId = null;
  if (!autoRefreshEnabled) return;
  resetInactivityRefreshTimer();
}

/** Fetch wrapper que incluye X-Dashboard-Token si está configurado (task 5.1). */
function apiFetch(path, options = {}) {
  const token = window.DASHBOARD_TOKEN || localStorage.getItem('dashboard_token') || '';
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-Dashboard-Token'] = token;
  return fetch(path, { ...options, headers });
}

// ── Navigation (shell layout) ─────────────────────────────────────────────────
const SECTION_TITLES = {
  dashboard: 'Dashboard', workroom: 'Workroom',
  audit: 'Audit de Prompts', crons: 'Cronjobs',
  multiagent: 'Multi-Agente', models: 'Modelos Locales',
  programmer: 'Modo Programador', settings: 'Ajustes',
};

function shouldFetchSection(sectionId, force = false) {
  if (force) return true;
  const last = n(sectionFetchedAt.get(sectionId));
  if (!last) return true;
  return (Date.now() - last) >= SECTION_CACHE_TTL_MS;
}

function markSectionFetched(sectionId) {
  sectionFetchedAt.set(sectionId, Date.now());
}

function navigateTo(sectionId) {
  const sections = document.querySelectorAll('.section');
  const navItems = document.querySelectorAll('.nav-item');
  const run = () => {
    sections.forEach((s) => s.classList.remove('active'));
    navItems.forEach((n) => n.classList.remove('active'));
    const target = document.getElementById(`section-${sectionId}`);
    if (target) target.classList.add('active');
    const navItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (navItem) navItem.classList.add('active');
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = SECTION_TITLES[sectionId] || sectionId;
    if (sectionId === 'crons' && shouldFetchSection('crons')) {
      fetchCrons().finally(() => markSectionFetched('crons'));
    }
    if (sectionId === 'audit' && shouldFetchSection('audit')) {
      fetchAuditLog().finally(() => markSectionFetched('audit'));
    }
    if (sectionId === 'autonomous' && shouldFetchSection('autonomous')) {
      Promise.all([fetchAutoHistory(), fetchAutoStatus()]).finally(() => markSectionFetched('autonomous'));
    }
    if (sectionId === 'multiagent' && shouldFetchSection('multiagent')) {
      Promise.all([fetchMultiAgent(), fetchMultiAgentSessions()]).finally(() => markSectionFetched('multiagent'));
    }
    if (sectionId === 'models' && shouldFetchSection('models')) {
      Promise.all([fetchLocalModels(), fetchModelCapabilities()]).finally(() => markSectionFetched('models'));
    }
    if (sectionId === 'programmer' && shouldFetchSection('programmer')) {
      fetchOpenCodeStatus().finally(() => markSectionFetched('programmer'));
    }
    if (sectionId === 'neo4j' && shouldFetchSection('neo4j')) {
      fetchNeo4jStatus().finally(() => markSectionFetched('neo4j'));
    }
    closeSidebar();
  };
  if (document.startViewTransition) {
    document.startViewTransition(run);
  } else {
    run();
  }
}

function toggleSidebar() {
  document.getElementById('app-shell')?.classList.toggle('sidebar-open');
}
function closeSidebar() {
  document.getElementById('app-shell')?.classList.remove('sidebar-open');
}

// ── Toast system ──────────────────────────────────────────────────────────────
function showToast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' }[type] || 'ℹ';
  toast.innerHTML = `<span style="font-weight:700">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}

// ── Lucide icons init ─────────────────────────────────────────────────────────
function initLucide() {
  if (window.lucide) window.lucide.createIcons();
}

// ── Cronjobs ──────────────────────────────────────────────────────────────────
let _cronsIntervalId = null;

async function fetchCrons() {
  const tbody = document.getElementById('crons-tbody');
  const summary = document.getElementById('cron-summary-block');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px"><div class="skeleton skeleton-text" style="margin:auto;width:120px"></div></td></tr>';
  try {
    const res = await apiFetch('/api/crons', { cache: 'no-store' });
    const data = await res.json();
    renderCronTable(data.jobs || []);
    if (summary) {
      const active = (data.jobs || []).filter((j) => j.enabled).length;
      summary.innerHTML = `<div style="font-size:24px;font-weight:700">${active}</div><div style="color:var(--color-text-muted);font-size:12px">${active === 1 ? 'job activo' : 'jobs activos'} de ${(data.jobs || []).length} total</div>`;
    }
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-destructive);padding:24px">Error cargando cronjobs</td></tr>`;
  }
}

function cronExprHuman(expr) {
  try { return window.cronstrue ? cronstrue.toString(expr, { locale: 'es' }) : expr; } catch { return expr; }
}

function cronNextRun(nextRunAtMs) {
  if (!nextRunAtMs) return '—';
  const diff = nextRunAtMs - Date.now();
  if (diff < 0) return 'vencido';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `en ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h}h ${m % 60}m`;
  return `en ${Math.floor(h / 24)}d`;
}

function renderCronTable(jobs) {
  const tbody = document.getElementById('crons-tbody');
  if (!tbody) return;
  if (!jobs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:32px">Sin cronjobs registrados</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.map((j) => {
    const dotClass = j.enabled ? 'active' : 'paused';
    const dotLabel = j.enabled ? 'Activo' : 'Pausado';
    const toggleLabel = j.enabled ? 'Pausar' : 'Reactivar';
    const toggleAction = j.enabled ? 'pause' : 'resume';
    return `<tr id="cron-row-${j.id}">
      <td><span class="cron-dot ${dotClass}" title="${dotLabel}"></span></td>
      <td style="font-weight:500">${escHtml(j.name || j.id)}</td>
      <td><code style="font-family:var(--font-mono);font-size:12px;color:var(--color-accent)">${escHtml(j.expr)}</code><br><span style="font-size:11px;color:var(--color-text-muted)">${cronExprHuman(j.expr)}</span></td>
      <td style="color:var(--color-text-muted);font-size:12.5px">${cronNextRun(j.nextRunAtMs)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="cronAction('${j.id}','${toggleAction}')">${toggleLabel}</button>
          <button class="btn btn-ghost btn-sm" onclick="cronExtend('${j.id}')">+1h</button>
          <button class="btn btn-destructive btn-sm" onclick="cronDelete('${j.id}','${escHtml(j.name || j.id)}')">Eliminar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function cronAction(id, action) {
  try {
    const res = await apiFetch(`/api/crons/${id}/${action}`, { method: 'POST', headers: {'Content-Type':'application/json'} });
    const data = await res.json();
    if (data.ok) { showToast(`Job ${action === 'pause' ? 'pausado' : 'reactivado'}`, 'success'); fetchCrons(); }
    else showToast(data.message || 'Error', 'error');
  } catch { showToast('Error de red', 'error'); }
}

async function cronExtend(id) {
  try {
    const res = await apiFetch(`/api/crons/${id}/extend`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ delayMs: 3600000 }) });
    const data = await res.json();
    if (data.ok) showToast('Próxima ejecución extendida +1h', 'success');
    else showToast(data.message || 'Error', 'error');
  } catch { showToast('Error de red', 'error'); }
}

async function cronDelete(id, name) {
  if (!confirm(`¿Eliminar el cronjob "${name}"? Esta acción no se puede deshacer.`)) return;
  try {
    const res = await apiFetch(`/api/crons/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      const row = document.getElementById(`cron-row-${id}`);
      if (row) { row.style.opacity = '0'; row.style.transition = 'opacity 200ms'; setTimeout(() => row.remove(), 200); }
      showToast('Job eliminado', 'success');
    } else showToast(data.message || 'Error al eliminar', 'error');
  } catch { showToast('Error de red', 'error'); }
}

// ── Audit log ─────────────────────────────────────────────────────────────────
let _auditFilter = '';
let _pendingAuditId = null;

function setAuditFilter(el, filter) {
  _auditFilter = filter;
  document.querySelectorAll('#audit-filter-chips .chip').forEach((c) => c.classList.remove('active'));
  el.classList.add('active');
  fetchAuditLog();
}

async function fetchAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px"><div class="skeleton skeleton-text" style="margin:auto;width:120px"></div></td></tr>';
  try {
    const params = new URLSearchParams({ limit: 50 });
    if (_auditFilter) params.set('criticality', _auditFilter);
    const res = await apiFetch(`/api/audit/log?${params}`, { cache: 'no-store' });
    const data = await res.json();
    renderAuditTable(data.entries || []);
    // Update pending badge
    const pendingRes = await apiFetch('/api/audit/pending', { cache: 'no-store' });
    const pendingData = await pendingRes.json();
    const badge = document.getElementById('audit-pending-badge');
    if (badge) {
      const count = (pendingData.entries || []).length;
      badge.textContent = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  } catch {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-destructive);padding:24px">Error cargando audit log</td></tr>';
  }
}

const CRITICALITY_BADGE = {
  CRITICAL: 'badge badge-critical',
  HIGH: 'badge badge-high',
  MEDIUM: 'badge badge-medium',
  LOW: 'badge badge-low',
};

function renderAuditTable(entries) {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:32px">Sin entradas en el audit log</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map((e) => {
    const badgeClass = CRITICALITY_BADGE[e.criticality] || 'badge badge-low';
    const statusBadge = e.status === 'approved'
      ? '<span class="badge badge-success">✓ Aprobado</span>'
      : e.status === 'denied'
        ? '<span class="badge badge-critical">✕ Denegado</span>'
        : '<span class="badge">pendiente</span>';
    const canReview = ['CRITICAL','HIGH'].includes(e.criticality) && e.status === 'logged';
    const reviewBtn = canReview
      ? `<button class="btn btn-ghost btn-sm" onclick="openAuditModal('${e.id}','${escHtml(e.criticality)}','${escHtml(e.label || '')}','${escHtml(e.description || '')}','${escHtml(e.command || '')}')">Revisar</button>`
      : '';
    const ts = e.ts ? new Date(e.ts).toLocaleString('es-CL', { dateStyle:'short', timeStyle:'short' }) : '—';
    return `<tr>
      <td><span class="${badgeClass}">${escHtml(e.label || e.criticality)}</span></td>
      <td style="font-family:var(--font-mono);font-size:11.5px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.command)}">${escHtml((e.command || '').slice(0, 80))}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:var(--color-text-muted)">${ts}</td>
      <td>${reviewBtn}</td>
    </tr>`;
  }).join('');
}

function openAuditModal(id, criticality, label, description, command) {
  _pendingAuditId = id;
  document.getElementById('audit-modal-title').textContent = `${label || criticality} — Revisar prompt`;
  document.getElementById('audit-modal-body').innerHTML =
    `<p style="margin-bottom:10px"><strong>¿Qué significa dar acceso?</strong></p>
     <p style="margin-bottom:12px">${escHtml(description)}</p>
     <div class="code-block"><code style="font-size:11.5px">${escHtml(command)}</code></div>`;
  document.getElementById('audit-approve-btn').onclick = () => submitAudit('approve');
  document.getElementById('audit-deny-btn').onclick = () => submitAudit('deny');
  document.getElementById('audit-modal').style.display = 'flex';
}

function closeAuditModal(e) {
  if (!e || e.target === document.getElementById('audit-modal')) {
    document.getElementById('audit-modal').style.display = 'none';
    _pendingAuditId = null;
  }
}

async function submitAudit(action) {
  if (!_pendingAuditId) return;
  try {
    const res = await apiFetch(`/api/audit/${action}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: _pendingAuditId }) });
    const data = await res.json();
    if (data.ok) {
      showToast(action === 'approve' ? 'Prompt aprobado' : 'Prompt denegado', action === 'approve' ? 'success' : 'warn');
      fetchAuditLog();
    }
  } catch { showToast('Error al procesar', 'error'); }
  document.getElementById('audit-modal').style.display = 'none';
  _pendingAuditId = null;
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLucide();
  // Poll audit pending badge
  setInterval(async () => {
    if (isUserEditing()) return;
    try {
      const res = await apiFetch('/api/audit/pending', { cache: 'no-store' });
      const data = await res.json();
      const badge = document.getElementById('audit-pending-badge');
      if (badge) { const c = (data.entries||[]).length; badge.textContent=c; badge.style.display=c>0?'':'none'; }
    } catch {}
  }, SECTION_AUTO_REFRESH_MS);
  // Poll crons when visible
  setInterval(() => {
    if (isUserEditing()) return;
    const croSection = document.getElementById('section-crons');
    if (croSection?.classList.contains('active')) fetchCrons();
  }, SECTION_AUTO_REFRESH_MS);
});

const LANG_STORAGE_KEY = 'monitor_lang';
const SUPPORTED_LANGS = ['es', 'en'];
let currentLang = 'es';

const I18N = {
  es: {
    noData: 'Sin datos',
    noDataForMode: 'Sin datos para este modo',
    noLogs: 'Sin logs disponibles',
    noRecentEvents: 'Sin eventos recientes',
    in: 'ENTRADA',
    out: 'SALIDA',
    err: 'ERROR',
    openclaw: 'OpenClaw',
    active: '● Activo',
    down: '✕ Caído',
    haNoResponse: '✕ Sin respuesta',
    disabled: '— deshabilitado',
    recentErrors: 'Errores recientes',
    cronJobs: 'Jobs cron',
    panelUptime: 'Uptime panel',
    modeLabel: 'Modo',
    localMode: 'Modo Local',
    cloudMode: 'Modo Cloud',
    applyingMode: 'Aplicando modo {mode}...',
    modeApplied: 'Modo {mode} aplicado',
    availableModels: 'Modelos disponibles',
    noModelData: 'Sin datos',
    gateway: 'Gateway',
    serviceActive: 'ACTIVO',
    serviceDown: 'CAIDO',
    start: 'Iniciar',
    restart: 'Reiniciar',
    stop: 'Detener',
    runningAction: 'Ejecutando {action}...',
    noJobs: 'Sin jobs / cron no disponible',
    yes: '● sí',
    no: '○ no',
    all: 'TODOS',
    openrouterApiReset: 'OpenRouter API (desde reset)',
    openrouterApiTotal: 'OpenRouter API (total cuenta)',
    logsLedgerEstimate: 'logs + ledger (estimado)',
    reportedApi: 'reportado API',
    estimated: 'estimado',
    local: 'local',
    cloud: 'cloud',
    sourceCost: 'Fuente costo',
    noUsageData: 'Sin datos de uso todavía.',
    noOpenrouterWindow: 'Sin uso OpenRouter en la ventana actual.',
    noActivityYet: 'Sin actividad detectada todavía.',
    dateTime: 'Fecha y hora',
    calledBy: 'Llamado por',
    lastMessageAction: 'Último mensaje / acción',
    noDetail: 'Sin detalle disponible',
    internalState: 'Estado interno',
    disconnected: 'desconectado',
    mentalMode: 'Modo mental',
    pulse: 'Pulso',
    recentAlerts: '{count} alertas recientes',
    normal: 'normal',
    promptsDetected: 'Prompts detectados',
    sensitiveAccesses: 'Accesos sensibles',
    critical: 'Crítico',
    high: 'Alto',
    medium: 'Medio',
    noSensitiveWindow: 'Sin indicadores sensibles en la ventana actual.',
    noPromptHistory: 'Sin historial de prompts.',
    noRepos: 'Sin repos.',
    notFoundPath: 'No encontrado en path',
    calls: 'Calls',
    openrouterCalls: 'OpenRouter calls',
    openrouterTokens: 'Tokens OpenRouter',
    totalCredits: 'Crédito total OpenRouter',
    remainingCredits: 'Crédito restante OpenRouter',
    totalApiSpend: 'Gasto total API OpenRouter',
    spendSinceReset: 'Gasto OpenRouter desde reset',
    logsSpend: 'Gasto OpenRouter por logs',
    spendSource: 'Fuente de gasto',
    externalLedger: 'Ledger externo',
    mapSuggested: 'Centro de mapa sugerido',
    openMap: 'Abrir mapa',
    noGps: 'Sin coordenadas GPS disponibles (revisa permisos de ubicación en app Home Assistant Companion).',
    noAppleDevices: 'Sin dispositivos Apple detectados en device_tracker.',
    viewMap: 'Ver mapa',
    noAppleMetrics: 'Sin métricas Apple disponibles.',
    noNotifyTarget: 'No hay target notify seleccionado.',
    writeMessageBeforeSend: 'Escribe un mensaje antes de enviar.',
    sending: 'Enviando...',
    messageSent: 'Mensaje enviado.',
    autoRefresh: 'Auto-refresh',
    autoOn: 'ON',
    autoOff: 'OFF',
    autoRefreshStatus: 'Auto: {state} · {interval}',
    dashOverview: 'Overview',
    dashObservability: 'Observabilidad',
    dashCosts: 'Costos y uso',
    dashSecurity: 'Seguridad',
    dashIot: 'IoT y hogar',
    dashOps: 'Operaciones',
    dashLogs: 'Logs y eventos',
    worldMapTitle: 'Mapa global de actividad',
    worldMapNodes: 'Nodos activos',
    worldMapLastEvent: 'Último evento',
    worldMapMode: 'Modo runtime',
    worldMapMapState: 'Estado mapa',
    worldMapHealthy: 'Saludable',
    worldMapDegraded: 'Con alertas',
    worldMapOffline: 'Caído',
    worldMapUseMyLocation: 'Usar mi ubicación',
    worldMapLocating: 'Obteniendo ubicación...',
    worldMapLocationOk: 'Ubicación actualizada',
    worldMapLocationError: 'No se pudo obtener ubicación',
    worldMapNoGeo: 'Geolocalización no disponible',
    advancedControls: 'Avanzado',
    traceNoEvents: 'Sin eventos de red recientes',
    lastUpdate: 'Última actualización',
    copyError: 'No se pudo copiar token',
    copyToken: '🔑 Copiar token',
    copying: 'Copiando...',
    copied: '✅ Copiado',
    copyErrShort: '❌ Error',
    updateCurrent: 'Update: al día ({installed})',
    updateAvailable: 'Update: {installed} -> {latest}',
    updateError: 'Update: error',
    resetConfirm: 'Esto reseteará los contadores de tokens y costos desde este momento. ¿Continuar?',
    resetting: 'Reseteando...',
    resetDone: 'Contadores reseteados en {date}.{snapshot}',
    snapshotCredit: ' Crédito OpenRouter al reset: {credit}.',
    resetError: 'Error al resetear métricas: {error}',
    statusConnected: 'Conectado',
    statusError: 'Error: {error}',
    activeState: 'activo',
    headerTitle: 'Panel de Monitoreo',
    headerSubtitle: 'OpenClaw + Home Assistant · refresco por inactividad (5 min)',
    refreshBtn: '↻ Actualizar',
    resetMetricsBtn: '⟲ Reset métricas',
    resetMetricsTitle: 'Resetear contadores de tokens y costos desde ahora',
    updateBtn: '⟳ Update',
    updateTitle: 'Consultar estado de actualización',
    copyTokenBtn: '🔑 Copiar token',
    copyTokenTitle: 'Copia URL + token para OpenClaw Control',
    openclawDashboard: 'Dashboard OpenClaw',
    workroom: 'Sala de trabajo',
    connections: 'Conexiones',
    modelAndMode: 'Modelo y Modo',
    serviceControl: 'Control de Servicios',
    lastAgentActivity: 'Última actividad del agente',
    agentSoul: 'Soul del agente',
    tokensByDay: 'Tokens por día (últimos 7 días)',
    modelDistribution: 'Distribución por modelo',
    tokensAndSpend: 'Tokens y Gasto Estimado',
    thModel: 'Modelo',
    thCalls: 'Calls',
    thInput: 'Input',
    thOutput: 'Output',
    thTotalTokens: 'Total tokens',
    thUsdReal: 'USD real',
    thClpReal: 'CLP real',
    thUsdEq: 'USD equivalente cloud ☁️',
    thClpEq: 'CLP equivalente ☁️',
    thCostSource: 'Fuente costo',
    cloudEquivalentHint: '☁️ Equivalente cloud = costo estimado si se usara GPT-4o-mini ($0,15/$0,60 por 1M tokens) para los modelos locales gratuitos.',
    openrouterSinceReset: 'OpenRouter (desde último reset)',
    thOpenrouterModel: 'Modelo OpenRouter',
    openrouterLedgerHint: 'Incluye gasto externo registrado en ledger para jobs fuera de sesiones estándar.',
    securitySensitive: 'Seguridad y accesos sensibles',
    thDate: 'Fecha',
    thSeverity: 'Criticidad',
    thOrigin: 'Origen',
    thCategory: 'Categoría',
    thSource: 'Fuente',
    promptHistory: 'Historial de prompts y gatillos',
    thRole: 'Rol',
    appleMetricsSensors: 'Métricas Apple (sensores)',
    thSensor: 'Sensor',
    thValue: 'Valor',
    thUnit: 'Unidad',
    thType: 'Tipo',
    thUpdated: 'Actualizado',
    appleNotifyPlaceholder: 'Mensaje para dispositivo Apple...',
    sendBtn: 'Enviar',
    commitsByProject: 'Commits por Proyecto',
    thProject: 'Proyecto',
    thLastCommit: 'Último commit',
    jobsCron: 'Jobs / Horarios cron',
    thName: 'Nombre',
    thExpression: 'Expresión',
    thNextRun: 'Próxima ejecución',
    thActive: 'Activo',
    telegramEvents: 'Eventos Telegram',
    logs: 'Logs',
    appleDevicesDetected: 'Apple devices detectados',
    appleSensors: 'Sensores Apple',
    notifyChannelsAvailable: 'Canales notify disponibles',
    integrationStatus: 'Estado integración',
    resourceUsage: 'Uso de recursos por servicio',
    resourcePeaksTitle: 'Picos de consumo (24h / 7d / 30d)',
    serviceOpenclaw: 'OpenClaw',
    serviceHomeassistant: 'Home Assistant',
    serviceN8n: 'n8n',
    metricCpu: 'CPU %',
    metricRam: 'RAM %',
    resourceThService: 'Servicio',
    resourceThMetric: 'Métrica',
    resourceTh24h: '24h',
    resourceTh7d: '7d',
    resourceTh30d: '30d',
    cpuProcess: 'CPU proceso',
    ramProcess: 'RAM proceso',
    ramProcessPct: 'RAM proceso % host',
    processPid: 'PID',
    processUptime: 'Uptime proceso',
    hostRamUsage: 'RAM host usada',
    loadAvg1m: 'Load avg 1m',
    chartCpu: 'CPU %',
    chartRam: 'RAM MB',
    chartRamPct: 'RAM % host',
    vacuumSection: 'Aspiradora Xiaomi (mapa y zonas)',
    vacuumNotFound: 'No se encontró ninguna entidad vacuum.* en Home Assistant.',
    vacuumEntity: 'Entidad',
    vacuumState: 'Estado',
    vacuumBattery: 'Batería',
    vacuumArea: 'Área última limpieza',
    vacuumTime: 'Tiempo última limpieza',
    vacuumLastClean: 'Última limpieza',
    vacuumMapStatus: 'Estado mapa',
    vacuumMapAvailable: 'Disponible',
    vacuumMapUnavailable: 'Sin imagen (metadata disponible)',
    vacuumZonesTitle: 'Zonas / segmentos',
    vacuumHistoryTitle: 'Historial limpieza',
    vacuumThSegment: 'Segmento',
    vacuumThRoom: 'Room ID',
    vacuumThName: 'Nombre',
    vacuumThHistoryLabel: 'Label',
    vacuumNoZones: 'Sin zonas detectadas aún.',
    vacuumNoHistory: 'Sin historial de limpieza.',
    vacuumMapMeta: 'Metadata de mapa',
    vacuumMapObject: 'Map object',
    vacuumCurrentMap: 'Mapa actual',
    vacuumOpenHa: 'Abrir en Home Assistant',
    vacuumActionStart: 'Iniciar',
    vacuumActionPause: 'Pausar',
    vacuumActionStop: 'Detener',
    vacuumActionDock: 'Acoplar',
    vacuumActionLocate: 'Ubicar',
    vacuumActionCleanZone: 'Limpiar zona',
    vacuumSelectZone: 'Selecciona zona',
    vacuumActionRunning: 'Ejecutando {action}...',
    vacuumActionSent: 'Acción {action} enviada.',
    vacuumActionError: 'Error en acción: {error}',
  },
  en: {
    noData: 'No data',
    noDataForMode: 'No data for this mode',
    noLogs: 'No logs available',
    noRecentEvents: 'No recent events',
    in: 'IN',
    out: 'OUT',
    err: 'ERROR',
    openclaw: 'OpenClaw',
    active: '● Active',
    down: '✕ Down',
    haNoResponse: '✕ No response',
    disabled: '— disabled',
    recentErrors: 'Recent errors',
    cronJobs: 'Cron jobs',
    panelUptime: 'Panel uptime',
    modeLabel: 'Mode',
    localMode: 'Local Mode',
    cloudMode: 'Cloud Mode',
    applyingMode: 'Applying {mode} mode...',
    modeApplied: '{mode} mode applied',
    availableModels: 'Available models',
    noModelData: 'No data',
    gateway: 'Gateway',
    serviceActive: 'RUNNING',
    serviceDown: 'DOWN',
    start: 'Start',
    restart: 'Restart',
    stop: 'Stop',
    runningAction: 'Running {action}...',
    noJobs: 'No jobs / cron unavailable',
    yes: '● yes',
    no: '○ no',
    all: 'ALL',
    openrouterApiReset: 'OpenRouter API (since reset)',
    openrouterApiTotal: 'OpenRouter API (account total)',
    logsLedgerEstimate: 'logs + ledger (estimated)',
    reportedApi: 'API-reported',
    estimated: 'estimated',
    local: 'local',
    cloud: 'cloud',
    sourceCost: 'Cost source',
    noUsageData: 'No usage data yet.',
    noOpenrouterWindow: 'No OpenRouter usage in current window.',
    noActivityYet: 'No activity detected yet.',
    dateTime: 'Date and time',
    calledBy: 'Triggered by',
    lastMessageAction: 'Last message / action',
    noDetail: 'No detail available',
    internalState: 'Internal state',
    disconnected: 'disconnected',
    mentalMode: 'Mental mode',
    pulse: 'Pulse',
    recentAlerts: '{count} recent alerts',
    normal: 'normal',
    promptsDetected: 'Detected prompts',
    sensitiveAccesses: 'Sensitive accesses',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    noSensitiveWindow: 'No sensitive indicators in current window.',
    noPromptHistory: 'No prompt history.',
    noRepos: 'No repos.',
    notFoundPath: 'Path not found',
    calls: 'Calls',
    openrouterCalls: 'OpenRouter calls',
    openrouterTokens: 'OpenRouter tokens',
    totalCredits: 'OpenRouter total credits',
    remainingCredits: 'OpenRouter remaining credits',
    totalApiSpend: 'OpenRouter API total spend',
    spendSinceReset: 'OpenRouter spend since reset',
    logsSpend: 'OpenRouter spend from logs',
    spendSource: 'Spend source',
    externalLedger: 'External ledger',
    mapSuggested: 'Suggested map center',
    openMap: 'Open map',
    noGps: 'No GPS coordinates available (check Home Assistant Companion location permissions).',
    noAppleDevices: 'No Apple devices found in device_tracker.',
    viewMap: 'View map',
    noAppleMetrics: 'No Apple metrics available.',
    noNotifyTarget: 'No notify target selected.',
    writeMessageBeforeSend: 'Type a message before sending.',
    sending: 'Sending...',
    messageSent: 'Message sent.',
    autoRefresh: 'Auto-refresh',
    autoOn: 'ON',
    autoOff: 'OFF',
    autoRefreshStatus: 'Auto: {state} · {interval}',
    dashOverview: 'Overview',
    dashObservability: 'Observability',
    dashCosts: 'Costs and usage',
    dashSecurity: 'Security',
    dashIot: 'IoT and home',
    dashOps: 'Operations',
    dashLogs: 'Logs and events',
    worldMapTitle: 'Global activity map',
    worldMapNodes: 'Active nodes',
    worldMapLastEvent: 'Last event',
    worldMapMode: 'Runtime mode',
    worldMapMapState: 'Map status',
    worldMapHealthy: 'Healthy',
    worldMapDegraded: 'With alerts',
    worldMapOffline: 'Offline',
    worldMapUseMyLocation: 'Use my location',
    worldMapLocating: 'Getting location...',
    worldMapLocationOk: 'Location updated',
    worldMapLocationError: 'Could not get location',
    worldMapNoGeo: 'Geolocation not available',
    advancedControls: 'Advanced',
    traceNoEvents: 'No recent network events',
    lastUpdate: 'Last update',
    copyError: 'Could not copy token',
    copyToken: '🔑 Copy token',
    copying: 'Copying...',
    copied: '✅ Copied',
    copyErrShort: '❌ Error',
    updateCurrent: 'Update: up to date ({installed})',
    updateAvailable: 'Update: {installed} -> {latest}',
    updateError: 'Update: error',
    resetConfirm: 'This will reset token and cost counters from now. Continue?',
    resetting: 'Resetting...',
    resetDone: 'Counters reset at {date}.{snapshot}',
    snapshotCredit: ' OpenRouter credit at reset: {credit}.',
    resetError: 'Error resetting metrics: {error}',
    statusConnected: 'Connected',
    statusError: 'Error: {error}',
    activeState: 'active',
    headerTitle: 'Monitoring Dashboard',
    headerSubtitle: 'OpenClaw + Home Assistant · idle refresh every 5 min',
    refreshBtn: '↻ Refresh',
    resetMetricsBtn: '⟲ Reset metrics',
    resetMetricsTitle: 'Reset token and cost counters from now',
    updateBtn: '⟳ Update',
    updateTitle: 'Check update status',
    copyTokenBtn: '🔑 Copy token',
    copyTokenTitle: 'Copy URL + token for OpenClaw Control',
    openclawDashboard: 'OpenClaw Dashboard',
    workroom: 'Workroom',
    connections: 'Connections',
    modelAndMode: 'Model and Mode',
    serviceControl: 'Service Control',
    lastAgentActivity: 'Last agent activity',
    agentSoul: 'Agent Soul',
    tokensByDay: 'Tokens per day (last 7 days)',
    modelDistribution: 'Distribution by model',
    tokensAndSpend: 'Tokens and Estimated Spend',
    thModel: 'Model',
    thCalls: 'Calls',
    thInput: 'Input',
    thOutput: 'Output',
    thTotalTokens: 'Total tokens',
    thUsdReal: 'Real USD',
    thClpReal: 'Real CLP',
    thUsdEq: 'Equivalent cloud USD ☁️',
    thClpEq: 'Equivalent CLP ☁️',
    thCostSource: 'Cost source',
    cloudEquivalentHint: '☁️ Cloud equivalent = estimated cost if GPT-4o-mini ($0.15/$0.60 per 1M tokens) were used for free local models.',
    openrouterSinceReset: 'OpenRouter (since last reset)',
    thOpenrouterModel: 'OpenRouter model',
    openrouterLedgerHint: 'Includes external spend recorded in ledger for jobs outside standard sessions.',
    securitySensitive: 'Security and sensitive accesses',
    thDate: 'Date',
    thSeverity: 'Severity',
    thOrigin: 'Origin',
    thCategory: 'Category',
    thSource: 'Source',
    promptHistory: 'Prompt history and triggers',
    thRole: 'Role',
    appleMetricsSensors: 'Apple metrics (sensors)',
    thSensor: 'Sensor',
    thValue: 'Value',
    thUnit: 'Unit',
    thType: 'Type',
    thUpdated: 'Updated',
    appleNotifyPlaceholder: 'Message for Apple device...',
    sendBtn: 'Send',
    commitsByProject: 'Commits by Project',
    thProject: 'Project',
    thLastCommit: 'Last commit',
    jobsCron: 'Cron jobs / schedules',
    thName: 'Name',
    thExpression: 'Expression',
    thNextRun: 'Next run',
    thActive: 'Active',
    telegramEvents: 'Telegram events',
    logs: 'Logs',
    appleDevicesDetected: 'Apple devices detected',
    appleSensors: 'Apple sensors',
    notifyChannelsAvailable: 'Available notify channels',
    integrationStatus: 'Integration status',
    resourceUsage: 'Per-service resource usage',
    resourcePeaksTitle: 'Peak usage (24h / 7d / 30d)',
    serviceOpenclaw: 'OpenClaw',
    serviceHomeassistant: 'Home Assistant',
    serviceN8n: 'n8n',
    metricCpu: 'CPU %',
    metricRam: 'RAM %',
    resourceThService: 'Service',
    resourceThMetric: 'Metric',
    resourceTh24h: '24h',
    resourceTh7d: '7d',
    resourceTh30d: '30d',
    cpuProcess: 'Process CPU',
    ramProcess: 'Process RAM',
    ramProcessPct: 'Process RAM % host',
    processPid: 'PID',
    processUptime: 'Process uptime',
    hostRamUsage: 'Host RAM used',
    loadAvg1m: 'Load avg 1m',
    chartCpu: 'CPU %',
    chartRam: 'RAM MB',
    chartRamPct: 'RAM % host',
    vacuumSection: 'Xiaomi vacuum (map and zones)',
    vacuumNotFound: 'No vacuum.* entity found in Home Assistant.',
    vacuumEntity: 'Entity',
    vacuumState: 'State',
    vacuumBattery: 'Battery',
    vacuumArea: 'Last cleaning area',
    vacuumTime: 'Last cleaning time',
    vacuumLastClean: 'Last cleaning',
    vacuumMapStatus: 'Map status',
    vacuumMapAvailable: 'Available',
    vacuumMapUnavailable: 'No image (metadata available)',
    vacuumZonesTitle: 'Zones / segments',
    vacuumHistoryTitle: 'Cleaning history',
    vacuumThSegment: 'Segment',
    vacuumThRoom: 'Room ID',
    vacuumThName: 'Name',
    vacuumThHistoryLabel: 'Label',
    vacuumNoZones: 'No zones detected yet.',
    vacuumNoHistory: 'No cleaning history.',
    vacuumMapMeta: 'Map metadata',
    vacuumMapObject: 'Map object',
    vacuumCurrentMap: 'Current map',
    vacuumOpenHa: 'Open in Home Assistant',
    vacuumActionStart: 'Start',
    vacuumActionPause: 'Pause',
    vacuumActionStop: 'Stop',
    vacuumActionDock: 'Dock',
    vacuumActionLocate: 'Locate',
    vacuumActionCleanZone: 'Clean zone',
    vacuumSelectZone: 'Select zone',
    vacuumActionRunning: 'Running {action}...',
    vacuumActionSent: 'Action {action} sent.',
    vacuumActionError: 'Action error: {error}',
  },
};

function t(key, vars = {}) {
  const dict = I18N[currentLang] || I18N.es;
  const str = dict[key] ?? I18N.es[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function getLocale() {
  return currentLang === 'en' ? 'en-US' : 'es-CL';
}

function fmtDate(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
}
function fmtNum(value) {
  return Number(value || 0).toLocaleString(getLocale());
}
function fmtMoney(value, currency = 'USD') {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency', currency,
    maximumFractionDigits: currency === 'CLP' ? 0 : 4,
  }).format(Number(value || 0));
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
function esc(v) {
  return String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function n(v) {
  const out = Number(v);
  return Number.isFinite(out) ? out : 0;
}

function applyI18nToDom() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  renderAutoRefreshStatus();
  updateWorldMapLocateUi();
}

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
    el.innerHTML = `<div class="log-line"><span class="log-msg" style="color:var(--text2)">${t('noLogs')}</span></div>`;
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
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:8px">${t('noRecentEvents')}</div>`;
    return;
  }
  el.innerHTML = sorted.map((raw) => {
    const type = classifyTelegramLine(raw);
    const ts = extractTelegramTs(raw);
    const msg = raw.replace(TS_RE, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const labels = { in: t('in'), out: t('out'), err: t('err') };
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

function updateWorldMapLocateUi() {
  const btn = document.getElementById('worldMapLocateBtn');
  const status = document.getElementById('worldMapLocateStatus');
  if (btn) btn.textContent = `📍 ${t('worldMapUseMyLocation')}`;
  if (!status) return;
  if (worldUserLocationState === 'resolving') status.textContent = t('worldMapLocating');
  else if (worldUserLocationState === 'ok') status.textContent = worldUserLocationMessage || t('worldMapLocationOk');
  else if (worldUserLocationState === 'error') status.textContent = worldUserLocationMessage || t('worldMapLocationError');
  else status.textContent = '';
}

function requestWorldUserLocation() {
  if (!navigator.geolocation) {
    worldUserLocationState = 'error';
    worldUserLocationMessage = t('worldMapNoGeo');
    updateWorldMapLocateUi();
    return;
  }
  worldUserLocationState = 'resolving';
  worldUserLocationMessage = '';
  updateWorldMapLocateUi();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      worldUserLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      worldUserLocationState = 'ok';
      worldUserLocationMessage = `${t('worldMapLocationOk')} (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`;
      updateWorldMapLocateUi();
    },
    () => {
      worldUserLocationState = 'error';
      worldUserLocationMessage = t('worldMapLocationError');
      updateWorldMapLocateUi();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 180000 }
  );
}

function inferHostGeo(host = '') {
  const h = String(host || '').toLowerCase();
  if (!h) return { latitude: 0, longitude: 0, label: 'unknown' };
  if (h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.') || h.startsWith('10.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) {
    const base = worldUserLocation || { latitude: -33.4489, longitude: -70.6693 };
    return { latitude: base.latitude, longitude: base.longitude, label: 'Local network' };
  }
  if (h.includes('.cl') || h.includes('chile') || h.includes('scl')) return { latitude: -33.4489, longitude: -70.6693, label: 'Chile' };
  if (h.includes('openrouter') || h.includes('api.openai') || h.includes('github')) return { latitude: 39.0438, longitude: -77.4874, label: 'US-East' };
  if (h.includes('google') || h.includes('gemini')) return { latitude: 37.422, longitude: -122.084, label: 'US-West' };
  if (h.includes('telegram')) return { latitude: 25.7617, longitude: -80.1918, label: 'Telegram edge' };
  if (h.includes('aws')) return { latitude: 39.0438, longitude: -77.4874, label: 'AWS us-east' };
  if (h.includes('azure')) return { latitude: 52.3676, longitude: 4.9041, label: 'Azure EU' };
  if (h.includes('ollama')) return { latitude: 37.7749, longitude: -122.4194, label: 'Ollama cloud' };
  return { latitude: 39.0438, longitude: -77.4874, label: 'Internet edge' };
}

function extractHostFromEndpoint(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const noArrow = raw.includes('->') ? raw.split('->').pop() : raw;
  const normalized = noArrow
    .replace(/^https?:\/\//i, '')
    .replace(/^wss?:\/\//i, '')
    .trim();
  const token = normalized.split(/[/?#\s]/)[0] || '';
  const hostMatch = token.match(/(localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,})/i);
  return hostMatch ? String(hostMatch[1]).toLowerCase() : '';
}

function parseTraceTarget(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { host: '', port: '', protocol: '', path: '' };
  const part = raw.includes('->') ? raw.split('->').pop() : raw;
  const normalized = String(part || '').trim();

  if (/^https?:\/\//i.test(normalized) || /^wss?:\/\//i.test(normalized)) {
    try {
      const u = new URL(normalized);
      return {
        host: String(u.hostname || '').toLowerCase(),
        port: String(u.port || ''),
        protocol: String(u.protocol || '').replace(':', '').toLowerCase(),
        path: String(u.pathname || ''),
      };
    } catch {
      // fall through
    }
  }

  const token = normalized.split(/[/?#\s]/)[0] || '';
  const m = token.match(/^(localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,})(?::(\d{2,5}))?$/i);
  if (m) {
    return {
      host: String(m[1] || '').toLowerCase(),
      port: String(m[2] || ''),
      protocol: '',
      path: '',
    };
  }
  return { host: '', port: '', protocol: '', path: '' };
}

function shouldIncludeTraceEvent(type, target) {
  const meta = parseTraceTarget(target);
  const host = String(meta.host || '').toLowerCase();
  if (!host) return false;

  const isPrivateIp = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  if (isPrivateIp || host === 'localhost') return true;
  if (type === 'listen' || type === 'conn' || type === 'port' || type === 'ws') return true;

  // Keep map trace operationally focused: skip browsing/content links.
  if (type === 'web') {
    if (/github\.com$|gitlab\.com$|medium\.com$|youtube\.com$|x\.com$|twitter\.com$/.test(host)) return false;
    if (host.includes('openrouter') || host.includes('openai') || host.includes('google') || host.includes('telegram') || host.includes('ollama')) return true;
    return false;
  }
  return true;
}

function formatTraceTarget(type, target) {
  const meta = parseTraceTarget(target);
  if (!meta.host) return String(target || '').slice(0, 72);
  if (meta.port) return `${meta.host}:${meta.port}`;
  return meta.host;
}

function ensureWorldMap() {
  if (worldMap || !window.L) return worldMap;
  const container = document.getElementById('worldLeafletMap');
  if (!container) return null;
  worldMap = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true,
    preferCanvas: true,
    minZoom: 2,
    maxZoom: 8,
  }).setView([-25.0, -72.0], 3);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(worldMap);
  worldNodeLayer = L.layerGroup().addTo(worldMap);
  worldLinkLayer = L.layerGroup().addTo(worldMap);
  return worldMap;
}

function spreadNodeCoordinates(nodes) {
  const byPos = new Map();
  for (const node of nodes) {
    const key = `${Number(node.latitude).toFixed(3)}|${Number(node.longitude).toFixed(3)}`;
    if (!byPos.has(key)) byPos.set(key, []);
    byPos.get(key).push(node);
  }
  const out = [];
  for (const group of byPos.values()) {
    if (group.length === 1) {
      out.push({ ...group[0], displayLat: group[0].latitude, displayLon: group[0].longitude });
      continue;
    }
    const base = group[0];
    const radiusKm = group.length > 6 ? 42 : 28;
    const latFactor = Math.max(0.2, Math.cos((Number(base.latitude) * Math.PI) / 180));
    group.forEach((node, idx) => {
      const angle = (Math.PI * 2 * idx) / group.length;
      const deltaLat = (radiusKm / 111) * Math.sin(angle);
      const deltaLon = (radiusKm / (111 * latFactor)) * Math.cos(angle);
      out.push({
        ...node,
        displayLat: node.latitude + deltaLat,
        displayLon: node.longitude + deltaLon,
      });
    });
  }
  return out;
}

function extractNetworkEventsFromData(data) {
  const liveConnections = Array.isArray(data?.networkTrace?.connections) ? data.networkTrace.connections : [];
  const liveListeners = Array.isArray(data?.networkTrace?.listeners) ? data.networkTrace.listeners : [];
  const direct = [];
  const pushDirect = (type, target) => {
    if (!shouldIncludeTraceEvent(type, target)) return;
    direct.push({ type, target: formatTraceTarget(type, target), ts: '' });
  };
  for (const row of liveConnections) {
    const endpoint = String(row?.endpoint || '');
    if (!endpoint) continue;
    pushDirect('conn', endpoint);
  }
  for (const row of liveListeners) {
    const endpoint = String(row?.endpoint || '');
    if (!endpoint) continue;
    pushDirect('listen', endpoint);
  }

  const rows = [
    ...(Array.isArray(data?.logs?.openclaw) ? data.logs.openclaw : []),
    ...(Array.isArray(data?.logs?.homeassistant) ? data.logs.homeassistant : []),
  ].slice(-240);

  const urlRe = /\bhttps?:\/\/[^\s'")]+/gi;
  const wsRe = /\bwss?:\/\/[^\s'")]+/gi;
  const hostPortRe = /\b(?:localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,})(?::\d{2,5})\b/gi;

  const out = [...direct];
  for (const line of rows) {
    const ts = extractTelegramTs(line);
    const push = (type, target) => {
      if (!shouldIncludeTraceEvent(type, target)) return;
      out.push({ type, target: formatTraceTarget(type, target), ts });
    };
    const urls = line.match(urlRe) || [];
    const sockets = line.match(wsRe) || [];
    const hostPorts = line.match(hostPortRe) || [];
    urls.forEach((u) => push('web', u));
    sockets.forEach((u) => push('ws', u));
    hostPorts.forEach((p) => push('port', p));
  }
  const dedupe = new Set();
  return out.filter((e) => {
    const key = `${e.type}|${e.target}`;
    if (dedupe.has(key)) return false;
    dedupe.add(key);
    return true;
  }).slice(0, 8);
}

function renderWorldMap(data) {
  const statsEl = document.getElementById('worldMapStats');
  const legendEl = document.getElementById('worldMapLegend');
  const traceEl = document.getElementById('worldMapTrace');
  if (!statsEl || !legendEl || !traceEl) return;
  const map = ensureWorldMap();
  if (!map || !worldNodeLayer || !worldLinkLayer) return;

  const hasRecentErrors = n(data?.activity?.recentErrorsCount) > 0;
  const gwUp = !!data?.openclaw?.listening;
  const haUp = String(data?.homeassistant?.status || '').toLowerCase().includes('http 200');
  const tgUp = !!data?.telegram?.botUser;
  const mode = String(data?.openclaw?.modelModeGuess || 'all');
  const fallbackLocal = { latitude: -33.4489, longitude: -70.6693 }; // Santiago
  const localOrigin = worldUserLocation || data?.apple?.mapCenter || fallbackLocal;

  const appleDevices = Array.isArray(data?.apple?.devices) ? data.apple.devices : [];
  const iphone = appleDevices.find((d) => /iphone/i.test(String(d?.name || d?.entityId || '')) && d?.latitude != null && d?.longitude != null);
  const watch = appleDevices.find((d) => /watch/i.test(String(d?.name || d?.entityId || '')) && d?.latitude != null && d?.longitude != null);
  const modelPrimary = String(data?.openclaw?.modelPrimary || '');
  const isLocalModel = isStrictLocalModelKey(modelPrimary);

  const cloudAnchor = modelPrimary.includes('openrouter')
    ? { label: 'OpenRouter · us-east', latitude: 39.0438, longitude: -77.4874 }
    : modelPrimary.includes(':cloud')
      ? { label: 'Ollama Cloud · us-west', latitude: 37.7749, longitude: -122.4194 }
      : { label: 'Model runtime', latitude: localOrigin.latitude, longitude: localOrigin.longitude };

  const dynamicNodes = [
    { name: 'Tu conexión', latitude: Number(localOrigin.latitude), longitude: Number(localOrigin.longitude), ok: true, kind: 'origin' },
    { name: 'Mac Mini · OpenClaw', latitude: Number(localOrigin.latitude), longitude: Number(localOrigin.longitude), ok: gwUp, kind: 'origin' },
    { name: 'Home Assistant', latitude: Number(localOrigin.latitude), longitude: Number(localOrigin.longitude), ok: haUp, kind: 'origin' },
    {
      name: cloudAnchor.label,
      latitude: Number(cloudAnchor.latitude),
      longitude: Number(cloudAnchor.longitude),
      ok: isLocalModel ? true : !hasRecentErrors,
      kind: 'runtime',
    },
    { name: 'Telegram', latitude: 25.7617, longitude: -80.1918, ok: tgUp, kind: 'telegram' },
  ];
  if (iphone) dynamicNodes.push({
    name: `iPhone · ${iphone.name || iphone.entityId || ''}`.trim(),
    latitude: Number(iphone.latitude),
    longitude: Number(iphone.longitude),
    ok: true,
    kind: 'device',
  });
  if (watch) dynamicNodes.push({
    name: `Apple Watch · ${watch.name || watch.entityId || ''}`.trim(),
    latitude: Number(watch.latitude),
    longitude: Number(watch.longitude),
    ok: true,
    kind: 'device',
  });

  const networkEvents = extractNetworkEventsFromData(data);
  for (const ev of networkEvents) {
    const normalizedTarget = String(ev.target || '');
    const host = extractHostFromEndpoint(normalizedTarget);
    if (!host) continue;
    const geo = inferHostGeo(host);
    dynamicNodes.push({
      name: `${ev.type.toUpperCase()} · ${host}`,
      latitude: Number(geo.latitude),
      longitude: Number(geo.longitude),
      ok: true,
      trace: true,
      kind: 'trace',
    });
  }

  const nodes = spreadNodeCoordinates(dynamicNodes.filter((n) => Number.isFinite(n.latitude) && Number.isFinite(n.longitude)));
  worldNodeLayer.clearLayers();
  worldLinkLayer.clearLayers();

  const overall = !gwUp ? 'bad' : (hasRecentErrors ? 'warn' : 'ok');
  const activeNodes = nodes.filter((x) => x.ok).length;
  const totalNodes = nodes.length;
  const lastEvent = data?.activity?.latest?.timestampMs
    ? new Date(data.activity.latest.timestampMs).toLocaleTimeString(getLocale())
    : '-';

  for (const node of nodes) {
    const color = node.ok ? (node.trace ? '#ff8a3d' : '#f5b233') : '#ef4444';
    L.circleMarker([node.displayLat, node.displayLon], {
      radius: node.trace ? 4 : 6,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 1.5,
    })
      .bindTooltip(node.name, { direction: 'top', opacity: 0.92 })
      .addTo(worldNodeLayer);
  }

  const originPoint = [Number(localOrigin.latitude), Number(localOrigin.longitude)];
  nodes
    .filter((n) => n.trace || n.kind === 'runtime' || n.kind === 'telegram')
    .slice(0, 12)
    .forEach((n, idx) => {
      L.polyline([originPoint, [n.displayLat, n.displayLon]], {
        color: idx % 2 === 0 ? 'rgba(245,178,51,0.65)' : 'rgba(255,138,61,0.55)',
        weight: 1.6,
        dashArray: '4 6',
      }).addTo(worldLinkLayer);
    });

  const originKey = `${Number(localOrigin.latitude).toFixed(3)}|${Number(localOrigin.longitude).toFixed(3)}`;
  if (!worldMapHasFitted || worldMapLastOriginKey !== originKey) {
    const bounds = L.latLngBounds(nodes.map((n) => [n.displayLat, n.displayLon]));
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.22), { maxZoom: 5, animate: true });
    } else {
      map.setView(originPoint, 4);
    }
    worldMapHasFitted = true;
    worldMapLastOriginKey = originKey;
  }

  statsEl.innerHTML = [
    { label: t('worldMapNodes'), value: `${activeNodes}/${totalNodes}`, className: 'ok' },
    { label: t('worldMapLastEvent'), value: lastEvent, className: 'info' },
    { label: t('worldMapMode'), value: mode, className: 'warn' },
    {
      label: t('worldMapMapState'),
      value: overall === 'ok' ? t('worldMapHealthy') : overall === 'warn' ? t('worldMapDegraded') : t('worldMapOffline'),
      className: overall === 'ok' ? 'ok' : overall === 'warn' ? 'warn' : 'bad',
    },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}" style="font-size:14px">${esc(k.value)}</div></div>`
  ).join('');

  legendEl.innerHTML = `
    <div class="world-legend-item"><span class="world-legend-dot" style="background:#f5b233"></span><span>${t('worldMapHealthy')}</span></div>
    <div class="world-legend-item"><span class="world-legend-dot" style="background:#ff8a3d"></span><span>${t('worldMapDegraded')}</span></div>
    <div class="world-legend-item"><span class="world-legend-dot" style="background:#ef4444"></span><span>${t('worldMapOffline')}</span></div>
  `;

  traceEl.innerHTML = networkEvents.length
    ? networkEvents.map((ev) => `
      <div class="trace-row">
        <span class="trace-left">${esc(ev.type.toUpperCase())} · ${esc(ev.target)}</span>
        <span class="trace-right">${esc(ev.ts || '--:--:--')}</span>
      </div>
    `).join('')
    : `<div class="trace-row"><span class="trace-left">${t('traceNoEvents')}</span><span class="trace-right">-</span></div>`;
}

// ── charts ────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  'rgba(245,178,51,0.9)',
  'rgba(255,138,61,0.9)',
  'rgba(255,107,53,0.9)',
  'rgba(250,204,21,0.9)',
  'rgba(249,115,22,0.9)',
  'rgba(245,158,11,0.9)',
  'rgba(239,68,68,0.88)',
];

const chartOptions = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#d1d5db', font: { size: 11 } } },
    title: title ? { display: true, text: title, color: '#d1d5db', font: { size: 12 } } : undefined,
    tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0' },
  },
  scales: {
    x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(245,178,51,.08)' } },
    y: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(245,178,51,.08)' } },
  },
});

let chartDaily = null;
let chartModels = null;
let chartResources = null;

function resolveModeType(data) {
  const mode = String(data?.openclaw?.modelModeGuess || '').toLowerCase();
  if (mode === 'local' || mode.includes('noche/local')) return 'local';
  if (mode === 'cloud' || mode.includes('dia') || mode.includes('gemini') || mode.includes('minmax')) return 'cloud';
  return 'all';
}

function isStrictLocalModelKey(modelKey) {
  const k = String(modelKey || '').toLowerCase();
  return (
    k.startsWith('custom-127-0-0-1-11434/') ||
    k.startsWith('ollama/')
  );
}

function modelMatchesMode(modelKey, modeType) {
  if (modeType === 'all') return true;
  const isLocal = isStrictLocalModelKey(modelKey);
  return modeType === 'local' ? isLocal : !isLocal;
}

function buildFilteredUsage(data) {
  const usage = data?.usage || {};
  return {
    ...usage,
    models: Array.isArray(usage.models) ? usage.models : [],
    totals: usage.totals || {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0,
      costUsd: 0, costClp: 0, equivalentCostUsd: 0, equivalentCostClp: 0,
      savedUsd: 0, savedClp: 0,
    },
    daily: usage.daily || {},
    modeType: 'all',
  };
}

function buildDailyData(filteredUsage) {
  const daily = filteredUsage.daily || {};
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

  const filteredDatasets = datasets.filter((d) => d.data.some((v) => n(v) > 0));
  if (!filteredDatasets.length) {
    return {
      labels: [t('noData')],
      datasets: [{
        label: t('noDataForMode'),
        data: [0],
        backgroundColor: 'rgba(148,163,184,0.55)',
        borderRadius: 4,
      }],
    };
  }
  return {
    labels,
    datasets: filteredDatasets,
  };
}

function buildModelPieData(filteredUsage) {
  const models = (filteredUsage.models || []).filter((m) => m.usage.total > 0);
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
  if (!allData.length) {
    return {
      labels: [t('noDataForMode')],
      datasets: [{ data: [1], backgroundColor: ['rgba(148,163,184,0.45)'], borderWidth: 0 }],
    };
  }
  return {
    labels: allLabels,
    datasets: [{ data: allData, backgroundColor: allColors, borderWidth: 0 }],
  };
}

function updateCharts(usageData) {
  const dailyCtx = document.getElementById('chartDaily');
  const modelCtx  = document.getElementById('chartModels');
  if (!dailyCtx || !modelCtx || typeof Chart === 'undefined') return;

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
          x: { stacked: true, ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(245,178,51,.08)' } },
          y: { stacked: true, ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(245,178,51,.08)' } },
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
          legend: { position: 'right', labels: { color: '#d1d5db', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0',
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

function formatDurationSec(totalSec) {
  const sec = Math.max(0, Math.floor(n(totalSec)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderResources(data) {
  const resources = data?.resources || {};
  const host = resources?.host || {};
  const services = resources?.services || {};
  const oc = services?.openclaw || {};
  const haSvc = services?.homeassistant || {};
  const n8nSvc = services?.n8n || {};
  const summary = document.getElementById('resourceSummary');
  if (!summary) return;

  const serviceLabel = {
    openclaw: t('serviceOpenclaw'),
    homeassistant: t('serviceHomeassistant'),
    n8n: t('serviceN8n'),
  };

  summary.innerHTML = [
    { label: `${t('serviceOpenclaw')} ${t('metricCpu')}`, value: `${n(oc.cpuPct).toFixed(1)}%`, className: n(oc.cpuPct) > 85 ? 'bad' : (n(oc.cpuPct) > 60 ? 'warn' : 'ok') },
    { label: `${t('serviceOpenclaw')} ${t('metricRam')}`, value: `${n(oc.ramPct).toFixed(2)}%`, className: n(oc.ramPct) > 20 ? 'warn' : 'ok' },
    { label: `${t('serviceHomeassistant')} ${t('metricCpu')}`, value: `${n(haSvc.cpuPct).toFixed(1)}%`, className: n(haSvc.cpuPct) > 85 ? 'bad' : (n(haSvc.cpuPct) > 60 ? 'warn' : 'ok') },
    { label: `${t('serviceHomeassistant')} ${t('metricRam')}`, value: `${n(haSvc.ramPct).toFixed(2)}%`, className: n(haSvc.ramPct) > 25 ? 'warn' : 'ok' },
    { label: `${t('serviceN8n')} ${t('metricCpu')}`, value: `${n(n8nSvc.cpuPct).toFixed(1)}%`, className: n(n8nSvc.cpuPct) > 85 ? 'bad' : (n(n8nSvc.cpuPct) > 60 ? 'warn' : 'ok') },
    { label: `${t('serviceN8n')} ${t('metricRam')}`, value: `${n(n8nSvc.ramPct).toFixed(2)}%`, className: n(n8nSvc.ramPct) > 25 ? 'warn' : 'ok' },
    { label: `${t('serviceOpenclaw')} MB`, value: `${n(oc.ramMb).toFixed(1)} MB`, className: 'info' },
    { label: `${t('serviceHomeassistant')} MB`, value: `${n(haSvc.ramMb).toFixed(1)} MB`, className: 'info' },
    { label: `${t('serviceN8n')} MB`, value: `${n(n8nSvc.ramMb).toFixed(1)} MB`, className: 'info' },
    { label: t('processPid'), value: oc.running ? String(oc.pid || '-') : '-', className: oc.running ? 'ok' : 'bad' },
    { label: t('processUptime'), value: formatDurationSec(oc.etimeSec), className: 'info' },
    { label: t('hostRamUsage'), value: `${fmtNum(host.ramUsedMb)} / ${fmtNum(host.ramTotalMb)} MB (${n(host.ramUsedPct).toFixed(1)}%)`, className: n(host.ramUsedPct) > 88 ? 'warn' : 'ok' },
    { label: t('loadAvg1m'), value: `${n(host.loadAvg1m).toFixed(2)} / ${fmtNum(host.cpuCount)} CPU`, className: n(host.loadAvg1m) > n(host.cpuCount) ? 'warn' : 'ok' },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}" style="font-size:14px">${esc(k.value)}</div></div>`
  ).join('');

  const ctx = document.getElementById('chartResources');
  const peaksBody = document.getElementById('resourcePeaksRows');
  const series = Array.isArray(resources?.series24h) ? resources.series24h : [];
  if (peaksBody) {
    const peaks = resources?.peaks || {};
    const windowKeys = ['day', 'days7', 'days30'];
    const servicesOrder = ['openclaw', 'homeassistant', 'n8n'];
    const rows = [];

    const peakCell = (entry) => {
      const value = n(entry?.value);
      const ts = n(entry?.ts);
      if (!value) return '—';
      const when = ts ? new Date(ts).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '-';
      return `${value.toFixed(2)}%<br><span style="font-size:10px;color:var(--text2)">${when}</span>`;
    };

    for (const svc of servicesOrder) {
      for (const metric of ['cpu', 'ram']) {
        rows.push({
          service: serviceLabel[svc] || svc,
          metric: metric === 'cpu' ? t('metricCpu') : t('metricRam'),
          values: windowKeys.map((wk) => peaks?.[svc]?.[wk]?.[metric] || null),
        });
      }
    }

    peaksBody.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(row.service)}</td>
        <td>${esc(row.metric)}</td>
        <td>${peakCell(row.values[0])}</td>
        <td>${peakCell(row.values[1])}</td>
        <td>${peakCell(row.values[2])}</td>
      </tr>
    `).join('');
  }

  if (!ctx || typeof Chart === 'undefined') return;

  const labels = series.map((row) => {
    const ts = n(row.ts);
    return ts ? new Date(ts).toLocaleTimeString(getLocale(), { hour12: false }) : '';
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: `${t('serviceOpenclaw')} ${t('metricCpu')}`,
        data: series.map((row) => n(row?.openclaw?.cpuPct)),
        borderColor: 'rgba(245,178,51,0.95)',
        backgroundColor: 'rgba(245,178,51,0.18)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceOpenclaw')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.openclaw?.ramPct)),
        borderColor: 'rgba(255,138,61,0.95)',
        backgroundColor: 'rgba(255,138,61,0.14)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
        borderDash: [6, 4],
      },
      {
        label: `${t('serviceHomeassistant')} ${t('metricCpu')}`,
        data: series.map((row) => n(row?.homeassistant?.cpuPct)),
        borderColor: 'rgba(250,204,21,0.95)',
        backgroundColor: 'rgba(250,204,21,0.15)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceHomeassistant')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.homeassistant?.ramPct)),
        borderColor: 'rgba(249,115,22,0.95)',
        backgroundColor: 'rgba(249,115,22,0.16)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
        borderDash: [6, 4],
      },
      {
        label: `${t('serviceN8n')} ${t('metricCpu')}`,
        data: series.map((row) => n(row?.n8n?.cpuPct)),
        borderColor: 'rgba(255,107,53,0.95)',
        backgroundColor: 'rgba(255,107,53,0.15)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceN8n')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.n8n?.ramPct)),
        borderColor: 'rgba(239,68,68,0.95)',
        backgroundColor: 'rgba(239,68,68,0.14)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
        borderDash: [6, 4],
      },
    ],
  };

  if (chartResources) {
    chartResources.data = chartData;
    chartResources.update();
    return;
  }

  chartResources = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 550, easing: 'easeOutQuart' },
      plugins: {
        legend: { labels: { color: '#d1d5db', font: { size: 11 } } },
      },
      scales: {
        x: {
          ticks: { color: '#cbd5e1', font: { size: 10 }, maxTicksLimit: 12 },
          grid: { color: 'rgba(245,178,51,.08)' },
        },
        y: {
          position: 'left',
          suggestedMin: 0,
          suggestedMax: 100,
          ticks: { color: '#cbd5e1', callback: (v) => `${v}%` },
          grid: { color: 'rgba(245,178,51,.08)' },
        },
      },
    },
  });
}

// ── sections ──────────────────────────────────────────────────────────────────
function renderSummary(data) {
  const box = document.getElementById('summary');
  const oc = data.openclaw;
  const ha = data.homeassistant;
  const kpis = [
    { label: t('openclaw'), value: oc.listening ? t('active') : t('down'), className: oc.listening ? 'ok' : 'bad' },
    { label: 'Home Assistant', value: ha.httpOk ? `● HTTP ${ha.httpStatus}` : t('haNoResponse'), className: ha.httpOk ? 'ok' : 'warn' },
    { label: 'Telegram', value: oc.telegramEnabled ? `● ${oc.telegramBot || t('activeState')}` : t('disabled'), className: oc.telegramEnabled ? 'ok' : 'warn' },
    { label: t('recentErrors'), value: String(oc.errorCountRecent), className: oc.errorCountRecent > 0 ? 'bad' : 'ok' },
    { label: t('cronJobs'), value: String((data.activity.cronJobs || []).length), className: 'info' },
    { label: t('panelUptime'), value: `${Math.floor(data.uptimeSeconds / 60)} min`, className: 'ok' },
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
  const mode = String(data.openclaw.modelModeGuess || '').toLowerCase();
  const isLocal = mode === 'local' || mode.includes('noche/local');
  const isCloud = mode === 'cloud' || mode.includes('dia') || mode.includes('gemini');
  el.innerHTML = `
    <p style="margin-bottom:8px">
      <span class="model-badge ${badge}">${data.openclaw.modelPrimary}</span>
    </p>
    <p style="font-size:12px;color:var(--text2)">${t('modeLabel')}: <strong style="color:var(--text)">${data.openclaw.modelModeGuess}</strong></p>
    <div class="mode-actions">
      <button class="mode-btn ${isLocal ? 'active' : ''}" data-mode="local">${t('localMode')}</button>
      <button class="mode-btn ${isCloud ? 'active' : ''}" data-mode="cloud">${t('cloudMode')}</button>
    </div>
    <p id="modeSwitchMsg" style="font-size:11px;color:var(--text2);min-height:14px;margin-top:6px"></p>
    <p style="font-size:12px;color:var(--text2);margin-top:4px">${t('gateway')}: <code>${data.openclaw.gatewayUrl}</code></p>
    <div style="margin-top:10px">
      <p style="font-size:11px;color:var(--text2);margin-bottom:6px">${t('availableModels')}</p>
      <div id="modelAvailableList" class="model-available-list"></div>
    </div>
  `;
  el.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetMode = btn.dataset.mode;
      if (!targetMode) return;
      const msg = document.getElementById('modeSwitchMsg');
      const buttons = el.querySelectorAll('.mode-btn');
      buttons.forEach((b) => { b.disabled = true; });
      if (msg) msg.textContent = t('applyingMode', { mode: targetMode });
      try {
        const out = await setModelMode(targetMode);
        if (msg) msg.textContent = out?.message || t('modeApplied', { mode: targetMode });
        await load({ force: true, showLoading: false });
      } catch (e) {
        if (msg) msg.textContent = `Error: ${String(e.message || e)}`;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
  const openDash = document.getElementById('openDashboard');
  if (openDash) openDash.href = data.openclaw.dashboardUrl;

  const modelList = document.getElementById('modelAvailableList');
  if (modelList) {
    const allModels = Array.isArray(data?.openclaw?.availableModels) ? data.openclaw.availableModels : [];
    const current = data?.openclaw?.modelPrimary || '';
    if (!allModels.length) {
      modelList.innerHTML = `<span class="model-chip">${t('noModelData')}</span>`;
    } else {
      // Show preferred cloud models first, then others — local models shown smaller
      const preferred = allModels.filter((m) => m.preferred);
      const cloudOther = allModels.filter((m) => !m.preferred && m.tier === 'cloud');
      const local = allModels.filter((m) => m.tier === 'local');
      const toChip = (m, small = false) => {
        const model = esc(m.model || '-');
        const shortName = m.model.split('/').pop();
        const aliasTag = m.alias ? ` · ${esc(m.alias)}` : '';
        const isActive = m.model === current;
        const starTag = m.preferred ? '⭐ ' : '';
        const style = small ? 'opacity:0.55;font-size:10.5px' : '';
        return `<span class="model-chip ${isActive ? 'active-model' : ''}" onclick="quickSetModel('${model}')" title="${model}" style="${style}">${starTag}${escHtml(shortName)}${aliasTag}${isActive ? ' ✓' : ''}</span>`;
      };
      modelList.innerHTML = [
        ...preferred.map((m) => toChip(m, false)),
        ...cloudOther.map((m) => toChip(m, false)),
        ...local.map((m) => toChip(m, true)),
      ].join('');
    }
  }
  // Poblar el selector de Settings también
  populateModelPicker(data);
}

// ── Model picker helpers (Settings section) ───────────────────────────────────
let _lastStatusData = null;

function populateModelPicker(data) {
  _lastStatusData = data;
  const sel = document.getElementById('model-picker-select');
  if (!sel) return;
  const allModels = Array.isArray(data?.openclaw?.availableModels) ? data.openclaw.availableModels : [];
  const current = data?.openclaw?.modelPrimary || '';
  if (!allModels.length) {
    sel.innerHTML = '<option value="">Sin modelos disponibles</option>';
    return;
  }
  const preferred = allModels.filter((m) => m.preferred);
  const cloudOther = allModels.filter((m) => !m.preferred && m.tier === 'cloud');
  const local = allModels.filter((m) => m.tier === 'local');

  const toOption = (m) => {
    const val = m.model || '';
    const shortName = val.split('/').pop();
    const aliasTag = m.alias ? ` · ${m.alias}` : '';
    const label = `${shortName}${aliasTag}`;
    return `<option value="${escHtml(val)}" ${val === current ? 'selected' : ''}>${escHtml(label)}</option>`;
  };

  let html = '';
  if (preferred.length) {
    html += `<optgroup label="⭐ Recomendados (cloud)">${preferred.map(toOption).join('')}</optgroup>`;
  }
  if (cloudOther.length) {
    html += `<optgroup label="☁ Cloud">${cloudOther.map(toOption).join('')}</optgroup>`;
  }
  if (local.length) {
    html += `<optgroup label="💻 Local (menor calidad)">${local.map(toOption).join('')}</optgroup>`;
  }
  sel.innerHTML = html;
  // Estado del gateway y sistema en settings
  const gw = document.getElementById('settings-gateway-block');
  if (gw) gw.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="status-dot ${data.openclaw.listening ? 'online' : 'offline'}"></span>
      <strong>${data.openclaw.listening ? 'Online' : 'Offline'}</strong>
    </div>
    <div style="font-size:12.5px;color:var(--color-text-muted)">
      <div>URL: <code style="font-size:11.5px">${esc(data.openclaw.gatewayUrl || '—')}</code></div>
      <div style="margin-top:4px">Uptime: ${Math.floor((data.uptimeSeconds || 0) / 60)} min</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="copyGatewayAuthBtn2" onclick="copyGatewayAuth2()">
        Copiar token gateway
      </button>
    </div>`;
  const info = document.getElementById('settings-info-block');
  if (info) info.innerHTML = `
    <div style="font-size:12.5px;line-height:1.9;color:var(--color-text-muted)">
      <div>Modelo activo: <span style="color:var(--color-accent);font-weight:600">${esc(current || '—')}</span></div>
      <div>Modo: <strong style="color:var(--color-text)">${esc(data.openclaw.modelModeGuess || '—')}</strong></div>
      <div>HA HTTP: <span class="${data.homeassistant.httpOk ? 'ok' : 'bad'}">${data.homeassistant.httpOk ? `OK (${data.homeassistant.httpStatus})` : 'Sin respuesta'}</span></div>
      <div>Errors recientes: <span class="${data.openclaw.errorCountRecent > 0 ? 'bad' : 'ok'}">${data.openclaw.errorCountRecent}</span></div>
    </div>`;
  // Actualizar botones de modo en settings
  const mode = String(data.openclaw.modelModeGuess || '').toLowerCase();
  document.querySelectorAll('#settings-mode-actions .mode-btn').forEach((btn) => {
    const bm = btn.dataset.mode;
    btn.classList.toggle('active', bm === 'local' ? mode.includes('local') : mode.includes('cloud') || mode.includes('dia'));
  });
}

function previewModel(val) {
  const statusEl = document.getElementById('model-set-status');
  if (statusEl) statusEl.textContent = val ? `Seleccionado: ${val} — haz click en "Aplicar modelo" para activar` : '';
}

async function applySelectedModel() {
  const sel = document.getElementById('model-picker-select');
  const statusEl = document.getElementById('model-set-status');
  const btn = document.getElementById('model-apply-btn');
  const model = sel?.value?.trim();
  if (!model) return;
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = `Aplicando ${model}...`;
  try {
    const res = await apiFetch('/api/model-mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode: 'custom', model }) });
    const data = await res.json().catch(() => ({}));
    if (statusEl) statusEl.textContent = data?.message || `✓ Modelo aplicado: ${model}`;
    showToast(`Modelo cambiado a ${model.split('/').pop()}`, 'success');
    load(); // refrescar estado
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    showToast('Error al cambiar modelo', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function quickSetModel(model) {
  showToast(`Cambiando a ${model.split('/').pop()}...`, 'info', 1500);
  try {
    await apiFetch('/api/model-mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode: 'custom', model }) });
    showToast(`✓ Modelo: ${model.split('/').pop()}`, 'success');
    load();
  } catch { showToast('Error al cambiar modelo', 'error'); }
}

async function setModeFromSettings(mode) {
  const msg = document.getElementById('settings-mode-msg');
  if (msg) msg.textContent = `Aplicando modo ${mode}...`;
  try {
    const out = await setModelMode(mode);
    if (msg) msg.textContent = out?.message || `✓ Modo ${mode} activado`;
    showToast(`Modo ${mode} activado`, 'success');
    load();
  } catch (e) {
    if (msg) msg.textContent = `Error: ${e.message}`;
    showToast('Error al cambiar modo', 'error');
  }
}

async function copyGatewayAuth2() {
  try {
    const res = await apiFetch('/api/gateway-auth', { cache: 'no-store' });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.message || 'Sin token');
    await navigator.clipboard.writeText(`URL: ${data.gatewayUrl}`);
    showToast('URL del gateway copiada', 'success');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
}

async function setModelMode(mode) {
  const res = await apiFetch('/api/model-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const err = data?.message || `No se pudo cambiar a modo ${mode}`;
    throw new Error(err);
  }
  return data;
}

async function callServiceAction(service, action) {
  const res = await apiFetch('/api/service-action', {
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
        <span class="svc-state ${s.running ? 'on' : 'off'}">${s.running ? t('serviceActive') : t('serviceDown')}</span>
      </div>
      <div class="svc-detail">${s.detail || ''}</div>
      <div class="svc-actions">
        <button class="svc-btn start" data-action="start">${t('start')}</button>
        <button class="svc-btn restart" data-action="restart">${t('restart')}</button>
        <button class="svc-btn stop" data-action="stop">${t('stop')}</button>
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
      if (msg) msg.textContent = t('runningAction', { action });
      try {
        const out = await callServiceAction(service, action);
        if (msg) msg.textContent = out.message || 'OK';
        await load({ force: true, showLoading: false });
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
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--text2)">${t('noJobs')}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((j) => `
    <tr>
      <td>${j.name || '-'}</td>
      <td><code>${j.expr || '-'}</code></td>
      <td>${fmtDate(j.nextRunAtMs)}</td>
      <td class="${j.enabled ? 'ok' : 'warn'}">${j.enabled ? t('yes') : t('no')}</td>
    </tr>`
  ).join('');
}

function renderUsage(data) {
  const usage = buildFilteredUsage(data);
  const totals = usage.totals || {};
  const budget = data.usage?.budget || {};
  const credits = data.usage?.openrouterCredits || {};
  const modeLabel = t('all');
  const spendSource = budget.openrouterSpendSource === 'openrouter_api_reset_window'
    ? t('openrouterApiReset')
    : budget.openrouterSpendSource === 'openrouter_api_total'
      ? t('openrouterApiTotal')
      : t('logsLedgerEstimate');
  const summary = document.getElementById('usageSummary');
  const resetInfo = document.getElementById('usageResetInfo');
  summary.innerHTML = [
    { label: `Tokens total (${usage.lookbackDays || 7}d · modo ${modeLabel})`, value: fmtNum(totals.total), className: 'ok' },
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
    const rows = usage.models || [];
    const noRowsMsg = rows.length === 0
      ? ` · ${t('noUsageData')}`
      : '';
    if (usage.resetAtMs) {
      resetInfo.textContent = `Contadores reseteados el ${fmtDate(usage.resetAtMs)} · ventana activa desde ${fmtDate(usage.windowStartAtMs)}${noRowsMsg}`;
    } else {
      resetInfo.textContent = `Sin reset manual activo · ventana activa desde ${fmtDate(usage.windowStartAtMs)}${noRowsMsg}`;
    }
  }

  const tbody = document.getElementById('usageModels');
  const rows = usage.models || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="color:var(--text2)">${t('noUsageData')}</td></tr>`;
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
      ? `<span style="color:var(--green)">${t('reportedApi')}</span>`
      : `<span style="color:var(--yellow)">${t('estimated')}</span>`;
    return `<tr>
      <td><span class="model-badge ${badge}">${r.model.split('/').pop()}</span>
        ${isStrictLocalModelKey(r.model) ? ` <span style="font-size:10px;color:var(--green)">● ${t('local')}</span>` : ` <span style="font-size:10px;color:var(--blue)">☁ ${t('cloud')}</span>`}</td>
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
    ? t('openrouterApiReset')
    : budget.openrouterSpendSource === 'openrouter_api_total'
      ? t('openrouterApiTotal')
      : 'Logs/Ledger';
  const summary = document.getElementById('openrouterSummary');
  if (summary) {
    summary.innerHTML = [
      { label: t('openrouterCalls'), value: fmtNum(totals.calls), className: 'info' },
      { label: t('openrouterTokens'), value: fmtNum(totals.totalTokens), className: 'ok' },
      { label: t('totalCredits'), value: fmtMaybeMoney(credits.totalCreditsUsd, 'USD'), className: 'info' },
      { label: t('remainingCredits'), value: fmtMaybeMoney(credits.remainingUsd, 'USD'), className: (Number(credits.remainingUsd) < 2 ? 'warn' : 'ok') },
      { label: t('totalApiSpend'), value: fmtMaybeMoney(credits.totalUsageUsd, 'USD'), className: 'warn' },
      { label: t('spendSinceReset'), value: fmtMoney(budget.openrouterUsdSpent || 0, 'USD'), className: (budget.openrouterUsedPct || 0) > 80 ? 'bad' : 'ok' },
      { label: t('logsSpend'), value: fmtMoney(budget.openrouterLogsWindowUsd || totals.costUsd || 0, 'USD'), className: 'info' },
      { label: t('spendSource'), value: spendSource, className: 'info' },
      { label: t('externalLedger'), value: fmtMoney(budget.externalLedgerUsd || 0, 'USD'), className: 'info' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
  }

  const tbody = document.getElementById('openrouterModels');
  if (!tbody) return;
  const rows = orUsage.models || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--text2)">${t('noOpenrouterWindow')}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    const sourceLabel = r.costSource === 'reported'
      ? `<span style="color:var(--green)">${t('reportedApi')}</span>`
      : `<span style="color:var(--yellow)">${t('estimated')}</span>`;
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
    el.innerHTML = `<span style="color:var(--text2);font-size:13px">${t('noActivityYet')}</span>`;
    return;
  }
  const tsStr = act.ts ? new Date(act.ts).toLocaleString(getLocale(), { dateStyle: 'full', timeStyle: 'medium' }) : '—';
  const triggerLabel = TRIGGER_ICONS[act.trigger] || act.trigger || '—';
  const roleLabel = act.role ? `<span style="color:var(--text2);font-size:11px">[${act.role}]</span> ` : '';
  const msgEscaped = (act.msg || t('noDetail')).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  el.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div class="kpi" style="min-width:180px">
        <div class="label">${t('dateTime')}</div>
        <div class="value ok" style="font-size:14px">${tsStr}</div>
      </div>
      <div class="kpi" style="min-width:140px">
        <div class="label">${t('calledBy')}</div>
        <div class="value info" style="font-size:15px">${triggerLabel}</div>
      </div>
      <div class="kpi" style="flex:1;min-width:260px">
        <div class="label">${t('lastMessageAction')}</div>
        <div style="font-size:12px;font-family:var(--font);margin-top:4px;color:var(--text);word-break:break-word">
          ${roleLabel}${msgEscaped}
        </div>
      </div>
    </div>`;
}

function renderSoul(data) {
  const el = document.getElementById('soulState');
  if (!el) return;
  const listening = Boolean(data?.openclaw?.listening);
  const errors = Number(data?.openclaw?.errorCountRecent || 0);
  const mode = String(data?.openclaw?.modelModeGuess || 'custom');
  const intensity = listening ? (errors > 0 ? 'alerta' : 'estable') : 'caido';
  el.innerHTML = `
    <div class="soul-wrap ${intensity}">
      <div class="soul-icons">
        <span class="brain">🧠</span>
        <span class="heart">❤️</span>
      </div>
      <div class="soul-text">
        <div><strong>${t('internalState')}:</strong> ${listening ? t('activeState') : t('disconnected')}</div>
        <div><strong>${t('mentalMode')}:</strong> ${mode}</div>
        <div><strong>${t('pulse')}:</strong> ${errors > 0 ? t('recentAlerts', { count: errors }) : t('normal')}</div>
      </div>
    </div>`;
}

function renderSecurity(data) {
  const sec = data?.security || {};
  const prompts = Array.isArray(sec.promptHistory) ? sec.promptHistory : [];
  const sensitive = Array.isArray(sec.sensitiveAccess) ? sec.sensitiveAccess : [];
  const counts = sec?.stats?.severityCounts || {};

  const summary = document.getElementById('securitySummary');
  if (summary) {
    summary.innerHTML = [
      { label: t('promptsDetected'), value: fmtNum(sec?.stats?.promptCount || prompts.length), className: 'info' },
      { label: t('sensitiveAccesses'), value: fmtNum(sec?.stats?.sensitiveCount || sensitive.length), className: sensitive.length ? 'warn' : 'ok' },
      { label: t('critical'), value: fmtNum(counts.critical || 0), className: (counts.critical || 0) > 0 ? 'bad' : 'ok' },
      { label: t('high'), value: fmtNum(counts.high || 0), className: (counts.high || 0) > 0 ? 'warn' : 'ok' },
      { label: t('medium'), value: fmtNum(counts.medium || 0), className: 'info' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
  }

  const sensitiveBody = document.getElementById('sensitiveAccessRows');
  if (sensitiveBody) {
    if (!sensitive.length) {
      sensitiveBody.innerHTML = `<tr><td colspan="6" style="color:var(--text2)">${t('noSensitiveWindow')}</td></tr>`;
    } else {
      sensitiveBody.innerHTML = sensitive.slice(0, 80).map((r) => {
        const sev = String(r.severity || 'low').toLowerCase();
        const sevClass = sev === 'critical' ? 'sev-critical' : sev === 'high' ? 'sev-high' : sev === 'medium' ? 'sev-medium' : 'sev-low';
        const when = r.ts ? new Date(r.ts).toLocaleString(getLocale()) : '-';
        return `<tr>
          <td>${when}</td>
          <td><span class="sev ${sevClass}">${sev.toUpperCase()}</span></td>
          <td>${r.trigger || '-'}</td>
          <td>${r.category || '-'}</td>
          <td><code>${esc(r.match || '-')}</code></td>
          <td style="font-size:11px;color:var(--text2)">${esc(r.source || '-')}</td>
        </tr>`;
      }).join('');
    }
  }

  const promptsBody = document.getElementById('promptHistoryRows');
  if (promptsBody) {
    if (!prompts.length) {
      promptsBody.innerHTML = `<tr><td colspan="5" style="color:var(--text2)">${t('noPromptHistory')}</td></tr>`;
    } else {
      promptsBody.innerHTML = prompts.slice(0, 80).map((p) => {
        const when = p.ts ? new Date(p.ts).toLocaleString(getLocale()) : '-';
        const prompt = esc(p.prompt || '');
        return `<tr>
          <td>${when}</td>
          <td>${p.trigger || '-'}</td>
          <td>${p.role || '-'}</td>
          <td style="max-width:680px;white-space:normal">${prompt}</td>
          <td style="font-size:11px;color:var(--text2)">${esc(p.source || '-')}</td>
        </tr>`;
      }).join('');
    }
  }
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
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text2)">${t('noRepos')}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((p) => {
    if (!p.exists) return `<tr><td>${p.label}</td><td colspan="4" class="warn">${t('notFoundPath')}</td></tr>`;
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
      { label: t('appleDevicesDetected'), value: fmtNum(devices.length), className: devices.length ? 'ok' : 'warn' },
      { label: t('appleSensors'), value: fmtNum(metrics.length), className: metrics.length ? 'ok' : 'warn' },
      { label: t('notifyChannelsAvailable'), value: fmtNum(notifyTargets.length), className: notifyTargets.length ? 'ok' : 'warn' },
      { label: t('integrationStatus'), value: apple.ok ? t('statusConnected') : t('statusError', { error: apple.error || 'sin token' }), className: apple.ok ? 'ok' : 'bad' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
  }

  if (mapHint) {
    if (apple.mapCenter && Number.isFinite(Number(apple.mapCenter.latitude)) && Number.isFinite(Number(apple.mapCenter.longitude))) {
      const lat = Number(apple.mapCenter.latitude).toFixed(6);
      const lon = Number(apple.mapCenter.longitude).toFixed(6);
      mapHint.innerHTML = `${t('mapSuggested')}: <code>${lat},${lon}</code> · <a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}">${t('openMap')}</a>`;
    } else {
      mapHint.textContent = t('noGps');
    }
  }

  const deviceBody = document.getElementById('appleDevices');
  if (deviceBody) {
    if (!devices.length) {
      deviceBody.innerHTML = `<tr><td colspan="6" style="color:var(--text2)">${t('noAppleDevices')}</td></tr>`;
    } else {
      deviceBody.innerHTML = devices.map((d) => {
        const hasGps = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude));
        const gps = hasGps ? `${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}` : '—';
        const map = hasGps
          ? `<a target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/?mlat=${Number(d.latitude).toFixed(6)}&mlon=${Number(d.longitude).toFixed(6)}#map=16/${Number(d.latitude).toFixed(6)}/${Number(d.longitude).toFixed(6)}">${t('viewMap')}</a>`
          : '—';
        const battery = d.battery != null ? `${d.battery}%` : '—';
        return `<tr>
          <td>${d.name}</td>
          <td>${d.state || '-'}</td>
          <td>${battery}</td>
          <td>${gps}</td>
          <td>${map}</td>
          <td>${d.lastUpdated ? new Date(d.lastUpdated).toLocaleString(getLocale()) : '-'}</td>
        </tr>`;
      }).join('');
    }
  }

  const metricsBody = document.getElementById('appleMetrics');
  if (metricsBody) {
    if (!metrics.length) {
      metricsBody.innerHTML = `<tr><td colspan="5" style="color:var(--text2)">${t('noAppleMetrics')}</td></tr>`;
    } else {
      metricsBody.innerHTML = metrics.slice(0, 40).map((m) => `<tr>
        <td>${m.name}</td>
        <td>${m.state ?? '-'}</td>
        <td>${m.unit || '-'}</td>
        <td>${m.deviceClass || '-'}</td>
        <td>${m.lastUpdated ? new Date(m.lastUpdated).toLocaleString(getLocale()) : '-'}</td>
      </tr>`).join('');
    }
  }

  const notifySelect = document.getElementById('appleNotifyTarget');
  if (notifySelect) {
    const prev = notifySelect.value;
    const opts = notifyTargets.length
      ? notifyTargets.map((t) => `<option value="${t.id}">${t.id}</option>`).join('')
      : `<option value="">${currentLang === 'en' ? 'No notify.mobile_app channels' : 'Sin canales notify.mobile_app'}</option>`;
    notifySelect.innerHTML = opts;
    if (prev && [...notifySelect.options].some((o) => o.value === prev)) notifySelect.value = prev;
  }
}

async function sendAppleNotify() {
  const target = document.getElementById('appleNotifyTarget')?.value || '';
  const message = document.getElementById('appleNotifyMessage')?.value?.trim() || '';
  const statusEl = document.getElementById('appleNotifyStatus');
  if (!target) {
    if (statusEl) statusEl.textContent = t('noNotifyTarget');
    return;
  }
  if (!message) {
    if (statusEl) statusEl.textContent = t('writeMessageBeforeSend');
    return;
  }
  if (statusEl) statusEl.textContent = t('sending');
  try {
    const res = await apiFetch('/api/apple/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'Error enviando notify');
    if (statusEl) statusEl.textContent = data.message || t('messageSent');
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${String(e.message || e)}`;
  }
}

async function callVacuumAction(payload) {
  const res = await apiFetch('/api/vacuum/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || 'Vacuum action failed');
  }
  return data;
}

function renderVacuum(data) {
  const vacuum = data?.vacuum || {};
  const primary = vacuum?.primary || null;
  const summary = document.getElementById('vacuumSummary');
  const mapWrap = document.getElementById('vacuumMapWrap');
  const actions = document.getElementById('vacuumActions');
  const zoneRows = document.getElementById('vacuumZonesRows');
  const historyRows = document.getElementById('vacuumHistoryRows');
  const statusEl = document.getElementById('vacuumActionStatus');

  if (!summary || !mapWrap || !actions || !zoneRows || !historyRows) return;

  if (!vacuum.ok || !primary) {
    summary.innerHTML = [
      { label: t('integrationStatus'), value: vacuum?.ok ? t('statusConnected') : t('statusError', { error: vacuum?.error || 'no data' }), className: vacuum?.ok ? 'ok' : 'bad' },
      { label: t('vacuumEntity'), value: '-', className: 'warn' },
      { label: t('vacuumMapStatus'), value: t('vacuumMapUnavailable'), className: 'warn' },
    ].map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}">${k.value}</div></div>`
    ).join('');
    mapWrap.innerHTML = `<div class="vacuum-map-meta">${t('vacuumNotFound')}</div>`;
    actions.innerHTML = '';
    zoneRows.innerHTML = `<tr><td colspan="3" style="color:var(--text2)">${t('vacuumNoZones')}</td></tr>`;
    historyRows.innerHTML = `<tr><td colspan="2" style="color:var(--text2)">${t('vacuumNoHistory')}</td></tr>`;
    if (statusEl) statusEl.textContent = '';
    return;
  }

  const map = primary.map || {};
  const statusText = primary.statusDesc || primary.state || '-';
  const areaText = primary.cleanArea ? `${fmtNum(primary.cleanArea)} m2` : '0 m2';
  const timeText = primary.cleanMinutes ? `${fmtNum(primary.cleanMinutes)} min` : '0 min';
  const lastCleanText = primary.lastCleanTs ? new Date(primary.lastCleanTs).toLocaleString(getLocale()) : '-';

  summary.innerHTML = [
    { label: t('integrationStatus'), value: t('statusConnected'), className: 'ok' },
    { label: t('vacuumEntity'), value: primary.entityId, className: 'info' },
    { label: t('vacuumState'), value: statusText, className: primary.state === 'cleaning' ? 'ok' : 'info' },
    { label: t('vacuumBattery'), value: primary.battery != null ? `${fmtNum(primary.battery)}%` : '-', className: (primary.battery || 0) < 20 ? 'warn' : 'ok' },
    { label: t('vacuumArea'), value: areaText, className: 'info' },
    { label: t('vacuumTime'), value: timeText, className: 'info' },
    { label: t('vacuumLastClean'), value: lastCleanText, className: 'info' },
    { label: t('vacuumMapStatus'), value: map.hasImage ? t('vacuumMapAvailable') : t('vacuumMapUnavailable'), className: map.hasImage ? 'ok' : 'warn' },
  ].map((k) =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.className}" style="font-size:14px">${esc(k.value)}</div></div>`
  ).join('');

  if (map.hasImage && map.imageUrl) {
    const imageUrl = `${map.imageUrl}${map.imageUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;
    mapWrap.innerHTML = `<img src="${imageUrl}" alt="Vacuum map" />`;
  } else {
    const mapList = Array.isArray(map.maps) ? map.maps : [];
    const mapLines = mapList.length
      ? mapList.map((m) => `<li><code>${esc(m.mapId)}</code> · ${esc(m.mapName)} ${m.isCurrent ? '●' : ''}</li>`).join('')
      : `<li style="color:var(--text2)">${t('noData')}</li>`;
    mapWrap.innerHTML = `
      <div class="vacuum-map-meta">
        <div><strong>${t('vacuumMapMeta')}</strong></div>
        <div>${t('vacuumMapObject')}: <code>${esc(map.objectName || '-')}</code></div>
        <div>${t('vacuumCurrentMap')}: <code>${esc(map.currentMapId ?? '-')}</code></div>
        <div style="margin-top:6px"><a target="_blank" rel="noreferrer" href="http://127.0.0.1:8123/developer-tools/state">${t('vacuumOpenHa')}</a></div>
        <ul style="margin-top:6px;padding-left:16px">${mapLines}</ul>
      </div>
    `;
  }

  const roomMapping = Array.isArray(primary.roomMapping) ? primary.roomMapping : [];
  const zoneIds = Array.isArray(primary.zoneIds) ? primary.zoneIds : [];
  const segmentOptions = roomMapping.length
    ? roomMapping.map((r) => `<option value="${esc(r.segmentId)}">${esc(r.name)} (#${esc(r.segmentId)})</option>`).join('')
    : zoneIds.map((id) => `<option value="${esc(id)}">${t('vacuumSelectZone')} #${esc(id)}</option>`).join('');

  actions.innerHTML = `
    <button class="vacuum-btn primary" data-action="start">${t('vacuumActionStart')}</button>
    <button class="vacuum-btn warn" data-action="pause">${t('vacuumActionPause')}</button>
    <button class="vacuum-btn danger" data-action="stop">${t('vacuumActionStop')}</button>
    <button class="vacuum-btn info" data-action="dock">${t('vacuumActionDock')}</button>
    <button class="vacuum-btn" data-action="locate">${t('vacuumActionLocate')}</button>
    ${segmentOptions ? `<select id="vacuumSegmentSelect" style="background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px;min-width:140px">${segmentOptions}</select>` : ''}
    <button class="vacuum-btn" data-action="clean_zone" ${segmentOptions ? '' : 'disabled'}>${t('vacuumActionCleanZone')}</button>
  `;

  actions.querySelectorAll('.vacuum-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = String(btn.dataset.action || '').trim();
      if (!action) return;
      try {
        if (statusEl) statusEl.textContent = t('vacuumActionRunning', { action });
        const payload = { entityId: primary.entityId, action };
        if (action === 'clean_zone') {
          const selected = document.getElementById('vacuumSegmentSelect')?.value || '';
          const segId = Number(selected);
          payload.segmentIds = Number.isFinite(segId) && segId > 0 ? [segId] : [];
        }
        const out = await callVacuumAction(payload);
        if (statusEl) statusEl.textContent = out?.message || t('vacuumActionSent', { action });
        await load({ force: true, showLoading: false });
      } catch (err) {
        if (statusEl) statusEl.textContent = t('vacuumActionError', { error: String(err?.message || err) });
      }
    });
  });

  const zoneData = roomMapping.length
    ? roomMapping.map((r) => ({
        segmentId: r.segmentId,
        roomId: r.roomId,
        name: r.name || '-',
      }))
    : zoneIds.map((id) => ({ segmentId: id, roomId: '-', name: '-' }));

  if (!zoneData.length) {
    zoneRows.innerHTML = `<tr><td colspan="3" style="color:var(--text2)">${t('vacuumNoZones')}</td></tr>`;
  } else {
    zoneRows.innerHTML = zoneData.map((r) => `
      <tr>
        <td><code>${esc(r.segmentId)}</code></td>
        <td>${esc(r.roomId)}</td>
        <td>${esc(r.name)}</td>
      </tr>
    `).join('');
  }

  const cleanHistory = Array.isArray(primary.cleanHistory) ? primary.cleanHistory : [];
  if (!cleanHistory.length) {
    historyRows.innerHTML = `<tr><td colspan="2" style="color:var(--text2)">${t('vacuumNoHistory')}</td></tr>`;
  } else {
    historyRows.innerHTML = cleanHistory.map((h) => `
      <tr>
        <td>${h.startTs ? new Date(h.startTs).toLocaleString(getLocale()) : '-'}</td>
        <td><code>${esc(h.label || '-')}</code></td>
      </tr>
    `).join('');
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
/** Alias público para el botón Actualizar del header */
function refreshStatus() { load({ force: true, showLoading: false }); }

/** Muestra skeletons en los contenedores clave antes de que lleguen los datos */
function showSkeletons() {
  const sk = (id, h = 80) => {
    const el = document.getElementById(id);
    if (!el) return;
    const alreadyLoaded = el.dataset.loaded === '1';
    const hasContent = String(el.innerHTML || '').trim().length > 0;
    if (!alreadyLoaded && !hasContent) {
      el.innerHTML = `<div class="skeleton" style="height:${h}px;border-radius:10px"></div>`;
    }
  };
  sk('summary', 80);
  sk('connections', 100);
  sk('modelInfo', 120);
  sk('resourceSummary', 60);
  sk('worldMapStats', 60);
  sk('worldMapTrace', 44);
  sk('serviceControls', 80);
  sk('lastActivity', 60);
  sk('soulState', 40);
  sk('usageSummary', 60);
}

/** Actualiza el dot y badge del header con el estado del gateway */
function updateHeaderStatus(data) {
  const dot = document.getElementById('gateway-dot');
  const txt = document.getElementById('gateway-status-text');
  const modelBadgeEl = document.getElementById('model-badge');
  const modelNameEl  = document.getElementById('model-name-text');
  const online = data?.openclaw?.listening;
  if (dot) { dot.className = `status-dot ${online ? 'online' : 'offline'}`; }
  if (txt) txt.textContent = online ? 'Online' : 'Offline';
  if (modelNameEl && data?.openclaw?.modelPrimary) {
    modelNameEl.textContent = data.openclaw.modelPrimary.split('/').pop();
    if (modelBadgeEl) modelBadgeEl.style.display = '';
  }
}

function statusSignature(data) {
  const latestTs = n(data?.activity?.latest?.timestampMs);
  const errors = n(data?.activity?.recentErrorsCount) + n(data?.openclaw?.errorCountRecent);
  const model = String(data?.openclaw?.modelPrimary || '');
  const listening = Boolean(data?.openclaw?.listening);
  const usageTotal = n(data?.usage?.totals?.total);
  const series = Array.isArray(data?.resources?.series24h) ? data.resources.series24h : [];
  const lastSeriesTs = n(series.length ? series[series.length - 1]?.ts : 0);
  return [latestTs, errors, model, listening ? 1 : 0, usageTotal, lastSeriesTs].join('|');
}

function renderStatusData(data) {
  renderSummary(data);
  updateHeaderStatus(data);
  renderConnections(data);
  renderModel(data);

  requestAnimationFrame(() => {
    renderWorldMap(data);
    renderResources(data);
    renderServiceControls(data);
    renderLastActivity(data);
    renderSoul(data);
    renderJobs(data);
  });

  setTimeout(() => {
    renderUsage(data);
    renderOpenRouter(data);
    renderSecurity(data);
    updateCharts(buildFilteredUsage(data));
    renderProjects(data);
    renderVacuum(data);
    renderApple(data);
    renderTelegram(data.activity?.telegramEvents || []);
    renderLogContainer('openclawLogs', data.logs?.openclaw || []);
    renderLogContainer('haLogs', data.logs?.homeassistant || []);
    renderLastActivity(data);
  }, 0);

  [
    'summary',
    'connections',
    'modelInfo',
    'resourceSummary',
    'worldMapStats',
    'worldMapTrace',
    'serviceControls',
    'lastActivity',
    'soulState',
    'usageSummary',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.dataset.loaded = '1';
  });
}

async function load(options = {}) {
  const force = options.force === true;
  const showLoading = options.showLoading !== false;
  const now = Date.now();

  if (!force && statusCache.data && (now - statusCache.fetchedAt) < STATUS_CACHE_TTL_MS) {
    renderStatusData(statusCache.data);
    setText('lastUpdate', `${t('lastUpdate')}: ${new Date(statusCache.fetchedAt).toLocaleString(getLocale())} · cache`);
    return;
  }

  if (showLoading && (!statusCache.data || force)) showSkeletons();

  try {
    const statusPath = force ? '/api/status?force=1' : '/api/status';
    const res = await apiFetch(statusPath, { cache: 'no-store' });
    const data = await res.json();
    const sig = statusSignature(data);
    const unchanged = !force && statusCache.signature && statusCache.signature === sig;
    if (unchanged && statusCache.data) {
      statusCache.fetchedAt = now;
      setText('lastUpdate', `${t('lastUpdate')}: ${new Date(now).toLocaleString(getLocale())} · sin cambios`);
      return;
    }
    statusCache = { data, fetchedAt: now, signature: sig };
    renderStatusData(data);
    setText('lastUpdate', `${t('lastUpdate')}: ${new Date(now).toLocaleString(getLocale())}`);
  } catch (e) {
    if (statusCache.data) {
      renderStatusData(statusCache.data);
      setText('lastUpdate', `${t('lastUpdate')}: ${new Date(statusCache.fetchedAt).toLocaleString(getLocale())} · cache/error`);
      return;
    }
    ['summary','connections','modelInfo'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<span style="color:var(--color-destructive);font-size:12px">Error cargando: ${e.message}</span>`;
    });
    setText('lastUpdate', `Error: ${String(e.message || e)}`);
  }
}

async function copyGatewayAuth() {
  const btn = document.getElementById('copyGatewayAuthBtn');
  const original = btn ? btn.textContent : '';
  try {
    if (btn) btn.textContent = t('copying');
    const res = await apiFetch('/api/gateway-auth', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || 'No se pudo leer auth del gateway');
    }
    const text = `URL: ${data.gatewayUrl}\nTOKEN: ${data.token}`;
    await navigator.clipboard.writeText(text);
    if (btn) btn.textContent = t('copied');
  } catch (e) {
    if (btn) btn.textContent = t('copyErrShort');
    alert(`${t('copyError')}: ${String(e.message || e)}`);
  } finally {
    if (btn) setTimeout(() => { btn.textContent = original || t('copyToken'); }, 1600);
  }
}

async function refreshUpdateStatus() {
  const pill = document.getElementById('updateStatusPill');
  if (!pill) return;
  try {
    const res = await apiFetch('/api/update-status', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'status no disponible');
    const installed = data.installed || '-';
    const latest = data.latest || '-';
    if (data.available) {
      pill.className = 'update-pill warn';
      pill.textContent = t('updateAvailable', { installed, latest });
    } else {
      pill.className = 'update-pill ok';
      pill.textContent = t('updateCurrent', { installed });
    }
  } catch (e) {
    pill.className = 'update-pill bad';
    pill.textContent = t('updateError');
  }
}

async function resetUsageCounters() {
  const ok = confirm(t('resetConfirm'));
  if (!ok) return;
  const btn = document.getElementById('resetUsageBtn');
  const original = btn ? btn.textContent : '';
  try {
    if (btn) {
      btn.textContent = t('resetting');
      btn.disabled = true;
    }
    const res = await apiFetch('/api/usage/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.message || 'No se pudo resetear métricas');
    await load({ force: true, showLoading: false });
    const snap = data?.openrouterSnapshot?.ok
      ? t('snapshotCredit', { credit: fmtMoney(data.openrouterSnapshot.remainingUsd, 'USD') })
      : '';
    alert(t('resetDone', { date: fmtDate(data.resetAtMs), snapshot: snap }));
  } catch (e) {
    alert(t('resetError', { error: String(e.message || e) }));
  } finally {
    if (btn) {
      btn.textContent = original || '⟲ Reset métricas';
      btn.disabled = false;
    }
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => load({ force: true, showLoading: false }));
document.getElementById('resetUsageBtn')?.addEventListener('click', resetUsageCounters);
document.getElementById('refreshUpdateBtn')?.addEventListener('click', refreshUpdateStatus);
document.getElementById('copyGatewayAuthBtn')?.addEventListener('click', copyGatewayAuth);
document.getElementById('appleNotifySend')?.addEventListener('click', sendAppleNotify);
document.getElementById('worldMapLocateBtn')?.addEventListener('click', () => {
  requestWorldUserLocation();
  registerUserActivity();
});
document.getElementById('toolbarToggleBtn')?.addEventListener('click', () => {
  toolbarAdvancedCollapsed = !toolbarAdvancedCollapsed;
  localStorage.setItem(TOOLBAR_ADVANCED_COLLAPSED_KEY, toolbarAdvancedCollapsed ? '1' : '0');
  updateToolbarAdvancedUi();
  registerUserActivity();
});
document.getElementById('autoRefreshToggle')?.addEventListener('change', (e) => {
  autoRefreshEnabled = Boolean(e.target?.checked);
  localStorage.setItem(AUTO_REFRESH_ENABLED_KEY, autoRefreshEnabled ? '1' : '0');
  renderAutoRefreshStatus();
  scheduleGlobalRefreshTimers();
  registerUserActivity();
});
document.getElementById('autoRefreshInterval')?.addEventListener('change', (e) => {
  autoRefreshIntervalMs = normalizeAutoRefreshInterval(e.target?.value);
  localStorage.setItem(AUTO_REFRESH_INTERVAL_KEY, String(autoRefreshIntervalMs));
  renderAutoRefreshStatus();
  scheduleGlobalRefreshTimers();
  registerUserActivity();
});
document.getElementById('langSelect')?.addEventListener('change', async (e) => {
  const next = String(e.target?.value || 'es');
  if (!SUPPORTED_LANGS.includes(next)) return;
  currentLang = next;
  localStorage.setItem(LANG_STORAGE_KEY, next);
  applyI18nToDom();
  await load({ showLoading: true });
  await refreshUpdateStatus();
  registerUserActivity();
});

const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
if (savedLang && SUPPORTED_LANGS.includes(savedLang)) currentLang = savedLang;
const savedToolbar = localStorage.getItem(TOOLBAR_ADVANCED_COLLAPSED_KEY);
if (savedToolbar === '0') toolbarAdvancedCollapsed = false;
const savedAutoEnabled = localStorage.getItem(AUTO_REFRESH_ENABLED_KEY);
if (savedAutoEnabled === '0') autoRefreshEnabled = false;
const savedAutoIntervalMs = localStorage.getItem(AUTO_REFRESH_INTERVAL_KEY);
if (savedAutoIntervalMs) autoRefreshIntervalMs = normalizeAutoRefreshInterval(savedAutoIntervalMs);
const langSelect = document.getElementById('langSelect');
if (langSelect) langSelect.value = currentLang;
applyI18nToDom();
updateToolbarAdvancedUi();
load({ showLoading: true });
refreshUpdateStatus();
renderAutoRefreshStatus();
scheduleGlobalRefreshTimers();

['click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach((evt) => {
  window.addEventListener(evt, registerUserActivity, { passive: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) registerUserActivity();
});

// ── Autonomous Agent ─────────────────────────────────────────────────────────
let _autoSessionId = null;
let _autoSSE = null;

function autoSetButtons(running) {
  const start = document.getElementById('auto-start-btn');
  const pause = document.getElementById('auto-pause-btn');
  const stop  = document.getElementById('auto-stop-btn');
  if (start) start.disabled = running;
  if (pause) { pause.disabled = !running; }
  if (stop)  { stop.disabled  = !running; }
}

function updateAutoStatusBadge(status) {
  const badge = document.getElementById('auto-status-badge');
  if (!badge) return;
  const MAP = {
    idle: 'idle', running: 'pensando…', thinking: 'pensando…',
    verifying: 'verificando…', executing: 'ejecutando…',
    paused: 'pausado', completed: '✓ completado', error: '✗ error',
  };
  badge.textContent = MAP[status] || status;
  badge.className = `badge ${status}`;
}

async function autoStart() {
  const goal = (document.getElementById('auto-goal')?.value || '').trim();
  if (!goal) { showToast('Ingresa un objetivo para el agente', 'error'); return; }
  const model = document.getElementById('auto-model-select')?.value || 'openrouter/minimax/minimax-m2.7';
  const maxIterations = Number(document.getElementById('auto-iterations')?.value || 15);
  const riskLevel = document.getElementById('auto-risk-level')?.value || 'MEDIUM';
  try {
    const res = await apiFetch('/api/autonomous/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, model, maxIterations, riskLevel }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.message || 'Error al iniciar', 'error'); return; }
    _autoSessionId = data.sessionId;
    autoSetButtons(true);
    updateAutoStatusBadge('running');
    clearAutoLog();
    connectAutoSSE(_autoSessionId);
    const hint = document.getElementById('auto-verifier-hint');
    if (hint) hint.textContent = `Verificador: ${data.verifierModel}`;
    showToast('Agente autónomo iniciado', 'success');
  } catch (e) {
    showToast('Error de red al iniciar agente', 'error');
  }
}

async function autoStop() {
  if (!_autoSessionId) return;
  try {
    await apiFetch('/api/autonomous/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: _autoSessionId }),
    });
    disconnectAutoSSE();
    autoSetButtons(false);
    updateAutoStatusBadge('error');
    showToast('Agente detenido', 'info');
  } catch { showToast('Error al detener agente', 'error'); }
}

async function autoPause() {
  if (!_autoSessionId) return;
  try {
    await apiFetch('/api/autonomous/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: _autoSessionId }),
    });
    updateAutoStatusBadge('paused');
    showToast('Agente en pausa (reanudará en el próximo ciclo)', 'info');
  } catch { showToast('Error al pausar', 'error'); }
}

function connectAutoSSE(sessionId) {
  if (_autoSSE) _autoSSE.close();
  const token = window.DASHBOARD_TOKEN || localStorage.getItem('dashboard_token') || '';
  const url = `/api/autonomous/stream?sessionId=${encodeURIComponent(sessionId)}${token ? '&token='+encodeURIComponent(token) : ''}`;
  _autoSSE = new EventSource(url);
  _autoSSE.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'step') renderAutoStep(event);
      else if (event.type === 'status') {
        updateAutoStatusBadge(event.status);
        if (event.status === 'completed' || event.status === 'error') {
          autoSetButtons(false);
          disconnectAutoSSE();
          fetchAutoHistory();
        }
      }
    } catch {}
  };
  _autoSSE.onerror = () => disconnectAutoSSE();
}

function disconnectAutoSSE() {
  if (_autoSSE) { _autoSSE.close(); _autoSSE = null; }
}

function clearAutoLog() {
  const log = document.getElementById('auto-step-log');
  if (log) log.innerHTML = '<div style="color:var(--color-text-subtle);font-size:12px;padding:16px;text-align:center">Sin pasos aún</div>';
}

function renderAutoStep(event) {
  const log = document.getElementById('auto-step-log');
  if (!log) return;
  // Remove placeholder
  const placeholder = log.querySelector('div[style*="text-align:center"]');
  if (placeholder) placeholder.remove();

  const phase = event.phase || 'result';
  const stepN = event.stepN || event.step_n || '?';
  const ts = event.ts ? new Date(event.ts).toLocaleTimeString('es-CL') : '';
  const content = event.content || {};

  let bodyHtml = '';
  if (phase === 'thinking') {
    const action = typeof content === 'object' ? content : {};
    bodyHtml = `<div class="auto-step-body"><strong>Acción:</strong> ${escHtml(action.type || '')} ${action.query ? `— ${escHtml(String(action.query))}` : ''} ${action.message ? `— ${escHtml(String(action.message).slice(0,120))}` : ''}</div>`;
    if (action.reasoning) bodyHtml += `<div class="auto-step-reasoning">${escHtml(String(action.reasoning).slice(0,200))}</div>`;
  } else if (phase === 'verifying') {
    const v = typeof content === 'object' ? content : {};
    const verdict = v.approved ? '✓ Aprobado' : '✗ Rechazado';
    bodyHtml = `<div class="auto-step-body">${verdict}${v.reason ? ` — ${escHtml(String(v.reason).slice(0,200))}` : ''}</div>`;
  } else if (phase === 'blocked') {
    const c = typeof content === 'object' ? content : {};
    bodyHtml = `<div class="auto-step-body">Bloqueado: ${escHtml(String(c.reason || content).slice(0,200))}</div>`;
  } else if (phase === 'executing') {
    const c = typeof content === 'object' ? content : {};
    bodyHtml = `<div class="auto-step-body">Ejecutando: <code>${escHtml(String(c.action || ''))}</code></div>`;
  } else if (phase === 'result') {
    const c = typeof content === 'object' ? content : {};
    const ok = c.ok !== false;
    bodyHtml = `<div class="auto-step-body" style="color:${ok ? 'var(--color-success,#4ade80)' : 'var(--color-destructive,#f87171)'}"><strong>${ok ? 'OK' : 'ERROR'}:</strong> ${escHtml(String(c.output || '').slice(0, 400))}</div>`;
  } else {
    bodyHtml = `<div class="auto-step-body">${escHtml(JSON.stringify(content).slice(0,300))}</div>`;
  }

  const phaseLabels = { thinking: 'Pensando', verifying: 'Verificando', blocked: 'Bloqueado', executing: 'Ejecutando', result: 'Resultado' };
  const el = document.createElement('div');
  el.className = `auto-step ${phase}${phase === 'result' && (content?.ok === false) ? ' fail' : ''}`;
  el.innerHTML = `
    <div class="auto-step-header">
      <span class="auto-step-phase">${phaseLabels[phase] || phase}</span>
      <span class="auto-step-n">iter ${stepN}</span>
      <span class="auto-step-ts">${ts}</span>
    </div>
    ${bodyHtml}
  `;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  updateAutoStatusBadge(phase === 'result' ? 'running' : phase);
}

async function fetchAutoStatus() {
  try {
    const res = await apiFetch('/api/autonomous/status', { cache: 'no-store' });
    const data = await res.json();
    if (data.session) {
      _autoSessionId = _autoSessionId || data.session.id;
      updateAutoStatusBadge(data.session.status);
      const isRunning = ['running', 'thinking', 'verifying', 'executing'].includes(data.session.status);
      autoSetButtons(isRunning);
      // Render last steps if log is empty and there are steps
      const log = document.getElementById('auto-step-log');
      const isEmpty = !log || log.querySelector('.auto-step') === null;
      if (isEmpty && data.lastSteps?.length) {
        clearAutoLog();
        data.lastSteps.forEach(step => renderAutoStep({ ...step, phase: step.phase }));
      }
    }
  } catch {}
}

async function fetchAutoHistory() {
  const tbody = document.getElementById('auto-history-tbody');
  if (!tbody) return;
  try {
    const res = await apiFetch('/api/autonomous/history?limit=20', { cache: 'no-store' });
    const data = await res.json();
    if (!data.sessions?.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px">Sin sesiones aún</td></tr>';
      return;
    }
    const STATUS_EMOJI = { idle: '○', running: '⟳', completed: '✓', error: '✗', paused: '⏸' };
    tbody.innerHTML = data.sessions.map(s => `
      <tr>
        <td><span class="badge ${s.status}">${STATUS_EMOJI[s.status] || ''} ${s.status}</span></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(s.goal)}">${escHtml(s.goal.slice(0, 80))}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${escHtml(s.model.split('/').pop())}</td>
        <td style="text-align:center">${s.iteration} / ${s.maxIterations}</td>
        <td style="font-size:11.5px;color:var(--color-text-muted)">${new Date(s.createdAt).toLocaleString('es-CL')}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="loadSessionSteps('${escHtml(s.id)}')">Ver pasos</button></td>
      </tr>
    `).join('');
  } catch {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-destructive);padding:24px">Error cargando historial</td></tr>';
  }
}

async function loadSessionSteps(sessionId) {
  try {
    const res = await apiFetch(`/api/autonomous/steps?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.steps?.length) { showToast('Esta sesión no tiene pasos registrados', 'info'); return; }
    clearAutoLog();
    data.steps.forEach(step => renderAutoStep({ ...step, phase: step.phase }));
    _autoSessionId = sessionId;
    showToast(`Cargando ${data.steps.length} pasos de la sesión`, 'info');
    // scroll to top of log
    const log = document.getElementById('auto-step-log');
    if (log) log.scrollTop = 0;
  } catch { showToast('Error cargando pasos', 'error'); }
}

// Poll status while section is active
setInterval(() => {
  if (isUserEditing()) return;
  const section = document.getElementById('section-autonomous');
  if (section?.classList.contains('active') && _autoSessionId) fetchAutoStatus();
}, 15000);

// ── Local Models (Ollama + hardware compatibility) ────────────────────────────

function escHtmlModels(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchLocalModels() {
  const tbody = document.getElementById('models-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px"><div class="skeleton skeleton-text" style="margin:auto;width:200px"></div></td></tr>';
  try {
    const res = await apiFetch('/api/models/local', { cache: 'no-store' });
    const data = await res.json();

    // KPIs
    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setKpi('models-ollama-status', data.ollamaRunning ? '✓ Activo' : '✕ Detenido');
    const ollamaEl = document.getElementById('models-ollama-status');
    if (ollamaEl) ollamaEl.style.color = data.ollamaRunning ? 'var(--color-success)' : 'var(--color-destructive)';
    const cpuShort = (data.hardware?.cpuBrand || '—').replace('Apple ', '').replace(' Chip', '');
    setKpi('models-cpu', cpuShort || '—');
    setKpi('models-ram', data.hardware?.totalRamGb ? `${data.hardware.totalRamGb} GB` : '—');
    setKpi('models-disk', data.ollamaDiskUsed || '—');
    setKpi('models-count', String(data.models?.length ?? '—'));
    setKpi('models-running-count', String(data.runningModels?.length ?? 0));

    // Models table
    if (!data.models?.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:24px">Sin modelos instalados en Ollama</td></tr>';
    } else {
      if (tbody) tbody.innerHTML = data.models.map(m => {
        let compatBadge = '<span class="compat-badge compat-unknown">?</span>';
        if (m.canRun === true && !m.warning) compatBadge = '<span class="compat-badge compat-ok">✓ Corre bien</span>';
        else if (m.canRun === true && m.warning) compatBadge = `<span class="compat-badge compat-warn" title="${escHtmlModels(m.warning)}">⚠ Ajustado</span>`;
        else if (m.canRun === false) compatBadge = `<span class="compat-badge compat-no" title="${escHtmlModels(m.warning)}">✕ Sin RAM</span>`;
        const loadedBadge = m.isLoaded ? '<span class="compat-badge compat-loaded">▶ En memoria</span>' : '';
        return `<tr${m.isLoaded ? ' class="row-loaded"' : ''}>
          <td style="font-weight:500">${escHtmlModels(m.name)}</td>
          <td style="color:var(--color-text-muted)">${escHtmlModels(m.family || '—')}</td>
          <td>${escHtmlModels(m.parameterSize || '—')}</td>
          <td><code style="font-size:11px">${escHtmlModels(m.quantization || '—')}</code></td>
          <td>${m.sizeGb ? `${m.sizeGb} GB` : '—'}</td>
          <td>${m.ramRequiredGb ? `~${m.ramRequiredGb} GB` : '—'}</td>
          <td>${compatBadge}</td>
          <td>${loadedBadge || '<span style="color:var(--color-text-muted)">—</span>'}</td>
        </tr>`;
      }).join('');
    }

    // Currently loaded
    const loadedList = document.getElementById('models-loaded-list');
    if (loadedList) {
      if (!data.runningModels?.length) {
        loadedList.textContent = 'Sin modelos activos en memoria';
      } else {
        loadedList.innerHTML = data.runningModels.map(m => `
          <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border)">
            <span style="font-weight:500">${escHtmlModels(m.name)}</span>
            <span style="color:var(--color-text-muted)">VRAM: ${m.sizeVram} GB</span>
            ${m.expiresAt ? `<span style="color:var(--color-text-muted)">Expira: ${new Date(m.expiresAt).toLocaleTimeString('es-CL')}</span>` : ''}
          </div>
        `).join('');
      }
    }

    // Recommendations (canirun.ai style)
    renderModelRecommendations(data);

    initLucide();
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-destructive);padding:24px">Error consultando Ollama</td></tr>';
  }
}

function renderModelRecommendations(data) {
  const el = document.getElementById('models-recommendations');
  if (!el) return;
  const ram = data.hardware?.totalRamGb || 0;
  const cpu = data.hardware?.cpuBrand || '';
  const isAppleSilicon = cpu.includes('Apple') || cpu.includes('M1') || cpu.includes('M2') || cpu.includes('M3') || cpu.includes('M4');

  const tiers = [
    { label: '7B–8B Q4', req: 6,  note: 'Velocidad excelente en Apple Silicon. Ideal para uso diario.' },
    { label: '13B Q4',   req: 10, note: 'Alta calidad, buena velocidad en M-series con 16 GB+.' },
    { label: '32B Q4',   req: 22, note: 'Calidad muy alta. Necesita 24 GB+.' },
    { label: '70B Q4',   req: 45, note: 'Calidad premium. Necesita 48 GB+.' },
  ];

  const rows = tiers.map(t => {
    const canRun = ram >= t.req + 2;
    const tight = !canRun && ram >= t.req;
    const icon = canRun ? '✓' : tight ? '⚠' : '✕';
    const cls = canRun ? 'compat-ok' : tight ? 'compat-warn' : 'compat-no';
    return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);align-items:flex-start">
      <span class="compat-badge ${cls}" style="min-width:22px;text-align:center">${icon}</span>
      <div>
        <span style="font-weight:500">${t.label}</span>
        <span style="color:var(--color-text-muted);margin-left:8px;font-size:12px">req. ~${t.req} GB</span>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">${t.note}</div>
      </div>
    </div>`;
  });

  const appleNote = isAppleSilicon
    ? `<div style="background:var(--color-bg-elevated);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px">
        <strong>Apple Silicon (${cpu})</strong> — La memoria unificada actúa como VRAM.
        Con ${ram} GB puedes correr modelos de hasta ~${Math.floor((ram - 2) / 0.55 / 1000)}B parámetros en Q4.
      </div>`
    : '';

  el.innerHTML = appleNote + rows.join('');
}

// Refresh models section every 5min when active
setInterval(() => {
  if (isUserEditing()) return;
  const section = document.getElementById('section-models');
  if (section?.classList.contains('active')) fetchLocalModels();
}, SECTION_AUTO_REFRESH_MS);

// ── Programmer Mode (OpenCode) ────────────────────────────────────────────────

async function fetchOpenCodeStatus() {
  try {
    const res = await apiFetch('/api/opencode/status', { cache: 'no-store' });
    const data = await res.json();

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('oc-status', data.running ? '✓ Corriendo' : '○ Detenido');
    const statusEl = document.getElementById('oc-status');
    if (statusEl) statusEl.style.color = data.running ? 'var(--color-success)' : 'var(--color-text-muted)';
    setEl('oc-version', data.version || '—');
    setEl('oc-port', String(data.port || '—'));
    setEl('oc-sessions-count', String(data.sessions?.length ?? 0));

    // Open link
    const openLink = document.getElementById('oc-open-link');
    if (openLink) {
      openLink.href = data.url || '#';
      openLink.style.display = data.running ? '' : 'none';
    }

    // Project selector
    const select = document.getElementById('oc-project-select');
    if (select && data.projects?.length) {
      const current = select.value;
      select.innerHTML = '<option value="">Selecciona proyecto...</option>' +
        data.projects.map(p => `<option value="${escHtmlModels(p.path)}"${p.path === current ? ' selected' : ''}>${escHtmlModels(p.label)}</option>`).join('');
    }

    // Sessions list
    renderOcSessions(data.sessions || []);

    initLucide();
  } catch (e) {
    document.getElementById('oc-status') && (document.getElementById('oc-status').textContent = 'Error');
  }
}

function renderOcSessions(sessions) {
  const el = document.getElementById('oc-sessions-list');
  if (!el) return;
  if (!sessions.length) {
    el.textContent = 'Sin sesiones recientes';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const id = escHtmlModels(s.id || s.sessionId || '');
    const title = escHtmlModels(s.title || s.name || id.slice(0, 20) || '—');
    const model = escHtmlModels(s.model || '');
    const created = s.createdAt || s.created_at ? new Date(s.createdAt || s.created_at).toLocaleString('es-CL') : '';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--color-border);display:flex;gap:12px;align-items:center">
      <code style="font-size:10px;color:var(--color-text-muted)">${id.slice(0, 8)}</code>
      <span style="font-weight:500;flex:1">${title}</span>
      ${model ? `<span style="font-size:11px;color:var(--color-text-muted)">${model}</span>` : ''}
      ${created ? `<span style="font-size:11px;color:var(--color-text-muted)">${created}</span>` : ''}
    </div>`;
  }).join('');
}

async function startOpenCode() {
  const select = document.getElementById('oc-project-select');
  const projectPath = select?.value || '';
  if (!projectPath) { showToast('Selecciona un proyecto primero', 'warn'); return; }
  const msgEl = document.getElementById('oc-action-msg');
  if (msgEl) msgEl.textContent = 'Iniciando OpenCode...';
  try {
    const res = await apiFetch('/api/opencode/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    const data = await res.json();
    if (msgEl) msgEl.textContent = data.message || (data.ok ? 'OK' : 'Error');
    showToast(data.message || 'Hecho', data.ok ? 'success' : 'error');
    if (data.ok) {
      setTimeout(fetchOpenCodeStatus, 1000);
      const openLink = document.getElementById('oc-open-link');
      if (openLink && data.url) { openLink.href = data.url; openLink.style.display = ''; }
    }
  } catch { showToast('Error iniciando OpenCode', 'error'); }
}

async function stopOpenCode() {
  const msgEl = document.getElementById('oc-action-msg');
  if (msgEl) msgEl.textContent = 'Deteniendo OpenCode...';
  try {
    const res = await apiFetch('/api/opencode/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (msgEl) msgEl.textContent = data.message || 'Detenido';
    showToast('OpenCode detenido', 'info');
    setTimeout(fetchOpenCodeStatus, 800);
  } catch { showToast('Error deteniendo OpenCode', 'error'); }
}

async function fetchOpenCodeLogs() {
  const pre = document.getElementById('oc-logs');
  if (!pre) return;
  try {
    const res = await apiFetch('/api/opencode/logs', { cache: 'no-store' });
    const data = await res.json();
    pre.textContent = data.lines?.join('\n') || '(sin logs)';
    pre.scrollTop = pre.scrollHeight;
  } catch { pre && (pre.textContent = 'Error cargando logs'); }
}

// Refresh programmer section every 15s when active
setInterval(() => {
  if (isUserEditing()) return;
  const section = document.getElementById('section-programmer');
  if (section?.classList.contains('active')) fetchOpenCodeStatus();
}, 30000);

// ── Multi-Agent ───────────────────────────────────────────────────────────────

let _maAgents = [];

async function fetchMultiAgent() {
  try {
    const [agentsRes, cfgRes] = await Promise.all([
      apiFetch('/api/multiagent/agents', { cache: 'no-store' }),
      apiFetch('/api/multiagent/config', { cache: 'no-store' }),
    ]);
    const agentsData = await agentsRes.json();
    const cfgData = await cfgRes.json();

    _maAgents = agentsData.agents || [];

    // KPIs
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('ma-agents-count', String(_maAgents.length));
    const a2aEl = document.getElementById('ma-a2a-status');
    if (a2aEl) { a2aEl.textContent = cfgData.agentToAgentEnabled ? '✓ ON' : '✕ OFF'; a2aEl.style.color = cfgData.agentToAgentEnabled ? 'var(--color-success)' : 'var(--color-text-muted)'; }
    setEl('ma-spawn-depth', String(cfgData.maxSpawnDepth ?? 1));
    const acpEl = document.getElementById('ma-acp-status');
    if (acpEl) { acpEl.textContent = cfgData.acpEnabled ? '✓ ON' : '✕ OFF'; acpEl.style.color = cfgData.acpEnabled ? 'var(--color-success)' : 'var(--color-text-muted)'; }

    // Config toggles
    const a2aToggle = document.getElementById('ma-a2a-toggle');
    if (a2aToggle) a2aToggle.checked = cfgData.agentToAgentEnabled;
    const depthInput = document.getElementById('ma-depth-input');
    if (depthInput) depthInput.value = cfgData.maxSpawnDepth ?? 1;

    // Agents list
    renderMaAgents(_maAgents, agentsData.bindings || []);

    // Populate agent selectors
    const spawnSel = document.getElementById('ma-spawn-agent');
    const filterSel = document.getElementById('ma-sessions-filter');
    if (spawnSel) {
      const current = spawnSel.value;
      spawnSel.innerHTML = _maAgents.map(a => `<option value="${a.id}"${a.id === current ? ' selected' : ''}>${a.identityEmoji || ''} ${a.id}${a.isDefault ? ' (default)' : ''}</option>`).join('');
    }
    if (filterSel) {
      const current = filterSel.value;
      filterSel.innerHTML = '<option value="">Todos los agentes</option>' +
        _maAgents.map(a => `<option value="${a.id}"${a.id === current ? ' selected' : ''}>${a.id}</option>`).join('');
    }

    initLucide();
  } catch (e) {
    console.error('fetchMultiAgent error', e);
  }
}

function renderMaAgents(agents, bindings) {
  const el = document.getElementById('ma-agents-list');
  if (!el) return;
  if (!agents.length) { el.textContent = 'Sin agentes configurados'; return; }
  el.innerHTML = agents.map(a => {
    const routeList = (a.routes || []).join(', ') || '—';
    return `<div style="display:flex;gap:12px;padding:10px;background:var(--color-bg-elevated,var(--color-bg));border-radius:6px;margin-bottom:8px;align-items:flex-start">
      <div style="font-size:20px;line-height:1;padding-top:2px">${a.identityEmoji || '🤖'}</div>
      <div style="flex:1">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <span style="font-weight:600;font-size:14px">${escHtmlModels(a.id)}</span>
          ${a.isDefault ? '<span class="compat-badge compat-ok" style="font-size:10px">default</span>' : ''}
          ${a.identityName ? `<span style="color:var(--color-text-muted);font-size:12px">${escHtmlModels(a.identityName)}</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--color-text-muted);display:flex;flex-wrap:wrap;gap:12px">
          ${a.model ? `<span>Modelo: <code>${escHtmlModels(a.model.split('/').pop())}</code></span>` : ''}
          <span>Bindings: ${a.bindings ?? 0}</span>
          <span style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtmlModels(routeList)}">Rutas: ${escHtmlModels(routeList)}</span>
        </div>
        ${a.workspace ? `<div style="font-size:11px;color:var(--color-text-subtle);margin-top:3px">${escHtmlModels(a.workspace)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function fetchMultiAgentSessions() {
  const tbody = document.getElementById('ma-sessions-tbody');
  const countEl = document.getElementById('ma-sessions-count');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px"><div class="skeleton skeleton-text" style="margin:auto;width:140px"></div></td></tr>';
  const filterSel = document.getElementById('ma-sessions-filter');
  const agentId = filterSel?.value || '';
  try {
    const res = await apiFetch(`/api/multiagent/sessions?limit=30${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`, { cache: 'no-store' });
    const data = await res.json();
    const sessions = data.sessions || [];
    if (countEl) countEl.textContent = String(sessions.length);
    if (!sessions.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:20px">Sin sesiones registradas</td></tr>';
      return;
    }
    if (tbody) tbody.innerHTML = sessions.map(s => {
      const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString('es-CL') : '—';
      const model = s.model ? s.model.split('/').pop() : '—';
      const shortId = (s.sessionId || '').slice(0, 22);
      return `<tr>
        <td><code style="font-size:11px">${escHtmlModels(s.agentId)}</code></td>
        <td style="font-size:11px;color:var(--color-text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtmlModels(s.sessionId)}">${escHtmlModels(shortId)}…</td>
        <td style="text-align:center">${s.turns}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${escHtmlModels(model)}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${updated}</td>
      </tr>`;
    }).join('');
  } catch {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-destructive);padding:16px">Error cargando sesiones</td></tr>';
  }
}

async function spawnSubAgent() {
  const task = document.getElementById('ma-spawn-task')?.value?.trim();
  const agentId = document.getElementById('ma-spawn-agent')?.value || 'main';
  const model = document.getElementById('ma-spawn-model')?.value || '';
  const thinking = document.getElementById('ma-spawn-thinking')?.value || 'low';
  if (!task) { showToast('Escribe una tarea para el sub-agente', 'warn'); return; }
  const resultEl = document.getElementById('ma-spawn-result');
  if (resultEl) resultEl.textContent = 'Lanzando sub-agente...';
  try {
    const res = await apiFetch('/api/multiagent/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, agentId, model, thinking }),
    });
    const data = await res.json();
    if (resultEl) resultEl.textContent = `✓ Lanzado: session=${data.sessionId} · agente=${data.agentId}`;
    showToast(`Sub-agente lanzado (${data.sessionId?.slice(0, 16)})`, 'success');
    document.getElementById('ma-spawn-task') && (document.getElementById('ma-spawn-task').value = '');
    setTimeout(fetchMultiAgentSessions, 2000);
  } catch { showToast('Error lanzando sub-agente', 'error'); }
}

async function setMultiAgentConfig(key, value) {
  try {
    const res = await apiFetch('/api/multiagent/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    const data = await res.json();
    showToast(data.ok ? `Config actualizada: ${key}` : 'Error actualizando config', data.ok ? 'success' : 'error');
    if (data.ok) setTimeout(fetchMultiAgent, 500);
  } catch { showToast('Error actualizando config', 'error'); }
}

// Refresh multi-agent section every 20s when active
setInterval(() => {
  if (isUserEditing()) return;
  const section = document.getElementById('section-multiagent');
  if (section?.classList.contains('active')) fetchMultiAgentSessions();
}, 45000);

// ── Model capabilities + Skills matching ─────────────────────────────────────

// Color map for capability tags
const CAP_COLORS = {
  multimodal: '#7c3aed', vision: '#7c3aed',
  code: '#0ea5e9', 'code-generation': '#0ea5e9',
  reasoning: '#f59e0b', math: '#f59e0b',
  'long-context': '#10b981', 'long context': '#10b981',
  chat: '#6b7280', text: '#6b7280',
  tools: '#ec4899', 'function calling': '#ec4899',
  multilingual: '#14b8a6',
  cloud: '#64748b', local: '#22c55e',
  fast: '#f97316', speed: '#f97316',
};

function capBadge(cap) {
  const color = CAP_COLORS[cap] || '#6b7280';
  const labels = {
    multimodal: 'Multimodal', vision: 'Visión', code: 'Código',
    reasoning: 'Razonamiento', math: 'Matemáticas', 'long-context': 'Ctx largo',
    chat: 'Chat', text: 'Texto', tools: 'Herramientas', multilingual: 'Multilingüe',
    cloud: 'Cloud', local: 'Local', fast: 'Rápido',
  };
  return `<span class="cap-tag" style="background:${color}22;color:${color};border:1px solid ${color}44">${labels[cap] || cap}</span>`;
}

let _capsData = null;
let _activeModelFilter = null;

async function fetchModelCapabilities() {
  const grid = document.getElementById('models-caps-grid');
  const skillsGrid = document.getElementById('models-skills-grid');
  try {
    const res = await apiFetch('/api/models/capabilities', { cache: 'no-store' });
    _capsData = await res.json();
    if (!_capsData.ok) return;

    renderCapabilityCards(_capsData.models);
    buildModelFilterButtons(_capsData.models);
    renderSkillsGrid(_capsData.skills, _capsData.models, _activeModelFilter);
    initLucide();
  } catch (e) {
    if (grid) grid.innerHTML = '<div style="color:var(--color-destructive);font-size:13px">Error cargando capacidades</div>';
  }
}

function renderCapabilityCards(models) {
  const grid = document.getElementById('models-caps-grid');
  if (!grid || !models?.length) return;

  grid.innerHTML = models.map(m => {
    const isCloud = m.isCloud;
    const strengthList = (m.strengths || []).map(s => `<li>${escHtmlModels(s)}</li>`).join('');
    const capBadges = (m.caps || []).map(c => capBadge(c)).join('');
    const cloudBadge = isCloud
      ? '<span class="cap-tag" style="background:#64748b22;color:#94a3b8;border:1px solid #64748b44">☁ Cloud</span>'
      : '<span class="cap-tag" style="background:#22c55e22;color:#4ade80;border:1px solid #22c55e44">⬛ Local</span>';
    const size = m.sizeGb > 0 ? `${m.sizeGb} GB` : isCloud ? 'Cloud' : '—';
    const skillCount = m.matchedSkills?.length || 0;

    return `<div class="cap-card" data-model="${escHtmlModels(m.name)}" onclick="filterSkillsByModel('${escHtmlModels(m.name)}')">
      <div class="cap-card-header">
        <div class="cap-card-badge">${escHtmlModels(m.badge)}</div>
        <div class="cap-card-meta">${cloudBadge} <span style="font-size:11px;color:var(--color-text-muted)">${size}</span></div>
      </div>
      <div class="cap-card-name">${escHtmlModels(m.name.split(':')[0])}<span style="color:var(--color-text-subtle);font-size:10px">:${escHtmlModels(m.name.split(':')[1] || 'latest')}</span></div>
      <div class="cap-card-desc">${escHtmlModels(m.description)}</div>
      <div class="cap-tags">${capBadges}</div>
      ${m.strengths?.length ? `<ul class="cap-strengths">${strengthList}</ul>` : ''}
      <div class="cap-card-footer">
        <span style="font-size:11px;color:var(--color-text-muted)">${skillCount} skill${skillCount !== 1 ? 's' : ''} compatibles</span>
        <span style="font-size:11px;color:var(--color-accent)">Click para filtrar →</span>
      </div>
    </div>`;
  }).join('');
}

function buildModelFilterButtons(models) {
  const filterEl = document.getElementById('skills-model-filter');
  if (!filterEl) return;
  filterEl.innerHTML = models.map(m => {
    const shortName = m.name.split(':')[0].split('/').pop();
    return `<button class="btn btn-ghost btn-sm model-filter-btn" style="font-size:11px;padding:3px 8px" data-model="${escHtmlModels(m.name)}" onclick="filterSkillsByModel('${escHtmlModels(m.name)}')">${escHtmlModels(shortName)}</button>`;
  }).join('');
}

function filterSkillsByModel(modelName) {
  _activeModelFilter = modelName;

  // Highlight active card
  document.querySelectorAll('.cap-card').forEach(c => {
    c.classList.toggle('cap-card-active', c.dataset.model === modelName);
  });
  document.querySelectorAll('.model-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.model === modelName);
  });

  if (_capsData) renderSkillsGrid(_capsData.skills, _capsData.models, modelName);
}

function renderSkillsGrid(skills, models, filterModel) {
  const grid = document.getElementById('models-skills-grid');
  if (!grid) return;
  if (!skills?.length) { grid.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px">Sin skills instaladas</div>'; return; }

  // If filtering by model, get matched skill IDs for that model
  let highlightedSkillIds = new Set();
  if (filterModel) {
    const model = models?.find(m => m.name === filterModel);
    if (model) model.matchedSkills?.forEach(s => highlightedSkillIds.add(s.id));
  }

  // Sort: matched first when filtering
  const sorted = [...skills].sort((a, b) => {
    if (!filterModel) return 0;
    const aMatch = highlightedSkillIds.has(a.id);
    const bMatch = highlightedSkillIds.has(b.id);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });

  // Get best model for each skill
  function bestModelsForSkill(skillId) {
    if (!models) return [];
    return models.filter(m => m.matchedSkills?.some(s => s.id === skillId) && !m.isCloud)
      .map(m => m.name.split(':')[0].split('/').pop());
  }

  grid.innerHTML = sorted.map(s => {
    const isMatch = filterModel ? highlightedSkillIds.has(s.id) : false;
    const shouldDim = filterModel && !isMatch;
    const tagBadges = (s.tags || []).map(t => `<span class="skill-tag">${escHtmlModels(t)}</span>`).join('');
    const bestModels = bestModelsForSkill(s.id);
    const modelHints = bestModels.slice(0, 3).map(n => `<code class="skill-model-hint">${escHtmlModels(n)}</code>`).join('');

    return `<div class="skill-card${isMatch ? ' skill-card-match' : ''}${shouldDim ? ' skill-card-dim' : ''}">
      <div class="skill-card-header">
        <span class="skill-name">${escHtmlModels(s.name || s.id)}</span>
        ${s.version ? `<span style="font-size:10px;color:var(--color-text-subtle)">${escHtmlModels(s.version)}</span>` : ''}
      </div>
      <div class="skill-desc">${escHtmlModels(s.description)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
        ${tagBadges}
        ${modelHints ? `<span style="font-size:10px;color:var(--color-text-subtle);margin-left:4px">→</span>${modelHints}` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Neo4j Graph Memory ───────────────────────────────────────────────────────

async function fetchNeo4jStatus() {
  const statusEl = document.getElementById('neo4j-status');
  const statsEl = document.getElementById('neo4j-stats');
  if (!statusEl) return;

  statusEl.innerHTML = '<span style="color:var(--color-text-muted)">Conectando con el bridge...</span>';

  try {
    const [healthRes, statsRes] = await Promise.all([
      apiFetch('/api/neo4j/health', { cache: 'no-store' }),
      apiFetch('/api/neo4j/stats', { cache: 'no-store' }),
    ]);
    const health = await healthRes.json();
    const stats = await statsRes.json();

    if (health.ok && health.status === 'healthy') {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot status-dot-online"></span>
          <span style="color:var(--color-success)">Bridge activo</span>
          <span style="color:var(--color-text-subtle);font-size:11px">· Neo4j :7687 · FastAPI :7575</span>
        </div>`;
    } else {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot status-dot-offline"></span>
          <span style="color:var(--color-destructive)">Bridge no disponible</span>
          <span style="color:var(--color-text-subtle);font-size:11px">· ${escHtmlModels(health.error || health.detail || 'Sin conexion')}</span>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--color-text-muted)">
          Reinicia el gateway: <code>openclaw gateway restart</code> o inicia Neo4j manualmente
        </div>`;
    }

    // Render stats
    if (stats.ok && stats.counts) {
      const c = stats.counts;
      const statCards = [
        { label: 'Entidades', value: c.entities ?? c.total_entities ?? '—' },
        { label: 'Personas', value: c.persons ?? c.Person ?? '—' },
        { label: 'Organizaciones', value: c.organizations ?? c.Organization ?? '—' },
        { label: 'Objetos', value: c.objects ?? c.Object ?? '—' },
        { label: 'Sesiones', value: c.sessions ?? c.Session ?? '—' },
        { label: 'Mensajes', value: c.messages ?? c.Message ?? '—' },
        { label: 'Tool Calls', value: c.tool_calls ?? c.ToolCall ?? '—' },
        { label: 'Relaciones', value: c.relationships ?? c.total_relationships ?? '—' },
      ];

      statsEl.innerHTML = statCards.map(s => `
        <div class="neo4j-stat-card">
          <div class="neo4j-stat-value">${s.value}</div>
          <div class="neo4j-stat-label">${s.label}</div>
        </div>
      `).join('');
    } else {
      statsEl.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px">Sin datos (bridge no conectado)</div>';
    }

    initLucide();
  } catch (e) {
    statusEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(e.message)}</span>`;
  }
}

async function neo4jRecall() {
  const input = document.getElementById('neo4j-search-input');
  const resultsEl = document.getElementById('neo4j-recall-results');
  const query = input?.value?.trim();
  if (!query) return;

  resultsEl.innerHTML = '<span style="color:var(--color-text-muted)">Buscando...</span>';

  try {
    const res = await apiFetch('/api/neo4j/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 10 }),
    });
    const data = await res.json();

    if (!data.ok) {
      resultsEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(data.error)}</span>`;
      return;
    }

    const results = data.results || [];
    if (results.length === 0) {
      resultsEl.innerHTML = '<span style="color:var(--color-text-muted)">Sin resultados para esta busqueda</span>';
      return;
    }

    resultsEl.innerHTML = results.map((r, i) => {
      const name = r.name || r.entity_type || 'Unknown';
      const type = r.entity_type || r._labels?.[0] || 'Object';
      const desc = r.description || '';
      const rels = (r._relationships || []).slice(0, 3);
      const relHtml = rels.map(rel => `<span class="neo4j-rel-badge">${escHtmlModels(rel.type || '')} → ${escHtmlModels(rel.target_name || rel.target || '')}</span>`).join('');

      return `<div class="neo4j-recall-result">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span class="neo4j-node-badge neo4j-${type.toLowerCase()}" style="font-size:10px;padding:2px 6px">${escHtmlModels(type)}</span>
          <strong style="font-size:13px">${escHtmlModels(name)}</strong>
          <span style="font-size:10px;color:var(--color-text-subtle)">#${i + 1}</span>
        </div>
        ${desc ? `<div style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px">${escHtmlModels(desc)}</div>` : ''}
        ${relHtml ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${relHtml}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    resultsEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(e.message)}</span>`;
  }
}

function neo4jSetCypher(cypher) {
  const el = document.getElementById('neo4j-cypher-input');
  if (el) el.value = cypher;
}

async function neo4jRunCypher() {
  const input = document.getElementById('neo4j-cypher-input');
  const resultsEl = document.getElementById('neo4j-cypher-results');
  const cypher = input?.value?.trim();
  if (!cypher) return;

  resultsEl.innerHTML = '<span style="color:var(--color-text-muted)">Ejecutando...</span>';

  try {
    const res = await apiFetch('/api/neo4j/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cypher, limit: 30 }),
    });
    const data = await res.json();

    if (!data.ok) {
      resultsEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(data.error)}</span>`;
      return;
    }

    const results = data.results || [];
    if (results.length === 0) {
      resultsEl.innerHTML = '<span style="color:var(--color-text-muted)">Sin resultados</span>';
      return;
    }

    // Render as table
    const keys = Object.keys(results[0]);
    const headerRow = keys.map(k => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--color-border);font-size:11px;color:var(--color-text-subtle)">${escHtmlModels(k)}</th>`).join('');
    const bodyRows = results.map(row => {
      const cells = keys.map(k => {
        let v = row[k];
        if (v && typeof v === 'object') v = JSON.stringify(v);
        return `<td style="padding:5px 10px;border-bottom:1px solid var(--color-border);font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtmlModels(String(v ?? ''))}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    resultsEl.innerHTML = `
      <div style="overflow-x:auto;border:1px solid var(--color-border);border-radius:6px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--color-text-subtle)">${results.length} resultado${results.length !== 1 ? 's' : ''}</div>`;
  } catch (e) {
    resultsEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(e.message)}</span>`;
  }
}

async function neo4jStoreEntity() {
  const name = document.getElementById('neo4j-entity-name')?.value?.trim();
  const type = document.getElementById('neo4j-entity-type')?.value || 'Object';
  const desc = document.getElementById('neo4j-entity-desc')?.value?.trim();
  const resultEl = document.getElementById('neo4j-store-result');

  if (!name) { resultEl.innerHTML = '<span style="color:var(--color-warning)">Nombre requerido</span>'; return; }

  resultEl.innerHTML = '<span style="color:var(--color-text-muted)">Guardando...</span>';

  try {
    const res = await apiFetch('/api/neo4j/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'entity',
        data: {
          label: type,
          properties: { name, description: desc || '' },
          relationships: [],
        },
      }),
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.innerHTML = `<span style="color:var(--color-success)">Entidad "${escHtmlModels(name)}" (${type}) guardada</span>`;
      document.getElementById('neo4j-entity-name').value = '';
      document.getElementById('neo4j-entity-desc').value = '';
      setTimeout(fetchNeo4jStatus, 1000);
    } else {
      resultEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(data.error)}</span>`;
    }
  } catch (e) {
    resultEl.innerHTML = `<span style="color:var(--color-destructive)">Error: ${escHtmlModels(e.message)}</span>`;
  }
}
