import { apiFetch } from './client';
import type { Vendor, VendorInput, VendorLedgerEntry, VendorLedgerEntryInput } from './types';

export const listVendors = () => apiFetch<Vendor[]>('/vendors/');
export const createVendor = (input: VendorInput) =>
  apiFetch<Vendor>('/vendors/', { method: 'POST', body: JSON.stringify(input) });
export const updateVendor = (id: string, input: VendorInput) =>
  apiFetch<Vendor>(`/vendors/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireVendor = (id: string) =>
  apiFetch<null>(`/vendors/${id}/`, { method: 'DELETE' });

export const listVendorLedgerEntries = () => apiFetch<VendorLedgerEntry[]>('/vendor-ledger-entries/');
export const createVendorLedgerEntry = (input: VendorLedgerEntryInput) =>
  apiFetch<VendorLedgerEntry>('/vendor-ledger-entries/', { method: 'POST', body: JSON.stringify(input) });
export const updateVendorLedgerEntry = (id: string, input: VendorLedgerEntryInput) =>
  apiFetch<VendorLedgerEntry>(`/vendor-ledger-entries/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireVendorLedgerEntry = (id: string) =>
  apiFetch<null>(`/vendor-ledger-entries/${id}/`, { method: 'DELETE' });
