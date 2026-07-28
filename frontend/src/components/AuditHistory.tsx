import { useEffect, useState } from 'react';
import { listAuditLog } from '../api/audit';
import { useAuth } from '../context/AuthContext';
import type { AuditLogEntry } from '../api/types';

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

function prettifyField(field: string) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionLabel(action: AuditLogEntry['action']) {
  if (action === 'create') return 'Created';
  if (action === 'retire') return 'Retired';
  if (action === 'login') return 'Logged in';
  return 'Edited';
}

// Per-record audit trail, dropped into a form's edit view. Owner/Admin only
// - the backend's view_audit_log capability is the real gate; this check
// just keeps the panel off other roles' screens rather than showing an
// empty/errored fetch.
export default function AuditHistory({ modelName, objectId }: { modelName: string; objectId: string }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  const canView = user?.role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    if (!canView) return;
    listAuditLog({ model_name: modelName, object_id: objectId })
      .then((page) => setEntries(page.results))
      .catch(() => setEntries([]));
  }, [canView, modelName, objectId]);

  if (!canView || !entries || entries.length === 0) return null;

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        History
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ fontSize: 12.5 }}>
            <div>
              <strong>{actionLabel(entry.action)}</strong> by {entry.user?.username ?? 'Unknown'}
              <span style={{ color: 'var(--ink-soft)' }}> · {DATE_TIME_FMT.format(new Date(entry.created_at))}</span>
            </div>
            {Object.keys(entry.changes).length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--ink-soft)' }}>
                {Object.entries(entry.changes).map(([field, [before, after]]) => (
                  <li key={field}>
                    {prettifyField(field)}: {before || '—'} → {after || '—'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
