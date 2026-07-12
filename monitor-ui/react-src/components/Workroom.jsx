import React, { useState, useEffect } from 'react';
import { fetchServicesHealth } from '../services/api.js';

const SERVICES = [
  { id: 'openclaw', label: 'OpenClaw', url: 'http://127.0.0.1:18789', color: '#3b82f6', description: 'Gateway de agentes AI' },
  { id: 'homeassistant', label: 'Home Assistant', url: 'http://127.0.0.1:8123', color: '#22c55e', description: 'Domótica y cámaras' },
  { id: 'n8n', label: 'N8N Workflows', url: 'http://127.0.0.1:5678', color: '#f59e0b', description: 'Automatizaciones' },
];

export default function Workroom() {
  const [serviceStatus, setServiceStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadServiceStatus();
  }, []);

  const loadServiceStatus = async () => {
    setLoading(true);
    try {
      const health = await fetchServicesHealth();
      setServiceStatus({
        openclaw: health.services?.openclaw?.running || false,
        homeassistant: health.services?.homeassistant?.running || false,
        n8n: health.services?.n8n?.running || false,
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

  const runServiceAction = async (service, nextAction) => {
    setAction(`${service}:${nextAction}`);
    setMessage('');
    try {
      const response = await fetch('/api/service-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, action: nextAction }),
      });
      const data = await response.json();
      setMessage(data.message || (response.ok ? 'Acción completada' : 'No se pudo completar la acción'));
      await loadServiceStatus();
    } catch (error) { setMessage(error.message); }
    finally { setAction(''); }
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

      {message ? <div className="iman-message">{message}</div> : null}

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
              <button className="btn-refresh" disabled={Boolean(action)} onClick={() => runServiceAction(svc.id, serviceStatus[svc.id] ? 'restart' : 'start')}>
                {action.startsWith(svc.id) ? 'Procesando…' : serviceStatus[svc.id] ? '↻ Reiniciar' : '▶ Iniciar'}
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
