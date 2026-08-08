import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import AuditHistory from '../components/AuditHistory';
import { listDrivers, listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listExpenseHeads } from '../api/economics';
import { createCustomer, listCustomers } from '../api/customers';
import {
  approveCloseTripSheet, createRouteRate, createTripAdvance, createTripExpense, createTripLeg,
  createTripSheet, createWorkItem, createWorkRate, getTripSheet, listRouteRates, listTripSheets, listWorkRates,
  retireTripAdvance, retireTripExpense, retireTripSheet, retireWorkItem, submitTripSheet, updateTripHours,
  updateTripSettlement, updateTripSheetClosingMeter,
} from '../api/operations';
import { resolveRouteRate, resolveWorkRate } from '../lib/rateResolution';
import { ApiError } from '../api/client';
import {
  EXPENSE_HEAD_GROUPS, PAYMENT_MODES, TRIP_EXPENSE_PAID_FROM, TRIP_LEG_BASES, TRIP_LEG_LOAD_STATUSES,
  WORK_ITEM_BASES,
  type Customer, type Driver, type ExpenseHead, type RouteRate, type TripAdvanceInput, type TripExpenseInput,
  type TripLegInput, type TripSettlementInput, type TripSheet, type TripSheetInput, type Vehicle,
  type Vendor, type WorkItemInput, type WorkRate,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// 'draft' keeps its DB value (no migration needed) but reads as "Open"
// everywhere in the UI - the sheet stays open while the trip is happening.
// 'approved' is a legacy display value only - the merged approve_close
// action jumps straight from submitted to closed, nothing sets it anymore.
function statusLabel(status: string) {
  return status === 'draft' ? 'Open' : humanize(status);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Only open/submitted trips can still be worked on - approved (legacy),
// closed, and cancelled are terminal.
const ACTIVE_STATUSES = new Set(['draft', 'submitted']);

const BLANK: TripSheetInput = {
  vehicle: '', driver: '', date: todayIso(), opening_meter: '', remarks: '',
};

export default function TripSheets() {
  const [tripSheets, setTripSheets] = useState<TripSheet[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenseHeads, setExpenseHeads] = useState<ExpenseHead[]>([]);
  const [routeRates, setRouteRates] = useState<RouteRate[]>([]);
  const [workRates, setWorkRates] = useState<WorkRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<TripSheet | null>(null);

  function load() {
    listTripSheets().then(setTripSheets).catch((err) => setError(err.message));
  }
  function loadCustomers() {
    listCustomers().then(setCustomers).catch(() => {});
  }
  function loadRates() {
    listRouteRates().then(setRouteRates).catch(() => {});
    listWorkRates().then(setWorkRates).catch(() => {});
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
    listVendors().then(setVendors).catch(() => {});
    listExpenseHeads().then(setExpenseHeads).catch(() => {});
    loadCustomers();
    loadRates();
  }, []);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.registration_number ?? '—';
  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '—';

  async function handleRetire(ts: TripSheet) {
    if (!confirm('Cancel this trip sheet? It will be marked cancelled, not deleted.')) return;
    await retireTripSheet(ts.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Trip Sheets</h1>
          <div className="sub">{tripSheets ? `${tripSheets.length} total` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ New trip sheet</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr>
                  <th>Trip no.</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Date</th>
                  <th>Distance</th>
                  <th>Freight</th>
                  <th>Driver wage</th>
                  <th>Money box</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tripSheets?.map((ts) => (
                  <tr key={ts.id}>
                    <td data-label="Trip no." className="reg-no">{ts.trip_no || '—'}</td>
                    <td data-label="Vehicle" className="reg-no">{vehicleName(ts.vehicle)}</td>
                    <td data-label="Driver">{driverName(ts.driver)}</td>
                    <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(ts.date))}</td>
                    <td data-label="Distance" className="tnum">{ts.distance_covered ? `${Number(ts.distance_covered).toLocaleString('en-IN')} km` : '—'}</td>
                    <td data-label="Freight" className="tnum">₹{Number(ts.total_freight).toLocaleString('en-IN')}</td>
                    <td data-label="Driver wage" className="tnum">{ts.wage_amount ? `₹${Number(ts.wage_amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td data-label="Money box">
                      {Number(ts.total_advance) > 0 || ts.trip_expenses.length > 0 ? (
                        <span className={`pill ${ts.is_reconciled ? 'on' : 'svc'}`}>
                          {ts.is_reconciled ? 'Balanced' : `${CURRENCY.format(Math.abs(Number(ts.reconciliation_variance)))} unaccounted`}
                        </span>
                      ) : '—'}
                    </td>
                    <td data-label="Status">
                      <span className={`pill ${ts.status === 'approved' || ts.status === 'closed' ? 'on' : ts.status === 'cancelled' ? 'off' : 'svc'}`}>
                        {statusLabel(ts.status)}
                      </span>
                    </td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setDetail(ts)}>
                          {ACTIVE_STATUSES.has(ts.status) ? 'Manage' : 'View'}
                        </button>
                        {ts.can_cancel && (
                          <button className="link-btn danger" onClick={() => handleRetire(ts)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tripSheets && tripSheets.length === 0 && (
              <div className="empty-state">No trip sheets yet. Start one for today's run.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <TripSheetForm
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {detail && (
        <TripSheetDetail
          tripSheet={detail}
          vehicleName={vehicleName(detail.vehicle)}
          driverName={driverName(detail.driver)}
          vendors={vendors}
          customers={customers}
          expenseHeads={expenseHeads}
          onCustomerAdded={loadCustomers}
          routeRates={routeRates}
          workRates={workRates}
          onRateAdded={loadRates}
          onClose={() => setDetail(null)}
          onChanged={(updated) => { setDetail(updated); load(); }}
        />
      )}
    </>
  );
}

function TripSheetForm({
  vehicles, drivers, onClose, onSaved,
}: { vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<TripSheetInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TripSheetInput>(key: K, value: TripSheetInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectVehicle(id: string) {
    const v = vehicles.find((x) => x.id === id);
    setForm((f) => ({ ...f, vehicle: id, opening_meter: v?.current_meter ?? f.opening_meter }));
  }

  function selectDriver(id: string) {
    // Dropping a stray wage figure carried over from a previous, different
    // driver selection - a fixed-wage driver has no wage_amount field at
    // all here, so this only ever mattered for a per-trip pick.
    setForm((f) => ({ ...f, driver: id, driver_wage_amount: undefined }));
  }

  const selectedDriver = drivers.find((d) => d.id === form.driver);
  const isPerTrip = selectedDriver?.wage_basis === 'per_trip';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isPerTrip && !form.driver_wage_amount) {
      setError(`${selectedDriver?.name} is paid per trip - enter what this trip pays.`);
      return;
    }
    setSaving(true);
    try {
      await createTripSheet(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create trip sheet.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New trip sheet" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" required value={form.vehicle} onChange={(e) => selectVehicle(e.target.value)}>
              <option value="">Select a vehicle…</option>
              {vehicles.filter((v) => v.status === 'active' || v.status === 'in_service').map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number}</option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="driver">Driver</label>
            <select id="driver" required value={form.driver} onChange={(e) => selectDriver(e.target.value)}>
              <option value="">Select a driver…</option>
              {drivers.filter((d) => d.status === 'active').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="opening_meter">Opening odometer</label>
            <input id="opening_meter" type="number" step="0.1" required value={form.opening_meter}
              onChange={(e) => set('opening_meter', e.target.value)} />
          </div>
          {isPerTrip && (
            <div className="field span-2">
              <label htmlFor="driver_wage_amount">
                {selectedDriver?.name}'s wage for this trip (₹)
              </label>
              <input id="driver_wage_amount" type="number" step="0.01" required
                value={form.driver_wage_amount ?? ''} onChange={(e) => set('driver_wage_amount', e.target.value || undefined)} />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Paid per trip - there's no fixed rate on file, so it's entered fresh each time. Posts straight to the Driver Ledger.
              </div>
            </div>
          )}
          <div className="field span-2">
            <label htmlFor="remarks">Remarks</label>
            <input id="remarks" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || (isPerTrip && !form.driver_wage_amount)}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const BLANK_LEG: TripLegInput = {
  trip_sheet: '', sequence: 1, from_place: '', to_place: '', consignor: '', lr_number: '',
  load_status: '', distance_km: null, customer: null, material: '', tonnage: null, basis: '', rate: null,
  freight_amount: '0', remarks: '',
};

const BLANK_WORK_ITEM: WorkItemInput = {
  trip_sheet: '', sequence: 1, site: '', customer: null, work_type: '', basis: '', qty: null, rate: null,
  overtime_qty: null, overtime_rate: null, min_billable: null, remarks: '',
};

const BLANK_ADVANCE: TripAdvanceInput = {
  trip_sheet: '', amount: '', given_by: '', date: todayIso(), payment_mode: '', remarks: '',
};

const BLANK_EXPENSE: TripExpenseInput = {
  trip_sheet: '', expense_head: '', paid_from: 'advance', amount: '', vendor: null,
  litres: null, rate_per_litre: null, notes: '', date: todayIso(),
};

function TripSheetDetail({
  tripSheet, vehicleName, driverName, vendors, customers, expenseHeads, onCustomerAdded,
  routeRates, workRates, onRateAdded, onClose, onChanged,
}: {
  tripSheet: TripSheet; vehicleName: string; driverName: string; vendors: Vendor[]; customers: Customer[];
  expenseHeads: ExpenseHead[];
  onCustomerAdded: () => void;
  routeRates: RouteRate[]; workRates: WorkRate[]; onRateAdded: () => void;
  onClose: () => void; onChanged: (updated: TripSheet) => void;
}) {
  const isActive = ACTIVE_STATUSES.has(tripSheet.status);
  const isRoute = tripSheet.card_type === 'route';
  // Splitting the legs/work-items entry and the money box into tabs keeps
  // only one dense section on screen at a time - everything still exists,
  // it's just not all stacked into one long scroll.
  const [activeTab, setActiveTab] = useState<'trip' | 'money'>('trip');

  // Auto-chains from the last leg's destination - "A to B to C to A" only
  // ever needs the *next* place typed, not the one you're already at.
  const nextFromPlace = (legs: TripSheet['legs']) => (legs.length ? legs[legs.length - 1].to_place : '');

  const [legForm, setLegForm] = useState<TripLegInput>({
    ...BLANK_LEG, trip_sheet: tripSheet.id, sequence: tripSheet.legs.length + 1,
    from_place: nextFromPlace(tripSheet.legs),
  });
  // Quick-add: a plain text field, not a <select> - typing an existing
  // customer's name resolves to their id on submit; typing a new one
  // creates the customer first, no separate screen (see handleAddLeg/
  // handleAddWorkItem - shared between both forms since only one is
  // ever shown at once, per card_type).
  const [customerName, setCustomerName] = useState('');
  const [addingLeg, setAddingLeg] = useState(false);
  const [legError, setLegError] = useState<string | null>(null);

  const [workItemForm, setWorkItemForm] = useState<WorkItemInput>({
    ...BLANK_WORK_ITEM, trip_sheet: tripSheet.id, sequence: tripSheet.work_items.length + 1,
  });
  const [addingWorkItem, setAddingWorkItem] = useState(false);
  const [workItemError, setWorkItemError] = useState<string | null>(null);
  // Overtime/minimum-billable apply to a minority of jobs - collapsed by
  // default so the common entry only shows the 6 fields it actually needs.
  const [showWorkItemExtras, setShowWorkItemExtras] = useState(false);

  // "Remember this rate?" - set right after a leg/work item is saved with a
  // rate that isn't already on file (or differs from what's on file); the
  // form itself has already reset by then, so this carries everything
  // needed to write the RouteRate/WorkRate independently of form state.
  // Optional and per-customer only - declining just dismisses it.
  const [pendingRouteRate, setPendingRouteRate] = useState<{
    from_place: string; to_place: string; customer: string; customerLabel: string; material: string;
    basis: string; rate: string;
  } | null>(null);
  const [pendingWorkRate, setPendingWorkRate] = useState<{
    equipment: string; work_type: string; customer: string; customerLabel: string;
    basis: string; rate: string; min_billable: string | null; overtime_rate: string | null;
  } | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  // Autofill: once from/to/material and a customer name matching an
  // existing customer are present, offer a resolved rate if basis/rate are
  // still blank - still fully editable after, never overwrites a value the
  // user already typed.
  useEffect(() => {
    if (!isRoute || legForm.load_status !== 'loaded' || legForm.basis || legForm.rate) return;
    const matchedCustomer = customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    if (!legForm.from_place || !legForm.to_place) return;
    const resolved = resolveRouteRate(routeRates, {
      from_place: legForm.from_place, to_place: legForm.to_place,
      customer: matchedCustomer?.id ?? null, material: legForm.material, date: tripSheet.date,
    });
    if (resolved) {
      setLegForm((f) => ({ ...f, basis: resolved.basis as typeof f.basis, rate: resolved.rate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legForm.from_place, legForm.to_place, legForm.material, customerName]);

  useEffect(() => {
    if (isRoute || workItemForm.basis || workItemForm.rate) return;
    const matchedCustomer = customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    if (!workItemForm.work_type) return;
    const resolved = resolveWorkRate(workRates, {
      equipment: '', work_type: workItemForm.work_type,
      customer: matchedCustomer?.id ?? null, date: tripSheet.date,
    });
    if (resolved) {
      setWorkItemForm((f) => ({ ...f, basis: resolved.basis as typeof f.basis, rate: resolved.rate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workItemForm.work_type, customerName]);

  const [workingHours, setWorkingHours] = useState(tripSheet.working_hours ?? '');
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceForm, setAdvanceForm] = useState<TripAdvanceInput>({ ...BLANK_ADVANCE, trip_sheet: tripSheet.id });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState<TripExpenseInput>({ ...BLANK_EXPENSE, trip_sheet: tripSheet.id });
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  // Vendor/notes apply to a minority of entries - collapsed by default so a
  // quick fuel/toll/food entry only shows the 4 fields it actually needs.
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);

  const isFuelHead = (headId: string) => expenseHeads.find((h) => h.id === headId)?.slug === 'fuel';

  // Fuel needs litres + rate/litre so it can post a real Fuel Log entry
  // (see operations.services.sync_trip_expense_posting) - amount keeps
  // auto-computing from the two as long as the user hasn't typed over it.
  function setExpenseLitres(value: string | null) {
    setExpenseForm((f) => {
      const next = { ...f, litres: value };
      if (isFuelHead(f.expense_head) && value && f.rate_per_litre) {
        next.amount = (Number(value) * Number(f.rate_per_litre)).toFixed(2);
      }
      return next;
    });
  }
  function setExpenseRatePerLitre(value: string | null) {
    setExpenseForm((f) => {
      const next = { ...f, rate_per_litre: value };
      if (isFuelHead(f.expense_head) && value && f.litres) {
        next.amount = (Number(f.litres) * Number(value)).toFixed(2);
      }
      return next;
    });
  }

  const [settlement, setSettlement] = useState<TripSettlementInput>({
    returned_amount: tripSheet.returned_amount, returned_received_by: tripSheet.returned_received_by,
    returned_date: tripSheet.returned_date ?? todayIso(),
    reimbursed_amount: tripSheet.reimbursed_amount, reimbursed_date: tripSheet.reimbursed_date ?? todayIso(),
  });
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  const [overrideReason, setOverrideReason] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Optional at Submit - a trip can be handed off mid-day before the day's
  // final reading is known. Required at Approve & Close instead (see
  // TripSheetViewSet.approve_close), so this input is shown - and can still
  // be filled in - on both the Open and Submitted stages below.
  const [closingMeter, setClosingMeter] = useState(tripSheet.closing_meter ?? '');
  const [savingClosingMeter, setSavingClosingMeter] = useState(false);
  const [closingMeterError, setClosingMeterError] = useState<string | null>(null);

  async function refresh() {
    const updated = await getTripSheet(tripSheet.id);
    onChanged(updated);
  }

  function setLeg<K extends keyof TripLegInput>(key: K, value: TripLegInput[K]) {
    setLegForm((f) => ({ ...f, [key]: value }));
  }

  function setWorkItem<K extends keyof WorkItemInput>(key: K, value: WorkItemInput[K]) {
    setWorkItemForm((f) => ({ ...f, [key]: value }));
  }

  // Quick-add: resolves a typed name to an existing customer, or creates one
  // - shared by both the leg form and the work-item form.
  async function resolveCustomerId(name: string): Promise<string> {
    const existing = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await createCustomer({
      name, gstin: '', contact_person: '', mobile: '', email: '', address: '', notes: '',
    });
    onCustomerAdded();
    return created.id;
  }

  async function handleAddLeg(e: FormEvent) {
    e.preventDefault();
    setAddingLeg(true);
    setLegError(null);
    try {
      let payload = legForm;
      let customerId: string | null = null;
      const name = customerName.trim();
      if (isRoute && legForm.load_status === 'loaded') {
        if (!name) {
          setLegError('Enter who this leg is billed to.');
          setAddingLeg(false);
          return;
        }
        customerId = await resolveCustomerId(name);
        payload = { ...legForm, customer: customerId };
      }
      await createTripLeg(payload);
      const updated = await getTripSheet(tripSheet.id);
      onChanged(updated);

      // Offer to remember this rate if it isn't already what's on file.
      if (customerId && legForm.basis && legForm.rate) {
        const resolved = resolveRouteRate(routeRates, {
          from_place: legForm.from_place, to_place: legForm.to_place, customer: customerId,
          material: legForm.material, date: tripSheet.date,
        });
        if (!resolved || resolved.basis !== legForm.basis || resolved.rate !== legForm.rate) {
          setPendingRouteRate({
            from_place: legForm.from_place, to_place: legForm.to_place, customer: customerId,
            customerLabel: name, material: legForm.material, basis: legForm.basis, rate: legForm.rate,
          });
        }
      }

      setLegForm({
        ...BLANK_LEG, trip_sheet: tripSheet.id, sequence: updated.legs.length + 1,
        from_place: nextFromPlace(updated.legs),
      });
      setCustomerName('');
    } catch (err) {
      setLegError(err instanceof ApiError ? err.message : 'Could not add leg.');
    } finally {
      setAddingLeg(false);
    }
  }

  async function handleAddWorkItem(e: FormEvent) {
    e.preventDefault();
    const name = customerName.trim();
    if (!name) {
      setWorkItemError('Enter who this work is billed to.');
      return;
    }
    setAddingWorkItem(true);
    setWorkItemError(null);
    try {
      const customerId = await resolveCustomerId(name);
      const payload = { ...workItemForm, customer: customerId };
      await createWorkItem(payload);
      const updated = await getTripSheet(tripSheet.id);
      onChanged(updated);

      if (workItemForm.basis && workItemForm.rate) {
        const resolved = resolveWorkRate(workRates, {
          equipment: '', work_type: workItemForm.work_type, customer: customerId, date: tripSheet.date,
        });
        if (!resolved || resolved.basis !== workItemForm.basis || resolved.rate !== workItemForm.rate) {
          setPendingWorkRate({
            equipment: '', work_type: workItemForm.work_type, customer: customerId, customerLabel: name,
            basis: workItemForm.basis, rate: workItemForm.rate,
            min_billable: workItemForm.min_billable, overtime_rate: workItemForm.overtime_rate,
          });
        }
      }

      setWorkItemForm({ ...BLANK_WORK_ITEM, trip_sheet: tripSheet.id, sequence: updated.work_items.length + 1 });
      setCustomerName('');
      setShowWorkItemExtras(false);
    } catch (err) {
      setWorkItemError(err instanceof ApiError ? err.message : 'Could not add work item.');
    } finally {
      setAddingWorkItem(false);
    }
  }

  async function handleSaveRouteRate() {
    if (!pendingRouteRate) return;
    setSavingRate(true);
    try {
      await createRouteRate({
        from_place: pendingRouteRate.from_place, to_place: pendingRouteRate.to_place,
        customer: pendingRouteRate.customer, material: pendingRouteRate.material,
        basis: pendingRouteRate.basis as (typeof TRIP_LEG_BASES)[number], rate: pendingRouteRate.rate,
        load_pattern: '', effective_date: tripSheet.date,
      });
      onRateAdded();
      setPendingRouteRate(null);
    } finally {
      setSavingRate(false);
    }
  }

  async function handleSaveWorkRate() {
    if (!pendingWorkRate) return;
    setSavingRate(true);
    try {
      await createWorkRate({
        equipment: pendingWorkRate.equipment, work_type: pendingWorkRate.work_type,
        customer: pendingWorkRate.customer, basis: pendingWorkRate.basis as (typeof WORK_ITEM_BASES)[number],
        rate: pendingWorkRate.rate, min_billable: pendingWorkRate.min_billable,
        overtime_rate: pendingWorkRate.overtime_rate, effective_date: tripSheet.date,
      });
      onRateAdded();
      setPendingWorkRate(null);
    } finally {
      setSavingRate(false);
    }
  }

  async function handleRemoveWorkItem(id: string) {
    if (!confirm('Remove this work item? It will be retired, not deleted.')) return;
    await retireWorkItem(id);
    await refresh();
  }

  async function handleSaveHours(e: FormEvent) {
    e.preventDefault();
    setSavingHours(true);
    setHoursError(null);
    try {
      const updated = await updateTripHours(tripSheet.id, { working_hours: workingHours || null });
      onChanged(updated);
    } catch (err) {
      setHoursError(err instanceof ApiError ? err.message : 'Could not save hours.');
    } finally {
      setSavingHours(false);
    }
  }

  async function handleAddAdvance(e: FormEvent) {
    e.preventDefault();
    setSavingAdvance(true);
    setAdvanceError(null);
    try {
      await createTripAdvance(advanceForm);
      await refresh();
      setAdvanceForm({ ...BLANK_ADVANCE, trip_sheet: tripSheet.id });
      setShowAdvanceForm(false);
    } catch (err) {
      setAdvanceError(err instanceof ApiError ? err.message : 'Could not add advance.');
    } finally {
      setSavingAdvance(false);
    }
  }

  async function handleRemoveAdvance(id: string) {
    if (!confirm('Remove this advance? It will be retired, not deleted.')) return;
    await retireTripAdvance(id);
    await refresh();
  }

  async function handleAddExpense(e: FormEvent) {
    e.preventDefault();
    setSavingExpense(true);
    setExpenseError(null);
    try {
      await createTripExpense(expenseForm);
      await refresh();
      setExpenseForm({ ...BLANK_EXPENSE, trip_sheet: tripSheet.id });
      setShowExpenseForm(false);
      setShowExpenseDetails(false);
    } catch (err) {
      setExpenseError(err instanceof ApiError ? err.message : 'Could not add expense.');
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleRemoveExpense(id: string) {
    if (!confirm('Remove this expense? It will be retired, not deleted.')) return;
    await retireTripExpense(id);
    await refresh();
  }

  async function handleSaveSettlement(e: FormEvent) {
    e.preventDefault();
    setSavingSettlement(true);
    setSettlementError(null);
    try {
      await updateTripSettlement(tripSheet.id, settlement);
      await refresh();
    } catch (err) {
      setSettlementError(err instanceof ApiError ? err.message : 'Could not save settlement.');
    } finally {
      setSavingSettlement(false);
    }
  }

  async function handleSaveClosingMeter() {
    setSavingClosingMeter(true);
    setClosingMeterError(null);
    try {
      const updated = await updateTripSheetClosingMeter(tripSheet.id, closingMeter);
      onChanged(updated);
    } catch (err) {
      setClosingMeterError(err instanceof ApiError ? err.message : 'Could not save closing odometer.');
    } finally {
      setSavingClosingMeter(false);
    }
  }

  async function handleSubmitTrip() {
    setWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const updated = await submitTripSheet(tripSheet.id);
      onChanged(updated);
    } catch (err) {
      setWorkflowError(err instanceof ApiError ? err.message : 'Could not submit trip sheet.');
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function handleApproveClose() {
    if (!tripSheet.is_reconciled && !overrideReason) {
      setWorkflowError('Enter a reason to override an unbalanced trip.');
      return;
    }
    setWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const updated = await approveCloseTripSheet(tripSheet.id, overrideReason || undefined);
      onChanged(updated);
    } catch (err) {
      setWorkflowError(err instanceof ApiError ? err.message : 'Could not approve & close trip sheet.');
    } finally {
      setWorkflowBusy(false);
    }
  }

  const showReimbursement = Number(tripSheet.driver_own_expenses_total) > 0;

  // Client-side mirror of TripLeg.save()'s formula, for a live preview only
  // - the backend is still the source of truth for what actually gets saved.
  const previewFreight = (() => {
    if (!isRoute || legForm.load_status !== 'loaded' || !legForm.basis || !legForm.rate) return null;
    const rate = Number(legForm.rate);
    if (legForm.basis === 'per_km' && legForm.distance_km) return rate * Number(legForm.distance_km);
    if (legForm.basis === 'per_ton' && legForm.tonnage) return rate * Number(legForm.tonnage);
    if (legForm.basis === 'per_km' || legForm.basis === 'per_ton') return null;
    return rate;
  })();

  // Whether the current basis/rate matches a rate card on file - purely a
  // display hint, doesn't affect what gets saved (the leg always stores
  // its own snapshot regardless).
  const legRateFromCard = (() => {
    if (!legForm.from_place || !legForm.to_place || !legForm.basis || !legForm.rate) return false;
    const matchedCustomer = customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    const resolved = resolveRouteRate(routeRates, {
      from_place: legForm.from_place, to_place: legForm.to_place, customer: matchedCustomer?.id ?? null,
      material: legForm.material, date: tripSheet.date,
    });
    return !!resolved && resolved.basis === legForm.basis && resolved.rate === legForm.rate;
  })();

  // Client-side mirror of WorkItem.save()'s formula, for a live preview only.
  const previewWorkAmount = (() => {
    if (!workItemForm.qty || !workItemForm.rate) return null;
    const qty = Number(workItemForm.qty);
    const rate = Number(workItemForm.rate);
    const overtimeQty = workItemForm.overtime_qty ? Number(workItemForm.overtime_qty) : 0;
    const overtimeRate = workItemForm.overtime_rate ? Number(workItemForm.overtime_rate) : 0;
    let amount = (qty - overtimeQty) * rate + overtimeQty * overtimeRate;
    if (workItemForm.min_billable && amount < Number(workItemForm.min_billable)) amount = Number(workItemForm.min_billable);
    return amount;
  })();

  const workRateFromCard = (() => {
    if (!workItemForm.work_type || !workItemForm.basis || !workItemForm.rate) return false;
    const matchedCustomer = customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    const resolved = resolveWorkRate(workRates, {
      equipment: '', work_type: workItemForm.work_type, customer: matchedCustomer?.id ?? null, date: tripSheet.date,
    });
    return !!resolved && resolved.basis === workItemForm.basis && resolved.rate === workItemForm.rate;
  })();

  const customerName_ = (id: string | null) => (id && customers.find((c) => c.id === id)?.name) || '—';

  return (
    <Modal title={tripSheet.trip_no ? `${tripSheet.trip_no} · ${vehicleName}` : vehicleName} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
        {DATE_FMT.format(new Date(tripSheet.date))} &middot; Driver: {driverName} &middot; {humanize(tripSheet.card_type)} card &middot; Status: {statusLabel(tripSheet.status)}
        {tripSheet.closing_meter && <> &middot; {Number(tripSheet.distance_covered).toLocaleString('en-IN')} km covered</>}
        {tripSheet.wage_amount && <> &middot; Driver wage: ₹{Number(tripSheet.wage_amount).toLocaleString('en-IN')}</>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
        Created {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(tripSheet.created_at))} — cannot be edited
      </div>
      {isRoute && Number(tripSheet.total_km) > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
          {Number(tripSheet.total_km).toLocaleString('en-IN')} km total &middot;
          {' '}{Number(tripSheet.loaded_km).toLocaleString('en-IN')} loaded &middot;
          {' '}{Number(tripSheet.empty_km).toLocaleString('en-IN')} empty
          {tripSheet.empty_running_pct != null && <> &middot; {Number(tripSheet.empty_running_pct).toFixed(1)}% empty running</>}
        </div>
      )}
      {!isRoute && (
        <form onSubmit={handleSaveHours} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="working_hours" style={{ fontSize: 12.5 }}>Working hours</label>
            <input id="working_hours" type="number" step="0.1" value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)} />
          </div>
          {isActive && (
            <button type="submit" className="btn" disabled={savingHours}>{savingHours ? 'Saving…' : 'Save'}</button>
          )}
          {tripSheet.idle_hours != null && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {Number(tripSheet.distance_covered).toLocaleString('en-IN')} engine hrs &middot;
              {' '}{Number(tripSheet.idle_hours).toLocaleString('en-IN')} idle
              {tripSheet.idle_pct != null && <> &middot; {Number(tripSheet.idle_pct).toFixed(1)}% idle</>}
            </div>
          )}
          {hoursError && <div className="form-error">{hoursError}</div>}
        </form>
      )}

      <AuditHistory modelName="TripSheet" objectId={tripSheet.id} />

      <div className="chip-group" style={{ marginTop: 14, marginBottom: 4 }}>
        <span className={`chip${activeTab === 'trip' ? ' on' : ''}`} onClick={() => setActiveTab('trip')}>
          {isRoute ? 'Legs' : 'Work items'}
        </span>
        <span className={`chip${activeTab === 'money' ? ' on' : ''}`} onClick={() => setActiveTab('money')}>
          Money box{!tripSheet.is_reconciled && (Number(tripSheet.total_advance) > 0 || tripSheet.trip_expenses.length > 0) ? ' *' : ''}
        </span>
      </div>

      {activeTab === 'trip' && (isRoute ? (
        <>
          <section className="table-card" style={{ boxShadow: 'none', marginTop: 16 }}>
            <div className="table-head"><h3>Legs</h3></div>
            <div className="table-scroll responsive">
              <table>
                <thead>
                  <tr><th>#</th><th>From</th><th>To</th><th>Status</th><th>Customer</th><th>Material</th><th>Distance</th><th>Freight</th></tr>
                </thead>
                <tbody>
                  {tripSheet.legs.map((leg) => (
                    <tr key={leg.id}>
                      <td data-label="#">{leg.sequence}</td>
                      <td data-label="From">{leg.from_place}</td>
                      <td data-label="To">{leg.to_place}</td>
                      <td data-label="Status">{leg.load_status ? <span className={`pill ${leg.load_status === 'loaded' ? 'on' : 'off'}`}>{humanize(leg.load_status)}</span> : '—'}</td>
                      <td data-label="Customer">{customerName_(leg.customer)}</td>
                      <td data-label="Material">{leg.material || '—'}</td>
                      <td data-label="Distance" className="tnum">{leg.distance_km ? `${Number(leg.distance_km).toLocaleString('en-IN')} km` : '—'}</td>
                      <td data-label="Freight" className="tnum">₹{Number(leg.freight_amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tripSheet.legs.length === 0 && <div className="empty-state">No legs yet.</div>}
            </div>
          </section>

          {tripSheet.status === 'draft' && (
            <form onSubmit={handleAddLeg} style={{ marginTop: 16 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="from_place">From</label>
                  <input id="from_place" required value={legForm.from_place} onChange={(e) => setLeg('from_place', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="to_place">To</label>
                  <input id="to_place" required value={legForm.to_place} onChange={(e) => setLeg('to_place', e.target.value)} />
                </div>
                <div className="field span-2">
                  <label>Loaded or empty?</label>
                  <div className="chip-group">
                    {TRIP_LEG_LOAD_STATUSES.map((s) => (
                      <span key={s} className={`chip${legForm.load_status === s ? ' on' : ''}`}
                        onClick={() => setLeg('load_status', s)}>
                        {humanize(s)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="distance_km">Distance (km)</label>
                  <input id="distance_km" type="number" step="0.1" required value={legForm.distance_km ?? ''}
                    onChange={(e) => setLeg('distance_km', e.target.value || null)} />
                </div>
                {legForm.load_status === 'loaded' && (
                  <>
                    <div className="field">
                      <label htmlFor="leg_customer">Billed to</label>
                      <input id="leg_customer" list="customer-suggestions" required placeholder="Type or pick a customer…"
                        value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                      <datalist id="customer-suggestions">
                        {customers.map((c) => <option key={c.id} value={c.name} />)}
                      </datalist>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                        A new name creates the customer automatically - no separate screen.
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="leg_material">Material</label>
                      <input id="leg_material" value={legForm.material} onChange={(e) => setLeg('material', e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="leg_basis">Billed</label>
                      <select id="leg_basis" required value={legForm.basis} onChange={(e) => setLeg('basis', e.target.value as typeof legForm.basis)}>
                        <option value="" disabled>Select…</option>
                        {TRIP_LEG_BASES.map((b) => <option key={b} value={b}>{humanize(b)}</option>)}
                      </select>
                    </div>
                    {legForm.basis === 'per_ton' && (
                      <div className="field">
                        <label htmlFor="leg_tonnage">Tonnage</label>
                        <input id="leg_tonnage" type="number" step="0.01" required value={legForm.tonnage ?? ''}
                          onChange={(e) => setLeg('tonnage', e.target.value || null)} />
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="leg_rate">Rate (₹)</label>
                      <input id="leg_rate" type="number" step="0.01" required value={legForm.rate ?? ''}
                        onChange={(e) => setLeg('rate', e.target.value || null)} />
                      {legRateFromCard && (
                        <div style={{ fontSize: 11, color: 'var(--good)', marginTop: 4 }}>✓ from rate card</div>
                      )}
                    </div>
                    {previewFreight != null && (
                      <div className="field" style={{ justifyContent: 'flex-end' }}>
                        <label>Freight (computed)</label>
                        <div className="tnum" style={{ padding: '8px 0', fontWeight: 600 }}>{CURRENCY.format(previewFreight)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {legError && <div className="form-error">{legError}</div>}
              <div className="form-actions">
                <button type="submit" className="btn" disabled={addingLeg || !legForm.load_status}>
                  {addingLeg ? 'Adding…' : '+ Add leg'}
                </button>
              </div>
            </form>
          )}
          {pendingRouteRate && (
            <div className="field span-2" style={{
              background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8, padding: '8px 10px',
              fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <span>
                Save {CURRENCY.format(Number(pendingRouteRate.rate))} per {humanize(pendingRouteRate.basis)} as the
                default rate for {pendingRouteRate.customerLabel} on {pendingRouteRate.from_place} → {pendingRouteRate.to_place}?
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" className="link-btn" disabled={savingRate} onClick={handleSaveRouteRate}>
                  {savingRate ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="link-btn" onClick={() => setPendingRouteRate(null)}>Dismiss</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="table-card" style={{ boxShadow: 'none', marginTop: 16 }}>
            <div className="table-head"><h3>Work items</h3></div>
            <div className="table-scroll responsive">
              <table>
                <thead>
                  <tr><th>#</th><th>Site</th><th>Customer</th><th>Work</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {tripSheet.work_items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="#">{item.sequence}</td>
                      <td data-label="Site">{item.site || '—'}</td>
                      <td data-label="Customer">{customerName_(item.customer)}</td>
                      <td data-label="Work">{item.work_type} <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>({humanize(item.basis)})</span></td>
                      <td data-label="Qty" className="tnum">{item.qty}{item.overtime_qty && ` (+${item.overtime_qty} OT)`}</td>
                      <td data-label="Rate" className="tnum">₹{Number(item.rate).toLocaleString('en-IN')}</td>
                      <td data-label="Amount" className="tnum">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                      <td data-label="">{isActive && <button className="link-btn danger" onClick={() => handleRemoveWorkItem(item.id)}>Remove</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tripSheet.work_items.length === 0 && <div className="empty-state">No work items yet.</div>}
            </div>
          </section>

          {tripSheet.status === 'draft' && (
            <form onSubmit={handleAddWorkItem} style={{ marginTop: 16 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="wi_site">Site</label>
                  <input id="wi_site" value={workItemForm.site} onChange={(e) => setWorkItem('site', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wi_customer">Billed to</label>
                  <input id="wi_customer" list="customer-suggestions" required placeholder="Type or pick a customer…"
                    value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  <datalist id="customer-suggestions">
                    {customers.map((c) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor="wi_work_type">Work type</label>
                  <input id="wi_work_type" required value={workItemForm.work_type} onChange={(e) => setWorkItem('work_type', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wi_basis">Billed</label>
                  <select id="wi_basis" required value={workItemForm.basis} onChange={(e) => setWorkItem('basis', e.target.value as typeof workItemForm.basis)}>
                    <option value="" disabled>Select…</option>
                    {WORK_ITEM_BASES.map((b) => <option key={b} value={b}>{humanize(b)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="wi_qty">Quantity</label>
                  <input id="wi_qty" type="number" step="0.01" required value={workItemForm.qty ?? ''}
                    onChange={(e) => setWorkItem('qty', e.target.value || null)} />
                </div>
                <div className="field">
                  <label htmlFor="wi_rate">Rate (₹)</label>
                  <input id="wi_rate" type="number" step="0.01" required value={workItemForm.rate ?? ''}
                    onChange={(e) => setWorkItem('rate', e.target.value || null)} />
                  {workRateFromCard && (
                    <div style={{ fontSize: 11, color: 'var(--good)', marginTop: 4 }}>✓ from rate card</div>
                  )}
                </div>
                {showWorkItemExtras && (
                  <>
                    <div className="field">
                      <label htmlFor="wi_overtime_qty">Overtime qty</label>
                      <input id="wi_overtime_qty" type="number" step="0.01" value={workItemForm.overtime_qty ?? ''}
                        onChange={(e) => setWorkItem('overtime_qty', e.target.value || null)} />
                    </div>
                    <div className="field">
                      <label htmlFor="wi_overtime_rate">Overtime rate (₹)</label>
                      <input id="wi_overtime_rate" type="number" step="0.01" value={workItemForm.overtime_rate ?? ''}
                        onChange={(e) => setWorkItem('overtime_rate', e.target.value || null)} />
                    </div>
                    <div className="field">
                      <label htmlFor="wi_min_billable">Minimum billable (₹)</label>
                      <input id="wi_min_billable" type="number" step="0.01" value={workItemForm.min_billable ?? ''}
                        onChange={(e) => setWorkItem('min_billable', e.target.value || null)} />
                    </div>
                  </>
                )}
                {!showWorkItemExtras && (
                  <div className="field" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="link-btn" onClick={() => setShowWorkItemExtras(true)}>
                      + Overtime / minimum billable
                    </button>
                  </div>
                )}
                {previewWorkAmount != null && (
                  <div className="field" style={{ justifyContent: 'flex-end' }}>
                    <label>Amount (computed)</label>
                    <div className="tnum" style={{ padding: '8px 0', fontWeight: 600 }}>{CURRENCY.format(previewWorkAmount)}</div>
                  </div>
                )}
              </div>
              {workItemError && <div className="form-error">{workItemError}</div>}
              <div className="form-actions">
                <button type="submit" className="btn" disabled={addingWorkItem}>
                  {addingWorkItem ? 'Adding…' : '+ Add work item'}
                </button>
              </div>
            </form>
          )}
          {pendingWorkRate && (
            <div className="field span-2" style={{
              background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8, padding: '8px 10px',
              fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <span>
                Save {CURRENCY.format(Number(pendingWorkRate.rate))} per {humanize(pendingWorkRate.basis)} as the
                default rate for {pendingWorkRate.customerLabel}'s {pendingWorkRate.work_type}?
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" className="link-btn" disabled={savingRate} onClick={handleSaveWorkRate}>
                  {savingRate ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="link-btn" onClick={() => setPendingWorkRate(null)}>Dismiss</button>
              </div>
            </div>
          )}
        </>
      ))}

      {/* -- Money box: every rupee given, spent, and returned has to
          reconcile before this trip can be approved. -- */}
      {activeTab === 'money' && (
      <section className="table-card" style={{ boxShadow: 'none', marginTop: 24 }}>
        <div className="table-head">
          <h3>Money box</h3>
          <span className={`pill ${tripSheet.is_reconciled ? 'on' : 'svc'}`} style={{ fontSize: 13 }}>
            {tripSheet.is_reconciled
              ? 'Balanced'
              : `${CURRENCY.format(Math.abs(Number(tripSheet.reconciliation_variance)))} unaccounted`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '0 4px 14px', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          <span>Advance: <strong className="tnum" style={{ color: 'var(--ink)' }}>{CURRENCY.format(Number(tripSheet.total_advance))}</strong></span>
          <span>From advance: <strong className="tnum" style={{ color: 'var(--ink)' }}>{CURRENCY.format(Number(tripSheet.expenses_paid_from_advance))}</strong></span>
          <span>Company-direct: <strong className="tnum" style={{ color: 'var(--ink)' }}>{CURRENCY.format(Number(tripSheet.company_direct_expenses_total))}</strong></span>
          <span>Driver's own: <strong className="tnum" style={{ color: 'var(--ink)' }}>{CURRENCY.format(Number(tripSheet.driver_own_expenses_total))}</strong></span>
          {showReimbursement && (
            <span>Reimbursement due: <strong className="tnum" style={{ color: 'var(--ink)' }}>{CURRENCY.format(Number(tripSheet.reimbursement_due))}</strong></span>
          )}
        </div>

        <div className="table-head">
          <h3 style={{ fontSize: 12.5 }}>Advances</h3>
          {isActive && <button type="button" className="link-btn" onClick={() => setShowAdvanceForm((s) => !s)}>+ Add advance</button>}
        </div>
        <div className="table-scroll responsive">
          <table>
            <thead><tr><th>Date</th><th>Given by</th><th>Amount</th><th>Mode</th><th></th></tr></thead>
            <tbody>
              {tripSheet.advances.map((a) => (
                <tr key={a.id}>
                  <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(a.date))}</td>
                  <td data-label="Given by">{a.given_by || '—'}</td>
                  <td data-label="Amount" className="tnum">{CURRENCY.format(Number(a.amount))}</td>
                  <td data-label="Mode">{a.payment_mode ? humanize(a.payment_mode) : '—'}</td>
                  <td data-label="">{isActive && <button className="link-btn danger" onClick={() => handleRemoveAdvance(a.id)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tripSheet.advances.length === 0 && <div className="empty-state">No advances given yet.</div>}
        </div>
        {showAdvanceForm && (
          <form onSubmit={handleAddAdvance} style={{ marginTop: 10 }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="adv_amount">Amount (₹)</label>
                <input id="adv_amount" type="number" step="0.01" required value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="adv_given_by">Given by</label>
                <input id="adv_given_by" value={advanceForm.given_by}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, given_by: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="adv_date">Date</label>
                <input id="adv_date" type="date" required value={advanceForm.date}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="adv_mode">Payment mode</label>
                <select id="adv_mode" value={advanceForm.payment_mode}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, payment_mode: e.target.value }))}>
                  <option value="">Select…</option>
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="adv_remarks">Remarks</label>
                <input id="adv_remarks" value={advanceForm.remarks}
                  onChange={(e) => setAdvanceForm((f) => ({ ...f, remarks: e.target.value }))} />
              </div>
            </div>
            {advanceError && <div className="form-error">{advanceError}</div>}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={savingAdvance}>{savingAdvance ? 'Saving…' : 'Save advance'}</button>
            </div>
          </form>
        )}

        <div className="table-head" style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 12.5 }}>Expenses</h3>
          {isActive && <button type="button" className="link-btn" onClick={() => setShowExpenseForm((s) => !s)}>+ Add expense</button>}
        </div>
        <div className="table-scroll responsive">
          <table>
            <thead><tr><th>Date</th><th>Expense head</th><th>Paid from</th><th>Amount</th><th>Vendor</th><th></th></tr></thead>
            <tbody>
              {tripSheet.trip_expenses.map((exp) => (
                <tr key={exp.id}>
                  <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(exp.date))}</td>
                  <td data-label="Expense head">{expenseHeads.find((h) => h.id === exp.expense_head)?.name ?? '—'}</td>
                  <td data-label="Paid from">{humanize(exp.paid_from)}</td>
                  <td data-label="Amount" className="tnum">{CURRENCY.format(Number(exp.amount))}</td>
                  <td data-label="Vendor">{exp.vendor ? (vendors.find((v) => v.id === exp.vendor)?.name ?? '—') : '—'}</td>
                  <td data-label="">{isActive && <button className="link-btn danger" onClick={() => handleRemoveExpense(exp.id)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tripSheet.trip_expenses.length === 0 && <div className="empty-state">No expenses logged yet.</div>}
        </div>
        {showExpenseForm && (
          <form onSubmit={handleAddExpense} style={{ marginTop: 10 }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="exp_head">Expense head</label>
                <select id="exp_head" required value={expenseForm.expense_head}
                  onChange={(e) => {
                    const expense_head = e.target.value;
                    const fuel = isFuelHead(expense_head);
                    setExpenseForm((f) => ({
                      ...f, expense_head,
                      litres: fuel ? f.litres : null,
                      rate_per_litre: fuel ? f.rate_per_litre : null,
                    }));
                  }}>
                  <option value="" disabled>Select…</option>
                  {EXPENSE_HEAD_GROUPS.map((group) => {
                    const inGroup = expenseHeads.filter((h) => h.group === group);
                    if (inGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={humanize(group)}>
                        {inGroup.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="field">
                <label htmlFor="exp_paid_from">Paid from</label>
                <select id="exp_paid_from" value={expenseForm.paid_from}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, paid_from: e.target.value as typeof f.paid_from }))}>
                  {TRIP_EXPENSE_PAID_FROM.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
                </select>
              </div>
              {isFuelHead(expenseForm.expense_head) && (
                <>
                  <div className="field">
                    <label htmlFor="exp_litres">Litres</label>
                    <input id="exp_litres" type="number" step="0.01" required value={expenseForm.litres ?? ''}
                      onChange={(e) => setExpenseLitres(e.target.value || null)} />
                  </div>
                  <div className="field">
                    <label htmlFor="exp_rate_per_litre">Rate/litre (₹)</label>
                    <input id="exp_rate_per_litre" type="number" step="0.01" required value={expenseForm.rate_per_litre ?? ''}
                      onChange={(e) => setExpenseRatePerLitre(e.target.value || null)} />
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="exp_amount">Amount (₹)</label>
                <input id="exp_amount" type="number" step="0.01" required value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="exp_date">Date</label>
                <input id="exp_date" type="date" required value={expenseForm.date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              {showExpenseDetails && (
                <>
                  <div className="field">
                    <label htmlFor="exp_vendor">Vendor (optional)</label>
                    <select id="exp_vendor" value={expenseForm.vendor ?? ''}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, vendor: e.target.value || null }))}>
                      <option value="">None</option>
                      {vendors.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="field span-2">
                    <label htmlFor="exp_notes">Notes</label>
                    <input id="exp_notes" value={expenseForm.notes}
                      onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </>
              )}
              {!showExpenseDetails && (
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="link-btn" onClick={() => setShowExpenseDetails(true)}>
                    + Add vendor / notes
                  </button>
                </div>
              )}
            </div>
            {expenseError && <div className="form-error">{expenseError}</div>}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={savingExpense}>{savingExpense ? 'Saving…' : 'Save expense'}</button>
            </div>
          </form>
        )}

        {isActive && (
          <form onSubmit={handleSaveSettlement} style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
            <h3 style={{ fontSize: 12.5, margin: '0 0 10px' }}>Settlement</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ret_amount">Returned to accountant (₹)</label>
                <input id="ret_amount" type="number" step="0.01" value={settlement.returned_amount ?? ''}
                  onChange={(e) => setSettlement((s) => ({ ...s, returned_amount: e.target.value || null }))} />
              </div>
              <div className="field">
                <label htmlFor="ret_received_by">Received by</label>
                <input id="ret_received_by" value={settlement.returned_received_by ?? ''}
                  onChange={(e) => setSettlement((s) => ({ ...s, returned_received_by: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="ret_date">Date</label>
                <input id="ret_date" type="date" value={settlement.returned_date ?? ''}
                  onChange={(e) => setSettlement((s) => ({ ...s, returned_date: e.target.value || null }))} />
              </div>
              {showReimbursement && (
                <>
                  <div className="field">
                    <label htmlFor="reimb_amount">Reimbursed to driver (₹)</label>
                    <input id="reimb_amount" type="number" step="0.01" value={settlement.reimbursed_amount ?? ''}
                      onChange={(e) => setSettlement((s) => ({ ...s, reimbursed_amount: e.target.value || null }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="reimb_date">Reimbursed date</label>
                    <input id="reimb_date" type="date" value={settlement.reimbursed_date ?? ''}
                      onChange={(e) => setSettlement((s) => ({ ...s, reimbursed_date: e.target.value || null }))} />
                  </div>
                </>
              )}
            </div>
            {settlementError && <div className="form-error">{settlementError}</div>}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={savingSettlement}>
                {savingSettlement ? 'Saving…' : 'Save settlement'}
              </button>
            </div>
          </form>
        )}
      </section>
      )}

      {tripSheet.reconciliation_override_reason && (
        <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 12 }}>
          Approved unbalanced - override reason: {tripSheet.reconciliation_override_reason}
        </div>
      )}

      <TripSheetStepper
        tripSheet={tripSheet}
        closingMeter={closingMeter}
        setClosingMeter={setClosingMeter}
        savingClosingMeter={savingClosingMeter}
        closingMeterError={closingMeterError}
        onSaveClosingMeter={handleSaveClosingMeter}
        overrideReason={overrideReason}
        setOverrideReason={setOverrideReason}
        workflowBusy={workflowBusy}
        workflowError={workflowError}
        onSubmit={handleSubmitTrip}
        onApproveClose={handleApproveClose}
      />
    </Modal>
  );
}

const STEPPER_STAGES = ['Open', 'Submitted', 'Approved & Closed'] as const;

function stageIndexFor(status: string) {
  if (status === 'draft') return 0;
  if (status === 'submitted') return 1;
  return 2; // closed, and legacy 'approved' rows predating this workflow
}

// Draft->Open, Submitted, Approved & Closed - the real, data-driven version
// of the approved trip-sheet-path-plan mockup: what's missing/blocked is
// read straight off the trip sheet's own fields and its server-computed
// can_submit/can_approve_close/can_cancel, not demo toggles.
function TripSheetStepper({
  tripSheet, closingMeter, setClosingMeter, savingClosingMeter, closingMeterError, onSaveClosingMeter,
  overrideReason, setOverrideReason, workflowBusy, workflowError, onSubmit, onApproveClose,
}: {
  tripSheet: TripSheet;
  closingMeter: string; setClosingMeter: (v: string) => void;
  savingClosingMeter: boolean; closingMeterError: string | null; onSaveClosingMeter: () => void;
  overrideReason: string; setOverrideReason: (v: string) => void;
  workflowBusy: boolean; workflowError: string | null;
  onSubmit: () => void; onApproveClose: () => void;
}) {
  if (tripSheet.status === 'cancelled') {
    return (
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-soft)', textAlign: 'center' }}>
        <span className="pill off">Cancelled</span>
      </div>
    );
  }

  const stage = stageIndexFor(tripSheet.status);

  // Closing meter is deliberately NOT in this list - it's not required
  // until Approve & Close (see the submitted-stage block below), so a trip
  // can be submitted mid-day, before the day's final reading is known.
  // A route sheet needs two legs before it's a real route, not one - the
  // first leg still saves immediately (createTripLeg posts right away),
  // it just isn't enough on its own to submit (mirrors the backend gate in
  // operations.views.TripSheetViewSet.submit).
  const missing: string[] = [];
  const hasLineItems = tripSheet.card_type === 'route' ? tripSheet.legs.length > 1 : tripSheet.work_items.length > 0;
  if (!hasLineItems) missing.push(tripSheet.card_type === 'route' ? 'at least two trip legs' : 'at least one work item');
  if (Number(tripSheet.total_advance) > 0 && tripSheet.returned_amount == null) missing.push('advance settlement (returned amount)');
  const isComplete = missing.length === 0;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18 }}>
        {STEPPER_STAGES.map((label, i) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
            {i > 0 && (
              <div style={{
                position: 'absolute', top: 13, right: '50%', width: '100%', height: 2,
                background: i <= stage ? 'var(--good)' : 'var(--border)', zIndex: 0,
              }}
              />
            )}
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11.5, fontWeight: 700, zIndex: 1,
              background: i < stage ? 'var(--good)' : i === stage ? 'var(--accent)' : 'var(--surface)',
              color: i <= stage ? '#fff' : 'var(--ink-soft)',
              border: i <= stage ? 'none' : '2px solid var(--border)',
            }}
            >
              {i < stage ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 600, color: i <= stage ? 'var(--ink)' : 'var(--ink-soft)', textAlign: 'center' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {tripSheet.status === 'draft' && (
        <div style={{ background: 'var(--paper)', borderRadius: 9, padding: '14px 16px' }}>
          <div className="form-grid" style={{ marginBottom: missing.length ? 10 : 0 }}>
            <div className="field">
              <label htmlFor="closing_meter">Closing odometer</label>
              <input id="closing_meter" type="number" step="0.1" value={closingMeter}
                onChange={(e) => setClosingMeter(e.target.value)} />
            </div>
            <div className="field" style={{ alignSelf: 'flex-end' }}>
              <button type="button" className="btn" disabled={savingClosingMeter || !closingMeter} onClick={onSaveClosingMeter}>
                {savingClosingMeter ? 'Saving…' : 'Save reading'}
              </button>
            </div>
          </div>
          {closingMeterError && <div className="form-error">{closingMeterError}</div>}

          {!isComplete ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Not ready to submit — missing: {missing.join(', ')}.
            </div>
          ) : !tripSheet.can_submit ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Everything's entered — only the assigned driver, a manager, or an owner can submit this sheet.
            </div>
          ) : (
            <>
              {workflowError && <div className="form-error">{workflowError}</div>}
              <div className="form-actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn primary" disabled={workflowBusy} onClick={onSubmit}>
                  {workflowBusy ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tripSheet.status === 'submitted' && (
        <div style={{ background: 'var(--accent-soft)', borderRadius: 9, padding: '14px 16px' }}>
          {tripSheet.closing_meter == null ? (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
                Enter the closing odometer reading before this trip can be approved & closed.
              </div>
              <div className="form-grid" style={{ marginBottom: 0 }}>
                <div className="field">
                  <label htmlFor="closing_meter_submitted">Closing odometer</label>
                  <input id="closing_meter_submitted" type="number" step="0.1" value={closingMeter}
                    onChange={(e) => setClosingMeter(e.target.value)} />
                </div>
                <div className="field" style={{ alignSelf: 'flex-end' }}>
                  <button type="button" className="btn" disabled={savingClosingMeter || !closingMeter} onClick={onSaveClosingMeter}>
                    {savingClosingMeter ? 'Saving…' : 'Save reading'}
                  </button>
                </div>
              </div>
              {closingMeterError && <div className="form-error">{closingMeterError}</div>}
            </>
          ) : !tripSheet.can_approve_close ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Waiting on approval — only the owner (or a manager they've specifically delegated) can approve & close this sheet.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
                Confirms the money box balances (or records why it doesn't) and finalizes the closing reading.
              </div>
              {!tripSheet.is_reconciled && (
                <div className="field span-2" style={{ marginBottom: 10 }}>
                  <label htmlFor="override_reason">
                    This trip doesn't balance (₹{Math.abs(Number(tripSheet.reconciliation_variance)).toLocaleString('en-IN')} unaccounted) — enter a reason to override
                  </label>
                  <input id="override_reason" placeholder="e.g. shortage, loss, pending return"
                    value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                </div>
              )}
              {workflowError && <div className="form-error">{workflowError}</div>}
              <div className="form-actions">
                <button type="button" className="btn primary" disabled={workflowBusy} onClick={onApproveClose}>
                  {workflowBusy ? 'Approving…' : 'Approve & Close'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {(tripSheet.status === 'closed' || tripSheet.status === 'approved') && (
        <div style={{ background: 'var(--good-soft)', borderRadius: 9, padding: '14px 16px', fontSize: 12.5, color: 'var(--good)', fontWeight: 600 }}>
          Approved & closed — the job is done, this sheet is now read-only history.
        </div>
      )}
    </div>
  );
}
