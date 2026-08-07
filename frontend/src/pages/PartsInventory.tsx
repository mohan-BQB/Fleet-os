import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import PartItemDetailModal from '../components/PartItemDetailModal';
import AuditHistory from '../components/AuditHistory';
import { BoxIcon } from '../components/icons';
import { listVendors } from '../api/vendors';
import {
  createPartInventoryItem, listPartInventoryItems, retirePartInventoryItem, updatePartInventoryItem,
} from '../api/parts';
import { ApiError } from '../api/client';
import type { PartInventoryItem, PartInventoryItemInput, Vendor } from '../api/types';

const BLANK: PartInventoryItemInput = { name: '', part_number: '', unit: 'pcs', reorder_level: null, notes: '' };

function toInput(i: PartInventoryItem): PartInventoryItemInput {
  return { name: i.name, part_number: i.part_number, unit: i.unit, reorder_level: i.reorder_level, notes: i.notes };
}

export default function PartsInventory() {
  const [items, setItems] = useState<PartInventoryItem[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PartInventoryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState<PartInventoryItem | null>(null);

  function load() {
    listPartInventoryItems().then(setItems).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVendors().then(setVendors).catch(() => {});
  }, []);

  // Keep the open detail panel's on-hand figure fresh after a receipt is
  // posted from inside it, without closing the panel.
  function refreshDetail() {
    listPartInventoryItems().then((all) => {
      setItems(all);
      setDetailItem((prev) => (prev ? all.find((i) => i.id === prev.id) ?? null : null));
    }).catch((err) => setError(err.message));
  }

  async function handleRetire(i: PartInventoryItem) {
    if (!confirm(`Retire "${i.name}"? It'll no longer be selectable for new stock or issues.`)) return;
    await retirePartInventoryItem(i.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Parts Inventory</h1>
          <div className="sub">Spare parts bought ahead of need, and where every unit came from and went</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Add part
        </button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Part</th><th>Part #</th><th>On hand</th><th>Reorder level</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items?.map((i) => {
                  const low = i.reorder_level != null && Number(i.quantity_on_hand) <= Number(i.reorder_level);
                  return (
                    <tr key={i.id}>
                      <td>
                        <button type="button" className="veh-cell btn-reset" onClick={() => setDetailItem(i)}>
                          <span className="veh-icon"><BoxIcon /></span>
                          <div className="reg-no" style={{ fontFamily: 'inherit' }}>{i.name}</div>
                        </button>
                      </td>
                      <td>{i.part_number || '—'}</td>
                      <td className="tnum" style={{ color: low ? 'var(--critical)' : undefined }}>
                        {Number(i.quantity_on_hand).toLocaleString('en-IN')} {i.unit}
                      </td>
                      <td className="tnum">{i.reorder_level != null ? `${Number(i.reorder_level)} ${i.unit}` : '—'}</td>
                      <td><span className={`pill ${i.status === 'active' ? 'on' : 'off'}`}>{i.status === 'active' ? 'Active' : 'Retired'}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="link-btn" onClick={() => { setEditing(i); setShowForm(true); }}>Edit</button>
                          {i.status === 'active' && <button className="link-btn danger" onClick={() => handleRetire(i)}>Retire</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items && items.length === 0 && (
              <div className="empty-state">No parts stocked yet. Add one, then receive stock against it.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <ItemForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
      {detailItem && (
        <PartItemDetailModal
          item={detailItem}
          vendors={vendors}
          onClose={() => setDetailItem(null)}
          onChanged={refreshDetail}
        />
      )}
    </>
  );
}

function ItemForm({
  initial, onClose, onSaved,
}: { initial: PartInventoryItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PartInventoryItemInput>(initial ? toInput(initial) : BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PartInventoryItemInput>(key: K, value: PartInventoryItemInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updatePartInventoryItem(initial.id, form);
      else await createPartInventoryItem(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save part.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add stocked part'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="name">Part name</label>
            <input id="name" required placeholder="e.g. Air Filter — Tata 407" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="part_number">Part number</label>
            <input id="part_number" value={form.part_number} onChange={(e) => set('part_number', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="unit">Unit</label>
            <input id="unit" required value={form.unit} onChange={(e) => set('unit', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reorder_level">Reorder level (optional)</label>
            <input id="reorder_level" type="number" step="0.1" min="0" value={form.reorder_level ?? ''}
              onChange={(e) => set('reorder_level', e.target.value || null)} />
          </div>
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="PartInventoryItem" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add part'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
