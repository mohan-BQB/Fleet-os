import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import {
  createComplianceDocument, listComplianceDocuments, listDrivers, listVehicles,
  retireComplianceDocument, updateComplianceDocument,
} from '../api/fleet';
import { ApiError } from '../api/client';
import { DOCUMENT_TYPES, type ComplianceDocument, type DocumentInput, type Driver, type Vehicle } from '../api/types';

// Explicit field-by-field copy, not a spread of the full record: `initial`
// carries `file` as a URL string, and blindly spreading it into form state
// would send that string alongside the real File object under the same
// multipart field name when editing.
function toDocumentInput(doc: ComplianceDocument): DocumentInput {
  return {
    vehicle: doc.vehicle, driver: doc.driver, doc_type: doc.doc_type, doc_number: doc.doc_number,
    issue_date: doc.issue_date, valid_till: doc.valid_till,
    reminder_days_before: doc.reminder_days_before, notes: doc.notes,
  };
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: DocumentInput = {
  vehicle: null, driver: null, doc_type: 'insurance', doc_number: '',
  issue_date: null, valid_till: null, reminder_days_before: 30, notes: '',
};

export default function Compliance() {
  const [docs, setDocs] = useState<ComplianceDocument[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ComplianceDocument | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listComplianceDocuments().then(setDocs).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
    listDrivers().then(setDrivers).catch(() => {});
  }, []);

  async function handleRetire(doc: ComplianceDocument) {
    if (!confirm(`Retire this ${humanize(doc.doc_type)} record?`)) return;
    await retireComplianceDocument(doc.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Compliance</h1>
          <div className="sub">{docs ? `${docs.length} documents` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add document
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Holder</th>
                  <th>Valid till</th>
                  <th>Status</th>
                  <th>File</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs?.map((doc) => (
                  <tr key={doc.id}>
                    <td>{humanize(doc.doc_type)}</td>
                    <td>{doc.holder_display}</td>
                    <td className="tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</td>
                    <td>
                      {doc.is_expired ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
                        : doc.is_due ? <span className="pill svc">Due soon</span>
                        : <span className="pill on">Valid</span>}
                    </td>
                    <td>
                      {doc.file
                        ? <a href={doc.file} target="_blank" rel="noreferrer" className="link-btn">View</a>
                        : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(doc); setShowForm(true); }}>Edit</button>
                        <button className="link-btn danger" onClick={() => handleRetire(doc)}>Retire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {docs && docs.length === 0 && (
              <div className="empty-state">No compliance documents yet. Add your first one.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <DocumentForm
          initial={editing}
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function DocumentForm({
  initial, vehicles, drivers, onClose, onSaved,
}: {
  initial: ComplianceDocument | null; vehicles: Vehicle[]; drivers: Driver[];
  onClose: () => void; onSaved: () => void;
}) {
  const [holderType, setHolderType] = useState<'vehicle' | 'driver'>(
    initial?.driver ? 'driver' : 'vehicle'
  );
  const [form, setForm] = useState<DocumentInput>(initial ? toDocumentInput(initial) : BLANK);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function switchHolderType(type: 'vehicle' | 'driver') {
    setHolderType(type);
    setForm((f) => ({ ...f, vehicle: type === 'vehicle' ? f.vehicle : null, driver: type === 'driver' ? f.driver : null }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const holderId = holderType === 'vehicle' ? form.vehicle : form.driver;
    if (!holderId) {
      setError(`Choose a ${holderType}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateComplianceDocument(initial.id, form, file);
      else await createComplianceDocument(form, file);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save document.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit document' : 'Add compliance document'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label>Applies to</label>
            <div style={{ display: 'flex', gap: 16, fontSize: 13.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="radio" name="holderType" checked={holderType === 'vehicle'}
                  onChange={() => switchHolderType('vehicle')} /> Vehicle
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="radio" name="holderType" checked={holderType === 'driver'}
                  onChange={() => switchHolderType('driver')} /> Driver
              </label>
            </div>
          </div>

          {holderType === 'vehicle' ? (
            <div className="field span-2">
              <label htmlFor="vehicle">Vehicle</label>
              <select id="vehicle" required value={form.vehicle ?? ''} onChange={(e) => set('vehicle', e.target.value || null)}>
                <option value="">Select a vehicle…</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
              </select>
            </div>
          ) : (
            <div className="field span-2">
              <label htmlFor="driver">Driver</label>
              <select id="driver" required value={form.driver ?? ''} onChange={(e) => set('driver', e.target.value || null)}>
                <option value="">Select a driver…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="doc_type">Document type</label>
            <select id="doc_type" value={form.doc_type} onChange={(e) => set('doc_type', e.target.value)}>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="doc_number">Document number</label>
            <input id="doc_number" value={form.doc_number} onChange={(e) => set('doc_number', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="issue_date">Issue date</label>
            <input id="issue_date" type="date" value={form.issue_date ?? ''}
              onChange={(e) => set('issue_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="valid_till">Valid till</label>
            <input id="valid_till" type="date" value={form.valid_till ?? ''}
              onChange={(e) => set('valid_till', e.target.value || null)} />
          </div>

          <div className="field">
            <label htmlFor="reminder_days_before">Remind (days before expiry)</label>
            <input id="reminder_days_before" type="number" value={form.reminder_days_before}
              onChange={(e) => set('reminder_days_before', Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <div className="field span-2">
            <label htmlFor="file">Document file (photo/scan/PDF)</label>
            <input id="file" type="file" accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {initial?.file && !file && (
              <a href={initial.file} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>
                View current file
              </a>
            )}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add document'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
