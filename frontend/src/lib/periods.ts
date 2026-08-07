// One shared "timeline" control (7 days / 30 days / Quarterly / Yearly /
// Financial year / Custom) used everywhere a period picker shows up:
// Dashboard, Vehicle Expenses, and the per-vehicle detail view.

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function quarterStartIso() {
  const d = new Date();
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
}

// Indian financial year: 1 Apr - 31 Mar.
export function financialYearStartIso() {
  const d = new Date();
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-04-01`;
}

export function financialYearEndDaysAhead() {
  const d = new Date();
  const endYear = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
  const fyEnd = new Date(`${endYear}-03-31`);
  return Math.round((fyEnd.getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
}

export function daysFromToday(isoDate: string) {
  const ms = new Date(isoDate).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86_400_000);
}

export type TimelinePeriod = 'week' | 'month30' | 'quarter' | 'year' | 'fy' | 'custom';

export const TIMELINE_PERIODS: { key: TimelinePeriod; label: string }[] = [
  { key: 'week', label: '7 days' },
  { key: 'month30', label: '30 days' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
  { key: 'fy', label: 'Financial year' },
  { key: 'custom', label: 'Custom' },
];

export interface DateRange {
  start: string;
  end: string;
}

// How far ahead (in days) each preset looks - used both to build a backward
// spend window (today - N .. today) and a forward due window (today .. today + N).
function presetDays(period: Exclude<TimelinePeriod, 'custom'>): number {
  switch (period) {
    case 'week': return 7;
    case 'month30': return 30;
    case 'quarter': return 90;
    case 'year': return 365;
    case 'fy': return financialYearEndDaysAhead();
  }
}

// Money already spent looks backward from today: "last 7 days", "last 30
// days", etc. Quarterly/Yearly/FY use their calendar start instead of a
// flat day count, so "Quarterly" means "this quarter to date", not just
// "the last 90 days".
export function timelineSpendRange(period: TimelinePeriod, custom: DateRange): DateRange {
  const end = todayIso();
  switch (period) {
    case 'week': return { start: daysAgoIso(6), end };
    case 'month30': return { start: daysAgoIso(29), end };
    case 'quarter': return { start: quarterStartIso(), end };
    case 'year': return { start: daysAgoIso(364), end };
    case 'fy': return { start: financialYearStartIso(), end };
    case 'custom': return custom;
  }
}

// Compliance has no amount to sum, only a due date, so the same buttons
// mean "documents due within the next N days" instead - forward-looking.
// Custom is an explicit [start, end] window on valid_till.
export function inTimelineDueWindow(validTill: string | null, period: TimelinePeriod, custom: DateRange): boolean {
  if (!validTill) return false;
  if (period === 'custom') return validTill >= custom.start && validTill <= custom.end;
  const days = daysFromToday(validTill);
  return days >= 0 && days <= presetDays(period);
}
