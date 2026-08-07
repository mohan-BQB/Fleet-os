import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listComplianceAlerts, listComplianceDocuments, listDrivers, listVehicles } from '../api/fleet';
import { getDashboardPnL, listExpenses } from '../api/economics';
import { listFuelLogs, listTripSheets } from '../api/operations';
import { listVendors } from '../api/vendors';
import {
  type ComplianceDocument, type DashboardPnL, type Driver, type Expense,
  type FuelLog, type TripSheet, type Vehicle, type Vendor,
} from '../api/types';
import {
  AlertIcon, ApprovalIcon, BellIcon, ClockIcon, GpsIcon, ManualIcon, ProfitIcon, TruckIcon, DriverIcon, WalletIcon,
} from '../components/icons';
import Timeline from '../components/Timeline';
import VehicleDetailModal from '../components/VehicleDetailModal';
import DriverDetailModal from '../components/DriverDetailModal';
import VendorDetailModal from '../components/VendorDetailModal';
import {
  daysAgoIso, daysFromToday, inTimelineDueWindow, monthStartIso, timelineSpendRange, todayIso,
  type DateRange, type TimelinePeriod,
} from '../lib/periods';

const TILE_BTN_STYLE: CSSProperties = {
  cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%',
};

const RING_RADIUS = 59;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function defaultCustomRange(): DateRange {
  return { start: daysAgoIso(29), end: todayIso() };
}

