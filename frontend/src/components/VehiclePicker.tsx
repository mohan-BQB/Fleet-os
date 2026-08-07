import { useMemo, useState } from 'react';
import SidePanel from './SidePanel';
import type { Vehicle } from '../api/types';
import { TruckIcon } from './icons';

// A tap-to-open searchable sheet instead of a native <select> - the
// dropdown pattern doesn't scale to a large fleet on a phone (tiny target,
// no search). Reused across Tyres/Maintenance Masters + Operations pages;
// see lib/lastVehicle.ts for the "remember what I picked last" half of this.
export default function VehiclePicker({
  vehicles, value, onChange, alertCounts,
}: {
  vehicles: Vehicle[]; value: string; onChange: (id: string) => void;
  // Optional per-vehicle "needs attention" count, scoped to whatever's
  // relevant on the calling page (see lib/fleetAlerts.ts) - e.g. worn-tyre
  // counts, overdue-maintenance counts. Omit entirely where it doesn't
  // apply (Expense's vehicle-picker step has no use for it). Same signal
  // Tyres.tsx/Maintenance.tsx's own picker cards show, just surfaced
  // through this panel instead of a card grid, for any future caller in a
  // tighter space (a card grid doesn't fit every context).
  alertCounts?: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = vehicles.find((v) => v.id === value);
  const selectedAlerts = alertCounts?.get(value) ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => (
      v.registration_number.toLowerCase().includes(q)
      || v.maker.toLowerCase().includes(q)
      || v.model.toLowerCase().includes(q)
    ));
  }, [vehicles, query]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180, justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TruckIcon />
          {selected ? selected.registration_number : 'Select vehicle'}
          {selectedAlerts > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)' }}>⚠ {selectedAlerts}</span>
          )}
        </span>
        <span aria-hidden style={{ color: 'var(--ink-soft)' }}>▾</span>
      </button>
      {open && (
        <SidePanel title="Select vehicle" onClose={() => setOpen(false)}>
          <input
            autoFocus
            type="search"
            placeholder="Search by reg. number, make, model…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((v) => {
              const alerts = alertCounts?.get(v.id) ?? 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pick(v.id)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: v.id === value ? '1px solid var(--accent)' : '1px solid var(--border-soft)',
                    background: v.id === value ? 'var(--accent-soft)' : 'var(--surface)',
                  }}
                >
                  <div className="reg-no" style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>{v.registration_number}</span>
                    {alerts > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)' }}>⚠ {alerts}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
                    {[v.maker, v.model].filter(Boolean).join(' ') || v.category}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="empty-state">No vehicles match "{query}".</div>}
          </div>
        </SidePanel>
      )}
    </>
  );
}
