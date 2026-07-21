import { apiFetch } from './client';
import type { DashboardPnL, Expense, ExpenseInput, VehiclePnL } from './types';

export const listExpenses = () => apiFetch<Expense[]>('/economics/expenses/');
export const createExpense = (input: ExpenseInput) =>
  apiFetch<Expense>('/economics/expenses/', { method: 'POST', body: JSON.stringify(input) });
export const updateExpense = (id: string, input: ExpenseInput) =>
  apiFetch<Expense>(`/economics/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireExpense = (id: string) =>
  apiFetch<null>(`/economics/expenses/${id}/`, { method: 'DELETE' });

export const getVehiclePnL = (vehicle: string, start: string, end: string) =>
  apiFetch<VehiclePnL>(`/economics/pnl/vehicle/?vehicle=${vehicle}&start=${start}&end=${end}`);
export const getDashboardPnL = (start: string, end: string) =>
  apiFetch<DashboardPnL>(`/economics/pnl/dashboard/?start=${start}&end=${end}`);
