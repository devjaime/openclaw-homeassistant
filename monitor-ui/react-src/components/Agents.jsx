import React, { useState, useEffect } from 'react';
import { fetchOpenClawStatus, fetchHermesStatus } from '../services/api.js';

const AGENT_USE_CASES = {
  openclaw: {
    title: 'OpenClaw',
    subtitle: 'Gateway de automatización multi-canal',
    icon: '⚡',
    color: '#6366f1',
    cases: [
      {
        title: '🧭 Routing Multiagente',
        description: 'Agentes aislados por workspace, remitente y sesión con políticas propias.',
        capabilities: ['isolated sessions', 'subagents', 'agent send', 'goal tracking'],
        example: 'LONKO coordina especialistas sin mezclar memoria laboral, financiera o personal.'
      },
      {
        title: '⏱️ Automatización Persistente',
        description: 'Cron, webhooks y eventos de heartbeat con historial y entrega multicanal.',
        capabilities: ['persistent cron', 'webhooks', 'wake events', 'run history'],
        example: 'Revisión semanal que prepara evidencia sin publicar ni enviar nada automáticamente.'
      },
      {
        title: '🧰 Tools, Skills y Plugins',
        description: 'Acciones tipadas, workflows reutilizables y extensiones con políticas de acceso.',
        capabilities: ['tool search', 'skills', 'MCP', 'plugins', 'approvals'],
        example: 'PILLÁN descubre la herramienta mínima, implementa y deja pruebas verificables.'
      },
      {
        title: '🧠 Memoria Durable',
        description: 'Memoria Markdown, diarios, DREAMS y búsqueda/indexación QMD con ownership.',
        capabilities: ['MEMORY.md', 'daily memory', 'QMD', 'dreaming', 'compaction'],
        example: 'KIMÜN relaciona decisiones, proyectos y aprendizajes con trazabilidad local.'
      },
      {
        title: '🌐 Browser, Nodos y Canvas',
        description: 'Navegador aislado, dispositivos pareados y superficies visuales A2UI.',
        capabilities: ['browser control', 'mobile nodes', 'Canvas', 'camera', 'voice'],
        example: 'Automatizar investigación web con navegador separado del perfil personal.'
      },
      {
        title: '🔐 Runtime y Privacidad',
        description: 'Proveedores cloud o locales, sandbox, allowlists y aprobación por herramienta.',
        capabilities: ['Ollama', 'LM Studio', 'tool policy', 'sandbox', 'OAuth'],
        example: 'Código y datos sensibles permanecen locales con Qwen 3.5 en Ollama.'
      }
    ]
  },
  hermes: {
    title: 'Hermes Agent',
    subtitle: 'Agente autónomo con memoria persistente',
    icon: '🧠',
    color: '#10b981',
    cases: [
      {
        title: '✅ Goals con Evidencia',
        description: 'Contratos de finalización y verificación real antes de declarar una tarea lista.',
        capabilities: ['/goal', 'completion contracts', 'pre_verify', 'evidence ledger'],
        example: 'Un cambio termina cuando build y tests pasan, no cuando el agente lo afirma.'
      },
      {
        title: '🎓 Aprendizaje Visible',
        description: 'Convierte procesos en skills y permite revisar la evolución de memoria.',
        capabilities: ['/learn', '/journey', 'memory graph', 'skill distillation'],
        example: 'Transformar un workflow de auditoría en una skill reutilizable y editable.'
      },
      {
        title: '🧠 Mixture of Agents',
        description: 'Presets seleccionables que contrastan varios modelos y agregan una respuesta.',
        capabilities: ['MoA presets', 'streaming synthesis', 'trace JSONL', 'model council'],
        example: 'WEICHAFE contrasta una decisión arquitectónica con varias perspectivas.'
      },
      {
        title: '⚡ Delegación en Background',
        description: 'Fan-out de subagentes sin bloquear el chat y retorno consolidado.',
        capabilities: ['delegate_task', 'background fan-out', 'status tracking', 'handoff'],
        example: 'Investigar fuentes independientes y consolidarlas en un único reporte.'
      },
      {
        title: '💻 Coding Cockpit',
        description: 'Proyectos, worktrees, revisión, terminales y diagnósticos LSP integrados.',
        capabilities: ['projects', 'git worktrees', 'PR diffs', 'multi-terminal', 'LSP'],
        example: 'PILLÁN trabaja en una rama aislada y WEICHAFE revisa el diff y la evidencia.'
      },
      {
        title: '🛡️ Gateway Resiliente',
        description: 'Backups, restore, scale-to-zero, drain seguro y límites de concurrencia.',
        capabilities: ['backup/import', 'safe drain', 'scale-to-zero', 'run caps'],
        example: 'Actualizar o reiniciar sin perder conversaciones que estén en curso.'
      }
    ]
  }
};

