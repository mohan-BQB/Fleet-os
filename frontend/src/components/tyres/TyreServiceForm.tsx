import { useMemo, useState, type FormEvent } from 'react';
import Modal from '../Modal';
import { createTyreService } from '../../api/tyres';
import { markExpensePaid } from '../../api/economics';
import { ApiError } from '../../api/client';
import {
  LOGGABLE_SERVICE_TYPES, SERVICE_BILLING_OPTIONS, SERVICE_PERFORMER_OPTIONS, VENDOR_PAYMENT_MODES,
  type Tyre, type TyreServiceInput, type Vehicle, type Vendor,
} from '../../api/types';
import { generatePositions, humanize } from './utils';

const SERVICE_PERFORMER_LABELS: Record<(typeof SERVICE_PERFORMER_OPTIONS)[number], string> = {
  internal: 'Our own team',
  external: 'Outside person / vendor',
};

// tyre_source/tyre_vendor/tyre_unlisted_vendor_name only ever apply to a
// replacement, which this generic "Log service" form never creates
// (see LOGGABLE_SERVICE_TYPES) - only ReplaceTyreModal does, via its own
// dedicated state for the tyre's own payment.
const BLANK_SERVICE: TyreServiceInput = {
  vehicle: '', tyre: null, service_type: 'alignment', date: new Date().toISOString().slice(0, 10),
  odometer: null, tread_depth_in: null, new_position: '', vendor: null, unlisted_vendor_name: '',
  performed_by: '', service_person_name: '', service_person_mobile: '', notes: '',
  billing: '', internal_note: '', expense: null, amount: undefined,
  tyre_source: '', tyre_vendor: null, tyre_unlisted_vendor_name: '', tyre_amount: undefined,
};

const BULK_SERVICE_TYPES = new Set(['rotation', 'balancing']);
// The tyre is already off or accessible during these - the natural,
// no-extra-effort moment to catch uneven wear before it becomes a blowout.
const TREAD_CHECK_TYPES = new Set(['rotation', 'balancing', 'inspection']);

