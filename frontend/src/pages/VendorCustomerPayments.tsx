import { useEffect, useMemo, useState } from 'react';
import VendorDetailModal from '../components/VendorDetailModal';
import CustomerDetailModal from '../components/CustomerDetailModal';
import { StoreIcon } from '../components/icons';
import { listVendors, listVendorLedgerEntries } from '../api/vendors';
import { listCustomers, listCustomerLedgerEntries } from '../api/customers';
import {
  CUSTOMER_LEDGER_CREDIT_TYPES, VENDOR_LEDGER_CREDIT_TYPES, type Customer, type CustomerLedgerEntry,
  type Vendor, type VendorLedgerEntry,
} from '../api/types';

const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const DAY_MS = 86_400_000;

type Kind = 'vendor' | 'customer';
type AgingBucket = 'current' | '30' | '60' | '90';

interface PartyRow {
  id: string;
  name: string;
  kind: Kind;
  balance: number;
  openSince: string | null;
  agingDays: number;
  bucket: AgingBucket;
  party: Vendor | Customer;
}

function agingBucket(days: number): AgingBucket {
  if (days >= 90) return '90';
  if (days >= 60) return '60';
  if (days >= 30) return '30';
  return 'current';
}

const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'Current', '30': '30+ days', '60': '60+ days', '90': '90+ days',
};

// Balance owed/receivable + how long it's been open, walked the same way
// VendorDetailModal/CustomerDetailModal already do per-party - "open since"
// is the date the running balance last left zero, not per-bill FIFO aging
// (this app's ledgers are a running passbook, not invoice-matched, so that's
// the honest granularity available without a bigger accounting rework).
function rowsFor<T extends Vendor | Customer, E extends { date: string; amount: string; entry_type: string }>(
  parties: T[], entries: E[], kind: Kind, creditTypes: Set<string>, partyKey: (e: E) => string,
): PartyRow[] {
  const byParty = new Map<string, E[]>();
  for (const e of entries) {
    const key = partyKey(e);
    const list = byParty.get(key) ?? [];
    list.push(e);
    byParty.set(key, list);
  }
  const today = Date.now();
  return parties.map((p) => {
    const list = [...(byParty.get(p.id) ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    let openSince: string | null = null;
    for (const e of list) {
      const amount = Number(e.amount);
      const wasZero = balance === 0;
      balance += creditTypes.has(e.entry_type) ? amount : -amount;
      if (wasZero && balance !== 0) openSince = e.date;
      if (balance === 0) openSince = null;
    }
    const agingDays = openSince ? Math.floor((today - new Date(openSince).getTime()) / DAY_MS) : 0;
    return {
      id: p.id, name: p.name, kind, balance, openSince, agingDays,
      bucket: agingBucket(agingDays), party: p,
    };
  });
}

export default function VendorCustomerPayments() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendorEntries, setVendorEntries] = useState<VendorLedgerEntry[]>([]);
  const [customerEntries, setCustomerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all');
  const [search, setSearch] = useState('');
  const [showSettled, setShowSettled] = useState(false);

  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  function load() {
    Promise.all([listVendors(), listCustomers(), listVendorLedgerEntries(), listCustomerLedgerEntries()])
      .then(([v, c, ve, ce]) => { setVendors(v); setCustomers(c); setVendorEntries(ve); setCustomerEntries(ce); })
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const rows = useMemo(() => {
    const vendorRows = rowsFor(vendors, vendorEntries, 'vendor', VENDOR_LEDGER_CREDIT_TYPES, (e) => e.vendor);
    const customerRows = rowsFor(customers, customerEntries, 'customer', CUSTOMER_LEDGER_CREDIT_TYPES, (e) => e.customer);
    let all = [...vendorRows, ...customerRows];
    if (!showSettled) all = all.filter((r) => r.balance !== 0);
    if (kindFilter !== 'all') all = all.filter((r) => r.kind === kindFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      all = all.filter((r) => r.name.toLowerCase().includes(q));
    }
    return all.sort((a, b) => b.agingDays - a.agingDays || Math.abs(b.balance) - Math.abs(a.balance));
  }, [vendors, customers, vendorEntries, customerEntries, kindFilter, search, showSettled]);

  const totalPayable = rows.filter((r) => r.kind === 'vendor').reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const totalReceivable = rows.filter((r) => r.kind === 'customer').reduce((s, r) => s + Math.max(r.balance, 0), 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Vendor &amp; customer payments</h1>
          <div className="sub">
            {CURRENCY.format(totalPayable)} payable · {CURRENCY.format(totalReceivable)} receivable
          </div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg" style={{ width: 'fit-content' }}>
            <button className={kindFilter === 'all' ? 'active' : ''} onClick={() => setKindFilter('all')}>All</button>
            <button className={kindFilter === 'vendor' ? 'active' : ''} onClick={() => setKindFilter('vendor')}>Vendors</button>
            <button className={kindFilter === 'customer' ? 'active' : ''} onClick={() => setKindFilter('customer')}>Customers</button>
          </div>
          <input
            className="search-input" placeholder="Search by name…" value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 220 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)' }}>
            <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
            Show settled too
          </label>
        </div>

        <section className="table-card">
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr>
                  <th>Party</th><th>Type</th><th>Balance</th><th>Open since</th><th>Aging</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td data-label="Party">
                      <button
                        type="button"
                        className="veh-cell btn-reset"
                        onClick={() => (r.kind === 'vendor' ? setDetailVendor(r.party as Vendor) : setDetailCustomer(r.party as Customer))}
                      >
                        <span className="veh-icon"><StoreIcon /></span>
                        <div className="reg-no" style={{ fontFamily: 'inherit' }}>{r.name}</div>
                      </button>
                    </td>
                    <td data-label="Type" style={{ textTransform: 'capitalize' }}>{r.kind}</td>
                    <td
                      data-label="Balance"
                      className="tnum"
                      style={{
                        fontWeight: 600,
                        color: r.balance > 0 ? 'var(--warn)' : r.balance < 0 ? 'var(--good)' : 'var(--ink-soft)',
                      }}
                    >
                      {r.balance === 0 ? 'Settled' : `${r.balance < 0 ? '−' : ''}${CURRENCY.format(Math.abs(r.balance))}`}
                    </td>
                    <td data-label="Open since" className="tnum">{r.openSince ? DATE_FMT.format(new Date(r.openSince)) : '—'}</td>
                    <td data-label="Aging">
                      {r.balance !== 0 ? (
                        <span className={`pill ${r.bucket === 'current' ? 'on' : r.bucket === '30' ? 'svc' : 'off'}`}
                          style={r.bucket === '90' || r.bucket === '60' ? { background: 'var(--critical-soft)', color: 'var(--critical)' } : undefined}>
                          {BUCKET_LABEL[r.bucket]}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-state">
                {showSettled ? 'No vendors or customers yet.' : 'Nothing outstanding — every account is settled.'}
              </div>
            )}
          </div>
        </section>
      </main>

      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          onClose={() => { setDetailVendor(null); load(); }}
        />
      )}
      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() => { setDetailCustomer(null); load(); }}
        />
      )}
    </>
  );
}
