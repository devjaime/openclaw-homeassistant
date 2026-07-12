import React, { useState, useEffect } from 'react';
import { fetchModelsCapabilities, fetchModelsLocal } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function Models() {
  const [cloudModels, setCloudModels] = useState([]);
  const [localModels, setLocalModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cloud');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setLoading(true);
    try {
      const [capRes, localRes] = await Promise.all([
        fetchModelsCapabilities().catch(() => ({ ok: false, models: [] })),
        fetchModelsLocal().catch(() => ({ ok: false, models: [] })),
      ]);
      if (capRes?.ok) {
        setCloudModels(capRes.models?.filter(m => !m.isCloud) || []);
      }
      if (localRes?.ok) {
        setLocalModels(localRes.models || []);
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
                {model.badge && <span className="model-badge">{model.badge}</span>}
              </div>
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
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'local' && (
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
      )}
    </div>
  );
}