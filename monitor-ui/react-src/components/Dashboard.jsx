import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { fetchStatus, fetchUserspace, fetchOpenClawStatus, fetchHermesStatus } from '../services/api.js';
import LoadingSpinner from './LoadingSpinner.jsx';

Chart.register(...registerables);

const STATUS_CACHE_TTL_MS = 10000;
const RESOURCE_HISTORY_MAX = 60;

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function ResourceChart({ label, currentValue, unit, color }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    historyRef.current.push({ value: currentValue, time: Date.now() });
    if (historyRef.current.length > RESOURCE_HISTORY_MAX) {
      historyRef.current.shift();
    }
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    const labels = historyRef.current.map((_, i) => i);
    const data = historyRef.current.map(h => h.value);

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: color + '20',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: { display: false },
          y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#71717a', font: { size: 10 } } }
        },
        plugins: { legend: { display: false } }
      }
    });

    return () => chartRef.current?.destroy();
  }, [currentValue, color]);

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <span className="chart-label">{label}</span>
        <span className="chart-value" style={{ color }}>{currentValue.toFixed(1)}{unit}</span>
      </div>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [statusData, setStatusData] = useState(null);
  const [userspaceData, setUserspaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [openclawStatus, setOpenclawStatus] = useState(null);
  const [hermesStatus, setHermesStatus] = useState(null);

  const loadData = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const [status, userspace, oc, hm] = await Promise.all([
        fetchStatus(force).catch(() => null),
        fetchUserspace().catch(() => null),
        fetchOpenClawStatus().catch(() => null),
        fetchHermesStatus().catch(() => null),
      ]);

      if (status) {
        setStatusData(status);
        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
      }
      if (userspace) {
        setUserspaceData(userspace);
      }
      if (oc) setOpenclawStatus(oc);
      if (hm) setHermesStatus(hm);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => loadData(false), STATUS_CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading && !statusData) {
    return <LoadingSpinner message="Cargando dashboard..." />;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🤖 Agent Hub</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={() => loadData(true)}>
            ↻ Actualizar
          </button>
          <span className="last-update">
            {lastUpdate ? `Actualizado: ${lastUpdate}` : ''}
          </span>
        </div>
      </header>

      <div className="dashboard-grid agents-overview">
        <AgentCard
          name="⚡ OpenClaw"
          status={openclawStatus?.running ? 'running' : 'stopped'}
          icon="⚡"
          color="#6366f1"
          details={[
            { label: 'Gateway', value: openclawStatus?.port ? `127.0.0.1:${openclawStatus.port}` : 'N/A' },
            { label: 'Versión', value: openclawStatus?.version || 'N/A' },
            { label: 'Servicios', value: statusData?.services ? Object.keys(statusData.services).length : 'N/A' }
          ]}
        />
        <AgentCard
          name="🧠 Hermes"
          status={hermesStatus ? 'running' : 'stopped'}
          icon="🧠"
          color="#10b981"
          details={[
            { label: 'Modelo', value: hermesStatus?.model || 'N/A' },
            { label: 'Provider', value: hermesStatus?.provider || 'N/A' },
            { label: 'Memoria', value: hermesStatus?.memoryEnabled ? 'Activa' : 'Inactiva' }
          ]}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="dashboard-grid">
        <SummaryCard data={statusData} />
        <StatusCard data={statusData} />
        <UptimeCard data={statusData} />
        <ModelCard data={statusData} />
        <ConnectionsCard data={statusData} />
      </div>

      <div className="dashboard-grid charts-row">
        <ResourcesCard data={statusData} />
        <DiskCard data={userspaceData} />
        <ProcessCard data={userspaceData} />
      </div>
    </div>
  );
}

