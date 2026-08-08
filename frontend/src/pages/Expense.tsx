import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import MarkPaidModal from '../components/MarkPaidModal';
import AuditHistory from '../components/AuditHistory';
import { ApprovalDecisionModal } from '../components/ApprovalDecisionModal';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import { ExpenseSourceBadge, ExpenseSourceLink } from '../components/ExpenseSourceBadge';
import VehiclePicker from '../components/VehiclePicker';
import { LogForm } from '../components/maintenance/LogForm';
import { BoxIcon, FuelIcon, TyreIcon, WrenchIcon } from '../components/icons';
import { usePermission } from '../context/AuthContext';
import {
  listVehicles, listDrivers, listVehicleLoanInstallments, markVehicleLoanInstallmentPaid,
} from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listPartInventoryItems } from '../api/parts';
import { listMaintenanceSchedules } from '../api/maintenance';
import { LedgerEntryForm } from './DriverLedger';
import {
  approveExpense, createExpense, createExpenseHead, listExpenseHeads, listExpenses, markExpensePaid,
  rejectExpense, retireExpense, updateExpense, updateExpenseHead,
} from '../api/economics';
import {
  approveFuelLog, listFuelLogs, listLedgerEntries, listTripSheets, rejectFuelLog,
} from '../api/operations';
import { ApiError } from '../api/client';
import {
  EXPENSE_APPROVAL_LABEL as APPROVAL_LABEL, EXPENSE_APPROVAL_TONE as APPROVAL_TONE,
  FUEL_STATUS_LABEL, FUEL_STATUS_TONE,
} from '../lib/statusDisplay';
import {
  EXPENSE_HEAD_GROUPS, VENDOR_PAYMENT_MODES, type Driver, type DriverLedgerEntry,
  type Expense as ExpenseRecord, type ExpenseApprovalStatus, type FuelLog, type MaintenanceSchedule,
  type PartInventoryItem, type ExpenseHead, type ExpenseHeadGroup, type ExpenseHeadInput, type ExpenseInput,
  type TripSheet, type Vehicle, type VehicleLoanInstallment, type Vendor,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Same set economics.pnl.DRIVER_COST_TYPES uses for driver_cost - wage/
// bonus/reimbursement are real company spend; advance and advance_return
// are cash movements against a float, not a cost, so they're excluded here
// too (this view mirrors what the P&L already counts, not the full ledger).
const DRIVER_COST_ENTRY_TYPES = new Set(['wage', 'bonus', 'reimbursement']);

// The "All costs" tab's row shape - a thin discriminated union over four
// sources that deliberately stay separate records (see the fuelLogs/
// installments state docstring in Expense() for why), tagged with enough
// to render and act on each kind without a forced-generic status model
// (EMI/driver-wage rows have no approve/reject concept at all, unlike
// Expense/Fuel Log).
type CostRow =
  | { kind: 'expense'; id: string; date: string; exp: ExpenseRecord }
  | { kind: 'fuel'; id: string; date: string; log: FuelLog }
  | { kind: 'emi'; id: string; date: string; inst: VehicleLoanInstallment }
  | { kind: 'driver_cost'; id: string; date: string; entry: DriverLedgerEntry };

const COST_ROW_KIND_LABELS: Record<CostRow['kind'], string> = {
  expense: 'Expense', fuel: 'Fuel', emi: 'EMI', driver_cost: 'Driver cost',
};

function costRowAmount(row: CostRow): number {
  if (row.kind === 'expense') return Number(row.exp.amount);
  if (row.kind === 'fuel') return Number(row.log.amount);
  if (row.kind === 'emi') return Number(row.inst.amount);
  return Number(row.entry.amount);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const GROUP_LABELS: Record<ExpenseHeadGroup, string> = {
  running: 'Running',
  load: 'Load',
  tyre_service: 'Tyre service',
  repairs: 'Repairs',
};

const GROUP_ICONS: Record<ExpenseHeadGroup, () => ReactElement> = {
  running: () => <FuelIcon />,
  load: () => <BoxIcon />,
  tyre_service: () => <TyreIcon />,
  repairs: () => <WrenchIcon />,
};

function GroupPill({ group }: { group: ExpenseHeadGroup }) {
  const Icon = GROUP_ICONS[group];
  return (
    <span className={`group-pill ${group}`}>
      <span className="swatch-icon"><Icon /></span>
      {GROUP_LABELS[group]}
    </span>
  );
}

const BLANK_EXPENSE: ExpenseInput = {
  vehicle: null, expense_head: '', date: todayIso(), amount: '', vendor: null, unlisted_vendor_name: '', notes: '',
};
const BLANK_HEAD: ExpenseHeadInput = { name: '', group: 'running', slug: '' };

export default function Expense() {
  // Used directly by the "All costs" tab, which renders its own rows
  // inline rather than through ExpenseRow/FuelLog's own row components -
  // those gate the same way locally (see ExpenseRow's own usePermission call).
  const canDecideExpense = usePermission('expenses', 'change_status');
  const canDecideFuel = usePermission('fuel_log', 'change_status');
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const initialTab = rawTab === 'all' || rawTab === 'costs' ? rawTab : 'heads';
  const [tab, setTab] = useState<'heads' | 'all' | 'costs'>(initialTab);
  // Lets the Dashboard's "Pending approvals" tile deep-link straight into
  // the filtered view (/expense?tab=all&status=pending) instead of just
  // naming the page.
  const initialStatus = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseApprovalStatus>(
    initialStatus === 'pending' || initialStatus === 'approved' || initialStatus === 'rejected'
      ? initialStatus : 'all',
  );

  const [heads, setHeads] = useState<ExpenseHead[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  // Only needed for the "Driver salary"/"Maintenance" branches of the Add
  // expense modal - fetched up front like vehicles/vendors so switching to
  // either is instant.
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tripSheets, setTripSheets] = useState<TripSheet[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<DriverLedgerEntry[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [inventoryItems, setInventoryItems] = useState<PartInventoryItem[]>([]);
  // For the "All costs" tab - every outgoing cost, wherever it actually
  // lives (fuel and driver wages are deliberately NOT synced into Expense
  // itself, since the P&L sums them separately - see economics/pnl.py's
  // fuel_cost/driver_cost lines). This tab merges them for one combined
  // view without changing that underlying accounting.
  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [installments, setInstallments] = useState<VehicleLoanInstallment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showHeadForm, setShowHeadForm] = useState(false);
  const [editingHead, setEditingHead] = useState<ExpenseHead | null>(null);
  const [groupFilter, setGroupFilter] = useState<ExpenseHeadGroup | 'all'>('all');
  const [headSearch, setHeadSearch] = useState('');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [markPaidExpense, setMarkPaidExpense] = useState<ExpenseRecord | null>(null);
  const [markPaidInstallment, setMarkPaidInstallment] = useState<VehicleLoanInstallment | null>(null);
  // Generalized over both approval-capable sources (Expense and Fuel Log,
  // for the "All costs" tab) rather than one state per source - EMI/driver-
  // wage rows have no approve/reject concept at all (see DRIVER_COST_ENTRY_
  // TYPES's docstring), so there's nothing to generalize further to.
  const [decision, setDecision] = useState<{
    kind: 'expense' | 'fuel'; id: string; mode: 'approve' | 'reject'; summary: { label: string; value: string }[];
  } | null>(null);
  const [groupByHead, setGroupByHead] = useState(false);

  // "All expenses" filter bar - vehicle/vendor/date range/free-text, on top
  // of the status segmented control. All client-side, same as the Heads
  // tab's own search - the full list is already fetched up front.
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const hasActiveFilters = vehicleFilter !== 'all' || vendorFilter !== 'all' || !!dateFrom || !!dateTo || !!expenseSearch.trim();
  function clearFilters() {
    setVehicleFilter('all'); setVendorFilter('all'); setDateFrom(''); setDateTo(''); setExpenseSearch('');
  }

  // "All costs" tab - just a type filter, not the full filter bar above;
  // it's a visibility rollup, not meant to replace the richer per-source
  // pages (Expense's own filters, FuelLog.tsx, the vehicle's Loan tab).
  const [costsTypeFilter, setCostsTypeFilter] = useState<'all' | CostRow['kind']>('all');

  function loadHeads() {
    listExpenseHeads().then(setHeads).catch((err) => setError(err.message));
  }
  function loadExpenses() {
    listExpenses().then(setExpenses).catch((err) => setError(err.message));
  }
  function loadFuelLogs() {
    listFuelLogs().then(setFuelLogs).catch((err) => setError(err.message));
  }
  function loadInstallments() {
    listVehicleLoanInstallments().then(setInstallments).catch(() => {});
  }
  function loadLedgerEntries() {
    listLedgerEntries().then(setLedgerEntries).catch(() => {});
  }

  useEffect(() => {
    loadHeads();
    loadExpenses();
    loadFuelLogs();
    loadInstallments();
    loadLedgerEntries();
    listVehicles().then(setVehicles).catch(() => {});
    listVendors().then(setVendors).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
    listTripSheets().then(setTripSheets).catch(() => {});
    listMaintenanceSchedules().then(setSchedules).catch(() => {});
    listPartInventoryItems().then(setInventoryItems).catch(() => {});
  }, []);

  const vehicleName = (id: string | null) => (id && vehicles.find((v) => v.id === id)?.registration_number) || 'Company';
  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || '—';
  const headName = (id: string) => heads?.find((h) => h.id === id)?.name ?? '—';
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '—';

  const visibleHeads = useMemo(() => {
    if (!heads) return null;
    const q = headSearch.trim().toLowerCase();
    return heads
      .filter((h) => groupFilter === 'all' || h.group === groupFilter)
      .filter((h) => !q || h.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [heads, groupFilter, headSearch]);

  const countFor = (group: ExpenseHeadGroup | 'all') => (
    group === 'all' ? heads?.length ?? 0 : heads?.filter((h) => h.group === group).length ?? 0
  );

  // Vehicle/vendor/date/text filters apply first, independent of the status
  // tab - so the status counts below reflect "how many of what I'm looking
  // at are pending/approved/rejected", not the whole ledger every time.
  const scopedExpenses = useMemo(() => {
    if (!expenses) return null;
    const q = expenseSearch.trim().toLowerCase();
    return expenses.filter((e) => {
      if (vehicleFilter === 'company' && e.vehicle) return false;
      if (vehicleFilter !== 'all' && vehicleFilter !== 'company' && e.vehicle !== vehicleFilter) return false;
      if (vendorFilter !== 'all' && e.vendor !== vendorFilter) return false;
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (q) {
        const head = heads?.find((h) => h.id === e.expense_head);
        const vendor = vendors.find((v) => v.id === e.vendor);
        const hay = `${e.notes} ${vendor?.name ?? ''} ${e.unlisted_vendor_name} ${head?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, heads, vendors, vehicleFilter, vendorFilter, dateFrom, dateTo, expenseSearch]);

  const filteredExpenses = useMemo(() => {
    if (!scopedExpenses) return null;
    if (statusFilter === 'all') return scopedExpenses;
    return scopedExpenses.filter((e) => e.approval_status === statusFilter);
  }, [scopedExpenses, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { all: scopedExpenses?.length ?? 0, pending: 0, approved: 0, rejected: 0 };
    for (const e of scopedExpenses ?? []) counts[e.approval_status] += 1;
    return counts;
  }, [scopedExpenses]);

  const emptyExpensesMessage = hasActiveFilters || statusFilter !== 'all'
    ? 'No expenses match these filters.'
    : 'No expenses recorded yet.';

  // Same rollup Reports.tsx's ExpenseRegisterReport already computes
  // client-side - grouping here too so a head's running total is visible
  // right next to the transactions that make it up, not only in a
  // separate report. Grouped by the filtered set, so switching the status
  // filter narrows both layouts consistently.
  const groupedExpenses = useMemo(() => {
    if (!filteredExpenses || !heads) return [];
    const byHead = new Map<string, ExpenseRecord[]>();
    for (const exp of filteredExpenses) {
      const list = byHead.get(exp.expense_head) ?? [];
      list.push(exp);
      byHead.set(exp.expense_head, list);
    }
    return [...byHead.entries()]
      .map(([headId, rows]) => {
        const head = heads.find((h) => h.id === headId);
        if (!head) return null;
        const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
        return { head, rows, total };
      })
      .filter((g): g is { head: ExpenseHead; rows: ExpenseRecord[]; total: number } => g !== null)
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses, heads]);

  const costRows = useMemo(() => {
    const rows: CostRow[] = [];
    for (const exp of expenses ?? []) rows.push({ kind: 'expense', id: exp.id, date: exp.date, exp });
    for (const log of fuelLogs ?? []) {
      if (log.status === 'cancelled') continue;
      rows.push({ kind: 'fuel', id: log.id, date: log.date, log });
    }
    for (const inst of installments) rows.push({ kind: 'emi', id: inst.id, date: inst.paid_date ?? inst.due_date, inst });
    for (const entry of ledgerEntries) {
      if (!DRIVER_COST_ENTRY_TYPES.has(entry.entry_type)) continue;
      rows.push({ kind: 'driver_cost', id: entry.id, date: entry.date, entry });
    }
    return rows
      .filter((r) => costsTypeFilter === 'all' || r.kind === costsTypeFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, fuelLogs, installments, ledgerEntries, costsTypeFilter]);

  const costRowsTotal = useMemo(() => costRows.reduce((sum, r) => sum + costRowAmount(r), 0), [costRows]);

  async function handleRetireExpense(exp: ExpenseRecord) {
    if (!confirm('Retire this expense record?')) return;
    await retireExpense(exp.id);
    loadExpenses();
  }

  function expenseDecisionSummary(exp: ExpenseRecord) {
    return [
      { label: 'Vehicle', value: vehicleName(exp.vehicle) },
      { label: 'Expense head', value: headName(exp.expense_head) },
      { label: 'Amount', value: CURRENCY.format(Number(exp.amount)) },
      { label: 'Vendor', value: exp.vendor ? vendorName(exp.vendor) : exp.unlisted_vendor_name || '—' },
    ];
  }

  function fuelLogDecisionSummary(log: FuelLog) {
    return [
      { label: 'Vehicle', value: vehicleName(log.vehicle) },
      { label: 'Litres', value: `${Number(log.litres).toLocaleString('en-IN')} L` },
      { label: 'Amount', value: CURRENCY.format(Number(log.amount)) },
      { label: 'Filled by', value: log.filled_by || '—' },
    ];
  }

  async function handleDecisionConfirm(note: string) {
    if (!decision) return;
    if (decision.kind === 'expense') {
      if (decision.mode === 'approve') await approveExpense(decision.id, note || undefined);
      else await rejectExpense(decision.id, note);
      loadExpenses();
    } else {
      if (decision.mode === 'approve') await approveFuelLog(decision.id, note || undefined);
      else await rejectFuelLog(decision.id, note);
      loadFuelLogs();
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Expense</h1>
          <div className="sub">
            {tab === 'heads'
              ? 'The heads trip & work cards and maintenance draw from — no status, no delete, just add and rename.'
              : 'Every cost, wherever it was entered — a trip, a tyre job, a maintenance visit, or logged directly here.'}
          </div>
        </div>
        {tab === 'heads' ? (
          <button className="btn primary" onClick={() => { setEditingHead(null); setShowHeadForm(true); }}>
            + Add expense head
          </button>
        ) : (
          <button className="btn primary" onClick={() => { setEditingExpense(null); setShowExpenseForm(true); }}>
            + Add expense
          </button>
        )}
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div className="seg" style={{ width: 'fit-content' }}>
          <button className={tab === 'heads' ? 'active' : ''} onClick={() => setTab('heads')}>
            Heads ({heads?.length ?? 0})
          </button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            All expenses ({expenses?.length ?? 0})
          </button>
          <button className={tab === 'costs' ? 'active' : ''} onClick={() => setTab('costs')}>
            All costs ({costRows.length})
          </button>
        </div>

        {tab === 'heads' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
              <div className="seg">
                <button className={groupFilter === 'all' ? 'active' : ''} onClick={() => setGroupFilter('all')}>
                  All ({countFor('all')})
                </button>
                {EXPENSE_HEAD_GROUPS.map((g) => (
                  <button key={g} className={groupFilter === g ? 'active' : ''} onClick={() => setGroupFilter(g)}>
                    {GROUP_LABELS[g]} ({countFor(g)})
                  </button>
                ))}
              </div>
              <input
                type="search" className="search-input" placeholder="Search heads…"
                value={headSearch} onChange={(e) => setHeadSearch(e.target.value)}
              />
            </div>

            <section className="table-card" style={{ marginTop: 14 }}>
              <div className="table-scroll responsive">
                <table>
                  <thead><tr><th>Group</th><th>Name</th><th></th></tr></thead>
                  <tbody>
                    {visibleHeads?.map((h) => (
                      <tr key={h.id}>
                        <td data-label="Group"><GroupPill group={h.group} /></td>
                        <td data-label="Name">{h.name}</td>
                        <td data-label="">
                          <button type="button" className="link-btn" onClick={() => { setEditingHead(h); setShowHeadForm(true); }}>
                            Rename
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleHeads && visibleHeads.length === 0 && (
                  <div className="empty-state">
                    {headSearch || groupFilter !== 'all' ? 'No heads match this filter.' : 'No expense heads yet.'}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {tab === 'all' && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14 }}>
              <div className="field" style={{ minWidth: 170 }}>
                <label htmlFor="f_vehicle">Vehicle</label>
                <select id="f_vehicle" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
                  <option value="all">All vehicles</option>
                  <option value="company">Company (not vehicle-specific)</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: 160 }}>
                <label htmlFor="f_vendor">Vendor</label>
                <select id="f_vendor" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
                  <option value="all">All vendors</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: 135 }}>
                <label htmlFor="f_from">From</label>
                <input id="f_from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 135 }}>
                <label htmlFor="f_to">To</label>
                <input id="f_to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 200, flex: 1 }}>
                <label htmlFor="f_search">Search</label>
                <input
                  id="f_search" type="search" placeholder="Notes, vendor, head…"
                  value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)}
                />
              </div>
              {hasActiveFilters && (
                <button type="button" className="link-btn" style={{ paddingBottom: 9 }} onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              <div className="seg">
                <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>
                  All ({statusCounts.all})
                </button>
                <button className={statusFilter === 'pending' ? 'active' : ''} onClick={() => setStatusFilter('pending')}>
                  Pending ({statusCounts.pending})
                </button>
                <button className={statusFilter === 'approved' ? 'active' : ''} onClick={() => setStatusFilter('approved')}>
                  Approved ({statusCounts.approved})
                </button>
                <button className={statusFilter === 'rejected' ? 'active' : ''} onClick={() => setStatusFilter('rejected')}>
                  Rejected ({statusCounts.rejected})
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                <input type="checkbox" checked={groupByHead} onChange={(e) => setGroupByHead(e.target.checked)} />
                Group by head
              </label>
            </div>

            {groupByHead ? (
              <>
                {groupedExpenses.map((g) => (
                  <section className="table-card" style={{ marginTop: 14 }} key={g.head.id}>
                    <div className="table-head">
                      <h3>
                        {g.head.name}{' '}
                        <span style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 12.5 }}>({g.rows.length})</span>
                      </h3>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{CURRENCY.format(g.total)}</span>
                    </div>
                    <div className="table-scroll responsive">
                      <table>
                        <thead>
                          <tr><th>Vehicle</th><th>Source</th><th>Status</th><th>Date</th><th>Amount</th><th>Vendor</th><th>Payment</th><th></th></tr>
                        </thead>
                        <tbody>
                          {g.rows.map((exp) => (
                            <ExpenseRow
                              key={exp.id} exp={exp} showHead={false} vehicleName={vehicleName} vendorName={vendorName}
                              onEdit={() => { setEditingExpense(exp); setShowExpenseForm(true); }}
                              onRetire={() => handleRetireExpense(exp)}
                              onMarkPaid={() => setMarkPaidExpense(exp)}
                              onApprove={() => setDecision({ kind: 'expense', id: exp.id, mode: 'approve', summary: expenseDecisionSummary(exp) })}
                              onReject={() => setDecision({ kind: 'expense', id: exp.id, mode: 'reject', summary: expenseDecisionSummary(exp) })}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
                {groupedExpenses.length === 0 && (
                  <section className="table-card" style={{ marginTop: 14 }}>
                    <div className="empty-state">
                      {emptyExpensesMessage}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <section className="table-card" style={{ marginTop: 14 }}>
                <div className="table-scroll responsive">
                  <table>
                    <thead>
                      <tr><th>Vehicle</th><th>Head</th><th>Source</th><th>Status</th><th>Date</th><th>Amount</th><th>Vendor</th><th>Payment</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filteredExpenses?.map((exp) => (
                        <ExpenseRow
                          key={exp.id} exp={exp} showHead headName={headName(exp.expense_head)}
                          vehicleName={vehicleName} vendorName={vendorName}
                          onEdit={() => { setEditingExpense(exp); setShowExpenseForm(true); }}
                          onRetire={() => handleRetireExpense(exp)}
                          onMarkPaid={() => setMarkPaidExpense(exp)}
                          onApprove={() => setDecision({ kind: 'expense', id: exp.id, mode: 'approve', summary: expenseDecisionSummary(exp) })}
                          onReject={() => setDecision({ kind: 'expense', id: exp.id, mode: 'reject', summary: expenseDecisionSummary(exp) })}
                        />
                      ))}
                    </tbody>
                  </table>
                  {filteredExpenses && filteredExpenses.length === 0 && (
                    <div className="empty-state">
                      {emptyExpensesMessage}
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'costs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              <div className="seg">
                <button className={costsTypeFilter === 'all' ? 'active' : ''} onClick={() => setCostsTypeFilter('all')}>
                  All ({costRows.length})
                </button>
                {(['expense', 'fuel', 'emi', 'driver_cost'] as const).map((k) => (
                  <button key={k} className={costsTypeFilter === k ? 'active' : ''} onClick={() => setCostsTypeFilter(k)}>
                    {COST_ROW_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Total: {CURRENCY.format(costRowsTotal)}</div>
            </div>

            <section className="table-card" style={{ marginTop: 14 }}>
              <div className="table-scroll responsive">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Vehicle / Driver</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {costRows.map((row) => (
                      <tr key={`${row.kind}:${row.id}`}>
                        <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(row.date))}</td>
                        <td data-label="Type">{COST_ROW_KIND_LABELS[row.kind]}</td>
                        <td data-label="Vehicle / Driver" className="reg-no">
                          {row.kind === 'expense' && vehicleName(row.exp.vehicle)}
                          {row.kind === 'fuel' && vehicleName(row.log.vehicle)}
                          {row.kind === 'emi' && row.inst.registration_number}
                          {row.kind === 'driver_cost' && driverName(row.entry.driver)}
                        </td>
                        <td data-label="Description">
                          {row.kind === 'expense' && headName(row.exp.expense_head)}
                          {row.kind === 'fuel' && `Fuel${row.log.filled_by ? ` — ${row.log.filled_by}` : ''}`}
                          {row.kind === 'emi' && `EMI installment (due ${DATE_FMT.format(new Date(row.inst.due_date))})`}
                          {row.kind === 'driver_cost' && `Driver ${humanize(row.entry.subtype || row.entry.entry_type)}`}
                        </td>
                        <td data-label="Amount" className="tnum">{CURRENCY.format(costRowAmount(row))}</td>
                        <td data-label="Status">
                          {row.kind === 'expense' && (
                            <ApprovalStatusPill label={APPROVAL_LABEL[row.exp.approval_status]} tone={APPROVAL_TONE[row.exp.approval_status]} />
                          )}
                          {row.kind === 'fuel' && (
                            <ApprovalStatusPill label={FUEL_STATUS_LABEL[row.log.status]} tone={FUEL_STATUS_TONE[row.log.status]} />
                          )}
                          {row.kind === 'emi' && (
                            row.inst.paid ? <span className="pill on">Paid</span>
                              : row.inst.is_overdue
                                ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                                : <span className="pill off">Due</span>
                          )}
                          {row.kind === 'driver_cost' && <span className="pill off">Recorded</span>}
                        </td>
                        <td data-label="">
                          <div className="row-actions">
                            {row.kind === 'expense' && row.exp.approval_status === 'pending' && canDecideExpense && (
                              <>
                                <button type="button" className="link-btn"
                                  onClick={() => setDecision({ kind: 'expense', id: row.exp.id, mode: 'approve', summary: expenseDecisionSummary(row.exp) })}>
                                  Approve
                                </button>
                                <button type="button" className="link-btn danger"
                                  onClick={() => setDecision({ kind: 'expense', id: row.exp.id, mode: 'reject', summary: expenseDecisionSummary(row.exp) })}>
                                  Reject
                                </button>
                              </>
                            )}
                            {row.kind === 'fuel' && row.log.status === 'submitted' && canDecideFuel && (
                              <>
                                <button type="button" className="link-btn"
                                  onClick={() => setDecision({ kind: 'fuel', id: row.log.id, mode: 'approve', summary: fuelLogDecisionSummary(row.log) })}>
                                  Approve
                                </button>
                                <button type="button" className="link-btn danger"
                                  onClick={() => setDecision({ kind: 'fuel', id: row.log.id, mode: 'reject', summary: fuelLogDecisionSummary(row.log) })}>
                                  Reject
                                </button>
                              </>
                            )}
                            {row.kind === 'emi' && !row.inst.paid && (
                              <button type="button" className="link-btn" onClick={() => setMarkPaidInstallment(row.inst)}>Mark paid</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {costRows.length === 0 && (
                  <div className="empty-state">
                    {costsTypeFilter === 'all' ? 'No costs recorded yet.' : `No ${COST_ROW_KIND_LABELS[costsTypeFilter].toLowerCase()} costs.`}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {showHeadForm && (
        <ExpenseHeadForm
          initial={editingHead}
          onClose={() => setShowHeadForm(false)}
          onSaved={() => { setShowHeadForm(false); loadHeads(); }}
        />
      )}
      {showExpenseForm && (
        editingExpense ? (
          <ExpenseForm
            initial={editingExpense}
            vehicles={vehicles}
            vendors={vendors}
            heads={heads ?? []}
            onClose={() => setShowExpenseForm(false)}
            onSaved={() => { setShowExpenseForm(false); loadExpenses(); }}
          />
        ) : (
          <AddExpenseModal
            vehicles={vehicles}
            vendors={vendors}
            heads={heads ?? []}
            drivers={drivers}
            tripSheets={tripSheets}
            ledgerEntries={ledgerEntries}
            schedules={schedules}
            inventoryItems={inventoryItems}
            onClose={() => setShowExpenseForm(false)}
            onSaved={() => { setShowExpenseForm(false); loadExpenses(); }}
          />
        )
      )}
      {markPaidExpense && (
        <MarkPaidModal
          title={`Mark paid — ${headName(markPaidExpense.expense_head)}`}
          vendorName={vendorName(markPaidExpense.vendor)}
          amountLabel={CURRENCY.format(Number(markPaidExpense.amount))}
          onConfirm={(mode) => markExpensePaid(markPaidExpense.id, mode)}
          onClose={() => { setMarkPaidExpense(null); loadExpenses(); }}
        />
      )}
      {decision && (
        <ApprovalDecisionModal
          mode={decision.mode}
          title={
            decision.mode === 'approve'
              ? (decision.kind === 'expense' ? 'Approve expense' : 'Approve fuel entry')
              : (decision.kind === 'expense' ? 'Reject expense' : 'Reject fuel entry')
          }
          summary={decision.summary}
          onConfirm={handleDecisionConfirm}
          onClose={() => setDecision(null)}
        />
      )}
      {markPaidInstallment && (
        <MarkPaidModal
          title={`Mark EMI paid — ${markPaidInstallment.registration_number}`}
          vendorName={`Due ${DATE_FMT.format(new Date(markPaidInstallment.due_date))}`}
          amountLabel={CURRENCY.format(Number(markPaidInstallment.amount))}
          onConfirm={(mode) => markVehicleLoanInstallmentPaid(markPaidInstallment.id, todayIso(), mode)}
          onClose={() => { setMarkPaidInstallment(null); loadInstallments(); }}
        />
      )}
    </>
  );
}

// Shared by the flat and grouped-by-head layouts, so a row looks and
// behaves identically either way - one place to change, not the
// copy-pasted-per-page duplication the Tyres/Maintenance Operations-vs-
// Masters pages ended up with.
function ExpenseRow({
  exp, showHead, headName, vehicleName, vendorName, onEdit, onRetire, onMarkPaid, onApprove, onReject,
}: {
  exp: ExpenseRecord; showHead: boolean; headName?: string;
  vehicleName: (id: string | null) => string; vendorName: (id: string | null) => string;
  onEdit: () => void; onRetire: () => void; onMarkPaid: () => void;
  onApprove: () => void; onReject: () => void;
}) {
  // Gated client-side the way CompanyProfile.tsx already does - the
  // backend (expenses/change_status) is still the real, independent gate
  // either way (economics.views.ExpenseViewSet.approve/reject).
  const canDecide = usePermission('expenses', 'change_status');

  return (
    <tr>
      <td data-label="Vehicle" className="reg-no">{vehicleName(exp.vehicle)}</td>
      {showHead && <td data-label="Head">{headName}</td>}
      <td data-label="Source"><ExpenseSourceBadge expense={exp} /></td>
      <td data-label="Status"><ApprovalStatusPill label={APPROVAL_LABEL[exp.approval_status]} tone={APPROVAL_TONE[exp.approval_status]} /></td>
      <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(exp.date))}</td>
      <td data-label="Amount" className="tnum">{CURRENCY.format(Number(exp.amount))}</td>
      <td data-label="Vendor">{exp.vendor ? vendorName(exp.vendor) : exp.unlisted_vendor_name ? `${exp.unlisted_vendor_name} (not in system)` : '—'}</td>
      <td data-label="Payment">
        {exp.is_paid === null ? '—' : exp.is_paid ? (
          <span className="pill on">Paid</span>
        ) : (
          <button type="button" className="link-btn" onClick={onMarkPaid}>Mark paid</button>
        )}
      </td>
      <td data-label="">
        <div className="row-actions">
          {exp.approval_status === 'pending' && canDecide && (
            <>
              <button type="button" className="link-btn" onClick={onApprove}>Approve</button>
              <button type="button" className="link-btn danger" onClick={onReject}>Reject</button>
            </>
          )}
          {exp.source === 'direct' ? (
            <button className="link-btn" onClick={onEdit}>Edit</button>
          ) : (
            // Editing here would be silently overwritten the next time its
            // source record saves (see e.g. tyres/serializers.py's
            // _sync_expense) - and now rejected server-side too if it
            // somehow got through (ExpenseSerializer.validate). A link to
            // the real place, not a button that lies.
            <ExpenseSourceLink expense={exp} />
          )}
          <button className="link-btn danger" onClick={onRetire}>Retire</button>
        </div>
      </td>
    </tr>
  );
}

function ExpenseHeadForm({
  initial, onClose, onSaved,
}: { initial: ExpenseHead | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ExpenseHeadInput>(
    initial ? { name: initial.name, group: initial.group, slug: initial.slug } : BLANK_HEAD,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ExpenseHeadInput>(key: K, value: ExpenseHeadInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateExpenseHead(initial.id, { name: form.name, group: form.group });
      } else {
        await createExpenseHead({ ...form, slug: form.slug || slugify(form.name) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this expense head.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Rename — ${initial.name}` : 'Add expense head'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="eh_name">Name</label>
            <input id="eh_name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="eh_group">Group</label>
            <select id="eh_group" value={form.group} onChange={(e) => set('group', e.target.value as ExpenseHeadInput['group'])}>
              {EXPENSE_HEAD_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add expense head'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseForm({
  initial, vehicles, vendors, heads, bare, onClose, onSaved,
}: {
  initial: ExpenseRecord | null; vehicles: Vehicle[]; vendors: Vendor[]; heads: ExpenseHead[];
  // Skips this component's own Modal wrapper and returns just the <form> -
  // for AddExpenseModal, which already owns a Modal shared with the
  // driver-salary toggle.
  bare?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<ExpenseInput>(initial ?? BLANK_EXPENSE);
  const [useUnlistedVendor, setUseUnlistedVendor] = useState(!!initial?.unlisted_vendor_name);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMode, setPaymentMode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleUnlistedVendor(value: boolean) {
    setUseUnlistedVendor(value);
    if (value) set('vendor', null);
    else set('unlisted_vendor_name', '');
  }

  const alreadyPaid = initial?.is_paid === true;
  const hasPayee = !!form.vendor || !!form.unlisted_vendor_name;
  const willMarkPaid = markAsPaid && !alreadyPaid && hasPayee;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (willMarkPaid && !paymentMode) {
      setError('Select how this was paid.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await updateExpense(initial.id, form) : await createExpense(form);
      if (willMarkPaid) {
        await markExpensePaid(saved.id, paymentMode);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" value={form.vehicle ?? ''} onChange={(e) => set('vehicle', e.target.value || null)}>
              <option value="">Company (not vehicle-specific)</option>
              {vehicles
                .filter((v) => v.status === 'active' || v.status === 'in_service' || v.id === form.vehicle)
                .map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense_head">Expense head</label>
            <select id="expense_head" required value={form.expense_head} onChange={(e) => set('expense_head', e.target.value)}>
              <option value="" disabled>Select…</option>
              {EXPENSE_HEAD_GROUPS.map((group) => {
                const inGroup = heads.filter((h) => h.group === group);
                if (inGroup.length === 0) return null;
                return (
                  <optgroup key={group} label={GROUP_LABELS[group]}>
                    {inGroup.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (₹)</label>
            <input id="amount" type="number" step="0.01" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="vendor">{useUnlistedVendor ? 'Vendor (not in system)' : 'Vendor'}</label>
            {useUnlistedVendor ? (
              <input id="vendor" placeholder="e.g. Roadside Auto Spares"
                value={form.unlisted_vendor_name} onChange={(e) => set('unlisted_vendor_name', e.target.value)} />
            ) : (
              <select id="vendor" value={form.vendor ?? ''} onChange={(e) => set('vendor', e.target.value || null)}>
                <option value="">—</option>
                {vendors.filter((v) => v.status === 'active').map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            )}
            <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
              onClick={() => toggleUnlistedVendor(!useUnlistedVendor)}>
              {useUnlistedVendor ? 'Pick from vendor list instead' : 'Vendor not in the system?'}
            </button>
          </div>
          {hasPayee && (
            <>
              <div className="field">
                <label htmlFor="payment_status">Payment status</label>
                {alreadyPaid ? (
                  <div style={{ padding: '8px 0' }}><span className="pill on">Paid</span></div>
                ) : (
                  <select id="payment_status" value={markAsPaid ? 'paid' : 'pending'}
                    onChange={(e) => setMarkAsPaid(e.target.value === 'paid')}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                )}
              </div>
              {markAsPaid && !alreadyPaid && (
                <div className="field">
                  <label htmlFor="payment_mode">Payment mode</label>
                  <select id="payment_mode" required value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="" disabled>Select…</option>
                    {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="Expense" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || (willMarkPaid && !paymentMode)}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
  );

  if (bare) return body;

  return (
    <Modal title={initial ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      {body}
    </Modal>
  );
}

// The "+ Add expense" entry point for new records only (editing an existing
// Expense always goes straight to ExpenseForm - a driver salary payment was
// never an Expense row to begin with, so there's nothing to toggle mid-
// edit). Driver salary reuses DriverLedger's own form/logic wholesale
// (advance-netting, running balance) rather than reimplementing it here -
// it posts a DriverLedgerEntry, not an Expense, so it correctly counts as
// driver_cost in P&L instead of other_expenses (see economics/pnl.py).
const ADD_EXPENSE_TITLES = {
  expense: 'Add expense', driver_salary: 'Add driver salary', maintenance: 'Add maintenance expense',
} as const;

function AddExpenseModal({
  vehicles, vendors, heads, drivers, tripSheets, ledgerEntries, schedules, inventoryItems, onClose, onSaved,
}: {
  vehicles: Vehicle[]; vendors: Vendor[]; heads: ExpenseHead[];
  drivers: Driver[]; tripSheets: TripSheet[]; ledgerEntries: DriverLedgerEntry[];
  schedules: MaintenanceSchedule[]; inventoryItems: PartInventoryItem[];
  onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind] = useState<keyof typeof ADD_EXPENSE_TITLES>('expense');
  // Maintenance has no vehicle field of its own to pick from inside the
  // form (unlike a direct expense, where "Company" is a valid choice) - a
  // maintenance job is always for a specific vehicle, so that's picked here
  // first, same as the Maintenance page's own flow (VehiclePicker + this
  // same LogForm).
  const [maintenanceVehicleId, setMaintenanceVehicleId] = useState('');
  const maintenanceVehicle = vehicles.find((v) => v.id === maintenanceVehicleId);

  return (
    <Modal title={ADD_EXPENSE_TITLES[kind]} onClose={onClose}>
      <div className="toggle-group" style={{ marginBottom: 16 }}>
        <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>
          Vehicle / company expense
        </button>
        <button type="button" className={kind === 'driver_salary' ? 'on' : ''} onClick={() => setKind('driver_salary')}>
          Driver salary
        </button>
        <button type="button" className={kind === 'maintenance' ? 'on' : ''} onClick={() => setKind('maintenance')}>
          Maintenance
        </button>
      </div>

      {kind === 'expense' && (
        <ExpenseForm bare initial={null} vehicles={vehicles} vendors={vendors} heads={heads} onClose={onClose} onSaved={onSaved} />
      )}

      {kind === 'driver_salary' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14 }}>
            Recorded in the Driver Ledger, not in the expense list below — same place trip-linked wages already
            post to, so it's netted against any outstanding advance.
          </div>
          <LedgerEntryForm
            bare initial={null} presetEntryType="wage" presetSubtype="salary"
            drivers={drivers} tripSheets={tripSheets} allEntries={ledgerEntries}
            onClose={onClose} onSaved={onSaved}
          />
        </>
      )}

      {kind === 'maintenance' && (
        <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Vehicle</label>
            <div>
              <VehiclePicker vehicles={vehicles} value={maintenanceVehicleId} onChange={setMaintenanceVehicleId} />
            </div>
          </div>
          {maintenanceVehicle ? (
            <LogForm
              bare vehicle={maintenanceVehicle}
              schedules={schedules.filter((s) => s.vehicle === maintenanceVehicle.id && s.status === 'active')}
              vendors={vendors} inventoryItems={inventoryItems}
              onClose={onClose} onSaved={onSaved}
            />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Pick a vehicle to log a maintenance job for it.</div>
          )}
        </>
      )}
    </Modal>
  );
}
