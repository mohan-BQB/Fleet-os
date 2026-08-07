import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import AuditHistory from '../AuditHistory';
import { createMaintenanceSchedule, updateMaintenanceSchedule } from '../../api/maintenance';
import { ApiError } from '../../api/client';
import type { MaintenanceSchedule, MaintenanceScheduleInput, Vehicle } from '../../api/types';
import { todayIso } from './utils';

const BLANK_SCHEDULE: MaintenanceScheduleInput = {
  vehicle: '', part_name: '', interval_km: null, interval_days: null,
  last_done_date: null, last_done_odometer: null, notes: '',
};

function toScheduleInput(s: MaintenanceSchedule): MaintenanceScheduleInput {
  return {
    vehicle: s.vehicle, part_name: s.part_name, interval_km: s.interval_km, interval_days: s.interval_days,
    last_done_date: s.last_done_date, last_done_odometer: s.last_done_odometer, notes: s.notes,
  };
}

export function ScheduleForm({
  initial, vehicle, onClose, onSaved,
}: { initial: MaintenanceSchedule | null; vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<MaintenanceScheduleInput>(
    initial ? toScheduleInput(initial) : {
      ...BLANK_SCHEDULE, vehicle: vehicle.id,
      last_done_date: todayIso(), last_done_odometer: vehicle.current_meter,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MaintenanceScheduleInput>(key: K, value: MaintenanceScheduleInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // interval_km/last_done_odometer are unit-agnostic numbers under the
  // hood - they already read correctly as hours for hydraulic-metered
  // vehicles (JCB, tractor). Only the label needs to follow
  // vehicle.metering_unit, same convention as Tyres.tsx/DriverDetailModal.
  const isHours = vehicle.metering_unit === 'hours';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (initial) await updateMaintenanceSchedule(initial.id, form);
      else await createMaintenanceSchedule(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? `Edit ${initial.part_name}` : 'Add maintenance schedule'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="part_name">Part / task</label>
            <input id="part_name" required placeholder="e.g. Engine Oil, Air Filter, Brake Pads"
              value={form.part_name} onChange={(e) => set('part_name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="interval_km">Interval ({isHours ? 'hours' : 'km'})</label>
            <input id="interval_km" type="number" min="0" value={form.interval_km ?? ''}
              onChange={(e) => set('interval_km', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="field">
            <label htmlFor="interval_days">Interval (days)</label>
            <input id="interval_days" type="number" min="0" value={form.interval_days ?? ''}
              onChange={(e) => set('interval_days', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="field">
            <label htmlFor="last_done_date">Last done (date)</label>
            <input id="last_done_date" type="date" value={form.last_done_date ?? ''}
              onChange={(e) => set('last_done_date', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="last_done_odometer">Last done ({isHours ? 'hours' : 'odometer'})</label>
            <input id="last_done_odometer" type="number" step="0.1" value={form.last_done_odometer ?? ''}
              onChange={(e) => set('last_done_odometer', e.target.value || null)} />
          </div>
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}
        {initial && <AuditHistory modelName="MaintenanceSchedule" objectId={initial.id} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add schedule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
