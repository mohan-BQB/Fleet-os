import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import MarkPaidModal from '../components/MarkPaidModal';
import AuditHistory from '../components/AuditHistory';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import { usePermission } from '../context/AuthContext';
import { listDrivers, listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listUsers } from '../api/users';
import {
  approveFuelLog, createFuelLog, listFuelLogs, markFuelLogPaid, rejectFuelLog, retireFuelLog,
  submitFuelLog, updateFuelLog,
} from '../api/operations';
import { ApiError } from '../api/client';
import { FUEL_STATUS_LABEL as STATUS_LABEL, FUEL_STATUS_TONE as STATUS_TONE } from '../lib/statusDisplay';
import {
  VENDOR_PAYMENT_MODES, type AppUser, type Driver, type FuelLog, type FuelLogInput,
  type Vehicle, type Vendor,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: FuelLogInput = {
  vehicle: '', driver: '', filled_by: '', trip_sheet: null, date: new Date().toISOString().slice(0, 10),
  litres: '', rate_per_litre: '', odometer: null, fuel_station: null, is_full_tank: true,
};

function lastLogFor(logs: FuelLog[], vehicleId: string): FuelLog | undefined {
  return [...logs].filter((l) => l.vehicle === vehicleId).sort((a, b) => b.date.localeCompare(a.date))[0];
}

// Full-tank-to-full-tank mileage: between two consecutive full-tank fill-ups
// for a vehicle, distance covered / total litres put in over that stretch
// (every fill-up in between, not just the closing one - a partial top-up
// mid-stretch still went into the tank that got driven on). Client-side
// since the page already has every log loaded; no separate endpoint needed.
// Only meaningful for km-metered vehicles with an odometer reading logged.
interface MileageInterval { fromId: string; toId: string; distance: number; litres: number; mileage: number }

function computeMileageIntervals(logs: FuelLog[]): Map<string, MileageInterval> {
  const byVehicle = new Map<string, FuelLog[]>();
  for (const log of logs) {
    if (log.status === 'cancelled' || !log.odometer) continue;
    const arr = byVehicle.get(log.vehicle) ?? [];
    arr.push(log);
    byVehicle.set(log.vehicle, arr);
  }
  const intervalByClosingLogId = new Map<string, MileageInterval>();
  for (const vehicleLogs of byVehicle.values()) {
    const sorted = [...vehicleLogs].sort((a, b) => Number(a.odometer) - Number(b.odometer));
    const fullTankIdxs = sorted.reduce<number[]>((acc, l, i) => (l.is_full_tank ? [...acc, i] : acc), []);
    for (let k = 0; k < fullTankIdxs.length - 1; k++) {
      const startIdx = fullTankIdxs[k];
      const endIdx = fullTankIdxs[k + 1];
      const start = sorted[startIdx];
      const end = sorted[endIdx];
      const distance = Number(end.odometer) - Number(start.odometer);
      const litres = sorted.slice(startIdx + 1, endIdx + 1).reduce((sum, l) => sum + Number(l.litres), 0);
      if (distance > 0 && litres > 0) {
        intervalByClosingLogId.set(end.id, { fromId: start.id, toId: end.id, distance, litres, mileage: distance / litres });
      }
    }
  }
  return intervalByClosingLogId;
}

interface VehicleMileageSummary { vehicleId: string; mileage: number; intervalCount: number }

function computeVehicleMileageSummary(logs: FuelLog[], vehicles: Vehicle[]): VehicleMileageSummary[] {
  const intervals = computeMileageIntervals(logs);
  const totals = new Map<string, { distance: number; litres: number; count: number }>();
  for (const log of logs) {
    const interval = intervals.get(log.id);
    if (!interval) continue;
    const t = totals.get(log.vehicle) ?? { distance: 0, litres: 0, count: 0 };
    t.distance += interval.distance;
    t.litres += interval.litres;
    t.count += 1;
    totals.set(log.vehicle, t);
  }
  return [...totals.entries()]
    .filter(([vehicleId]) => vehicles.find((v) => v.id === vehicleId)?.metering_unit === 'km')
    .map(([vehicleId, t]) => ({ vehicleId, mileage: t.distance / t.litres, intervalCount: t.count }));
}

export default function FuelLogPage() {
  const [logs, setLogs] = useState<FuelLog[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  // Only owner/admin (company_users) can list users - a manager/driver
  // viewing this page simply won't see resolved "entered by" names rather
  // than the page erroring out; the id-less fallback covers that.
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FuelLog | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [markPaidLog, setMarkPaidLog] = useState<FuelLog | null>(null);
  const canDecide = usePermission('fuel_log', 'change_status');

  function load() {
    listFuelLogs().then(setLogs).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
    listVendors().then(setVendors).catch(() => {});
    listUsers().then(setUsers).catch(() => {});
  }, []);

  const mileageIntervals = useMemo(() => computeMileageIntervals(logs ?? []), [logs]);
  const vehicleMileage = useMemo(() => computeVehicleMileageSummary(logs ?? [], vehicles), [logs, vehicles]);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.registration_number ?? '—';
  const driverName = (id: string | null) => (id && drivers.find((d) => d.id === id)?.name) || '—';
  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || '—';
  const enteredByName = (id: string | null) => (id && users.find((u) => u.id === id)?.username) || '—';

  async function handleRetire(log: FuelLog) {
    if (!confirm('Remove this fuel log entry? It will be retired, not deleted.')) return;
    await retireFuelLog(log.id);
    load();
  }

  async function handleSubmit(log: FuelLog) {
    await submitFuelLog(log.id);
    load();
  }

  async function handleApprove(log: FuelLog) {
    await approveFuelLog(log.id);
    load();
  }

  async function handleReject(log: FuelLog) {
    const note = window.prompt('Why is this fuel entry being rejected?');
    if (!note) return;
    await rejectFuelLog(log.id, note);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Fuel Log</h1>
          <div className="sub">{logs ? `${logs.length} entries` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>+ Add fuel entry</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {vehicleMileage.length > 0 && (
          <section className="table-card">
            <div className="table-head">
              <h3>Vehicle mileage</h3>
              <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Full tank to full tank</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Vehicle</th><th>Mileage</th><th>Based on</th></tr></thead>
                <tbody>
                  {vehicleMileage.map((m) => (
                    <tr key={m.vehicleId}>
                      <td className="reg-no">{vehicleName(m.vehicleId)}</td>
                      <td className="tnum">{m.mileage.toFixed(2)} km/l</td>
                      <td>{m.intervalCount} interval{m.intervalCount === 1 ? '' : 's'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th><th>Driver</th><th>Filled by</th><th>Status</th><th>Date</th><th>Litres</th><th>Rate</th><th>Amount</th>
                  <th>Odometer</th><th>Mileage</th><th>Station</th><th>Entered by</th><th>Payment</th><th></th>
                </tr>
              </thead>
              <tbody>
                {logs?.map((log) => (
                  <tr key={log.id}>
                    <td className="reg-no">{vehicleName(log.vehicle)}</td>
                    <td>{driverName(log.driver)}</td>
                    <td>{log.filled_by || '—'}</td>
                    <td><ApprovalStatusPill label={STATUS_LABEL[log.status]} tone={STATUS_TONE[log.status]} /></td>
                    <td className="tnum">{DATE_FMT.format(new Date(log.date))}</td>
                    <td className="tnum">{Number(log.litres).toLocaleString('en-IN')} L</td>
                    <td className="tnum">₹{Number(log.rate_per_litre).toFixed(2)}</td>
                    <td className="tnum">₹{Number(log.amount).toLocaleString('en-IN')}</td>
                    <td className="tnum">{log.odometer ? Number(log.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td className="tnum">
                      {mileageIntervals.get(log.id) ? `${mileageIntervals.get(log.id)!.mileage.toFixed(2)} km/l` : '—'}
                    </td>
                    <td>{vendorName(log.fuel_station)}</td>
                    <td>{enteredByName(log.created_by)}</td>
                    <td>
                      {log.is_paid === null ? '—' : log.is_paid ? (
                        <span className="pill on">Paid</span>
                      ) : (
                        <button type="button" className="link-btn" onClick={() => setMarkPaidLog(log)}>
                          Mark paid
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {log.status === 'draft' && (
                          <>
                            <button className="link-btn" onClick={() => { setEditing(log); setShowForm(true); }}>Edit</button>
                            <button className="link-btn" onClick={() => handleSubmit(log)}>Submit</button>
                          </>
                        )}
                        {log.status === 'submitted' && canDecide && (
                          <>
                            <button className="link-btn" onClick={() => handleApprove(log)}>Approve</button>
                            <button className="link-btn danger" onClick={() => handleReject(log)}>Reject</button>
                          </>
                        )}
                        <button className="link-btn danger" onClick={() => handleRetire(log)}>Retire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs && logs.length === 0 && <div className="empty-state">No fuel entries yet.</div>}
          </div>
        </section>
      </main>

      {showForm && (
        <FuelLogForm
          initial={editing}
          vehicles={vehicles}
          drivers={drivers}
          vendors={vendors}
          logs={logs ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {markPaidLog && (
        <MarkPaidModal
          title="Mark fuel log paid"
          vendorName={vendorName(markPaidLog.fuel_station)}
          amountLabel={`₹${Number(markPaidLog.amount).toLocaleString('en-IN')}`}
          onConfirm={(mode) => markFuelLogPaid(markPaidLog.id, mode)}
          onClose={() => { setMarkPaidLog(null); load(); }}
        />
      )}
    </>
  );
}

interface FuelLogFormProps {
  initial: FuelLog | null;
  vehicles: Vehicle[];
  drivers: Driver[];
  vendors: Vendor[];
  logs: FuelLog[];
  // Set when opened from a vehicle's own detail view: the vehicle is fixed
  // (shown as a label, not a picker) and defaults are seeded immediately
  // instead of waiting for a select onChange.
  presetVehicle?: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}

export function FuelLogForm({
  initial, vehicles, drivers, vendors, logs, presetVehicle, onClose, onSaved,
}: FuelLogFormProps) {
  const fuelStations = vendors.filter((v) => v.vendor_type === 'fuel_station' && v.status === 'active');
  const [form, setForm] = useState<FuelLogInput>(() => {
    if (initial) return initial;
    const vehicleId = presetVehicle?.id ?? '';
    const last = vehicleId ? lastLogFor(logs, vehicleId) : undefined;
    return {
      ...BLANK,
      vehicle: vehicleId,
      rate_per_litre: last?.rate_per_litre ?? '',
      fuel_station: last?.fuel_station ?? '',
    };
  });
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMode, setPaymentMode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const alreadyPaid = initial?.is_paid === true;
  const willMarkPaid = markAsPaid && !alreadyPaid && !!form.fuel_station;

  function set<K extends keyof FuelLogInput>(key: K, value: FuelLogInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleVehicleChange(vehicleId: string) {
    const last = lastLogFor(logs, vehicleId);
    setForm((f) => ({
      ...f,
      vehicle: vehicleId,
      rate_per_litre: f.rate_per_litre || last?.rate_per_litre || f.rate_per_litre,
      fuel_station: f.fuel_station || last?.fuel_station || f.fuel_station,
    }));
  }

  // "Filled by" defaults to the driver's own name - the common case (see
  // FuelLog.filled_by's docstring) - but only while it's still tracking the
  // driver picker; once someone's typed a different name in (a company
  // person filled it instead), switching the driver again shouldn't
  // silently overwrite that.
  function handleDriverChange(driverId: string) {
    setForm((f) => {
      const previousDriverName = drivers.find((d) => d.id === f.driver)?.name;
      const newDriverName = drivers.find((d) => d.id === driverId)?.name ?? '';
      const filledByTrackedDriver = !f.filled_by || f.filled_by === previousDriverName;
      return { ...f, driver: driverId, filled_by: filledByTrackedDriver ? newDriverName : f.filled_by };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (willMarkPaid && !paymentMode) {
      setError('Select how this was paid.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = initial ? await updateFuelLog(initial.id, form) : await createFuelLog(form);
      if (willMarkPaid) {
        await markFuelLogPaid(saved.id, paymentMode);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save fuel entry.');
    } finally {
      setSaving(false);
    }
  }

  const lastLog = form.vehicle ? lastLogFor(logs, form.vehicle) : undefined;

  return (
    <Modal title={initial ? 'Edit fuel entry' : 'Add fuel entry'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {presetVehicle ? (
            <div className="field span-2">
              <label>Vehicle</label>
              <div className="reg-no" style={{ padding: '8px 0' }}>{presetVehicle.registration_number}</div>
            </div>
          ) : (
            <div className="field span-2">
              <label htmlFor="vehicle">Vehicle</label>
              <select id="vehicle" required value={form.vehicle} onChange={(e) => handleVehicleChange(e.target.value)}>
                <option value="">Select a vehicle…</option>
                {vehicles
                  .filter((v) => v.status === 'active' || v.status === 'in_service' || v.id === form.vehicle)
                  .map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="driver">Driver</label>
            <select id="driver" required value={form.driver ?? ''} onChange={(e) => handleDriverChange(e.target.value)}>
              <option value="">Select which driver this is for…</option>
              {drivers
                .filter((d) => d.status === 'active' || d.id === form.driver)
                .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filled_by">Filled by</label>
            <input id="filled_by" required placeholder="Driver, or a company person"
              value={form.filled_by} onChange={(e) => set('filled_by', e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Who was actually at the pump - defaults to the driver, edit if it was someone else.</span>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" inputMode="decimal" step="0.1" value={form.odometer ?? ''}
              onChange={(e) => set('odometer', e.target.value || null)} />
            {lastLog?.odometer && (
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                Last: {Number(lastLog.odometer).toLocaleString('en-IN')} on {DATE_FMT.format(new Date(lastLog.date))}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="litres">Litres</label>
            <input id="litres" type="number" inputMode="decimal" step="0.01" required autoFocus
              value={form.litres} onChange={(e) => set('litres', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate per litre (₹)</label>
            <input id="rate" type="number" inputMode="decimal" step="0.01" required value={form.rate_per_litre}
              onChange={(e) => set('rate_per_litre', e.target.value)} />
          </div>
          <div className="field span-2">
            <label>Filled to the brim?</label>
            <div className="toggle-group">
              <button type="button" className={form.is_full_tank ? 'on' : ''} onClick={() => set('is_full_tank', true)}>
                Full tank
              </button>
              <button type="button" className={!form.is_full_tank ? 'on' : ''} onClick={() => set('is_full_tank', false)}>
                Partial / top-up
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
              Needed to work out mileage accurately - only a full-to-full stretch gives a real km/l figure (see the
              Mileage column below).
            </span>
          </div>
          <div className="field span-2">
            <label htmlFor="fuel_station">Fuel station</label>
            <select id="fuel_station" value={form.fuel_station ?? ''} onChange={(e) => set('fuel_station', e.target.value || null)}>
              <option value="">—</option>
              {fuelStations.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {form.fuel_station && (
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
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="FuelLog" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || (willMarkPaid && !paymentMode)}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
