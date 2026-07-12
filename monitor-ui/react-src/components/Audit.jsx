import React, { useState, useEffect } from 'react';
import { fetchAudit } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAudit(0)
      .then(data => {
        if (data?.ok && Array.isArray(data.entries)) {
          setEntries(data.entries);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner message="Cargando auditoría..." />;
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Audit Log</h1>
      </header>

      {entries.length === 0 ? (
        <div className="card">
          <p className="empty-state">No hay entradas de auditoría</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Comando</th>
                <th>Criticidad</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 50).map((entry, i) => (
                <tr key={i}>
                  <td>{formatDate(entry.ts || entry.createdAt)}</td>
                  <td>{entry.type || entry.action || '-'}</td>
                  <td className="command-cell" title={entry.command}>
                    {entry.command?.slice(0, 60) || '-'}
                  </td>
                  <td>
                    <span className={`status-badge ${
                      entry.criticality === 'high' ? 'status-error' :
                      entry.criticality === 'medium' ? 'status-warn' : 'status-ok'
                    }`}>
                      {entry.criticality || 'low'}
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
