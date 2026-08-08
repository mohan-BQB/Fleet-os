import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import BillingPill from '../components/BillingPill';
import ReplaceTyreModal from '../components/ReplaceTyreModal';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import PositionMap from '../components/tyres/PositionMap';
import { TyreForm } from '../components/tyres/TyreForm';
import { TyreServiceForm } from '../components/tyres/TyreServiceForm';
import TyreHistory from '../components/tyres/TyreHistory';
import { DATE_FMT, humanize, latestTreadDepth, totalDistance } from '../components/tyres/utils';
import { listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listTyreServices, listTyres, retireTyre, retireTyreService } from '../api/tyres';
import { getLastVehicleId, setLastVehicleId } from '../lib/lastVehicle';
import { TREAD_WEAR_LIMIT_IN, wornTyreCount } from '../lib/fleetAlerts';
import { EXPENSE_APPROVAL_LABEL as APPROVAL_LABEL, EXPENSE_APPROVAL_TONE as APPROVAL_TONE } from '../lib/statusDisplay';
import type { ExpenseApprovalStatus, Tyre, TyreService, Vehicle, Vendor } from '../api/types';

// Worst-of across the two independent bills a service can carry (labour,
// and a new tyre purchase) - a rejected or still-pending charge is what's
// worth surfacing first, not whichever happens to be approved.
function combinedApproval(a: ExpenseApprovalStatus | null, b: ExpenseApprovalStatus | null) {
  const statuses = [a, b].filter((s): s is ExpenseApprovalStatus => s !== null);
  if (statuses.length === 0) return null;
  if (statuses.includes('rejected')) return 'rejected' as const;
  if (statuses.includes('pending')) return 'pending' as const;
  return 'approved' as const;
}

type SortDir = 'asc' | 'desc';
type InventorySortKey = 'position' | 'brand' | 'size' | 'fitted_date' | 'distance' | 'tread' | 'status';
type HistorySortKey = 'service_type' | 'date' | 'odometer' | 'tread_depth_in' | 'new_position';

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
}

