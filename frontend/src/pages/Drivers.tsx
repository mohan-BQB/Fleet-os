import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import ComplianceModal from '../components/ComplianceModal';
import DriverDetailModal from '../components/DriverDetailModal';
import AuditHistory from '../components/AuditHistory';
import { DriverIcon } from '../components/icons';
import { changeDriverStatus, createDriver, listDrivers, rejoinDriver, updateDriver, type DriverFiles } from '../api/fleet';
import { ApiError } from '../api/client';
import {
  DRIVER_DOC_TYPES, EMPLOYMENT_TYPES, LICENCE_CLASSES, WAGE_BASES, type Driver, type DriverInput,
} from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: DriverInput = {
  code: '', name: '', dob: null, mobile: '', emergency_contact: '', address: '', blood_group: '',
  licence_number: '', licence_class: '', licence_issue_date: null,
  licence_valid_till: null, issuing_rto: '', badge_number: '', badge_valid_till: null,
  date_of_joining: null, employment_type: 'permanent', wage_basis: 'monthly', wage_amount: null,
  advance_limit: null, has_app_login: false,
};

// Explicit field-by-field copy, not a spread of the full record: `initial`
// carries photo/licence_copy/id_proof as URL strings, and blindly spreading
// it into form state would send those strings alongside a newly-picked File
// under the same multipart field name when editing.
function toDriverInput(d: Driver): DriverInput {
  return {
    code: d.code, name: d.name, dob: d.dob, mobile: d.mobile,
    emergency_contact: d.emergency_contact, address: d.address, blood_group: d.blood_group,
    licence_number: d.licence_number, licence_class: d.licence_class,
    licence_issue_date: d.licence_issue_date, licence_valid_till: d.licence_valid_till,
    issuing_rto: d.issuing_rto, badge_number: d.badge_number, badge_valid_till: d.badge_valid_till,
    date_of_joining: d.date_of_joining,
    employment_type: d.employment_type, wage_basis: d.wage_basis, wage_amount: d.wage_amount,
    advance_limit: d.advance_limit, has_app_login: d.has_app_login,
  };
}

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [complianceDriver, setComplianceDriver] = useState<Driver | null>(null);
  const [detailDriver, setDetailDriver] = useState<Driver | null>(null);

  function load() {
    listDrivers().then(setDrivers).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(d: Driver) {
    if (!confirm(`Relieve ${d.name}? They will be marked relieved, not deleted.`)) return;
    await changeDriverStatus(d.id, 'relieved');
    load();
  }

  async function handleRejoin(d: Driver) {
    if (!confirm(`Rejoin ${d.name}? They'll be reactivated on the same record.`)) return;
    await rejoinDriver(d.id);
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
          <div className="table-scroll responsive">
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
                    <td data-label="Driver">
                      <button
                        type="button"
                        className="veh-cell"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                        onClick={() => setDetailDriver(d)}
                      >
                        <span className="veh-icon"><DriverIcon /></span>
                        <div>
                          <div className="reg-no" style={{ fontFamily: 'inherit' }}>{d.name}</div>
                          {d.code && <div className="veh-cat">{d.code}</div>}
                        </div>
                      </button>
                    </td>
                    <td data-label="Mobile">{d.mobile || '—'}</td>
                    <td data-label="Licence">{d.licence_number || '—'}</td>
                    <td data-label="Licence valid till" className="tnum">{d.licence_valid_till ? DATE_FMT.format(new Date(d.licence_valid_till)) : '—'}</td>
                    <td data-label="Wage">
                      {d.wage_basis === 'per_trip'
                        ? 'Per trip (set on each trip)'
                        : d.wage_amount ? `₹${Number(d.wage_amount).toLocaleString('en-IN')} / ${humanize(d.wage_basis).toLowerCase()}` : '—'}
                    </td>
                    <td data-label="Status"><span className={`pill ${d.status === 'active' ? 'on' : d.status === 'on_leave' ? 'svc' : 'off'}`}>{humanize(d.status)}</span></td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setComplianceDriver(d)}>Compliance</button>
                        <button className="link-btn" onClick={() => { setEditing(d); setShowForm(true); }}>Edit</button>
                        {d.status !== 'relieved' && (
                          <button className="link-btn danger" onClick={() => handleRetire(d)}>Relieve</button>
                        )}
                        {d.status === 'relieved' && (
                          <button className="link-btn" onClick={() => handleRejoin(d)}>Rejoin</button>
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
      {complianceDriver && (
        <ComplianceModal
          holderType="driver"
          holderId={complianceDriver.id}
          holderLabel={complianceDriver.name}
          docTypes={DRIVER_DOC_TYPES}
          onClose={() => setComplianceDriver(null)}
        />
      )}
      {detailDriver && (
        <DriverDetailModal
          driver={detailDriver}
          onClose={() => setDetailDriver(null)}
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
  function setWageBasis(value: string) {
    setForm((f) => ({
      ...f,
      wage_basis: value,
      // No fixed amount applies once paid per-trip (see the backend
      // clearing it the same way) - it's entered fresh on each trip sheet.
      wage_amount: value === 'per_trip' ? null : f.wage_amount,
    }));
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
    <Modal title={initial ? `Edit ${initial.name}` : 'Add driver — master data'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h4>Identity &amp; contact</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="name">Driver name</label>
              <input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dob">Date of birth</label>
              <input id="dob" type="date" value={form.dob ?? ''} onChange={(e) => set('dob', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="mobile">Mobile number</label>
              <input id="mobile" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact">Emergency contact</label>
              <input id="emergency_contact" value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="blood_group">Blood group</label>
              <input id="blood_group" placeholder="e.g. O+" value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Licence &amp; badge</h4>
          <div className="form-grid">
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
              <label htmlFor="licence_issue_date">Issue date</label>
              <input id="licence_issue_date" type="date" value={form.licence_issue_date ?? ''}
                onChange={(e) => set('licence_issue_date', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="licence_valid_till">
                Licence valid till
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--warn-soft)',
                  color: 'var(--warn)', marginLeft: 6, fontWeight: 700,
                }}
                >
                  reminder
                </span>
              </label>
              <input id="licence_valid_till" type="date" value={form.licence_valid_till ?? ''}
                onChange={(e) => set('licence_valid_till', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="issuing_rto">Issuing RTO</label>
              <input id="issuing_rto" value={form.issuing_rto} onChange={(e) => set('issuing_rto', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="badge_number">Badge number</label>
              <input id="badge_number" value={form.badge_number} onChange={(e) => set('badge_number', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="badge_valid_till">
                Badge valid till
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--warn-soft)',
                  color: 'var(--warn)', marginLeft: 6, fontWeight: 700,
                }}
                >
                  reminder
                </span>
              </label>
              <input id="badge_valid_till" type="date" value={form.badge_valid_till ?? ''}
                onChange={(e) => set('badge_valid_till', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Employment &amp; pay</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="code">Driver ID</label>
              <input id="code" placeholder="DRV-01" value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="date_of_joining">Date of joining</label>
              <input id="date_of_joining" type="date" value={form.date_of_joining ?? ''}
                onChange={(e) => set('date_of_joining', e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="employment_type">Employment type</label>
              <select id="employment_type" value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="wage_basis">Wage basis</label>
              <select id="wage_basis" value={form.wage_basis} onChange={(e) => setWageBasis(e.target.value)}>
                {WAGE_BASES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
              </select>
            </div>
            {form.wage_basis === 'per_trip' ? (
              <div className="field" style={{ fontSize: 12, color: 'var(--ink-soft)', alignSelf: 'end' }}>
                No fixed amount to set - a per-trip driver's wage is entered on each trip sheet instead.
              </div>
            ) : (
              <div className="field">
                <label htmlFor="wage_amount">Wage amount (₹)</label>
                <input id="wage_amount" type="number" step="0.01" required value={form.wage_amount ?? ''}
                  onChange={(e) => set('wage_amount', e.target.value || null)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="advance_limit">Advance limit (₹)</label>
              <input id="advance_limit" type="number" step="0.01" placeholder="No cap" value={form.advance_limit ?? ''}
                onChange={(e) => set('advance_limit', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>App access</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Give this driver an app login (role: driver)</span>
            <div className="toggle-group">
              <button type="button" className={form.has_app_login ? 'on' : ''} onClick={() => set('has_app_login', true)}>Yes</button>
              <button type="button" className={!form.has_app_login ? 'on' : ''} onClick={() => set('has_app_login', false)}>No</button>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Attachments</h4>
          <div className="form-grid">
            <label className="upload-field">
              📷 Driver photo
              <input type="file" accept="image/*" onChange={(e) => setFile('photo', e.target.files?.[0] ?? null)} />
            </label>
            <label className="upload-field">
              📄 Licence copy
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile('licence_copy', e.target.files?.[0] ?? null)} />
            </label>
            <label className="upload-field">
              📄 ID proof
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile('id_proof', e.target.files?.[0] ?? null)} />
            </label>
            {initial?.photo && !files.photo && (
              <a href={initial.photo} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current photo</a>
            )}
            {initial?.licence_copy && !files.licence_copy && (
              <a href={initial.licence_copy} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current licence copy</a>
            )}
            {initial?.id_proof && !files.id_proof && (
              <a href={initial.id_proof} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current ID proof</a>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="Driver" objectId={initial.id} />}

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
