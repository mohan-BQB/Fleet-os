import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from './Modal';
import SidePanel from './SidePanel';
import DriverStatementModal from './DriverStatementModal';
import ComplianceModal from './ComplianceModal';
import { TruckIcon } from './icons';
import { usePermission } from '../context/AuthContext';
import { LedgerEntryForm } from '../pages/DriverLedger';
import { changeDriverStatus, listComplianceDocuments, listVehicles, rejoinDriver } from '../api/fleet';
import { createLedgerEntry, listLedgerEntries, listTripSheets } from '../api/operations';
import { ApiError } from '../api/client';
import {
  DRIVER_DOC_TYPES, LEDGER_CREDIT_TYPES, LEDGER_ENTRY_TYPES, type ComplianceDocument, type Driver,
  type DriverLedgerEntry, type TripSheet, type Vehicle,
} from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const FULL_DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long' });

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function particulars(entry: DriverLedgerEntry): string {
  if (entry.entry_type === 'wage' || entry.entry_type === 'bonus') {
    const base = entry.subtype ? humanize(entry.subtype) : entry.entry_type === 'bonus' ? 'Bonus' : 'Salary';
    const month = MONTH_FMT.format(new Date(entry.date));
    return entry.remarks ? `${base} — ${month} (${entry.remarks})` : `${base} — ${month}`;
  }
  const label = entry.entry_type === 'advance' ? 'Advance paid'
    : entry.entry_type === 'payment' ? `Payment${entry.payment_mode ? ` (${humanize(entry.payment_mode)})` : ''}`
    : entry.subtype ? `Deduction — ${humanize(entry.subtype)}`
    : 'Deduction';
  return entry.remarks ? `${label} — ${entry.remarks}` : label;
}