// Clickable column header with a sort indicator - shared by both tables on
// the Specs & history tab so their "click to sort, click again to flip"
// behaviour matches.
function SortTh({
  label, active, dir, onClick,
}: { label: ReactNode; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <th onClick={onClick} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}
      <span style={{ marginLeft: 4, color: active ? 'var(--accent)' : 'var(--border)' }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

export default function Tyres() {
  const [searchParams] = useSearchParams();
  // Was two separate nav entries/pages (Operations > Tyres for logging,
  // Masters > Tyres for specs/history) - merged into one page, one nav
  // entry, an in-page tab switch instead - see Maintenance.tsx's own
  // tab=log|schedules for the same pattern.
  const [pageTab, setPageTab] = useState<'log' | 'specs'>(searchParams.get('tab') === 'specs' ? 'specs' : 'log');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [services, setServices] = useState<TyreService[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Shared between both tabs - the position map's "add at position" and
  // the inventory table's own "+ Add tyre"/"Edit" are the same underlying
  // action (create/edit a Tyre record), just triggered from two places.
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);
  const [prefillPosition, setPrefillPosition] = useState<string | null>(null);

  // Log service tab only
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [replacingTyre, setReplacingTyre] = useState<Tyre | null>(null);

  // Specs & history tab only
  const [historyTyre, setHistoryTyre] = useState<Tyre | null>(null);
  const [specsTab, setSpecsTab] = useState<'inventory' | 'history'>('inventory');
  const [invSort, setInvSort] = useState<{ key: InventorySortKey; dir: SortDir }>({ key: 'position', dir: 'asc' });
  const [histSort, setHistSort] = useState<{ key: HistorySortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });

  function load() {
    listTyres().then(setTyres).catch((err) => setError(err.message));
    listTyreServices().then(setServices).catch((err) => setError(err.message));
  }

  useEffect(() => {
    listVehicles().then((v) => {
      setVehicles(v);
      const last = getLastVehicleId();
      if (last && v.some((x) => x.id === last)) setVehicleId(last);
      else if (v.length) setVehicleId(v[0].id);
    }).catch((err) => setError(err.message));
    listVendors().then(setVendors).catch(() => {});
    load();
  }, []);

  function selectVehicle(id: string) {
    setVehicleId(id);
    setLastVehicleId(id);
  }

  function openTyreForm(tyre: Tyre | null, position: string | null) {
    setEditingTyre(tyre);
    setPrefillPosition(position);
    setShowTyreForm(true);
  }

  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || '—';
  // Looks across all statuses (fitted/spare/retired) - a replacement's
  // previous_tyre is always retired or spared by the time this renders.
  const tyreLabel = (id: string | null) => {
    const t = id && tyres.find((x) => x.id === id);
    return t ? (t.brand || t.position || t.id.slice(0, 8)) : 'unknown';
  };

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleTyres = useMemo(() => tyres.filter((t) => t.vehicle === vehicleId), [tyres, vehicleId]);
  const vehicleServices = useMemo(() => services.filter((s) => s.vehicle === vehicleId), [services, vehicleId]);
  const fittedCount = vehicleTyres.filter((t) => t.status === 'fitted').length;
  const spareTyres = vehicleTyres.filter((t) => t.status === 'spare');
  const spareCount = spareTyres.length;

  // Fleet-wide worn-tyre count per vehicle, for the picker cards - same
  // TREAD_WEAR_LIMIT_IN threshold the service log's own wear flag uses.
  const wornCountByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles) counts.set(v.id, wornTyreCount(v.id, tyres, services));
    return counts;
  }, [vehicles, tyres, services]);

  const sortedTyres = useMemo(() => {
    const rows = vehicleTyres.map((t) => ({
      tyre: t, distance: totalDistance(t), tread: latestTreadDepth(t, vehicleServices),
    }));
    rows.sort((a, b) => {
      const { key, dir } = invSort;
      const cmp = key === 'position' ? compareValues(a.tyre.position || null, b.tyre.position || null)
        : key === 'brand' ? compareValues(a.tyre.brand || null, b.tyre.brand || null)
        : key === 'size' ? compareValues(a.tyre.size || null, b.tyre.size || null)
        : key === 'fitted_date' ? compareValues(a.tyre.fitted_date, b.tyre.fitted_date)
        : key === 'distance' ? compareValues(a.distance, b.distance)
        : key === 'tread' ? compareValues(a.tread !== null ? Number(a.tread) : null, b.tread !== null ? Number(b.tread) : null)
        : compareValues(a.tyre.status, b.tyre.status);
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [vehicleTyres, vehicleServices, invSort]);

  const sortedServices = useMemo(() => {
    const rows = [...vehicleServices];
    rows.sort((a, b) => {
      const { key, dir } = histSort;
      const cmp = key === 'service_type' ? compareValues(a.service_type, b.service_type)
        : key === 'date' ? compareValues(a.date, b.date)
        : key === 'odometer' ? compareValues(a.odometer !== null ? Number(a.odometer) : null, b.odometer !== null ? Number(b.odometer) : null)
        : key === 'tread_depth_in' ? compareValues(a.tread_depth_in !== null ? Number(a.tread_depth_in) : null, b.tread_depth_in !== null ? Number(b.tread_depth_in) : null)
        : compareValues(a.new_position || null, b.new_position || null);
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [vehicleServices, histSort]);

  function toggleInvSort(key: InventorySortKey) {
    setInvSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function toggleHistSort(key: HistorySortKey) {
    setHistSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  async function handleRetireTyre(t: Tyre) {
    if (!confirm(`Retire this tyre (${t.position || t.brand})? It'll be marked retired, not deleted.`)) return;
    await retireTyre(t.id);
    load();
  }
  async function handleRetireService(s: TyreService) {
    if (!confirm('Remove this service record? It will be retired, not deleted.')) return;
    await retireTyreService(s.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Tyres</h1>
          <div className="sub">
            {pageTab === 'log'
              ? 'Fit, replace & log tyre service for the selected vehicle.'
              : 'Specs, lifetime distance & full service history.'}
          </div>
        </div>
        <div className="seg">
          <button className={pageTab === 'log' ? 'active' : ''} onClick={() => setPageTab('log')}>Log service</button>
          <button className={pageTab === 'specs' ? 'active' : ''} onClick={() => setPageTab('specs')}>Specs &amp; history</button>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div className="vehicle-card-row">
          {vehicles.map((v) => {
            const worn = wornCountByVehicle.get(v.id) ?? 0;
            return (
              <button
                key={v.id} type="button"
                className={`vehicle-card${v.id === vehicleId ? ' active' : ''}`}
                onClick={() => selectVehicle(v.id)}
              >
                <span className="vc-reg">{v.registration_number}</span>
                <span className={`vc-status${worn ? ' warn' : ' good'}`}>
                  {worn ? `⚠ ${worn} worn tyre${worn === 1 ? '' : 's'}` : '✓ All good'}
                </span>
              </button>
            );
          })}
        </div>

        {vehicle && (
          <section className="stat-row" aria-label="Tyre configuration">
            <div className="tile">
              <div className="tile-label">Configured</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{vehicle.number_of_tyres} + {vehicle.spare_tyres}</div>
              <div className="tile-foot">road tyres + spares (edit on the Vehicles page)</div>
            </div>
            <div className="tile">
              <div className="tile-label">Tracked &amp; fitted</div>
              <div className="tile-value tnum" style={{ fontSize: 26, color: fittedCount === vehicle.number_of_tyres ? 'var(--good)' : 'var(--warn)' }}>
                {fittedCount}
              </div>
              <div className="tile-foot">of {vehicle.number_of_tyres} configured</div>
            </div>
            <div className="tile">
              <div className="tile-label">Spares in stock</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{spareCount}</div>
              <div className="tile-foot">of {vehicle.spare_tyres} configured</div>
            </div>
            <div className="tile">
              <div className="tile-label">Axle layout</div>
              <div className="tile-value" style={{ fontSize: 16, fontWeight: 600 }}>{vehicle.axle_layout ? humanize(vehicle.axle_layout) : '—'}</div>
            </div>
          </section>
        )}

        {pageTab === 'log' && (
          <>
            {vehicle && (
              <PositionMap
                vehicle={vehicle}
                tyres={vehicleTyres}
                services={vehicleServices}
                onAddAt={(position) => openTyreForm(null, position)}
                onReplace={(t) => setReplacingTyre(t)}
              />
            )}

            <section className="table-card">
              <div className="table-head">
                <h3>Service log</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Replacements go through the dedicated Replace-tyre flow, not
                      the generic "Log service" form - it's the only door that can
                      supply what a replacement requires (the outgoing tyre,
                      removal reason, disposition). Surfaced here too since this
                      is where people look for it, not just the position map. */}
                  <select
                    className="search-input"
                    value="" onChange={(e) => { const t = vehicleTyres.find((x) => x.id === e.target.value); if (t) setReplacingTyre(t); }}
                    disabled={!vehicleId || vehicleTyres.filter((t) => t.status === 'fitted').length === 0}
                  >
                    <option value="" disabled>Replace a tyre…</option>
                    {vehicleTyres.filter((t) => t.status === 'fitted').map((t) => (
                      <option key={t.id} value={t.id}>{t.position || t.brand || t.id.slice(0, 8)}</option>
                    ))}
                  </select>
                  <button className="btn primary" onClick={() => setShowServiceForm(true)} disabled={!vehicleId}>
                    + Log service
                  </button>
                </div>
              </div>
              <div className="table-scroll responsive">
                <table>
                  <thead><tr><th>Type</th><th>Date</th><th>Odometer</th><th>Tread depth</th><th>New position</th><th>New tyre cost</th><th>Vendor (fitting)</th><th>Labour billing</th><th>Approval</th><th></th></tr></thead>
                  <tbody>
                    {vehicleServices.map((s) => (
                      <tr key={s.id}>
                        <td data-label="Type">
                          {humanize(s.service_type)}
                          {s.service_type === 'replacement' && s.removal_reason && (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                              {tyreLabel(s.previous_tyre)} → {tyreLabel(s.tyre)} · {humanize(s.removal_reason)}
                            </div>
                          )}
                        </td>
                        <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(s.date))}</td>
                        <td data-label="Odometer" className="tnum">{s.odometer ? Number(s.odometer).toLocaleString('en-IN') : '—'}</td>
                        <td data-label="Tread depth" className="tnum">
                          {s.tread_depth_in ? (
                            <span style={Number(s.tread_depth_in) < TREAD_WEAR_LIMIT_IN ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
                              {s.tread_depth_in}"{Number(s.tread_depth_in) < TREAD_WEAR_LIMIT_IN && ' ⚠'}
                            </span>
                          ) : '—'}
                        </td>
                        <td data-label="New position">{s.new_position || '—'}</td>
                        <td data-label="New tyre cost">
                          {s.tyre_source === 'new_purchase' ? (
                            <div style={{ fontSize: 12 }}>
                              <BillingPill billing="paid" amount={s.tyre_expense_amount} note="" isPaid={s.is_tyre_paid} />
                              <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                                {s.tyre_vendor ? vendorName(s.tyre_vendor) : s.tyre_unlisted_vendor_name ? `${s.tyre_unlisted_vendor_name} (not in system)` : '—'}
                              </div>
                            </div>
                          ) : s.tyre_source === 'from_spare' ? (
                            <span className="pill svc">From spare</span>
                          ) : '—'}
                        </td>
                        <td data-label="Vendor (fitting)">
                          {s.vendor ? vendorName(s.vendor) : s.unlisted_vendor_name ? `${s.unlisted_vendor_name} (not in system)` : '—'}
                          {(s.service_person_name || s.performed_by) && (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                              {s.service_person_name
                                ? <>By {s.service_person_name}{s.service_person_mobile && ` · ${s.service_person_mobile}`}</>
                                : s.performed_by === 'internal' ? 'Own team' : s.performed_by === 'external' ? 'Outside person' : null}
                            </div>
                          )}
                        </td>
                        <td data-label="Labour billing"><BillingPill billing={s.billing} amount={s.expense_amount} note={s.internal_note} isPaid={s.is_paid} /></td>
                        <td data-label="Approval">
                          {(() => {
                            const status = combinedApproval(s.expense_approval_status, s.tyre_expense_approval_status);
                            return status ? <ApprovalStatusPill label={APPROVAL_LABEL[status]} tone={APPROVAL_TONE[status]} /> : '—';
                          })()}
                        </td>
                        <td data-label=""><button className="link-btn danger" onClick={() => handleRetireService(s)}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {vehicleServices.length === 0 && <div className="empty-state">No service logged yet.</div>}
              </div>
            </section>
          </>
        )}

        {pageTab === 'specs' && (
          <>
            <div className="detail-tabs">
              <button type="button" className={`detail-tab${specsTab === 'inventory' ? ' active' : ''}`} onClick={() => setSpecsTab('inventory')}>
                Inventory <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{vehicleTyres.length}</span>
              </button>
              <button type="button" className={`detail-tab${specsTab === 'history' ? ' active' : ''}`} onClick={() => setSpecsTab('history')}>
                History <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{vehicleServices.length}</span>
              </button>
            </div>

            {specsTab === 'inventory' && (
              <section className="table-card">
                <div className="table-head">
                  <h3>Tyre inventory</h3>
                  <button className="btn primary" onClick={() => openTyreForm(null, null)} disabled={!vehicleId}>
                    + Add tyre
                  </button>
                </div>
                <div className="table-scroll responsive">
                  <table>
                    <thead>
                      <tr>
                        <SortTh label="Position" active={invSort.key === 'position'} dir={invSort.dir} onClick={() => toggleInvSort('position')} />
                        <SortTh label="Brand" active={invSort.key === 'brand'} dir={invSort.dir} onClick={() => toggleInvSort('brand')} />
                        <SortTh label="Size" active={invSort.key === 'size'} dir={invSort.dir} onClick={() => toggleInvSort('size')} />
                        <SortTh label="Fitted" active={invSort.key === 'fitted_date'} dir={invSort.dir} onClick={() => toggleInvSort('fitted_date')} />
                        <SortTh label="Lifetime distance" active={invSort.key === 'distance'} dir={invSort.dir} onClick={() => toggleInvSort('distance')} />
                        <SortTh label="Tread depth" active={invSort.key === 'tread'} dir={invSort.dir} onClick={() => toggleInvSort('tread')} />
                        <SortTh label="Status" active={invSort.key === 'status'} dir={invSort.dir} onClick={() => toggleInvSort('status')} />
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTyres.map(({ tyre: t, distance: run, tread }) => (
                        <tr key={t.id}>
                          <td data-label="Position">{t.position || '—'}</td>
                          <td data-label="Brand">{t.brand || '—'}</td>
                          <td data-label="Size">{t.size || '—'}</td>
                          <td data-label="Fitted" className="tnum">{t.fitted_date ? DATE_FMT.format(new Date(t.fitted_date)) : '—'}</td>
                          <td data-label="Lifetime distance" className="tnum">{run !== null ? `${run.toLocaleString('en-IN')} ${vehicle?.metering_unit ?? 'km'}` : '—'}</td>
                          <td data-label="Tread depth" className="tnum">{tread !== null ? `${tread}"` : '—'}</td>
                          <td data-label="Status">
                            <span className={`pill ${t.status === 'fitted' ? 'on' : t.status === 'spare' ? 'svc' : 'off'}`}>{humanize(t.status)}</span>
                          </td>
                          <td data-label="">
                            <div className="row-actions">
                              <button className="link-btn" onClick={() => setHistoryTyre(t)}>History</button>
                              <button className="link-btn" onClick={() => openTyreForm(t, null)}>Edit</button>
                              {t.status !== 'retired' && <button className="link-btn danger" onClick={() => handleRetireTyre(t)}>Retire</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {vehicleTyres.length === 0 && <div className="empty-state">No tyres tracked for this vehicle yet.</div>}
                </div>
              </section>
            )}

            {specsTab === 'history' && (
              <section className="table-card">
                <div className="table-head">
                  <h3>Service history (alignment, rotation, repairs, replacements)</h3>
                </div>
                <div className="table-scroll responsive">
                  <table>
                    <thead>
                      <tr>
                        <SortTh label="Type" active={histSort.key === 'service_type'} dir={histSort.dir} onClick={() => toggleHistSort('service_type')} />
                        <SortTh label="Date" active={histSort.key === 'date'} dir={histSort.dir} onClick={() => toggleHistSort('date')} />
                        <SortTh label="Odometer" active={histSort.key === 'odometer'} dir={histSort.dir} onClick={() => toggleHistSort('odometer')} />
                        <SortTh label="Tread depth" active={histSort.key === 'tread_depth_in'} dir={histSort.dir} onClick={() => toggleHistSort('tread_depth_in')} />
                        <SortTh label="New position" active={histSort.key === 'new_position'} dir={histSort.dir} onClick={() => toggleHistSort('new_position')} />
                        <th>New tyre cost</th>
                        <th>Vendor (fitting)</th>
                        <th>Labour billing</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedServices.map((s) => (
                        <tr key={s.id}>
                          <td data-label="Type">
                            {humanize(s.service_type)}
                            {s.service_type === 'replacement' && s.removal_reason && (
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                                {tyreLabel(s.previous_tyre)} → {tyreLabel(s.tyre)} · {humanize(s.removal_reason)}
                              </div>
                            )}
                          </td>
                          <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(s.date))}</td>
                          <td data-label="Odometer" className="tnum">{s.odometer ? Number(s.odometer).toLocaleString('en-IN') : '—'}</td>
                          <td data-label="Tread depth" className="tnum">{s.tread_depth_in ? `${s.tread_depth_in}"` : '—'}</td>
                          <td data-label="New position">{s.new_position || '—'}</td>
                          <td data-label="New tyre cost">
                            {s.tyre_source === 'new_purchase' ? (
                              <div style={{ fontSize: 12 }}>
                                <BillingPill billing="paid" amount={s.tyre_expense_amount} note="" isPaid={s.is_tyre_paid} />
                                <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                                  {s.tyre_vendor ? vendorName(s.tyre_vendor) : s.tyre_unlisted_vendor_name ? `${s.tyre_unlisted_vendor_name} (not in system)` : '—'}
                                </div>
                              </div>
                            ) : s.tyre_source === 'from_spare' ? (
                              <span className="pill svc">From spare</span>
                            ) : '—'}
                          </td>
                          <td data-label="Vendor (fitting)">
                            {s.vendor ? vendorName(s.vendor) : s.unlisted_vendor_name ? `${s.unlisted_vendor_name} (not in system)` : '—'}
                            {(s.service_person_name || s.performed_by) && (
                              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                                {s.service_person_name
                                  ? <>By {s.service_person_name}{s.service_person_mobile && ` · ${s.service_person_mobile}`}</>
                                  : s.performed_by === 'internal' ? 'Own team' : s.performed_by === 'external' ? 'Outside person' : null}
                              </div>
                            )}
                          </td>
                          <td data-label="Labour billing"><BillingPill billing={s.billing} amount={s.expense_amount} note={s.internal_note} isPaid={s.is_paid} /></td>
                          <td data-label=""><button className="link-btn danger" onClick={() => handleRetireService(s)}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {vehicleServices.length === 0 && <div className="empty-state">No service history logged yet.</div>}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {showTyreForm && vehicle && (
        <TyreForm
          initial={editingTyre}
          vehicle={vehicle}
          prefillPosition={prefillPosition}
          existingPositions={vehicleTyres.filter((t) => t.status !== 'retired').map((t) => t.position)}
          onClose={() => setShowTyreForm(false)}
          onSaved={() => { setShowTyreForm(false); load(); }}
        />
      )}
      {showServiceForm && vehicle && (
        <TyreServiceForm
          vehicle={vehicle}
          tyres={vehicleTyres}
          vendors={vendors}
          onClose={() => setShowServiceForm(false)}
          onSaved={() => { setShowServiceForm(false); load(); }}
        />
      )}
      {replacingTyre && vehicle && (
        <ReplaceTyreModal
          vehicle={vehicle}
          tyre={replacingTyre}
          spares={spareTyres.filter((s) => s.id !== replacingTyre.id)}
          vendors={vendors}
          onClose={() => setReplacingTyre(null)}
          onSaved={() => { setReplacingTyre(null); load(); }}
        />
      )}
      {historyTyre && (
        <TyreHistory
          tyre={historyTyre}
          services={services.filter((s) => s.tyre === historyTyre.id || s.previous_tyre === historyTyre.id)}
          tyres={tyres}
          vendors={vendors}
          onClose={() => setHistoryTyre(null)}
        />
      )}
    </>
  );
}
