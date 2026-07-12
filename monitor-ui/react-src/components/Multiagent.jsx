import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options });
  return res.json();
}

export default function Multiagent() {
  const [agents, setAgents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spawning, setSpawning] = useState(false);
  const [spawnTask, setSpawnTask] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('main');
  const [activeTab, setActiveTab] = useState('agents');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, sessionsRes, configRes] = await Promise.all([
        apiFetch('/multiagent/agents'),
        apiFetch('/multiagent/sessions'),
        apiFetch('/multiagent/config'),
      ]);
      setAgents(agentsRes.agents || []);
      setSessions(sessionsRes.sessions || []);
      setConfig(configRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSpawn = async () => {
    if (!spawnTask.trim()) return;
    setSpawning(true);
    try {
      const res = await fetch(`${API_BASE}/multiagent/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: spawnTask, agentId: selectedAgent }),
      });
      const data = await res.json();
      if (data.ok) {
        setSpawnTask('');
        setTimeout(loadData, 2000);
      }
    } finally {
      setSpawning(false);
    }
  };

  const handleConfigChange = async (key, value) => {
    const payload = {};
    if (key === 'agentToAgentEnabled') payload.agentToAgentEnabled = value;
    if (key === 'maxSpawnDepth') payload.maxSpawnDepth = value;
    await fetch(`${API_BASE}/multiagent/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    loadData();
  };

  if (loading) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Multi-Agente</h1></header>
        <div className="card"><p className="empty-state">Cargando...</p></div>
      </div>
    );
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Multi-Agente</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadData}>↻ Actualizar</button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'agents' ? 'active' : ''}`} onClick={() => setActiveTab('agents')}>Agentes</button>
        <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>Sesiones</button>
        <button className={`tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>Configuración</button>
      </div>

      {activeTab === 'agents' && (
        <div className="dashboard-grid">
          <div className="card">
            <h3>Agentes Activos</h3>
            {agents.length === 0 ? (
              <p className="empty-state">Sin agentes activos</p>
            ) : (
              <ul className="data-list">
                {agents.map((agent, i) => (
                  <li key={i} className="data-item">
                    <div className="item-main">
                      <span className="item-title">{agent.id || agent.name || 'Unknown'}</span>
                      <span className={`status-badge status-${agent.status === 'running' ? 'ok' : 'warn'}`}>
                        {agent.status || 'unknown'}
                      </span>
                    </div>
                    {agent.description && <p className="item-desc">{agent.description}</p>}
                    <div className="item-meta">
                      {agent.model && <span>Model: {agent.model}</span>}
                      {agent.bindings?.length > 0 && <span>Bindings: {agent.bindings.length}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Lanzar Sub-Agente</h3>
            <div className="form-group">
              <label>Agente</label>
              <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id || a.name} value={a.id || a.name}>{a.id || a.name}</option>
                ))}
                <option value="main">main</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tarea</label>
              <textarea
                rows={4}
                placeholder="Describe la tarea para el sub-agente..."
                value={spawnTask}
                onChange={(e) => setSpawnTask(e.target.value)}
              />
            </div>
            <button className="btn-primary" onClick={handleSpawn} disabled={spawning || !spawnTask.trim()}>
              {spawning ? 'Lanzando...' : '🚀 Lanzar Agente'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="card">
          <h3>Sesiones Recientes</h3>
          {sessions.length === 0 ? (
            <p className="empty-state">Sin sesiones</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Session</th>
                    <th>Turns</th>
                    <th>Modelo</th>
                    <th>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i}>
                      <td>{s.agentId}</td>
                      <td><code>{s.sessionId}</code></td>
                      <td>{s.turns}</td>
                      <td>{s.model || '-'}</td>
                      <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && config && (
        <div className="dashboard-grid">
          <div className="card">
            <h3>Configuración Multi-Agente</h3>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.agentToAgentEnabled}
                  onChange={(e) => handleConfigChange('agentToAgentEnabled', e.target.checked)}
                />
                Agent-to-Agent habilitado
              </label>
              <p className="form-help">Permite que los agentes se comuniquen entre sí directamente</p>
            </div>
            <div className="form-group">
              <label>Max Spawn Depth</label>
              <input
                type="number"
                min={1}
                max={5}
                value={config.maxSpawnDepth}
                onChange={(e) => handleConfigChange('maxSpawnDepth', parseInt(e.target.value))}
              />
              <p className="form-help">Número máximo de niveles de sub-agentes (1-5)</p>
            </div>
            <div className="config-summary">
              <div className="config-item">
                <span className="config-label">Session Visibility</span>
                <span className="config-value">{config.sessionVisibility || 'tree'}</span>
              </div>
              <div className="config-item">
                <span className="config-label">Max Ping-Pong Turns</span>
                <span className="config-value">{config.maxPingPongTurns}</span>
              </div>
              <div className="config-item">
                <span className="config-label">ACP Enabled</span>
                <span className={`status-badge status-${config.acpEnabled ? 'ok' : 'warn'}`}>
                  {config.acpEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}