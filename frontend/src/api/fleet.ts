import { apiFetch } from './client';
import type { ComplianceDocument, DashboardPnL, Driver, Vehicle } from './types';

export const listVehicles = () => apiFetch<Vehicle[]>('/vehicles/');
export const listDrivers = () => apiFetch<Driver[]>('/drivers/');
export const listComplianceAlerts = () =>
  apiFetch<ComplianceDocument[]>('/compliance/documents/alerts/');
export const listComplianceDocuments = () =>
  apiFetch<ComplianceDocument[]>('/compliance/documents/');

export const getDashboardPnL = (start: string, end: string) =>
  apiFetch<DashboardPnL>(`/economics/pnl/dashboard/?start=${start}&end=${end}`);
