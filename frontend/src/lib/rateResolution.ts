import type { RouteRate, WorkRate } from '../api/types';

// Optional, client-side rate lookup for the leg/work-item "quick-add" forms
// (see TripSheets.tsx) - a leg/item always stores its own rate regardless
// of whether any of this finds a match, so these are pure, side-effect-free
// helpers: no match just means no autofill, not an error.

function norm(value: string) {
  return value.trim().toLowerCase();
}

interface ResolvedRate {
  basis: string;
  rate: string;
}

export function resolveRouteRate(
  rates: RouteRate[],
  { from_place, to_place, customer, material, date }: {
    from_place: string; to_place: string; customer: string | null; material: string; date: string;
  },
): ResolvedRate | null {
  const route = rates.filter(
    (r) => norm(r.from_place) === norm(from_place) && norm(r.to_place) === norm(to_place) && r.effective_date <= date,
  );
  if (route.length === 0) return null;

  // Prefer a customer-specific card over a generic (customer=null) one,
  // and within that, a material-specific card over a generic one - the
  // most specific match available wins.
  const buckets = [
    route.filter((r) => r.customer === customer && norm(r.material) === norm(material)),
    route.filter((r) => r.customer === customer && !r.material),
    route.filter((r) => !r.customer && norm(r.material) === norm(material)),
    route.filter((r) => !r.customer && !r.material),
  ];
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    // Most recent effective_date on or before the target date wins within
    // this specificity level - a rate change doesn't retroactively apply
    // to an older trip.
    const best = bucket.reduce((a, b) => (b.effective_date > a.effective_date ? b : a));
    return { basis: best.basis, rate: best.rate };
  }
  return null;
}

export function resolveWorkRate(
  rates: WorkRate[],
  { equipment, work_type, customer, date }: {
    equipment: string; work_type: string; customer: string | null; date: string;
  },
): ResolvedRate | null {
  const matching = rates.filter((r) => norm(r.work_type) === norm(work_type) && r.effective_date <= date);
  if (matching.length === 0) return null;

  const buckets = [
    matching.filter((r) => r.customer === customer && norm(r.equipment) === norm(equipment)),
    matching.filter((r) => r.customer === customer && !r.equipment),
    matching.filter((r) => !r.customer && norm(r.equipment) === norm(equipment)),
    matching.filter((r) => !r.customer && !r.equipment),
  ];
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    const best = bucket.reduce((a, b) => (b.effective_date > a.effective_date ? b : a));
    return { basis: best.basis, rate: best.rate };
  }
  return null;
}
