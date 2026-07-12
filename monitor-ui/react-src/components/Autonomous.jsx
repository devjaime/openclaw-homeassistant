import React, { useState, useEffect } from 'react';
import { fetchAutoSessions } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

export default function Autonomous() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAutoSessions()
      .then(data => {
        if (data?.ok && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        } else if (Array.isArray(data)) {
          setSessions(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner message="Cargando agente autónomo..." />;
  }

  return (
    <div className="section">
      <header className="dashboard-header">
        <h1>Agente Autónomo</h1>
      </header>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Estado</h3>
          <div className={`status-badge ${sessions.some(s => s.status === 'running') ? 'status-ok' : 'status-warn'}`}>
            {sessions.some(s => s.status === 'running') ? 'EJECUTANDO' : 'ESPERANDO'}
          </div>
          <p style={{ marginTop: 12 }}>
            {sessions.filter(s => s.status === 'running').length} de {sessions.length} loops activos
          </p>
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Sessions</h3>
          {sessions.length === 0 ? (
            <p className="empty-state">No hay sesiones activas</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Goal</th>
                  <th>Modelo</th>
                  <th>Iteraciones</th>
                  <th>Estado</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, i) => (
                  <tr key={i}>
                    <td><code>{session.id?.slice(0, 8) || '-'}</code></td>
                    <td className="command-cell" title={session.goal}>{session.goal?.slice(0, 40) || '-'}</td>
                    <td>{session.model || '-'}</td>
                    <td>{session.iteration || 0} / {session.maxIterations || '-'}</td>
                    <td>
                      <span className={`status-badge ${
                        session.status === 'running' ? 'status-ok' :
                        session.status === 'completed' ? 'status-ok' : 'status-warn'
                      }`}>
                        {session.status || 'idle'}
                      </span>
                    </td>
                    <td>{formatDate(session.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
