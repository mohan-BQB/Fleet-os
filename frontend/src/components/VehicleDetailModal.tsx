import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from './Modal';
import SidePanel from './SidePanel';
import Timeline from './Timeline';
import ComplianceModal from './ComplianceModal';
import { usePermission } from '../context/AuthContext';
import { getVehiclePnL, listExpenseHeads, listExpenses } from '../api/economics';
import {
  createVehicleLoan, listComplianceDocuments, listDrivers, listVehicleLoans, markVehicleActive,
  markVehicleInService, markVehicleLoanInstallmentPaid, markVehicleScrapped, markVehicleSold,
  renewComplianceDocument, retireComplianceDocument,
} from '../api/fleet';
import { listMaintenanceLogs, listMaintenanceSchedules } from '../api/maintenance';
import { listFuelLogs } from '../api/operations';
import { listPartInventoryItems } from '../api/parts';
import { listTyres } from '../api/tyres';
import { listVendors } from '../api/vendors';
import { FuelLogForm } from '../pages/FuelLog';
import { LogForm } from './maintenance/LogForm';
import { ScheduleForm } from './maintenance/ScheduleForm';
import { TyreForm } from './tyres/TyreForm';
import { TyreServiceForm } from './tyres/TyreServiceForm';
import { ApiError } from '../api/client';
import type {
  ComplianceDocument, Driver, Expense, ExpenseHead, FuelLog, MaintenanceLog, MaintenanceSchedule,
  PartInventoryItem, Tyre, Vehicle, VehicleLoan, VehicleLoanInput, VehiclePnL, Vendor,
} from '../api/types';
import { VEHICLE_LOAN_PAYMENT_MODES } from '../api/types';
import {
  daysAgoIso, timelineSpendRange, todayIso, type DateRange, type TimelinePeriod,
} from '../lib/periods';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function defaultCustomRange(): DateRange {
  return { start: daysAgoIso(29), end: todayIso() };
}

