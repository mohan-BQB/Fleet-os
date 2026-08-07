import { apiFetch } from './client';
import type {
  DriverLedgerEntry, DriverLedgerEntryInput, FuelLog, FuelLogInput, RouteRate, RouteRateInput,
  TripAdvance, TripAdvanceInput, TripExpense, TripExpenseInput, TripHoursInput,
  TripLeg, TripLegInput, TripSettlementInput, TripSheet, TripSheetInput,
  WorkItem, WorkItemInput, WorkRate, WorkRateInput,
} from './types';

export const listTripSheets = () => apiFetch<TripSheet[]>('/operations/trip-sheets/');
export const getTripSheet = (id: string) => apiFetch<TripSheet>(`/operations/trip-sheets/${id}/`);
export const createTripSheet = (input: TripSheetInput) =>
  apiFetch<TripSheet>('/operations/trip-sheets/', { method: 'POST', body: JSON.stringify(input) });
export const retireTripSheet = (id: string) =>
  apiFetch<null>(`/operations/trip-sheets/${id}/`, { method: 'DELETE' });
export const updateTripSettlement = (id: string, input: TripSettlementInput) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const updateTripHours = (id: string, input: TripHoursInput) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const updateTripSheetClosingMeter = (id: string, closing_meter: string) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/`, { method: 'PATCH', body: JSON.stringify({ closing_meter }) });
export const submitTripSheet = (id: string) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/submit/`, { method: 'POST' });
// One combined step - review only, no new data entry (the closing meter is
// already on the sheet from Submit). Owner/admin, or a manager the owner
// has specifically delegated the trip_work_cards permission to.
export const approveCloseTripSheet = (id: string, override_reason?: string) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/approve-close/`, {
    method: 'POST', body: JSON.stringify({ override_reason }),
  });

export const createTripLeg = (input: TripLegInput) =>
  apiFetch<TripLeg>('/operations/legs/', { method: 'POST', body: JSON.stringify(input) });
export const updateTripLeg = (id: string, input: TripLegInput) =>
  apiFetch<TripLeg>(`/operations/legs/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireTripLeg = (id: string) =>
  apiFetch<null>(`/operations/legs/${id}/`, { method: 'DELETE' });

export const createWorkItem = (input: WorkItemInput) =>
  apiFetch<WorkItem>('/operations/work-items/', { method: 'POST', body: JSON.stringify(input) });
export const retireWorkItem = (id: string) =>
  apiFetch<null>(`/operations/work-items/${id}/`, { method: 'DELETE' });

export const listRouteRates = () => apiFetch<RouteRate[]>('/operations/route-rates/');
export const createRouteRate = (input: RouteRateInput) =>
  apiFetch<RouteRate>('/operations/route-rates/', { method: 'POST', body: JSON.stringify(input) });

export const listWorkRates = () => apiFetch<WorkRate[]>('/operations/work-rates/');
export const createWorkRate = (input: WorkRateInput) =>
  apiFetch<WorkRate>('/operations/work-rates/', { method: 'POST', body: JSON.stringify(input) });

export const createTripAdvance = (input: TripAdvanceInput) =>
  apiFetch<TripAdvance>('/operations/trip-advances/', { method: 'POST', body: JSON.stringify(input) });
export const retireTripAdvance = (id: string) =>
  apiFetch<null>(`/operations/trip-advances/${id}/`, { method: 'DELETE' });

export const createTripExpense = (input: TripExpenseInput) =>
  apiFetch<TripExpense>('/operations/trip-expenses/', { method: 'POST', body: JSON.stringify(input) });
export const retireTripExpense = (id: string) =>
  apiFetch<null>(`/operations/trip-expenses/${id}/`, { method: 'DELETE' });

export const listFuelLogs = () => apiFetch<FuelLog[]>('/operations/fuel-logs/');
export const createFuelLog = (input: FuelLogInput) =>
  apiFetch<FuelLog>('/operations/fuel-logs/', { method: 'POST', body: JSON.stringify(input) });
export const updateFuelLog = (id: string, input: FuelLogInput) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireFuelLog = (id: string) =>
  apiFetch<null>(`/operations/fuel-logs/${id}/`, { method: 'DELETE' });
export const markFuelLogPaid = (id: string, payment_mode?: string) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/mark_paid/`, {
    method: 'POST', body: JSON.stringify({ payment_mode }),
  });
export const submitFuelLog = (id: string) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/submit/`, { method: 'POST' });
export const approveFuelLog = (id: string, approval_note?: string) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/approve/`, {
    method: 'POST', body: JSON.stringify({ approval_note }),
  });
export const rejectFuelLog = (id: string, approval_note: string) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/reject/`, {
    method: 'POST', body: JSON.stringify({ approval_note }),
  });

export const listLedgerEntries = () => apiFetch<DriverLedgerEntry[]>('/operations/ledger-entries/');
export const createLedgerEntry = (input: DriverLedgerEntryInput) =>
  apiFetch<DriverLedgerEntry>('/operations/ledger-entries/', { method: 'POST', body: JSON.stringify(input) });
export const updateLedgerEntry = (id: string, input: DriverLedgerEntryInput) =>
  apiFetch<DriverLedgerEntry>(`/operations/ledger-entries/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireLedgerEntry = (id: string) =>
  apiFetch<null>(`/operations/ledger-entries/${id}/`, { method: 'DELETE' });
