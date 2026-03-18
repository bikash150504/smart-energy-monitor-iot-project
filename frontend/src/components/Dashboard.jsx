// src/components/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useAuth } from '../App';

const API = import.meta.env.VITE_API_URL;

// ─── Stat Card ────────────────────────────────────────────
function StatCard({ label, value, unit, icon, alert, trend }) {
  return (
    <div className={`stat-card ${alert ? 'stat-card--alert' : ''}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__value">
          {value ?? '—'}
          <span className="stat-card__unit"> {unit}</span>
        </span>
        {trend && <span className={`stat-card__trend ${trend > 0 ? 'up' : 'down'}`}>
          {trend > 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
        </span>}
      </div>
      {alert && <div className="stat-card__alert-badge">ALERT</div>}
    </div>
  );
}

// ─── Alert Item ───────────────────────────────────────────
function AlertItem({ alert }) {
  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    return m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`;
  };
  return (
    <div className="alert-item">
      <div className="alert-item__dot" />
      <div className="alert-item__content">
        <span className="alert-item__type">{alert.type}</span>
        <span className="alert-item__msg">{alert.message}</span>
      </div>
      <span className="alert-item__time">{timeAgo(alert.timestamp)}</span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────
export default function Dashboard() {
  const { user, logout, token, apiFetch } = useAuth();
  const [live, setLive]         = useState(null);
  const [history, setHistory]   = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [connected, setConnected] = useState(false);
  const [chartMode, setChartMode] = useState('power'); // 'power' | 'voltage' | 'temp'
  const [sendingCmd, setSendingCmd] = useState(false);

  // ── Fetch history on mount ────────────────────────────
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch(`${API}/api/energy/history?limit=80`);
        const data = await res.json();
        // Format timestamps for chart display
        setHistory(data.map(d => ({
          ...d,
          time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })));
      } catch (err) {
        console.error('History fetch error:', err);
      }
    };
    fetchHistory();
  }, []);

  // ── WebSocket connection ──────────────────────────────
  useEffect(() => {
    const socket = io(API, { auth: { token } });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('energy:live', (data) => {
      setLive(data);
      setHistory(prev => {
        const point = {
          ...data,
          time: new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const updated = [...prev, point];
        return updated.slice(-120); // Keep last 120 readings (~10 min)
      });
    });

    socket.on('energy:alert', (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    });

    return () => socket.disconnect();
  }, [token]);

  // ── Remote command ────────────────────────────────────
  const sendCommand = async (action) => {
    setSendingCmd(true);
    try {
      await apiFetch(`${API}/api/device/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } finally {
      setSendingCmd(false);
    }
  };

  const hasAnyAlert = live && (live.voltageAlert || live.currentAlert || live.powerAlert || live.tempAlert);

  // ── Chart data key map ────────────────────────────────
  const chartConfig = {
    power:   { key: 'power',   color: '#f59e0b', label: 'Power (W)',   unit: 'W' },
    voltage: { key: 'voltage', color: '#3b82f6', label: 'Voltage (V)', unit: 'V' },
    temp:    { key: 'temperature', color: '#10b981', label: 'Temp (°C)', unit: '°C' },
  };
  const cc = chartConfig[chartMode];

  return (
    <div className="dashboard">
      {/* ── Navbar ──────────────────────────────────── */}
      <header className="navbar">
        <div className="navbar__brand">
          <span className="navbar__icon">⚡</span>
          Smart Energy Monitor
        </div>
        <div className="navbar__right">
          <span className={`status-dot ${connected ? 'status-dot--live' : ''}`} />
          <span className="navbar__status">{connected ? 'LIVE' : 'OFFLINE'}</span>
          {hasAnyAlert && <span className="navbar__alert-badge">! {Object.values({
            v: live.voltageAlert, i: live.currentAlert, p: live.powerAlert, t: live.tempAlert
          }).filter(Boolean).length} ALERT{Object.values({v:live.voltageAlert,i:live.currentAlert,p:live.powerAlert,t:live.tempAlert}).filter(Boolean).length>1?'S':''}</span>}
          <span className="navbar__user">{user?.name}</span>
          <button className="btn btn--ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard__main">
        {/* ── Stat Cards ─────────────────────────────── */}
        <section className="stats-grid">
          <StatCard label="Voltage"      value={live?.voltage?.toFixed(1)}  unit="V"    icon="🔌" alert={live?.voltageAlert} />
          <StatCard label="Current"      value={live?.current?.toFixed(2)}  unit="A"    icon="⚡" alert={live?.currentAlert} />
          <StatCard label="Active Power" value={live?.power?.toFixed(1)}    unit="W"    icon="💡" alert={live?.powerAlert} />
          <StatCard label="Energy Used"  value={live?.energy?.toFixed(3)}   unit="kWh"  icon="📊" />
          <StatCard label="Frequency"    value={live?.frequency?.toFixed(1)} unit="Hz"  icon="〰️" />
          <StatCard label="Power Factor" value={live?.powerFactor?.toFixed(2)} unit=""  icon="📈" />
          <StatCard label="Temperature"  value={live?.temperature?.toFixed(1)} unit="°C" icon="🌡️" alert={live?.tempAlert} />
          <StatCard label="Humidity"     value={live?.humidity?.toFixed(1)}  unit="%"   icon="💧" />
        </section>

        <div className="dashboard__row">
          {/* ── Chart ────────────────────────────────── */}
          <section className="chart-card">
            <div className="chart-card__header">
              <h2 className="chart-card__title">Real-time Monitoring</h2>
              <div className="chart-tabs">
                {Object.entries(chartConfig).map(([key, cfg]) => (
                  <button
                    key={key}
                    className={`chart-tab ${chartMode === key ? 'chart-tab--active' : ''}`}
                    onClick={() => setChartMode(key)}
                  >{cfg.label}</button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cc.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={cc.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#8b8fa8' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#8b8fa8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: cc.color }}
                  formatter={(v) => [`${v?.toFixed(2)} ${cc.unit}`, cc.label]}
                />
                <Area type="monotone" dataKey={cc.key} stroke={cc.color} strokeWidth={2} fill="url(#colorGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          {/* ── Right Column ────────────────────────── */}
          <div className="dashboard__right-col">
            {/* Alert Panel */}
            <section className="alert-panel">
              <h2 className="panel-title">
                Alert Log
                {alerts.length > 0 && <span className="panel-badge">{alerts.length}</span>}
              </h2>
              <div className="alert-list">
                {alerts.length === 0
                  ? <p className="empty-msg">No alerts — system running normally ✓</p>
                  : alerts.slice(0, 8).map((a) => <AlertItem key={a.id} alert={a} />)
                }
              </div>
            </section>

            {/* Device Controls */}
            <section className="control-panel">
              <h2 className="panel-title">Device Controls</h2>
              <div className="control-panel__device-info">
                <div className="device-row">
                  <span>Device ID</span>
                  <span className="mono">ESP32_001</span>
                </div>
                <div className="device-row">
                  <span>Status</span>
                  <span className={connected ? 'text-green' : 'text-red'}>
                    {connected ? '● Online' : '● Offline'}
                  </span>
                </div>
                <div className="device-row">
                  <span>Last seen</span>
                  <span>{live?.timestamp ? new Date(live.timestamp).toLocaleTimeString() : '—'}</span>
                </div>
              </div>
              <div className="control-panel__buttons">
                <button
                  className="btn btn--danger"
                  onClick={() => sendCommand('reset_energy')}
                  disabled={sendingCmd || !connected}
                >
                  Reset kWh Counter
                </button>
                <button
                  className="btn btn--secondary"
                  onClick={() => sendCommand('reboot')}
                  disabled={sendingCmd || !connected}
                >
                  Reboot Device
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* ── Power Comparison Chart ─────────────────── */}
        <section className="chart-card">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Voltage vs Current Overlay</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history.slice(-60)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#8b8fa8' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="v" orientation="left"  tick={{ fontSize: 11, fill: '#3b82f6' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="i" orientation="right" tick={{ fontSize: 11, fill: '#f59e0b' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1d2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8b8fa8' }} />
              <Line yAxisId="v" type="monotone" dataKey="voltage" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Voltage (V)" />
              <Line yAxisId="i" type="monotone" dataKey="current" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="Current (A)" />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </main>

      <footer className="dashboard__footer">
        Smart Energy Monitor · ESP32 → MQTT → Firebase · Built with React + Node.js
      </footer>
    </div>
  );
}
