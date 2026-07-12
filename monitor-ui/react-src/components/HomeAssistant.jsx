import React, { useState, useEffect, useCallback } from 'react';

async function apiFetch(path) {
  return fetch(`/api${path}`).then(r => r.json());
}

export default function HomeAssistant() {
  const [states, setStates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);
  const [recovering, setRecovering] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/ha/states');
      if (res.ok) {
        setStates(res);
      } else {
        setError(res.error || 'Error cargando estados');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const recoverService = async () => {
    setRecovering(true);
    try {
      const response = await fetch('/api/service-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'homeassistant', action: 'restart' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo reiniciar Home Assistant');
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setRecovering(false); }
  };

  if (loading) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Home Assistant</h1></header>
        <div className="card"><p className="empty-state">Cargando...</p></div>
      </div>
    );
  }

  const cameras = states?.cameras || [];
  const vacuums = states?.vacuums || [];
  const lights = states?.lights || [];
  const switches = states?.switches || [];

  return (
    <div className="section">
<header className="dashboard-header">
        <h1>Home Assistant</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadData}>↻ Actualizar</button>
          <a href="http://127.0.0.1:8123/" target="_blank" rel="noopener noreferrer" className="btn-primary">
 ↗ Abrir HA
          </a>
        </div>
      </header>

      {error && <div className="error-banner">{error} <button className="btn-refresh" disabled={recovering} onClick={recoverService}>{recovering ? 'Reiniciando…' : 'Reiniciar servicio'}</button></div>}

      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        <div className="card summary-card">
          <h3>Dispositivos</h3>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-value">{cameras.length}</span>
              <span className="metric-label">Cámaras</span>
            </div>
            <div className="metric">
              <span className="metric-value">{vacuums.length}</span>
              <span className="metric-label">Vacuums</span>
            </div>
            <div className="metric">
              <span className="metric-value">{lights.length}</span>
              <span className="metric-label">Luces</span>
            </div>
            <div className="metric">
              <span className="metric-value">{switches.length}</span>
              <span className="metric-label">Switches</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Resumen</button>
        <button className={`tab ${activeTab === 'cameras' ? 'active' : ''}`} onClick={() => setActiveTab('cameras')}>Cámaras ({cameras.length})</button>
        <button className={`tab ${activeTab === 'vacuum' ? 'active' : ''}`} onClick={() => setActiveTab('vacuum')}>Vacuum</button>
        <button className={`tab ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}>Dispositivos</button>
      </div>

      {activeTab === 'overview' && (
        <div className="dashboard-grid">
          {cameras.length > 0 && (
            <div className="card">
              <h3>Cámaras Activas</h3>
              <ul className="data-list">
                {cameras.slice(0, 5).map((c, i) => (
                  <li key={i} className="data-item">
                    <div className="item-main">
                      <span className="item-title">{c.name}</span>
                      <span className={`status-badge ${c.state === 'idle' ? 'status-ok' : 'status-warn'}`}>
                        {c.state}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {vacuums.length > 0 && (
            <div className="card">
              <h3>Vacuum</h3>
              {vacuums.map((v, i) => (
                <div key={i} className="device-row">
                  <div className="device-info">
                    <span className="device-name">{v.name}</span>
                    <span className={`status-badge ${v.state === 'idle' ? 'status-ok' : 'status-warn'}`}>
                      {v.state}
                    </span>
                  </div>
                  {v.battery > 0 && <span className="device-meta">Battery: {v.battery}%</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cameras' && (
        <div className="cameras-grid">
          {cameras.length === 0 ? (
            <div className="card"><p className="empty-state">Sin cámaras disponibles</p></div>
          ) : cameras.map((cam, i) => (
            <div key={i} className="card camera-card">
              <h3>{cam.name}</h3>
              <div className="camera-preview">
                {cam.thumbnail ? (
                  <img src={`http://127.0.0.1:8123${cam.thumbnail}`} alt={cam.name} />
                ) : (
                  <div className="camera-placeholder">Sin preview</div>
                )}
              </div>
              <div className="camera-info">
                <span className={`status-badge ${cam.state === 'idle' ? 'status-ok' : 'status-warn'}`}>
                  {cam.state}
                </span>
                <span className="camera-id">{cam.entityId}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'vacuum' && (
        <VacuumControl vacuums={vacuums} onAction={loadData} />
      )}

      {activeTab === 'devices' && (
        <div className="dashboard-grid">
          <div className="card">
            <h3>Luces ({lights.length})</h3>
            {lights.length === 0 ? (
              <p className="empty-state">Sin luces</p>
            ) : (
              <ul className="data-list">
                {lights.slice(0, 10).map((l, i) => (
                  <li key={i} className="data-item">
                    <div className="item-main">
                      <span className="item-title">{l.attributes?.friendly_name || l.entity_id}</span>
                      <span className={`status-badge ${l.state === 'on' ? 'status-ok' : ''}`}>
                        {l.state}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3>Switches ({switches.length})</h3>
            {switches.length === 0 ? (
              <p className="empty-state">Sin switches</p>
            ) : (
              <ul className="data-list">
                {switches.slice(0, 10).map((s, i) => (
                  <li key={i} className="data-item">
                    <div className="item-main">
                      <span className="item-title">{s.attributes?.friendly_name || s.entity_id}</span>
                      <span className={`status-badge ${s.state === 'on' ? 'status-ok' : ''}`}>
                        {s.state}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VacuumControl({ vacuums, onAction }) {
  const [calling, setCalling] = useState(null);

  const callService = async (entityId, domain, service) => {
    setCalling(entityId);
    try {
      await fetch('/api/ha/call-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, service, entityId }),
      });
      setTimeout(onAction, 1500);
    } finally {
      setCalling(null);
    }
  };

  if (vacuums.length === 0) {
    return <div className="card"><p className="empty-state">Sin vacuum configurado</p></div>;
  }

  return (
    <div className="dashboard-grid">
      {vacuums.map((v, i) => (
        <div key={i} className="card">
          <h3>{v.name}</h3>
          <div className="vacuum-status">
            <div className="metric-grid">
              <div className="metric">
                <span className="metric-value">{v.state || 'unknown'}</span>
                <span className="metric-label">Estado</span>
              </div>
              <div className="metric">
                <span className="metric-value">{v.battery || 0}%</span>
                <span className="metric-label">Batería</span>
              </div>
<div className="metric">
                <span className="metric-value">{v.cleanArea || 0}m²</span>
                <span className="metric-label">Área limpiada</span>
              </div>
            </div>
          </div>
          <div className="btn-group">
            <button className="btn-primary" onClick={() => callService(v.entityId, 'vacuum', 'start')} disabled={calling}>
              ▶ Iniciar
            </button>
            <button className="btn-primary" onClick={() => callService(v.entityId, 'vacuum', 'pause')} disabled={calling}>
              ⏸ Pausar
            </button>
            <button className="btn-danger" onClick={() => callService(v.entityId, 'vacuum', 'stop')} disabled={calling}>
              ⏹ Detener
            </button>
            <button className="btn-refresh" onClick={() => callService(v.entityId, 'vacuum', 'return_to_base')} disabled={calling}>
              🏠 Dock
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
