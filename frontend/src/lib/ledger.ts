import { LEDGER_CREDIT_TYPES, type DriverLedgerEntry } from '../api/types';

// Sum of credits (wage/bonus) minus debits (advance/deduction/payment).
// Positive = company owes the driver; negative = driver owes an advance.
export function driverBalance(entries: DriverLedgerEntry[]): number {
  return entries.reduce(
    (bal, e) => bal + (LEDGER_CREDIT_TYPES.has(e.entry_type) ? Number(e.amount) : -Number(e.amount)),
    0,
  );
}

export function outstandingAdvance(entries: DriverLedgerEntry[]): number {
  return Math.max(0, -driverBalance(entries));
}
