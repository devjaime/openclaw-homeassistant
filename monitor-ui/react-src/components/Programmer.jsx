import React, { useState, useEffect, useCallback } from 'react';

async function apiFetch(path) {
  return fetch(`/api${path}`).then(r => r.json());
}

export default function Programmer() {
  const [opencodeStatus, setOpencodeStatus] = useState(null);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sessions');
  const [starting, setStarting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [oc, skillsData] = await Promise.all([
        apiFetch('/opencode/status'),
        apiFetch('/skills/list'),
      ]);
      setOpencodeStatus(oc);
      setSkills(skillsData.skills || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStartOpenCode = async (projectPath) => {
    setStarting(true);
    try {
      const res = await fetch('/api/opencode/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setTimeout(loadData, 1500);
      }
    } finally {
      setStarting(false);
    }
  };

  const handleStopOpenCode = async () => {
    await fetch('/api/opencode/stop', { method: 'POST' });
    setTimeout(loadData, 1000);
  };

  if (loading) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Programador</h1></header>
        <div className="card"><p className="empty-state">Cargando...</p></div>
      </div>
    );
  }

  const oc = opencodeStatus || {};
  const codeSkills = skills.filter(s => s.tags?.includes('code') || s.tags?.includes('testing') || s.tags?.includes('frontend'));

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Programador</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadData}>↻ Actualizar</button>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="card">
          <h3>OpenCode</h3>
          <div className={`status-badge status-${oc.running ? 'ok' : 'warn'}`}>
            {oc.running ? 'CORRIENDO' : 'DETENIDO'}
          </div>
          {oc.version && <p className="model-name">v{oc.version}</p>}
          {oc.url && (
            <div className="url-link">
              <a href={oc.url} target="_blank" rel="noopener noreferrer">{oc.url}</a>
              <button className="btn-icon" onClick={() => window.open(oc.url, '_blank')}>↗</button>
            </div>
          )}
          <div className="btn-group">
            {oc.running ? (
              <button className="btn-danger" onClick={handleStopOpenCode}>⏹ Detener</button>
            ) : (
              <button className="btn-primary" onClick={() => handleStartOpenCode(oc.projects?.[0]?.path)} disabled={starting}>
                {starting ? 'Iniciando...' : '▶ Iniciar OpenCode'}
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Proyectos</h3>
          {oc.projects?.length > 0 ? (
            <ul className="data-list">
              {oc.projects.map((p, i) => (
                <li key={i} className="data-item">
                  <div className="item-main">
                    <span className="item-title">{p.name}</span>
                  </div>
                  <code className="item-path">{p.path}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">Sin proyectos configurados</p>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>Sesiones</button>
        <button className={`tab ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>Skills Code</button>
      </div>

      {activeTab === 'sessions' && (
        <div className="card">
          <h3>Sesiones Recientes</h3>
          {oc.sessions?.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Proyecto</th>
                    <th>Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {oc.sessions.map((s, i) => (
                    <tr key={i}>
                      <td><code>{s.sessionId || s.id}</code></td>
                      <td>{s.projectName || '-'}</td>
                      <td>{s.lastActivity ? new Date(s.lastActivity).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">Sin sesiones recientes</p>
          )}
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="dashboard-grid">
          {codeSkills.length > 0 ? codeSkills.map((skill, i) => (
            <div key={i} className="card skill-card">
              <h4>{skill.name}</h4>
              <p className="skill-desc">{skill.description}</p>
              <div className="skill-tags">
                {skill.tags?.map(tag => <span key={tag} className="tag">{tag}</span>)}
              </div>
              {skill.version && <span className="skill-version">v{skill.version}</span>}
            </div>
          )) : (
            <p className="empty-state">Sin skills de código disponibles</p>
          )}
        </div>
      )}
    </div>
  );
}