import type { Tyre, TyreService } from '../../api/types';

export const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// A generic, editable starting point - not exact axle geometry for every
// model. Front axle is single, rear axles assumed dual (standard for
// Indian commercial lorries); position stays a free-text field, so any of
// these can be renamed to match the real vehicle.
export function generatePositions(numberOfTyres: number, spareTyres: number): string[] {
  const positions: string[] = [];
  if (numberOfTyres <= 2) {
    if (numberOfTyres >= 1) positions.push('Front');
    if (numberOfTyres >= 2) positions.push('Rear');
  } else if (numberOfTyres <= 4) {
    positions.push('Front Left', 'Front Right');
    if (numberOfTyres === 3) positions.push('Rear');
    else if (numberOfTyres === 4) positions.push('Rear Left', 'Rear Right');
  } else {
    positions.push('Front Left', 'Front Right');
    let remaining = numberOfTyres - 2;
    let axle = 1;
    while (remaining > 0) {
      const take = Math.min(4, remaining);
      if (take === 4) {
        positions.push(
          `Rear Axle ${axle} Left Outer`, `Rear Axle ${axle} Left Inner`,
          `Rear Axle ${axle} Right Outer`, `Rear Axle ${axle} Right Inner`,
        );
      } else if (take === 2) {
        positions.push(`Rear Axle ${axle} Left`, `Rear Axle ${axle} Right`);
      } else {
        for (let i = 1; i <= take; i++) positions.push(`Rear Axle ${axle} - ${i}`);
      }
      remaining -= take;
      axle += 1;
    }
  }
  for (let i = 1; i <= spareTyres; i++) positions.push(`Spare ${i}`);
  return positions;
}

// Lifetime distance is server-computed (Tyre.total_distance) so it stays
// correct across rotations, spare stints, and re-fitting without the
// frontend re-deriving it from a single odometer_at_fitting reading, which
// would lose everything accumulated in earlier stints.
export function totalDistance(tyre: Tyre): number | null {
  return tyre.total_distance === null ? null : Number(tyre.total_distance);
}

// Most recent tread_depth_in reading logged for this tyre, if any.
export function latestTreadDepth(tyre: Tyre, services: TyreService[]): string | null {
  const readings = services
    .filter((s) => s.tyre === tyre.id && s.tread_depth_in !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return readings[0]?.tread_depth_in ?? null;
}
