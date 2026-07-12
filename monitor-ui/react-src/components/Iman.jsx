import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LoadingSpinner from './LoadingSpinner.jsx';

async function imanFetch(path, options = {}) {
  const response = await fetch(`/api/iman${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

const KIND_LABELS = { agent: 'Agente', skill: 'Skill', mcp: 'MCP', tool: 'Herramienta', memory: 'Memoria' };
const KIND_COLORS = { agent: '#8b5cf6', skill: '#3b82f6', mcp: '#14b8a6', tool: '#f59e0b', memory: '#ec4899' };

function buildPositions(nodes) {
  const groups = { agent: [], skill: [], mcp: [], tool: [], memory: [] };
  nodes.forEach((node) => groups[node.kind]?.push(node));
  const columns = { agent: 120, skill: 370, mcp: 610, tool: 610, memory: 850 };
  const positions = new Map();
  Object.entries(groups).forEach(([kind, items]) => {
    const spacing = Math.min(105, 470 / Math.max(items.length, 1));
    const start = 65 + Math.max(0, (470 - spacing * (items.length - 1)) / 2);
    items.forEach((node, index) => positions.set(node.id, { x: columns[kind], y: start + index * spacing }));
  });
  return positions;
}

export default function Iman() {
  const [map, setMap] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [task, setTask] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', purpose: '', model: 'minimax-portal/MiniMax-M2.7', tags: '', skills: '', mcps: '' });
  const [memory, setMemory] = useState({ title: '', content: '', tags: '' });

  const loadMap = useCallback(async () => {
    try {
      const data = await imanFetch('/map');
      setMap(data);
      setSelectedId((current) => current || data.activeAgentId);
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  useEffect(() => { loadMap(); }, [loadMap]);

  const positions = useMemo(() => buildPositions(map?.nodes || []), [map?.nodes]);
  const selected = map?.nodes.find((node) => node.id === selectedId) || null;
  const selectedLinks = useMemo(() => {
    if (!map || !selectedId) return [];
    const ids = new Set(map.edges.filter((edge) => edge.source === selectedId || edge.target === selectedId).flatMap((edge) => [edge.source, edge.target]));
    ids.delete(selectedId);
    return map.nodes.filter((node) => ids.has(node.id));
  }, [map, selectedId]);

  const selectAgent = async (agentId) => {
    setSaving(true);
    try {
      await imanFetch('/select', { method: 'POST', body: JSON.stringify({ agentId }) });
      setMap((current) => ({ ...current, activeAgentId: agentId }));
      setSelectedId(agentId);
      setMessage('Agente activo actualizado. Las integraciones pueden consultar esta selección mediante la API de Imán.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const createAgent = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await imanFetch('/agents', { method: 'POST', body: JSON.stringify(form) });
      setMap(data);
      setSelectedId(data.id);
      setForm((current) => ({ ...current, name: '', description: '', purpose: '', tags: '', skills: '', mcps: '' }));
      setMessage('Agente creado y conectado a sus capacidades.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const addMemory = async (event) => {
    event.preventDefault();
    if (!selected || selected.kind !== 'agent') return;
    setSaving(true);
    try {
      const data = await imanFetch('/memory', { method: 'POST', body: JSON.stringify({ ...memory, agentId: selected.id }) });
      setMap(data);
      setMemory({ title: '', content: '', tags: '' });
      setMessage('Memoria asociada al agente de forma persistente.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const recommend = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await imanFetch('/recommend', { method: 'POST', body: JSON.stringify({ task }) });
      setRecommendation(data.recommendation);
      if (data.recommendation?.agent?.id) setSelectedId(data.recommendation.agent.id);
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  if (!map) return <LoadingSpinner message="Cargando mapa Imán..." />;

  return (
    <div className="section iman-section">
      <header className="dashboard-header">
        <div><h1>🧲 Imán</h1><p className="section-subtitle">Mapa persistente de agentes, skills, MCPs y memoria local</p></div>
        <div className="header-actions"><span className="status-badge status-ok">{map.nodes.length} nodos · {map.edges.length} relaciones</span><button className="btn-refresh" onClick={loadMap}>↻ Actualizar</button></div>
      </header>

      {message ? <div className="iman-message">{message}</div> : null}

      <div className="iman-layout">
        <div className="card iman-canvas-card">
          <div className="iman-legend">{Object.entries(KIND_LABELS).map(([kind, label]) => <span key={kind}><i style={{ background: KIND_COLORS[kind] }} />{label}</span>)}</div>
          <svg className="iman-graph" viewBox="0 0 1000 560" role="img" aria-label="Mapa de agentes y capacidades">
            <defs><marker id="iman-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4b5563" /></marker></defs>
            {map.edges.map((edge) => {
              const source = positions.get(edge.source); const target = positions.get(edge.target);
              if (!source || !target) return null;
              return <g key={edge.id}><line x1={source.x + 70} y1={source.y} x2={target.x - 70} y2={target.y} className="iman-edge" markerEnd="url(#iman-arrow)" /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 5} className="iman-edge-label">{edge.relation}</text></g>;
            })}
            {map.nodes.map((node) => {
              const point = positions.get(node.id); const active = node.id === map.activeAgentId; const selectedNode = node.id === selectedId;
              return <g key={node.id} className="iman-node" onClick={() => setSelectedId(node.id)} role="button" tabIndex="0">
                <rect x={point.x - 78} y={point.y - 30} width="156" height="60" rx="13" fill="#171a24" stroke={selectedNode || active ? KIND_COLORS[node.kind] : '#353949'} strokeWidth={selectedNode ? 3 : 2} />
                <circle cx={point.x - 58} cy={point.y - 12} r="6" fill={KIND_COLORS[node.kind]} />
                <text x={point.x - 45} y={point.y - 8} className="iman-node-kind">{KIND_LABELS[node.kind]}</text>
                <text x={point.x} y={point.y + 13} textAnchor="middle" className="iman-node-name">{node.name.length > 22 ? `${node.name.slice(0, 20)}…` : node.name}</text>
                {active ? <text x={point.x + 65} y={point.y - 16} textAnchor="end" className="iman-active-dot">● ACTIVO</text> : null}
              </g>;
            })}
          </svg>
        </div>

        <aside className="card iman-detail">
          <h3>{selected?.name || 'Selecciona un nodo'}</h3>
          {selected ? <><span className="status-badge" style={{ borderColor: KIND_COLORS[selected.kind] }}>{KIND_LABELS[selected.kind]}</span><p>{selected.description || 'Sin descripción'}</p>
            {selected.metadata?.model ? <p><strong>Modelo:</strong> {selected.metadata.model}</p> : null}
            {selected.metadata?.sourceUrl ? <a href={selected.metadata.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente ↗</a> : null}
            {selectedLinks.length ? <div><h4>Conexiones</h4><div className="iman-chips">{selectedLinks.map((node) => <span key={node.id}>{node.name}</span>)}</div></div> : null}
            {selected.kind === 'agent' ? <button className="btn-primary" disabled={saving || selected.id === map.activeAgentId} onClick={() => selectAgent(selected.id)}>{selected.id === map.activeAgentId ? 'Agente activo' : 'Usar este agente'}</button> : null}
          </> : null}
        </aside>
      </div>

      <div className="iman-panels">
        <form className="card" onSubmit={recommend}>
          <h3>Elegir agente para una tarea</h3><p className="form-help">Imán compara la tarea con tags, propósito y capacidades conectadas.</p>
          <div className="form-group"><label>Tarea</label><textarea rows="3" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Ej: auditar rendimiento de una aplicación React" /></div>
          <button className="btn-primary" disabled={saving || !task.trim()}>Recomendar</button>
          {recommendation ? <div className="iman-recommendation"><strong>{recommendation.agent.name}</strong><span>Coincidencias: {recommendation.matchedTerms.join(', ') || 'agente general'}</span><span>Capacidades: {recommendation.capabilities.join(', ')}</span></div> : null}
        </form>

        <form className="card" onSubmit={createAgent}>
          <h3>Construir agente</h3>
          <div className="iman-form-grid"><div className="form-group"><label>Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div><div className="form-group"><label>Modelo</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div></div>
          <div className="form-group"><label>Propósito</label><input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Qué tareas debe resolver" /></div>
          <div className="form-group"><label>Skills (separadas por coma)</label><input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="playwright-testing, performance" /></div>
          <div className="form-group"><label>MCPs (separados por coma)</label><input value={form.mcps} onChange={(e) => setForm({ ...form, mcps: e.target.value })} placeholder="filesystem, graph-memory" /></div>
          <div className="form-group"><label>Tags</label><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="frontend, testing, react" /></div>
          <button className="btn-primary" disabled={saving}>Crear y conectar</button>
        </form>

        <form className="card" onSubmit={addMemory}>
          <h3>Asociar memoria</h3><p className="form-help">Se vincula al agente seleccionado y permanece en SQLite local.</p>
          <div className="form-group"><label>Agente</label><input value={selected?.kind === 'agent' ? selected.name : 'Selecciona un agente en el mapa'} disabled /></div>
          <div className="form-group"><label>Título</label><input value={memory.title} onChange={(e) => setMemory({ ...memory, title: e.target.value })} required /></div>
          <div className="form-group"><label>Contenido</label><textarea rows="3" value={memory.content} onChange={(e) => setMemory({ ...memory, content: e.target.value })} required /></div>
          <div className="form-group"><label>Tags</label><input value={memory.tags} onChange={(e) => setMemory({ ...memory, tags: e.target.value })} /></div>
          <button className="btn-primary" disabled={saving || selected?.kind !== 'agent'}>Guardar memoria</button>
        </form>
      </div>
    </div>
  );
}
