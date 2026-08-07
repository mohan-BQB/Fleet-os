import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { replaceTyre } from '../api/tyres';
import { markExpensePaid } from '../api/economics';
import { ApiError } from '../api/client';
import {
  SERVICE_BILLING_OPTIONS, SERVICE_PERFORMER_OPTIONS, TYRE_REMOVAL_REASONS, VENDOR_PAYMENT_MODES,
  type Tyre, type Vehicle, type Vendor,
} from '../api/types';

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const SERVICE_PERFORMER_LABELS: Record<(typeof SERVICE_PERFORMER_OPTIONS)[number], string> = {
  internal: 'Our own team',
  external: 'Outside person / vendor',
};

interface Props {
  vehicle: Vehicle;
  tyre: Tyre;
  spares: Tyre[];
  vendors: Vendor[];
  onClose: () => void;
  onSaved: () => void;
}

// The one door for swapping a physical tyre - see tyres.views.replace_tyre
// on the backend. Everything here is required with no default: what
// happens to the outgoing tyre (retired vs spare stock), why it's coming
// off, and how the incoming one is billed - so a "replacement" can never
// end up half-recorded (old tyre retired with no new one logged, or a new
// tyre added with the old one left silently fitted).
export default function ReplaceTyreModal({ vehicle, tyre, spares, vendors, onClose, onSaved }: Props) {
  const tyreVendors = vendors.filter(
    (v) => (v.vendor_type === 'tyre_shop' || v.vendor_type === 'parts_supplier') && v.status === 'active',
  );

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [removalReason, setRemovalReason] = useState('');
  const [removalOdometer, setRemovalOdometer] = useState<string | null>(null);
  const [removalTread, setRemovalTread] = useState<string | null>(null);
  const [disposition, setDisposition] = useState<'' | 'retired' | 'spare'>('');

  const [source, setSource] = useState<'' | 'new' | 'promote'>(spares.length === 0 ? 'new' : '');
  const [promoteId, setPromoteId] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newPurchaseDate, setNewPurchaseDate] = useState<string | null>(null);
  const [newOdometer, setNewOdometer] = useState<string | null>(vehicle.current_meter);
  const [newTread, setNewTread] = useState<string | null>(null);

  const [billing, setBillingRaw] = useState<'' | 'paid' | 'done_internally'>('');
  const [performedBy, setPerformedByRaw] = useState<'' | 'internal' | 'external'>('');
  const [vendor, setVendor] = useState<string | null>(null);
  // A vendor not in the Vendor master has no payable ledger to post to or
  // to owe money against - so this path is inherently "already settled",
  // no paymentStatus/mode step, and mutually exclusive with `vendor`.
  const [useUnlistedVendor, setUseUnlistedVendor] = useState(false);
  const [unlistedVendorName, setUnlistedVendorName] = useState('');
  const [servicePersonName, setServicePersonName] = useState('');
  const [servicePersonMobile, setServicePersonMobile] = useState('');
  const [amount, setAmount] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'' | 'settled' | 'pending'>('');
  const [paymentMode, setPaymentMode] = useState('');
  const [notes, setNotes] = useState('');

  // The new tyre's own payment - only relevant when source='new', entirely
  // independent of vendor/billing/amount above (the fitting/labour charge).
  // Buying the tyre and paying whoever fitted it are two separate
  // obligations, even when it's the same shop.
  const [tyreVendor, setTyreVendor] = useState<string | null>(null);
  const [useUnlistedTyreVendor, setUseUnlistedTyreVendor] = useState(false);
  const [unlistedTyreVendorName, setUnlistedTyreVendorName] = useState('');
  const [tyreAmount, setTyreAmount] = useState<string | null>(null);
  const [tyrePaymentStatus, setTyrePaymentStatus] = useState<'' | 'settled' | 'pending'>('');
  const [tyrePaymentMode, setTyrePaymentMode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setBilling(value: '' | 'paid' | 'done_internally') {
    setBillingRaw(value);
    if (value !== 'paid') { setPaymentStatus(''); setPaymentMode(''); }
  }

  function setPerformedBy(value: '' | 'internal' | 'external') {
    setPerformedByRaw(value);
    // An outside person's work must be billed and paid - never left as
    // "done internally" (see TyreServiceSerializer.validate()).
    if (value === 'external' && billing !== 'paid') setBilling('paid');
  }

  function toggleUnlistedVendor(value: boolean) {
    setUseUnlistedVendor(value);
    if (value) {
      setVendor(null);
      setPaymentStatus(''); setPaymentMode('');
    } else {
      setUnlistedVendorName('');
    }
  }

  function toggleUnlistedTyreVendor(value: boolean) {
    setUseUnlistedTyreVendor(value);
    if (value) {
      setTyreVendor(null);
      setTyrePaymentStatus(''); setTyrePaymentMode('');
    } else {
      setUnlistedTyreVendorName('');
    }
  }

  const sourceReady = source === 'promote' ? !!promoteId : source === 'new';
  const tyrePaymentReady = source !== 'new' || (
    (useUnlistedTyreVendor ? !!unlistedTyreVendorName : !!tyreVendor)
    && !!tyreAmount && !!tyrePaymentStatus && (tyrePaymentStatus === 'pending' || !!tyrePaymentMode)
  );
  const billingReady = !performedBy ? false : billing === 'paid'
    ? (useUnlistedVendor ? !!unlistedVendorName : !!vendor)
      && !!amount && !!paymentStatus && (paymentStatus === 'pending' || !!paymentMode)
    : billing === 'done_internally'
      ? performedBy !== 'external' && !!internalNote
      : false;
  const ready = !!removalReason && !!disposition && sourceReady && tyrePaymentReady && billingReady;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!removalReason) { setError('Say why the outgoing tyre is being replaced.'); return; }
    if (!disposition) { setError("Say what happens to the outgoing tyre - retired, or moved to spare stock."); return; }
    if (!sourceReady) { setError(source === 'promote' ? 'Select which spare to fit.' : 'Say where the incoming tyre is coming from.'); return; }
    if (source === 'new' && (useUnlistedTyreVendor ? !unlistedTyreVendorName : !tyreVendor)) {
      setError('Select who the new tyre was bought from.'); return;
    }
    if (source === 'new' && !tyreAmount) { setError('Enter what the new tyre cost.'); return; }
    if (source === 'new' && !tyrePaymentStatus) { setError('Say whether the tyre has already been paid for.'); return; }
    if (source === 'new' && tyrePaymentStatus === 'settled' && !tyrePaymentMode) { setError('Select how the tyre was paid for.'); return; }
    if (!performedBy) { setError('Say who actually did the work - your own team, or an outside person.'); return; }
    if (!billing) { setError('Say whether this was paid for or done internally.'); return; }
    if (performedBy === 'external' && billing !== 'paid') {
      setError("Work done by an outside person has to be billed and paid - it can't be logged as done internally."); return;
    }
    if (billing === 'paid' && useUnlistedVendor && (!unlistedVendorName || !amount)) {
      setError("Note the vendor's name and enter what the replacement cost."); return;
    }
    if (billing === 'paid' && !useUnlistedVendor && (!vendor || !amount)) { setError('Select the vendor and enter what the replacement cost.'); return; }
    if (billing === 'paid' && !paymentStatus) { setError("Say whether it's already been paid."); return; }
    if (billing === 'paid' && paymentStatus === 'settled' && !paymentMode) { setError('Select how it was paid.'); return; }
    if (billing === 'done_internally' && !internalNote) { setError("Note who did this, so it's clear it wasn't just left unbilled."); return; }

    setSaving(true);
    try {
      const result = await replaceTyre({
        previous_tyre: tyre.id, disposition, removal_reason: removalReason,
        removal_odometer: removalOdometer, removal_tread_depth_in: removalTread,
        date, odometer: newOdometer, tread_depth_in: newTread,
        promote_tyre: source === 'promote' ? promoteId : null,
        new_brand: newBrand, new_size: newSize, new_serial_number: newSerial,
        new_purchase_date: newPurchaseDate, new_purchase_price: source === 'new' ? tyreAmount : null,
        vendor, unlisted_vendor_name: unlistedVendorName, performed_by: performedBy,
        service_person_name: servicePersonName, service_person_mobile: servicePersonMobile,
        notes, billing,
        internal_note: internalNote, amount: amount ?? undefined,
        tyre_vendor: source === 'new' ? tyreVendor : null,
        tyre_unlisted_vendor_name: source === 'new' ? unlistedTyreVendorName : '',
        tyre_amount: source === 'new' ? (tyreAmount ?? undefined) : undefined,
      });
      // Works for an unlisted vendor too - mark_paid settles it directly on
      // the Expense itself when there's no vendor ledger to post against.
      if (billing === 'paid' && paymentStatus === 'settled' && result.service.expense) {
        await markExpensePaid(result.service.expense, paymentMode);
      }
      // The new tyre's own payment settles independently of the fitting one above.
      if (source === 'new' && tyrePaymentStatus === 'settled' && result.service.tyre_expense) {
        await markExpensePaid(result.service.tyre_expense, tyrePaymentMode);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the replacement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Replace tyre — ${tyre.position || tyre.brand || 'unassigned'}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rt_date">Date</label>
            <input id="rt_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rt_reason">Why is it coming off?</label>
            <select id="rt_reason" required value={removalReason} onChange={(e) => setRemovalReason(e.target.value)}>
              <option value="" disabled>Select…</option>
              {TYRE_REMOVAL_REASONS.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rt_removal_odo">Outgoing tyre's final odometer</label>
            <input id="rt_removal_odo" type="number" step="0.1" value={removalOdometer ?? ''}
              onChange={(e) => setRemovalOdometer(e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="rt_removal_tread">Outgoing tyre's final tread depth (in)</label>
            <input id="rt_removal_tread" type="number" step="0.01" value={removalTread ?? ''}
              onChange={(e) => setRemovalTread(e.target.value || null)} />
          </div>

          <div className="field span-2">
            <label>What happens to the outgoing tyre?</label>
            <div className="chip-group">
              <span className={`chip${disposition === 'retired' ? ' on' : ''}`} onClick={() => setDisposition('retired')}>
                Retire (scrap / not reusable)
              </span>
              <span className={`chip${disposition === 'spare' ? ' on' : ''}`} onClick={() => setDisposition('spare')}>
                Move to spare stock
              </span>
            </div>
          </div>

          <div className="field span-2">
            <label>Incoming tyre</label>
            <div className="chip-group">
              <span className={`chip${source === 'new' ? ' on' : ''}`} onClick={() => setSource('new')}>
                Brand new tyre
              </span>
              {spares.length > 0 && (
                <span className={`chip${source === 'promote' ? ' on' : ''}`} onClick={() => setSource('promote')}>
                  Use an existing spare
                </span>
              )}
            </div>
          </div>

          {source === 'promote' && (
            <div className="field span-2">
              <label htmlFor="rt_promote">Which spare?</label>
              <select id="rt_promote" required value={promoteId} onChange={(e) => setPromoteId(e.target.value)}>
                <option value="" disabled>Select…</option>
                {spares.map((s) => (
                  <option key={s.id} value={s.id}>{s.position} — {s.brand || 'Unbranded'} {s.size && `(${s.size})`}</option>
                ))}
              </select>
            </div>
          )}

          {source === 'new' && (
            <>
              <div className="field">
                <label htmlFor="rt_brand">Brand</label>
                <input id="rt_brand" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rt_size">Size</label>
                <input id="rt_size" placeholder="e.g. 295/80 R22.5" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rt_serial">Serial number</label>
                <input id="rt_serial" value={newSerial} onChange={(e) => setNewSerial(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rt_purchase_date">Purchase date</label>
                <input id="rt_purchase_date" type="date" value={newPurchaseDate ?? ''}
                  onChange={(e) => setNewPurchaseDate(e.target.value || null)} />
              </div>

              <div className="field span-2" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                The tyre's own cost, paid to whoever sold it - independent of the fitting/labour charge below,
                even if it happens to be the same shop.
              </div>
              <div className="field">
                <label htmlFor="rt_tyre_vendor">
                  {useUnlistedTyreVendor ? 'Bought from (not in system)' : 'Bought from'}
                </label>
                {useUnlistedTyreVendor ? (
                  <input id="rt_tyre_vendor" required placeholder="e.g. Roadside Tyre Shop"
                    value={unlistedTyreVendorName} onChange={(e) => setUnlistedTyreVendorName(e.target.value)} />
                ) : (
                  <select id="rt_tyre_vendor" required value={tyreVendor ?? ''} onChange={(e) => setTyreVendor(e.target.value || null)}>
                    <option value="" disabled>Select…</option>
                    {tyreVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
                  onClick={() => toggleUnlistedTyreVendor(!useUnlistedTyreVendor)}>
                  {useUnlistedTyreVendor ? 'Pick from vendor list instead' : 'Vendor not in the system?'}
                </button>
              </div>
              <div className="field">
                <label htmlFor="rt_tyre_amount">Tyre cost (₹)</label>
                <input id="rt_tyre_amount" type="number" step="0.01" required value={tyreAmount ?? ''}
                  onChange={(e) => setTyreAmount(e.target.value || null)} />
              </div>
              <div className="field span-2">
                <label>Has the tyre been paid for?</label>
                <div className="chip-group">
                  <span className={`chip${tyrePaymentStatus === 'settled' ? ' on' : ''}`} onClick={() => setTyrePaymentStatus('settled')}>
                    Paid already
                  </span>
                  <span className={`chip${tyrePaymentStatus === 'pending' ? ' on' : ''}`} onClick={() => { setTyrePaymentStatus('pending'); setTyrePaymentMode(''); }}>
                    Not yet — pay later
                  </span>
                </div>
              </div>
              {tyrePaymentStatus === 'settled' && (
                <div className="field span-2">
                  <label htmlFor="rt_tyre_payment_mode">Payment mode</label>
                  <select id="rt_tyre_payment_mode" required value={tyrePaymentMode} onChange={(e) => setTyrePaymentMode(e.target.value)}>
                    <option value="" disabled>Select…</option>
                    {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="field">
            <label htmlFor="rt_new_odo">Odometer at fitting</label>
            <input id="rt_new_odo" type="number" step="0.1" value={newOdometer ?? ''}
              onChange={(e) => setNewOdometer(e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="rt_new_tread">Tread depth at fitting (in)</label>
            <input id="rt_new_tread" type="number" step="0.01" value={newTread ?? ''}
              onChange={(e) => setNewTread(e.target.value || null)} />
          </div>

          <div className="field span-2">
            <label>Who performed this service?</label>
            <div className="chip-group">
              {SERVICE_PERFORMER_OPTIONS.map((p) => (
                <span key={p} className={`chip${performedBy === p ? ' on' : ''}`} onClick={() => setPerformedBy(p)}>
                  {SERVICE_PERFORMER_LABELS[p]}
                </span>
              ))}
            </div>
          </div>
          <div className="field span-2">
            <label>Billing (fitting / labour)</label>
            <div className="chip-group">
              {SERVICE_BILLING_OPTIONS
                .filter((b) => performedBy !== 'external' || b === 'paid')
                .map((b) => (
                  <span key={b} className={`chip${billing === b ? ' on' : ''}`} onClick={() => setBilling(b)}>
                    {b === 'paid' ? 'Vendor' : 'Done internally'}
                  </span>
                ))}
            </div>
          </div>
          {billing === 'paid' && (
            <>
              <div className="field">
                <label htmlFor="rt_vendor">{useUnlistedVendor ? 'Vendor (not in system)' : 'Vendor'}</label>
                {useUnlistedVendor ? (
                  <input id="rt_vendor" required placeholder="e.g. Roadside Tyre Shop"
                    value={unlistedVendorName} onChange={(e) => setUnlistedVendorName(e.target.value)} />
                ) : (
                  <select id="rt_vendor" required value={vendor ?? ''} onChange={(e) => setVendor(e.target.value || null)}>
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
                <label htmlFor="rt_amount">Fitting / labour cost (₹)</label>
                <input id="rt_amount" type="number" step="0.01" required value={amount ?? ''}
                  onChange={(e) => setAmount(e.target.value || null)} />
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
                  <label htmlFor="rt_payment_mode">Payment mode</label>
                  <select id="rt_payment_mode" required value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="" disabled>Select…</option>
                    {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          {billing === 'done_internally' && (
            <div className="field span-2">
              <label htmlFor="rt_internal_note">Done by / notes (required)</label>
              <input id="rt_internal_note" required placeholder="e.g. Fitted from spare stock by driver"
                value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
            </div>
          )}
          {performedBy && (
            <>
              <div className="field">
                <label htmlFor="rt_service_person_name">
                  {performedBy === 'external' ? "Technician's name (optional)" : 'Which staff member? (optional)'}
                </label>
                <input id="rt_service_person_name" placeholder="Name"
                  value={servicePersonName} onChange={(e) => setServicePersonName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rt_service_person_mobile">Their mobile (optional)</label>
                <input id="rt_service_person_mobile" placeholder="For follow-up if a problem resurfaces"
                  value={servicePersonMobile} onChange={(e) => setServicePersonMobile(e.target.value)} />
              </div>
            </>
          )}

          <div className="field span-2">
            <label htmlFor="rt_notes">Notes</label>
            <input id="rt_notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !ready}>
            {saving ? 'Saving…' : 'Replace tyre'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
