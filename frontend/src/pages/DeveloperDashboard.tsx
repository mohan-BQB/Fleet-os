import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import {
  createApiKey, getSystemHealth, listApiKeys, listJobRuns, revokeApiKey, triggerComplianceJob,
} from '../api/console';
import { ApiError } from '../api/client';
import type { ApiKey, JobRun, SystemHealth } from '../api/types';

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

function statusLabel(status: JobRun['status']) {
  if (status === 'success') return 'Success';
  if (status === 'failed') return 'Failed';
  return 'Running';
}

export default function DeveloperDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
  const [jobRuns, setJobRuns] = useState<JobRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [triggering, setTriggering] = useState(false);

  function load() {
    getSystemHealth().then(setHealth).catch((err) => setError(err.message));
    listApiKeys().then(setApiKeys).catch((err) => setError(err.message));
    listJobRuns().then(setJobRuns).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRunNow() {
    setTriggering(true);
    setError(null);
    try {
      await triggerComplianceJob();
      listJobRuns().then(setJobRuns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not trigger the job.');
    } finally {
      setTriggering(false);
    }
  }

  async function handleRevoke(key: ApiKey) {
    if (!confirm(`Revoke "${key.name}"? Anything using it will stop working immediately.`)) return;
    setError(null);
    try {
      await revokeApiKey(key.id);
      listApiKeys().then(setApiKeys);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revoke the key.');
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Developer Dashboard</h1>
          <div className="sub">Cross-organization health, API keys, and background jobs</div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {health && (
          <div className="stat-row">
            <div className="tile">
              <div className="tile-label">Organizations</div>
              <div className="tile-value">{health.organization_count}</div>
              <div className="tile-foot">{health.active_organization_count} active</div>
            </div>
            <div className="tile">
              <div className="tile-label">Users</div>
              <div className="tile-value">{health.user_count}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Vehicles</div>
              <div className="tile-value">{health.vehicle_count}</div>
            </div>
            <div className="tile">
              <div className="tile-label">Drivers</div>
              <div className="tile-value">{health.driver_count}</div>
            </div>
          </div>
        )}

        <section className="table-card">
          <div className="table-head">
            <h3>Background jobs</h3>
            <button className="btn primary" onClick={handleRunNow} disabled={triggering}>
              {triggering ? 'Running…' : 'Run check_compliance now'}
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Job</th><th>Started</th><th>Status</th><th>Triggered by</th><th>Summary</th></tr>
              </thead>
              <tbody>
                {jobRuns?.map((run) => (
                  <tr key={run.id}>
                    <td>{run.job_name}</td>
                    <td className="tnum">{DATE_TIME_FMT.format(new Date(run.started_at))}</td>
                    <td><span className={`pill ${run.status === 'success' ? 'on' : run.status === 'failed' ? 'off' : 'svc'}`}>{statusLabel(run.status)}</span></td>
                    <td>{run.triggered_by_username ?? 'cron/CLI'}</td>
                    <td>{run.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobRuns && jobRuns.length === 0 && <div className="empty-state">No job runs yet.</div>}
          </div>
        </section>

        <section className="table-card">
          <div className="table-head">
            <h3>API keys</h3>
            <button className="btn primary" onClick={() => setShowKeyForm(true)}>+ New key</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th></th></tr>
              </thead>
              <tbody>
                {apiKeys?.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td className="tnum">{key.prefix}…</td>
                    <td className="tnum">{DATE_TIME_FMT.format(new Date(key.created_at))}</td>
                    <td className="tnum">{key.last_used_at ? DATE_TIME_FMT.format(new Date(key.last_used_at)) : 'Never'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn danger" onClick={() => handleRevoke(key)}>Revoke</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {apiKeys && apiKeys.length === 0 && <div className="empty-state">No active API keys.</div>}
          </div>
        </section>

        <section className="table-card">
          <div className="table-head"><h3>Recent activity, all organizations</h3></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>When</th><th>Organization</th><th>User</th><th>Action</th><th>Record</th></tr>
              </thead>
              <tbody>
                {health?.recent_audit_log.map((entry) => (
                  <tr key={entry.id}>
                    <td className="tnum">{DATE_TIME_FMT.format(new Date(entry.created_at))}</td>
                    <td>{entry.organization_name ?? '—'}</td>
                    <td>{entry.user?.username ?? 'Unknown'}</td>
                    <td>{entry.action}</td>
                    <td>{entry.model_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {health && health.recent_audit_log.length === 0 && <div className="empty-state">No activity yet.</div>}
          </div>
        </section>
      </main>

      {showKeyForm && (
        <ApiKeyForm
          onClose={() => setShowKeyForm(false)}
          onCreated={(key) => { setShowKeyForm(false); setNewKey(key); load(); }}
        />
      )}
      {newKey && <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />}
    </>
  );
}

function ApiKeyForm({ onClose, onCreated }: { onClose: () => void; onCreated: (key: ApiKey) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await createApiKey(name));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the key.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New API key" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="key-name">Name</label>
            <input id="key-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier integration" />
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Create key'}</button>
        </div>
      </form>
    </Modal>
  );
}

function NewKeyModal({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) {
  return (
    <Modal title="API key created" onClose={onClose}>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Copy this key now - it won't be shown again.
      </p>
      <code style={{
        display: 'block', padding: '10px 12px', borderRadius: 8, background: 'var(--paper)',
        fontSize: 13, wordBreak: 'break-all', border: '1px solid var(--border)',
      }}>
        {apiKey.raw_key}
      </code>
      <div className="form-actions">
        <button type="button" className="btn primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