const AI_ENGINEER_CONCEPT = {
  title: 'AI Engineer',
  subtitle: 'El nuevo rol del futuro',
  icon: '🚀',
  color: '#f59e0b',
  description: 'Un AI Engineer diseña, implementa y optimiza sistemas que aprovechan agentes IA. No solo usa modelos — construye flujos de trabajo inteligentes que aprenden y se mejoran.',
  pillars: [
    {
      icon: '🔧',
      title: 'Tool Orchestration',
      description: 'Saber qué herramienta usar y cuándo. Encadenar funciones para完成任务.',
      tools: ['exec', 'http request', 'file ops', 'database', 'browser']
    },
    {
      icon: '🧩',
      title: 'Agent Architecture',
      description: 'Diseñar cómo agentes colaboran. Routing, delegation, fallback strategies.',
      platforms: ['OpenClaw', 'Hermes', 'CrewAI', 'AutoGen']
    },
    {
      icon: '📊',
      title: 'Context Engineering',
      description: 'Optimizar prompts, comprimir contexto, manage knowledge bases.',
      techniques: ['RAG', 'compression', 'memory design', 'prompt patterns']
    },
    {
      icon: '🔄',
      title: 'Workflow Automation',
      description: 'Crear pipelines reutilizables. Cron jobs, webhooks, event-driven.',
      patterns: ['cron scheduling', 'webhook handlers', 'event loops']
    },
    {
      icon: '📈',
      title: 'Evaluation & Iteration',
      description: 'Medir performance, identificar bottlenecks, mejorar continuamente.',
      metrics: ['latency', 'cost', 'accuracy', 'task completion']
    }
  ],
  roadmap: [
    { phase: 'Fase 1', title: 'Fundamentos', tasks: ['Master chat interfaces', 'Understand model capabilities', 'Learn tool usage'] },
    { phase: 'Fase 2', title: 'Automatización', tasks: ['Build cron jobs', 'Implement webhooks', 'Create pipelines'] },
    { phase: 'Fase 3', title: 'Memoria & Learning', tasks: ['Implement RAG', 'Design memory systems', 'Build agents'] },
    { phase: 'Fase 4', title: 'Optimización', tasks: ['Cost optimization', 'Performance tuning', 'Scale architectures'] }
  ]
};

const LONKO_SYSTEM = {
  mission: 'Aumentar tu capacidad profesional y personal sin aumentar tu carga, convirtiendo objetivos en entregables verificables.',
  agents: [
    { name: 'LONKO', role: 'Orquestación y prioridades', color: '#8b5cf6', outcomes: ['máximo 3 proyectos activos', 'tareas con evidencia', 'aprobaciones sensibles'] },
    { name: 'KIMÜN', role: 'Memoria y conocimiento', color: '#06b6d4', outcomes: ['mapa Obsidian/Neo4j', 'decisiones y contexto', 'resúmenes mínimos'] },
    { name: 'PILLÁN', role: 'Ingeniería, arquitectura e IA', color: '#3b82f6', outcomes: ['software probado', 'benchmarks locales', 'arquitectura reutilizable'] },
    { name: 'ANTÜ', role: 'Carrera, inglés y certificación', color: '#f59e0b', outcomes: ['skill map', 'portafolio con evidencia', 'práctica sostenible'] },
    { name: 'RUKA', role: 'Finanzas y patrimonio', color: '#22c55e', outcomes: ['escenarios, no certezas', 'control de caja', 'sin operaciones automáticas'] },
    { name: 'KÜME', role: 'Salud y energía', color: '#ec4899', outcomes: ['límite de carga', 'semáforo diario', 'recuperación protegida'] },
    { name: 'WERKÉN', role: 'Marca y comunicación', color: '#f97316', outcomes: ['borradores técnicos', 'narrativa profesional', 'publicación con aprobación'] },
    { name: 'WEICHAFE', role: 'Riesgo, calidad y auditoría', color: '#ef4444', outcomes: ['verificación final', 'privacidad', 'rollback y evidencia'] },
  ],
  opportunities: [
    { priority: 'P1', title: 'Estabilidad profesional', value: 'Registrar logros, decisiones y arquitectura para CV, entrevistas y liderazgo técnico.', deliverable: 'Bitácora semanal + evidencia profesional' },
    { priority: 'P2', title: 'AI Systems Engineering', value: 'Construir routing local/cloud, RAG, MCP, evaluación y observabilidad con Go/Python.', deliverable: 'Demo, benchmark o componente por ciclo' },
    { priority: 'P2', title: 'Inglés y Google Cloud', value: 'Prácticas breves sobre backend, cloud e IA conectadas con proyectos reales.', deliverable: 'Sesiones de 15–30 min + registro de brechas' },
    { priority: 'P3', title: 'Ingresos especializados', value: 'Consultoría en automatización, agentes, backend, procesos financieros y datos.', deliverable: 'Oferta acotada y caso de estudio anonimizado' },
    { priority: 'P3', title: 'Marca y activos propios', value: 'Convertir aprendizajes de IA local, Go, RAG y MCP en contenido y productos.', deliverable: 'Un repositorio, artículo o skill terminado' },
    { priority: 'P1', title: 'Sostenibilidad', value: 'Ajustar la carga a energía, familia y responsabilidades; evitar dispersión.', deliverable: '1 principal + 1 experimento + 1 contenido' },
  ],
  limits: ['2 agentes paralelos como máximo', '1 modelo pesado cargado', 'Qwen 3.5 4B · contexto OpenClaw 16K', 'local por defecto', 'Nivel 3 requiere aprobación', 'finanzas y publicaciones nunca automáticas'],
};

