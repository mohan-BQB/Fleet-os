import { useNavigate } from 'react-router-dom';
import { HistoryIcon } from './icons';
import { setLastVehicleId } from '../lib/lastVehicle';
import type { Expense, ExpenseSource, ExpenseSourceType } from '../api/types';

// Where "fix at source" actually goes, and what to call it there - more
// specific than the coarse `source` field (tyre_service covers two
// independent syncs - labour and a new-tyre purchase; maintenance covers
// labour and a new-part purchase - see economics.models.ExpenseSourceType).
const SOURCE_TYPE_ROUTE: Partial<Record<ExpenseSourceType, string>> = {
  trip_expense: '/trip-sheets',
  tyre_service_labour: '/tyres',
  tyre_purchase: '/tyres',
  maintenance_labour: '/maintenance',
  maintenance_part: '/maintenance',
  parts_receipt: '/parts-inventory',
};

const SOURCE_TYPE_LABELS: Partial<Record<ExpenseSourceType, string>> = {
  trip_expense: 'Trip expense',
  tyre_service_labour: 'Tyre service',
  tyre_purchase: 'Tyre purchase',
  maintenance_labour: 'Maintenance',
  maintenance_part: 'Maintenance part purchase',
  parts_receipt: 'Parts receipt',
};

const SOURCE_LABELS: Record<ExpenseSource, string> = {
  direct: 'Direct entry',
  tyre_service: 'Tyre service',
  maintenance: 'Maintenance',
  trip: 'Trip',
  parts: 'Parts',
};

// Only Tyres/TyresMaster/Maintenance/MaintenanceMaster read lastVehicleId
// (see lib/lastVehicle.ts) - Trip Sheets and Parts Inventory don't, so
// there's nothing to pre-select there yet.
const ROUTES_WITH_VEHICLE_CONTEXT = new Set(['/tyres', '/maintenance']);

/** The Source-column pill - same visual as before, now always backed by the
 * real source_type field rather than assumed from the coarse category. */
export function ExpenseSourceBadge({ expense }: { expense: Expense }) {
  return (
    <>
      <span className="pill off">{SOURCE_LABELS[expense.source]}</span>
      {expense.source !== 'direct' && (
        <span
          title="Posted automatically from its source record — not editable here"
          style={{ display: 'inline-flex', marginLeft: 6, color: 'var(--ink-soft)', verticalAlign: 'middle' }}
        >
          <HistoryIcon className="src-lock-icon" />
        </span>
      )}
    </>
  );
}

/** The row-action for a locked row - replaces Edit. Takes you to the screen
 * the record actually lives on (and, where that screen supports it, with
 * the right vehicle pre-selected) rather than just naming it in plain text.
 * Doesn't jump to the exact record - none of the source screens expose a
 * per-record deep link today - but it's a real, working destination, not a
 * label. */
export function ExpenseSourceLink({ expense }: { expense: Expense }) {
  const navigate = useNavigate();
  if (expense.source === 'direct') return null;

  const route = SOURCE_TYPE_ROUTE[expense.source_type] ?? '/reports';
  const label = SOURCE_TYPE_LABELS[expense.source_type] ?? SOURCE_LABELS[expense.source];

  function go() {
    if (expense.vehicle && ROUTES_WITH_VEHICLE_CONTEXT.has(route)) setLastVehicleId(expense.vehicle);
    navigate(route);
  }

  return (
    <button type="button" className="link-btn" onClick={go} style={{ fontSize: 11.5 }}>
      Fix at {label} →
    </button>
  );
}
