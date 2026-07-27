import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listVehicles } from '../api/fleet';
import {
  createMaintenanceLog, createMaintenanceSchedule, listMaintenanceLogs, listMaintenanceSchedules,
  retireMaintenanceLog, retireMaintenanceSchedule, updateMaintenanceSchedule,
} from '../api/maintenance';
import { ApiError } from '../api/client';
import type {
  MaintenanceLog, MaintenanceLogInput, MaintenanceSchedule, MaintenanceScheduleInput, Vehicle,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const BLANK_SCHEDULE: MaintenanceScheduleInput = {
  vehicle: '', part_name: '', interval_km: null, interval_days: null,
  last_done_date: null, last_done_odometer: null, notes: '',
};

const BLANK_LOG: MaintenanceLogInput = {
  vehicle: '', schedule: null, part_name: '', date: todayIso(), odometer: null, vendor: '', notes: '',
};

export default function Maintenance() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  function load() {
    listMaintenanceSchedules().then(setSchedules).catch((err) => setError(err.message));
    listMaintenanceLogs().then(setLogs).catch((err) => setError(err.message));
  }

  useEffect(() => {
    listVehicles().then((v) => { setVehicles(v); if (v.length) setVehicleId(v[0].id); }).catch((err) => setError(err.message));
    load();
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleSchedules = useMemo(() => schedules.filter((s) => s.vehicle === vehicleId), [schedules, vehicleId]);
  const vehicleLogs = useMemo(() => logs.filter((l) => l.vehicle === vehicleId), [logs, vehicleId]);
  const activeSchedules = vehicleSchedules.filter((s) => s.status === 'active');
  const overdueCount = activeSchedules.filter((s) => s.is_overdue).length;

  async function handleRetireSchedule(s: MaintenanceSchedule) {
    if (!confirm(`Stop tracking "${s.part_name}"? It'll be retired, not deleted.`)) return;
    await retireMaintenanceSchedule(s.id);
    load();
  }
  async function handleRetireLog(l: MaintenanceLog) {
    if (!confirm('Remove this log entry?')) return;
    await retireMaintenanceLog(l.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Maintenance</h1>
          <div className="sub">Preventive maintenance schedules &amp; service history</div>
        </div>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5, minWidth: 200 }}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
        </select>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {vehicle && (
          <section className="stat-row" aria-label="Maintenance summary">
            <div className="tile">
              <div className="tile-label">Tracked parts</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{activeSchedules.length}</div>
              <div className="tile-foot">active schedules</div>
            </div>
            <div className="tile">
              <div className="tile-label">Overdue</div>
              <div className="tile-value tnum" style={{ fontSize: 26, color: overdueCount ? 'var(--critical)' : 'var(--good)' }}>
                {overdueCount}
              </div>
              <div className="tile-foot">need attention now</div>
            </div>
            <div className="tile">
              <div className="tile-label">Current odometer</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>
                {vehicle.current_meter ? `${Number(vehicle.current_meter).toLocaleString('en-IN')} ${vehicle.metering_unit}` : '—'}
              </div>
              <div className="tile-foot">used for km-based due dates</div>
            </div>
          </section>
        )}

        <section className="table-card">
          <div className="table-head">
            <h3>Schedules</h3>
            <button className="btn primary" onClick={() => { setEditingSchedule(null); setShowScheduleForm(true); }} disabled={!vehicleId}>
              + Add schedule
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Part</th><th>Interval</th><th>Last done</th><th>Next due</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {vehicleSchedules.map((s) => (
                  <tr key={s.id}>
                    <td>{s.part_name}</td>
                    <td>
                      {[s.interval_km ? `${s.interval_km.toLocaleString('en-IN')} km` : null, s.interval_days ? `${s.interval_days}d` : null]
                        .filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="tnum">
                      {s.last_done_date ? DATE_FMT.format(new Date(s.last_done_date)) : '—'}
                      {s.last_done_odometer && ` · ${Number(s.last_done_odometer).toLocaleString('en-IN')}`}
                    </td>
                    <td className="tnum">
                      {s.next_due_date ? DATE_FMT.format(new Date(s.next_due_date)) : '—'}
                      {s.next_due_km && ` · ${Number(s.next_due_km).toLocaleString('en-IN')}`}
                    </td>
                    <td>
                      {s.status === 'inactive'
                        ? <span className="pill off">Retired</span>
                        : s.is_overdue
                          ? <span className="pill" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                          : <span className="pill on">OK</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditingSchedule(s); setShowScheduleForm(true); }}>Edit</button>
                        {s.status === 'active' && <button className="link-btn danger" onClick={() => handleRetireSchedule(s)}>Retire</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleSchedules.length === 0 && (
              <div className="empty-state">No maintenance schedules yet. Add one for oil changes, filters, brake pads, etc.</div>
            )}
          </div>
        </section>

        <section className="table-card">
          <div className="table-head">
            <h3>Service log</h3>
            <button className="btn primary" onClick={() => setShowLogForm(true)} disabled={!vehicleId}>
              + Log service
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Part</th><th>Date</th><th>Odometer</th><th>Vendor</th><th></th></tr></thead>
              <tbody>
                {vehicleLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.part_name || '—'}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(l.date))}</td>
                    <td className="tnum">{l.odometer ? Number(l.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td>{l.vendor || '—'}</td>
                    <td><button className="link-btn danger" onClick={() => handleRetireLog(l)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleLogs.length === 0 && <div className="empty-state">No service history logged yet.</div>}
          </div>
        </section>
      </main>

      {showScheduleForm && vehicle && (
        <ScheduleForm
          initial={editingSchedule}
          vehicle={vehicle}
          onClose={() => setShowScheduleForm(false)}
          onSaved={() => { setShowScheduleForm(false); load(); }}
        />
      )}
      {showLogForm && vehicle && (
        <LogForm
          vehicle={vehicle}
          schedules={activeSchedules}
          onClose={() => setShowLogForm(false)}
          onSaved={() => { setShowLogForm(false); load(); }}
        />
      )}
    </>
  );
}

function toScheduleInput(s: MaintenanceSchedule): MaintenanceScheduleInput {
  return {
    vehicle: s.vehicle, part_name: s.part_name, interval_km: s.interval_km, interval_days: s.interval_days,
    last_done_date: s.last_done_date, last_done_odometer: s.last_done_odometer, notes: s.notes,
  };
}

function ScheduleForm({
  initial, vehicle, onClose, onSaved,
}: { initial: MaintenanceSchedule | null; vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<MaintenanceScheduleInput>(
    initial ? toScheduleInput(initial) : {
      ...BLANK_SCHEDULE, vehicle: vehicle.id,
      last_done_date: todayIso(), last_done_odometer: vehicle.current_meter,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MaintenanceScheduleInput>(key: K, value: MaintenanceScheduleInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateMaintenanceSchedule(initial.id, form);
      else await createMaintenanceSchedule(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.part_name}` : 'Add maintenance schedule'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="part_name">Part / task</label>
            <input id="part_name" required placeholder="e.g. Engine Oil, Air Filter, Brake Pads"
              value={form.part_name} onChange={(e) => set('part_name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="interval_km">Interval (km)</label>
            <input id="interval_km" type="number" min="0" value={form.interval_km ?? ''}
              onChange={(e) => set('interval_km', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="field">
            <label htmlFor="interval_days">Interval (days)</label>
            <input id="interval_days" type="number" min="0" value={form.interval_days ?? ''}
              onChange={(e) => set('interval_days', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="field">
            <label htmlFor="last_done_date">Last done (date)</label>
            <input id="last_done_date" type="date" value={form.last_done_date ?? ''}
              onChange={(e) => set('last_done_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="last_done_odometer">Last done (odometer)</label>
            <input id="last_done_odometer" type="number" step="0.1" value={form.last_done_odometer ?? ''}
              onChange={(e) => set('last_done_odometer', e.target.value || null)} />
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
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add schedule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LogForm({
  vehicle, schedules, onClose, onSaved,
}: { vehicle: Vehicle; schedules: MaintenanceSchedule[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<MaintenanceLogInput>({ ...BLANK_LOG, vehicle: vehicle.id, odometer: vehicle.current_meter });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MaintenanceLogInput>(key: K, value: MaintenanceLogInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectSchedule(scheduleId: string) {
    const schedule = schedules.find((s) => s.id === scheduleId);
    setForm((f) => ({ ...f, schedule: scheduleId || null, part_name: schedule ? schedule.part_name : f.part_name }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createMaintenanceLog(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save log entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log maintenance service" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="schedule">Matches schedule (optional)</label>
            <select id="schedule" value={form.schedule ?? ''} onChange={(e) => selectSchedule(e.target.value)}>
              <option value="">One-off / not on a schedule</option>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.part_name}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="part_name">Part / task</label>
            <input id="part_name" required value={form.part_name} onChange={(e) => set('part_name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" step="0.1" value={form.odometer ?? ''}
              onChange={(e) => set('odometer', e.target.value || null)} />
          </div>
          <div className="field span-2">
            <label htmlFor="vendor">Vendor</label>
            <input id="vendor" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {form.schedule && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            This will update the schedule's "last done" to this date/odometer.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Log service'}</button>
        </div>
      </form>
    </Modal>
  );
}
