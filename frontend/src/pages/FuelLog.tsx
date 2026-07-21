import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listVehicles } from '../api/fleet';
import { createFuelLog, listFuelLogs, retireFuelLog, updateFuelLog } from '../api/operations';
import { ApiError } from '../api/client';
import type { FuelLog, FuelLogInput, Vehicle } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const BLANK: FuelLogInput = {
  vehicle: '', trip_sheet: null, date: new Date().toISOString().slice(0, 10),
  litres: '', rate_per_litre: '', odometer: null, fuel_station: '', is_full_tank: true,
};

export default function FuelLogPage() {
  const [logs, setLogs] = useState<FuelLog[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FuelLog | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listFuelLogs().then(setLogs).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
  }, []);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.registration_number ?? '—';

  async function handleRetire(log: FuelLog) {
    if (!confirm('Remove this fuel log entry? It will be retired, not deleted.')) return;
    await retireFuelLog(log.id);
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

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th><th>Date</th><th>Litres</th><th>Rate</th><th>Amount</th>
                  <th>Odometer</th><th>Station</th><th></th>
                </tr>
              </thead>
              <tbody>
                {logs?.map((log) => (
                  <tr key={log.id}>
                    <td className="reg-no">{vehicleName(log.vehicle)}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(log.date))}</td>
                    <td className="tnum">{Number(log.litres).toLocaleString('en-IN')} L</td>
                    <td className="tnum">₹{Number(log.rate_per_litre).toFixed(2)}</td>
                    <td className="tnum">₹{Number(log.amount).toLocaleString('en-IN')}</td>
                    <td className="tnum">{log.odometer ? Number(log.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td>{log.fuel_station || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(log); setShowForm(true); }}>Edit</button>
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
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function FuelLogForm({
  initial, vehicles, onClose, onSaved,
}: { initial: FuelLog | null; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FuelLogInput>(initial ?? BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FuelLogInput>(key: K, value: FuelLogInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateFuelLog(initial.id, form);
      else await createFuelLog(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save fuel entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit fuel entry' : 'Add fuel entry'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" required value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
              <option value="">Select a vehicle…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
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
          <div className="field">
            <label htmlFor="litres">Litres</label>
            <input id="litres" type="number" step="0.01" required value={form.litres} onChange={(e) => set('litres', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate per litre (₹)</label>
            <input id="rate" type="number" step="0.01" required value={form.rate_per_litre}
              onChange={(e) => set('rate_per_litre', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="fuel_station">Fuel station</label>
            <input id="fuel_station" value={form.fuel_station} onChange={(e) => set('fuel_station', e.target.value)} />
          </div>
          <div className="field span-2">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={form.is_full_tank} onChange={(e) => set('is_full_tank', e.target.checked)} />
              Full tank
            </label>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