function AgentCard({ name, status, icon, color, details }) {
  const isRunning = status === 'running';
  return (
    <div className="card agent-card" style={{ borderTop: `4px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontSize: '32px' }}>{icon}</span>
        <div>
          <h3 style={{ margin: 0, color }}>{name}</h3>
          <span style={{
            fontSize: '12px',
            color: isRunning ? '#22c55e' : '#ef4444',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isRunning ? '#22c55e' : '#ef4444',
              display: 'inline-block'
            }} />
            {isRunning ? 'Activo' : 'Detenido'}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '13px' }}>
        {details.map((d, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px' }}>
            <div style={{ color: '#64748b', fontSize: '11px' }}>{d.label}</div>
            <div style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{d.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ data }) {
  const services = data?.services || {};
  const resources = data?.resources || {};
  const usage = data?.usage || {};
  const openclaw = data?.openclaw || {};

  const openclawRunning = services.openclaw?.running || false;
  const haRunning = services.homeassistant?.running || false;
  const n8nRunning = services.n8n?.running || false;
  const telegramRunning = services.telegram?.running || false;

  const connections = [openclawRunning, haRunning, n8nRunning, telegramRunning].filter(Boolean).length;
  const listeners = connections;
  const errors = resources.errorCountRecent || 0;
  const usageTotal = usage.totalUSD || 0;

  return (
    <div className="card summary-card">
      <h3>Resumen</h3>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-value">{connections}</span>
          <span className="metric-label">Conexiones</span>
        </div>
        <div className="metric">
          <span className="metric-value">{listeners}</span>
          <span className="metric-label">Listeners</span>
        </div>
        <div className="metric">
          <span className="metric-value">{errors}</span>
          <span className="metric-label">Errores</span>
        </div>
        <div className="metric">
          <span className="metric-value">
            {usageTotal > 0 ? `$${usageTotal.toFixed(2)}` : '-'}
          </span>
          <span className="metric-label">Uso USD</span>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ data }) {
  const openclaw = data?.openclaw || {};
  const status = openclaw.listening ? 'ok' : 'error';
  return (
    <div className="card status-card">
      <h3>Estado OpenClaw</h3>
      <div className={`status-badge status-${status}`}>
        {status === 'ok' ? 'ONLINE' : 'OFFLINE'}
      </div>
      <p className="model-name">Puerto: {openclaw.port || '-'}</p>
      {openclaw.gatewayUrl && (
        <p className="model-provider">Gateway: {openclaw.gatewayUrl}</p>
      )}
    </div>
  );
}

function UptimeCard({ data }) {
  const uptime = data?.uptimeSeconds || 0;
  return (
    <div className="card">
      <h3>Uptime</h3>
      <div className="metric">
        <span className="metric-value">{formatUptime(uptime)}</span>
        <span className="metric-label">Tiempo activo</span>
      </div>
      {data?.nowIso && (
        <p className="model-provider" style={{ marginTop: 8 }}>
          {new Date(data.nowIso).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ModelCard({ data }) {
  const openclaw = data?.openclaw || {};
  const modelPrimary = openclaw.modelPrimary || 'No configurado';
  const availableModels = openclaw.availableModels || [];
  const cloudCount = availableModels.filter(m => m.tier === 'cloud').length;
  return (
    <div className="card">
      <h3>Modelo Activo</h3>
      <div className={`status-badge status-ok`}>
        ACTIVO
      </div>
      <p className="model-name">{modelPrimary}</p>
      <p className="model-provider">{cloudCount} modelos cloud disponibles</p>
    </div>
  );
}

function ResourcesCard({ data }) {
  const resources = data?.resources || {};
  const cpu = resources.cpuPercent ?? 0;
  const mem = resources.memoryPercent ?? 0;

  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <h3>Recursos en Tiempo Real</h3>
      <div className="charts-grid">
        <ResourceChart label="CPU" currentValue={cpu} unit="%" color="#3b82f6" />
        <ResourceChart label="Memoria" currentValue={mem} unit="%" color="#22c55e" />
      </div>
    </div>
  );
}

function DiskCard({ data }) {
  if (!data?.ok || !data?.disk?.disks?.length) {
    return (
      <div className="card">
        <h3>Disco</h3>
        <p className="empty-state">Sin datos</p>
      </div>
    );
  }

  const disks = data.disk.disks.slice(0, 4);

  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <h3>Uso de Disco</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mount</th>
              <th>Total</th>
              <th>Usado</th>
              <th>Disp</th>
              <th>Uso</th>
            </tr>
          </thead>
          <tbody>
            {disks.map((disk, i) => (
              <tr key={i}>
                <td>{disk.mount}</td>
                <td>{disk.totalGb?.toFixed(1)}GB</td>
                <td>{disk.usedGb?.toFixed(1)}GB</td>
                <td>{disk.availGb?.toFixed(1)}GB</td>
                <td className={disk.usePct > 90 ? 'text-danger' : disk.usePct > 70 ? 'text-warn' : ''}>
                  {disk.usePct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcessCard({ data }) {
  if (!data?.ok || !data?.processes?.processes?.length) {
    return (
      <div className="card" style={{ gridColumn: 'span 2' }}>
        <h3>Procesos</h3>
        <p className="empty-state">Sin datos</p>
      </div>
    );
  }

  const processes = data.processes.processes.slice(0, 6);

  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <h3>Top Procesos</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>PID</th>
              <th>CPU%</th>
              <th>MEM%</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((proc) => (
              <tr key={proc.pid}>
                <td>{proc.user}</td>
                <td>{proc.pid}</td>
                <td className={proc.cpuPct > 80 ? 'text-danger' : proc.cpuPct > 50 ? 'text-warn' : ''}>
                  {proc.cpuPct?.toFixed(1)}
                </td>
                <td className={proc.memPct > 80 ? 'text-danger' : proc.memPct > 50 ? 'text-warn' : ''}>
                  {proc.memPct?.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConnectionsCard({ data }) {
  const connections = data?.connections || [];

  return (
    <div className="card">
      <h3>Conexiones</h3>
      {connections.length === 0 ? (
        <p className="empty-state">Sin conexiones activas</p>
      ) : (
        <ul className="connections-list">
          {connections.slice(0, 5).map((conn, i) => (
            <li key={i} className="connection-item">
              <span className="conn-name">{conn.name || conn.endpoint || 'Unknown'}</span>
              <span className={`conn-status ${conn.active ? 'active' : ''}`}>
                {conn.active ? 'Activo' : 'Inactivo'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}