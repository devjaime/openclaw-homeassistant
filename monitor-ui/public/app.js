// ── helpers ──────────────────────────────────────────────────────────────────

/** Fetch wrapper que incluye X-Dashboard-Token si está configurado (task 5.1). */
function apiFetch(path, options = {}) {
  const token = window.DASHBOARD_TOKEN || localStorage.getItem('dashboard_token') || '';
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-Dashboard-Token'] = token;
  return fetch(path, { ...options, headers });
}

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
    headerSubtitle: 'OpenClaw + Home Assistant · actualización cada 30s',
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
    headerSubtitle: 'OpenClaw + Home Assistant · refresh every 30s',
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
        borderColor: 'rgba(25,181,254,0.95)',
        backgroundColor: 'rgba(25,181,254,0.18)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceOpenclaw')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.openclaw?.ramPct)),
        borderColor: 'rgba(45,212,191,0.95)',
        backgroundColor: 'rgba(45,212,191,0.12)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
        borderDash: [6, 4],
      },
      {
        label: `${t('serviceHomeassistant')} ${t('metricCpu')}`,
        data: series.map((row) => n(row?.homeassistant?.cpuPct)),
        borderColor: 'rgba(249,115,22,0.95)',
        backgroundColor: 'rgba(249,115,22,0.15)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceHomeassistant')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.homeassistant?.ramPct)),
        borderColor: 'rgba(245,158,11,0.95)',
        backgroundColor: 'rgba(245,158,11,0.15)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
        borderDash: [6, 4],
      },
      {
        label: `${t('serviceN8n')} ${t('metricCpu')}`,
        data: series.map((row) => n(row?.n8n?.cpuPct)),
        borderColor: 'rgba(167,139,250,0.95)',
        backgroundColor: 'rgba(167,139,250,0.15)',
        yAxisID: 'y',
        tension: 0.28,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `${t('serviceN8n')} ${t('metricRam')}`,
        data: series.map((row) => n(row?.n8n?.ramPct)),
        borderColor: 'rgba(34,197,94,0.95)',
        backgroundColor: 'rgba(34,197,94,0.15)',
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
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 12 },
          grid: { color: 'rgba(255,255,255,.05)' },
        },
        y: {
          position: 'left',
          suggestedMin: 0,
          suggestedMax: 100,
          ticks: { color: '#94a3b8', callback: (v) => `${v}%` },
          grid: { color: 'rgba(255,255,255,.05)' },
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
        await load();
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
    if (!allModels.length) {
      modelList.innerHTML = `<span class="model-chip">${t('noModelData')}</span>`;
    } else {
      modelList.innerHTML = allModels.map((m) => {
        const model = esc(m.model || '-');
        const alias = m.alias ? ` · ${esc(m.alias)}` : '';
        return `<span class="model-chip">${model}${alias}</span>`;
      }).join('');
    }
  }
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
        await load();
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
async function load() {
  try {
    const res = await apiFetch('/api/status', { cache: 'no-store' });
    const data = await res.json();
    renderSummary(data);
    renderConnections(data);
    renderModel(data);
    renderResources(data);
    renderServiceControls(data);
    renderJobs(data);
    renderUsage(data);
    renderOpenRouter(data);
    renderProjects(data);
    renderVacuum(data);
    renderApple(data);
    renderTelegram(data.activity.telegramEvents || []);
    renderLogContainer('openclawLogs', data.logs.openclaw || []);
    renderLogContainer('haLogs', data.logs.homeassistant || []);
    renderLastActivity(data);
    renderSoul(data);
    renderSecurity(data);
    updateCharts(buildFilteredUsage(data));
    setText('lastUpdate', `${t('lastUpdate')}: ${new Date().toLocaleString(getLocale())}`);
  } catch (e) {
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
    await load();
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

document.getElementById('refreshBtn').addEventListener('click', load);
document.getElementById('resetUsageBtn')?.addEventListener('click', resetUsageCounters);
document.getElementById('refreshUpdateBtn')?.addEventListener('click', refreshUpdateStatus);
document.getElementById('copyGatewayAuthBtn')?.addEventListener('click', copyGatewayAuth);
document.getElementById('appleNotifySend')?.addEventListener('click', sendAppleNotify);
document.getElementById('langSelect')?.addEventListener('change', async (e) => {
  const next = String(e.target?.value || 'es');
  if (!SUPPORTED_LANGS.includes(next)) return;
  currentLang = next;
  localStorage.setItem(LANG_STORAGE_KEY, next);
  applyI18nToDom();
  await load();
  await refreshUpdateStatus();
});

const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
if (savedLang && SUPPORTED_LANGS.includes(savedLang)) currentLang = savedLang;
const langSelect = document.getElementById('langSelect');
if (langSelect) langSelect.value = currentLang;
applyI18nToDom();
load();
refreshUpdateStatus();
setInterval(load, 30000);
setInterval(refreshUpdateStatus, 60000);
