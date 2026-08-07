import { useEffect, useMemo, useState } from 'react';
import BillingPill from '../components/BillingPill';
import ReplaceTyreModal from '../components/ReplaceTyreModal';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import PositionMap from '../components/tyres/PositionMap';
import { TyreForm } from '../components/tyres/TyreForm';
import { TyreServiceForm } from '../components/tyres/TyreServiceForm';
import { DATE_FMT, humanize } from '../components/tyres/utils';
import { listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listTyreServices, listTyres, retireTyreService } from '../api/tyres';
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

export default function Tyres() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [services, setServices] = useState<TyreService[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showTyreForm, setShowTyreForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [prefillPosition, setPrefillPosition] = useState<string | null>(null);
  const [replacingTyre, setReplacingTyre] = useState<Tyre | null>(null);

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
          <div className="sub">Fit, replace &amp; log tyre service — specs and full history live on the Masters Tyres page</div>
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

        {vehicle && (
          <PositionMap
            vehicle={vehicle}
            tyres={vehicleTyres}
            services={vehicleServices}
            onAddAt={(position) => { setPrefillPosition(position); setShowTyreForm(true); }}
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
      </main>

      {showTyreForm && vehicle && (
        <TyreForm
          initial={null}
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
    </>
  );
}
