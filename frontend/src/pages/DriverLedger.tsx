import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import AuditHistory from '../components/AuditHistory';
import { listDrivers } from '../api/fleet';
import {
  createLedgerEntry, listLedgerEntries, listTripSheets, retireLedgerEntry, updateLedgerEntry,
} from '../api/operations';
import { ApiError } from '../api/client';
import {
  DEDUCTION_SUBTYPES, EARNING_SUBTYPES, LEDGER_ENTRY_TYPES, PAYMENT_MODES,
  type Driver, type DriverLedgerEntry, type DriverLedgerEntryInput, type TripSheet,
} from '../api/types';
import { driverBalance } from '../lib/ledger';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: DriverLedgerEntryInput = {
  driver: '', trip_sheet: null, date: new Date().toISOString().slice(0, 10),
  entry_type: 'wage', subtype: '', payment_mode: '', amount: '', remarks: '',
};

export default function DriverLedger() {
  const [entries, setEntries] = useState<DriverLedgerEntry[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tripSheets, setTripSheets] = useState<TripSheet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DriverLedgerEntry | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listLedgerEntries().then(setEntries).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listDrivers().then(setDrivers).catch(() => {});
    listTripSheets().then(setTripSheets).catch(() => {});
  }, []);

  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? '—';
  const tripSheetLabel = (id: string | null) => {
    if (!id) return '—';
    const ts = tripSheets.find((t) => t.id === id);
    return ts ? DATE_FMT.format(new Date(ts.date)) : '—';
  };

  async function handleRetire(entry: DriverLedgerEntry) {
    if (!confirm('Retire this ledger entry?')) return;
    await retireLedgerEntry(entry.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Driver Ledger</h1>
          <div className="sub">{entries ? `${entries.length} entries` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>+ Add entry</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr><th>Driver</th><th>Type</th><th>Date</th><th>Amount</th><th>Trip</th><th>Remarks</th><th></th></tr>
              </thead>
              <tbody>
                {entries?.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Driver">{driverName(entry.driver)}</td>
                    <td data-label="Type">
                      <span className={`pill ${entry.entry_type === 'wage' || entry.entry_type === 'bonus' ? 'on' : entry.entry_type === 'advance' ? 'svc' : 'off'}`}>
                        {humanize(entry.entry_type)}
                      </span>
                    </td>
                    <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(entry.date))}</td>
                    <td data-label="Amount" className="tnum">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                    <td data-label="Trip">{tripSheetLabel(entry.trip_sheet)}</td>
                    <td data-label="Remarks">{entry.remarks || '—'}</td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(entry); setShowForm(true); }}>Edit</button>
                        <button className="link-btn danger" onClick={() => handleRetire(entry)}>Retire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries && entries.length === 0 && (
              <div className="empty-state">No ledger entries yet. Record an advance or wage payment.</div>
            )}
          </div>
        </section>
      </main>

      {showForm && (
        <LedgerEntryForm
          initial={editing}
          drivers={drivers}
          tripSheets={tripSheets}
          allEntries={entries ?? []}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

interface LedgerEntryFormProps {
  initial: DriverLedgerEntry | null;
  drivers: Driver[];
  tripSheets: TripSheet[];
  // Every ledger entry the form can see, used only to compute the selected
  // driver's current balance (for the advance-limit warning and the
  // net-payable-after-credit hint) - never sent to the server.
  allEntries: DriverLedgerEntry[];
  // Set when opened from a driver's own ledger passbook: the driver (and
  // often the entry type, from which action button was clicked) is fixed
  // and shown as a label instead of a picker.
  presetDriver?: Driver;
  presetEntryType?: typeof LEDGER_ENTRY_TYPES[number];
  // Fixes the subtype too (e.g. "salary" for a wage entry) and hides its
  // picker, same treatment as presetDriver/presetEntryType above.
  presetSubtype?: string;
  // Skips this component's own Modal wrapper and returns just the <form> -
  // for a caller (Expense.tsx's driver-salary shortcut) that wants to host
  // it inside a Modal it already owns, alongside a sibling form.
  bare?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function LedgerEntryForm({
  initial, drivers, tripSheets, allEntries, presetDriver, presetEntryType, presetSubtype, bare, onClose, onSaved,
}: LedgerEntryFormProps) {
  const [form, setForm] = useState<DriverLedgerEntryInput>(() => (initial ?? {
    ...BLANK,
    driver: presetDriver?.id ?? '',
    entry_type: presetEntryType ?? BLANK.entry_type,
    subtype: presetSubtype ?? BLANK.subtype,
  }));
  const [settleNow, setSettleNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DriverLedgerEntryInput>(key: K, value: DriverLedgerEntryInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const relevantTrips = tripSheets.filter((t) => t.driver === form.driver);
  const driver = presetDriver ?? drivers.find((d) => d.id === form.driver);
  const balanceBefore = useMemo(
    () => driverBalance(allEntries.filter((e) => e.driver === form.driver && e.id !== initial?.id)),
    [allEntries, form.driver, initial?.id],
  );
  const amountNum = Number(form.amount) || 0;
  const balanceAfter = form.entry_type === 'advance' ? balanceBefore - amountNum
    : form.entry_type === 'wage' || form.entry_type === 'bonus' ? balanceBefore + amountNum
    : balanceBefore;

  const subtypeOptions = form.entry_type === 'wage' || form.entry_type === 'bonus' ? EARNING_SUBTYPES
    : form.entry_type === 'deduction' ? DEDUCTION_SUBTYPES
    : null;

  const advanceLimit = driver?.advance_limit ? Number(driver.advance_limit) : null;
  const overLimit = form.entry_type === 'advance' && advanceLimit !== null && -balanceAfter > advanceLimit;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateLedgerEntry(initial.id, form);
      } else {
        await createLedgerEntry(form);
        // "salary comes in, the advance is netted off, and you pay only the
        // difference" - rather than making the owner work out the net
        // amount and record a separate payment, do it for them here.
        if (settleNow && (form.entry_type === 'wage' || form.entry_type === 'bonus') && balanceAfter > 0) {
          await createLedgerEntry({
            driver: form.driver, trip_sheet: null, date: form.date,
            entry_type: 'payment', subtype: '', payment_mode: 'cash',
            amount: String(balanceAfter), remarks: 'Auto-settled with salary credit',
          });
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save ledger entry.');
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {presetDriver ? (
            <div className="field span-2">
              <label>Driver</label>
              <div className="reg-no" style={{ padding: '8px 0' }}>{presetDriver.name}</div>
            </div>
          ) : (
            <div className="field span-2">
              <label htmlFor="driver">Driver</label>
              <select id="driver" required value={form.driver}
                onChange={(e) => set('driver', e.target.value)}>
                <option value="">Select a driver…</option>
                {drivers
                  .filter((d) => d.status === 'active' || d.id === form.driver)
                  .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {presetEntryType ? (
            <div className="field">
              <label>Type</label>
              <div className="reg-no" style={{ padding: '8px 0' }}>{humanize(presetEntryType)}</div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="entry_type">Type</label>
              <select id="entry_type" value={form.entry_type}
                onChange={(e) => set('entry_type', e.target.value)}
              >
                {LEDGER_ENTRY_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </select>
            </div>
          )}

          {subtypeOptions && (
            presetSubtype ? (
              <div className="field">
                <label>Subtype</label>
                <div className="reg-no" style={{ padding: '8px 0' }}>{humanize(presetSubtype)}</div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="subtype">Subtype</label>
                <select id="subtype" value={form.subtype} onChange={(e) => set('subtype', e.target.value)}>
                  <option value="">—</option>
                  {subtypeOptions.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                </select>
              </div>
            )
          )}
          {form.entry_type === 'payment' && (
            <div className="field">
              <label htmlFor="payment_mode">Payment mode</label>
              <select id="payment_mode" value={form.payment_mode} onChange={(e) => set('payment_mode', e.target.value)}>
                <option value="">—</option>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="amount">Amount (₹)</label>
            <input id="amount" type="number" step="0.01" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="trip_sheet">Attribute to trip (optional)</label>
            <select id="trip_sheet" value={form.trip_sheet ?? ''} onChange={(e) => set('trip_sheet', e.target.value || null)}>
              <option value="">Not trip-specific (company-level cost)</option>
              {relevantTrips.map((t) => (
                <option key={t.id} value={t.id}>{DATE_FMT.format(new Date(t.date))} &middot; {humanize(t.status)}</option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="remarks">Remarks</label>
            <input id="remarks" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </div>

        {form.entry_type === 'advance' && form.driver && (
          <div
            className="form-error"
            style={overLimit
              ? undefined
              : { color: 'var(--ink-soft)', background: 'var(--paper)' }}
          >
            {overLimit
              ? `This brings outstanding advance to ${CURRENCY.format(-balanceAfter)}, above the ${CURRENCY.format(advanceLimit!)} limit set for this driver.`
              : `Outstanding advance after this entry: ${CURRENCY.format(Math.max(0, -balanceAfter))}`}
          </div>
        )}

        {(form.entry_type === 'wage' || form.entry_type === 'bonus') && form.driver && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 7, background: 'var(--paper)', fontSize: 12.5 }}>
            {balanceBefore < 0 && (
              <div style={{ marginBottom: 6 }}>Outstanding advance: {CURRENCY.format(-balanceBefore)}</div>
            )}
            <div style={{ marginBottom: !initial ? 8 : 0 }}>
              Balance after this credit: <b>{CURRENCY.format(balanceAfter)}</b>
              {balanceAfter > 0 ? ' owed to driver' : balanceAfter < 0 ? ' still owed by driver' : ' — settled'}
            </div>
            {!initial && balanceAfter > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={settleNow} onChange={(e) => setSettleNow(e.target.checked)} />
                Also record a cash payment for {CURRENCY.format(balanceAfter)} now
              </label>
            )}
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="DriverLedgerEntry" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </form>
  );

  if (bare) return body;

  return (
    <Modal title={initial ? 'Edit ledger entry' : 'Add ledger entry'} onClose={onClose}>
      {body}
    </Modal>
  );
}
