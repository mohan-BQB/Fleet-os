import { apiFetch } from './client';
import type { FuelLog, FuelLogInput, TripLeg, TripLegInput, TripSheet, TripSheetInput } from './types';

export const listTripSheets = () => apiFetch<TripSheet[]>('/operations/trip-sheets/');
export const createTripSheet = (input: TripSheetInput) =>
  apiFetch<TripSheet>('/operations/trip-sheets/', { method: 'POST', body: JSON.stringify(input) });
export const retireTripSheet = (id: string) =>
  apiFetch<null>(`/operations/trip-sheets/${id}/`, { method: 'DELETE' });
export const closeTripSheet = (id: string, closing_meter: string) =>
  apiFetch<TripSheet>(`/operations/trip-sheets/${id}/close/`, {
    method: 'POST', body: JSON.stringify({ closing_meter }),
  });

export const createTripLeg = (input: TripLegInput) =>
  apiFetch<TripLeg>('/operations/legs/', { method: 'POST', body: JSON.stringify(input) });
export const updateTripLeg = (id: string, input: TripLegInput) =>
  apiFetch<TripLeg>(`/operations/legs/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireTripLeg = (id: string) =>
  apiFetch<null>(`/operations/legs/${id}/`, { method: 'DELETE' });

export const listFuelLogs = () => apiFetch<FuelLog[]>('/operations/fuel-logs/');
export const createFuelLog = (input: FuelLogInput) =>
  apiFetch<FuelLog>('/operations/fuel-logs/', { method: 'POST', body: JSON.stringify(input) });
export const updateFuelLog = (id: string, input: FuelLogInput) =>
  apiFetch<FuelLog>(`/operations/fuel-logs/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireFuelLog = (id: string) =>
  apiFetch<null>(`/operations/fuel-logs/${id}/`, { method: 'DELETE' });
