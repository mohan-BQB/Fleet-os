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

// A generic, editable starting point - not exact axle geometry for every
// model. Front axle is single, rear axles assumed dual (standard for
// Indian commercial lorries); position stays a free-text field, so any of
// these can be renamed to match the real vehicle.
function generatePositions(numberOfTyres: number, spareTyres: number): string[] {
  const positions: string[] = [];
  if (numberOfTyres <= 2) {
    if (numberOfTyres >= 1) positions.push('Front');
    if (numberOfTyres >= 2) positions.push('Rear');
  } else if (numberOfTyres <= 4) {
    positions.push('Front Left', 'Front Right');
    if (numberOfTyres === 3) positions.push('Rear');
    else if (numberOfTyres === 4) positions.push('Rear Left', 'Rear Right');
  } else {
    positions.push('Front Left', 'Front Right');
    let remaining = numberOfTyres - 2;
    let axle = 1;
    while (remaining > 0) {
      const take = Math.min(4, remaining);
      if (take === 4) {
        positions.push(
          `Rear Axle ${axle} Left Outer`, `Rear Axle ${axle} Left Inner`,
          `Rear Axle ${axle} Right Outer`, `Rear Axle ${axle} Right Inner`,
        );
      } else if (take === 2) {
        positions.push(`Rear Axle ${axle} Left`, `Rear Axle ${axle} Right`);
      } else {
        for (let i = 1; i <= take; i++) positions.push(`Rear Axle ${axle} - ${i}`);
      }
      remaining -= take;
      axle += 1;
    }
  }
  for (let i = 1; i <= spareTyres; i++) positions.push(`Spare ${i}`);
  return positions;
}

function distanceRun(tyre: Tyre, vehicle: Vehicle | undefined): number | null {
  if (!vehicle?.current_meter || !tyre.odometer_at_fitting) return null;
  const run = Number(vehicle.current_meter) - Number(tyre.odometer_at_fitting);
  return run >= 0 ? run : null;
}

const BLANK_TYRE: TyreInput = {
  vehicle: '', position: '', brand: '', size: '', serial_number: '',
  fitted_date: null, purchase_date: null, purchase_price: null,
  odometer_at_fitting: null, notes: '',
};

const BLANK_SERVICE: TyreServiceInput = {
  vehicle: '', tyre: null, service_type: 'alignment', date: new Date().toISOString().slice(0, 10),
  odometer: null, tread_depth_in: null, new_position: '', vendor: '', notes: '',
};