function CaseCard({ case: c, platformColor }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${platformColor}` }}>
      <h4 style={{ margin: '0 0 8px 0', color: platformColor }}>{c.title}</h4>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 12px 0' }}>{c.description}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {c.capabilities.map(cap => (
          <span key={cap} style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#cbd5e1'
          }}>{cap}</span>
        ))}
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#94a3b8',
        fontStyle: 'italic'
      }}>
        💡 {c.example}
      </div>
    </div>
  );
}

function PillarCard({ pillar }) {
  return (
    <div className="card" style={{ borderTop: '3px solid #f59e0b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '24px' }}>{pillar.icon}</span>
        <h4 style={{ margin: 0, color: '#f59e0b' }}>{pillar.title}</h4>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 12px 0' }}>{pillar.description}</p>
      <div style={{ fontSize: '12px', color: '#64748b' }}>
        <strong>Plataformas:</strong> {pillar.platforms?.join(', ')}
        <br />
        <strong>Técnicas:</strong> {pillar.techniques?.join(', ')}
        <br />
        <strong>Patrones:</strong> {pillar.patterns?.join(', ')}
        <br />
        <strong>Tools:</strong> {pillar.tools?.join(', ')}
      </div>
    </div>
  );
}

export default function Agents() {
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('agentTab');
    return ['openclaw', 'hermes', 'aiengineer', 'potential'].includes(requested) ? requested : 'openclaw';
  });
  const [hermesStatus, setHermesStatus] = useState(null);
  const [openclawStatus, setOpenclawStatus] = useState(null);
  const [runtimeAgents, setRuntimeAgents] = useState([]);
  const [runtimeSessions, setRuntimeSessions] = useState([]);
  const [dailyStatus, setDailyStatus] = useState(null);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const [oc, hm, agentData, sessionData, dailyData] = await Promise.all([
          fetchOpenClawStatus(),
          fetchHermesStatus().catch(() => null),
          fetch('/api/multiagent/agents', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ agents: [] })),
          fetch('/api/multiagent/sessions?limit=50', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ sessions: [] })),
          fetch('/api/lonko/daily', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        ]);
        setOpenclawStatus(oc);
        setHermesStatus(hm);
        setRuntimeAgents(agentData.agents || []);
        setRuntimeSessions(sessionData.sessions || []);
        setDailyStatus(dailyData);
      } catch (e) {
        console.error(e);
      }
    }
    fetchStatuses();
  }, []);

  const renderOpenClaw = () => (
    <div>
      <div className="agent-release-banner openclaw-release"><div><span>Disponible estable</span><strong>OpenClaw 2026.6.11</strong><p>Continuidad de memoria/QMD, Tool Search más fiable, browser optimizado y cron más robusto.</p></div><a href="https://docs.openclaw.ai/releases/2026.6.11" target="_blank" rel="noreferrer">Notas oficiales ↗</a></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {AGENT_USE_CASES.openclaw.cases.map((c, i) => (
          <CaseCard key={i} case={c} platformColor={AGENT_USE_CASES.openclaw.color} />
        ))}
      </div>
      {openclawStatus && (
        <div className="card" style={{ marginTop: '20px', background: 'rgba(99,102,241,0.1)' }}>
          <h4 style={{ color: '#6366f1', margin: '0 0 10px 0' }}>📡 Estado de OpenClaw</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '13px' }}>
            <div><strong>Gateway:</strong> {openclawStatus.running ? '🟢 Running' : '🔴 Stopped'}</div>
            <div><strong>Puerto:</strong> {openclawStatus.port || 18789}</div>
            <div><strong>Versión:</strong> {openclawStatus.version || 'N/A'}</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderHermes = () => (
    <div>
      <div className="agent-release-banner hermes-release"><div><span>Disponible estable</span><strong>Hermes Agent v0.18.2</strong><p>Goals verificables, /learn, /journey, memory graph, MoA, fan-out y coding projects.</p></div><a href="https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.7.2" target="_blank" rel="noreferrer">Notas oficiales ↗</a></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {AGENT_USE_CASES.hermes.cases.map((c, i) => (
          <CaseCard key={i} case={c} platformColor={AGENT_USE_CASES.hermes.color} />
        ))}
      </div>
      {hermesStatus && (
        <div className="card" style={{ marginTop: '20px', background: 'rgba(16,185,129,0.1)' }}>
          <h4 style={{ color: '#10b981', margin: '0 0 10px 0' }}>🧠 Estado de Hermes</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '13px' }}>
            <div><strong>Modelo:</strong> {hermesStatus.model || 'N/A'}</div>
            <div><strong>Provider:</strong> {hermesStatus.provider || 'N/A'}</div>
            <div><strong>Memoria:</strong> {hermesStatus.memoryEnabled ? '🟢 Activa' : '⚪ Inactiva'}</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderAIEngineer = () => (
    <div>
      <div className="card" style={{ borderTop: '4px solid #f59e0b', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <span style={{ fontSize: '48px' }}>{AI_ENGINEER_CONCEPT.icon}</span>
          <div>
            <h2 style={{ margin: 0, color: '#f59e0b' }}>{AI_ENGINEER_CONCEPT.title}</h2>
            <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>{AI_ENGINEER_CONCEPT.subtitle}</p>
          </div>
        </div>
        <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>{AI_ENGINEER_CONCEPT.description}</p>
      </div>

      <h3 style={{ color: '#f59e0b', marginBottom: '15px' }}>Los 5 Pilares del AI Engineer</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '30px' }}>
        {AI_ENGINEER_CONCEPT.pillars.map((p, i) => (
          <PillarCard key={i} pillar={p} />
        ))}
      </div>

      <h3 style={{ color: '#f59e0b', marginBottom: '15px' }}>🗺️ Roadmap de Aprendizaje</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {AI_ENGINEER_CONCEPT.roadmap.map((r, i) => (
          <div key={i} className="card" style={{ borderTop: `3px solid ${['#6366f1','#10b981','#f59e0b','#ec4899'][i]}` }}>
            <h4 style={{ color: ['#6366f1','#10b981','#f59e0b','#ec4899'][i], margin: '0 0 8px 0' }}>{r.phase}</h4>
            <p style={{ fontWeight: 'bold', color: '#e2e8f0', margin: '0 0 10px 0' }}>{r.title}</p>
            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#94a3b8' }}>
              {r.tasks.map((t, j) => <li key={j}>{t}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: '20px', background: 'rgba(245,158,11,0.1)' }}>
        <h4 style={{ color: '#f59e0b', margin: '0 0 15px 0' }}>📋 Resumen: Cómo cubre cada plataforma</h4>
        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8' }}>Pilar</th>
              <th style={{ textAlign: 'left', padding: '8px', color: '#6366f1' }}>OpenClaw</th>
              <th style={{ textAlign: 'left', padding: '8px', color: '#10b981' }}>Hermes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Tool Orchestration', '✅ exec, shell, files', '✅ full terminal, browser'],
              ['Agent Architecture', '✅ cron, subagents, routing', '✅ delegation, orchestration'],
              ['Context Engineering', '⚪ limited', '✅ compression, memory, RAG'],
              ['Workflow Automation', '✅ cron jobs, announce', '✅ skills, cron, webhooks'],
              ['Evaluation', '⚪ basic logging', '✅ state.db, analytics']
            ].map(([pillar, oc, hm], i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '8px', color: '#cbd5e1' }}>{pillar}</td>
                <td style={{ padding: '8px', color: '#94a3b8' }}>{oc}</td>
                <td style={{ padding: '8px', color: '#94a3b8' }}>{hm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPotential = () => (
    <div className="lonko-potential">
      <section className="card lonko-hero">
        <div><span className="metric-label">Sistema personal operativo</span><h2>LONKO · capacidad coordinada</h2><p>{LONKO_SYSTEM.mission}</p></div>
        <div><div className="lonko-live-summary"><span className={`status-badge status-${runtimeAgents.filter((agent) => LONKO_SYSTEM.agents.some((item) => item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === agent.id)).length === 8 ? 'ok' : 'warn'}`}>{runtimeAgents.filter((agent) => agent.id !== 'main').length}/8 CONFIGURADOS</span><strong>OpenClaw {openclawStatus?.running ? 'online' : 'offline'} · Ollama local</strong></div><div className="lonko-resource-summary">{LONKO_SYSTEM.limits.map((limit) => <span key={limit}>{limit}</span>)}</div></div>
      </section>
      <div className="potential-heading"><div><h3>Equipo especializado</h3><p>Cada agente tiene un dominio, un límite y resultados esperados.</p></div><span>8 roles · autonomía controlada</span></div>
      <div className="lonko-agent-grid">{LONKO_SYSTEM.agents.map((agent) => { const id = agent.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const live = runtimeAgents.find((item) => item.id === id); const sessions = runtimeSessions.filter((session) => session.agentId === id); return <article key={agent.name} className={`card lonko-agent ${live ? 'agent-configured' : ''}`} style={{ '--agent-color': agent.color }}><div className="lonko-agent-status"><strong>{agent.name}</strong><span className={`status-badge status-${live ? 'ok' : 'warn'}`}>{live ? 'CONFIGURADO' : 'PENDIENTE'}</span></div><h4>{agent.role}</h4><ul>{agent.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul><footer><span>{live?.model || 'Sin modelo'}</span><span>{sessions.length} sesiones</span></footer></article>; })}</div>
      <div className="lonko-runtime-note"><strong>Estado real</strong><span>Los perfiles existen en OpenClaw con workspace, memoria, sesiones y políticas independientes. La ejecución se realiza bajo demanda desde Multi-Agente; no son procesos permanentes.</span><button className="btn-primary" onClick={() => { window.location.hash = 'multiagent'; }}>Abrir consola Multi-Agente</button></div>
      <section className="card lonko-daily-status"><div><span className={`status-badge status-${dailyStatus?.installed && dailyStatus?.vault?.available && dailyStatus?.telegram?.configured ? 'ok' : 'warn'}`}>{dailyStatus?.installed ? 'AUTOMATIZACIÓN ACTIVA' : 'NO INSTALADA'}</span><h3>Ciclo diario semiautónomo</h3><p>Especialista rotativo → auditoría WEICHAFE → consolidación LONKO → Telegram.</p></div><div className="lonko-daily-metrics"><span><small>Horario</small>{dailyStatus?.schedule?.time || '20:00'} · Santiago</span><span><small>Obsidian</small>{dailyStatus?.vault?.latestDaily?.name || 'Sin reporte'}</span><span><small>Telegram</small>{dailyStatus?.telegram?.configured ? 'Resumen diario' : 'No configurado'}</span></div></section>
      <div className="potential-heading"><div><h3>Potencial aplicado a tus características</h3><p>Software + datos + procesos financieros + conocimiento empresarial + IA.</p></div><span>prioridad antes que volumen</span></div>
      <div className="potential-grid">{LONKO_SYSTEM.opportunities.map((item) => <article key={item.title} className="card potential-card"><div><span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span><h4>{item.title}</h4></div><p>{item.value}</p><small>Entregable</small><strong>{item.deliverable}</strong></article>)}</div>
      <section className="card operating-loop"><h3>Ciclo operativo seguro</h3><div><span><b>1</b> Observar</span><span><b>2</b> Priorizar</span><span><b>3</b> Delegar</span><span><b>4</b> Ejecutar</span><span><b>5</b> Verificar</span><span><b>6</b> Consolidar</span></div><p>Una tarea solo termina cuando existe archivo, prueba, commit, cálculo, reporte o checklist verificable.</p></section>
    </div>
  );

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>🤖 AI Agents & AI Engineer</h1>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
          Guía completa de OpenClaw, Hermes y el rol de AI Engineer
        </div>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'openclaw', label: '⚡ OpenClaw', color: '#6366f1' },
          { id: 'hermes', label: '🧠 Hermes', color: '#10b981' },
          { id: 'aiengineer', label: '🚀 AI Engineer', color: '#f59e0b' },
          { id: 'potential', label: '🧭 Mi potencial', color: '#8b5cf6' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid #334155',
              background: activeTab === tab.id ? `${tab.color}22` : 'transparent',
              color: activeTab === tab.id ? tab.color : '#94a3b8',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'openclaw' && renderOpenClaw()}
      {activeTab === 'hermes' && renderHermes()}
      {activeTab === 'aiengineer' && renderAIEngineer()}
      {activeTab === 'potential' && renderPotential()}
    </div>
  );
}
