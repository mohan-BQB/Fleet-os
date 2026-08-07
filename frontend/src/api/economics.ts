import { apiFetch } from './client';
import type { DashboardPnL, Expense, ExpenseHead, ExpenseHeadInput, ExpenseInput, VehiclePnL } from './types';

// Masters -> Expense. No delete, no status action - add + rename only.
export const listExpenseHeads = () => apiFetch<ExpenseHead[]>('/economics/expense-heads/');
export const createExpenseHead = (input: ExpenseHeadInput) =>
  apiFetch<ExpenseHead>('/economics/expense-heads/', { method: 'POST', body: JSON.stringify(input) });
export const updateExpenseHead = (id: string, input: Partial<ExpenseHeadInput>) =>
  apiFetch<ExpenseHead>(`/economics/expense-heads/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });

export const listExpenses = () => apiFetch<Expense[]>('/economics/expenses/');
export const createExpense = (input: ExpenseInput) =>
  apiFetch<Expense>('/economics/expenses/', { method: 'POST', body: JSON.stringify(input) });
export const updateExpense = (id: string, input: ExpenseInput) =>
  apiFetch<Expense>(`/economics/expenses/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireExpense = (id: string) =>
  apiFetch<null>(`/economics/expenses/${id}/`, { method: 'DELETE' });
export const markExpensePaid = (id: string, payment_mode?: string) =>
  apiFetch<Expense>(`/economics/expenses/${id}/mark_paid/`, {
    method: 'POST', body: JSON.stringify({ payment_mode }),
  });
export const approveExpense = (id: string, approval_note?: string) =>
  apiFetch<Expense>(`/economics/expenses/${id}/approve/`, {
    method: 'POST', body: JSON.stringify({ approval_note }),
  });
export const rejectExpense = (id: string, approval_note: string) =>
  apiFetch<Expense>(`/economics/expenses/${id}/reject/`, {
    method: 'POST', body: JSON.stringify({ approval_note }),
  });

export const getVehiclePnL = (vehicle: string, start: string, end: string) =>
  apiFetch<VehiclePnL>(`/economics/pnl/vehicle/?vehicle=${vehicle}&start=${start}&end=${end}`);
export const getDashboardPnL = (start: string, end: string) =>
  apiFetch<DashboardPnL>(`/economics/pnl/dashboard/?start=${start}&end=${end}`);