// Most recent tread_depth_in reading logged for this tyre, if any.
function latestTreadDepth(tyre: Tyre, services: TyreService[]): string | null {
  const readings = services
    .filter((s) => s.tyre === tyre.id && s.tread_depth_in !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return readings[0]?.tread_depth_in ?? null;
}

export default function Tyres() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [services, setServices] = useState<TyreService[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [prefillPosition, setPrefillPosition] = useState<string | null>(null);
  const [historyTyre, setHistoryTyre] = useState<Tyre | null>(null);

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

        {vehicle && (
          <PositionMap
            vehicle={vehicle}
            tyres={vehicleTyres}
            services={vehicleServices}
            onAddAt={(position) => { setEditingTyre(null); setPrefillPosition(position); setShowTyreForm(true); }}
          />
        )}

        <section className="table-card">
          <div className="table-head">
            <h3>Tyre inventory</h3>
            <button className="btn primary" onClick={() => { setEditingTyre(null); setPrefillPosition(null); setShowTyreForm(true); }} disabled={!vehicleId}>
              + Add tyre
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Position</th><th>Brand</th><th>Size</th><th>Fitted</th><th>Distance run</th><th>Tread depth</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {vehicleTyres.map((t) => {
                  const run = distanceRun(t, vehicle);
                  const tread = latestTreadDepth(t, vehicleServices);
                  return (
                    <tr key={t.id}>
                      <td>{t.position || '—'}</td>
                      <td>{t.brand || '—'}</td>
                      <td>{t.size || '—'}</td>
                      <td className="tnum">{t.fitted_date ? DATE_FMT.format(new Date(t.fitted_date)) : '—'}</td>
                      <td className="tnum">{run !== null ? `${run.toLocaleString('en-IN')} ${vehicle?.metering_unit ?? 'km'}` : '—'}</td>
                      <td className="tnum">{tread !== null ? `${tread}"` : '—'}</td>
                      <td>
                        <span className={`pill ${t.status === 'fitted' ? 'on' : t.status === 'spare' ? 'svc' : 'off'}`}>{humanize(t.status)}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="link-btn" onClick={() => setHistoryTyre(t)}>History</button>
                          <button className="link-btn" onClick={() => { setEditingTyre(t); setPrefillPosition(null); setShowTyreForm(true); }}>Edit</button>
                          {t.status !== 'retired' && <button className="link-btn danger" onClick={() => handleRetireTyre(t)}>Retire</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              <thead><tr><th>Type</th><th>Date</th><th>Odometer</th><th>Tread depth</th><th>New position</th><th>Vendor</th><th></th></tr></thead>
              <tbody>
                {vehicleServices.map((s) => (
                  <tr key={s.id}>
                    <td>{humanize(s.service_type)}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(s.date))}</td>
                    <td className="tnum">{s.odometer ? Number(s.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td className="tnum">{s.tread_depth_in ? `${s.tread_depth_in}"` : '—'}</td>
                    <td>{s.new_position || '—'}</td>
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

      {showTyreForm && vehicle && (
        <TyreForm
          initial={editingTyre}
          vehicle={vehicle}
          prefillPosition={prefillPosition}
          existingPositions={vehicleTyres.filter((t) => t.status !== 'retired').map((t) => t.position)}
          onClose={() => setShowTyreForm(false)}
          onSaved={() => { setShowTyreForm(false); load(); }}
        />
      )}
      {showServiceForm && vehicle && (
        <TyreServiceForm
          vehicle={vehicle}
          tyres={vehicleTyres}
          onClose={() => setShowServiceForm(false)}
          onSaved={() => { setShowServiceForm(false); load(); }}
        />
      )}
      {historyTyre && (
        <TyreHistory
          tyre={historyTyre}
          services={services.filter((s) => s.tyre === historyTyre.id)}
          onClose={() => setHistoryTyre(null)}
        />
      )}
    </>
  );
}

function PositionMap({
  vehicle, tyres, services, onAddAt,
}: { vehicle: Vehicle; tyres: Tyre[]; services: TyreService[]; onAddAt: (position: string) => void }) {
  const positions = useMemo(
    () => generatePositions(vehicle.number_of_tyres, vehicle.spare_tyres),
    [vehicle.number_of_tyres, vehicle.spare_tyres],
  );
  const byPosition = new Map(tyres.filter((t) => t.status !== 'retired' && t.position).map((t) => [t.position, t]));

  return (
    <section className="table-card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>Position map</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {positions.map((pos) => {
          const tyre = byPosition.get(pos);
          const run = tyre ? distanceRun(tyre, vehicle) : null;
          const tread = tyre ? latestTreadDepth(tyre, services) : null;
          return (
            <div key={pos} style={{
              border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px',
              background: tyre ? 'var(--good-soft)' : 'var(--paper)',
            }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 600 }}>
                {pos}
              </div>
              {tyre ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{tyre.brand || 'Unbranded'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{tyre.size || '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {run !== null ? `${run.toLocaleString('en-IN')} ${vehicle.metering_unit}` : 'No odometer data'}
                  </div>
                  {tread !== null && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Tread {tread}"</div>
                  )}
                </>
              ) : (
                <button type="button" className="link-btn" style={{ marginTop: 8, fontSize: 11.5 }} onClick={() => onAddAt(pos)}>
                  + Assign tyre
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
  initial, vehicle, prefillPosition, existingPositions, onClose, onSaved,
}: {
  initial: Tyre | null; vehicle: Vehicle; prefillPosition: string | null; existingPositions: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<TyreInput>(
    initial ? toTyreInput(initial) : { ...BLANK_TYRE, vehicle: vehicle.id, position: prefillPosition ?? '' },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestedPositions = useMemo(() => {
    const all = generatePositions(vehicle.number_of_tyres, vehicle.spare_tyres);
    const taken = new Set(existingPositions.filter((p) => p !== initial?.position));
    return all.filter((p) => !taken.has(p));
  }, [vehicle.number_of_tyres, vehicle.spare_tyres, existingPositions, initial]);

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
            <label htmlFor="position">Position (optional)</label>
            <input id="position" list="position-suggestions" placeholder="e.g. Front left"
              value={form.position} onChange={(e) => set('position', e.target.value)} />
            <datalist id="position-suggestions">
              {suggestedPositions.map((p) => <option key={p} value={p} />)}
            </datalist>
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

const BULK_SERVICE_TYPES = new Set(['rotation', 'balancing']);

function TyreServiceForm({
  vehicle, tyres, onClose, onSaved,
}: { vehicle: Vehicle; tyres: Tyre[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<TyreServiceInput>({ ...BLANK_SERVICE, vehicle: vehicle.id });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const positionOptions = useMemo(
    () => generatePositions(vehicle.number_of_tyres, vehicle.spare_tyres),
    [vehicle.number_of_tyres, vehicle.spare_tyres],
  );

  // Rotation/balancing service a full set of tyres in one visit, not just
  // one - so those two types switch the form into a bulk mode covering
  // every currently-fitted tyre at once.
  const isBulk = BULK_SERVICE_TYPES.has(form.service_type);
  const fittedTyres = useMemo(() => tyres.filter((t) => t.status === 'fitted'), [tyres]);
  const [bulkPositions, setBulkPositions] = useState<Record<string, string>>(
    () => Object.fromEntries(fittedTyres.map((t) => [t.id, t.position])),
  );

  function set<K extends keyof TyreServiceInput>(key: K, value: TyreServiceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setServiceType(type: string) {
    set('service_type', type);
    if (BULK_SERVICE_TYPES.has(type)) {
      setBulkPositions(Object.fromEntries(fittedTyres.map((t) => [t.id, t.position])));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isBulk && form.service_type === 'rotation') {
      const targets = Object.values(bulkPositions).filter(Boolean);
      const duplicates = targets.filter((p, i) => targets.indexOf(p) !== i);
      if (duplicates.length > 0) {
        setError(`More than one tyre is set to move to "${duplicates[0]}" - each position can only hold one tyre.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (isBulk) {
        await Promise.all(fittedTyres.map((t) => createTyreService({
          vehicle: vehicle.id, tyre: t.id, service_type: form.service_type, date: form.date,
          odometer: form.odometer, tread_depth_in: form.tread_depth_in,
          new_position: form.service_type === 'rotation' ? bulkPositions[t.id] : '',
          vendor: form.vendor, notes: form.notes,
        })));
      } else {
        await createTyreService(form);
      }
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
            <select id="service_type" value={form.service_type} onChange={(e) => setServiceType(e.target.value)}>
              {TYRE_SERVICE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>

          {!isBulk && (
            <>
              <div className="field">
                <label htmlFor="tyre">Specific tyre (optional)</label>
                <select id="tyre" value={form.tyre ?? ''} onChange={(e) => set('tyre', e.target.value || null)}>
                  <option value="">Whole vehicle (e.g. alignment)</option>
                  {tyres.map((t) => <option key={t.id} value={t.id}>{t.position || t.brand || t.id.slice(0, 8)}</option>)}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="new_position">
                  {form.tyre
                    ? `Rotated to position (currently: ${tyres.find((t) => t.id === form.tyre)?.position || 'unassigned'})`
                    : 'Rotated to position (select a specific tyre above first)'}
                </label>
                <select id="new_position" disabled={!form.tyre}
                  value={form.new_position} onChange={(e) => set('new_position', e.target.value)}>
                  <option value="">No position change</option>
                  {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" step="0.1" value={form.odometer ?? ''} onChange={(e) => set('odometer', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="tread_depth_in">Tread depth (in)</label>
            <input id="tread_depth_in" type="number" step="0.01" value={form.tread_depth_in ?? ''}
              onChange={(e) => set('tread_depth_in', e.target.value || null)} />
          </div>

          {isBulk && (
            <div className="field span-2">
              <label>
                {form.service_type === 'rotation'
                  ? `All ${fittedTyres.length} fitted tyres - set each one's new position`
                  : `All ${fittedTyres.length} fitted tyres will be logged as balanced`}
              </label>
              {fittedTyres.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No fitted tyres tracked for this vehicle yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fittedTyres.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12.5, minWidth: 130, flex: 1 }}>
                        <strong>{t.position || 'Unassigned'}</strong>
                        <span style={{ color: 'var(--ink-soft)' }}> · {t.brand || 'Unbranded'}</span>
                      </div>
                      {form.service_type === 'rotation' && (
                        <select value={bulkPositions[t.id] ?? t.position}
                          onChange={(e) => setBulkPositions((p) => ({ ...p, [t.id]: e.target.value }))}
                          style={{ flex: 1 }}>
                          {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
          <button type="submit" className="btn primary" disabled={saving || (isBulk && fittedTyres.length === 0)}>
            {saving ? 'Saving…' : isBulk ? `Log for ${fittedTyres.length} tyres` : 'Log service'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TyreHistory({
  tyre, services, onClose,
}: { tyre: Tyre; services: TyreService[]; onClose: () => void }) {
  const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Modal title={`History — ${tyre.position || tyre.brand || 'Tyre'}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
        {tyre.brand || 'Unbranded'} {tyre.size && `· ${tyre.size}`} · Currently at {tyre.position || 'unassigned'}
      </div>
      {sorted.length === 0 ? (
        <div className="empty-state">No service history for this tyre yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                <span>{humanize(s.service_type)}</span>
                <span className="tnum" style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>{DATE_FMT.format(new Date(s.date))}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {s.odometer && <span>Odometer: {Number(s.odometer).toLocaleString('en-IN')}</span>}
                {s.tread_depth_in && <span>Tread: {s.tread_depth_in}"</span>}
                {s.new_position && <span>Moved to: {s.new_position}</span>}
                {s.vendor && <span>Vendor: {s.vendor}</span>}
              </div>
              {s.notes && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{s.notes}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
