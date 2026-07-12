const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function fetchStatus(force = false) {
  const path = force ? '/status?force=1' : '/status';
  const res = await apiFetch(path, { cache: 'no-store' });
  return res.json();
}

export async function fetchUserspace() {
  const res = await apiFetch('/userspace', { cache: 'no-store' });
  return res.json();
}

export async function fetchCrons() {
  const res = await apiFetch('/crons', { cache: 'no-store' });
  return res.json();
}

export async function fetchAudit(page = 0) {
  const res = await apiFetch(`/audit/log?page=${page}`, { cache: 'no-store' });
  return res.json();
}

export async function fetchAutoSessions() {
  const res = await apiFetch('/autonomous/history', { cache: 'no-store' });
  return res.json();
}

export async function fetchModelsCapabilities() {
  const res = await apiFetch('/models/capabilities', { cache: 'no-store' });
  return res.json();
}

export async function fetchModelsLocal() {
  const res = await apiFetch('/models/local', { cache: 'no-store' });
  return res.json();
}

export async function fetchHaStates() {
  const res = await apiFetch('/ha/states', { cache: 'no-store' });
  return res.json();
}

export async function fetchHaCameras() {
  const res = await apiFetch('/ha/cameras', { cache: 'no-store' });
  return res.json();
}

export async function fetchHaVacuum() {
  const res = await apiFetch('/ha/vacuum', { cache: 'no-store' });
  return res.json();
}

export async function callHaService(domain, service, entityId, data = {}) {
  const res = await fetch('/api/ha/call-service', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, service, entityId, data }),
  });
  return res.json();
}

export async function fetchN8nStatus() {
  const res = await apiFetch('/n8n/status', { cache: 'no-store' });
  return res.json();
}

export async function fetchOpenClawStatus() {
  const res = await apiFetch('/openclaw/status', { cache: 'no-store' });
  return res.json();
}

export async function fetchHermesStatus() {
  const res = await apiFetch('/hermes/status', { cache: 'no-store' });
  return res.json();
}

export async function fetchServicesHealth() {
  const res = await apiFetch('/services/health', { cache: 'no-store' });
  return res.json();
}

export async function fetchAgentActivity() {
  const res = await apiFetch('/agents/activity', { cache: 'no-store' });
  return res.json();
}
