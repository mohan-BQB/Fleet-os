import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listDrivers } from '../api/fleet';
import {
  createLedgerEntry, listLedgerEntries, listTripSheets, retireLedgerEntry, updateLedgerEntry,
} from '../api/operations';
import { ApiError } from '../api/client';
import { LEDGER_ENTRY_TYPES, type Driver, type DriverLedgerEntry, type DriverLedgerEntryInput, type TripSheet } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const BLANK: DriverLedgerEntryInput = {
  driver: '', trip_sheet: null, date: new Date().toISOString().slice(0, 10),
  entry_type: 'wage', amount: '', remarks: '',
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
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Driver</th><th>Type</th><th>Date</th><th>Amount</th><th>Trip</th><th>Remarks</th><th></th></tr>
              </thead>
              <tbody>
                {entries?.map((entry) => (
                  <tr key={entry.id}>
                    <td>{driverName(entry.driver)}</td>
                    <td>
                      <span className={`pill ${entry.entry_type === 'deduction' ? 'off' : entry.entry_type === 'advance' ? 'svc' : 'on'}`}>
                        {humanize(entry.entry_type)}
                      </span>
                    </td>
                    <td className="tnum">{DATE_FMT.format(new Date(entry.date))}</td>
                    <td className="tnum">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                    <td>{tripSheetLabel(entry.trip_sheet)}</td>
                    <td>{entry.remarks || '—'}</td>
                    <td>
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
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function LedgerEntryForm({
  initial, drivers, tripSheets, onClose, onSaved,
}: {
  initial: DriverLedgerEntry | null; drivers: Driver[]; tripSheets: TripSheet[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<DriverLedgerEntryInput>(initial ?? BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DriverLedgerEntryInput>(key: K, value: DriverLedgerEntryInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const relevantTrips = tripSheets.filter((t) => t.driver === form.driver);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateLedgerEntry(initial.id, form);
      else await createLedgerEntry(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save ledger entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit ledger entry' : 'Add ledger entry'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="driver">Driver</label>
            <select id="driver" required value={form.driver}
              onChange={(e) => set('driver', e.target.value)}>
              <option value="">Select a driver…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="entry_type">Type</label>
            <select id="entry_type" value={form.entry_type} onChange={(e) => set('entry_type', e.target.value)}>
              {LEDGER_ENTRY_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
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

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
