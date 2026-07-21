import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listDrivers, listVehicles } from '../api/fleet';
import {
  closeTripSheet, createTripLeg, createTripSheet, listTripSheets, retireTripSheet,
} from '../api/operations';
import { ApiError } from '../api/client';
import type { Driver, TripLegInput, TripSheet, TripSheetInput, Vehicle } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: TripSheetInput = { vehicle: '', driver: '', date: new Date().toISOString().slice(0, 10), opening_meter: '', remarks: '' };

export default function TripSheets() {
  const [tripSheets, setTripSheets] = useState<TripSheet[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<TripSheet | null>(null);

  function load() {
    listTripSheets().then(setTripSheets).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
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
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Date</th>
                  <th>Distance</th>
                  <th>Freight</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tripSheets?.map((ts) => (
                  <tr key={ts.id}>
                    <td className="reg-no">{vehicleName(ts.vehicle)}</td>
                    <td>{driverName(ts.driver)}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(ts.date))}</td>
                    <td className="tnum">{ts.distance_covered ? `${Number(ts.distance_covered).toLocaleString('en-IN')} km` : '—'}</td>
                    <td className="tnum">₹{Number(ts.total_freight).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`pill ${ts.status === 'open' ? 'svc' : ts.status === 'closed' ? 'on' : 'off'}`}>
                        {humanize(ts.status)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setDetail(ts)}>
                          {ts.status === 'open' ? 'Manage' : 'View'}
                        </button>
                        {ts.status === 'open' && (
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
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
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="driver">Driver</label>
            <select id="driver" required value={form.driver} onChange={(e) => set('driver', e.target.value)}>
              <option value="">Select a driver…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
          <div className="field span-2">
            <label htmlFor="remarks">Remarks</label>
            <input id="remarks" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

const BLANK_LEG: TripLegInput = {
  trip_sheet: '', sequence: 1, from_place: '', to_place: '', consignor: '', lr_number: '', freight_amount: '0', remarks: '',
};

function TripSheetDetail({
  tripSheet, vehicleName, driverName, onClose, onChanged,
}: {
  tripSheet: TripSheet; vehicleName: string; driverName: string;
  onClose: () => void; onChanged: (updated: TripSheet) => void;
}) {
  const [legForm, setLegForm] = useState<TripLegInput>({
    ...BLANK_LEG, trip_sheet: tripSheet.id, sequence: tripSheet.legs.length + 1,
  });
  const [addingLeg, setAddingLeg] = useState(false);
  const [legError, setLegError] = useState<string | null>(null);

  const [closingMeter, setClosingMeter] = useState(tripSheet.closing_meter ?? tripSheet.opening_meter);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  function setLeg<K extends keyof TripLegInput>(key: K, value: TripLegInput[K]) {
    setLegForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAddLeg(e: FormEvent) {
    e.preventDefault();
    setAddingLeg(true);
    setLegError(null);
    try {
      const leg = await createTripLeg(legForm);
      const updated = { ...tripSheet, legs: [...tripSheet.legs, leg] };
      onChanged(updated);
      setLegForm({ ...BLANK_LEG, trip_sheet: tripSheet.id, sequence: updated.legs.length + 1 });
    } catch (err) {
      setLegError(err instanceof ApiError ? err.message : 'Could not add leg.');
    } finally {
      setAddingLeg(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setCloseError(null);
    try {
      const updated = await closeTripSheet(tripSheet.id, closingMeter);
      onChanged(updated);
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'Could not close trip sheet.');
    } finally {
      setClosing(false);
    }
  }

  return (
    <Modal title={`${vehicleName} · ${DATE_FMT.format(new Date(tripSheet.date))}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
        Driver: {driverName} &middot; Status: {humanize(tripSheet.status)}
        {tripSheet.closing_meter && <> &middot; {Number(tripSheet.distance_covered).toLocaleString('en-IN')} km covered</>}
      </div>

      <section className="table-card" style={{ boxShadow: 'none' }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>#</th><th>From</th><th>To</th><th>LR no.</th><th>Freight</th></tr>
            </thead>
            <tbody>
              {tripSheet.legs.map((leg) => (
                <tr key={leg.id}>
                  <td>{leg.sequence}</td>
                  <td>{leg.from_place}</td>
                  <td>{leg.to_place}</td>
                  <td>{leg.lr_number || '—'}</td>
                  <td className="tnum">₹{Number(leg.freight_amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tripSheet.legs.length === 0 && <div className="empty-state">No legs yet.</div>}
        </div>
      </section>

      {tripSheet.status === 'open' && (
        <>
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
              <div className="field">
                <label htmlFor="lr_number">LR number</label>
                <input id="lr_number" value={legForm.lr_number} onChange={(e) => setLeg('lr_number', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="freight_amount">Freight (₹)</label>
                <input id="freight_amount" type="number" step="0.01" required value={legForm.freight_amount}
                  onChange={(e) => setLeg('freight_amount', e.target.value)} />
              </div>
            </div>
            {legError && <div className="form-error">{legError}</div>}
            <div className="form-actions">
              <button type="submit" className="btn" disabled={addingLeg}>{addingLeg ? 'Adding…' : '+ Add leg'}</button>
            </div>
          </form>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="closing_meter">Closing odometer</label>
                <input id="closing_meter" type="number" step="0.1" value={closingMeter}
                  onChange={(e) => setClosingMeter(e.target.value)} />
              </div>
            </div>
            {closeError && <div className="form-error">{closeError}</div>}
            <div className="form-actions">
              <button type="button" className="btn primary" disabled={closing} onClick={handleClose}>
                {closing ? 'Closing…' : 'Close trip sheet'}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
