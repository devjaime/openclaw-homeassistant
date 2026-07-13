import React, { useState, useEffect } from 'react';
import { fetchModelsCapabilities, fetchModelsLocal } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function Models() {
  const [cloudModels, setCloudModels] = useState([]);
  const [localModels, setLocalModels] = useState([]);
  const [localStatus, setLocalStatus] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('modelTab') === 'local' ? 'local' : 'cloud');

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    if (activeTab !== 'local') return undefined;
    const timer = window.setInterval(async () => {
      const status = await fetchModelsLocal().catch(() => null);
      if (status?.ok) { setLocalModels(status.models || []); setLocalStatus(status); }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  const loadModels = async () => {
    setLoading(true);
    try {
      const [capRes, localRes] = await Promise.all([
        fetchModelsCapabilities().catch(() => ({ ok: false, models: [] })),
        fetchModelsLocal().catch(() => ({ ok: false, models: [] })),
      ]);
      if (capRes?.ok) {
        setCloudModels(capRes.models?.filter(m => m.isCloud) || []);
        setProviders(capRes.providers || []);
      }
      if (localRes?.ok) {
        setLocalModels(localRes.models || []);
        setLocalStatus(localRes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando modelos..." />;
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Modelos LLM</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={loadModels}>↻ Actualizar</button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'cloud' ? 'active' : ''}`} onClick={() => setActiveTab('cloud')}>
          Cloud ({cloudModels.length})
        </button>
        <button className={`tab ${activeTab === 'local' ? 'active' : ''}`} onClick={() => setActiveTab('local')}>
          Locales ({localModels.length})
        </button>
      </div>

      <div className="model-overview-grid">
        <div className="card"><span className="metric-label">Proveedores configurados</span><strong>{providers.length}</strong><p>{providers.join(' · ') || '—'}</p></div>
        <div className="card"><span className="metric-label">Modelos remotos</span><strong>{cloudModels.length}</strong><p>{cloudModels.filter((model) => model.active).length} activos</p></div>
        <div className="card"><span className="metric-label">Motor local</span><strong>{localStatus?.ollamaRunning ? 'ONLINE' : 'OFFLINE'}</strong><p>Ollama · {localStatus?.hardware?.cpuBrand || 'hardware local'}</p></div>
      </div>

      {activeTab === 'cloud' && (
        <div className="dashboard-grid">
          {cloudModels.length === 0 ? (
            <div className="card">
              <p className="empty-state">Sin modelos cloud configurados</p>
            </div>
          ) : cloudModels.map((model, i) => (
            <div key={`cloud-${i}`} className="card model-card">
              <div className="model-header">
                <h3>{model.name || model.id}</h3>
                <div className="model-header-badges">{model.active ? <span className="status-badge status-ok">ACTIVO</span> : null}{model.fallback ? <span className="status-badge status-warn">FALLBACK</span> : null}{model.badge && <span className="model-badge">{model.badge}</span>}</div>
              </div>
              <p className="model-provider">{model.provider} · {model.api || 'API remota'}</p>
              {model.description && (
                <p className="model-desc">{model.description}</p>
              )}
              {model.strengths?.length > 0 && (
                <div className="model-strengths">
                  <span className="strength-label">Fortalezas:</span>
                  <ul className="strength-list">
                    {model.strengths.slice(0, 3).map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {model.matchedSkills?.length > 0 && (
                <div className="model-skills">
                  <span className="skill-label">Skills:</span>
                  <div className="skill-tags">
                    {model.matchedSkills.slice(0, 4).map((s, idx) => (
                      <span key={idx} className="tag">{s.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="model-meta">
                {model.caps && <span className="meta-item">Caps: {model.caps.join(', ')}</span>}
                {model.contextWindow > 0 ? <span className="meta-item">Contexto: {model.contextWindow.toLocaleString()} tokens</span> : null}
                {model.maxTokens > 0 ? <span className="meta-item">Salida: {model.maxTokens.toLocaleString()}</span> : null}
                {model.reasoning ? <span className="meta-item">Razonamiento</span> : null}
                {model.input?.includes('image') ? <span className="meta-item">Visión</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'local' && (
        <div>
          <div className="local-runtime-grid">
            <div className={`card runtime-card ${localStatus?.ollamaRunning ? 'runtime-online' : ''}`}><div className="service-header"><h3>Ollama</h3><span className={`status-badge status-${localStatus?.ollamaRunning ? 'ok' : 'error'}`}>{localStatus?.ollamaRunning ? 'ONLINE' : 'OFFLINE'}</span></div><p>API · 127.0.0.1:11434</p><strong>{localStatus?.runningModels?.length || 0} cargados</strong></div>
            <div className={`card runtime-card ${localStatus?.lmStudio?.running ? 'runtime-online' : ''}`}><div className="service-header"><h3>LM Studio</h3><span className={`status-badge status-${localStatus?.lmStudio?.running ? 'ok' : 'warn'}`}>{localStatus?.lmStudio?.running ? 'ONLINE' : 'NO INSTALADO'}</span></div><p>API · 127.0.0.1:1234</p><strong>{localStatus?.lmStudio?.loadedCount || 0} cargados</strong></div>
            <div className="card runtime-card"><div className="service-header"><h3>Memoria unificada</h3><span className={`status-badge status-${localStatus?.systemMemory?.pressure === 'normal' ? 'ok' : 'warn'}`}>{localStatus?.systemMemory?.pressure || '—'}</span></div><p>{localStatus?.systemMemory?.availablePercent || 0}% disponible · swap {Math.round(localStatus?.systemMemory?.swapUsedMb || 0)} MB</p><strong>{localStatus?.systemMemory?.totalGb || 16} GB</strong></div>
          </div>
          <div className="card runtime-recommendation"><div><span className="metric-label">Runtime recomendado</span><h3>{localStatus?.runtimeRecommendation?.selected || 'Ollama'}</h3><p>{localStatus?.runtimeRecommendation?.reason}</p></div><div className="runtime-settings">{Object.entries(localStatus?.runtimeRecommendation?.settings || {}).map(([key, value]) => <span key={key}><small>{key}</small>{String(value)}</span>)}</div></div>
          <h3 className="local-section-title">Modelos recomendados para M4 · 16 GB</h3>
          <div className="local-recommendations">{(localStatus?.recommendations || []).map((recommendation) => <article key={recommendation.model} className="card recommendation-card"><div className="service-header"><h3>{recommendation.model}</h3><span className="model-badge">{recommendation.role}</span></div><p>{recommendation.fit} · {recommendation.quantization}</p><div className="recommendation-metrics"><span>{recommendation.downloadGb} GB archivo</span><span>~{recommendation.ramEstimateGb} GB RAM</span><span>{recommendation.practicalContext} contexto</span></div><div className="iman-chips">{recommendation.strengths.map((strength) => <span key={strength}>{strength}</span>)}</div><code>{recommendation.command}</code><code>{recommendation.runCommand}</code></article>)}</div>
          <div className="local-advisory-grid"><div className="card avoid-models"><h3>No recomendados para 16 GB</h3>{(localStatus?.avoidModels || []).map((item) => <div key={item.model}><strong>{item.model}</strong><span>{item.reason}</span></div>)}</div><div className="card local-sources"><h3>Fuentes de la evaluación</h3>{(localStatus?.researchSources || []).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}<p>Recomendación ajustada con métricas locales de memoria y swap.</p></div></div>
          {localStatus?.diagnostic ? <div className="model-diagnostic"><strong>{localStatus.ollamaRunning ? 'Ollama' : 'Motor local no disponible'}</strong><span>{localStatus.diagnostic}</span>{localStatus.storage?.external ? <code>{localStatus.storage.target}</code> : null}</div> : null}
          <h3 className="local-section-title">Modelos instalados</h3>
          <div className="dashboard-grid">
          {localModels.length === 0 ? (
            <div className="card">
              <p className="empty-state">No hay modelos locales disponibles</p>
            </div>
          ) : localModels.map((model, i) => (
            <div key={`local-${i}`} className="card model-card">
              <div className="model-header">
                <h3>{model.name || model.id}</h3>
                {model.badge && <span className="model-badge">{model.badge}</span>}
              </div>
              <div className="model-info">
                {model.parameterSize && (
                  <span className="info-item">Params: {model.parameterSize}</span>
                )}
                {model.quantization && (
                  <span className="info-item">Q: {model.quantization}</span>
                )}
                {model.sizeGb && (
                  <span className="info-item">Size: {model.sizeGb} GB</span>
                )}
              </div>
              {model.description && (
                <p className="model-desc">{model.description}</p>
              )}
              {model.caps && (
                <div className="model-caps">
                  <span className="caps-label">Capabilities:</span>
                  <div className="skill-tags">
                    {model.caps.map((c, idx) => (
                      <span key={idx} className="tag">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
