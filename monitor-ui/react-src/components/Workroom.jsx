import React, { useState, useEffect } from 'react';
import { fetchN8nStatus, fetchOpenClawStatus } from '../services/api.js';

const SERVICES = [
  { id: 'openclaw', label: 'OpenClaw', url: 'http://127.0.0.1:18789', color: '#3b82f6', description: 'Gateway de agentes AI' },
  { id: 'homeassistant', label: 'Home Assistant', url: 'http://127.0.0.1:8123', color: '#22c55e', description: 'Domótica y cámaras' },
  { id: 'n8n', label: 'N8N Workflows', url: 'http://127.0.0.1:5678', color: '#f59e0b', description: 'Automatizaciones' },
];

export default function Workroom() {
  const [serviceStatus, setServiceStatus] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServiceStatus();
  }, []);

  const loadServiceStatus = async () => {
    setLoading(true);
    try {
      const [n8n, openclaw] = await Promise.all([
        fetchN8nStatus().catch(() => ({ ok: false, running: false })),
        fetchOpenClawStatus().catch(() => ({ ok: false, running: false })),
      ]);
      setServiceStatus({
        openclaw: openclaw.running || false,
        homeassistant: true,
        n8n: n8n.running || false,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openService = (url) => {
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Workroom</h1></header>
        <div className="card"><p className="empty-state">Cargando estado de servicios...</p></div>
      </div>
    );
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Workroom</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadServiceStatus}>↻ Actualizar</button>
        </div>
      </header>

      <div className="workroom-info">
        <p className="info-text">
          Estos servicios tienen seguridad que impide embeberlos en iframes.
          Usa el botón ↗ para abrir en nueva pestaña, o accede desde el sidebar.
        </p>
      </div>

      <div className="services-grid">
        {SERVICES.map((svc) => (
          <div key={svc.id} className="card service-card" style={{ borderLeft: `4px solid ${svc.color}` }}>
            <div className="service-header">
              <h3>{svc.label}</h3>
              <div className={`status-badge status-${serviceStatus[svc.id] ? 'ok' : 'error'}`}>
                {serviceStatus[svc.id] ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
            <p className="service-desc">{svc.description}</p>
            <p className="service-url">{svc.url}</p>
            <div className="service-actions">
              <button className="btn-primary" onClick={() => openService(svc.url)}>
                ↗ Abrir en navegador
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Accesos Rápidos</h3>
        <div className="quick-access-grid">
          <a href="http://127.0.0.1:18789/" target="_blank" rel="noopener noreferrer" className="quick-access-item">
            <span className="qa-icon">🦎</span>
            <span className="qa-label">OpenClaw Dashboard</span>
          </a>
          <a href="http://127.0.0.1:8123/" target="_blank" rel="noopener noreferrer" className="quick-access-item">
            <span className="qa-icon">🏠</span>
            <span className="qa-label">Home Assistant</span>
          </a>
          <a href="http://127.0.0.1:5678/" target="_blank" rel="noopener noreferrer" className="quick-access-item">
            <span className="qa-icon">⚙️</span>
            <span className="qa-label">N8N Workflows</span>
          </a>
          <a href="http://127.0.0.1:18789/tui" target="_blank" rel="noopener noreferrer" className="quick-access-item">
            <span className="qa-icon">💻</span>
            <span className="qa-label">OpenClaw TUI</span>
          </a>
        </div>
      </div>
    </div>
  );
}