// Shared by Expense.tsx (pending/approved/rejected) and FuelLog.tsx
// (draft/submitted/approved/rejected) - same three-tone treatment, each
// page maps its own status vocabulary to a tone + label rather than this
// component hardcoding either one's status strings.
export type ApprovalTone = 'pending' | 'good' | 'bad';

export function ApprovalStatusPill({ label, tone }: { label: string; tone: ApprovalTone }) {
  if (tone === 'good') return <span className="pill on">{label}</span>;
  if (tone === 'bad') {
    return (
      <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>
        {label}
      </span>
    );
  }
  return <span className="pill svc">{label}</span>;
}
