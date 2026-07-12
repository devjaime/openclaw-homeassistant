import React, { useState, useEffect } from 'react';
import { fetchCrons } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

function formatNextRun(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const now = new Date();
  const diff = d - now;
  if (diff < 0) return 'Ya pasó';
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (h > 24) return `En ${Math.floor(h / 24)}d`;
  if (h > 0) return `En ${h}h ${m % 60}m`;
  return `En ${m}m`;
}

export default function Crons() {
  const [crons, setCrons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCrons()
      .then(data => {
        if (data?.ok && Array.isArray(data.jobs)) {
          setCrons(data.jobs);
        } else {
          setError(data?.error || 'Error cargando cronjobs');
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner message="Cargando cronjobs..." />;
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Cronjobs</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={() => window.location.reload()}>↻ Actualizar</button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: 'var(--color-warning)' }}>
          <h3 style={{ color: 'var(--color-warning)' }}>⚠️ Error del Config</h3>
          <p className="empty-state">{error}</p>
          <p className="form-help" style={{ marginTop: 8 }}>
            Ejecuta <code>openclaw doctor --fix</code> para reparar el config de OpenClaw.
          </p>
        </div>
      )}

      {crons.length === 0 && !error ? (
        <div className="card">
          <p className="empty-state">No hay cronjobs configurados</p>
        </div>
      ) : crons.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Schedule</th>
                <th>Próxima ejecución</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {crons.map((job, i) => (
                <tr key={i}>
                  <td>{job.name || job.id || '-'}</td>
                  <td><code>{job.schedule?.expr || '-'}</code></td>
                  <td>{formatNextRun(job.nextRunAt)}</td>
                  <td>
                    <span className={`status-badge ${job.enabled !== false ? 'status-ok' : 'status-error'}`}>
                      {job.enabled !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}