const TABS = [
  { key: 'info', label: 'Vehicle info' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'loan', label: 'Loan' },
  { key: 'pnl', label: 'P&L' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface Props {
  vehicle: Vehicle;
  onClose: () => void;
  onChanged?: (updated: Vehicle) => void;
  initialTab?: TabKey;
}

export default function VehicleDetailModal({ vehicle: initialVehicle, onClose, onChanged, initialTab }: Props) {
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'info');
  const canEdit = usePermission('vehicles', 'add_edit');
  const canChangeStatus = usePermission('vehicles', 'change_status');

  const [expensePeriod, setExpensePeriod] = useState<TimelinePeriod>('month30');
  const [expenseCustomRange, setExpenseCustomRange] = useState<DateRange>(defaultCustomRange);
  const [pnl, setPnl] = useState<VehiclePnL | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);

  const [docs, setDocs] = useState<ComplianceDocument[] | null>(null);
  const [showComplianceModal, setShowComplianceModal] = useState(false);

  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[] | null>(null);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [inventoryItems, setInventoryItems] = useState<PartInventoryItem[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);

  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [showFuelForm, setShowFuelForm] = useState(false);

  const [tyres, setTyres] = useState<Tyre[] | null>(null);
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);
  const [showServiceForm, setShowServiceForm] = useState(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusForm, setStatusForm] = useState<'in_service' | 'sold' | 'scrapped' | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadFuelLogs = useCallback(() => {
    listFuelLogs()
      .then((all) => setFuelLogs(
        all.filter((f) => f.vehicle === vehicle.id).sort((a, b) => b.date.localeCompare(a.date)),
      ))
      .catch((err) => setError(err.message ?? 'Failed to load fuel log history.'));
  }, [vehicle.id]);

  const loadTyres = useCallback(() => {
    listTyres()
      .then((all) => setTyres(all.filter((t) => t.vehicle === vehicle.id)))
      .catch((err) => setError(err.message ?? 'Failed to load tyre history.'));
  }, [vehicle.id]);

  const loadCompliance = useCallback(() => {
    listComplianceDocuments()
      .then((all) => setDocs(all.filter((d) => d.vehicle === vehicle.id)))
      .catch((err) => setError(err.message ?? 'Failed to load compliance history.'));
  }, [vehicle.id]);

  const loadMaintenance = useCallback(() => {
    listMaintenanceLogs()
      .then((all) => setMaintenanceLogs(
        all.filter((l) => l.vehicle === vehicle.id).sort((a, b) => b.date.localeCompare(a.date)),
      ))
      .catch((err) => setError(err.message ?? 'Failed to load maintenance history.'));
    listMaintenanceSchedules()
      .then((all) => setSchedules(all.filter((s) => s.vehicle === vehicle.id)))
      .catch(() => {});
  }, [vehicle.id]);

  useEffect(() => {
    let cancelled = false;
    setPnl(null);
    const { start, end } = timelineSpendRange(expensePeriod, expenseCustomRange);
    getVehiclePnL(vehicle.id, start, end)
      .then((result) => {
        if (!cancelled) setPnl(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load expenses.');
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id, expensePeriod, expenseCustomRange]);

  useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  useEffect(() => {
    listExpenses()
      .then((all) => setExpenses(all.filter((e) => e.vehicle === vehicle.id)))
      .catch((err) => setError(err.message ?? 'Failed to load expense history.'));
  }, [vehicle.id]);

  useEffect(() => {
    loadMaintenance();
    loadFuelLogs();
    loadTyres();
    listVendors().then(setVendors).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
    listExpenseHeads().then(setExpenseHeads).catch(() => {});
    listPartInventoryItems().then(setInventoryItems).catch(() => {});
  }, [loadMaintenance, loadFuelLogs, loadTyres]);

  const headName = (id: string) => expenseHeads.find((h) => h.id === id)?.name ?? '—';

  const expenseHistory = useMemo(() => {
    if (!expenses) return null;
    const { start, end } = timelineSpendRange(expensePeriod, expenseCustomRange);
    return expenses
      .filter((e) => e.date >= start && e.date <= end)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, expensePeriod, expenseCustomRange]);

  const totalSpend = pnl ? pnl.fuel_cost + pnl.driver_cost + pnl.other_expenses : 0;

  const categoryBreakdown = useMemo(() => {
    const rows: { label: string; amount: number }[] = [];
    if (pnl) {
      if (pnl.fuel_cost > 0) rows.push({ label: 'Fuel', amount: pnl.fuel_cost });
      if (pnl.driver_cost > 0) rows.push({ label: 'Salary', amount: pnl.driver_cost });
    }
    if (expenseHistory) {
      const byHead = new Map<string, number>();
      for (const exp of expenseHistory) {
        byHead.set(exp.expense_head, (byHead.get(exp.expense_head) ?? 0) + Number(exp.amount));
      }
      for (const [headId, amount] of byHead) {
        const label = expenseHeads.find((h) => h.id === headId)?.name ?? '—';
        rows.push({ label, amount });
      }
    }
    return rows.sort((a, b) => b.amount - a.amount);
  }, [pnl, expenseHistory, expenseHeads]);

  async function handleRenewDoc(doc: ComplianceDocument, validTill: string) {
    await renewComplianceDocument(doc.id, { valid_till: validTill, doc_number: doc.doc_number });
    loadCompliance();
  }
  async function handleRetireDoc(doc: ComplianceDocument) {
    if (!confirm(`Retire this ${humanize(doc.doc_type)} record?`)) return;
    await retireComplianceDocument(doc.id);
    loadCompliance();
  }

  async function submitStatus(action: () => Promise<Vehicle>) {
    setStatusSaving(true);
    setStatusError(null);
    try {
      const updated = await action();
      setVehicle(updated);
      onChanged?.(updated);
      setStatusForm(null);
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Could not change status.');
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <>
      <SidePanel title={vehicle.registration_number} onClose={onClose}>
        {error && <div className="error-banner">{error}</div>}

        <div className="detail-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`detail-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <InfoTab
            vehicle={vehicle}
            canChangeStatus={canChangeStatus}
            statusForm={statusForm}
            setStatusForm={setStatusForm}
            statusSaving={statusSaving}
            statusError={statusError}
            onMarkActive={() => submitStatus(() => markVehicleActive(vehicle.id))}
            onSubmitInService={(reason) => submitStatus(() => markVehicleInService(vehicle.id, reason))}
            onSubmitSold={(soldDate, buyer, saleAmount) => submitStatus(() => markVehicleSold(vehicle.id, soldDate, buyer, saleAmount))}
            onSubmitScrapped={(scrapDate, reason) => submitStatus(() => markVehicleScrapped(vehicle.id, scrapDate, reason))}
          />
        )}

        {tab === 'tyres' && (
          <>
            <div className="table-head" style={{ padding: '0 0 12px' }}>
              <h3>Tyres <span className="n">{tyres?.length ?? '…'}</span></h3>
              {canEdit && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="link-btn" onClick={() => setShowServiceForm(true)}>Log service</button>
                  <button type="button" className="link-btn" onClick={() => { setEditingTyre(null); setShowTyreForm(true); }}>+ Add tyre</button>
                </div>
              )}
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Position</th><th>Brand</th><th>Size</th><th>Serial</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {tyres?.map((tyre) => (
                    <tr key={tyre.id}>
                      <td data-label="Position">{humanize(tyre.position)}</td>
                      <td data-label="Brand">{tyre.brand || '—'}</td>
                      <td data-label="Size">{tyre.size || '—'}</td>
                      <td data-label="Serial">{tyre.serial_number || '—'}</td>
                      <td data-label="Status"><span className={`pill ${tyre.status === 'fitted' ? 'on' : tyre.status === 'spare' ? 'svc' : 'off'}`}>{humanize(tyre.status)}</span></td>
                      <td data-label="">
                        {canEdit && tyre.status !== 'retired' && (
                          <button className="link-btn" onClick={() => { setEditingTyre(tyre); setShowTyreForm(true); }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tyres && tyres.length === 0 && <div className="empty-state">No tyres recorded yet.</div>}
            </div>
          </>
        )}

        {tab === 'compliance' && (
          <>
            <div className="table-head" style={{ padding: '0 0 12px' }}>
              <h3>Documents <span className="n">{docs?.length ?? '…'}</span></h3>
              {canEdit && <button type="button" className="link-btn" onClick={() => setShowComplianceModal(true)}>+ Add document</button>}
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Document</th><th>Number</th><th>Valid till</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {docs?.filter((d) => d.status !== 'archived').map((doc) => (
                    <ComplianceRow
                      key={doc.id}
                      doc={doc}
                      canEdit={canEdit}
                      onRenew={(validTill) => handleRenewDoc(doc, validTill)}
                      onRetire={() => handleRetireDoc(doc)}
                    />
                  ))}
                </tbody>
              </table>
              {docs && docs.filter((d) => d.status !== 'archived').length === 0 && (
                <div className="empty-state">No compliance documents yet.</div>
              )}
            </div>
          </>
        )}

        {tab === 'maintenance' && (
          <>
            <div className="table-head" style={{ padding: '0 0 12px' }}>
              <h3>Schedules <span className="n">{schedules.length}</span></h3>
              {canEdit && <button type="button" className="link-btn" onClick={() => { setEditingSchedule(null); setShowScheduleForm(true); }}>+ Add schedule</button>}
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Part</th><th>Interval</th><th>Last done</th><th></th></tr></thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Part">{s.part_name}</td>
                      <td data-label="Interval">{[s.interval_km ? `${s.interval_km} km` : null, s.interval_days ? `${s.interval_days} days` : null].filter(Boolean).join(' / ') || '—'}</td>
                      <td data-label="Last done">{s.last_done_date ? DATE_FMT.format(new Date(s.last_done_date)) : '—'}</td>
                      <td data-label="">{canEdit && <button className="link-btn" onClick={() => { setEditingSchedule(s); setShowScheduleForm(true); }}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {schedules.length === 0 && <div className="empty-state">No schedules set up yet.</div>}
            </div>

            <div className="table-head" style={{ padding: '20px 0 12px' }}>
              <h3>Service log <span className="n">{maintenanceLogs?.length ?? '…'}</span></h3>
              {canEdit && <button type="button" className="link-btn" onClick={() => setShowLogForm(true)}>+ Log service</button>}
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Date</th><th>Part</th><th>Vendor</th></tr></thead>
                <tbody>
                  {maintenanceLogs?.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(log.date))}</td>
                      <td data-label="Part">{log.part_name}</td>
                      <td data-label="Vendor">{log.vendor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {maintenanceLogs && maintenanceLogs.length === 0 && <div className="empty-state">No maintenance recorded yet.</div>}
            </div>

            <div className="table-head" style={{ padding: '20px 0 12px' }}>
              <h3>Fuel log <span className="n">{fuelLogs?.length ?? '…'}</span></h3>
              {canEdit && <button type="button" className="link-btn" onClick={() => setShowFuelForm(true)}>+ Add</button>}
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Date</th><th>Litres</th><th>Amount</th></tr></thead>
                <tbody>
                  {fuelLogs?.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(log.date))}</td>
                      <td data-label="Litres" className="tnum">{Number(log.litres).toLocaleString('en-IN')}</td>
                      <td data-label="Amount" className="tnum">{CURRENCY.format(Number(log.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fuelLogs && fuelLogs.length === 0 && <div className="empty-state">No fuel logs recorded yet.</div>}
            </div>
          </>
        )}

        {tab === 'pnl' && (
          <>
            <h3 style={{ fontSize: 13.5, margin: '0 0 10px' }}>Expenses</h3>
            <Timeline
              period={expensePeriod} onPeriodChange={setExpensePeriod}
              customRange={expenseCustomRange} onCustomRangeChange={setExpenseCustomRange}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, margin: '14px 0 18px' }}>
              <div className="tile">
                <div className="tile-label">Total spend</div>
                <div className="tile-value tnum" style={{ fontSize: 24, color: 'var(--critical)' }}>
                  {pnl ? CURRENCY.format(totalSpend) : '…'}
                </div>
                <div className="tile-foot">
                  {pnl ? `${CURRENCY.format(pnl.fuel_cost)} fuel · ${CURRENCY.format(pnl.driver_cost)} driver · ${CURRENCY.format(pnl.other_expenses)} other` : ''}
                </div>
              </div>
              <div className="tile">
                <div className="tile-label">Net profit</div>
                <div className="tile-value tnum" style={{ fontSize: 24, color: pnl && pnl.net_profit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                  {pnl ? CURRENCY.format(pnl.net_profit) : '…'}
                </div>
                <div className="tile-foot">{pnl ? `${CURRENCY.format(pnl.revenue)} revenue` : ''}</div>
              </div>
            </div>

            {categoryBreakdown.length > 0 && (
              <>
                <h3 style={{ fontSize: 13.5, margin: '0 0 10px' }}>By head</h3>
                <div style={{ marginBottom: 18 }}>
                  {categoryBreakdown.map((row) => {
                    const pct = totalSpend > 0 ? Math.round((row.amount / totalSpend) * 100) : 0;
                    return (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '5px 0' }}>
                        <span style={{ width: 110, flex: 'none', color: 'var(--ink-soft)' }}>{row.label}</span>
                        <span style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--ring-track)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 999 }} />
                        </span>
                        <span className="tnum" style={{ width: 90, textAlign: 'right', fontWeight: 600 }}>{CURRENCY.format(row.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <h3 style={{ fontSize: 13.5, margin: '0 0 10px' }}>Expense history</h3>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Date</th><th>Head</th><th>Vendor</th><th>Amount</th></tr></thead>
                <tbody>
                  {expenseHistory?.map((exp) => (
                    <tr key={exp.id}>
                      <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(exp.date))}</td>
                      <td data-label="Head">{headName(exp.expense_head)}</td>
                      <td data-label="Vendor">{exp.vendor || '—'}</td>
                      <td data-label="Amount" className="tnum">{CURRENCY.format(Number(exp.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenseHistory && expenseHistory.length === 0 && <div className="empty-state">No expenses in this window.</div>}
            </div>
          </>
        )}

        {tab === 'loan' && <VehicleLoanTab vehicleId={vehicle.id} canEdit={canEdit} canChangeStatus={canChangeStatus} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </SidePanel>

      {showFuelForm && (
        <FuelLogForm
          initial={null}
          vehicles={[vehicle]}
          drivers={drivers}
          vendors={vendors}
          logs={fuelLogs ?? []}
          presetVehicle={vehicle}
          onClose={() => setShowFuelForm(false)}
          onSaved={() => { setShowFuelForm(false); loadFuelLogs(); }}
        />
      )}
      {showTyreForm && (
        <TyreForm
          initial={editingTyre}
          vehicle={vehicle}
          prefillPosition={null}
          existingPositions={(tyres ?? []).map((t) => t.position)}
          onClose={() => setShowTyreForm(false)}
          onSaved={() => { setShowTyreForm(false); loadTyres(); }}
        />
      )}
      {showServiceForm && (
        <TyreServiceForm
          vehicle={vehicle}
          tyres={tyres ?? []}
          vendors={vendors}
          onClose={() => setShowServiceForm(false)}
          onSaved={() => { setShowServiceForm(false); loadTyres(); }}
        />
      )}
      {showComplianceModal && (
        <ComplianceModal
          holderType="vehicle"
          holderId={vehicle.id}
          holderLabel={vehicle.registration_number}
          docTypes={['rc', 'insurance', 'permit', 'national_permit', 'fitness', 'puc', 'road_tax', 'other']}
          onClose={() => { setShowComplianceModal(false); loadCompliance(); }}
        />
      )}
      {showScheduleForm && (
        <ScheduleForm
          initial={editingSchedule}
          vehicle={vehicle}
          onClose={() => setShowScheduleForm(false)}
          onSaved={() => { setShowScheduleForm(false); loadMaintenance(); }}
        />
      )}
      {showLogForm && (
        <LogForm
          vehicle={vehicle}
          schedules={schedules}
          vendors={vendors}
          inventoryItems={inventoryItems}
          onClose={() => setShowLogForm(false)}
          onSaved={() => { setShowLogForm(false); loadMaintenance(); }}
        />
      )}
    </>
  );
}

function ComplianceRow({
  doc, canEdit, onRenew, onRetire,
}: { doc: ComplianceDocument; canEdit: boolean; onRenew: (validTill: string) => Promise<void>; onRetire: () => void }) {
  const [renewing, setRenewing] = useState(false);
  const [validTill, setValidTill] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleRenew() {
    if (!validTill) return;
    setSaving(true);
    try {
      await onRenew(validTill);
      setRenewing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr>
        <td data-label="Document">{humanize(doc.doc_type)}</td>
        <td data-label="Number">{doc.doc_number || '—'}</td>
        <td data-label="Valid till" className="tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</td>
        <td data-label="Status">
          {doc.is_expired ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
            : doc.is_due ? <span className="pill svc">Due soon</span>
            : <span className="pill on">Valid</span>}
        </td>
        <td data-label="">
          {canEdit && (
            <div className="row-actions">
              <button className="link-btn" onClick={() => setRenewing((r) => !r)}>Renew</button>
              <button className="link-btn danger" onClick={onRetire}>Retire</button>
            </div>
          )}
        </td>
      </tr>
      {renewing && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--paper)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <span style={{ fontSize: 12.5 }}>New valid till</span>
              <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
              <button type="button" className="btn primary" disabled={saving || !validTill} onClick={handleRenew} style={{ padding: '6px 12px', fontSize: 12.5 }}>
                {saving ? 'Renewing…' : 'Confirm renew'}
              </button>
              <button type="button" className="btn" onClick={() => setRenewing(false)} style={{ padding: '6px 12px', fontSize: 12.5 }}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function VehicleLoanTab({
  vehicleId, canEdit, canChangeStatus,
}: { vehicleId: string; canEdit: boolean; canChangeStatus: boolean }) {
  const [loans, setLoans] = useState<VehicleLoan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    listVehicleLoans()
      .then((all) => setLoans(all.filter((l) => l.vehicle === vehicleId)))
      .catch((err) => setError(err.message ?? 'Failed to load loan history.'));
  }

  useEffect(load, [vehicleId]);

  async function handleMarkPaid(installmentId: string) {
    if (!paymentMode) return;
    setSaving(true);
    try {
      await markVehicleLoanInstallmentPaid(installmentId, paidDate, paymentMode);
      setPayingId(null);
      setPaymentMode('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="table-head" style={{ padding: '0 0 12px' }}>
        <h3>Loan <span className="n">{loans?.length ?? '…'}</span></h3>
        {canEdit && <button type="button" className="link-btn" onClick={() => setShowForm(true)}>+ Add loan</button>}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loans && loans.length === 0 && <div className="empty-state">No loan recorded — this vehicle wasn't financed, or the loan hasn't been entered yet.</div>}

      {loans?.map((loan) => (
        <div key={loan.id} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>{loan.financier}</strong> &middot; {CURRENCY.format(Number(loan.principal_amount))} principal
            {loan.interest_rate && <> &middot; {Number(loan.interest_rate).toFixed(2)}% p.a.</>}
            &middot; {CURRENCY.format(Number(loan.emi_amount))}/mo &middot; {loan.tenure_months} months from {DATE_FMT.format(new Date(loan.start_date))}
            &middot; {loan.outstanding_installments} installment{loan.outstanding_installments === 1 ? '' : 's'} outstanding
          </div>
          <div className="table-scroll responsive">
            <table>
              <thead><tr><th>Due date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {loan.installments.map((inst) => (
                  <Fragment key={inst.id}>
                    <tr>
                      <td data-label="Due date" className="tnum">{DATE_FMT.format(new Date(inst.due_date))}</td>
                      <td data-label="Amount" className="tnum">{CURRENCY.format(Number(inst.amount))}</td>
                      <td data-label="Status">
                        {inst.paid
                          ? <span className="pill on">Paid{inst.paid_date ? ` · ${DATE_FMT.format(new Date(inst.paid_date))}` : ''}</span>
                          : inst.is_overdue
                            ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                            : <span className="pill svc">Upcoming</span>}
                      </td>
                      <td data-label="">
                        {canChangeStatus && !inst.paid && (
                          <button className="link-btn" onClick={() => setPayingId(payingId === inst.id ? null : inst.id)}>
                            Mark paid
                          </button>
                        )}
                      </td>
                    </tr>
                    {payingId === inst.id && (
                      <tr>
                        <td colSpan={4} style={{ background: 'var(--paper)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}>
                            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
                            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                              <option value="" disabled>Payment mode…</option>
                              {VEHICLE_LOAN_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                            </select>
                            <button type="button" className="btn primary" disabled={saving || !paymentMode}
                              onClick={() => handleMarkPaid(inst.id)} style={{ padding: '6px 12px', fontSize: 12.5 }}>
                              {saving ? 'Saving…' : 'Confirm paid'}
                            </button>
                            <button type="button" className="btn" onClick={() => setPayingId(null)} style={{ padding: '6px 12px', fontSize: 12.5 }}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {showForm && (
        <VehicleLoanForm
          vehicleId={vehicleId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function VehicleLoanForm({
  vehicleId, onClose, onSaved,
}: { vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VehicleLoanInput>({
    vehicle: vehicleId, financier: '', principal_amount: '', interest_rate: null, tenure_months: 12,
    emi_amount: '', start_date: todayIso(), notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof VehicleLoanInput>(key: K, value: VehicleLoanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createVehicleLoan(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save loan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add loan" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="financier">Financier</label>
            <input id="financier" required value={form.financier} onChange={(e) => set('financier', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="principal_amount">Principal amount (₹)</label>
            <input id="principal_amount" type="number" step="0.01" required value={form.principal_amount}
              onChange={(e) => set('principal_amount', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="interest_rate">Interest rate (% p.a.)</label>
            <input id="interest_rate" type="number" step="0.01" value={form.interest_rate ?? ''}
              onChange={(e) => set('interest_rate', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="emi_amount">EMI amount (₹/mo)</label>
            <input id="emi_amount" type="number" step="0.01" required value={form.emi_amount}
              onChange={(e) => set('emi_amount', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tenure_months">Tenure (months)</label>
            <input id="tenure_months" type="number" min={1} required value={form.tenure_months}
              onChange={(e) => set('tenure_months', Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="start_date">First EMI date</label>
            <input id="start_date" type="date" required value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Add loan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InfoTab({
  vehicle, canChangeStatus, statusForm, setStatusForm, statusSaving, statusError,
  onMarkActive, onSubmitInService, onSubmitSold, onSubmitScrapped,
}: {
  vehicle: Vehicle;
  canChangeStatus: boolean;
  statusForm: 'in_service' | 'sold' | 'scrapped' | null;
  setStatusForm: (v: 'in_service' | 'sold' | 'scrapped' | null) => void;
  statusSaving: boolean;
  statusError: string | null;
  onMarkActive: () => void;
  onSubmitInService: (reason: string) => void;
  onSubmitSold: (soldDate: string, buyer: string, saleAmount: string) => void;
  onSubmitScrapped: (scrapDate: string, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [soldDate, setSoldDate] = useState(todayIso());
  const [buyer, setBuyer] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [scrapDate, setScrapDate] = useState(todayIso());

  const statusPillClass = vehicle.status === 'active' ? 'on' : vehicle.status === 'in_service' ? 'svc' : 'off';

  return (
    <>
      <div className="status-actions">
        <span className={`pill ${statusPillClass}`}>{humanize(vehicle.status)}</span>
        {canChangeStatus && vehicle.status !== 'sold' && vehicle.status !== 'scrapped' && (
          <>
            {vehicle.status !== 'active' && (
              <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={onMarkActive}>Active</button>
            )}
            {vehicle.status !== 'in_service' && (
              <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setStatusForm('in_service')}>In service</button>
            )}
            <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setStatusForm('sold')}>Mark sold</button>
            <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setStatusForm('scrapped')}>Mark scrapped</button>
          </>
        )}
      </div>

      {statusForm === 'in_service' && (
        <div className="table-card" style={{ padding: 14, marginBottom: 18 }}>
          <div className="form-grid">
            <div className="field span-2">
              <label>Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. workshop for gearbox repair" />
            </div>
          </div>
          {statusError && <div className="form-error">{statusError}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setStatusForm(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={statusSaving} onClick={() => onSubmitInService(reason)}>
              {statusSaving ? 'Saving…' : 'Confirm — In service'}
            </button>
          </div>
        </div>
      )}
      {statusForm === 'sold' && (
        <div className="table-card" style={{ padding: 14, marginBottom: 18 }}>
          <div className="form-grid">
            <div className="field">
              <label>Sold date</label>
              <input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Sold to (buyer)</label>
              <input value={buyer} onChange={(e) => setBuyer(e.target.value)} />
            </div>
            <div className="field">
              <label>Sale amount (₹)</label>
              <input type="number" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} />
            </div>
          </div>
          {statusError && <div className="form-error">{statusError}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setStatusForm(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={statusSaving} onClick={() => onSubmitSold(soldDate, buyer, saleAmount)}>
              {statusSaving ? 'Saving…' : 'Confirm — Sold'}
            </button>
          </div>
        </div>
      )}
      {statusForm === 'scrapped' && (
        <div className="table-card" style={{ padding: 14, marginBottom: 18 }}>
          <div className="form-grid">
            <div className="field">
              <label>Scrap date</label>
              <input type="date" value={scrapDate} onChange={(e) => setScrapDate(e.target.value)} />
            </div>
            <div className="field span-2">
              <label>Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. total loss, chassis damage" />
            </div>
          </div>
          {statusError && <div className="form-error">{statusError}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setStatusForm(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={statusSaving} onClick={() => onSubmitScrapped(scrapDate, reason)}>
              {statusSaving ? 'Saving…' : 'Confirm — Scrapped'}
            </button>
          </div>
        </div>
      )}

      <div className="info-section-title">Registration</div>
      <div className="info-grid">
        <div className="info-item"><span className="l">RC number</span><span className="v">{vehicle.registration_number}</span></div>
        <div className="info-item"><span className="l">RTO</span><span className="v">{vehicle.rto || '—'}</span></div>
        <div className="info-item"><span className="l">Chassis no.</span><span className="v">{vehicle.chassis_number || '—'}</span></div>
        <div className="info-item"><span className="l">Engine no.</span><span className="v">{vehicle.engine_number || '—'}</span></div>
        <div className="info-item"><span className="l">RC valid till</span><span className="v">{vehicle.rc_valid_till ? DATE_FMT.format(new Date(vehicle.rc_valid_till)) : '—'}</span></div>
        <div className="info-item"><span className="l">Fuel norm</span><span className="v">{vehicle.fuel_norm || '—'}</span></div>
      </div>

      <div className="info-section-title">Classification</div>
      <div className="info-grid">
        <div className="info-item"><span className="l">Category</span><span className="v">{humanize(vehicle.category)} ({vehicle.metering_unit})</span></div>
        <div className="info-item"><span className="l">Maker / model</span><span className="v">{[vehicle.maker, vehicle.model].filter(Boolean).join(' ') || '—'}</span></div>
        <div className="info-item"><span className="l">Mfg year</span><span className="v">{vehicle.mfg_year ?? '—'}</span></div>
        <div className="info-item"><span className="l">Fuel type</span><span className="v">{vehicle.fuel_type ? humanize(vehicle.fuel_type) : '—'}</span></div>
        <div className="info-item"><span className="l">GVW</span><span className="v">{vehicle.gvw ?? '—'}</span></div>
        <div className="info-item"><span className="l">Colour</span><span className="v">{vehicle.colour || '—'}</span></div>
      </div>

      <div className="info-section-title">Ownership</div>
      <div className="info-grid">
        <div className="info-item"><span className="l">Owner</span><span className="v">{vehicle.owner_name || '—'}</span></div>
        <div className="info-item"><span className="l">Financier</span><span className="v">{vehicle.financier || '—'}</span></div>
        <div className="info-item"><span className="l">Acquisition</span><span className="v">{humanize(vehicle.acquisition_type)}</span></div>
        <div className="info-item"><span className="l">Purchase date</span><span className="v">{vehicle.purchase_date ? DATE_FMT.format(new Date(vehicle.purchase_date)) : '—'}</span></div>
      </div>

      <div className="info-section-title">Wheel configuration</div>
      <div className="info-grid">
        <div className="info-item"><span className="l">Tyres</span><span className="v">{vehicle.number_of_tyres} + {vehicle.spare_tyres} spare</span></div>
        <div className="info-item"><span className="l">Axle layout</span><span className="v">{vehicle.axle_layout ? humanize(vehicle.axle_layout) : '—'}</span></div>
      </div>

      <div className="info-section-title">Operational</div>
      <div className="info-grid">
        <div className="info-item"><span className="l">Fleet ID</span><span className="v">{vehicle.fleet_id || '—'}</span></div>
        <div className="info-item"><span className="l">Current meter</span><span className="v">{vehicle.current_meter ? Number(vehicle.current_meter).toLocaleString('en-IN') : '—'} {vehicle.metering_unit}</span></div>
        <div className="info-item"><span className="l">Usage</span><span className="v">{humanize(vehicle.usage)}</span></div>
        <div className="info-item"><span className="l">Tracking mode</span><span className="v">{vehicle.tracking_mode === 'gps' ? 'GPS' : 'Manual'}</span></div>
      </div>
    </>
  );
}
