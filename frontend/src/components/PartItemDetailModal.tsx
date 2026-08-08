import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from './Modal';
import SidePanel from './SidePanel';
import { BoxIcon } from './icons';
import { createPartStockMovement, listPartStockMovements } from '../api/parts';
import { ApiError } from '../api/client';
import type { PartInventoryItem, PartStockMovement, Vendor } from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ReceiveStockForm({
  item, vendors, onClose, onSaved,
}: { item: PartInventoryItem; vendors: Vendor[]; onClose: () => void; onSaved: () => void }) {
  const suppliers = vendors.filter((v) => v.vendor_type === 'parts_supplier' && v.status === 'active');
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [useUnlisted, setUseUnlisted] = useState(false);
  const [unlistedVendorName, setUnlistedVendorName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = !!quantity && Number(quantity) > 0 && !!unitCost && Number(unitCost) > 0
    && (useUnlisted ? !!unlistedVendorName : !!vendor);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) {
      setError('Enter a quantity, unit cost, and who this was bought from.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPartStockMovement({
        item: item.id, movement_type: 'receipt', date, quantity, unit_cost: unitCost,
        vendor: useUnlisted ? null : vendor, unlisted_vendor_name: useUnlisted ? unlistedVendorName : '',
        source_model: '', source_id: '', notes,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record stock receipt.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Receive stock — ${item.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rs_date">Date</label>
            <input id="rs_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rs_quantity">Quantity ({item.unit})</label>
            <input id="rs_quantity" type="number" step="0.1" min="0.1" required value={quantity}
              onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rs_cost">Cost per unit (₹)</label>
            <input id="rs_cost" type="number" step="0.01" min="0.01" required value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="field">
            <label style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Total cost</label>
            <div className="tnum" style={{ padding: '8px 0', fontWeight: 600 }}>
              {quantity && unitCost ? CURRENCY.format(Number(quantity) * Number(unitCost)) : '—'}
            </div>
          </div>
          <div className="field span-2">
            <label htmlFor="rs_vendor">{useUnlisted ? 'Vendor (not in system)' : 'Bought from'}</label>
            {useUnlisted ? (
              <input id="rs_vendor" required placeholder="e.g. Roadside Auto Spares"
                value={unlistedVendorName} onChange={(e) => setUnlistedVendorName(e.target.value)} />
            ) : (
              <select id="rs_vendor" required value={vendor} onChange={(e) => setVendor(e.target.value)}>
                <option value="" disabled>Select…</option>
                {suppliers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
              onClick={() => { setUseUnlisted((u) => !u); setVendor(''); setUnlistedVendorName(''); }}>
              {useUnlisted ? 'Pick from vendor list instead' : 'Vendor not in the system?'}
            </button>
          </div>
          <div className="field span-2">
            <label htmlFor="rs_notes">Notes</label>
            <input id="rs_notes" placeholder="e.g. invoice number" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !ready}>
            {saving ? 'Saving…' : 'Receive stock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function sourceLabel(m: PartStockMovement) {
  if (m.movement_type !== 'issue') return '—';
  if (m.source_model === 'MaintenanceLog') return 'Used in a maintenance service';
  return m.source_model || '—';
}

interface Props {
  item: PartInventoryItem;
  vendors: Vendor[];
  onClose: () => void;
  onChanged: () => void;
}

export default function PartItemDetailModal({ item, vendors, onClose, onChanged }: Props) {
  const [movements, setMovements] = useState<PartStockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReceiveForm, setShowReceiveForm] = useState(false);

  const load = useCallback(() => {
    listPartStockMovements()
      .then((all) => setMovements(all.filter((m) => m.item === item.id)))
      .catch((err) => setError(err.message ?? 'Failed to load stock history.'));
  }, [item.id]);

  useEffect(load, [load]);

  // Oldest first, so a running on-hand quantity reads top-to-bottom like a
  // passbook - the same convention as VendorDetailModal's ledger.
  const rows = useMemo(() => {
    if (!movements) return null;
    const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let running = 0;
    return sorted.map((m) => {
      const qty = Number(m.quantity);
      running += m.movement_type === 'receipt' ? qty : -qty;
      return { m, qty, running };
    });
  }, [movements]);

  return (
    <SidePanel title={item.name} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <BoxIcon />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{item.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              {item.part_number ? `#${item.part_number} · ` : ''}Stock ledger
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>On hand</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, margin: '2px 0 0' }}>
            {Number(item.quantity_on_hand).toLocaleString('en-IN')} <span style={{ fontSize: 13, fontWeight: 400 }}>{item.unit}</span>
          </div>
        </div>
      </div>

      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Date</th><th>Movement</th><th>Qty</th><th>Cost</th><th>From / used by</th><th>Balance</th></tr></thead>
          <tbody>
            {rows?.map(({ m, qty, running }) => (
              <tr key={m.id}>
                <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(m.date))}</td>
                <td data-label="Movement">
                  <span className={`pill ${m.movement_type === 'receipt' ? 'on' : 'svc'}`}>
                    {m.movement_type === 'receipt' ? 'Received' : 'Issued'}
                  </span>
                </td>
                <td data-label="Qty" className="tnum" style={{ color: m.movement_type === 'receipt' ? 'var(--good)' : 'var(--critical)' }}>
                  {m.movement_type === 'receipt' ? '+' : '−'}{qty}
                </td>
                <td data-label="Cost" className="tnum">
                  {m.total_cost ? CURRENCY.format(Number(m.total_cost)) : '—'}
                </td>
                <td data-label="From / used by">
                  {m.movement_type === 'receipt'
                    ? (vendors.find((v) => v.id === m.vendor)?.name || (m.unlisted_vendor_name ? `${m.unlisted_vendor_name} (not in system)` : '—'))
                    : sourceLabel(m)}
                  {m.notes && <div style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>{m.notes}</div>}
                </td>
                <td data-label="Balance" className="tnum">{running}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <div className="empty-state">No stock movements yet.</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        <button type="button" className="btn primary" onClick={() => setShowReceiveForm(true)}>Receive stock</button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>

      {showReceiveForm && (
        <ReceiveStockForm
          item={item}
          vendors={vendors}
          onClose={() => setShowReceiveForm(false)}
          onSaved={() => { setShowReceiveForm(false); load(); onChanged(); }}
        />
      )}
    </SidePanel>
  );
}
