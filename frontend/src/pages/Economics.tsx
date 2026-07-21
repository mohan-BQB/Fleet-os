import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listVehicles } from '../api/fleet';
import { createExpense, getVehiclePnL, listExpenses, retireExpense, updateExpense } from '../api/economics';
import { ApiError } from '../api/client';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseInput, type Vehicle, type VehiclePnL } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const BLANK: ExpenseInput = { vehicle: null, category: 'maintenance', date: todayIso(), amount: '', vendor: '', notes: '' };

export default function Economics() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listExpenses().then(setExpenses).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listVehicles().then(setVehicles).catch(() => {});
  }, []);

  const vehicleName = (id: string | null) => (id && vehicles.find((v) => v.id === id)?.registration_number) || 'Company';

  async function handleRetire(exp: Expense) {
    if (!confirm('Retire this expense record?')) return;
    await retireExpense(exp.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Economics</h1>
          <div className="sub">Expenses &amp; per-vehicle P&amp;L</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>+ Add expense</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <PnLCalculator vehicles={vehicles} />

        <section className="table-card">
          <div className="table-head"><h3>Expenses ({expenses?.length ?? 0})</h3></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Vehicle</th><th>Category</th><th>Date</th><th>Amount</th><th>Vendor</th><th></th></tr>
              </thead>
              <tbody>
                {expenses?.map((exp) => (
                  <tr key={exp.id}>
                    <td className="reg-no">{vehicleName(exp.vehicle)}</td>
                    <td>{humanize(exp.category)}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(exp.date))}</td>
                    <td className="tnum">₹{Number(exp.amount).toLocaleString('en-IN')}</td>
                    <td>{exp.vendor || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditing(exp); setShowForm(true); }}>Edit</button>
                        <button className="link-btn danger" onClick={() => handleRetire(exp)}>Retire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expenses && expenses.length === 0 && <div className="empty-state">No expenses recorded yet.</div>}
          </div>
        </section>
      </main>

      {showForm && (
        <ExpenseForm
          initial={editing}
          vehicles={vehicles}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function PnLCalculator({ vehicles }: { vehicles: Vehicle[] }) {
  const [vehicle, setVehicle] = useState('');
  const [start, setStart] = useState(monthStartIso());
  const [end, setEnd] = useState(todayIso());
  const [result, setResult] = useState<VehiclePnL | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCalculate(e: FormEvent) {
    e.preventDefault();
    if (!vehicle) { setError('Choose a vehicle.'); return; }
    setLoading(true);
    setError(null);
    try {
      setResult(await getVehiclePnL(vehicle, start, end));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not calculate P&L.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="table-card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>P&amp;L calculator</h3>
      <form onSubmit={handleCalculate} className="form-grid">
        <div className="field span-2">
          <label htmlFor="pnl_vehicle">Vehicle</label>
          <select id="pnl_vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="">Select a vehicle…</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pnl_start">From</label>
          <input id="pnl_start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pnl_end">To</label>
          <input id="pnl_end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="field span-2">
          <button type="submit" className="btn primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>
      </form>

      {error && <div className="form-error">{error}</div>}

      {result && (
        <div className="stat-row" style={{ marginTop: 16 }}>
          <div className="tile"><div className="tile-label">Revenue</div><div className="tile-value tnum" style={{ fontSize: 22 }}>{CURRENCY.format(result.revenue)}</div></div>
          <div className="tile"><div className="tile-label">Fuel cost</div><div className="tile-value tnum" style={{ fontSize: 22 }}>{CURRENCY.format(result.fuel_cost)}</div></div>
          <div className="tile"><div className="tile-label">Driver cost</div><div className="tile-value tnum" style={{ fontSize: 22 }}>{CURRENCY.format(result.driver_cost)}</div></div>
          <div className="tile"><div className="tile-label">Other expenses</div><div className="tile-value tnum" style={{ fontSize: 22 }}>{CURRENCY.format(result.other_expenses)}</div></div>
          <div className="tile">
            <div className="tile-label">Net profit</div>
            <div className="tile-value tnum" style={{ fontSize: 22, color: result.net_profit >= 0 ? 'var(--good)' : 'var(--critical)' }}>
              {CURRENCY.format(result.net_profit)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpenseForm({
  initial, vehicles, onClose, onSaved,
}: { initial: Expense | null; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ExpenseInput>(initial ?? BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateExpense(initial.id, form);
      else await createExpense(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" value={form.vehicle ?? ''} onChange={(e) => set('vehicle', e.target.value || null)}>
              <option value="">Company (not vehicle-specific)</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (₹)</label>
            <input id="amount" type="number" step="0.01" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="vendor">Vendor</label>
            <input id="vendor" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
