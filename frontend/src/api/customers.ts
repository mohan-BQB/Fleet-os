import { apiFetch } from './client';
import type { Customer, CustomerInput, CustomerLedgerEntry, CustomerLedgerEntryInput } from './types';

export const listCustomers = () => apiFetch<Customer[]>('/customers/');
export const createCustomer = (input: CustomerInput) =>
  apiFetch<Customer>('/customers/', { method: 'POST', body: JSON.stringify(input) });
export const updateCustomer = (id: string, input: CustomerInput) =>
  apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireCustomer = (id: string) =>
  apiFetch<null>(`/customers/${id}/`, { method: 'DELETE' });

export const listCustomerLedgerEntries = () => apiFetch<CustomerLedgerEntry[]>('/customer-ledger-entries/');
export const createCustomerLedgerEntry = (input: CustomerLedgerEntryInput) =>
  apiFetch<CustomerLedgerEntry>('/customer-ledger-entries/', { method: 'POST', body: JSON.stringify(input) });
export const updateCustomerLedgerEntry = (id: string, input: CustomerLedgerEntryInput) =>
  apiFetch<CustomerLedgerEntry>(`/customer-ledger-entries/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireCustomerLedgerEntry = (id: string) =>
  apiFetch<null>(`/customer-ledger-entries/${id}/`, { method: 'DELETE' });
