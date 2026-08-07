import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { ApiError } from '../api/client';
import { VENDOR_PAYMENT_MODES } from '../api/types';

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

interface Props {
  title: string;
  vendorName: string;
  amountLabel: string;
  onConfirm: (paymentMode: string) => Promise<unknown>;
  onClose: () => void;
}

// The one place "mark paid" actually happens, for both the expense/fuel-log
// table row action and their forms - a payment mode is never optional here,
// there's no default, and the button stays disabled until one is picked.
// The backend enforces the same rule independently (belt and suspenders),
// so this can't be bypassed by calling the API directly either.
export default function MarkPaidModal({ title, vendorName, amountLabel, onConfirm, onClose }: Props) {
  const [paymentMode, setPaymentMode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!paymentMode) {
      setError('Select how this was paid.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(paymentMode);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark as paid.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Vendor</label>
            <div className="reg-no" style={{ padding: '8px 0' }}>{vendorName}</div>
          </div>
          <div className="field">
            <label>Amount</label>
            <div className="reg-no tnum" style={{ padding: '8px 0' }}>{amountLabel}</div>
          </div>
          <div className="field span-2">
            <label htmlFor="mark_paid_mode">Payment mode</label>
            <select
              id="mark_paid_mode" required autoFocus value={paymentMode}
              onChange={(e) => { setPaymentMode(e.target.value); setError(null); }}
            >
              <option value="" disabled>Select…</option>
              {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !paymentMode}>
            {saving ? 'Saving…' : 'Confirm paid'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
