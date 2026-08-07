import type { ComplianceDocument, MaintenanceSchedule, Tyre, TyreService, VehicleLoanInstallment } from '../api/types';
// The canonical "most recent tread reading for this tyre" lookup already
// lived here (used by PositionMap.tsx/TyresMaster.tsx since before this
// session) - this file had grown its own second copy without me checking
// first. Reusing it instead of a third version living in api/types-land.
import { latestTreadDepth } from '../components/tyres/utils';

// Tread depth below this is flagged as worth a look - a commonly-cited
// wear limit for commercial tyres (~4mm/0.16in), not a precise cutoff -
// adjust if your fleet's own standard differs. Shared by Tyres.tsx's
// service-log wear flag, its picker cards, and Vehicles.tsx's rolled-up
// Alerts column - one threshold, not three copies of the same number.
export const TREAD_WEAR_LIMIT_IN = 0.16;

export function wornTyreCount(vehicleId: string, tyres: Tyre[], services: TyreService[]): number {
  return tyres.filter((t) => {
    if (t.vehicle !== vehicleId || t.status !== 'fitted') return false;
    const depth = latestTreadDepth(t, services);
    return depth !== null && Number(depth) < TREAD_WEAR_LIMIT_IN;
  }).length;
}

export function overdueMaintenanceCount(vehicleId: string, schedules: MaintenanceSchedule[]): number {
  return schedules.filter((s) => s.vehicle === vehicleId && s.status === 'active' && s.is_overdue).length;
}

// Previously only computed inline in Vehicles.tsx - pulled out so Dashboard/
// Approvals can count the same thing instead of reimplementing it a third
// time (see the "surface proliferation" note - the actual bug wasn't having
// several views, it was each one recomputing its own version of the truth).
export function complianceAlertCount(vehicleId: string, documents: ComplianceDocument[]): number {
  return documents.filter((d) => d.vehicle === vehicleId && (d.is_due || d.is_expired)).length;
}

export function overdueEmiCount(vehicleId: string, installments: VehicleLoanInstallment[]): number {
  return installments.filter((i) => i.vehicle === vehicleId && !i.paid && i.is_overdue).length;
}
