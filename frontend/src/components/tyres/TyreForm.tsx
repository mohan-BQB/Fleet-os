import { useMemo, useState, type FormEvent } from 'react';
import Modal from '../Modal';
import AuditHistory from '../AuditHistory';
import { createTyre, updateTyre } from '../../api/tyres';
import { ApiError } from '../../api/client';
import type { Tyre, TyreInput, Vehicle } from '../../api/types';
import { generatePositions } from './utils';

const BLANK_TYRE: TyreInput = {
  vehicle: '', position: '', brand: '', size: '', serial_number: '',
  fitted_date: null, purchase_date: null, purchase_price: null,
  odometer_at_fitting: null, notes: '', status: 'fitted',
};

function toTyreInput(t: Tyre): TyreInput {
  return {
    vehicle: t.vehicle, position: t.position, brand: t.brand, size: t.size,
    serial_number: t.serial_number, fitted_date: t.fitted_date, purchase_date: t.purchase_date,
    purchase_price: t.purchase_price, odometer_at_fitting: t.odometer_at_fitting, notes: t.notes,
    status: t.status === 'retired' ? 'fitted' : t.status,
  };
}

export function TyreForm({
  initial, vehicle, prefillPosition, existingPositions, onClose, onSaved,
}: {
  initial: Tyre | null; vehicle: Vehicle; prefillPosition: string | null; existingPositions: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<TyreInput>(
    initial ? toTyreInput(initial) : {
      ...BLANK_TYRE, vehicle: vehicle.id, position: prefillPosition ?? '',
      status: prefillPosition?.startsWith('Spare') ? 'spare' : 'fitted',
    },
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
            <label htmlFor="tyre_status">Status</label>
            <select id="tyre_status" value={form.status} onChange={(e) => set('status', e.target.value as 'fitted' | 'spare')}>
              <option value="fitted">Fitted (on a road position)</option>
              <option value="spare">Spare (in stock)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="fitted_date">Fitted date</label>
            <input id="fitted_date" type="date" value={form.fitted_date ?? ''} onChange={(e) => set('fitted_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="odometer_at_fitting">Odometer at fitting</label>
            <input id="odometer_at_fitting" type="number" step="0.1" value={form.odometer_at_fitting ?? ''}
              onChange={(e) => set('odometer_at_fitting', e.target.value || null)} />
            {initial && Number(initial.accumulated_distance) > 0 && (
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                Plus {Number(initial.accumulated_distance).toLocaleString('en-IN')} km carried over from earlier stints
              </span>
            )}
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
        {initial && <AuditHistory modelName="Tyre" objectId={initial.id} />}

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
