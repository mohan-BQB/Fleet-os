import { apiFetch, toFormData } from './client';
import type {
  ComplianceDocument, DocumentInput, Driver, DriverInput, Vehicle, VehicleInput,
} from './types';

export const listVehicles = () => apiFetch<Vehicle[]>('/vehicles/');
export const createVehicle = (input: VehicleInput) =>
  apiFetch<Vehicle>('/vehicles/', { method: 'POST', body: JSON.stringify(input) });
export const updateVehicle = (id: string, input: VehicleInput) =>
  apiFetch<Vehicle>(`/vehicles/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireVehicle = (id: string) =>
  apiFetch<null>(`/vehicles/${id}/`, { method: 'DELETE' });

export type DriverFiles = Partial<Record<'photo' | 'licence_copy' | 'id_proof', File | null>>;

export const listDrivers = () => apiFetch<Driver[]>('/drivers/');
export const createDriver = (input: DriverInput, files: DriverFiles = {}) =>
  apiFetch<Driver>('/drivers/', { method: 'POST', body: toFormData(input, files) });
export const updateDriver = (id: string, input: DriverInput, files: DriverFiles = {}) =>
  apiFetch<Driver>(`/drivers/${id}/`, { method: 'PATCH', body: toFormData(input, files) });
export const retireDriver = (id: string) =>
  apiFetch<null>(`/drivers/${id}/`, { method: 'DELETE' });

export const listComplianceAlerts = () =>
  apiFetch<ComplianceDocument[]>('/compliance/documents/alerts/');
export const listComplianceDocuments = () =>
  apiFetch<ComplianceDocument[]>('/compliance/documents/');
export const createComplianceDocument = (input: DocumentInput, file?: File | null) =>
  apiFetch<ComplianceDocument>('/compliance/documents/', { method: 'POST', body: toFormData(input, { file }) });
export const updateComplianceDocument = (id: string, input: DocumentInput, file?: File | null) =>
  apiFetch<ComplianceDocument>(`/compliance/documents/${id}/`, { method: 'PATCH', body: toFormData(input, { file }) });
export const retireComplianceDocument = (id: string) =>
  apiFetch<null>(`/compliance/documents/${id}/`, { method: 'DELETE' });
