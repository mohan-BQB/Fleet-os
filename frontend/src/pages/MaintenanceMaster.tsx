import { useEffect, useMemo, useState } from 'react';
import BillingPill from '../components/BillingPill';
import VehiclePicker from '../components/VehiclePicker';
import { ScheduleForm } from '../components/maintenance/ScheduleForm';
import { DATE_FMT, humanize } from '../components/maintenance/utils';
import { listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listMaintenanceLogs, listMaintenanceSchedules, retireMaintenanceSchedule } from '../api/maintenance';
import { getLastVehicleId, setLastVehicleId } from '../lib/lastVehicle';
import { overdueMaintenanceCount } from '../lib/fleetAlerts';
import type { MaintenanceLog, MaintenanceSchedule, Vehicle, Vendor } from '../api/types';

export default function MaintenanceMaster() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  function load() {
    listMaintenanceSchedules().then(setSchedules).catch((err) => setError(err.message));
    listMaintenanceLogs().then(setLogs).catch((err) => setError(err.message));
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

  // Same overdue-maintenance signal the Operations Maintenance page's own
  // picker cards show, surfaced through VehiclePicker's panel here instead.
  const overdueByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles) counts.set(v.id, overdueMaintenanceCount(v.id, schedules));
    return counts;
  }, [vehicles, schedules]);

  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || '—';

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  // interval_km/last_done_odometer are unit-agnostic numbers - already
  // correct in hours for hydraulic-metered vehicles (JCB, tractor). Just
  // need the right label, same as Tyres.tsx/DriverDetailModal.
  const isHours = vehicle?.metering_unit === 'hours';
  const unitLabel = isHours ? 'hrs' : 'km';
  const vehicleSchedules = useMemo(() => schedules.filter((s) => s.vehicle === vehicleId), [schedules, vehicleId]);
  const vehicleLogs = useMemo(
    () => [...logs.filter((l) => l.vehicle === vehicleId)].sort((a, b) => b.date.localeCompare(a.date)),
    [logs, vehicleId],
  );
  const activeSchedules = vehicleSchedules.filter((s) => s.status === 'active');
  const overdueCount = activeSchedules.filter((s) => s.is_overdue).length;

  async function handleRetireSchedule(s: MaintenanceSchedule) {
    if (!confirm(`Stop tracking "${s.part_name}"? It'll be retired, not deleted.`)) return;
    await retireMaintenanceSchedule(s.id);
    load();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Maintenance</h1>
          <div className="sub">Schedules &amp; full service history — logging happens on the Operations Maintenance page</div>
        </div>
        <VehiclePicker vehicles={vehicles} value={vehicleId} onChange={selectVehicle} alertCounts={overdueByVehicle} />
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {vehicle && (
          <section className="stat-row" aria-label="Maintenance summary">
            <div className="tile">
              <div className="tile-label">Tracked parts</div>
              <div className="tile-value tnum" style={{ fontSize: 26 }}>{activeSchedules.length}</div>
              <div className="tile-foot">active schedules</div>
            </div>
            <div className="tile">
              <div className="tile-label">Overdue</div>
              <div className="tile-value tnum" style={{ fontSize: 26, color: overdueCount ? 'var(--critical)' : 'var(--good)' }}>
                {overdueCount}
              </div>
              <div className="tile-foot">need attention now</div>
            </div>
            <div className="tile">
              <div className="tile-label">{isHours ? 'Current hours' : 'Current odometer'}</div>
              <div className="tile-value tnum" style={{ fontSize: 20 }}>
                {vehicle.current_meter ? `${Number(vehicle.current_meter).toLocaleString('en-IN')} ${vehicle.metering_unit}` : '—'}
              </div>
              <div className="tile-foot">used for {isHours ? 'hour' : 'km'}-based due dates</div>
            </div>
          </section>
        )}

        <section className="table-card">
          <div className="table-head">
            <h3>Schedules</h3>
            <button className="btn primary" onClick={() => { setEditingSchedule(null); setShowScheduleForm(true); }} disabled={!vehicleId}>
              + Add schedule
            </button>
          </div>
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr>
                  <th>Part</th><th>Interval</th><th>Last done</th><th>Next due</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {vehicleSchedules.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Part">{s.part_name}</td>
                    <td data-label="Interval">
                      {[s.interval_km ? `${s.interval_km.toLocaleString('en-IN')} ${unitLabel}` : null, s.interval_days ? `${s.interval_days}d` : null]
                        .filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td data-label="Last done" className="tnum">
                      {s.last_done_date ? DATE_FMT.format(new Date(s.last_done_date)) : '—'}
                      {s.last_done_odometer && ` · ${Number(s.last_done_odometer).toLocaleString('en-IN')}`}
                    </td>
                    <td data-label="Next due" className="tnum">
                      {s.next_due_date ? DATE_FMT.format(new Date(s.next_due_date)) : '—'}
                      {s.next_due_km && ` · ${Number(s.next_due_km).toLocaleString('en-IN')}`}
                    </td>
                    <td data-label="Status">
                      {s.status === 'inactive'
                        ? <span className="pill off">Retired</span>
                        : s.is_overdue
                          ? <span className="pill" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Overdue</span>
                          : <span className="pill on">OK</span>}
                    </td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => { setEditingSchedule(s); setShowScheduleForm(true); }}>Edit</button>
                        {s.status === 'active' && <button className="link-btn danger" onClick={() => handleRetireSchedule(s)}>Retire</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleSchedules.length === 0 && (
              <div className="empty-state">No maintenance schedules yet. Add one for oil changes, filters, brake pads, etc.</div>
            )}
          </div>
        </section>

        <section className="table-card">
          <div className="table-head">
            <h3>Service history</h3>
          </div>
          <div className="table-scroll responsive">
            <table>
              <thead><tr><th>Part</th><th>Date</th><th>{isHours ? 'Hours' : 'Odometer'}</th><th>Old part accounted for</th><th>New part cost</th><th>Vendor</th><th>Labour billing</th></tr></thead>
              <tbody>
                {vehicleLogs.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Part">{l.part_name || '—'}</td>
                    <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(l.date))}</td>
                    <td data-label={isHours ? 'Hours' : 'Odometer'} className="tnum">{l.odometer ? Number(l.odometer).toLocaleString('en-IN') : '—'}</td>
                    <td data-label="Old part accounted for">
                      {l.work_type === 'part_replacement' ? (
                        <div style={{ fontSize: 12 }}>
                          <span className="pill on">{humanize(l.disposal_plan || 'accounted')}</span>
                          <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                            {l.old_part_number && <span>#{l.old_part_number}</span>}
                            {l.old_part_number && l.old_part_photo && ' · '}
                            {l.old_part_photo && <a href={l.old_part_photo} target="_blank" rel="noreferrer">Photo</a>}
                          </div>
                        </div>
                      ) : l.work_type === 'consumable' ? (
                        <span className="pill off">Consumable</span>
                      ) : '—'}
                    </td>
                    <td data-label="New part cost">
                      {l.work_type === 'part_replacement' ? (
                        l.part_source === 'from_inventory' ? (
                          <div style={{ fontSize: 12 }}>
                            <span className="pill svc">From inventory</span>
                            <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                              {l.inventory_item_name || '—'}{l.part_quantity && ` × ${l.part_quantity}`}
                            </div>
                          </div>
                        ) : l.part_source === 'new_purchase' ? (
                          <div style={{ fontSize: 12 }}>
                            <BillingPill billing="paid" amount={l.part_expense_amount} note="" isPaid={l.is_part_paid} />
                            <div style={{ color: 'var(--ink-soft)', marginTop: 2 }}>
                              {l.part_vendor ? vendorName(l.part_vendor) : l.part_unlisted_vendor_name ? `${l.part_unlisted_vendor_name} (not in system)` : '—'}
                            </div>
                          </div>
                        ) : '—'
                      ) : '—'}
                    </td>
                    <td data-label="Vendor">
                      {l.vendor ? vendorName(l.vendor) : l.unlisted_vendor_name ? `${l.unlisted_vendor_name} (not in system)` : '—'}
                      {(l.service_person_name || l.performed_by) && (
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                          {l.service_person_name
                            ? <>By {l.service_person_name}{l.service_person_mobile && ` · ${l.service_person_mobile}`}</>
                            : l.performed_by === 'internal' ? 'Own team' : l.performed_by === 'external' ? 'Outside person' : null}
                        </div>
                      )}
                    </td>
                    <td data-label="Labour billing"><BillingPill billing={l.billing} amount={l.expense_amount} note={l.internal_note} isPaid={l.is_paid} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vehicleLogs.length === 0 && <div className="empty-state">No service history logged yet.</div>}
          </div>
        </section>
      </main>

      {showScheduleForm && vehicle && (
        <ScheduleForm
          initial={editingSchedule}
          vehicle={vehicle}
          onClose={() => setShowScheduleForm(false)}
          onSaved={() => { setShowScheduleForm(false); load(); }}
        />
      )}
    </>
  );
}
