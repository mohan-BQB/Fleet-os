import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import ComplianceModal from '../components/ComplianceModal';
import VehicleDetailModal from '../components/VehicleDetailModal';
import AuditHistory from '../components/AuditHistory';
import { TruckIcon } from '../components/icons';
import {
  createVehicle, createVehicleLoan, listComplianceDocuments, listVehicleLoanInstallments, listVehicles,
  markVehicleSold, updateVehicle, type VehicleFiles,
} from '../api/fleet';
import { listMaintenanceSchedules } from '../api/maintenance';
import { listTyreServices, listTyres } from '../api/tyres';
import { ApiError } from '../api/client';
import { complianceAlertCount, overdueEmiCount, overdueMaintenanceCount, wornTyreCount } from '../lib/fleetAlerts';
import {
  ACQUISITION_TYPES, AXLE_LAYOUTS, FUEL_TYPES, TRACKING_MODES, VEHICLE_CATEGORIES, VEHICLE_DOC_TYPES,
  VEHICLE_USAGE, type ComplianceDocument, type MaintenanceSchedule, type Tyre, type TyreService, type Vehicle,
  type VehicleInput, type VehicleLoanInput, type VehicleLoanInstallment,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Mirrors backend vehicles.models.HOURS_CATEGORIES - metering_unit is
// server-derived from category, this just previews it before saving.
const HOURS_CATEGORIES = new Set(['tractor', 'jcb', 'rig']);

const BLANK: VehicleInput = {
  registration_number: '', category: 'lorry', usage: 'commercial', tracking_mode: 'manual',
  registration_date: null, rto: '', chassis_number: '', engine_number: '',
  rc_valid_till: null, fuel_norm: '',
  rto_vehicle_class: '', maker: '', model: '', mfg_year: null, fuel_type: '',
  cc: null, seating_capacity: null, gvw: null, colour: '',
  owner_name: '', owner_relation: '', address: '', financier: '', hypothecation_till: null,
  number_of_owners: 1, acquisition_type: 'new', purchase_date: null, previous_owner: '',
  ownership_transfer_date: null, broker_name: '', broker_info: '', broker_commission: null,
  fleet_id: '', current_meter: null, meter_reading_date: null, purchase_price: null,
  number_of_tyres: 6, spare_tyres: 1, axle_layout: '',
};

const BLANK_LOAN: Omit<VehicleLoanInput, 'vehicle'> = {
  financier: '', principal_amount: '', interest_rate: null, tenure_months: 12, emi_amount: '',
  start_date: todayIso(), notes: '',
};

// Explicit field-by-field copy, not a spread of the full record: `initial`
// carries rc_copy/photo as URL strings, and blindly spreading it into form
// state would send those strings alongside a newly-picked File under the
// same multipart field name when editing.
function toVehicleInput(v: Vehicle): VehicleInput {
  return {
    registration_number: v.registration_number, category: v.category, usage: v.usage,
    tracking_mode: v.tracking_mode,
    registration_date: v.registration_date, rto: v.rto, chassis_number: v.chassis_number,
    engine_number: v.engine_number, rc_valid_till: v.rc_valid_till, fuel_norm: v.fuel_norm,
    rto_vehicle_class: v.rto_vehicle_class, maker: v.maker, model: v.model, mfg_year: v.mfg_year,
    fuel_type: v.fuel_type, cc: v.cc, seating_capacity: v.seating_capacity, gvw: v.gvw, colour: v.colour,
    owner_name: v.owner_name, owner_relation: v.owner_relation, address: v.address,
    financier: v.financier, hypothecation_till: v.hypothecation_till,
    number_of_owners: v.number_of_owners, acquisition_type: v.acquisition_type,
    purchase_date: v.purchase_date, previous_owner: v.previous_owner,
    ownership_transfer_date: v.ownership_transfer_date,
    broker_name: v.broker_name, broker_info: v.broker_info, broker_commission: v.broker_commission,
    fleet_id: v.fleet_id, current_meter: v.current_meter, meter_reading_date: v.meter_reading_date,
    purchase_price: v.purchase_price,
    number_of_tyres: v.number_of_tyres, spare_tyres: v.spare_tyres, axle_layout: v.axle_layout,
  };
}

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [complianceVehicle, setComplianceVehicle] = useState<Vehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  // Only for the rolled-up Alerts column - every one of these already has
  // its "needs attention" logic computed elsewhere (Tyres.tsx/Maintenance.
  // tsx's own picker cards, ComplianceDocument.is_due/is_expired,
  // VehicleLoanInstallment.is_overdue); this just aggregates them per
  // vehicle for one glance across the whole fleet.
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [tyreServices, setTyreServices] = useState<TyreService[]>([]);
  const [complianceDocs, setComplianceDocs] = useState<ComplianceDocument[]>([]);
  const [installments, setInstallments] = useState<VehicleLoanInstallment[]>([]);

  function load() {
    listVehicles().then(setVehicles).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listMaintenanceSchedules().then(setSchedules).catch(() => {});
    listTyres().then(setTyres).catch(() => {});
    listTyreServices().then(setTyreServices).catch(() => {});
    listComplianceDocuments().then(setComplianceDocs).catch(() => {});
    listVehicleLoanInstallments().then(setInstallments).catch(() => {});
  }, []);

  // Combined "needs attention" count per vehicle - overdue maintenance +
  // worn tyres + compliance due/expired + overdue EMI. Worst-of-nothing:
  // any one of these being non-zero surfaces the vehicle, the exact count
  // doesn't imply severity ranking between the four kinds.
  const alertsByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles ?? []) {
      const maintenance = overdueMaintenanceCount(v.id, schedules);
      const tyreWear = wornTyreCount(v.id, tyres, tyreServices);
      const compliance = complianceAlertCount(v.id, complianceDocs);
      const emi = overdueEmiCount(v.id, installments);
      counts.set(v.id, maintenance + tyreWear + compliance + emi);
    }
    return counts;
  }, [vehicles, schedules, tyres, tyreServices, complianceDocs, installments]);

  async function handleRetire(v: Vehicle) {
    // A minimal one-click path (today's date, no buyer/amount) - the full
    // Mark sold / Mark scrapped forms with those details live on the
    // vehicle's own detail tabs.
    if (!confirm(`Mark ${v.registration_number} as sold? It will move out of active vehicles, not disappear.`)) return;
    await markVehicleSold(v.id, todayIso());
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Vehicles</h1>
          <div className="sub">{vehicles ? `${vehicles.length} total` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add vehicle
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Category</th>
                  <th>Usage</th>
                  <th>Tracking</th>
                  <th>Tyres</th>
                  <th>RC valid till</th>
                  <th>Alerts</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vehicles?.map((v) => {
                  const alerts = alertsByVehicle.get(v.id) ?? 0;
                  return (
                  <tr key={v.id}>
                    <td>
                      <button
                        type="button"
                        className="veh-cell"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                        onClick={() => setDetailVehicle(v)}
                      >
                        <span className="veh-icon"><TruckIcon /></span>
                        <div className="reg-no">{v.registration_number}</div>
                      </button>
                    </td>
                    <td>{humanize(v.category)}</td>
                    <td>{humanize(v.usage)}</td>
                    <td>{v.tracking_mode === 'gps' ? 'GPS' : 'Manual'}</td>
                    <td className="tnum">{v.number_of_tyres} + {v.spare_tyres} spare</td>
                    <td className="tnum">{v.rc_valid_till ? DATE_FMT.format(new Date(v.rc_valid_till)) : '—'}</td>
                    <td>
                      {alerts > 0 ? (
                        <span className="pill off" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>⚠ {alerts}</span>
                      ) : (
                        <span className="pill on">✓ None</span>
                      )}
                    </td>
                    <td><span className={`pill ${v.status === 'active' ? 'on' : v.status === 'in_service' ? 'svc' : 'off'}`}>{humanize(v.status)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setComplianceVehicle(v)}>Compliance</button>
                        <button className="link-btn" onClick={() => { setEditing(v); setShowForm(true); }}>Edit</button>
                        {v.status === 'active' && (
                          <button className="link-btn danger" onClick={() => handleRetire(v)}>Retire</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {vehicles && vehicles.length === 0 && (
              <div className="empty-state">No vehicles yet. Add your first one.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <VehicleForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {complianceVehicle && (
        <ComplianceModal
          holderType="vehicle"
          holderId={complianceVehicle.id}
          holderLabel={complianceVehicle.registration_number}
          docTypes={VEHICLE_DOC_TYPES}
          onClose={() => setComplianceVehicle(null)}
        />
      )}
      {detailVehicle && (
        <VehicleDetailModal
          vehicle={detailVehicle}
          onClose={() => setDetailVehicle(null)}
        />
      )}
    </>
  );
}

function VehicleForm({
  initial, onClose, onSaved,
}: { initial: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VehicleInput>(initial ? toVehicleInput(initial) : BLANK);
  const [files, setFiles] = useState<VehicleFiles>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Both optional, both off by default - not every purchase has a broker
  // or is financed. Only offered on Add - an existing vehicle's loans are
  // managed on its own detail view (Loan tab), which already supports
  // more than one loan over a vehicle's life; this is just the fast path
  // for "financed at the time of purchase".
  const [hasBroker, setHasBroker] = useState(Boolean(initial?.broker_name));
  const [isFinanced, setIsFinanced] = useState(false);
  const [loanForm, setLoanForm] = useState<Omit<VehicleLoanInput, 'vehicle'>>(BLANK_LOAN);

  function set<K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setLoanField<K extends keyof Omit<VehicleLoanInput, 'vehicle'>>(
    key: K, value: Omit<VehicleLoanInput, 'vehicle'>[K],
  ) {
    setLoanForm((f) => ({ ...f, [key]: value }));
  }
  function setFile(key: keyof VehicleFiles, value: File | null) {
    setFiles((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateVehicle(initial.id, form, files);
      } else {
        const saved = await createVehicle(form, files);
        // Loan needs the vehicle's own id, so it can only happen after
        // the vehicle exists - same create-then-dependent-follow-up shape
        // ExpenseForm/FuelLogForm already use for their own two-step
        // actions. Reuses vehicles.services.create_loan_with_schedule via
        // the existing createVehicleLoan endpoint (VehicleDetailModal's
        // Loan tab uses the same call) - not a second loan-creation path.
        if (isFinanced) {
          await createVehicleLoan({ ...loanForm, vehicle: saved.id });
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save vehicle.');
    } finally {
      setSaving(false);
    }
  }

  const meteringUnit = HOURS_CATEGORIES.has(form.category) ? 'hours' : 'km';

  return (
    <Modal title={initial ? `Edit ${initial.registration_number}` : 'Add vehicle — RC data entry'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h4>Category &amp; configuration</h4>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Vehicle category</label>
            <div className="chip-group">
              {VEHICLE_CATEGORIES.map((c) => (
                <span
                  key={c}
                  className={`chip${form.category === c ? ' on' : ''}`}
                  onClick={() => set('category', c)}
                >
                  {humanize(c)}
                </span>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="usage">Usage</label>
              <select id="usage" value={form.usage} onChange={(e) => set('usage', e.target.value)}>
                {VEHICLE_USAGE.map((u) => <option key={u} value={u}>{humanize(u)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Metering unit (auto)</label>
              <div style={{ paddingTop: 4 }}>
                <span style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)',
                }}
                >
                  {meteringUnit}
                </span>
              </div>
            </div>
            <div className="field">
              <label>Tracking mode (admin)</label>
              <div className="toggle-group">
                {TRACKING_MODES.map((t) => (
                  <button
                    key={t} type="button"
                    className={form.tracking_mode === t ? 'on' : ''}
                    onClick={() => set('tracking_mode', t)}
                  >
                    {t === 'gps' ? 'GPS' : 'Manual'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Registration</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="reg">Registration number</label>
              <input id="reg" required value={form.registration_number}
                onChange={(e) => set('registration_number', e.target.value.toUpperCase())} />
            </div>
            <div className="field">
              <label htmlFor="registration_date">Registration date</label>
              <input id="registration_date" type="date" value={form.registration_date ?? ''}
                onChange={(e) => set('registration_date', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="rto">Registering RTO</label>
              <input id="rto" placeholder="e.g. Madurai" value={form.rto} onChange={(e) => set('rto', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="chassis_number">Chassis number</label>
              <input id="chassis_number" value={form.chassis_number} onChange={(e) => set('chassis_number', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="engine_number">Engine number</label>
              <input id="engine_number" value={form.engine_number} onChange={(e) => set('engine_number', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rc_valid_till">RC valid till</label>
              <input id="rc_valid_till" type="date" value={form.rc_valid_till ?? ''}
                onChange={(e) => set('rc_valid_till', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Classification &amp; specs</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rto_vehicle_class">RTO vehicle class</label>
              <input id="rto_vehicle_class" placeholder="e.g. HGV" value={form.rto_vehicle_class}
                onChange={(e) => set('rto_vehicle_class', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="maker">Maker</label>
              <input id="maker" value={form.maker} onChange={(e) => set('maker', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="model">Model</label>
              <input id="model" value={form.model} onChange={(e) => set('model', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="mfg_year">Manufacture year</label>
              <input id="mfg_year" type="number" value={form.mfg_year ?? ''}
                onChange={(e) => set('mfg_year', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="field">
              <label htmlFor="fuel">Fuel type</label>
              <select id="fuel" value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
                <option value="">—</option>
                {FUEL_TYPES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cc">Cubic capacity (CC)</label>
              <input id="cc" type="number" value={form.cc ?? ''}
                onChange={(e) => set('cc', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="field">
              <label htmlFor="seating_capacity">Seating capacity</label>
              <input id="seating_capacity" type="number" value={form.seating_capacity ?? ''}
                onChange={(e) => set('seating_capacity', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="field">
              <label htmlFor="gvw">Gross vehicle weight</label>
              <input id="gvw" type="number" step="0.01" value={form.gvw ?? ''}
                onChange={(e) => set('gvw', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="colour">Colour</label>
              <input id="colour" value={form.colour} onChange={(e) => set('colour', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Ownership &amp; acquisition</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="owner_name">Owner name</label>
              <input id="owner_name" value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="owner_relation">Relation (S/o, W/o)</label>
              <input id="owner_relation" value={form.owner_relation} onChange={(e) => set('owner_relation', e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Acquisition type</label>
            <div className="toggle-group">
              {ACQUISITION_TYPES.map((t) => (
                <button
                  key={t} type="button"
                  className={form.acquisition_type === t ? 'on' : ''}
                  onClick={() => set('acquisition_type', t)}
                >
                  {t === 'new' ? 'New' : 'Second-hand'}
                </button>
              ))}
            </div>
          </div>

          {form.acquisition_type === 'second_hand' && (
            <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 14, marginTop: 14 }}>
              <div style={{
                display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '3px 10px',
                borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 10,
              }}
              >
                Shown when second-hand
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="purchase_date">Date of purchase</label>
                  <input id="purchase_date" type="date" value={form.purchase_date ?? ''}
                    onChange={(e) => set('purchase_date', e.target.value || null)} />
                </div>
                <div className="field">
                  <label htmlFor="previous_owner">Previous owner name</label>
                  <input id="previous_owner" value={form.previous_owner} onChange={(e) => set('previous_owner', e.target.value)} />
                </div>
                {/* Which owner we are - follows naturally right after who we
                    bought it from, before the transfer-date field below. */}
                <div className="field">
                  <label htmlFor="number_of_owners">Number of owners (incl. us)</label>
                  <input id="number_of_owners" type="number" min={1} step={1} value={form.number_of_owners}
                    onChange={(e) => set('number_of_owners', Number(e.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="ownership_transfer_date">Ownership transfer date</label>
                  <input id="ownership_transfer_date" type="date" value={form.ownership_transfer_date ?? ''}
                    onChange={(e) => set('ownership_transfer_date', e.target.value || null)} />
                </div>
              </div>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="financier">Financier (if loan)</label>
              <input id="financier" value={form.financier} onChange={(e) => set('financier', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hypothecation_till">Hypothecation till</label>
              <input id="hypothecation_till" type="date" value={form.hypothecation_till ?? ''}
                onChange={(e) => set('hypothecation_till', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Purchase &amp; financing</h4>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
            <input type="checkbox" checked={hasBroker} onChange={(e) => setHasBroker(e.target.checked)} />
            Purchased through a broker
          </label>
          {hasBroker && (
            <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 14, marginTop: 10 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="broker_name">Broker name</label>
                  <input id="broker_name" value={form.broker_name} onChange={(e) => set('broker_name', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="broker_info">Broker contact / info</label>
                  <input id="broker_info" value={form.broker_info} onChange={(e) => set('broker_info', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="broker_commission">Commission (₹)</label>
                  <input id="broker_commission" type="number" step="0.01" value={form.broker_commission ?? ''}
                    onChange={(e) => set('broker_commission', e.target.value || null)} />
                </div>
              </div>
            </div>
          )}

          {!initial && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginTop: 18 }}>
                <input type="checkbox" checked={isFinanced} onChange={(e) => setIsFinanced(e.target.checked)} />
                This vehicle is financed (loan)
              </label>
              {isFinanced && (
                <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 14, marginTop: 10 }}>
                  <div className="form-grid">
                    <div className="field span-2">
                      <label htmlFor="loan_financier">Financier</label>
                      <input id="loan_financier" required={isFinanced} value={loanForm.financier}
                        onChange={(e) => setLoanField('financier', e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="loan_principal">Principal amount (₹)</label>
                      <input id="loan_principal" type="number" step="0.01" required={isFinanced}
                        value={loanForm.principal_amount} onChange={(e) => setLoanField('principal_amount', e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="loan_interest_rate">Interest rate (% p.a.)</label>
                      <input id="loan_interest_rate" type="number" step="0.01" value={loanForm.interest_rate ?? ''}
                        onChange={(e) => setLoanField('interest_rate', e.target.value || null)} />
                    </div>
                    <div className="field">
                      <label htmlFor="loan_tenure">Tenure (months)</label>
                      <input id="loan_tenure" type="number" min={1} required={isFinanced} value={loanForm.tenure_months}
                        onChange={(e) => setLoanField('tenure_months', Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label htmlFor="loan_emi">EMI amount (₹/mo)</label>
                      <input id="loan_emi" type="number" step="0.01" required={isFinanced} value={loanForm.emi_amount}
                        onChange={(e) => setLoanField('emi_amount', e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="loan_start_date">First EMI date</label>
                      <input id="loan_start_date" type="date" required={isFinanced} value={loanForm.start_date}
                        onChange={(e) => setLoanField('start_date', e.target.value)} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Generates the full EMI schedule immediately - same as adding a loan from the vehicle's own Loan tab later.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="form-section">
          <h4>Operational</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fleet_id">Fleet ID / nickname</label>
              <input id="fleet_id" placeholder="e.g. Lorry 3" value={form.fleet_id}
                onChange={(e) => set('fleet_id', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="current_meter">Current odometer</label>
              <input id="current_meter" type="number" step="0.1" value={form.current_meter ?? ''}
                onChange={(e) => set('current_meter', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="meter_reading_date">Reading date</label>
              <input id="meter_reading_date" type="date" value={form.meter_reading_date ?? ''}
                onChange={(e) => set('meter_reading_date', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="purchase_price">Purchase price (₹)</label>
              <input id="purchase_price" type="number" step="0.01" value={form.purchase_price ?? ''}
                onChange={(e) => set('purchase_price', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Tyres &amp; axle</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="axle_layout">Axle layout</label>
              <select id="axle_layout" value={form.axle_layout} onChange={(e) => set('axle_layout', e.target.value)}>
                <option value="">—</option>
                {AXLE_LAYOUTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div />
            <div className="field">
              <label htmlFor="number_of_tyres">Tyres (excl. spare)</label>
              <input id="number_of_tyres" type="number" min="0" value={form.number_of_tyres}
                onChange={(e) => set('number_of_tyres', Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="spare_tyres">Spare tyres</label>
              <input id="spare_tyres" type="number" min="0" value={form.spare_tyres}
                onChange={(e) => set('spare_tyres', Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Attachments</h4>
          <div className="form-grid">
            <label className="upload-field">
              📄 RC copy (front)
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile('rc_copy', e.target.files?.[0] ?? null)} />
            </label>
            <label className="upload-field">
              📄 RC copy (back)
              <input type="file" accept="image/*" onChange={(e) => setFile('rc_copy_back', e.target.files?.[0] ?? null)} />
            </label>
            <label className="upload-field">
              📷 Vehicle photo
              <input type="file" accept="image/*" onChange={(e) => setFile('photo', e.target.files?.[0] ?? null)} />
            </label>
            {form.acquisition_type === 'second_hand' && (
              <label className="upload-field">
                📄 Previous owner's RC copy
                <input type="file" accept="application/pdf,image/*"
                  onChange={(e) => setFile('previous_rc_copy', e.target.files?.[0] ?? null)} />
              </label>
            )}
            {initial?.rc_copy && !files.rc_copy && (
              <a href={initial.rc_copy} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current RC copy (front)</a>
            )}
            {initial?.rc_copy_back && !files.rc_copy_back && (
              <a href={initial.rc_copy_back} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current RC copy (back)</a>
            )}
            {initial?.photo && !files.photo && (
              <a href={initial.photo} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current photo</a>
            )}
            {initial?.previous_rc_copy && !files.previous_rc_copy && (
              <a href={initial.previous_rc_copy} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
                View previous owner's RC copy
              </a>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="Vehicle" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add vehicle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
