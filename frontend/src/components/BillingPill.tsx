const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

interface Props {
  billing: string;
  amount: string | null;
  note: string;
  isPaid: boolean | null;
}

// Every TyreService/MaintenanceLog now has to say vendor-vs-internal (see
// TyreServiceSerializer/MaintenanceLogSerializer.validate()), and a vendor
// entry further says paid-vs-pending (via the linked Expense's own vendor-
// ledger state) - this renders both in one glance in the service tables.
export default function BillingPill({ billing, amount, note, isPaid }: Props) {
  if (billing === 'paid') {
    const label = `${isPaid ? 'Paid' : 'Pending'}${amount ? ` · ${CURRENCY.format(Number(amount))}` : ''}`;
    return <span className={`pill ${isPaid ? 'on' : 'svc'}`} title={note || undefined}>{label}</span>;
  }
  if (billing === 'done_internally') {
    return <span className="pill off" title={note || undefined}>Internal</span>;
  }
  return <span className="pill off">—</span>;
}
