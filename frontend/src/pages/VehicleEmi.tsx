import { Fragment, useEffect, useMemo, useState } from 'react';
import { listVehicleLoanInstallments, markVehicleLoanInstallmentPaid } from '../api/fleet';
import { ApiError } from '../api/client';
import { VEHICLE_LOAN_PAYMENT_MODES, type VehicleLoanInstallment } from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type StatusFilter = 'due' | 'paid' | 'all';

export default function VehicleEmi() {
  const [installments, setInstallments] = useState<VehicleLoanInstallment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('due');
  const [search, setSearch] = useState('');

  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidDate, setPaidDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    listVehicleLoanInstallments().then(setInstallments).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const rows = useMemo(() => {
    if (!installments) return null;
    let list = installments;
    if (statusFilter === 'due') list = list.filter((i) => !i.paid);
    else if (statusFilter === 'paid') list = list.filter((i) => i.paid);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.registration_number.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }, [installments, statusFilter, search]);

  const totalDue = installments?.filter((i) => !i.paid).reduce((s, i) => s + Number(i.amount), 0) ?? 0;
  const overdueCount = installments?.filter((i) => !i.paid && i.is_overdue).length ?? 0;

  async function handleMarkPaid(id: string) {
    if (!paymentMode) return;
    setSaving(true);
    try {
      await markVehicleLoanInstallmentPaid(id, paidDate, paymentMode);
      setPayingId(null);
      setPaymentMode('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Vehicle EMI</h1>
          <div className="sub">
            {CURRENCY.format(totalDue)} outstanding{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg" style={{ width: 'fit-content' }}>
            <button className={statusFilter === 'due' ? 'active' : ''} onClick={() => setStatusFilter('due')}>Due</button>
            <button className={statusFilter === 'paid' ? 'active' : ''} onClick={() => setStatusFilter('paid')}>Paid</button>
            <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>All</button>
          </div>
          <input
            className="search-input" placeholder="Search by vehicle…" value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 220 }}
          />
        </div>

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Vehicle</th><th>Due date</th><th>Amount</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows?.map((inst) => (
                  <Fragment key={inst.id}>
                    <tr>
                      <td className="reg-no">{inst.registration_number}</td>
                      <td className="tnum">{DATE_FMT.format(new Date(inst.due_date))}</td>
                      <td className="tnum">{CURRENCY.format(Number(inst.amount))}</td>
                      <td>
                        {inst.paid
                          ? <span className="pill on">Paid{inst.paid_date ? ` · ${DATE_FMT.format(new Date(inst.paid_date))}` : ''}</span>
                          : inst.is_overdue
                            ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                            : <span className="pill svc">Upcoming</span>}
                      </td>
                      <td>
                        {!inst.paid && (
                          <button className="link-btn" onClick={() => setPayingId(payingId === inst.id ? null : inst.id)}>
                            Mark paid
                          </button>
                        )}
                      </td>
                    </tr>
                    {payingId === inst.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--paper)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}>
                            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
                            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                              <option value="" disabled>Payment mode…</option>
                              {VEHICLE_LOAN_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                            </select>
                            <button type="button" className="btn primary" disabled={saving || !paymentMode}
                              onClick={() => handleMarkPaid(inst.id)} style={{ padding: '6px 12px', fontSize: 12.5 }}>
                              {saving ? 'Saving…' : 'Confirm paid'}
                            </button>
                            <button type="button" className="btn" onClick={() => setPayingId(null)} style={{ padding: '6px 12px', fontSize: 12.5 }}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {rows && rows.length === 0 && (
              <div className="empty-state">
                {statusFilter === 'due' ? 'Nothing due — every EMI is settled.' : 'No installments here.'}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