export function TyreServiceForm({
  vehicle, tyres, vendors, onClose, onSaved,
}: { vehicle: Vehicle; tyres: Tyre[]; vendors: Vendor[]; onClose: () => void; onSaved: () => void }) {
  const tyreVendors = vendors.filter(
    (v) => (v.vendor_type === 'tyre_shop' || v.vendor_type === 'parts_supplier') && v.status === 'active',
  );
  const [form, setForm] = useState<TyreServiceInput>({ ...BLANK_SERVICE, vehicle: vehicle.id });
  // Whether the vendor bill has actually been settled, and how - a sub-
  // choice of billing === 'paid', not a TyreService field itself. Kept out
  // of `form` because it never gets sent with the create; it drives a
  // follow-up mark_paid call on the Expense the create returns instead.
  const [paymentStatus, setPaymentStatus] = useState<'' | 'settled' | 'pending'>('');
  const [paymentMode, setPaymentMode] = useState('');
  // A vendor not in the Vendor master has no payable ledger to post to or
  // to owe money against - so this path is inherently "already settled",
  // no paymentStatus/mode step, and mutually exclusive with form.vendor.
  const [useUnlistedVendor, setUseUnlistedVendor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setBilling(value: TyreServiceInput['billing']) {
    set('billing', value);
    if (value !== 'paid') { setPaymentStatus(''); setPaymentMode(''); }
  }

  function setPerformedBy(value: TyreServiceInput['performed_by']) {
    setForm((f) => ({
      ...f,
      performed_by: value,
      // An outside person's work must be billed and paid - never left as
      // "done internally" (see TyreServiceSerializer.validate()).
      billing: value === 'external' && f.billing !== 'paid' ? 'paid' : f.billing,
    }));
  }

  function toggleUnlistedVendor(value: boolean) {
    setUseUnlistedVendor(value);
    if (value) {
      set('vendor', null);
      setPaymentStatus(''); setPaymentMode('');
    } else {
      set('unlisted_vendor_name', '');
    }
  }

  const positionOptions = useMemo(
    () => generatePositions(vehicle.number_of_tyres, vehicle.spare_tyres),
    [vehicle.number_of_tyres, vehicle.spare_tyres],
  );

  // Rotation/balancing service a full set of tyres in one visit, not just
  // one - so those two types switch the form into a bulk mode covering
  // every currently-fitted tyre at once.
  const isBulk = BULK_SERVICE_TYPES.has(form.service_type);
  const fittedTyres = useMemo(() => tyres.filter((t) => t.status === 'fitted'), [tyres]);
  const [bulkPositions, setBulkPositions] = useState<Record<string, string>>(
    () => Object.fromEntries(fittedTyres.map((t) => [t.id, t.position])),
  );

  function set<K extends keyof TyreServiceInput>(key: K, value: TyreServiceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setServiceType(type: string) {
    set('service_type', type);
    if (BULK_SERVICE_TYPES.has(type)) {
      setBulkPositions(Object.fromEntries(fittedTyres.map((t) => [t.id, t.position])));
    }
  }

  const billingReady = !form.performed_by ? false : form.billing === 'paid'
    ? (useUnlistedVendor ? !!form.unlisted_vendor_name : !!form.vendor)
      && !!form.amount && !!paymentStatus && (paymentStatus === 'pending' || !!paymentMode)
    : form.billing === 'done_internally'
      ? form.performed_by !== 'external' && !!form.internal_note
      : false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.performed_by) {
      setError('Say who actually did the work - your own team, or an outside person.');
      return;
    }
    if (!form.billing) {
      setError('Say whether this is a vendor job or done internally.');
      return;
    }
    if (form.performed_by === 'external' && form.billing !== 'paid') {
      setError("Work done by an outside person has to be billed and paid - it can't be logged as done internally.");
      return;
    }
    if (form.billing === 'paid' && useUnlistedVendor && (!form.unlisted_vendor_name || !form.amount)) {
      setError("Note the vendor's name and enter what this service cost.");
      return;
    }
    if (form.billing === 'paid' && !useUnlistedVendor && (!form.vendor || !form.amount)) {
      setError('Select the vendor and enter what this service cost.');
      return;
    }
    if (form.billing === 'paid' && !paymentStatus) {
      setError("Say whether it's already been paid.");
      return;
    }
    if (form.billing === 'paid' && paymentStatus === 'settled' && !paymentMode) {
      setError('Select how it was paid.');
      return;
    }
    if (form.billing === 'done_internally' && !form.internal_note) {
      setError("Note who did this, so it's clear it wasn't just left unbilled.");
      return;
    }
    if (isBulk && form.service_type === 'rotation') {
      const targets = Object.values(bulkPositions).filter(Boolean);
      const duplicates = targets.filter((p, i) => targets.indexOf(p) !== i);
      if (duplicates.length > 0) {
        setError(`More than one tyre is set to move to "${duplicates[0]}" - each position can only hold one tyre.`);
        return;
      }
    }

    setSaving(true);
    try {
      let expenseToSettle: string | null = null;
      if (isBulk) {
        // One visit, several tyres - bill it once: the first row creates the
        // linked Expense, the rest point at that same expense instead of
        // each creating their own (see TyreServiceSerializer's writable
        // `expense` field).
        const [first, ...rest] = fittedTyres;
        const buildPayload = (t: Tyre) => ({
          vehicle: vehicle.id, tyre: t.id, service_type: form.service_type, date: form.date,
          odometer: form.odometer, tread_depth_in: form.tread_depth_in,
          new_position: form.service_type === 'rotation' ? bulkPositions[t.id] : '',
          vendor: form.vendor, unlisted_vendor_name: form.unlisted_vendor_name, performed_by: form.performed_by,
          service_person_name: form.service_person_name, service_person_mobile: form.service_person_mobile,
          notes: form.notes,
          billing: form.billing, internal_note: form.internal_note,
          // Rotation/balancing are never replacements - no tyre to source.
          tyre_source: '' as const, tyre_vendor: null, tyre_unlisted_vendor_name: '',
        });
        const firstSaved = await createTyreService({ ...buildPayload(first), amount: form.amount, expense: null });
        expenseToSettle = firstSaved.expense;
        await Promise.all(rest.map((t) => createTyreService({
          ...buildPayload(t), expense: form.billing === 'paid' ? firstSaved.expense : null,
        })));
      } else {
        const saved = await createTyreService(form);
        expenseToSettle = saved.expense;
      }
      // A vendor job marked "already paid" gets settled right here, through
      // the same mark_paid action Economics uses - one step instead of
      // logging the service now and remembering to go mark it paid later.
      // Works for an unlisted vendor too - mark_paid settles it directly on
      // the Expense itself when there's no vendor ledger to post against.
      if (form.billing === 'paid' && paymentStatus === 'settled' && expenseToSettle) {
        await markExpensePaid(expenseToSettle, paymentMode);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save service record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log tyre service" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h4>What happened</h4>
          <div className="form-grid">
          <div className="field">
            <label htmlFor="service_type">Type</label>
            <select id="service_type" value={form.service_type} onChange={(e) => setServiceType(e.target.value)}>
              {LOGGABLE_SERVICE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>

          {!isBulk && (
            <>
              <div className="field">
                <label htmlFor="tyre">Specific tyre (optional)</label>
                <select id="tyre" value={form.tyre ?? ''} onChange={(e) => set('tyre', e.target.value || null)}>
                  <option value="">Whole vehicle (e.g. alignment)</option>
                  {tyres.map((t) => <option key={t.id} value={t.id}>{t.position || t.brand || t.id.slice(0, 8)}</option>)}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="new_position">
                  {form.tyre
                    ? `Rotated to position (currently: ${tyres.find((t) => t.id === form.tyre)?.position || 'unassigned'})`
                    : 'Rotated to position (select a specific tyre above first)'}
                </label>
                <select id="new_position" disabled={!form.tyre}
                  value={form.new_position} onChange={(e) => set('new_position', e.target.value)}>
                  <option value="">No position change</option>
                  {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" step="0.1" value={form.odometer ?? ''} onChange={(e) => set('odometer', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="tread_depth_in">Tread depth (in)</label>
            <input id="tread_depth_in" type="number" step="0.01" value={form.tread_depth_in ?? ''}
              onChange={(e) => set('tread_depth_in', e.target.value || null)} />
          </div>

          {TREAD_CHECK_TYPES.has(form.service_type) && !form.tread_depth_in && (
            <div className="field span-2" style={{
              background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8,
              padding: '8px 10px', fontSize: 12,
            }}>
              The tyre{isBulk ? 's are' : ' is'} already accessible for {humanize(form.service_type).toLowerCase()} —
              worth recording a tread depth reading now while you're at it.
            </div>
          )}

          {isBulk && (
            <div className="field span-2">
              <label>
                {form.service_type === 'rotation'
                  ? `All ${fittedTyres.length} fitted tyres - set each one's new position`
                  : `All ${fittedTyres.length} fitted tyres will be logged as balanced`}
              </label>
              {fittedTyres.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>No fitted tyres tracked for this vehicle yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fittedTyres.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12.5, minWidth: 130, flex: 1 }}>
                        <strong>{t.position || 'Unassigned'}</strong>
                        <span style={{ color: 'var(--ink-soft)' }}> · {t.brand || 'Unbranded'}</span>
                      </div>
                      {form.service_type === 'rotation' && (
                        <select value={bulkPositions[t.id] ?? t.position}
                          onChange={(e) => setBulkPositions((p) => ({ ...p, [t.id]: e.target.value }))}
                          style={{ flex: 1 }}>
                          {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        <div className="form-section">
          <h4>Who &amp; billing</h4>
          <div className="form-grid">
          <div className="field span-2">
            <label>Who performed this service?</label>
            <div className="chip-group">
              {SERVICE_PERFORMER_OPTIONS.map((p) => (
                <span key={p} className={`chip${form.performed_by === p ? ' on' : ''}`} onClick={() => setPerformedBy(p)}>
                  {SERVICE_PERFORMER_LABELS[p]}
                </span>
              ))}
            </div>
          </div>
          <div className="field span-2">
            <label>Billing</label>
            <div className="chip-group">
              {SERVICE_BILLING_OPTIONS
                // An outside person is always paid - "done internally" isn't
                // an option once that's the declared performer (mirrors the
                // backend rejecting billing=done_internally for
                // performed_by=external).
                .filter((b) => form.performed_by !== 'external' || b === 'paid')
                .map((b) => (
                  <span key={b} className={`chip${form.billing === b ? ' on' : ''}`} onClick={() => setBilling(b)}>
                    {b === 'paid' ? 'Vendor' : 'Done internally'}
                  </span>
                ))}
            </div>
          </div>
          {form.billing === 'paid' && (
            <>
              <div className="field">
                <label htmlFor="vendor">{useUnlistedVendor ? 'Vendor (not in system)' : 'Vendor'}</label>
                {useUnlistedVendor ? (
                  <input id="vendor" required placeholder="e.g. Roadside Tyre Shop"
                    value={form.unlisted_vendor_name} onChange={(e) => set('unlisted_vendor_name', e.target.value)} />
                ) : (
                  <select id="vendor" required value={form.vendor ?? ''} onChange={(e) => set('vendor', e.target.value || null)}>
                    <option value="" disabled>Select…</option>
                    {tyreVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
                  onClick={() => toggleUnlistedVendor(!useUnlistedVendor)}>
                  {useUnlistedVendor ? 'Pick from vendor list instead' : 'Vendor not in the system?'}
                </button>
              </div>
              <div className="field">
                <label htmlFor="amount">{isBulk ? 'Total cost for this visit (₹)' : 'Cost (₹)'}</label>
                <input id="amount" type="number" step="0.01" required value={form.amount ?? ''}
                  onChange={(e) => set('amount', e.target.value || undefined)} />
              </div>
              {useUnlistedVendor && (
                <div className="field span-2" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  Vendors not in the system don't get a running payable ledger - but this specific bill still needs
                  its own paid/pending status below, so it can't get stuck unpaid with no way to settle it.
                </div>
              )}
              <div className="field span-2">
                <label>Has it been paid?</label>
                <div className="chip-group">
                  <span className={`chip${paymentStatus === 'settled' ? ' on' : ''}`} onClick={() => setPaymentStatus('settled')}>
                    Paid already
                  </span>
                  <span className={`chip${paymentStatus === 'pending' ? ' on' : ''}`} onClick={() => { setPaymentStatus('pending'); setPaymentMode(''); }}>
                    Not yet — pay later
                  </span>
                </div>
              </div>
              {paymentStatus === 'settled' && (
                <div className="field span-2">
                  <label htmlFor="payment_mode">Payment mode</label>
                  <select id="payment_mode" required value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="" disabled>Select…</option>
                    {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          {form.billing === 'done_internally' && (
            <div className="field span-2">
              <label htmlFor="internal_note">Done by / notes (required)</label>
              <input id="internal_note" required placeholder="e.g. Done by in-house mechanic Raju"
                value={form.internal_note} onChange={(e) => set('internal_note', e.target.value)} />
            </div>
          )}
          {form.performed_by && (
            <>
              <div className="field">
                <label htmlFor="service_person_name">
                  {form.performed_by === 'external' ? "Technician's name (optional)" : 'Which staff member? (optional)'}
                </label>
                <input id="service_person_name" placeholder="Name"
                  value={form.service_person_name} onChange={(e) => set('service_person_name', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="service_person_mobile">Their mobile (optional)</label>
                <input id="service_person_mobile" placeholder="For follow-up if a problem resurfaces"
                  value={form.service_person_mobile} onChange={(e) => set('service_person_mobile', e.target.value)} />
              </div>
            </>
          )}
          <div className="field span-2">
            <label htmlFor="notes">Notes</label>
            <input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !billingReady || (isBulk && fittedTyres.length === 0)}>
            {saving ? 'Saving…' : isBulk ? `Log for ${fittedTyres.length} tyres` : 'Log service'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