function OpeningBalanceForm({
  driver, onClose, onSaved,
}: { driver: Driver; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<'owed_by_driver' | 'owed_to_driver'>('owed_by_driver');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createLedgerEntry({
        driver: driver.id, trip_sheet: null, date,
        entry_type: direction === 'owed_by_driver' ? 'advance' : 'wage',
        subtype: '', payment_mode: '', amount, remarks: 'Opening balance',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set opening balance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Set opening balance" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label>This driver, as of onboarding</label>
            <div className="toggle-group">
              <button type="button" className={direction === 'owed_by_driver' ? 'on' : ''} onClick={() => setDirection('owed_by_driver')}>
                Owes the company
              </button>
              <button type="button" className={direction === 'owed_to_driver' ? 'on' : ''} onClick={() => setDirection('owed_to_driver')}>
                Is owed by the company
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ob_date">As of date</label>
            <input id="ob_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ob_amount">Amount (₹)</label>
            <input id="ob_amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Set opening balance'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'licence', label: 'Licence & badge' },
  { key: 'ledger', label: 'Ledger' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface Props {
  driver: Driver;
  onClose: () => void;
  onChanged?: (updated: Driver) => void;
  initialTab?: TabKey;
}

export default function DriverDetailModal({ driver: initialDriver, onClose, onChanged, initialTab }: Props) {
  const [driver, setDriver] = useState(initialDriver);
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'info');
  const canChangeStatus = usePermission('drivers', 'change_status');

  const [entries, setEntries] = useState<DriverLedgerEntry[] | null>(null);
  const [tripSheets, setTripSheets] = useState<TripSheet[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [docs, setDocs] = useState<ComplianceDocument[] | null>(null);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<typeof LEDGER_ENTRY_TYPES[number] | null>(null);
  const [showOpeningBalance, setShowOpeningBalance] = useState(false);
  const [showStatement, setShowStatement] = useState(false);

  const [statusForm, setStatusForm] = useState<'on_leave' | 'relieved' | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(() => {
    listLedgerEntries()
      .then((all) => setEntries(all.filter((e) => e.driver === driver.id)))
      .catch((err) => setError(err.message ?? 'Failed to load ledger entries.'));
  }, [driver.id]);

  const loadCompliance = useCallback(() => {
    listComplianceDocuments()
      .then((all) => setDocs(all.filter((d) => d.driver === driver.id)))
      .catch((err) => setError(err.message ?? 'Failed to load licence/badge history.'));
  }, [driver.id]);

  useEffect(() => {
    load();
    loadCompliance();
    listTripSheets().then(setTripSheets).catch(() => {});
    listVehicles().then(setVehicles).catch(() => {});
  }, [load, loadCompliance]);

  // Every vehicle this driver has ever taken a trip sheet on, with total
  // distance (or hours, for tractor/JCB) accrued on each one.
  const vehicleHistory = useMemo(() => {
    const byVehicle = new Map<string, { trips: number; distance: number; first: string; last: string }>();
    for (const t of tripSheets) {
      if (t.driver !== driver.id) continue;
      const stats = byVehicle.get(t.vehicle) ?? { trips: 0, distance: 0, first: t.date, last: t.date };
      stats.trips += 1;
      if (t.distance_covered) stats.distance += Number(t.distance_covered);
      if (t.date < stats.first) stats.first = t.date;
      if (t.date > stats.last) stats.last = t.date;
      byVehicle.set(t.vehicle, stats);
    }
    return [...byVehicle.entries()]
      .map(([vehicleId, stats]) => ({ vehicle: vehicles.find((v) => v.id === vehicleId), vehicleId, ...stats }))
      .sort((a, b) => b.trips - a.trips);
  }, [tripSheets, vehicles, driver.id]);

  // Oldest first, so a running balance accumulates top-to-bottom like a
  // bank passbook - the same order the mockup ledger reads in.
  const rows = useMemo(() => {
    if (!entries) return null;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let balance = 0;
    return sorted.map((entry) => {
      const amount = Number(entry.amount);
      const isCredit = LEDGER_CREDIT_TYPES.has(entry.entry_type);
      balance += isCredit ? amount : -amount;
      return { entry, isCredit, amount, balance };
    });
  }, [entries]);

  const totals = useMemo(() => {
    const byType = { wage: 0, bonus: 0, advance: 0, deduction: 0, payment: 0 };
    for (const entry of entries ?? []) {
      if (entry.entry_type in byType) byType[entry.entry_type as keyof typeof byType] += Number(entry.amount);
    }
    return byType;
  }, [entries]);

  const currentBalance = rows && rows.length > 0 ? rows[rows.length - 1].balance : 0;

  async function submitStatus(action: () => Promise<Driver>) {
    setStatusSaving(true);
    setStatusError(null);
    try {
      const updated = await action();
      setDriver(updated);
      onChanged?.(updated);
      setStatusForm(null);
      setStatusReason('');
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Could not change status.');
    } finally {
      setStatusSaving(false);
    }
  }

  const statusPillClass = driver.status === 'active' ? 'on' : driver.status === 'on_leave' ? 'svc' : 'off';

  return (
    <SidePanel title={driver.name} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 15 }}>
            {initials(driver.name)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{driver.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{driver.code || '—'}</div>
          </div>
        </div>
        <span className={`pill ${statusPillClass}`}>{humanize(driver.status)}</span>
      </div>

      <div className="detail-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`detail-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <>
          {canChangeStatus && (
            <div className="status-actions">
              {driver.status === 'relieved' ? (
                <button type="button" className="btn primary" style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => setStatusForm('relieved')}>Rejoin</button>
              ) : (
                <>
                  {driver.status !== 'on_leave' && (
                    <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setStatusForm('on_leave')}>On leave</button>
                  )}
                  {driver.status === 'on_leave' && (
                    <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => submitStatus(() => rejoinDriver(driver.id))}>Back to active</button>
                  )}
                  <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setStatusForm('relieved')}>Relieve</button>
                </>
              )}
            </div>
          )}
          {statusForm && (
            <div className="table-card" style={{ padding: 14, marginBottom: 18 }}>
              <div className="form-grid">
                <div className="field span-2">
                  <label>{driver.status === 'relieved' ? 'Rejoin note (optional)' : 'Reason'}</label>
                  <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)}
                    placeholder={driver.status === 'relieved' ? 'e.g. returned from leave' : 'e.g. resigned'} />
                </div>
              </div>
              {statusError && <div className="form-error">{statusError}</div>}
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setStatusForm(null)}>Cancel</button>
                <button
                  type="button" className="btn primary" disabled={statusSaving}
                  onClick={() => submitStatus(() => (
                    driver.status === 'relieved'
                      ? rejoinDriver(driver.id, statusReason)
                      : changeDriverStatus(driver.id, statusForm, statusReason)
                  ))}
                >
                  {statusSaving ? 'Saving…' : driver.status === 'relieved' ? 'Confirm rejoin' : `Confirm — ${humanize(statusForm)}`}
                </button>
              </div>
            </div>
          )}

          <div className="info-section-title">Identity</div>
          <div className="info-grid">
            <div className="info-item"><span className="l">Mobile</span><span className="v">{driver.mobile || '—'}</span></div>
            <div className="info-item"><span className="l">Emergency contact</span><span className="v">{driver.emergency_contact || '—'}</span></div>
            <div className="info-item"><span className="l">DOB</span><span className="v">{driver.dob ? FULL_DATE_FMT.format(new Date(driver.dob)) : '—'}</span></div>
            <div className="info-item"><span className="l">Blood group</span><span className="v">{driver.blood_group || '—'}</span></div>
            <div className="info-item"><span className="l">Address</span><span className="v">{driver.address || '—'}</span></div>
          </div>

          <div className="info-section-title">Employment</div>
          <div className="info-grid">
            <div className="info-item"><span className="l">Joined</span><span className="v">{driver.date_of_joining ? FULL_DATE_FMT.format(new Date(driver.date_of_joining)) : '—'}</span></div>
            <div className="info-item"><span className="l">Type</span><span className="v">{driver.employment_type ? humanize(driver.employment_type) : '—'}</span></div>
            <div className="info-item"><span className="l">Wage basis</span><span className="v">{driver.wage_basis ? humanize(driver.wage_basis) : '—'}</span></div>
            <div className="info-item"><span className="l">Wage amount</span><span className="v">{driver.wage_amount ? CURRENCY.format(Number(driver.wage_amount)) : '—'}</span></div>
            <div className="info-item"><span className="l">Advance limit</span><span className="v">{driver.advance_limit ? CURRENCY.format(Number(driver.advance_limit)) : '—'}</span></div>
            <div className="info-item"><span className="l">App login</span><span className="v">{driver.has_app_login ? 'Yes' : 'No'}</span></div>
          </div>
        </>
      )}

      {tab === 'licence' && (
        <>
          <div className="info-section-title">Driving licence</div>
          <div className="info-grid">
            <div className="info-item"><span className="l">Number</span><span className="v">{driver.licence_number || '—'}</span></div>
            <div className="info-item"><span className="l">Class</span><span className="v">{driver.licence_class ? driver.licence_class.toUpperCase() : '—'}</span></div>
            <div className="info-item"><span className="l">Issued</span><span className="v">{driver.licence_issue_date ? FULL_DATE_FMT.format(new Date(driver.licence_issue_date)) : '—'}</span></div>
            <div className="info-item"><span className="l">Valid till</span><span className="v">{driver.licence_valid_till ? FULL_DATE_FMT.format(new Date(driver.licence_valid_till)) : '—'}</span></div>
            <div className="info-item"><span className="l">Issuing RTO</span><span className="v">{driver.issuing_rto || '—'}</span></div>
          </div>
          <div className="info-section-title">Badge</div>
          <div className="info-grid">
            <div className="info-item"><span className="l">Number</span><span className="v">{driver.badge_number || '—'}</span></div>
            <div className="info-item"><span className="l">Valid till</span><span className="v">{driver.badge_valid_till ? FULL_DATE_FMT.format(new Date(driver.badge_valid_till)) : '—'}</span></div>
          </div>

          <div className="table-head" style={{ padding: '20px 0 12px' }}>
            <h3>Documents on file <span className="n">{docs?.length ?? '…'}</span></h3>
            <button type="button" className="link-btn" onClick={() => setShowComplianceModal(true)}>+ Add document</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Document</th><th>Valid till</th><th>Status</th></tr></thead>
              <tbody>
                {docs?.filter((d) => d.status !== 'archived').map((doc) => (
                  <tr key={doc.id}>
                    <td>{humanize(doc.doc_type)}</td>
                    <td className="tnum">{doc.valid_till ? FULL_DATE_FMT.format(new Date(doc.valid_till)) : '—'}</td>
                    <td>
                      {doc.is_expired ? <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
                        : doc.is_due ? <span className="pill svc">Due soon</span>
                        : <span className="pill on">Valid</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {docs && docs.filter((d) => d.status !== 'archived').length === 0 && <div className="empty-state">No documents on file yet.</div>}
          </div>
        </>
      )}

      {tab === 'ledger' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Current balance</div>
              <div
                className="tnum"
                style={{
                  fontSize: 22, fontWeight: 700, margin: '2px 0 0',
                  color: currentBalance < 0 ? 'var(--critical)' : currentBalance > 0 ? 'var(--good)' : 'var(--ink)',
                }}
              >
                {currentBalance < 0 ? '−' : ''}{CURRENCY.format(Math.abs(currentBalance))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {currentBalance < 0 ? 'Advance to recover' : currentBalance > 0 ? 'Owed to driver' : 'Settled'}
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 13.5, margin: '0 0 10px' }}>Vehicles driven</h3>
          <div className="table-scroll" style={{ marginBottom: 18 }}>
            <table>
              <thead><tr><th>Vehicle</th><th>Trips</th><th>Distance / hours</th><th>First driven</th><th>Last driven</th></tr></thead>
              <tbody>
                {vehicleHistory.map((row) => {
                  const unit = row.vehicle?.metering_unit === 'hours' ? 'hrs' : 'km';
                  return (
                    <tr key={row.vehicleId}>
                      <td>
                        <div className="veh-cell">
                          <span className="veh-icon"><TruckIcon /></span>
                          <div className="reg-no">{row.vehicle?.registration_number ?? '—'}</div>
                        </div>
                      </td>
                      <td className="tnum">{row.trips}</td>
                      <td className="tnum">{row.distance.toLocaleString('en-IN')} {unit}</td>
                      <td className="tnum">{DATE_FMT.format(new Date(row.first))}</td>
                      <td className="tnum">{DATE_FMT.format(new Date(row.last))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vehicleHistory.length === 0 && <div className="empty-state">No trip sheets recorded yet.</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
            <div className="tile">
              <div className="tile-label">Salary credited</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>{CURRENCY.format(totals.wage + totals.bonus)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Advances paid</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>{CURRENCY.format(totals.advance)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Deductions</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>{CURRENCY.format(totals.deduction)}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Payments made</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>{CURRENCY.format(totals.payment)}</div>
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
                    <td className="tnum" style={{ color: balance < 0 ? 'var(--critical)' : undefined }}>
                      {balance < 0 ? `−${CURRENCY.format(Math.abs(balance))}` : CURRENCY.format(balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows && rows.length === 0 && <div className="empty-state">No ledger entries yet.</div>}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <button type="button" className="btn primary" onClick={() => setEntryForm('wage')}>Credit salary</button>
            <button type="button" className="btn" onClick={() => setEntryForm('advance')}>Add advance</button>
            <button type="button" className="btn" onClick={() => setEntryForm('deduction')}>Add deduction</button>
            <button type="button" className="btn" onClick={() => setEntryForm('payment')}>Record payment</button>
            {entries && entries.length === 0 && (
              <button type="button" className="btn" onClick={() => setShowOpeningBalance(true)}>Set opening balance</button>
            )}
            <button type="button" className="btn" onClick={() => setShowStatement(true)}>Statement</button>
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>

      {entryForm && (
        <LedgerEntryForm
          initial={null}
          drivers={[driver]}
          tripSheets={tripSheets}
          allEntries={entries ?? []}
          presetDriver={driver}
          presetEntryType={entryForm}
          onClose={() => setEntryForm(null)}
          onSaved={() => { setEntryForm(null); load(); }}
        />
      )}
      {showOpeningBalance && (
        <OpeningBalanceForm
          driver={driver}
          onClose={() => setShowOpeningBalance(false)}
          onSaved={() => { setShowOpeningBalance(false); load(); }}
        />
      )}
      {showStatement && (
        <DriverStatementModal
          driver={driver}
          entries={entries ?? []}
          onClose={() => setShowStatement(false)}
        />
      )}
      {showComplianceModal && (
        <ComplianceModal
          holderType="driver"
          holderId={driver.id}
          holderLabel={driver.name}
          docTypes={DRIVER_DOC_TYPES}
          onClose={() => { setShowComplianceModal(false); loadCompliance(); }}
        />
      )}
    </SidePanel>
  );
}
