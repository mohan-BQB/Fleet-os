import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listVehicles } from '../api/fleet';
import {
  createTyre, createTyreService, listTyreServices, listTyres, retireTyre, retireTyreService, updateTyre,
} from '../api/tyres';
import { ApiError } from '../api/client';
import { TYRE_SERVICE_TYPES, type Tyre, type TyreInput, type TyreService, type TyreServiceInput, type Vehicle } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK_TYRE: TyreInput = {
  vehicle: '', position: '', brand: '', size: '', serial_number: '',
  fitted_date: null, purchase_date: null, purchase_price: null,
  odometer_at_fitting: null, notes: '',
};

const BLANK_SERVICE: TyreServiceInput = {
  vehicle: '', tyre: null, service_type: 'alignment', date: new Date().toISOString().slice(0, 10),
  odometer: null, vendor: '', notes: '',
};

export default function Tyres() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [services, setServices] = useState<TyreService[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);

  function load() {
    listTyres().then(setTyres).catch((err) => setError(err.message));
    listTyreServices().then(setServices).catch((err) => setError(err.message));
  }

  useEffect(() => {
    listVehicles().then((v) => { setVehicles(v); if (v.length) setVehicleId(v[0].id); }).catch((err) => setError(err.message));
    load();
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleTyres = useMemo(() => tyres.filter((t) => t.vehicle === vehicleId), [tyres, vehicleId]);
  const vehicleServices = useMemo(() => services.filter((s) => s.vehicle === vehicleId), [services, vehicleId]);
  const fittedCount = vehicleTyres.filter((t) => t.status === 'fitted').length;
  const spareCount = vehicleTyres.filter((t) => t.status === 'spare').length;

  async function handleRetireTyre(t: Tyre) {
    if (!confirm(`Retire this tyre (${t.position || t.brand})? It'll be marked retired, not deleted.`)) return;
    await retireTyre(t.id);
    load();
  }
  async function handleRetireService(s: TyreService) {
    if (!confirm('Remove this service record? It will be retired, not deleted.')) return;
    await retireTyreService(s.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Tyres</h1>
          <div className="sub">Per-vehicle tyre inventory &amp; service history</div>
        </div>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13.5, minWidth: 200 }}>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
        </select>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {vehicle && (
          <section className="stat-row" aria-label="Tyre configuration">
            <div className="tile">
              <div className="tile-label">Configured</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{vehicle.number_of_tyres} + {vehicle.spare_tyres}</div>
              <div className="tile-foot">road tyres + spares (edit on the Vehicles page)</div>
            </div>
            <div className="tile">
              <div className="tile-label">Tracked &amp; fitted</div>
              <div className="tile-value tnum" style={{ fontSize: 26, color: fittedCount === vehicle.number_of_tyres ? 'var(--good)' : 'var(--warn)' }}>
                {fittedCount}
              </div>
              <div className="tile-foot">of {vehicle.number_of_tyres} configured</div>
            </div>
            <div className="tile">
              <div className="tile-label">Spares in stock</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{spareCount}</div>
              <div className="tile-foot">of {vehicle.spare_tyres} configured</div>
            </div>
            <div className="tile">
              <div className="tile-label">Axle layout</div>
              <div className="tile-value" style={{ fontSize: 16, fontWeight: 600 }}>{vehicle.axle_layout ? humanize(vehicle.axle_layout) : '—'}</div>
            </div>
          </section>
        )}

        <section className="table-card">
          <div className="table-head">
            <h3>Tyre inventory</h3>
            <button className="btn primary" onClick={() => { setEditingTyre(null); setShowTyreForm(true); }} disabled={!vehicleId}>
              + Add tyre
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Position</th><th>Brand</th><th>Size</th><th>Fitted</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {vehicleTyres.map((t) => (
                  <tr key={t.id}>
                    <td>{t.position || '—'}</td>
                    <td>{t.brand || '—'}</td>
                    <td>{t.size || '—'}</td>
                    <td className="tnum">{t.fitted_date ? DATE_FMT.format(new Date(t.fitted_date)) : '—'}</td>
                    <td>
                      <span className={`pill ${t.status === 'fitted' ? 'on' : t.status === 'spare' ? 'svc' : 'off'}`}>{humanize(t.status)}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditingTyre(t); setShowTyreForm(true); }}>Edit</button>
                        {t.status !== 'retired' && <button className="link-btn danger" onClick={() => handleRetireTyre(t)}>Retire</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleTyres.length === 0 && <div className="empty-state">No tyres tracked for this vehicle yet.</div>}
          </div>
        </section>

        <section className="table-card">
          <div className="table-head">
            <h3>Service history (alignment, rotation, repairs)</h3>
            <button className="btn primary" onClick={() => setShowServiceForm(true)} disabled={!vehicleId}>
              + Log service
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Odometer</th><th>Vendor</th><th></th></tr></thead>
              <tbody>
                {vehicleServices.map((s) => (
                  <tr key={s.id}>
                    <td>{humanize(s.service_type)}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(s.date))}</td>
                    <td className="tnum">{s.odometer ? Number(s.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td>{s.vendor || '—'}</td>
                    <td><button className="link-btn danger" onClick={() => handleRetireService(s)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleServices.length === 0 && <div className="empty-state">No service history logged yet.</div>}
          </div>
        </section>
      </main>

      {showTyreForm && (
        <TyreForm
          initial={editingTyre}
          vehicleId={vehicleId}
          onClose={() => setShowTyreForm(false)}
          onSaved={() => { setShowTyreForm(false); load(); }}
        />
      )}
      {showServiceForm && (
        <TyreServiceForm
          vehicleId={vehicleId}
          tyres={vehicleTyres}
          onClose={() => setShowServiceForm(false)}
          onSaved={() => { setShowServiceForm(false); load(); }}
        />
      )}
    </>
  );
}

function toTyreInput(t: Tyre): TyreInput {
  return {
    vehicle: t.vehicle, position: t.position, brand: t.brand, size: t.size,
    serial_number: t.serial_number, fitted_date: t.fitted_date, purchase_date: t.purchase_date,
    purchase_price: t.purchase_price, odometer_at_fitting: t.odometer_at_fitting, notes: t.notes,
  };
}

function TyreForm({
  initial, vehicleId, onClose, onSaved,
}: { initial: Tyre | null; vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<TyreInput>(initial ? toTyreInput(initial) : { ...BLANK_TYRE, vehicle: vehicleId });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TyreInput>(key: K, value: TyreInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateTyre(initial.id, form);
      else await createTyre(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save tyre.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit tyre' : 'Add tyre'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="position">Position</label>
            <input id="position" placeholder="e.g. Front left" value={form.position} onChange={(e) => set('position', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="brand">Brand</label>
            <input id="brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="size">Size</label>
            <input id="size" placeholder="e.g. 295/95 R25" value={form.size} onChange={(e) => set('size', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="serial_number">Serial number</label>
            <input id="serial_number" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fitted_date">Fitted date</label>
            <input id="fitted_date" type="date" value={form.fitted_date ?? ''} onChange={(e) => set('fitted_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="odometer_at_fitting">Odometer at fitting</label>
            <input id="odometer_at_fitting" type="number" step="0.1" value={form.odometer_at_fitting ?? ''}
              onChange={(e) => set('odometer_at_fitting', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="purchase_date">Purchase date</label>
            <input id="purchase_date" type="date" value={form.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="purchase_price">Purchase price (₹)</label>
            <input id="purchase_price" type="number" step="0.01" value={form.purchase_price ?? ''}
              onChange={(e) => set('purchase_price', e.target.value || null)} />
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
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add tyre'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TyreServiceForm({
  vehicleId, tyres, onClose, onSaved,
}: { vehicleId: string; tyres: Tyre[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<TyreServiceInput>({ ...BLANK_SERVICE, vehicle: vehicleId });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TyreServiceInput>(key: K, value: TyreServiceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createTyreService(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save service record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log tyre service" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="service_type">Type</label>
            <select id="service_type" value={form.service_type} onChange={(e) => set('service_type', e.target.value)}>
              {TYRE_SERVICE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tyre">Specific tyre (optional)</label>
            <select id="tyre" value={form.tyre ?? ''} onChange={(e) => set('tyre', e.target.value || null)}>
              <option value="">Whole vehicle (e.g. alignment)</option>
              {tyres.map((t) => <option key={t.id} value={t.id}>{t.position || t.brand || t.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" step="0.1" value={form.odometer ?? ''} onChange={(e) => set('odometer', e.target.value || null)} />
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

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Log service'}</button>
        </div>
      </form>
    </Modal>
  );
}
