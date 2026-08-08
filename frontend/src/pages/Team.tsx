import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import SidePanel from '../components/SidePanel';
import { listDrivers } from '../api/fleet';
import { createUser, getEffectivePermissions, listUsers, setPermission, updateUser } from '../api/users';
import { ApiError } from '../api/client';
import {
  PERMISSION_SECTIONS, type AppUser, type Driver, type PermissionAction, type PermissionGrid,
  type PermissionSection, type Role, type UserCreateInput,
} from '../api/types';

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

const SECTION_LABELS: Record<PermissionSection, string> = {
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  expenses: 'Expenses',
  trip_work_cards: 'Trip & work cards',
  fuel_log: 'Fuel log',
  money_box_settlement: 'Money box & settlement',
  reports: 'Reports',
  customers_vendors: 'Customer & Vendor',
  company_users: 'Company & users',
};

const ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: 'view', label: 'View' },
  { key: 'add_edit', label: 'Add / edit' },
  { key: 'change_status', label: 'Change status' },
];

const BLANK: UserCreateInput = { username: '', email: '', password: '', role: 'manager', driver_id: null };

export default function Team() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<AppUser | null>(null);

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
          <h1>Users</h1>
          <div className="sub">{users ? `${users.length} accounts` : 'Loading…'} — access is owner-editable, no delete</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Add user</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll responsive">
            <table>
              <thead>
                <tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Username">{u.username}</td>
                    <td data-label="Email">{u.email || '—'}</td>
                    <td data-label="Role">{roleLabel(u.role)}</td>
                    <td data-label="Status"><span className={`pill ${u.is_active ? 'on' : 'off'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setPermissionsUser(u)}>Permissions</button>
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
      {permissionsUser && (
        <PermissionsPanel
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onRoleChanged={() => load()}
        />
      )}
    </>
  );
}

function PermissionsPanel({
  user, onClose, onRoleChanged,
}: { user: AppUser; onClose: () => void; onRoleChanged: () => void }) {
  const [role, setRole] = useState<Role>(user.role);
  const [grid, setGrid] = useState<PermissionGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  function load() {
    getEffectivePermissions(user.id)
      .then((res) => setGrid(res.permissions))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load permissions.'));
  }

  useEffect(load, [user.id]);

  async function handleRoleChange(newRole: Role) {
    setSavingRole(true);
    setError(null);
    try {
      await updateUser(user.id, { role: newRole });
      setRole(newRole);
      onRoleChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change role.');
    } finally {
      setSavingRole(false);
    }
  }

  async function handleToggle(section: PermissionSection, action: PermissionAction, current: boolean) {
    // Optimistic - the switch flips immediately, then confirms against the
    // server's resolved grid (in case the flip failed).
    setGrid((g) => (g ? { ...g, [section]: { ...g[section], [action]: !current } } : g));
    try {
      const res = await setPermission(user.id, section, action, !current);
      setGrid(res.permissions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that change.');
      load();
    }
  }

  return (
    <SidePanel title={`Permissions — ${user.username}`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}

      <div className="field span-2" style={{ marginBottom: 16, maxWidth: 260 }}>
        <label htmlFor="perm_role">Role preset</label>
        <select id="perm_role" value={role} disabled={savingRole} onChange={(e) => handleRoleChange(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="note" style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 16 }}>
        Picking a role fills these defaults — flip any switch below to override just for {user.username}.
      </div>

      {!grid && <div className="center-screen" style={{ minHeight: 120 }}>Loading…</div>}

      {grid && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Section</th>
                {ACTIONS.map((a) => <th key={a.key} style={{ textAlign: 'center' }}>{a.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_SECTIONS.map((section) => (
                <tr key={section}>
                  <td>{SECTION_LABELS[section]}</td>
                  {ACTIONS.map((a) => {
                    const allowed = grid[section]?.[a.key] ?? false;
                    return (
                      <td key={a.key} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allowed}
                          onChange={() => handleToggle(section, a.key, allowed)}
                          aria-label={`${SECTION_LABELS[section]} — ${a.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="note" style={{ marginTop: 14 }}>
        Every flip here is audited. Turning someone off entirely is done via their Active toggle on the user list,
        never delete.
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </SidePanel>
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
                {drivers.filter((d) => d.status === 'active').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
