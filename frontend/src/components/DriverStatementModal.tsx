import { useMemo, useState } from 'react';
import SidePanel from './SidePanel';
import { PrinterIcon } from './icons';
import { LEDGER_CREDIT_TYPES, type Driver, type DriverLedgerEntry } from '../api/types';
import { driverBalance } from '../lib/ledger';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function particulars(entry: DriverLedgerEntry): string {
  if (entry.entry_type === 'wage' || entry.entry_type === 'bonus') {
    const base = entry.subtype ? humanize(entry.subtype) : entry.entry_type === 'bonus' ? 'Bonus' : 'Salary';
    return entry.remarks ? `${base} (${entry.remarks})` : base;
  }
  const label = entry.entry_type === 'advance' ? 'Advance paid'
    : entry.entry_type === 'payment' ? `Payment${entry.payment_mode ? ` (${humanize(entry.payment_mode)})` : ''}`
    : entry.subtype ? `Deduction — ${humanize(entry.subtype)}`
    : 'Deduction';
  return entry.remarks ? `${label} — ${entry.remarks}` : label;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  const start = `${monthValue}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  return { start, end };
}

interface Props {
  driver: Driver;
  entries: DriverLedgerEntry[];
  onClose: () => void;
}

export default function DriverStatementModal({ driver, entries, onClose }: Props) {
  const [month, setMonth] = useState(currentMonthValue());
  const { start, end } = monthBounds(month);

  const openingBalance = useMemo(
    () => driverBalance(entries.filter((e) => e.date < start)),
    [entries, start],
  );

  const rows = useMemo(() => {
    const monthEntries = entries
      .filter((e) => e.date >= start && e.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let balance = openingBalance;
    return monthEntries.map((entry) => {
      const amount = Number(entry.amount);
      const isCredit = LEDGER_CREDIT_TYPES.has(entry.entry_type);
      balance += isCredit ? amount : -amount;
      return { entry, isCredit, amount, balance };
    });
  }, [entries, start, end, openingBalance]);

  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${start}T00:00:00`));

  return (
    <SidePanel title={`Statement — ${driver.name}`} onClose={onClose} fullScreen>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <label htmlFor="statement-month" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Month</label>
        <input id="statement-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
          <PrinterIcon className="mono" /> Print
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{driver.name}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          {driver.code ? `${driver.code} · ` : ''}Statement for {monthLabel}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
        <div className="tile">
          <div className="tile-label">Opening balance</div>
          <div className="tile-value tnum" style={{ fontSize: 20, color: openingBalance < 0 ? 'var(--critical)' : undefined }}>
            {openingBalance < 0 ? `−${CURRENCY.format(-openingBalance)}` : CURRENCY.format(openingBalance)}
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">Closing balance</div>
          <div className="tile-value tnum" style={{ fontSize: 20, color: closingBalance < 0 ? 'var(--critical)' : undefined }}>
            {closingBalance < 0 ? `−${CURRENCY.format(-closingBalance)}` : CURRENCY.format(closingBalance)}
          </div>
        </div>
      </div>

      <div className="table-scroll responsive">
        <table>
          <thead><tr><th>Date</th><th>Particulars</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            <tr>
              <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(`${start}T00:00:00`))}</td>
              <td data-label="Particulars">Opening balance</td>
              <td data-label="Debit" className="tnum">–</td>
              <td data-label="Credit" className="tnum">–</td>
              <td data-label="Balance" className="tnum" style={{ color: openingBalance < 0 ? 'var(--critical)' : undefined }}>
                {openingBalance < 0 ? `−${CURRENCY.format(-openingBalance)}` : CURRENCY.format(openingBalance)}
              </td>
            </tr>
            {rows.map(({ entry, isCredit, amount, balance }) => (
              <tr key={entry.id}>
                <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(entry.date))}</td>
                <td data-label="Particulars">{particulars(entry)}</td>
                <td data-label="Debit" className="tnum" style={{ color: !isCredit ? 'var(--critical)' : undefined }}>
                  {isCredit ? '–' : CURRENCY.format(amount)}
                </td>
                <td data-label="Credit" className="tnum" style={{ color: isCredit ? 'var(--good)' : undefined }}>
                  {isCredit ? CURRENCY.format(amount) : '–'}
                </td>
                <td data-label="Balance" className="tnum" style={{ color: balance < 0 ? 'var(--critical)' : undefined }}>
                  {balance < 0 ? `−${CURRENCY.format(-balance)}` : CURRENCY.format(balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No entries for {monthLabel}.</div>}
      </div>

      <div className="form-actions no-print">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </SidePanel>
  );
}
