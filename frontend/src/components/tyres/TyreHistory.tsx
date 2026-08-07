import Modal from '../Modal';
import BillingPill from '../BillingPill';
import type { Tyre, TyreService, Vendor } from '../../api/types';
import { DATE_FMT, humanize } from './utils';

export default function TyreHistory({
  tyre, services, tyres, vendors, onClose,
}: { tyre: Tyre; services: TyreService[]; tyres: Tyre[]; vendors: Vendor[]; onClose: () => void }) {
  const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date));
  const vendorName = (id: string | null) => (id && vendors.find((v) => v.id === id)?.name) || null;
  const tyreLabel = (id: string | null) => {
    const t = id && tyres.find((x) => x.id === id);
    return t ? (t.brand || t.position || t.id.slice(0, 8)) : 'unknown';
  };

  return (
    <Modal title={`History — ${tyre.position || tyre.brand || 'Tyre'}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
        {tyre.brand || 'Unbranded'} {tyre.size && `· ${tyre.size}`} · Currently at {tyre.position || 'unassigned'}
      </div>
      {sorted.length === 0 ? (
        <div className="empty-state">No service history for this tyre yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
                <span>{humanize(s.service_type)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BillingPill billing={s.billing} amount={s.expense_amount} note={s.internal_note} isPaid={s.is_paid} />
                  <span className="tnum" style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>{DATE_FMT.format(new Date(s.date))}</span>
                </div>
              </div>
              {s.service_type === 'replacement' && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  {s.previous_tyre === tyre.id
                    ? `Replaced by ${tyreLabel(s.tyre)}${s.removal_reason ? ` — ${humanize(s.removal_reason)}` : ''}`
                    : `Replaced ${tyreLabel(s.previous_tyre)}${s.removal_reason ? ` — ${humanize(s.removal_reason)}` : ''}`}
                  {s.removal_odometer && <span> · outgoing odometer {Number(s.removal_odometer).toLocaleString('en-IN')}</span>}
                  {s.removal_tread_depth_in && <span> · outgoing tread {s.removal_tread_depth_in}"</span>}
                </div>
              )}
              {s.tyre_source === 'new_purchase' && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>
                    Tyre bought from {vendorName(s.tyre_vendor) || `${s.tyre_unlisted_vendor_name} (not in system)`}
                  </span>
                  <BillingPill billing="paid" amount={s.tyre_expense_amount} note="" isPaid={s.is_tyre_paid} />
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {s.odometer && <span>Odometer: {Number(s.odometer).toLocaleString('en-IN')}</span>}
                {s.tread_depth_in && <span>Tread: {s.tread_depth_in}"</span>}
                {s.new_position && <span>Moved to: {s.new_position}</span>}
                {vendorName(s.vendor) && <span>Vendor: {vendorName(s.vendor)}</span>}
                {!s.vendor && s.unlisted_vendor_name && <span>Vendor: {s.unlisted_vendor_name} (not in system)</span>}
                {s.service_person_name && (
                  <span>By: {s.service_person_name}{s.service_person_mobile && ` (${s.service_person_mobile})`}</span>
                )}
              </div>
              {s.billing === 'done_internally' && s.internal_note && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Internal: {s.internal_note}</div>
              )}
              {s.notes && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{s.notes}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
