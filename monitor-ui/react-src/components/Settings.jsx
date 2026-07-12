import React, { useState, useEffect, useCallback } from 'react';

async function apiFetch(path, options = {}) {
  return fetch(`/api${path}`, options).then(r => r.json());
}

export default function Settings() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('services');
  const [serviceAction, setServiceAction] = useState(null);
  const [actionResult, setActionResult] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await apiFetch('/status');
      setStatusData(status);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleServiceAction = async (service, action) => {
    setServiceAction({ service, action });
    setActionResult(null);
    try {
      const res = await fetch('/api/service-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, action }),
      });
      const data = await res.json();
      setActionResult(data);
      setTimeout(loadStatus, 3000);
    } finally {
      setServiceAction(null);
    }
  };

  if (loading) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Configuración</h1></header>
        <div className="card"><p className="empty-state">Cargando...</p></div>
      </div>
    );
  }

  const servicesObj = statusData?.services || {};
  const servicesList = Object.values(servicesObj);
  const openclawRunning = statusData?.openclaw?.listening || false;

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Configuración</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadStatus}>↻ Actualizar</button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Servicios</button>
        <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
        <button className={`tab ${activeTab === 'model' ? 'active' : ''}`} onClick={() => setActiveTab('model')}>Modelo</button>
      </div>

      {activeTab === 'services' && (
        <div className="dashboard-grid">
          <div className="card">
            <h3>OpenClaw Gateway</h3>
            <div className={`status-badge status-${openclawRunning ? 'ok' : 'error'}`}>
              {openclawRunning ? 'CORRIENDO' : 'DETENIDO'}
            </div>
            {statusData?.openclaw?.port && (
              <p className="model-name">Puerto: {statusData.openclaw.port}</p>
            )}
            {statusData?.openclaw?.gatewayUrl && (
              <p className="model-provider">{statusData.openclaw.gatewayUrl}</p>
            )}
            <div className="btn-group">
              <button
                className="btn-primary"
                onClick={() => handleServiceAction('openclaw', 'start')}
                disabled={serviceAction !== null || openclawRunning}
              >
                ▶ Iniciar
              </button>
              <button
                className="btn-danger"
                onClick={() => handleServiceAction('openclaw', 'stop')}
                disabled={serviceAction !== null || !openclawRunning}
              >
                ⏹ Detener
              </button>
              <button
                className="btn-refresh"
                onClick={() => handleServiceAction('openclaw', 'restart')}
                disabled={serviceAction !== null}
              >
                ↻ Reiniciar
              </button>
            </div>
          </div>

          {servicesList.filter(s => s.id !== 'openclaw').map((svc, i) => (
            <div key={i} className="card">
              <h3>{svc.label || svc.id}</h3>
              <div className={`status-badge status-${svc.running ? 'ok' : 'warn'}`}>
                {svc.running ? 'CORRIENDO' : 'DETENIDO'}
              </div>
              <p className="model-provider">{svc.detail || svc.source || ''}</p>
              <div className="btn-group">
                <button
                  className="btn-primary"
                  onClick={() => handleServiceAction(svc.id, 'start')}
                  disabled={serviceAction !== null || svc.running}
                >
                  ▶
                </button>
                <button
                  className="btn-danger"
                  onClick={() => handleServiceAction(svc.id, 'stop')}
                  disabled={serviceAction !== null || !svc.running}
                >
                  ⏹
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'general' && (
        <div className="dashboard-grid">
          <div className="card">
            <h3>Información del Sistema</h3>
            <div className="metric-grid">
              <div className="metric">
                <span className="metric-label">Puerto</span>
                <span className="metric-value">{statusData?.openclaw?.port || '-'}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Uptime</span>
                <span className="metric-value">{statusData?.uptimeSeconds ? formatUptime(statusData.uptimeSeconds) : '-'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'model' && (
        <div className="card">
          <h3>Modelo Activo</h3>
          <div className="metric">
            <span className="metric-label">Primary</span>
            <span className="metric-value">{statusData?.openclaw?.modelPrimary || 'No configurado'}</span>
          </div>
          <div className="metric" style={{ marginTop: 12 }}>
            <span className="metric-label">Mode</span>
            <span className="metric-value">{statusData?.openclaw?.modelModeGuess || '-'}</span>
          </div>
          <div className="metric" style={{ marginTop: 12 }}>
            <span className="metric-label">Cloud Models</span>
            <span className="metric-value">{(statusData?.openclaw?.availableModels || []).filter(m => m.tier === 'cloud').length}</span>
          </div>
        </div>
      )}

      {actionResult && (
        <div className={`card ${actionResult.ok ? 'result-ok' : 'result-error'}`}>
          <h3>Resultado</h3>
          <p className={actionResult.ok ? '' : 'text-danger'}>{actionResult.message}</p>
          {!actionResult.ok && actionResult.output && (
            <pre className="code-block">{actionResult.output}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}