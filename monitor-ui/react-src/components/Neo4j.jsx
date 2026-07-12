import React, { useState, useEffect, useCallback } from 'react';

async function apiFetch(path, options = {}) {
  return fetch(`/api${path}`, options).then(r => r.json());
}

export default function Neo4j() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [querying, setQuerying] = useState(false);
  const [recallQuery, setRecallQuery] = useState('');
  const [recallResults, setRecallResults] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, statsRes] = await Promise.all([
        apiFetch('/neo4j/health'),
        apiFetch('/neo4j/stats'),
      ]);
      setHealth(healthRes);
      setStats(statsRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQuerying(true);
    try {
      const res = await fetch('/api/neo4j/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cypher: query }),
      });
      const data = await res.json();
      setQueryResult(data);
    } finally {
      setQuerying(false);
    }
  };

  const handleRecall = async () => {
    if (!recallQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/neo4j/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: recallQuery }),
      });
      const data = await res.json();
      setRecallResults(data);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="section">
        <header className="dashboard-header"><h1>Graph Memory</h1></header>
        <div className="card"><p className="empty-state">Cargando...</p></div>
      </div>
    );
  }

  const isBridgeUp = health?.ok === true && health?.neo4j === 'connected';

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Graph Memory</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadData}>↻ Actualizar</button>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Neo4j Bridge</h3>
          <div className={`status-badge status-${isBridgeUp ? 'ok' : 'error'}`}>
            {isBridgeUp ? 'CONECTADO' : 'DESCONECTADO'}
          </div>
          {health?.uri && <p className="model-provider">{health.uri}</p>}
          {health?.neo4j && <p className="model-provider">Neo4j: {health.neo4j}</p>}
        </div>

        {stats?.ok && (
          <div className="card">
            <h3>Estadísticas</h3>
            <div className="metric-grid">
              <div className="metric">
                <span className="metric-value">{(stats.conversations || 0).toLocaleString()}</span>
                <span className="metric-label">Conversaciones</span>
              </div>
              <div className="metric">
                <span className="metric-value">{(stats.messages || 0).toLocaleString()}</span>
                <span className="metric-label">Mensajes</span>
              </div>
              <div className="metric">
                <span className="metric-value">{(stats.entities || 0).toLocaleString()}</span>
                <span className="metric-label">Entidades</span>
              </div>
              <div className="metric">
                <span className="metric-value">{(stats.traces || 0).toLocaleString()}</span>
                <span className="metric-label">Traces</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Resumen</button>
        <button className={`tab ${activeTab === 'query' ? 'active' : ''}`} onClick={() => setActiveTab('query')}>Consulta CYPHER</button>
        <button className={`tab ${activeTab === 'recall' ? 'active' : ''}`} onClick={() => setActiveTab('recall')}>Recall</button>
      </div>

      {activeTab === 'overview' && stats?.ok && (
        <div className="card">
          <h3>Memoria de Conocimiento</h3>
          <div className="metric-grid" style={{ marginTop: 16 }}>
            <div className="metric">
              <span className="metric-value">{(stats.facts || 0).toLocaleString()}</span>
              <span className="metric-label">Facts</span>
            </div>
            <div className="metric">
              <span className="metric-value">{(stats.preferences || 0).toLocaleString()}</span>
              <span className="metric-label">Preferences</span>
            </div>
          </div>
          <p className="empty-state" style={{ marginTop: 16 }}>
            Agente: {stats.agent_id || 'main'}
          </p>
        </div>
      )}

      {activeTab === 'query' && (
        <div className="card">
          <h3>Consulta CYPHER</h3>
          <div className="form-group">
            <textarea
              rows={5}
              placeholder="MATCH (n) RETURN n LIMIT 25"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={handleQuery} disabled={querying || !query.trim()}>
            {querying ? 'Ejecutando...' : '▶ Ejecutar'}
          </button>
          {queryResult && (
            <div className="query-result">
              {queryResult.error ? (
                <p className="text-danger">Error: {queryResult.error}</p>
              ) : queryResult.data ? (
                <pre className="code-block">{JSON.stringify(queryResult.data, null, 2)}</pre>
              ) : (
                <p className="empty-state">Sin resultados</p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'recall' && (
        <div className="card">
          <h3>Buscar Memoria</h3>
          <div className="form-group">
            <input
              type="text"
              placeholder="Término de búsqueda..."
              value={recallQuery}
              onChange={(e) => setRecallQuery(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={handleRecall} disabled={!recallQuery.trim()}>
            🔍 Buscar
          </button>
          {recallResults && (
            <div className="recall-results">
              {recallResults.error ? (
                <p className="text-danger">Error: {recallResults.error}</p>
              ) : recallResults.results?.length > 0 ? (
                <ul className="data-list">
                  {recallResults.results.map((r, i) => (
                    <li key={i} className="data-item">
                      <div className="item-title">{r.text || r.content || 'Sin texto'}</div>
                      {r.score && <span className="item-meta">Score: {r.score.toFixed(3)}</span>}
                      {r.metadata && <code className="item-path">{JSON.stringify(r.metadata)}</code>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">Sin resultados</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}