import { useEffect, useMemo, useState } from 'react';
import { listComplianceDocuments, listDrivers, listVehicleLoanInstallments, listVehicles } from '../api/fleet';
import { listFuelLogs, listLedgerEntries, listTripSheets } from '../api/operations';
import { getDashboardPnL, listExpenseHeads, listExpenses } from '../api/economics';
import { listMaintenanceSchedules } from '../api/maintenance';
import { listVendors, listVendorLedgerEntries } from '../api/vendors';
import { listCustomers, listCustomerLedgerEntries } from '../api/customers';
import type {
  ComplianceDocument, Customer, CustomerLedgerEntry, DashboardPnL, Driver, DriverLedgerEntry, Expense,
  ExpenseHead, FuelLog, MaintenanceSchedule, TripSheet, Vehicle, VehicleLoanInstallment, Vendor, VendorLedgerEntry,
} from '../api/types';
import { CUSTOMER_LEDGER_CREDIT_TYPES, VENDOR_LEDGER_CREDIT_TYPES } from '../api/types';
import { downloadCsv } from '../lib/csv';
import { DownloadIcon, PrinterIcon } from '../components/icons';
import AuditLog from './AuditLog';

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
  { key: 'compliance', label: 'Compliance Summary' },
  { key: 'maintenance_due', label: 'Maintenance Due' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'utilization', label: 'Fleet Utilization' },
  { key: 'pnl', label: 'P&L Summary' },
  { key: 'fuel', label: 'Fuel Report' },
  { key: 'expense_register', label: 'Expense Register' },
  { key: 'vendor_customer_ledger', label: 'Vendor & Customer Ledger' },
  { key: 'emi_due', label: 'EMI Due' },
  { key: 'ledger', label: 'Driver Ledger Summary' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

function section(key: SectionKey) {
  const s = SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown report section: ${key}`);
  return s;
}

const SECTION_GROUPS: { label: string; keys: SectionKey[] }[] = [
  { label: 'Compliance & audit', keys: ['compliance', 'maintenance_due', 'audit'] },
  { label: 'Operational', keys: ['utilization'] },
  { label: 'Financial', keys: ['pnl', 'fuel', 'expense_register', 'vendor_customer_ledger', 'emi_due', 'ledger'] },
];

export default function Reports() {
  const [activeSection, setActiveSection] = useState<SectionKey>('compliance');
  const [start, setStart] = useState(monthStartIso());
  const [end, setEnd] = useState(todayIso());

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tripSheets, setTripSheets] = useState<TripSheet[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<DriverLedgerEntry[]>([]);
  const [pnl, setPnl] = useState<DashboardPnL | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendorEntries, setVendorEntries] = useState<VendorLedgerEntry[]>([]);
  const [customerEntries, setCustomerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [loanInstallments, setLoanInstallments] = useState<VehicleLoanInstallment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listVehicles(), listDrivers(), listTripSheets(), listComplianceDocuments(), listLedgerEntries(),
      listFuelLogs(), listVendors(), listExpenses(), listExpenseHeads(), listMaintenanceSchedules(),
      listCustomers(), listVendorLedgerEntries(), listCustomerLedgerEntries(), listVehicleLoanInstallments(),
    ])
      .then(([v, d, t, doc, l, fl, ven, exp, heads, sch, cust, vle, cle, emi]) => {
        setVehicles(v); setDrivers(d); setTripSheets(t); setDocuments(doc); setLedgerEntries(l);
        setFuelLogs(fl); setVendors(ven); setExpenses(exp); setExpenseHeads(heads); setSchedules(sch);
        setCustomers(cust); setVendorEntries(vle); setCustomerEntries(cle); setLoanInstallments(emi);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    getDashboardPnL(start, end).then(setPnl).catch((err) => setError(err.message));
  }, [start, end]);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.registration_number ?? '—';
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '—';
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? '—';

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

        <div className="no-print" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {SECTION_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-label" style={{ color: 'var(--ink-soft)', padding: 0, margin: '0 0 5px 2px' }}>{group.label}</div>
              <div className="seg" style={{ width: 'fit-content' }}>
                {group.keys.map((key) => (
                  <button key={key} className={activeSection === key ? 'active' : ''} onClick={() => setActiveSection(key)}>
                    {section(key).label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {activeSection === 'maintenance_due' && <MaintenanceDueReport schedules={schedules} vehicleName={vehicleName} />}
        {activeSection === 'utilization' && (
          <UtilizationReport tripSheets={tripSheets} vehicles={vehicles} start={start} end={end} vehicleName={vehicleName} />
        )}
        {activeSection === 'fuel' && <FuelReport fuelLogs={fuelLogs} vehicles={vehicles} vendorName={vendorName} start={start} end={end} />}
        {activeSection === 'expense_register' && (
          <ExpenseRegisterReport expenses={expenses} expenseHeads={expenseHeads} start={start} end={end} />
        )}
        {activeSection === 'vendor_customer_ledger' && (
          <VendorCustomerLedgerReport
            vendors={vendors} customers={customers} vendorEntries={vendorEntries} customerEntries={customerEntries}
          />
        )}
        {activeSection === 'emi_due' && <EmiDueReport installments={loanInstallments} />}
        {activeSection === 'pnl' && <PnLReport pnl={pnl} />}
        {activeSection === 'compliance' && (
          <ComplianceReport documents={documents} start={start} end={end} />
        )}
        {activeSection === 'ledger' && (
          <LedgerReport entries={ledgerEntries} start={start} end={end} driverName={driverName} />
        )}
        {activeSection === 'audit' && <AuditLog />}
      </main>
    </>
  );
}

function UtilizationReport({
  tripSheets, vehicles, start, end, vehicleName,
}: { tripSheets: TripSheet[]; vehicles: Vehicle[]; start: string; end: string; vehicleName: (id: string) => string }) {
  const rows = useMemo(() => {
    // Seeded from every active vehicle first (0-rows) so a truck with no
    // trips this period shows up flagged idle instead of vanishing from the
    // report entirely - the whole point of a utilization report is to catch
    // exactly that vehicle.
    const byVehicle = new Map<string, { trips: number; distance: number; freight: number; days: Set<string> }>();
    for (const v of vehicles) {
      if (v.status === 'active' || v.status === 'in_service') {
        byVehicle.set(v.id, { trips: 0, distance: 0, freight: 0, days: new Set<string>() });
      }
    }
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
  }, [tripSheets, vehicles, start, end]);

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
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Vehicle</th><th>Trips</th><th>Distance</th><th>Active days</th><th>Freight</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vehicle}>
                <td data-label="Vehicle" className="reg-no">{vehicleName(r.vehicle)}</td>
                <td data-label="Trips" className="tnum">{r.trips}</td>
                <td data-label="Distance" className="tnum">{r.distance.toLocaleString('en-IN')} km</td>
                <td data-label="Active days" className="tnum">{r.activeDays}</td>
                <td data-label="Freight" className="tnum">{CURRENCY.format(r.freight)}</td>
                <td data-label="">{r.trips === 0 && <span className="pill off">Idle</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No active vehicles.</div>}
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
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Vehicle</th><th>Revenue</th><th>Fuel</th><th>Driver</th><th>Other</th><th>Net profit</th></tr></thead>
          <tbody>
            {pnl.by_vehicle.map((v) => (
              <tr key={v.vehicle_id}>
                <td data-label="Vehicle" className="reg-no">{v.registration_number}</td>
                <td data-label="Revenue" className="tnum">{CURRENCY.format(v.revenue)}</td>
                <td data-label="Fuel" className="tnum">{CURRENCY.format(v.fuel_cost)}</td>
                <td data-label="Driver" className="tnum">{CURRENCY.format(v.driver_cost)}</td>
                <td data-label="Other" className="tnum">{CURRENCY.format(v.other_expenses)}</td>
                <td data-label="Net profit" className="tnum" style={{ color: v.net_profit >= 0 ? 'var(--good)' : 'var(--critical)', fontWeight: 600 }}>
                  {CURRENCY.format(v.net_profit)}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td data-label="Vehicle">Company total</td>
              <td data-label="Revenue" className="tnum">{CURRENCY.format(pnl.totals.revenue)}</td>
              <td data-label="Fuel" className="tnum">{CURRENCY.format(pnl.totals.fuel_cost)}</td>
              <td data-label="Driver" className="tnum">{CURRENCY.format(pnl.totals.driver_cost + pnl.totals.unattributed_driver_cost)}</td>
              <td data-label="Other" className="tnum">{CURRENCY.format(pnl.totals.other_expenses + pnl.totals.unattributed_expenses)}</td>
              <td data-label="Net profit" className="tnum" style={{ color: pnl.totals.net_profit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
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
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Document</th><th>Holder</th><th>Valid till</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td data-label="Document">{humanize(d.doc_type)}</td>
                <td data-label="Holder">{d.holder_display}</td>
                <td data-label="Valid till" className="tnum">{d.valid_till ? DATE_FMT.format(new Date(d.valid_till)) : '—'}</td>
                <td data-label="Status">
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
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Driver</th><th>Advance</th><th>Wage</th><th>Bonus</th><th>Deduction</th><th>Net</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driver}>
                <td data-label="Driver">{driverName(r.driver)}</td>
                <td data-label="Advance" className="tnum">{CURRENCY.format(r.advance)}</td>
                <td data-label="Wage" className="tnum">{CURRENCY.format(r.wage)}</td>
                <td data-label="Bonus" className="tnum">{CURRENCY.format(r.bonus)}</td>
                <td data-label="Deduction" className="tnum">{CURRENCY.format(r.deduction)}</td>
                <td data-label="Net" className="tnum" style={{ fontWeight: 600 }}>{CURRENCY.format(r.net)}</td>
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

function MaintenanceDueReport({
  schedules, vehicleName,
}: { schedules: MaintenanceSchedule[]; vehicleName: (id: string) => string }) {
  const rows = useMemo(
    () => schedules
      .filter((s) => s.status === 'active')
      .map((s) => ({
        ...s,
        daysRemaining: s.days_remaining,
      }))
      .sort((a, b) => {
        if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
        return (a.next_due_date ?? '').localeCompare(b.next_due_date ?? '');
      }),
    [schedules],
  );

  function exportCsv() {
    downloadCsv(
      'maintenance-due.csv',
      ['Vehicle', 'Part', 'Next due date', 'Next due km', 'Status'],
      rows.map((r) => [vehicleName(r.vehicle), r.part_name, r.next_due_date ?? '', r.next_due_km ?? '', r.is_overdue ? 'Overdue' : 'Upcoming']),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>Maintenance due — fleet-wide</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Vehicle</th><th>Part</th><th>Next due</th><th>Remaining</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Vehicle" className="reg-no">{vehicleName(r.vehicle)}</td>
                <td data-label="Part">{r.part_name}</td>
                <td data-label="Next due" className="tnum">{r.next_due_date ? DATE_FMT.format(new Date(r.next_due_date)) : '—'}</td>
                <td data-label="Remaining" className="tnum">
                  {r.km_remaining ? `${Number(r.km_remaining).toLocaleString('en-IN')} km` : r.daysRemaining != null ? `${r.daysRemaining} days` : '—'}
                </td>
                <td data-label="Status">
                  {r.is_overdue
                    ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                    : <span className="pill on">Upcoming</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No active maintenance schedules.</div>}
      </div>
    </section>
  );
}

// Mileage is measured strictly between consecutive full-tank fills, not
// per-fill - a partial top-up mid-week would otherwise throw off a naive
// litres/distance calc. odometer delta since the prior full-tank fill,
// divided by every litre added in between (including any partial fills).
function FuelReport({
  fuelLogs, vehicles, vendorName, start, end,
}: {
  fuelLogs: FuelLog[]; vehicles: Vehicle[]; vendorName: (id: string | null) => string; start: string; end: string;
}) {
  const rows = useMemo(() => {
    const byVehicle = new Map<string, FuelLog[]>();
    for (const log of fuelLogs) {
      const list = byVehicle.get(log.vehicle) ?? [];
      list.push(log);
      byVehicle.set(log.vehicle, list);
    }
    const out: {
      vehicle: string; litres: number; spend: number; avgRate: number; mileage: number | null; fills: number;
    }[] = [];
    for (const [vehicle, logsAll] of byVehicle) {
      const logs = [...logsAll].sort((a, b) => a.date.localeCompare(b.date));
      const inPeriod = logs.filter((l) => inRange(l.date, start, end));
      if (inPeriod.length === 0) continue;
      const litres = inPeriod.reduce((s, l) => s + Number(l.litres), 0);
      const spend = inPeriod.reduce((s, l) => s + Number(l.amount), 0);

      // Mileage: walk every fill in date order, tracking odometer + litres
      // burned since the last full-tank fill; only a full-tank fill closes
      // out a mileage sample.
      let mileageSum = 0;
      let mileageSamples = 0;
      let sinceOdo: number | null = null;
      let sinceLitres = 0;
      for (const l of logs) {
        if (l.odometer == null) continue;
        const odo = Number(l.odometer);
        if (sinceOdo == null) {
          if (l.is_full_tank) { sinceOdo = odo; sinceLitres = 0; }
          continue;
        }
        sinceLitres += Number(l.litres);
        if (l.is_full_tank) {
          const km = odo - sinceOdo;
          if (km > 0 && sinceLitres > 0 && inRange(l.date, start, end)) {
            mileageSum += km / sinceLitres;
            mileageSamples += 1;
          }
          sinceOdo = odo;
          sinceLitres = 0;
        }
      }
      out.push({
        vehicle, litres, spend, avgRate: litres > 0 ? spend / litres : 0,
        mileage: mileageSamples > 0 ? mileageSum / mileageSamples : null, fills: inPeriod.length,
      });
    }
    const fleetAvgMileage = (() => {
      const withMileage = out.filter((r) => r.mileage != null);
      if (withMileage.length === 0) return null;
      return withMileage.reduce((s, r) => s + (r.mileage ?? 0), 0) / withMileage.length;
    })();
    return {
      rows: out.sort((a, b) => b.spend - a.spend),
      fleetAvgMileage,
    };
  }, [fuelLogs, start, end]);

  const byStation = useMemo(() => {
    const map = new Map<string, { litres: number; spend: number }>();
    for (const l of fuelLogs) {
      if (!inRange(l.date, start, end)) continue;
      const key = l.fuel_station ?? '';
      const row = map.get(key) ?? { litres: 0, spend: 0 };
      row.litres += Number(l.litres);
      row.spend += Number(l.amount);
      map.set(key, row);
    }
    return [...map.entries()]
      .map(([station, v]) => ({ station, ...v, avgRate: v.litres > 0 ? v.spend / v.litres : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [fuelLogs, start, end]);

  function vehicleReg(id: string) { return vehicles.find((v) => v.id === id)?.registration_number ?? '—'; }

  function exportCsv() {
    downloadCsv(
      `fuel-report_${start}_${end}.csv`,
      ['Vehicle', 'Fills', 'Litres', 'Spend', 'Avg rate/litre', 'Mileage (km/l)'],
      rows.rows.map((r) => [vehicleReg(r.vehicle), r.fills, r.litres.toFixed(1), r.spend, r.avgRate.toFixed(2), r.mileage != null ? r.mileage.toFixed(2) : '']),
    );
  }

  return (
    <>
      <section className="table-card">
        <div className="table-head">
          <h3>Fuel report — by vehicle</h3>
          <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
        </div>
        <div className="table-scroll responsive">
          <table>
            <thead><tr><th>Vehicle</th><th>Fills</th><th>Litres</th><th>Spend</th><th>Avg rate/litre</th><th>Mileage</th></tr></thead>
            <tbody>
              {rows.rows.map((r) => {
                const flagged = r.mileage != null && rows.fleetAvgMileage != null && r.mileage < rows.fleetAvgMileage * 0.85;
                return (
                  <tr key={r.vehicle}>
                    <td data-label="Vehicle" className="reg-no">{vehicleReg(r.vehicle)}</td>
                    <td data-label="Fills" className="tnum">{r.fills}</td>
                    <td data-label="Litres" className="tnum">{r.litres.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</td>
                    <td data-label="Spend" className="tnum">{CURRENCY.format(r.spend)}</td>
                    <td data-label="Avg rate/litre" className="tnum">{CURRENCY.format(r.avgRate)}</td>
                    <td data-label="Mileage" className="tnum" style={{ color: flagged ? 'var(--critical)' : undefined, fontWeight: flagged ? 600 : undefined }}>
                      {r.mileage != null ? `${r.mileage.toFixed(2)} km/L` : '—'}
                      {flagged && ' ⚠'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.rows.length === 0 && <div className="empty-state">No fuel logs in this period.</div>}
          <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-soft)' }}>
            ⚠ = mileage more than 15% below the fleet average this period — worth checking for a leak or misreporting.
            Mileage only counts full-tank-to-full-tank fills.
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="table-head"><h3>By fuel station</h3></div>
        <div className="table-scroll responsive">
          <table>
            <thead><tr><th>Station</th><th>Litres</th><th>Spend</th><th>Avg rate/litre</th></tr></thead>
            <tbody>
              {byStation.map((r) => (
                <tr key={r.station || 'unlisted'}>
                  <td data-label="Station">{r.station ? vendorName(r.station) : 'Unlisted'}</td>
                  <td data-label="Litres" className="tnum">{r.litres.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</td>
                  <td data-label="Spend" className="tnum">{CURRENCY.format(r.spend)}</td>
                  <td data-label="Avg rate/litre" className="tnum">{CURRENCY.format(r.avgRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byStation.length === 0 && <div className="empty-state">No fuel logs in this period.</div>}
        </div>
      </section>
    </>
  );
}

function ExpenseRegisterReport({
  expenses, expenseHeads, start, end,
}: {
  expenses: Expense[]; expenseHeads: ExpenseHead[]; start: string; end: string;
}) {
  const rows = useMemo(() => {
    const inPeriod = expenses.filter((e) => inRange(e.date, start, end));
    const byHead = new Map<string, { group: string; name: string; amount: number; count: number }>();
    for (const e of inPeriod) {
      const head = expenseHeads.find((h) => h.id === e.expense_head);
      const key = e.expense_head;
      const row = byHead.get(key) ?? { group: head?.group ?? '—', name: head?.name ?? '—', amount: 0, count: 0 };
      row.amount += Number(e.amount);
      row.count += 1;
      byHead.set(key, row);
    }
    return [...byHead.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses, expenseHeads, start, end]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  // How many were entered vs. how many still need a decision - every
  // expense starts pending regardless of who/what entered it (direct or
  // auto-posted), so this is the one number that answers "is anyone
  // actually signing off on these."
  const approvalCounts = useMemo(() => {
    const inPeriod = expenses.filter((e) => inRange(e.date, start, end));
    const counts = { total: inPeriod.length, approved: 0, pending: 0, rejected: 0 };
    for (const e of inPeriod) counts[e.approval_status] += 1;
    return counts;
  }, [expenses, start, end]);

  function exportCsv() {
    downloadCsv(
      `expense-register_${start}_${end}.csv`,
      ['Group', 'Head', 'Count', 'Amount'],
      rows.map((r) => [humanize(r.group), r.name, r.count, r.amount]),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>
          Expense register — by head — {approvalCounts.total} entered · {approvalCounts.approved} approved
          {' '}· {approvalCounts.pending} pending{approvalCounts.rejected > 0 ? ` · ${approvalCounts.rejected} rejected` : ''}
        </h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Group</th><th>Head</th><th>Entries</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
              return (
                <tr key={r.name}>
                  <td data-label="Group">{humanize(r.group)}</td>
                  <td data-label="Head">{r.name}</td>
                  <td data-label="Entries" className="tnum">{r.count}</td>
                  <td data-label="Amount" className="tnum">{CURRENCY.format(r.amount)}</td>
                  <td data-label="" className="tnum" style={{ color: 'var(--ink-soft)', width: 40 }}>{pct}%</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700 }}>
              <td data-label="Group" colSpan={3}>Total</td>
              <td data-label="Amount" className="tnum">{CURRENCY.format(total)}</td>
              <td data-label=""></td>
            </tr>
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No expenses in this period.</div>}
        <div style={{ padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-soft)' }}>
          Excludes fuel — fuel is tracked separately (see the Fuel Report) and never posts as an Expense row.
        </div>
      </div>
    </section>
  );
}

function VendorCustomerLedgerReport({
  vendors, customers, vendorEntries, customerEntries,
}: {
  vendors: Vendor[]; customers: Customer[]; vendorEntries: VendorLedgerEntry[]; customerEntries: CustomerLedgerEntry[];
}) {
  type Row = { name: string; kind: 'Vendor' | 'Customer'; balance: number };

  const rows = useMemo(() => {
    function balanceFor<E extends { date: string; amount: string; entry_type: string }>(
      entries: E[], creditTypes: Set<string>,
    ) {
      const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
      let balance = 0;
      for (const e of sorted) balance += creditTypes.has(e.entry_type) ? Number(e.amount) : -Number(e.amount);
      return balance;
    }
    const out: Row[] = [];
    for (const v of vendors) {
      const balance = balanceFor(vendorEntries.filter((e) => e.vendor === v.id), VENDOR_LEDGER_CREDIT_TYPES);
      if (balance !== 0) out.push({ name: v.name, kind: 'Vendor', balance });
    }
    for (const c of customers) {
      const balance = balanceFor(customerEntries.filter((e) => e.customer === c.id), CUSTOMER_LEDGER_CREDIT_TYPES);
      if (balance !== 0) out.push({ name: c.name, kind: 'Customer', balance });
    }
    return out.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [vendors, customers, vendorEntries, customerEntries]);

  const totalPayable = rows.filter((r) => r.kind === 'Vendor' && r.balance > 0).reduce((s, r) => s + r.balance, 0);
  const totalReceivable = rows.filter((r) => r.kind === 'Customer' && r.balance > 0).reduce((s, r) => s + r.balance, 0);

  function exportCsv() {
    downloadCsv(
      'vendor-customer-ledger.csv',
      ['Party', 'Type', 'Balance'],
      rows.map((r) => [r.name, r.kind, r.balance]),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>Vendor &amp; customer ledger — {CURRENCY.format(totalPayable)} payable · {CURRENCY.format(totalReceivable)} receivable</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Party</th><th>Type</th><th>Balance</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.name}`}>
                <td data-label="Party">{r.name}</td>
                <td data-label="Type">{r.kind}</td>
                <td data-label="Balance" className="tnum" style={{ fontWeight: 600, color: r.balance > 0 ? 'var(--warn)' : 'var(--good)' }}>
                  {r.balance < 0 ? '−' : ''}{CURRENCY.format(Math.abs(r.balance))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">Every account is settled.</div>}
      </div>
    </section>
  );
}

