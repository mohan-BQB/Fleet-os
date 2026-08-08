import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import VendorDetailModal from '../components/VendorDetailModal';
import AuditHistory from '../components/AuditHistory';
import { StoreIcon } from '../components/icons';
import { createVendor, listVendors, retireVendor, updateVendor } from '../api/vendors';
import { ApiError } from '../api/client';
import { VENDOR_TYPES, type Vendor, type VendorInput } from '../api/types';

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: VendorInput = {
  name: '', vendor_type: 'garage', contact_person: '', mobile: '', email: '',
  address: '', gstin: '', tds_applicable: false, notes: '',
};

function toVendorInput(v: Vendor): VendorInput {
  return {
    name: v.name, vendor_type: v.vendor_type, contact_person: v.contact_person, mobile: v.mobile,
    email: v.email, address: v.address, gstin: v.gstin, tds_applicable: v.tds_applicable, notes: v.notes,
  };
}

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  function load() {
    listVendors().then(setVendors).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(v: Vendor) {
    if (!confirm(`Deactivate ${v.name}? It will be marked inactive, not deleted.`)) return;
    await retireVendor(v.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Vendors</h1>
          <div className="sub">{vendors ? `${vendors.length} total` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add vendor
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors?.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Vendor">
                      <button
                        type="button"
                        className="veh-cell btn-reset"
                        onClick={() => setDetailVendor(v)}
                      >
                        <span className="veh-icon"><StoreIcon /></span>
                        <div className="reg-no" style={{ fontFamily: 'inherit' }}>{v.name}</div>
                      </button>
                    </td>
                    <td data-label="Type">{humanize(v.vendor_type)}</td>
                    <td data-label="Contact">{v.contact_person || '—'}</td>
                    <td data-label="Mobile">{v.mobile || '—'}</td>
                    <td data-label="GSTIN">{v.gstin || '—'}</td>
                    <td data-label="Status"><span className={`pill ${v.status === 'active' ? 'on' : 'off'}`}>{humanize(v.status)}</span></td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(v); setShowForm(true); }}>Edit</button>
                        {v.status === 'active' && (
                          <button className="link-btn danger" onClick={() => handleRetire(v)}>Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vendors && vendors.length === 0 && (
              <div className="empty-state">No vendors yet. Add your first one.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <VendorForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          onClose={() => setDetailVendor(null)}
        />
      )}
    </>
  );
}

function VendorForm({
  initial, onClose, onSaved,
}: { initial: Vendor | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VendorInput>(initial ? toVendorInput(initial) : BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof VendorInput>(key: K, value: VendorInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateVendor(initial.id, form);
      else await createVendor(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save vendor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add vendor'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Vendor type</label>
            <div className="chip-group">
              {VENDOR_TYPES.map((t) => (
                <span
                  key={t}
                  className={`chip${form.vendor_type === t ? ' on' : ''}`}
                  onClick={() => set('vendor_type', t)}
                >
                  {humanize(t)}
                </span>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="name">Vendor name</label>
              <input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="contact_person">Contact person</label>
              <input id="contact_person" value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="mobile">Mobile</label>
              <input id="mobile" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="gstin">GSTIN</label>
              <input id="gstin" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
            </div>
            <div className="field span-2">
              <label htmlFor="address">Address</label>
              <input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="field span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={form.tds_applicable} onChange={(e) => set('tds_applicable', e.target.checked)} />
                TDS applicable on payments to this vendor
              </label>
            </div>
            <div className="field span-2">
              <label htmlFor="notes">Notes</label>
              <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="Vendor" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add vendor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
