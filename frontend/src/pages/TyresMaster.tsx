import { useEffect, useMemo, useState, type ReactNode } from 'react';
import BillingPill from '../components/BillingPill';
import VehiclePicker from '../components/VehiclePicker';
import { TyreForm } from '../components/tyres/TyreForm';
import TyreHistory from '../components/tyres/TyreHistory';
import { DATE_FMT, humanize, latestTreadDepth, totalDistance } from '../components/tyres/utils';
import { listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listTyreServices, listTyres, retireTyre, retireTyreService } from '../api/tyres';
import { getLastVehicleId, setLastVehicleId } from '../lib/lastVehicle';
import { wornTyreCount } from '../lib/fleetAlerts';
import type { Tyre, TyreService, Vehicle, Vendor } from '../api/types';

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
// this page so their "click to sort, click again to flip" behaviour matches.
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

export default function TyresMaster() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [services, setServices] = useState<TyreService[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingTyre, setEditingTyre] = useState<Tyre | null>(null);
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [historyTyre, setHistoryTyre] = useState<Tyre | null>(null);
  const [tab, setTab] = useState<'inventory' | 'history'>('inventory');
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

  // Same worn-tyre signal Tyres.tsx's own picker cards show, surfaced
  // through VehiclePicker's panel here instead - see fleetAlerts.ts.
  const wornCountByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles) counts.set(v.id, wornTyreCount(v.id, tyres, services));
    return counts;
  }, [vehicles, tyres, services]);

  function toggleInvSort(key: InventorySortKey) {
    setInvSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function toggleHistSort(key: HistorySortKey) {
    setHistSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
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
  const spareCount = vehicleTyres.filter((t) => t.status === 'spare').length;

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
          <div className="sub">Specs, kms &amp; service history — logging happens on the Operations Tyres page</div>
        </div>
        <VehiclePicker vehicles={vehicles} value={vehicleId} onChange={selectVehicle} alertCounts={wornCountByVehicle} />
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

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

        <div className="detail-tabs">
          <button type="button" className={`detail-tab${tab === 'inventory' ? ' active' : ''}`} onClick={() => setTab('inventory')}>
            Inventory <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{vehicleTyres.length}</span>
          </button>
          <button type="button" className={`detail-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
            History <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{vehicleServices.length}</span>
          </button>
        </div>

        {tab === 'inventory' && (
          <section className="table-card">
            <div className="table-head">
              <h3>Tyre inventory</h3>
              <button className="btn primary" onClick={() => { setEditingTyre(null); setShowTyreForm(true); }} disabled={!vehicleId}>
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
                          <button className="link-btn" onClick={() => { setEditingTyre(t); setShowTyreForm(true); }}>Edit</button>
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

        {tab === 'history' && (
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
      </main>

      {showTyreForm && vehicle && (
        <TyreForm
          initial={editingTyre}
          vehicle={vehicle}
          prefillPosition={null}
          existingPositions={vehicleTyres.filter((t) => t.status !== 'retired').map((t) => t.position)}
          onClose={() => setShowTyreForm(false)}
          onSaved={() => { setShowTyreForm(false); load(); }}
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
