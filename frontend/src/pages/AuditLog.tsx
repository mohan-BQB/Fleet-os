import { useEffect, useState } from 'react';
import { listAuditLog } from '../api/audit';
import { ApiError } from '../api/client';
import type { AuditLogEntry } from '../api/types';

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

const MODEL_NAMES = [
  'Vehicle', 'Driver', 'TripSheet', 'TripLeg', 'FuelLog', 'DriverLedgerEntry',
  'MaintenanceSchedule', 'MaintenanceLog', 'Tyre', 'TyreService', 'Expense',
  'ComplianceDocument', 'User', 'CompanyProfile',
];

function prettifyField(field: string) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionLabel(action: AuditLogEntry['action']) {
  if (action === 'create') return 'Created';
  if (action === 'retire') return 'Retired';
  if (action === 'login') return 'Logged in';
  return 'Edited';
}

export default function AuditLog() {
  const [modelName, setModelName] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(null);
    listAuditLog({ model_name: modelName || undefined, page })
      .then((data) => {
        setEntries(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load audit log.'));
  }, [modelName, page]);

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <section className="table-card">
        <div className="table-head">
          <h3>{count ? `${count} events` : 'Audit log'}</h3>
          <select value={modelName} onChange={(e) => { setModelName(e.target.value); setPage(1); }}
            className="no-print"
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, minWidth: 180 }}>
            <option value="">All record types</option>
            {MODEL_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="table-scroll responsive">
          <table>
            <thead>
              <tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Changes</th></tr>
            </thead>
            <tbody>
              {entries?.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="When" className="tnum">{DATE_TIME_FMT.format(new Date(entry.created_at))}</td>
                  <td data-label="User">{entry.user?.username ?? 'Unknown'}</td>
                  <td data-label="Action">{actionLabel(entry.action)}</td>
                  <td data-label="Record">{entry.model_name} <span style={{ color: 'var(--ink-soft)' }}>· {entry.object_id.slice(0, 8)}</span></td>
                  <td data-label="Changes">
                    {Object.keys(entry.changes).length === 0 ? '—' : (
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                        {Object.entries(entry.changes).map(([field, [before, after]]) => (
                          <li key={field}>{prettifyField(field)}: {before || '—'} → {after || '—'}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries && entries.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
        </div>
      </section>

      {(page > 1 || hasNext) && (
        <div className="form-actions no-print" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="btn" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
