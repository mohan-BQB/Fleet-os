import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from './Modal';
import SidePanel from './SidePanel';
import { StoreIcon } from './icons';
import { createVendorLedgerEntry, listVendorLedgerEntries } from '../api/vendors';
import { ApiError } from '../api/client';
import {
  VENDOR_LEDGER_CREDIT_TYPES, VENDOR_PAYMENT_MODES, type Vendor, type VendorLedgerEntry,
} from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Auto-posted bills carry their own remarks verbatim ("Expense — Toll",
// "Fuel log" - see Expense.save()/FuelLog.save()); manual entries fall back
// to the entry type.
function particulars(entry: VendorLedgerEntry): string {
  const label = entry.entry_type === 'payment'
    ? `Payment${entry.payment_mode ? ` (${humanize(entry.payment_mode)})` : ''}`
    : 'Bill';
  if (!entry.remarks) return label;
  return entry.remarks === label ? entry.remarks : `${label} — ${entry.remarks}`;
}

function PaymentForm({
  vendor, onClose, onSaved,
}: { vendor: Vendor; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [remarks, setRemarks] = useState('');
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
      await createVendorLedgerEntry({
        vendor: vendor.id, date, entry_type: 'payment', payment_mode: paymentMode, amount, remarks,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Record payment — ${vendor.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pay_date">Date</label>
            <input id="pay_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pay_amount">Amount (₹)</label>
            <input id="pay_amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pay_mode">Payment mode</label>
            <select id="pay_mode" required value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="" disabled>Select…</option>
              {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="pay_remarks">Remarks</label>
            <input id="pay_remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !paymentMode}>
            {saving ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface Props {
  vendor: Vendor;
  onClose: () => void;
}

export default function VendorDetailModal({ vendor, onClose }: Props) {
  const [entries, setEntries] = useState<VendorLedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const load = useCallback(() => {
    listVendorLedgerEntries()
      .then((all) => setEntries(all.filter((e) => e.vendor === vendor.id)))
      .catch((err) => setError(err.message ?? 'Failed to load ledger entries.'));
  }, [vendor.id]);

  useEffect(load, [load]);

  // Oldest first, so the running payable balance accumulates top-to-bottom
  // like a passbook. A bill is the credit side (a payable liability grows
  // on credit); a payment is the debit side (it reduces the payable).
  const rows = useMemo(() => {
    if (!entries) return null;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let balance = 0;
    return sorted.map((entry) => {
      const amount = Number(entry.amount);
      const isCredit = VENDOR_LEDGER_CREDIT_TYPES.has(entry.entry_type);
      balance += isCredit ? amount : -amount;
      return { entry, isCredit, amount, balance };
    });
  }, [entries]);

  const currentBalance = rows && rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return (
    <SidePanel title={vendor.name} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 15 }}>
            {vendor.name ? initials(vendor.name) : <StoreIcon />}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{vendor.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{humanize(vendor.vendor_type)} · Payable ledger</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Current balance</div>
          <div
            className="tnum"
            style={{
              fontSize: 22, fontWeight: 700, margin: '2px 0 0',
              color: currentBalance > 0 ? 'var(--warn)' : currentBalance < 0 ? 'var(--good)' : 'var(--ink)',
            }}
          >
            {currentBalance < 0 ? '−' : ''}{CURRENCY.format(Math.abs(currentBalance))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {currentBalance > 0 ? 'Outstanding payable' : currentBalance < 0 ? 'Credit with vendor' : 'Settled'}
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Particulars</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            {rows?.map(({ entry, isCredit, amount, balance }) => (
              <tr key={entry.id}>
                <td className="tnum">{DATE_FMT.format(new Date(entry.date))}</td>
                <td>{particulars(entry)}</td>
                <td className="tnum" style={{ color: !isCredit ? 'var(--critical)' : undefined }}>
                  {isCredit ? '–' : CURRENCY.format(amount)}
                </td>
                <td className="tnum" style={{ color: isCredit ? 'var(--good)' : undefined }}>
                  {isCredit ? CURRENCY.format(amount) : '–'}
                </td>
                <td className="tnum" style={{ color: balance < 0 ? 'var(--good)' : balance > 0 ? 'var(--warn)' : undefined }}>
                  {balance < 0 ? `−${CURRENCY.format(Math.abs(balance))}` : CURRENCY.format(balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <div className="empty-state">No bills or payments recorded yet.</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        <button type="button" className="btn primary" onClick={() => setShowPaymentForm(true)}>Record payment</button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>

      {showPaymentForm && (
        <PaymentForm
          vendor={vendor}
          onClose={() => setShowPaymentForm(false)}
          onSaved={() => { setShowPaymentForm(false); load(); }}
        />
      )}
    </SidePanel>
  );
}
