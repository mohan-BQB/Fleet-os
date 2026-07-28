import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { listDrivers } from '../api/fleet';
import { createUser, listUsers, updateUser } from '../api/users';
import { ApiError } from '../api/client';
import type { AppUser, Driver, Role, UserCreateInput } from '../api/types';

const ROLES: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Fleet manager' },
  { value: 'driver', label: 'Driver' },
  { value: 'accountant', label: 'Accountant' },
];

function roleLabel(role: Role) {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

const BLANK: UserCreateInput = { username: '', email: '', password: '', role: 'manager', driver_id: null };

export default function Team() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listUsers().then(setUsers).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listDrivers().then(setDrivers).catch(() => {});
  }, []);

  async function handleToggleActive(u: AppUser) {
    const verb = u.is_active ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${verb} ${u.username}?`)) return;
    setError(null);
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${verb.toLowerCase()} user.`);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <div className="sub">{users ? `${users.length} accounts` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Add user</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email || '—'}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td><span className={`pill ${u.is_active ? 'on' : 'off'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className={`link-btn ${u.is_active ? 'danger' : ''}`} onClick={() => handleToggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users && users.length === 0 && <div className="empty-state">No team accounts yet.</div>}
          </div>
        </section>
      </main>

      {showForm && (
        <UserForm
          drivers={drivers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </>
  );
}

function UserForm({
  drivers, onClose, onSaved,
}: { drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<UserCreateInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof UserCreateInput>(key: K, value: UserCreateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser(form.role === 'driver' ? form : { ...form, driver_id: null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="username">Username</label>
            <input id="username" required value={form.username} onChange={(e) => set('username', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required value={form.password} onChange={(e) => set('password', e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="role">Role</label>
            <select id="role" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {form.role === 'driver' && (
            <div className="field span-2">
              <label htmlFor="driver_id">Linked driver</label>
              <select id="driver_id" required value={form.driver_id ?? ''} onChange={(e) => set('driver_id', e.target.value || null)}>
                <option value="">Select a driver…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Add user'}</button>
        </div>
      </form>
    </Modal>
  );
}
