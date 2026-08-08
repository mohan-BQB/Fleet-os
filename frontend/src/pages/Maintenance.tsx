import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BillingPill from '../components/BillingPill';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import { LogForm } from '../components/maintenance/LogForm';
import { ScheduleForm } from '../components/maintenance/ScheduleForm';
import { DATE_FMT, humanize } from '../components/maintenance/utils';
import { listVehicles } from '../api/fleet';
import { listVendors } from '../api/vendors';
import { listPartInventoryItems } from '../api/parts';
import {
  listMaintenanceLogs, listMaintenanceSchedules, retireMaintenanceLog, retireMaintenanceSchedule,
} from '../api/maintenance';
import { getLastVehicleId, setLastVehicleId } from '../lib/lastVehicle';
import { overdueMaintenanceCount } from '../lib/fleetAlerts';
import { EXPENSE_APPROVAL_LABEL as APPROVAL_LABEL, EXPENSE_APPROVAL_TONE as APPROVAL_TONE } from '../lib/statusDisplay';
import type {
  ExpenseApprovalStatus, MaintenanceLog, MaintenanceSchedule, PartInventoryItem, Vehicle, Vendor,
} from '../api/types';

// Worst-of across the two independent bills a job can carry (labour, and a
// new part purchase) - mirrors Tyres.tsx's own combinedApproval.
function combinedApproval(a: ExpenseApprovalStatus | null, b: ExpenseApprovalStatus | null) {
  const statuses = [a, b].filter((s): s is ExpenseApprovalStatus => s !== null);
  if (statuses.length === 0) return null;
  if (statuses.includes('rejected')) return 'rejected' as const;
  if (statuses.includes('pending')) return 'pending' as const;
  return 'approved' as const;
}

export default function Maintenance() {
  const [searchParams] = useSearchParams();
  // Was two separate nav entries/pages (Operations > Maintenance for
  // logging, Masters > Maintenance for schedules/history) - merged into
  // one page, one nav entry, an in-page tab switch instead - see
  // Tyres.tsx's own tab=log|specs for the same pattern.
  const [pageTab, setPageTab] = useState<'log' | 'schedules'>(searchParams.get('tab') === 'schedules' ? 'schedules' : 'log');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventoryItems, setInventoryItems] = useState<PartInventoryItem[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Log service tab only
  const [showLogForm, setShowLogForm] = useState(false);

  // Schedules & history tab only
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
    listPartInventoryItems().then(setInventoryItems).catch(() => {});
    load();
  }, []);

  function selectVehicle(id: string) {
    setVehicleId(id);
    setLastVehicleId(id);
  }

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

  // Fleet-wide overdue count per vehicle, for the picker cards - same
  // is_overdue field as the selected vehicle's own stat tile above, just
  // computed for everyone instead of filtered to one.
  const overdueByVehicle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles) counts.set(v.id, overdueMaintenanceCount(v.id, schedules));
    return counts;
  }, [vehicles, schedules]);

  async function handleRetireLog(l: MaintenanceLog) {
    if (!confirm('Remove this log entry?')) return;
    await retireMaintenanceLog(l.id);
    load();
  }
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
          <div className="sub">
            {pageTab === 'log'
              ? 'Log service as it happens for the selected vehicle.'
              : 'Schedules, due dates & full service history.'}
          </div>
        </div>
        <div className="seg">
          <button className={pageTab === 'log' ? 'active' : ''} onClick={() => setPageTab('log')}>Log service</button>
          <button className={pageTab === 'schedules' ? 'active' : ''} onClick={() => setPageTab('schedules')}>Schedules &amp; history</button>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div className="vehicle-card-row">
          {vehicles.map((v) => {
            const overdue = overdueByVehicle.get(v.id) ?? 0;
            return (
              <button
                key={v.id} type="button"
                className={`vehicle-card${v.id === vehicleId ? ' active' : ''}`}
                onClick={() => selectVehicle(v.id)}
              >
                <span className="vc-reg">{v.registration_number}</span>
                <span className={`vc-status${overdue ? ' warn' : ' good'}`}>
                  {overdue ? `⚠ ${overdue} overdue` : '✓ Up to date'}
                </span>
              </button>
            );
          })}
        </div>

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

        {pageTab === 'log' && (
          <section className="table-card">
            <div className="table-head">
              <h3>Service log</h3>
              <button className="btn primary" onClick={() => setShowLogForm(true)} disabled={!vehicleId}>
                + Log service
              </button>
            </div>
            <div className="table-scroll responsive">
              <table>
                <thead><tr><th>Part</th><th>Date</th><th>{isHours ? 'Hours' : 'Odometer'}</th><th>Old part disposal</th><th>New part cost</th><th>Vendor</th><th>Labour billing</th><th>Approval</th><th></th></tr></thead>
                <tbody>
                  {vehicleLogs.map((l) => (
                    <tr key={l.id}>
                      <td data-label="Part">{l.part_name || '—'}</td>
                      <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(l.date))}</td>
                      <td data-label={isHours ? 'Hours' : 'Odometer'} className="tnum">{l.odometer ? Number(l.odometer).toLocaleString('en-IN') : '—'}</td>
                      <td data-label="Old part disposal">
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
                      <td data-label="Approval">
                        {(() => {
                          const status = combinedApproval(l.expense_approval_status, l.part_expense_approval_status);
                          return status ? <ApprovalStatusPill label={APPROVAL_LABEL[status]} tone={APPROVAL_TONE[status]} /> : '—';
                        })()}
                      </td>
                      <td data-label=""><button className="link-btn danger" onClick={() => handleRetireLog(l)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vehicleLogs.length === 0 && <div className="empty-state">No service logged yet.</div>}
            </div>
          </section>
        )}

        {pageTab === 'schedules' && (
          <>
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
                  <thead><tr><th>Part</th><th>Date</th><th>{isHours ? 'Hours' : 'Odometer'}</th><th>Old part disposal</th><th>New part cost</th><th>Vendor</th><th>Labour billing</th></tr></thead>
                  <tbody>
                    {vehicleLogs.map((l) => (
                      <tr key={l.id}>
                        <td data-label="Part">{l.part_name || '—'}</td>
                        <td data-label="Date" className="tnum">{DATE_FMT.format(new Date(l.date))}</td>
                        <td data-label={isHours ? 'Hours' : 'Odometer'} className="tnum">{l.odometer ? Number(l.odometer).toLocaleString('en-IN') : '—'}</td>
                        <td data-label="Old part disposal">
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
          </>
        )}
      </main>

      {showLogForm && vehicle && (
        <LogForm
          vehicle={vehicle}
          schedules={activeSchedules}
          vendors={vendors}
          inventoryItems={inventoryItems}
          onClose={() => setShowLogForm(false)}
          onSaved={() => { setShowLogForm(false); load(); listPartInventoryItems().then(setInventoryItems).catch(() => {}); }}
        />
      )}
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
