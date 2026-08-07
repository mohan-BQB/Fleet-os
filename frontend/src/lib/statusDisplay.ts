import type { ApprovalTone } from '../components/ApprovalStatusPill';
import type { ExpenseApprovalStatus, FuelLogStatus } from '../api/types';

// Was independently copy-pasted into Expense.tsx, Tyres.tsx, and
// Maintenance.tsx (identical values in all three - the same three-state
// approval_status shown via ApprovalStatusPill). One definition now, so a
// future addition to ExpenseApprovalStatus doesn't need updating in three
// places to stay in sync.
export const EXPENSE_APPROVAL_LABEL: Record<ExpenseApprovalStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
};
export const EXPENSE_APPROVAL_TONE: Record<ExpenseApprovalStatus, ApprovalTone> = {
  pending: 'pending', approved: 'good', rejected: 'bad',
};

// FuelLog's own five-state status (Open/Submitted/Approved/Rejected/
// Cancelled) - was defined in FuelLog.tsx and copy-pasted again into
// Expense.tsx's "All costs" tab for its own Fuel Log rows.
export const FUEL_STATUS_LABEL: Record<FuelLogStatus, string> = {
  draft: 'Open', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};
export const FUEL_STATUS_TONE: Record<FuelLogStatus, ApprovalTone> = {
  draft: 'pending', submitted: 'pending', approved: 'good', rejected: 'bad', cancelled: 'bad',
};
