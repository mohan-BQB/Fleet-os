import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listComplianceAlerts, listComplianceDocuments, listDrivers, listVehicles } from '../api/fleet';
import { getDashboardPnL } from '../api/economics';
import type { ComplianceDocument, DashboardPnL, Driver, Vehicle } from '../api/types';
import {
  AlertIcon, BellIcon, ClockIcon, GpsIcon, ManualIcon, ProfitIcon, TruckIcon, DriverIcon,
} from '../components/icons';

const RING_RADIUS = 59;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function daysFromToday(isoDate: string) {
  const ms = new Date(isoDate).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86_400_000);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface DashboardData {
  vehicles: Vehicle[];
  drivers: Driver[];
  alerts: ComplianceDocument[];
  documents: ComplianceDocument[];
  pnl: DashboardPnL;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listVehicles(),
      listDrivers(),
      listComplianceAlerts(),
      listComplianceDocuments(),
      getDashboardPnL(monthStartIso(), todayIso()),
    ])
      .then(([vehicles, drivers, alerts, documents, pnl]) => {
        if (!cancelled) setData({ vehicles, drivers, alerts, documents, pnl });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load dashboard data.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const activeVehicles = data.vehicles.filter((v) => v.status === 'active').length;
    const activeDrivers = data.drivers.filter((d) => d.status === 'active').length;
    const expiredCount = data.documents.filter((d) => d.is_expired).length;
    const dueCount = data.documents.filter((d) => d.is_due && !d.is_expired).length;
    const validCount = data.documents.length - expiredCount - dueCount;
    const healthPct = data.documents.length ? Math.round((validCount / data.documents.length) * 100) : 100;
    return { activeVehicles, activeDrivers, expiredCount, dueCount, validCount, healthPct };
  }, [data]);

  if (error) {
    return <div className="error-banner">{error}</div>;
  }
  if (!data || !stats) {
    return <div className="center-screen">Loading fleet data…</div>;
  }

  const netProfit = data.pnl.totals.net_profit;
  const ringOffset = RING_CIRCUMFERENCE * (1 - stats.healthPct / 100);
  const alerts = [...data.alerts].sort((a, b) => (a.valid_till ?? '').localeCompare(b.valid_till ?? ''));

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Fleet Dashboard</h1>
          <div className="sub">{user?.organization_name ?? 'Your fleet'}</div>
        </div>
        <div className="topbar-right">
          <span className="date-chip tnum">{DATE_FMT.format(new Date())}</span>
        </div>
      </header>

      <main className="content">
        <section className="stat-row" aria-label="Fleet summary">
          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Active vehicles</span>
              <span className="tile-icon i-accent"><TruckIcon /></span>
            </div>
            <div className="tile-value tnum">{stats.activeVehicles}</div>
            <div className="tile-foot">{data.vehicles.length} total</div>
          </div>

          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Active drivers</span>
              <span className="tile-icon i-accent"><DriverIcon /></span>
            </div>
            <div className="tile-value tnum">{stats.activeDrivers}</div>
            <div className="tile-foot">{data.drivers.length} total</div>
          </div>

          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Compliance alerts</span>
              <span className={`tile-icon ${stats.expiredCount ? 'i-crit' : 'i-warn'}`}>
                {stats.expiredCount ? <AlertIcon /> : <ClockIcon />}
              </span>
            </div>
            <div className="tile-value tnum" style={{ color: stats.expiredCount ? 'var(--critical)' : 'var(--warn)' }}>
              {stats.expiredCount + stats.dueCount}
            </div>
            <div className="tile-foot">{stats.expiredCount} expired &middot; {stats.dueCount} due soon</div>
          </div>

          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Net profit (MTD)</span>
              <span className={`tile-icon ${netProfit >= 0 ? 'i-good' : 'i-crit'}`}><ProfitIcon /></span>
            </div>
            <div className="tile-value tnum" style={{ color: netProfit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
              {CURRENCY.format(netProfit)}
            </div>
            <div className="tile-foot">{CURRENCY.format(data.pnl.totals.revenue)} revenue this month</div>
          </div>
        </section>

        <section className="split-row" aria-label="Compliance overview">
          <div className="health-card">
            <h3>Compliance health</h3>
            <div className="ring-wrap">
              <svg viewBox="0 0 132 132">
                <circle className="ring-track" cx="66" cy="66" r={RING_RADIUS} />
                <circle
                  className="ring-value"
                  cx="66" cy="66" r={RING_RADIUS}
                  stroke={stats.healthPct >= 70 ? 'var(--good)' : stats.healthPct >= 40 ? 'var(--warn)' : 'var(--critical)'}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="ring-center">
                <div className="ring-pct tnum">{stats.healthPct}%</div>
                <div className="ring-caption">in good standing</div>
              </div>
            </div>
            <div className="health-legend">
              <div className="health-legend-row"><span className="swatch" style={{ background: 'var(--good)' }} />Valid<span className="n tnum">{stats.validCount}</span></div>
              <div className="health-legend-row"><span className="swatch" style={{ background: 'var(--warn)' }} />Due soon<span className="n tnum">{stats.dueCount}</span></div>
              <div className="health-legend-row"><span className="swatch" style={{ background: 'var(--critical)' }} />Expired<span className="n tnum">{stats.expiredCount}</span></div>
            </div>
          </div>

          <div className="alerts-card">
            <div className="alerts-head">
              <h3>Needs attention</h3>
              {alerts.length > 0 && <span className="sub" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{alerts.length} document{alerts.length === 1 ? '' : 's'}</span>}
            </div>
            {alerts.length === 0 ? (
              <div className="empty-state"><BellIcon className="mono" /><div style={{ marginTop: 8 }}>Nothing needs attention right now.</div></div>
            ) : (
              alerts.map((doc) => {
                const days = doc.valid_till ? daysFromToday(doc.valid_till) : null;
                return (
                  <div className="alert-row" key={doc.id}>
                    <span className={`stripe ${doc.is_expired ? 'crit' : 'warn'}`} />
                    <div className="alert-main">
                      <div className="alert-doc">{humanize(doc.doc_type)}</div>
                      <div className="alert-holder">{doc.holder_display}</div>
                    </div>
                    <span className={`alert-status ${doc.is_expired ? 'crit' : 'warn'}`}>
                      {days === null ? '—' : days < 0 ? `Expired ${Math.abs(days)}d ago` : `Due in ${days}d`}
                    </span>
                    <span className="alert-date tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="table-card" aria-label="Vehicle fleet">
          <div className="table-head">
            <h3>Fleet ({data.vehicles.length})</h3>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>RC valid till</th>
                  <th>Current odometer</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="veh-cell">
                        <span className="veh-icon"><TruckIcon /></span>
                        <div>
                          <div className="reg-no">{v.registration_number}</div>
                          <div className="veh-cat">{humanize(v.category)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${v.status === 'active' ? 'on' : v.status === 'in_service' ? 'svc' : 'off'}`}>
                        {humanize(v.status)}
                      </span>
                    </td>
                    <td>
                      <span className="track-tag">
                        {v.tracking_mode === 'gps' ? <GpsIcon /> : <ManualIcon />}
                        {v.tracking_mode === 'gps' ? 'GPS' : 'Manual'}
                      </span>
                    </td>
                    <td className="tnum">{v.rc_valid_till ? DATE_FMT.format(new Date(v.rc_valid_till)) : '—'}</td>
                    <td className="tnum">{v.current_meter ? `${Number(v.current_meter).toLocaleString('en-IN')} ${v.metering_unit}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
