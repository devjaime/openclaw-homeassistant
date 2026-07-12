import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAgentActivity } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function UpdateCard({ name, color, update }) {
  return (
    <div className="card agent-update-card" style={{ borderTopColor: color }}>
      <div className="service-header"><h3>{name}</h3><span className={`status-badge status-${update?.updateAvailable ? 'warn' : 'ok'}`}>{update?.updateAvailable ? 'ACTUALIZACIÓN' : 'AL DÍA'}</span></div>
      <div className="update-version">{update?.installed || 'Versión no disponible'}</div>
      {update?.latest ? <p>Última disponible: <strong>{update.latest}</strong></p> : null}
      {update?.channel ? <p>Canal: {update.channel}</p> : null}
      {update?.updateDetail ? <p>{update.updateDetail}</p> : null}
    </div>
  );
}

function MemoryGraph({ sessions, memories }) {
  const graph = useMemo(() => {
    const sessionNodes = sessions.slice(0, 6).map((session, index) => ({ ...session, x: 235, y: 60 + index * 72 }));
    const memoryNodes = memories.slice(0, 6).map((memory, index) => ({ ...memory, x: 675, y: 60 + index * 72 }));
    return { sessionNodes, memoryNodes };
  }, [sessions, memories]);

  return (
    <svg className="memory-activity-graph" viewBox="0 0 900 500" role="img" aria-label="Grafo de sesiones y memoria persistente">
      <defs><linearGradient id="memory-core" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8b5cf6"/><stop offset="1" stopColor="#ec4899"/></linearGradient></defs>
      {[...graph.sessionNodes, ...graph.memoryNodes].map((node) => <line key={`edge-${node.id}`} x1="450" y1="250" x2={node.x} y2={node.y} className="memory-graph-edge" />)}
      <circle cx="450" cy="250" r="58" fill="url(#memory-core)" opacity=".9" />
      <text x="450" y="246" textAnchor="middle" className="memory-core-title">MEMORIA</text><text x="450" y="266" textAnchor="middle" className="memory-core-subtitle">persistente local</text>
      {graph.sessionNodes.map((node) => <g key={node.id}><rect x={node.x - 130} y={node.y - 24} width="260" height="48" rx="10" className={`memory-node memory-node-${node.source}`} /><text x={node.x} y={node.y - 3} textAnchor="middle" className="memory-node-title">{node.source === 'hermes' ? '🧠' : '⚡'} {node.title.slice(0, 34)}</text><text x={node.x} y={node.y + 14} textAnchor="middle" className="memory-node-meta">{node.messageCount} msgs · {node.toolCount} tools</text></g>)}
      {graph.memoryNodes.map((node) => <g key={node.id}><rect x={node.x - 130} y={node.y - 24} width="260" height="48" rx="10" className="memory-node memory-node-memory" /><text x={node.x} y={node.y + 4} textAnchor="middle" className="memory-node-title">◆ {node.title.slice(0, 36)}</text></g>)}
      <text x="235" y="490" textAnchor="middle" className="memory-column-label">ÚLTIMAS TUI / SESIONES</text><text x="675" y="490" textAnchor="middle" className="memory-column-label">MEMORIA HERMES</text>
    </svg>
  );
}

export default function AgentActivity() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setData(await fetchAgentActivity()); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sessions = useMemo(() => data?.sessions?.filter((session) => filter === 'all' || session.source === filter) || [], [data?.sessions, filter]);

  if (!data && !error) return <LoadingSpinner message="Leyendo actividad y memoria local..." />;

  return (
    <div className="section agent-activity-section">
      <header className="dashboard-header"><div><h1>Actividad de Agentes</h1><p className="section-subtitle">Actualizaciones, TUI resumidas, iteraciones y memoria persistente</p></div><button className="btn-refresh" onClick={load}>↻ Actualizar</button></header>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="agent-update-grid"><UpdateCard name="⚡ OpenClaw" color="#6366f1" update={data?.updates?.openclaw} /><UpdateCard name="🧠 Hermes Agent" color="#10b981" update={data?.updates?.hermes} /></div>

      <div className="card activity-graph-card"><div className="card-heading"><div><h3>Mapa de memoria y actividad</h3><p>El núcleo conecta sesiones recientes con conocimiento persistente local.</p></div><span className={`status-badge status-${data?.memory?.neo4jBridgeRunning ? 'ok' : 'warn'}`}>Neo4j bridge {data?.memory?.neo4jBridgeRunning ? 'online' : 'degradado'}</span></div><MemoryGraph sessions={data?.sessions || []} memories={data?.memory?.items || []} /></div>

      <div className="card tui-card">
        <div className="card-heading"><div><h3>TUI resumidas e iteraciones recientes</h3><p>Conversaciones locales resumidas sin mostrar razonamiento interno.</p></div><div className="tabs compact-tabs"><button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas</button><button className={`tab ${filter === 'openclaw' ? 'active' : ''}`} onClick={() => setFilter('openclaw')}>OpenClaw</button><button className={`tab ${filter === 'hermes' ? 'active' : ''}`} onClick={() => setFilter('hermes')}>Hermes</button></div></div>
        <div className="tui-list">{sessions.map((session) => <article key={`${session.source}-${session.id}`} className={`tui-session tui-${session.source}`}><div className="tui-session-head"><span className="tui-source">{session.source === 'hermes' ? '🧠 HERMES' : '⚡ OPENCLAW'}</span><time>{formatDate(session.updatedAt)}</time></div><h4>{session.title}</h4><p>{session.summary || 'Sin respuesta resumible todavía.'}</p><div className="tui-metrics"><span>{session.messageCount} mensajes</span><span>{session.toolCount} herramientas</span>{session.tokens ? <span>{session.tokens.toLocaleString()} tokens</span> : null}{session.model ? <span>{session.model}</span> : null}</div>{session.tools?.length ? <div className="iman-chips">{session.tools.map((tool) => <span key={tool}>{tool}</span>)}</div> : null}</article>)}</div>
      </div>

      <div className="card memory-list-card"><h3>Memoria Hermes</h3><div className="memory-summary-grid">{(data?.memory?.items || []).map((item) => <article key={item.id}><h4>{item.title}</h4><p>{item.summary || 'Sección de memoria disponible.'}</p></article>)}</div></div>
    </div>
  );
}
