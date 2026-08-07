import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { RenewFields } from '../components/ComplianceModal';
import { listComplianceDocuments, retireComplianceDocument } from '../api/fleet';
import type { ComplianceDocument } from '../api/types';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

type HolderFilter = 'all' | 'vehicle' | 'driver';

// Expired first (longest-lapsed first within that), then due-soon, then
// valid - the same "surface what actually needs a decision first" framing
// Approvals.tsx uses for its own oldest-first sort, just ranked by urgency
// tier here since a document's "when" is its expiry, not when it was added.
function statusRank(doc: ComplianceDocument): number {
  if (doc.is_expired) return 0;
  if (doc.is_due) return 1;
  return 2;
}

export default function Compliance() {
  const [docs, setDocs] = useState<ComplianceDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holderFilter, setHolderFilter] = useState<HolderFilter>('all');
  const [renewingDoc, setRenewingDoc] = useState<ComplianceDocument | null>(null);

  function load() {
    listComplianceDocuments().then(setDocs).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleRetire(doc: ComplianceDocument) {
    if (!confirm(`Retire this ${humanize(doc.doc_type)} record?`)) return;
    await retireComplianceDocument(doc.id);
    load();
  }

  const rows = useMemo(() => {
    if (!docs) return null;
    return [...docs]
      .filter((d) => holderFilter === 'all' || (holderFilter === 'vehicle' ? d.vehicle : d.driver))
      .sort((a, b) => {
        const rankDiff = statusRank(a) - statusRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.valid_till ?? '9999-99-99').localeCompare(b.valid_till ?? '9999-99-99');
      });
  }, [docs, holderFilter]);

  const counts = useMemo(() => {
    const c = { all: docs?.length ?? 0, expired: 0, due: 0 };
    for (const d of docs ?? []) {
      if (d.is_expired) c.expired += 1;
      else if (d.is_due) c.due += 1;
    }
    return c;
  }, [docs]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Compliance</h1>
          <div className="sub">Every RC, insurance, permit and licence across the fleet, in one place — worst first.</div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="seg">
            <button className={holderFilter === 'all' ? 'active' : ''} onClick={() => setHolderFilter('all')}>
              All ({counts.all})
            </button>
            <button className={holderFilter === 'vehicle' ? 'active' : ''} onClick={() => setHolderFilter('vehicle')}>
              Vehicle
            </button>
            <button className={holderFilter === 'driver' ? 'active' : ''} onClick={() => setHolderFilter('driver')}>
              Driver
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {counts.expired > 0 && <span style={{ color: 'var(--critical)', fontWeight: 600 }}>{counts.expired} expired</span>}
            {counts.expired > 0 && counts.due > 0 && ' · '}
            {counts.due > 0 && <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{counts.due} due soon</span>}
            {counts.expired === 0 && counts.due === 0 && 'Nothing expired or due soon.'}
          </div>
        </div>

        <section className="table-card" style={{ marginTop: 14 }}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Holder</th><th>Document</th><th>Number</th><th>Valid till</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows?.map((doc) => (
                  <tr key={doc.id}>
                    <td className="reg-no">{doc.holder_display}</td>
                    <td>{humanize(doc.doc_type)}</td>
                    <td>{doc.doc_number || '—'}</td>
                    <td className="tnum">{doc.valid_till ? DATE_FMT.format(new Date(doc.valid_till)) : '—'}</td>
                    <td>
                      {doc.is_expired ? (
                        <span className="pill off" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Expired</span>
                      ) : doc.is_due ? (
                        <span className="pill svc">Due soon</span>
                      ) : (
                        <span className="pill on">Valid</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="link-btn" onClick={() => setRenewingDoc(doc)}>Renew</button>
                        <button className="link-btn danger" onClick={() => handleRetire(doc)}>Retire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows && rows.length === 0 && (
              <div className="empty-state">
                {holderFilter === 'all' ? 'No compliance documents yet.' : `No ${holderFilter} documents.`}
              </div>
            )}
          </div>
        </section>
      </main>

      {renewingDoc && (
        <Modal title={`Renew — ${humanize(renewingDoc.doc_type)}`} onClose={() => setRenewingDoc(null)}>
          <RenewFields
            doc={renewingDoc}
            onCancel={() => setRenewingDoc(null)}
            onSaved={() => { setRenewingDoc(null); load(); }}
          />
        </Modal>
      )}
    </>
  );
}
