import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import {
  createOrganization, impersonateOrganization, listOrganizations, updateOrganization,
} from '../api/console';
import { ApiError } from '../api/client';
import { OPTIONAL_MODULES } from '../api/types';
import type { OrganizationAdmin, OrganizationCreateInput } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const BLANK: OrganizationCreateInput = {
  name: '', disabled_modules: [], owner: { username: '', email: '', password: '' },
};

export default function ControlCenter() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingModules, setEditingModules] = useState<OrganizationAdmin | null>(null);

  function load() {
    listOrganizations().then(setOrgs).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleToggleActive(org: OrganizationAdmin) {
    const verb = org.is_active ? 'Suspend' : 'Reactivate';
    if (!confirm(`${verb} "${org.name}"? ${org.is_active ? 'Its users will be unable to log in.' : ''}`)) return;
    setError(null);
    try {
      await updateOrganization(org.id, { is_active: !org.is_active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${verb.toLowerCase()} the organization.`);
    }
  }

  async function handleImpersonate(org: OrganizationAdmin) {
    setError(null);
    try {
      await impersonateOrganization(org.id);
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not view as this organization.');
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Control Center</h1>
          <div className="sub">{orgs ? `${orgs.length} organizations` : 'Loading…'}</div>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New organization</button>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Status</th><th>Users</th><th>Vehicles</th><th>Drivers</th>
                  <th>Created</th><th></th>
                </tr>
              </thead>
              <tbody>
                {orgs?.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td><span className={`pill ${org.is_active ? 'on' : 'off'}`}>{org.is_active ? 'Active' : 'Suspended'}</span></td>
                    <td className="tnum">{org.user_count}</td>
                    <td className="tnum">{org.vehicle_count}</td>
                    <td className="tnum">{org.driver_count}</td>
                    <td className="tnum">{DATE_FMT.format(new Date(org.created_at))}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setEditingModules(org)}>Modules</button>
                        <button className="link-btn" onClick={() => handleImpersonate(org)}>View as</button>
                        <button className={`link-btn ${org.is_active ? 'danger' : ''}`} onClick={() => handleToggleActive(org)}>
                          {org.is_active ? 'Suspend' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orgs && orgs.length === 0 && <div className="empty-state">No organizations yet.</div>}
          </div>
        </section>
      </main>

      {showCreate && (
        <CreateOrgForm onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editingModules && (
        <ModulesForm
          org={editingModules}
          onClose={() => setEditingModules(null)}
          onSaved={() => { setEditingModules(null); load(); }}
        />
      )}
    </>
  );
}

function ModuleCheckboxes({
  disabledModules, onChange,
}: { disabledModules: string[]; onChange: (next: string[]) => void }) {
  const disabledSet = new Set(disabledModules);

  function toggle(key: string, enabled: boolean) {
    const next = new Set(disabledSet);
    if (enabled) next.delete(key); else next.add(key);
    onChange([...next]);
  }

  return (
    <div className="field span-2">
      <label>Enabled modules</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 4 }}>
        {OPTIONAL_MODULES.map((m) => (
          <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={!disabledSet.has(m.value)}
              onChange={(e) => toggle(m.value, e.target.checked)}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function CreateOrgForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<OrganizationCreateInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createOrganization(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the organization.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New organization" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="org-name">Organization name</label>
            <input
              id="org-name" required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="owner-username">Owner username</label>
            <input
              id="owner-username" required value={form.owner.username}
              onChange={(e) => setForm((f) => ({ ...f, owner: { ...f.owner, username: e.target.value } }))}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="owner-email">Owner email</label>
            <input
              id="owner-email" type="email" required value={form.owner.email}
              onChange={(e) => setForm((f) => ({ ...f, owner: { ...f.owner, email: e.target.value } }))}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="owner-password">Owner password</label>
            <input
              id="owner-password" type="password" required value={form.owner.password}
              onChange={(e) => setForm((f) => ({ ...f, owner: { ...f.owner, password: e.target.value } }))}
            />
          </div>
          <ModuleCheckboxes
            disabledModules={form.disabled_modules}
            onChange={(disabled_modules) => setForm((f) => ({ ...f, disabled_modules }))}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Create organization'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ModulesForm({
  org, onClose, onSaved,
}: { org: OrganizationAdmin; onClose: () => void; onSaved: () => void }) {
  const [disabledModules, setDisabledModules] = useState(org.disabled_modules);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateOrganization(org.id, { disabled_modules: disabledModules });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save modules.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Modules — ${org.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <ModuleCheckboxes disabledModules={disabledModules} onChange={setDisabledModules} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
