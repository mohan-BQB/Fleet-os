import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { ApiError } from '../api/client';

// Shared by Expense's approve/reject row actions (and FuelLog's, if it
// adopts the same pattern later) - replaces a bare window.prompt()/instant
// POST with a real confirmation step that shows what's being decided on,
// same as MarkPaidModal does for "mark paid". Reject always needs a reason
// (enforced again server-side - economics.views.ExpenseViewSet.reject);
// approve's note is optional, for a rare "approved, but note the mileage
// looks high" kind of remark.
export function ApprovalDecisionModal({
  mode, title, summary, onConfirm, onClose,
}: {
  mode: 'approve' | 'reject';
  title: string;
  summary: { label: string; value: string }[];
  onConfirm: (note: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noteRequired = mode === 'reject';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (noteRequired && !note.trim()) {
      setError('Say why this is being rejected.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${mode} this.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {summary.map((row) => (
            <div className="field" key={row.label}>
              <label>{row.label}</label>
              <div className="reg-no" style={{ padding: '8px 0' }}>{row.value}</div>
            </div>
          ))}
          <div className="field span-2">
            <label htmlFor="decision_note">{noteRequired ? 'Reason for rejection' : 'Note (optional)'}</label>
            <textarea
              id="decision_note" rows={3} autoFocus={noteRequired}
              placeholder={noteRequired ? 'Required — explain why this is being rejected' : 'Optional'}
              value={note} onChange={(e) => { setNote(e.target.value); setError(null); }}
            />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className={`btn ${mode === 'approve' ? 'primary' : 'danger'}`} disabled={saving}>
            {saving ? 'Saving…' : mode === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
