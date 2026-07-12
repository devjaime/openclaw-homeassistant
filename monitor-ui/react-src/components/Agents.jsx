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
        title: '📱 Bots de Mensajería',
        description: 'Telegram, Discord, WhatsApp con cron jobs integrados',
        capabilities: ['cron jobs', 'announce delivery', 'channel auth'],
        example: 'Bot de reportes matutinos que envía clima, bolsa y noticias a las 6AM'
      },
      {
        title: '🔄 Automatizaciones Programadas',
        description: 'Tareas recurrentes con sesión aislada',
        capabilities: ['sessionTarget: isolated', 'wakeMode: now', 'error handling'],
        example: 'Radar SEO que analiza oportunidades de contenido cada día'
      },
      {
        title: '🔧 Execuciones de Herramientas',
        description: 'Ejecuta scripts, comandos shell, manipula archivos',
        capabilities: ['exec tool', 'shell commands', 'file operations'],
        example: 'Actualiza blog, hace git commit/push, procesa datos'
      },
      {
        title: '📊 Monitor & DevOps',
        description: 'Monitoreo de servicios, alertas, logs',
        capabilities: ['docker status', 'health checks', 'log analysis'],
        example: 'Dashboard de estado de servicios con Neo4j Memory'
      },
      {
        title: '🎯 Agents Especializados',
        description: 'Sub-agents para tareas específicas con fallback',
        capabilities: ['multi-agent', 'delegation', 'fallback models'],
        example: 'Agente de coding que usa deepseek-coder con fallback a cloud'
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
        title: '🧠 Memoria Persistente',
        description: 'Aprende de interacciones pasadas, recuerda contexto',
        capabilities: ['memory engine', 'user profiling', 'context compression'],
        example: 'Recuerdan preferencias del usuario across sesiones'
      },
      {
        title: '🎓 Skills & Aprendizaje',
        description: 'Skills descargables, aprendizaje de procesos',
        capabilities: ['skills hub', 'skill creation', 'process learning'],
        example: 'Skill que aprende a hacer research técnico en 3 pasos'
      },
      {
        title: '🌐 Web Research',
        description: 'Búsqueda web, extracción de contenido, análisis',
        capabilities: ['Exa search', 'web extraction', 'content analysis'],
        example: 'Investigar últimas tendencias en AI agents para blog'
      },
      {
        title: '🖥️ Browser Automation',
        description: 'Navegación automática, formularios, scraping',
        capabilities: ['agent-browser', 'Browserbase', 'stealth mode'],
        example: 'Automatizar tareas repetitivas en la web'
      },
      {
        title: '📚 Investigación Técnica',
        description: 'Deep dive en documentación, código, specs',
        capabilities: ['context understanding', 'code analysis', 'docs parsing'],
        example: 'Analizar documentación de API y generar ejemplos'
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
  const [activeTab, setActiveTab] = useState('openclaw');
  const [hermesStatus, setHermesStatus] = useState(null);
  const [openclawStatus, setOpenclawStatus] = useState(null);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const [oc, hm] = await Promise.all([
          fetchOpenClawStatus(),
          fetchHermesStatus().catch(() => null)
        ]);
        setOpenclawStatus(oc);
        setHermesStatus(hm);
      } catch (e) {
        console.error(e);
      }
    }
    fetchStatuses();
  }, []);

  const renderOpenClaw = () => (
    <div>
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
          { id: 'aiengineer', label: '🚀 AI Engineer', color: '#f59e0b' }
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
    </div>
  );
}