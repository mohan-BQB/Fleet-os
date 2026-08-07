import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import CustomerDetailModal from '../components/CustomerDetailModal';
import AuditHistory from '../components/AuditHistory';
import { StoreIcon } from '../components/icons';
import { createCustomer, listCustomers, retireCustomer, updateCustomer } from '../api/customers';
import { ApiError } from '../api/client';
import type { Customer, CustomerInput } from '../api/types';

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: CustomerInput = {
  name: '', gstin: '', contact_person: '', mobile: '', email: '', address: '', notes: '',
};

function toCustomerInput(c: Customer): CustomerInput {
  return {
    name: c.name, gstin: c.gstin, contact_person: c.contact_person, mobile: c.mobile,
    email: c.email, address: c.address, notes: c.notes,
  };
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  function load() {
    listCustomers().then(setCustomers).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(c: Customer) {
    if (!confirm(`Deactivate ${c.name}? It will be marked inactive, not deleted.`)) return;
    await retireCustomer(c.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Customers</h1>
          <div className="sub">{customers ? `${customers.length} total` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add customer
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers?.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className="veh-cell btn-reset"
                        onClick={() => setDetailCustomer(c)}
                      >
                        <span className="veh-icon"><StoreIcon /></span>
                        <div className="reg-no" style={{ fontFamily: 'inherit' }}>{c.name}</div>
                      </button>
                    </td>
                    <td>{c.contact_person || '—'}</td>
                    <td>{c.mobile || '—'}</td>
                    <td>{c.gstin || '—'}</td>
                    <td><span className={`pill ${c.status === 'active' ? 'on' : 'off'}`}>{humanize(c.status)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(c); setShowForm(true); }}>Edit</button>
                        {c.status === 'active' && (
                          <button className="link-btn danger" onClick={() => handleRetire(c)}>Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers && customers.length === 0 && (
              <div className="empty-state">No customers yet. Add one, or quick-add from a trip leg.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <CustomerForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
        />
      )}
    </>
  );
}

function CustomerForm({
  initial, onClose, onSaved,
}: { initial: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerInput>(initial ? toCustomerInput(initial) : BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateCustomer(initial.id, form);
      else await createCustomer(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add customer'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="name">Customer name</label>
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
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="Customer" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
