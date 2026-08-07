import { useEffect, useState, type FormEvent } from 'react';
import Modal from './Modal';
import {
  createComplianceDocument, listComplianceDocuments, renewComplianceDocument, retireComplianceDocument,
  updateComplianceDocument,
} from '../api/fleet';
import { ApiError } from '../api/client';
import type { ComplianceDocument, DocumentInput } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

interface Props {
  holderType: 'vehicle' | 'driver';
  holderId: string;
  holderLabel: string;
  docTypes: readonly string[];
  onClose: () => void;
}

export default function ComplianceModal({ holderType, holderId, holderLabel, docTypes, onClose }: Props) {
  const [docs, setDocs] = useState<ComplianceDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = list view; 'new' or a document = the add/edit form view, shown
  // in place of the list rather than as a second stacked modal.
  const [editing, setEditing] = useState<ComplianceDocument | 'new' | null>(null);
  // Renewing is its own small form, not the full edit form - only the
  // fresh number/dates matter, and it creates a new row rather than
  // editing this one in place (see compliance.Document.renew).
  const [renewingDoc, setRenewingDoc] = useState<ComplianceDocument | null>(null);

  function load() {
    listComplianceDocuments()
      .then((all) => setDocs(all.filter((d) => d[holderType] === holderId)))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [holderId, holderType]);

  async function handleRetire(doc: ComplianceDocument) {
    if (!confirm(`Retire this ${humanize(doc.doc_type)} record?`)) return;
    await retireComplianceDocument(doc.id);
    load();
  }

  if (renewingDoc !== null) {
    return (
      <Modal title={`Renew — ${humanize(renewingDoc.doc_type)}`} onClose={onClose}>
        <RenewFields doc={renewingDoc} onCancel={() => setRenewingDoc(null)} onSaved={() => { setRenewingDoc(null); load(); }} />
      </Modal>
    );
  }

  if (editing !== null) {
    return (
      <Modal title={editing === 'new' ? `Add document — ${holderLabel}` : `Edit document — ${holderLabel}`} onClose={onClose}>
        <DocumentFields
          initial={editing === 'new' ? null : editing}
          holderType={holderType}
          holderId={holderId}
          docTypes={docTypes}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      </Modal>
    );
  }

  return (
    <Modal title={`Compliance — ${holderLabel}`} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{docs?.length ?? 0} document{docs?.length === 1 ? '' : 's'}</span>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>+ Add document</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-scroll">
        <table>
          <thead><tr><th>Document</th><th>Valid till</th><th>Status</th><th>File</th><th></th></tr></thead>
          <tbody>
            {docs?.map((doc) => (
              <tr key={doc.id}>
                <td>{humanize(doc.doc_type)}</td>
                <td className="tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</td>
                <td>
                  {doc.is_expired ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
                    : doc.is_due ? <span className="pill svc">Due soon</span>
                    : <span className="pill on">Valid</span>}
                </td>
                <td>{doc.file ? <a href={doc.file} target="_blank" rel="noreferrer" className="link-btn">View</a> : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                <td>
                  <div className="row-actions">
                    <button className="link-btn" onClick={() => setEditing(doc)}>Edit</button>
                    <button className="link-btn" onClick={() => setRenewingDoc(doc)}>Renew</button>
                    <button className="link-btn danger" onClick={() => handleRetire(doc)}>Retire</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs && docs.length === 0 && <div className="empty-state">No compliance documents yet.</div>}
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function DocumentFields({
  initial, holderType, holderId, docTypes, onCancel, onSaved,
}: {
  initial: ComplianceDocument | null; holderType: 'vehicle' | 'driver'; holderId: string;
  docTypes: readonly string[]; onCancel: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<DocumentInput>(initial ? {
    vehicle: initial.vehicle, driver: initial.driver, doc_type: initial.doc_type, doc_number: initial.doc_number,
    issue_date: initial.issue_date, valid_till: initial.valid_till,
    reminder_days_before: initial.reminder_days_before, notes: initial.notes,
  } : {
    vehicle: holderType === 'vehicle' ? holderId : null,
    driver: holderType === 'driver' ? holderId : null,
    doc_type: docTypes[0], doc_number: '', issue_date: null, valid_till: null,
    reminder_days_before: 30, notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="doc_type">Document type</label>
          <select id="doc_type" value={form.doc_type} onChange={(e) => set('doc_type', e.target.value)}>
            {docTypes.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
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
        <button type="button" className="btn" onClick={onCancel}>Back</button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add document'}
        </button>
      </div>
    </form>
  );
}

// Exported for the standalone Compliance.tsx page, which reuses this same
// small renew form rather than duplicating it - this modal's own use above
// stays unchanged.
export function RenewFields({ doc, onCancel, onSaved }: { doc: ComplianceDocument; onCancel: () => void; onSaved: () => void }) {
  const [validTill, setValidTill] = useState('');
  const [docNumber, setDocNumber] = useState(doc.doc_number);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validTill) { setError('Enter the new valid-till date.'); return; }
    setSaving(true);
    setError(null);
    try {
      await renewComplianceDocument(doc.id, { valid_till: validTill, doc_number: docNumber });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not renew this document.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 0 }}>
        This writes a new document with the fresh details and archives the current one - its history stays intact.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="renew_doc_number">Document number</label>
          <input id="renew_doc_number" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="renew_valid_till">New valid till</label>
          <input id="renew_valid_till" type="date" required value={validTill} onChange={(e) => setValidTill(e.target.value)} />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Back</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Renewing…' : 'Renew'}</button>
      </div>
    </form>
  );
}
