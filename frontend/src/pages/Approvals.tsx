import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApprovalDecisionModal } from '../components/ApprovalDecisionModal';
import { usePermission } from '../context/AuthContext';
import { listVehicles, listDrivers, listComplianceDocuments } from '../api/fleet';
import { listVendors } from '../api/vendors';
import {
  approveExpense, listExpenseHeads, listExpenses, rejectExpense,
} from '../api/economics';
import {
  approveFuelLog, listFuelLogs, listTripSheets, rejectFuelLog,
} from '../api/operations';
import {
  type ComplianceDocument, type Driver, type Expense as ExpenseRecord, type ExpenseHead, type FuelLog,
  type TripSheet, type Vehicle, type Vendor,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Every source of an approval-gated decision in the system - still not EMI
// (a payment due, not a decision) or driver-ledger wages (no approval
// concept), but compliance renewal belongs here now: it's the same shape
// of "someone has to act, or it stays stuck" as approve/reject, so leaving
// it in a separate silo meant this page (and the Dashboard tile counting
// it) could say "nothing pending" while documents sat expired - see the
// consolidation note in fleetAlerts.ts.
type ApprovalRow =
  | { kind: 'expense'; id: string; date: string; exp: ExpenseRecord }
  | { kind: 'fuel'; id: string; date: string; log: FuelLog }
  | { kind: 'trip_sheet'; id: string; date: string; ts: TripSheet }
  | { kind: 'compliance'; id: string; date: string; doc: ComplianceDocument };

const KIND_LABELS: Record<ApprovalRow['kind'], string> = {
  expense: 'Expense', fuel: 'Fuel', trip_sheet: 'Trip sheet', compliance: 'Compliance',
};

export default function Approvals() {
  const navigate = useNavigate();
  const canDecideExpense = usePermission('expenses', 'change_status');
  const canDecideFuel = usePermission('fuel_log', 'change_status');

  const [expenses, setExpenses] = useState<ExpenseRecord[] | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [tripSheets, setTripSheets] = useState<TripSheet[] | null>(null);
  const [complianceDocs, setComplianceDocs] = useState<ComplianceDocument[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [heads, setHeads] = useState<ExpenseHead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | ApprovalRow['kind']>('all');
  const [decision, setDecision] = useState<{
    kind: 'expense' | 'fuel'; id: string; mode: 'approve' | 'reject'; summary: { label: string; value: string }[];
  } | null>(null);

  function loadExpenses() {
    listExpenses().then(setExpenses).catch((err) => setError(err.message));
  }
  function loadFuelLogs() {
    listFuelLogs().then(setFuelLogs).catch((err) => setError(err.message));
  }
  function loadTripSheets() {
    listTripSheets().then(setTripSheets).catch((err) => setError(err.message));
  }
  function loadComplianceDocs() {
    listComplianceDocuments().then(setComplianceDocs).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadExpenses();
    loadFuelLogs();
    loadTripSheets();
    loadComplianceDocs();
    listVehicles().then(setVehicles).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
    listVendors().then(setVendors).catch(() => {});
    listExpenseHeads().then(setHeads).catch(() => {});
  }, []);

  const vehicleName = (id: string | null) => (id && vehicles.find((v) => v.id === id)?.registration_number) || 'Company';
  const driverName = (id: string | null) => (id && drivers.find((d) => d.id === id)?.name) || '—';
  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || '—';
  const headName = (id: string) => heads.find((h) => h.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const all: ApprovalRow[] = [];
    for (const exp of expenses ?? []) {
      if (exp.approval_status === 'pending') all.push({ kind: 'expense', id: exp.id, date: exp.date, exp });
    }
    for (const log of fuelLogs ?? []) {
      if (log.status === 'submitted') all.push({ kind: 'fuel', id: log.id, date: log.date, log });
    }
    for (const ts of tripSheets ?? []) {
      if (ts.status === 'submitted') all.push({ kind: 'trip_sheet', id: ts.id, date: ts.date, ts });
    }
    for (const doc of complianceDocs ?? []) {
      if (doc.is_due || doc.is_expired) {
        // No "date this became urgent" field on the document itself - its
        // own expiry date is the closest analog, same as every other row
        // here sorting by the date that made it actionable.
        all.push({ kind: 'compliance', id: doc.id, date: doc.valid_till ?? '', doc });
      }
    }
    return all
      .filter((r) => kindFilter === 'all' || r.kind === kindFilter)
      // Oldest first - the longest-outstanding item is the one most worth
      // clearing, not the one most recently added to the pile.
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [expenses, fuelLogs, tripSheets, complianceDocs, kindFilter]);

  const loading = expenses === null || fuelLogs === null || tripSheets === null || complianceDocs === null;

  function expenseSummary(exp: ExpenseRecord) {
    return [
      { label: 'Vehicle', value: vehicleName(exp.vehicle) },
      { label: 'Expense head', value: headName(exp.expense_head) },
      { label: 'Amount', value: CURRENCY.format(Number(exp.amount)) },
      { label: 'Vendor', value: exp.vendor ? vendorName(exp.vendor) : exp.unlisted_vendor_name || '—' },
    ];
  }

  function fuelSummary(log: FuelLog) {
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
          <h1>Approvals</h1>
          <div className="sub">Everything across the system waiting on a decision - expenses, fuel entries, trip sheets ready for Approve &amp; Close, and compliance documents due or expired.</div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div className="seg" style={{ width: 'fit-content' }}>
          <button className={kindFilter === 'all' ? 'active' : ''} onClick={() => setKindFilter('all')}>
            All ({rows.length})
          </button>
          {(['expense', 'fuel', 'trip_sheet', 'compliance'] as const).map((k) => (
            <button key={k} className={kindFilter === k ? 'active' : ''} onClick={() => setKindFilter(k)}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <section className="table-card" style={{ marginTop: 14 }}>
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Vehicle</th><th>Description</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}:${row.id}`}>
                    <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(row.date))}</td>
                    <td data-label="Type">{KIND_LABELS[row.kind]}</td>
                    <td data-label="Vehicle" className="reg-no">
                      {row.kind === 'expense' && vehicleName(row.exp.vehicle)}
                      {row.kind === 'fuel' && vehicleName(row.log.vehicle)}
                      {row.kind === 'trip_sheet' && vehicleName(row.ts.vehicle)}
                      {row.kind === 'compliance' && row.doc.holder_display}
                    </td>
                    <td data-label="Description">
                      {row.kind === 'expense' && headName(row.exp.expense_head)}
                      {row.kind === 'fuel' && `${Number(row.log.litres).toLocaleString('en-IN')} L · ${driverName(row.log.driver)}`}
                      {row.kind === 'trip_sheet' && (
                        row.ts.card_type === 'route'
                          ? `${row.ts.legs.length} leg${row.ts.legs.length === 1 ? '' : 's'} · ${driverName(row.ts.driver)}`
                          : `${row.ts.work_items.length} work item${row.ts.work_items.length === 1 ? '' : 's'} · ${driverName(row.ts.driver)}`
                      )}
                      {row.kind === 'compliance' && (
                        `${humanize(row.doc.doc_type)}${row.doc.is_expired ? ' (expired)' : ' (due soon)'}`
                      )}
                    </td>
                    <td data-label="Amount" className="tnum">
                      {row.kind === 'expense' && CURRENCY.format(Number(row.exp.amount))}
                      {row.kind === 'fuel' && CURRENCY.format(Number(row.log.amount))}
                      {row.kind === 'trip_sheet' && CURRENCY.format(Number(row.ts.total_freight))}
                      {row.kind === 'compliance' && '—'}
                    </td>
                    <td data-label="">
                      <div className="row-actions">
                        {row.kind === 'expense' && canDecideExpense && (
                          <>
                            <button type="button" className="link-btn"
                              onClick={() => setDecision({ kind: 'expense', id: row.exp.id, mode: 'approve', summary: expenseSummary(row.exp) })}>
                              Approve
                            </button>
                            <button type="button" className="link-btn danger"
                              onClick={() => setDecision({ kind: 'expense', id: row.exp.id, mode: 'reject', summary: expenseSummary(row.exp) })}>
                              Reject
                            </button>
                          </>
                        )}
                        {row.kind === 'fuel' && canDecideFuel && (
                          <>
                            <button type="button" className="link-btn"
                              onClick={() => setDecision({ kind: 'fuel', id: row.log.id, mode: 'approve', summary: fuelSummary(row.log) })}>
                              Approve
                            </button>
                            <button type="button" className="link-btn danger"
                              onClick={() => setDecision({ kind: 'fuel', id: row.log.id, mode: 'reject', summary: fuelSummary(row.log) })}>
                              Reject
                            </button>
                          </>
                        )}
                        {row.kind === 'trip_sheet' && row.ts.can_approve_close && (
                          // Not a deep link to this exact trip sheet - TripSheets.tsx
                          // has no per-record routing today (same caveat
                          // ExpenseSourceLink documents for its own "fix at
                          // source" links). Still a real destination, not a label.
                          <button type="button" className="link-btn" onClick={() => navigate('/trip-sheets')}>
                            Review &amp; approve →
                          </button>
                        )}
                        {row.kind === 'compliance' && (
                          // Renewing needs its own doc-number/valid-till fields -
                          // doesn't fit ApprovalDecisionModal's generic shape, and
                          // Compliance.tsx already has the real renew form. Same
                          // "real destination, not inline" choice as trip sheets.
                          <button type="button" className="link-btn" onClick={() => navigate('/compliance')}>
                            Renew →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 && (
              <div className="empty-state">
                {kindFilter === 'all'
                  ? 'Nothing waiting on you right now.'
                  : `No ${KIND_LABELS[kindFilter].toLowerCase()} items waiting.`}
              </div>
            )}
          </div>
        </section>
      </main>

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
    </>
  );
}
