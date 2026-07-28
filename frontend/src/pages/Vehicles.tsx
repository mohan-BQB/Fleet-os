import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import ComplianceModal from '../components/ComplianceModal';
import AuditHistory from '../components/AuditHistory';
import { TruckIcon } from '../components/icons';
import { createVehicle, listVehicles, retireVehicle, updateVehicle } from '../api/fleet';
import { ApiError } from '../api/client';
import {
  AXLE_LAYOUTS, FUEL_TYPES, TRACKING_MODES, VEHICLE_CATEGORIES, VEHICLE_DOC_TYPES, VEHICLE_USAGE,
  type Vehicle, type VehicleInput,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: VehicleInput = {
  registration_number: '', category: 'lorry', usage: 'commercial', tracking_mode: 'manual',
  rc_valid_till: null, maker: '', model: '', mfg_year: null, fuel_type: '', fleet_id: '',
  current_meter: null, meter_reading_date: null,
  number_of_tyres: 6, spare_tyres: 1, axle_layout: '',
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [complianceVehicle, setComplianceVehicle] = useState<Vehicle | null>(null);

  function load() {
    listVehicles().then(setVehicles).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(v: Vehicle) {
    if (!confirm(`Retire ${v.registration_number}? It will be marked sold, not deleted.`)) return;
    await retireVehicle(v.id);
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
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vehicles?.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="veh-cell">
                        <span className="veh-icon"><TruckIcon /></span>
                        <div className="reg-no">{v.registration_number}</div>
                      </div>
                    </td>
                    <td>{humanize(v.category)}</td>
                    <td>{humanize(v.usage)}</td>
                    <td>{v.tracking_mode === 'gps' ? 'GPS' : 'Manual'}</td>
                    <td className="tnum">{v.number_of_tyres} + {v.spare_tyres} spare</td>
                    <td className="tnum">{v.rc_valid_till ? DATE_FMT.format(new Date(v.rc_valid_till)) : '—'}</td>
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
                ))}
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
    </>
  );
}

function VehicleForm({
  initial, onClose, onSaved,
}: { initial: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VehicleInput>(initial ?? BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateVehicle(initial.id, form);
      else await createVehicle(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save vehicle.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.registration_number}` : 'Add vehicle'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="reg">Registration number</label>
            <input id="reg" required value={form.registration_number}
              onChange={(e) => set('registration_number', e.target.value.toUpperCase())} />
          </div>

          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="usage">Usage</label>
            <select id="usage" value={form.usage} onChange={(e) => set('usage', e.target.value)}>
              {VEHICLE_USAGE.map((u) => <option key={u} value={u}>{humanize(u)}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tracking">Tracking mode</label>
            <select id="tracking" value={form.tracking_mode} onChange={(e) => set('tracking_mode', e.target.value as 'gps' | 'manual')}>
              {TRACKING_MODES.map((t) => <option key={t} value={t}>{t === 'gps' ? 'GPS' : 'Manual'}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fuel">Fuel type</label>
            <select id="fuel" value={form.fuel_type} onChange={(e) => set('fuel_type', e.target.value)}>
              <option value="">—</option>
              {FUEL_TYPES.map((f) => <option key={f} value={f}>{humanize(f)}</option>)}
            </select>
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
            <label htmlFor="fleet_id">Fleet nickname</label>
            <input id="fleet_id" placeholder="e.g. Lorry 3" value={form.fleet_id}
              onChange={(e) => set('fleet_id', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="rc_valid_till">RC valid till</label>
            <input id="rc_valid_till" type="date" value={form.rc_valid_till ?? ''}
              onChange={(e) => set('rc_valid_till', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="current_meter">Current odometer</label>
            <input id="current_meter" type="number" step="0.1" value={form.current_meter ?? ''}
              onChange={(e) => set('current_meter', e.target.value || null)} />
          </div>

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