interface DashboardData {
  vehicles: Vehicle[];
  drivers: Driver[];
  alerts: ComplianceDocument[];
  documents: ComplianceDocument[];
  pnl: DashboardPnL;
  expenses: Expense[];
  fuelLogs: FuelLog[];
  tripSheets: TripSheet[];
  vendors: Vendor[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const alertsRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expensePeriod, setExpensePeriod] = useState<TimelinePeriod>('month30');
  const [expenseCustomRange, setExpenseCustomRange] = useState<DateRange>(defaultCustomRange);
  const [compliancePeriod, setCompliancePeriod] = useState<TimelinePeriod>('month30');
  const [complianceCustomRange, setComplianceCustomRange] = useState<DateRange>(defaultCustomRange);
  const [expensePnl, setExpensePnl] = useState<DashboardPnL | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [detailDriver, setDetailDriver] = useState<Driver | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'info' | 'compliance' | 'licence'>('info');
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);
  const pendingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listVehicles(),
      listDrivers(),
      listComplianceAlerts(),
      listComplianceDocuments(),
      getDashboardPnL(monthStartIso(), todayIso()),
      listExpenses(),
      listFuelLogs(),
      listTripSheets(),
      listVendors(),
    ])
      .then(([vehicles, drivers, alerts, documents, pnl, expenses, fuelLogs, tripSheets, vendors]) => {
        if (!cancelled) setData({ vehicles, drivers, alerts, documents, pnl, expenses, fuelLogs, tripSheets, vendors });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load dashboard data.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = timelineSpendRange(expensePeriod, expenseCustomRange);
    getDashboardPnL(start, end)
      .then((result) => {
        if (!cancelled) setExpensePnl(result);
      })
      .catch(() => {
        if (!cancelled) setExpensePnl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [expensePeriod, expenseCustomRange]);

  const complianceDue = useMemo(() => {
    if (!data) return [];
    return data.documents
      .filter((d) => inTimelineDueWindow(d.valid_till, compliancePeriod, complianceCustomRange))
      .sort((a, b) => (a.valid_till ?? '').localeCompare(b.valid_till ?? ''));
  }, [data, compliancePeriod, complianceCustomRange]);

  // Mirrors Approvals.tsx's own row set - every source of an actual
  // approval-gated decision, compliance renewal included now (see
  // fleetAlerts.ts's consolidation note - this tile used to undercount by
  // not knowing about expired/due documents at all). data.alerts is
  // already exactly this set - compliance.models.needs_attention() is
  // is_due OR is_expired, same definition Approvals.tsx uses.
  const pendingApprovals = useMemo(() => {
    if (!data) return { total: 0, expenses: 0, fuelLogs: 0, tripSheets: 0, compliance: 0 };
    const expenses = data.expenses.filter((e) => e.approval_status === 'pending').length;
    const fuelLogs = data.fuelLogs.filter((f) => f.status === 'submitted').length;
    const tripSheets = data.tripSheets.filter((t) => t.status === 'submitted').length;
    const compliance = data.alerts.length;
    return { total: expenses + fuelLogs + tripSheets + compliance, expenses, fuelLogs, tripSheets, compliance };
  }, [data]);

  const pendingPayments = useMemo(() => {
    if (!data) return [];
    const fromExpenses = data.expenses
      .filter((e) => e.vendor && e.is_paid === false)
      .map((e) => ({
        id: `expense-${e.id}`, vendorId: e.vendor as string, kind: 'Expense', amount: Number(e.amount), date: e.date,
      }));
    const fromFuelLogs = data.fuelLogs
      .filter((f) => f.fuel_station && f.is_paid === false)
      .map((f) => ({
        id: `fuel-${f.id}`, vendorId: f.fuel_station as string, kind: 'Fuel log', amount: Number(f.amount), date: f.date,
      }));
    return [...fromExpenses, ...fromFuelLogs].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

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

  function openAlertHolder(doc: ComplianceDocument) {
    if (doc.vehicle) {
      const vehicle = data!.vehicles.find((v) => v.id === doc.vehicle);
      if (vehicle) {
        setDetailInitialTab('compliance');
        setDetailVehicle(vehicle);
      }
    } else if (doc.driver) {
      const driver = data!.drivers.find((d) => d.id === doc.driver);
      if (driver) {
        setDetailInitialTab('licence');
        setDetailDriver(driver);
      }
    }
  }

  function scrollToAlerts() {
    alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToPending() {
    pendingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function vendorName(id: string) {
    return data!.vendors.find((v) => v.id === id)?.name ?? '—';
  }

  function openPendingVendor(vendorId: string) {
    const vendor = data!.vendors.find((v) => v.id === vendorId);
    if (vendor) setDetailVendor(vendor);
  }

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
          <button type="button" className="tile" style={TILE_BTN_STYLE} onClick={() => navigate('/vehicles')}>
            <div className="tile-top">
              <span className="tile-label">Active vehicles</span>
              <span className="tile-icon i-accent"><TruckIcon /></span>
            </div>
            <div className="tile-value tnum">{stats.activeVehicles}</div>
            <div className="tile-foot">{data.vehicles.length} total</div>
          </button>

          <button type="button" className="tile" style={TILE_BTN_STYLE} onClick={() => navigate('/drivers')}>
            <div className="tile-top">
              <span className="tile-label">Active drivers</span>
              <span className="tile-icon i-accent"><DriverIcon /></span>
            </div>
            <div className="tile-value tnum">{stats.activeDrivers}</div>
            <div className="tile-foot">{data.drivers.length} total</div>
          </button>

          <button type="button" className="tile" style={TILE_BTN_STYLE} onClick={scrollToAlerts}>
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
          </button>

          <button type="button" className="tile" style={TILE_BTN_STYLE} onClick={() => navigate('/reports')}>
            <div className="tile-top">
              <span className="tile-label">Net profit (MTD)</span>
              <span className={`tile-icon ${netProfit >= 0 ? 'i-good' : 'i-crit'}`}><ProfitIcon /></span>
            </div>
            <div className="tile-value tnum" style={{ color: netProfit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
              {CURRENCY.format(netProfit)}
            </div>
            <div className="tile-foot">{CURRENCY.format(data.pnl.totals.revenue)} revenue this month</div>
          </button>
        </section>

        <section className="period-grid" aria-label="Expenses and compliance by period">
          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Expenses</span>
              <span className="tile-icon i-accent"><ProfitIcon /></span>
            </div>
            <Timeline
              period={expensePeriod} onPeriodChange={setExpensePeriod}
              customRange={expenseCustomRange} onCustomRangeChange={setExpenseCustomRange}
            />
            {expensePnl ? (
              <>
                <div className="tile-value tnum">
                  {CURRENCY.format(
                    expensePnl.totals.fuel_cost
                      + expensePnl.totals.driver_cost
                      + expensePnl.totals.other_expenses
                      + expensePnl.totals.unattributed_driver_cost
                      + expensePnl.totals.unattributed_expenses,
                  )}
                </div>
                <div className="tile-foot">
                  {CURRENCY.format(expensePnl.totals.revenue)} revenue in this period &middot;{' '}
                  <button type="button" className="link-btn" onClick={() => navigate('/reports')}>
                    View by vehicle →
                  </button>
                </div>
              </>
            ) : (
              <div className="tile-value tnum">…</div>
            )}
          </div>

          <div className="tile">
            <div className="tile-top">
              <span className="tile-label">Compliance due</span>
              <span className={`tile-icon ${complianceDue.some((d) => d.is_expired) ? 'i-crit' : 'i-warn'}`}>
                {complianceDue.some((d) => d.is_expired) ? <AlertIcon /> : <ClockIcon />}
              </span>
            </div>
            <Timeline
              period={compliancePeriod} onPeriodChange={setCompliancePeriod}
              customRange={complianceCustomRange} onCustomRangeChange={setComplianceCustomRange}
            />
            <div className="tile-value tnum">{complianceDue.length}</div>
            <div className="tile-foot">
              {complianceDue.filter((d) => d.is_expired).length} expired &middot; {complianceDue.filter((d) => !d.is_expired).length} due
            </div>
          </div>

          <button type="button" className="tile" style={TILE_BTN_STYLE} onClick={scrollToPending}>
            <div className="tile-top">
              <span className="tile-label">Pending payments</span>
              <span className={`tile-icon ${pendingPayments.length ? 'i-warn' : 'i-good'}`}><WalletIcon /></span>
            </div>
            <div className="tile-value tnum" style={{ color: pendingPayments.length ? 'var(--warn)' : undefined }}>
              {CURRENCY.format(pendingTotal)}
            </div>
            <div className="tile-foot">
              {pendingPayments.length} bill{pendingPayments.length === 1 ? '' : 's'} awaiting payment
            </div>
          </button>

          <button
            type="button" className="tile" style={TILE_BTN_STYLE}
            onClick={() => navigate('/approvals')}
          >
            <div className="tile-top">
              <span className="tile-label">Pending approvals</span>
              <span className={`tile-icon ${pendingApprovals.total ? 'i-warn' : 'i-good'}`}><ApprovalIcon /></span>
            </div>
            <div className="tile-value tnum" style={{ color: pendingApprovals.total ? 'var(--warn)' : undefined }}>
              {pendingApprovals.total}
            </div>
            <div className="tile-foot">
              {pendingApprovals.total === 0 ? 'nothing waiting on a decision' : [
                pendingApprovals.expenses > 0 && `${pendingApprovals.expenses} expense${pendingApprovals.expenses === 1 ? '' : 's'}`,
                pendingApprovals.fuelLogs > 0 && `${pendingApprovals.fuelLogs} fuel`,
                pendingApprovals.tripSheets > 0 && `${pendingApprovals.tripSheets} trip sheet${pendingApprovals.tripSheets === 1 ? '' : 's'}`,
                pendingApprovals.compliance > 0 && `${pendingApprovals.compliance} compliance doc${pendingApprovals.compliance === 1 ? '' : 's'}`,
              ].filter(Boolean).join(' · ')}
            </div>
          </button>
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

          <div className="alerts-card" ref={alertsRef}>
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
                  <button
                    type="button" key={doc.id} className="alert-row btn-reset"
                    onClick={() => openAlertHolder(doc)}
                  >
                    <span className={`stripe ${doc.is_expired ? 'crit' : 'warn'}`} />
                    <div className="alert-main">
                      <div className="alert-doc">{humanize(doc.doc_type)}</div>
                      <div className="alert-holder">{doc.holder_display}</div>
                    </div>
                    <span className={`alert-status ${doc.is_expired ? 'crit' : 'warn'}`}>
                      {days === null ? '—' : days < 0 ? `Expired ${Math.abs(days)}d ago` : `Due in ${days}d`}
                    </span>
                    <span className="alert-date tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="table-card" aria-label="Pending payments" ref={pendingRef}>
          <div className="table-head">
            <h3>Pending payments</h3>
            {pendingPayments.length > 0 && (
              <span className="sub" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {pendingPayments.length} bill{pendingPayments.length === 1 ? '' : 's'} &middot; {CURRENCY.format(pendingTotal)}
              </span>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Vendor</th><th>Type</th><th>Date</th><th>Amount</th></tr></thead>
              <tbody>
                {pendingPayments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => openPendingVendor(p.vendorId)}>
                        {vendorName(p.vendorId)}
                      </button>
                    </td>
                    <td>{p.kind}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(p.date))}</td>
                    <td className="tnum">{CURRENCY.format(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingPayments.length === 0 && <div className="empty-state">Nothing pending — every bill is settled.</div>}
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
                      <button
                        type="button"
                        className="veh-cell btn-reset"
                        onClick={() => { setDetailInitialTab('info'); setDetailVehicle(v); }}
                      >
                        <span className="veh-icon"><TruckIcon /></span>
                        <div>
                          <div className="reg-no">{v.registration_number}</div>
                          <div className="veh-cat">{humanize(v.category)}</div>
                        </div>
                      </button>
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

      {detailVehicle && (
        <VehicleDetailModal
          vehicle={detailVehicle}
          onClose={() => setDetailVehicle(null)}
          initialTab={detailInitialTab === 'licence' ? 'info' : detailInitialTab}
        />
      )}
      {detailDriver && (
        <DriverDetailModal
          driver={detailDriver}
          onClose={() => setDetailDriver(null)}
          initialTab={detailInitialTab === 'compliance' ? 'info' : detailInitialTab}
        />
      )}
      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          onClose={() => setDetailVendor(null)}
        />
      )}
    </>
  );
}
