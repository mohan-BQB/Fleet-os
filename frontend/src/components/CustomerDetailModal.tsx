import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from './Modal';
import SidePanel from './SidePanel';
import { StoreIcon } from './icons';
import { createCustomerLedgerEntry, listCustomerLedgerEntries } from '../api/customers';
import { ApiError } from '../api/client';
import {
  CUSTOMER_LEDGER_CREDIT_TYPES, VENDOR_PAYMENT_MODES, type Customer, type CustomerLedgerEntry,
} from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Auto-posted invoices carry their own remarks verbatim (e.g. "Freight —
// Quarry to Site A" - see operations.TripSheetViewSet.approve); manual
// entries fall back to the entry type.
function particulars(entry: CustomerLedgerEntry): string {
  const label = entry.entry_type === 'receipt'
    ? `Receipt${entry.payment_mode ? ` (${humanize(entry.payment_mode)})` : ''}`
    : 'Invoice';
  if (!entry.remarks) return label;
  return entry.remarks === label ? entry.remarks : `${label} — ${entry.remarks}`;
}

function ReceiptForm({
  customer, onClose, onSaved,
}: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!paymentMode) {
      setError('Select how this was received.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCustomerLedgerEntry({
        customer: customer.id, date, entry_type: 'receipt', payment_mode: paymentMode, amount, remarks,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record receipt.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Record receipt — ${customer.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rcv_date">Date</label>
            <input id="rcv_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rcv_amount">Amount (₹)</label>
            <input id="rcv_amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rcv_mode">Payment mode</label>
            <select id="rcv_mode" required value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="" disabled>Select…</option>
              {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="rcv_remarks">Remarks</label>
            <input id="rcv_remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !paymentMode}>
            {saving ? 'Saving…' : 'Record receipt'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface Props {
  customer: Customer;
  onClose: () => void;
}

export default function CustomerDetailModal({ customer, onClose }: Props) {
  const [entries, setEntries] = useState<CustomerLedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);

  const load = useCallback(() => {
    listCustomerLedgerEntries()
      .then((all) => setEntries(all.filter((e) => e.customer === customer.id)))
      .catch((err) => setError(err.message ?? 'Failed to load ledger entries.'));
  }, [customer.id]);

  useEffect(load, [load]);

  // Oldest first, so the running receivable balance accumulates
  // top-to-bottom like a passbook. An invoice is the credit side (a
  // receivable grows on credit); a receipt is the debit side (it reduces
  // the receivable) - the mirror of VendorDetailModal's ledger math.
  const rows = useMemo(() => {
    if (!entries) return null;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let balance = 0;
    return sorted.map((entry) => {
      const amount = Number(entry.amount);
      const isCredit = CUSTOMER_LEDGER_CREDIT_TYPES.has(entry.entry_type);
      balance += isCredit ? amount : -amount;
      return { entry, isCredit, amount, balance };
    });
  }, [entries]);

  const currentBalance = rows && rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return (
    <SidePanel title={customer.name} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 15 }}>
            {customer.name ? initials(customer.name) : <StoreIcon />}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{customer.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Receivable ledger</div>
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
            {currentBalance > 0 ? 'Outstanding receivable' : currentBalance < 0 ? 'Credit with customer' : 'Settled'}
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
        {rows && rows.length === 0 && <div className="empty-state">No invoices or receipts recorded yet.</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        <button type="button" className="btn primary" onClick={() => setShowReceiptForm(true)}>Record receipt</button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>

      {showReceiptForm && (
        <ReceiptForm
          customer={customer}
          onClose={() => setShowReceiptForm(false)}
          onSaved={() => { setShowReceiptForm(false); load(); }}
        />
      )}
    </SidePanel>
  );
}
