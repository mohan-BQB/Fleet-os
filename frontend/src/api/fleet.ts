import { apiFetch, toFormData } from './client';
import type {
  ComplianceDocument, DocumentInput, Driver, DriverInput, Vehicle, VehicleInput,
  VehicleLoan, VehicleLoanInput, VehicleLoanInstallment,
} from './types';

export type VehicleFiles = Partial<Record<'rc_copy' | 'rc_copy_back' | 'photo' | 'previous_rc_copy', File | null>>;

export const listVehicles = () => apiFetch<Vehicle[]>('/vehicles/');
export const createVehicle = (input: VehicleInput, files: VehicleFiles = {}) =>
  apiFetch<Vehicle>('/vehicles/', { method: 'POST', body: toFormData(input, files) });
export const updateVehicle = (id: string, input: VehicleInput, files: VehicleFiles = {}) =>
  apiFetch<Vehicle>(`/vehicles/${id}/`, { method: 'PATCH', body: toFormData(input, files) });
// Status changes - no bare delete/retire anymore, each is its own
// validated, reason/detail-capturing door (see vehicles.models.Vehicle.
// change_status and its ALLOWED_TRANSITIONS table).
export const markVehicleInService = (id: string, reason = '') =>
  apiFetch<Vehicle>(`/vehicles/${id}/mark_in_service/`, { method: 'POST', body: JSON.stringify({ reason }) });
export const markVehicleActive = (id: string, reason = '') =>
  apiFetch<Vehicle>(`/vehicles/${id}/mark_active/`, { method: 'POST', body: JSON.stringify({ reason }) });
export const markVehicleSold = (id: string, sold_date: string, buyer = '', sale_amount?: string) =>
  apiFetch<Vehicle>(`/vehicles/${id}/mark_sold/`, {
    method: 'POST', body: JSON.stringify({ sold_date, buyer, sale_amount }),
  });
export const markVehicleScrapped = (id: string, scrap_date: string, reason = '') =>
  apiFetch<Vehicle>(`/vehicles/${id}/mark_scrapped/`, {
    method: 'POST', body: JSON.stringify({ scrap_date, reason }),
  });

// EMI/loan - set up once (no delete/status toggle, same minimal footprint
// as Expense heads), the full installment schedule generates server-side
// the moment the loan is created.
export const listVehicleLoans = () => apiFetch<VehicleLoan[]>('/vehicle-loans/');
export const createVehicleLoan = (input: VehicleLoanInput) =>
  apiFetch<VehicleLoan>('/vehicle-loans/', { method: 'POST', body: JSON.stringify(input) });
export const listVehicleLoanInstallments = () => apiFetch<VehicleLoanInstallment[]>('/vehicle-loan-installments/');
export const markVehicleLoanInstallmentPaid = (id: string, paid_date: string, payment_mode: string) =>
  apiFetch<VehicleLoanInstallment>(`/vehicle-loan-installments/${id}/mark_paid/`, {
    method: 'POST', body: JSON.stringify({ paid_date, payment_mode }),
  });

export type DriverFiles = Partial<Record<'photo' | 'licence_copy' | 'id_proof', File | null>>;

export const listDrivers = () => apiFetch<Driver[]>('/drivers/');
export const createDriver = (input: DriverInput, files: DriverFiles = {}) =>
  apiFetch<Driver>('/drivers/', { method: 'POST', body: toFormData(input, files) });
export const updateDriver = (id: string, input: DriverInput, files: DriverFiles = {}) =>
  apiFetch<Driver>(`/drivers/${id}/`, { method: 'PATCH', body: toFormData(input, files) });
export const changeDriverStatus = (id: string, status: Driver['status'], reason = '') =>
  apiFetch<Driver>(`/drivers/${id}/change_status/`, { method: 'POST', body: JSON.stringify({ status, reason }) });
export const rejoinDriver = (id: string, reason = '') =>
  apiFetch<Driver>(`/drivers/${id}/rejoin/`, { method: 'POST', body: JSON.stringify({ reason }) });

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
export interface DocumentRenewInput {
  valid_till: string;
  doc_number?: string;
  issue_date?: string | null;
  reminder_days_before?: number;
  notes?: string;
}
export const renewComplianceDocument = (id: string, input: DocumentRenewInput) =>
  apiFetch<ComplianceDocument>(`/compliance/documents/${id}/renew/`, {
    method: 'POST', body: JSON.stringify(input),
  });