function EmiDueReport({ installments }: { installments: VehicleLoanInstallment[] }) {
  const rows = useMemo(
    () => installments
      .filter((i) => !i.paid)
      .sort((a, b) => {
        if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
        return a.due_date.localeCompare(b.due_date);
      }),
    [installments],
  );

  const totalDue = rows.reduce((s, r) => s + Number(r.amount), 0);

  function exportCsv() {
    downloadCsv(
      'emi-due.csv',
      ['Vehicle', 'Due date', 'Amount', 'Status'],
      rows.map((r) => [r.registration_number, r.due_date, r.amount, r.is_overdue ? 'Overdue' : 'Upcoming']),
    );
  }

  return (
    <section className="table-card">
      <div className="table-head">
        <h3>EMI due — fleet-wide · {CURRENCY.format(totalDue)}</h3>
        <button className="link-btn no-print" onClick={exportCsv}><DownloadIcon className="mono" /> Export CSV</button>
      </div>
      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Vehicle</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Vehicle" className="reg-no">{r.registration_number}</td>
                <td data-label="Due date" className="tnum">{DATE_FMT.format(new Date(r.due_date))}</td>
                <td data-label="Amount" className="tnum">{CURRENCY.format(Number(r.amount))}</td>
                <td data-label="Status">
                  {r.is_overdue
                    ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                    : <span className="pill svc">Upcoming</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">Nothing due — every EMI is settled.</div>}
      </div>
    </section>
  );
}
