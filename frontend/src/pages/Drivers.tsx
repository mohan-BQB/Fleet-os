import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { DriverIcon } from '../components/icons';
import { createDriver, listDrivers, retireDriver, updateDriver, type DriverFiles } from '../api/fleet';
import { ApiError } from '../api/client';
import {
  EMPLOYMENT_TYPES, LICENCE_CLASSES, WAGE_BASES, type Driver, type DriverInput,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: DriverInput = {
  code: '', name: '', mobile: '', licence_number: '', licence_class: '',
  licence_valid_till: null, badge_number: '', badge_valid_till: null,
  employment_type: 'permanent', wage_basis: 'monthly', wage_amount: null,
};

// Explicit field-by-field copy, not a spread of the full record: `initial`
// carries photo/licence_copy/id_proof as URL strings, and blindly spreading
// it into form state would send those strings alongside a newly-picked File
// under the same multipart field name when editing.
function toDriverInput(d: Driver): DriverInput {
  return {
    code: d.code, name: d.name, mobile: d.mobile, licence_number: d.licence_number,
    licence_class: d.licence_class, licence_valid_till: d.licence_valid_till,
    badge_number: d.badge_number, badge_valid_till: d.badge_valid_till,
    employment_type: d.employment_type, wage_basis: d.wage_basis, wage_amount: d.wage_amount,
  };
}

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listDrivers().then(setDrivers).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(d: Driver) {
    if (!confirm(`Relieve ${d.name}? They will be marked relieved, not deleted.`)) return;
    await retireDriver(d.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Drivers</h1>
          <div className="sub">{drivers ? `${drivers.length} total` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add driver
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Mobile</th>
                  <th>Licence</th>
                  <th>Licence valid till</th>
                  <th>Wage</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drivers?.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="veh-cell">
                        <span className="veh-icon"><DriverIcon /></span>
                        <div>
                          <div className="reg-no" style={{ fontFamily: 'inherit' }}>{d.name}</div>
                          {d.code && <div className="veh-cat">{d.code}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{d.mobile || '—'}</td>
                    <td>{d.licence_number || '—'}</td>
                    <td className="tnum">{d.licence_valid_till ? DATE_FMT.format(new Date(d.licence_valid_till)) : '—'}</td>
                    <td>{d.wage_amount ? `₹${Number(d.wage_amount).toLocaleString('en-IN')} / ${humanize(d.wage_basis).toLowerCase()}` : '—'}</td>
                    <td><span className={`pill ${d.status === 'active' ? 'on' : d.status === 'on_leave' ? 'svc' : 'off'}`}>{humanize(d.status)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(d); setShowForm(true); }}>Edit</button>
                        {d.status === 'active' && (
                          <button className="link-btn danger" onClick={() => handleRetire(d)}>Relieve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {drivers && drivers.length === 0 && (
              <div className="empty-state">No drivers yet. Add your first one.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <DriverForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function DriverForm({
  initial, onClose, onSaved,
}: { initial: Driver | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<DriverInput>(initial ? toDriverInput(initial) : BLANK);
  const [files, setFiles] = useState<DriverFiles>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DriverInput>(key: K, value: DriverInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setFile(key: keyof DriverFiles, value: File | null) {
    setFiles((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateDriver(initial.id, form, files);
      else await createDriver(form, files);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save driver.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add driver'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="name">Full name</label>
            <input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="code">Driver code</label>
            <input id="code" placeholder="e.g. DRV-01" value={form.code} onChange={(e) => set('code', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mobile">Mobile</label>
            <input id="mobile" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="licence_number">Licence number</label>
            <input id="licence_number" value={form.licence_number} onChange={(e) => set('licence_number', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="licence_class">Licence class</label>
            <select id="licence_class" value={form.licence_class} onChange={(e) => set('licence_class', e.target.value)}>
              <option value="">—</option>
              {LICENCE_CLASSES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="licence_valid_till">Licence valid till</label>
            <input id="licence_valid_till" type="date" value={form.licence_valid_till ?? ''}
              onChange={(e) => set('licence_valid_till', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="badge_valid_till">Badge valid till</label>
            <input id="badge_valid_till" type="date" value={form.badge_valid_till ?? ''}
              onChange={(e) => set('badge_valid_till', e.target.value || null)} />
          </div>

          <div className="field">
            <label htmlFor="employment_type">Employment type</label>
            <select id="employment_type" value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wage_basis">Wage basis</label>
            <select id="wage_basis" value={form.wage_basis} onChange={(e) => set('wage_basis', e.target.value)}>
              {WAGE_BASES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
            </select>
          </div>

          <div className="field span-2">
            <label htmlFor="wage_amount">Wage amount (₹)</label>
            <input id="wage_amount" type="number" step="0.01" value={form.wage_amount ?? ''}
              onChange={(e) => set('wage_amount', e.target.value || null)} />
          </div>

          <div className="field">
            <label htmlFor="photo">Photo</label>
            <input id="photo" type="file" accept="image/*" onChange={(e) => setFile('photo', e.target.files?.[0] ?? null)} />
            {initial?.photo && !files.photo && (
              <a href={initial.photo} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current</a>
            )}
          </div>
          <div className="field">
            <label htmlFor="licence_copy">Licence copy</label>
            <input id="licence_copy" type="file" accept="application/pdf,image/*" onChange={(e) => setFile('licence_copy', e.target.files?.[0] ?? null)} />
            {initial?.licence_copy && !files.licence_copy && (
              <a href={initial.licence_copy} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current</a>
            )}
          </div>
          <div className="field span-2">
            <label htmlFor="id_proof">ID proof</label>
            <input id="id_proof" type="file" accept="application/pdf,image/*" onChange={(e) => setFile('id_proof', e.target.files?.[0] ?? null)} />
            {initial?.id_proof && !files.id_proof && (
              <a href={initial.id_proof} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current</a>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add driver'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
