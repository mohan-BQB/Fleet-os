import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { changePassword } from '../api/auth';
import { ApiError } from '../api/client';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation don’t match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword(oldPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Modal title="Change password" onClose={onClose}>
        <p>Your password has been changed.</p>
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="old_password">Current password</label>
            <input
              id="old_password" type="password" required autoComplete="current-password"
              value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="new_password">New password</label>
            <input
              id="new_password" type="password" required autoComplete="new-password"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="confirm_password">Confirm new password</label>
            <input
              id="confirm_password" type="password" required autoComplete="new-password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
