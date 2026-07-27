import { useEffect, useMemo, useState } from 'react';
import { listComplianceDocuments, listDrivers, listVehicles } from '../api/fleet';
import { listLedgerEntries, listTripSheets } from '../api/operations';
import { getDashboardPnL } from '../api/economics';
import type {
  ComplianceDocument, DashboardPnL, Driver, DriverLedgerEntry, TripSheet, Vehicle,
} from '../api/types';
import { downloadCsv } from '../lib/csv';
import { DownloadIcon, PrinterIcon } from '../components/icons';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

const SECTIONS = [
  { key: 'utilization', label: 'Fleet Utilization' },
  { key: 'pnl', label: 'P&L Summary' },
  { key: 'compliance', label: 'Compliance Summary' },
  { key: 'ledger', label: 'Driver Ledger Summary' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

export default function Reports() {
  const [section, setSection] = useState<SectionKey>('utilization');
  const [start, setStart] = useState(monthStartIso());
  const [end, setEnd] = useState(todayIso());

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tripSheets, setTripSheets] = useState<TripSheet[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<DriverLedgerEntry[]>([]);
  const [pnl, setPnl] = useState<DashboardPnL | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listVehicles(), listDrivers(), listTripSheets(), listComplianceDocuments(), listLedgerEntries()])
      .then(([v, d, t, doc, l]) => { setVehicles(v); setDrivers(d); setTripSheets(t); setDocuments(doc); setLedgerEntries(l); })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    getDashboardPnL(start, end).then(setPnl).catch((err) => setError(err.message));
  }, [start, end]);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.registration_number ?? '—';
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '—';

  return (
    <>
      <header className="page-head no-print">
        <div>
          <h1>Reports</h1>
          <div className="sub">{DATE_FMT.format(new Date(start))} – {DATE_FMT.format(new Date(end))}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
          <span style={{ color: 'var(--ink-soft)' }}>to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
          <button className="btn" onClick={() => window.print()}><PrinterIcon className="mono" /> Print</button>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div className="seg no-print" style={{ width: 'fit-content' }}>
          {SECTIONS.map((s) => (
            <button key={s.key} className={section === s.key ? 'on' : ''} onClick={() => setSection(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {section === 'utilization' && (
          <UtilizationReport tripSheets={tripSheets} start={start} end={end} vehicleName={vehicleName} />
        )}
        {section === 'pnl' && <PnLReport pnl={pnl} />}
        {section === 'compliance' && (
          <ComplianceReport documents={documents} start={start} end={end} />
        )}
        {section === 'ledger' && (
          <LedgerReport entries={ledgerEntries} start={start} end={end} driverName={driverName} />
        )}
      </main>
    </>
  );
}

function UtilizationReport({
  tripSheets, start, end, vehicleName,
}: { tripSheets: TripSheet[]; start: string; end: string; vehicleName: (id: string) => string }) {
  const rows = useMemo(() => {
    const byVehicle = new Map<string, { trips: number; distance: number; freight: number; days: Set<string> }>();
    for (const ts of tripSheets) {
      if (ts.status === 'cancelled' || !inRange(ts.date, start, end)) continue;
      const entry = byVehicle.get(ts.vehicle) ?? { trips: 0, distance: 0, freight: 0, days: new Set<string>() };
      entry.trips += 1;
      entry.distance += ts.distance_covered ? Number(ts.distance_covered) : 0;
      entry.freight += Number(ts.total_freight);
      entry.days.add(ts.date);
      byVehicle.set(ts.vehicle, entry);
    }
    return [...byVehicle.entries()]
      .map(([vehicle, v]) => ({ vehicle, ...v, activeDays: v.days.size }))
      .sort((a, b) => b.distance - a.distance);
  }, [tripSheets, start, end]);

  function exportCsv() {
    downloadCsv(
      `fleet-utilization_${start}_${end}.csv`,
      ['Vehicle', 'Trips', 'Distance (km)', 'Active days', 'Freight (₹)'],
      rows.map((r) => [vehicleName(r.vehicle), r.trips, r.distance, r.activeDays, r.freight]),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>Fleet utilization</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Vehicle</th><th>Trips</th><th>Distance</th><th>Active days</th><th>Freight</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vehicle}>
                <td className="reg-no">{vehicleName(r.vehicle)}</td>
                <td className="tnum">{r.trips}</td>
                <td className="tnum">{r.distance.toLocaleString('en-IN')} km</td>
                <td className="tnum">{r.activeDays}</td>
                <td className="tnum">{CURRENCY.format(r.freight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No trips in this period.</div>}
      </div>
    </section>
  );
}

function PnLReport({ pnl }: { pnl: DashboardPnL | null }) {
  function exportCsv() {
    if (!pnl) return;
    downloadCsv(
      `pnl-summary_${pnl.period.start}_${pnl.period.end}.csv`,
      ['Vehicle', 'Revenue', 'Fuel cost', 'Driver cost', 'Other expenses', 'Net profit'],
      pnl.by_vehicle.map((v) => [v.registration_number, v.revenue, v.fuel_cost, v.driver_cost, v.other_expenses, v.net_profit]),
    );
  }

  if (!pnl) return <div className="center-screen">Loading…</div>;

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>P&amp;L summary</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Vehicle</th><th>Revenue</th><th>Fuel</th><th>Driver</th><th>Other</th><th>Net profit</th></tr></thead>
          <tbody>
            {pnl.by_vehicle.map((v) => (
              <tr key={v.vehicle_id}>
                <td className="reg-no">{v.registration_number}</td>
                <td className="tnum">{CURRENCY.format(v.revenue)}</td>
                <td className="tnum">{CURRENCY.format(v.fuel_cost)}</td>
                <td className="tnum">{CURRENCY.format(v.driver_cost)}</td>
                <td className="tnum">{CURRENCY.format(v.other_expenses)}</td>
                <td className="tnum" style={{ color: v.net_profit >= 0 ? 'var(--good)' : 'var(--critical)', fontWeight: 600 }}>
                  {CURRENCY.format(v.net_profit)}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>Company total</td>
              <td className="tnum">{CURRENCY.format(pnl.totals.revenue)}</td>
              <td className="tnum">{CURRENCY.format(pnl.totals.fuel_cost)}</td>
              <td className="tnum">{CURRENCY.format(pnl.totals.driver_cost + pnl.totals.unattributed_driver_cost)}</td>
              <td className="tnum">{CURRENCY.format(pnl.totals.other_expenses + pnl.totals.unattributed_expenses)}</td>
              <td className="tnum" style={{ color: pnl.totals.net_profit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                {CURRENCY.format(pnl.totals.net_profit)}
              </td>
            </tr>
          </tbody>
        </table>
        {pnl.by_vehicle.length === 0 && <div className="empty-state">No vehicle activity in this period.</div>}
      </div>
    </section>
  );
}

function ComplianceReport({ documents, start, end }: { documents: ComplianceDocument[]; start: string; end: string }) {
  const rows = useMemo(
    () => documents
      .filter((d) => d.valid_till && inRange(d.valid_till, start, end))
      .sort((a, b) => (a.valid_till ?? '').localeCompare(b.valid_till ?? '')),
    [documents, start, end],
  );

  function exportCsv() {
    downloadCsv(
      `compliance-summary_${start}_${end}.csv`,
      ['Document type', 'Holder', 'Valid till', 'Status'],
      rows.map((d) => [humanize(d.doc_type), d.holder_display, d.valid_till ?? '', d.is_expired ? 'Expired' : d.is_due ? 'Due soon' : 'Valid']),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>Documents expiring in this window</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Document</th><th>Holder</th><th>Valid till</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{humanize(d.doc_type)}</td>
                <td>{d.holder_display}</td>
                <td className="tnum">{d.valid_till ? DATE_FMT.format(new Date(d.valid_till)) : '—'}</td>
                <td>
                  {d.is_expired ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
                    : d.is_due ? <span className="pill svc">Due soon</span>
                    : <span className="pill on">Valid</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">Nothing expiring in this window.</div>}
      </div>
    </section>
  );
}

function LedgerReport({
  entries, start, end, driverName,
}: { entries: DriverLedgerEntry[]; start: string; end: string; driverName: (id: string) => string }) {
  const rows = useMemo(() => {
    const byDriver = new Map<string, { advance: number; wage: number; bonus: number; deduction: number }>();
    for (const e of entries) {
      if (!inRange(e.date, start, end)) continue;
      const row = byDriver.get(e.driver) ?? { advance: 0, wage: 0, bonus: 0, deduction: 0 };
      row[e.entry_type as 'advance' | 'wage' | 'bonus' | 'deduction'] += Number(e.amount);
      byDriver.set(e.driver, row);
    }
    return [...byDriver.entries()].map(([driver, r]) => ({
      driver, ...r, net: r.wage + r.bonus - r.advance - r.deduction,
    }));
  }, [entries, start, end]);

  function exportCsv() {
    downloadCsv(
      `driver-ledger-summary_${start}_${end}.csv`,
      ['Driver', 'Advance', 'Wage', 'Bonus', 'Deduction', 'Net'],
      rows.map((r) => [driverName(r.driver), r.advance, r.wage, r.bonus, r.deduction, r.net]),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>Driver ledger summary</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Driver</th><th>Advance</th><th>Wage</th><th>Bonus</th><th>Deduction</th><th>Net</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driver}>
                <td>{driverName(r.driver)}</td>
                <td className="tnum">{CURRENCY.format(r.advance)}</td>
                <td className="tnum">{CURRENCY.format(r.wage)}</td>
                <td className="tnum">{CURRENCY.format(r.bonus)}</td>
                <td className="tnum">{CURRENCY.format(r.deduction)}</td>
                <td className="tnum" style={{ fontWeight: 600 }}>{CURRENCY.format(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No ledger entries in this period.</div>}
        <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-soft)' }}>
          Net = Wage + Bonus − Advance − Deduction. A simple settlement figure, not authoritative payroll.
        </div>
      </div>
    </section>
  );
}
