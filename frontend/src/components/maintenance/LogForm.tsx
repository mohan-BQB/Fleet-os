import { useState, type FormEvent } from 'react';
import Modal from '../Modal';
import { createMaintenanceLog, type MaintenanceLogFiles } from '../../api/maintenance';
import { markExpensePaid } from '../../api/economics';
import { ApiError } from '../../api/client';
import {
  MAINTENANCE_WORK_TYPES, PART_DISPOSAL_PLANS, PART_SOURCES, SERVICE_BILLING_OPTIONS, SERVICE_PERFORMER_OPTIONS,
  VENDOR_PAYMENT_MODES,
  type MaintenanceLogInput, type MaintenanceSchedule, type PartInventoryItem, type Vehicle, type Vendor,
} from '../../api/types';
import { humanize } from './utils';

const PART_SOURCE_LABELS: Record<(typeof PART_SOURCES)[number], string> = {
  new_purchase: 'Bought new for this job',
  from_inventory: 'Used from spare / inventory',
};

const SERVICE_PERFORMER_LABELS: Record<(typeof SERVICE_PERFORMER_OPTIONS)[number], string> = {
  internal: 'Our own team',
  external: 'Outside person / vendor',
};

const BLANK_LOG: MaintenanceLogInput = {
  vehicle: '', schedule: null, part_name: '', date: new Date().toISOString().slice(0, 10), odometer: null, vendor: null,
  unlisted_vendor_name: '', performed_by: '', service_person_name: '', service_person_mobile: '', notes: '',
  billing: '', internal_note: '', amount: undefined,
  work_type: '', old_part_number: '', disposal_plan: '',
  part_source: '', inventory_item: null, part_quantity: null,
  part_vendor: null, part_unlisted_vendor_name: '', part_amount: undefined,
};

export function LogForm({
  vehicle, schedules, vendors, inventoryItems, bare, onClose, onSaved,
}: {
  vehicle: Vehicle; schedules: MaintenanceSchedule[]; vendors: Vendor[]; inventoryItems: PartInventoryItem[];
  // Skips this component's own Modal wrapper and returns just the <form> -
  // for Expense.tsx's Add expense -> Maintenance shortcut, which already
  // owns a Modal shared with the vehicle-picker step and the other two
  // expense-entry kinds.
  bare?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const garages = vendors.filter((v) => v.vendor_type === 'garage' && v.status === 'active');
  const stockItems = inventoryItems.filter((i) => i.status === 'active');
  const isHours = vehicle.metering_unit === 'hours';
  const [form, setForm] = useState<MaintenanceLogInput>({ ...BLANK_LOG, vehicle: vehicle.id, odometer: vehicle.current_meter });
  // Whether the vendor bill has actually been settled, and how - a sub-
  // choice of billing === 'paid', not a MaintenanceLog field itself. Kept
  // out of `form` because it never gets sent with the create; it drives a
  // follow-up mark_paid call on the Expense the create returns instead.
  const [paymentStatus, setPaymentStatus] = useState<'' | 'settled' | 'pending'>('');
  const [paymentMode, setPaymentMode] = useState('');
  // A vendor not in the Vendor master has no payable ledger to post to or
  // to owe money against - so this path is inherently "already settled",
  // no paymentStatus/mode step, and mutually exclusive with form.vendor.
  const [useUnlistedVendor, setUseUnlistedVendor] = useState(false);
  // Same trio, but for the part's own payment (form.part_vendor/
  // part_unlisted_vendor_name/part_amount) - entirely independent of the
  // labour payment above, so it gets its own paid/pending step and its own
  // mark_paid call after save.
  const [partPaymentStatus, setPartPaymentStatus] = useState<'' | 'settled' | 'pending'>('');
  const [partPaymentMode, setPartPaymentMode] = useState('');
  const [useUnlistedPartVendor, setUseUnlistedPartVendor] = useState(false);
  const [oldPartPhoto, setOldPartPhoto] = useState<File | null>(null);
  // Explicit "yes, I saw the matching schedule below and this isn't it" -
  // reset any time part_name or the schedule link changes, so it can't
  // silently carry over and suppress the check on a different part.
  const [confirmNoSchedule, setConfirmNoSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MaintenanceLogInput>(key: K, value: MaintenanceLogInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setBilling(value: MaintenanceLogInput['billing']) {
    set('billing', value);
    if (value !== 'paid') { setPaymentStatus(''); setPaymentMode(''); }
  }

  function setPerformedBy(value: MaintenanceLogInput['performed_by']) {
    setForm((f) => ({
      ...f,
      performed_by: value,
      // An outside person's work must be billed and paid - never left as
      // "done internally", which would mean nobody actually got paid for
      // it (see MaintenanceLogSerializer.validate()).
      billing: value === 'external' && f.billing !== 'paid' ? 'paid' : f.billing,
    }));
  }

  function setPartSource(value: MaintenanceLogInput['part_source']) {
    setForm((f) => ({
      ...f,
      part_source: value,
      // Mutually exclusive with each other, same as the backend enforces:
      // a new purchase never draws from inventory, and a stock draw's cost
      // was already recorded at receipt time, not paid for again here.
      inventory_item: value === 'from_inventory' ? f.inventory_item : null,
      part_quantity: value === 'from_inventory' ? f.part_quantity : null,
      part_vendor: value === 'new_purchase' ? f.part_vendor : null,
      part_unlisted_vendor_name: value === 'new_purchase' ? f.part_unlisted_vendor_name : '',
    }));
    if (value !== 'new_purchase') { setPartPaymentStatus(''); setPartPaymentMode(''); }
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

  function toggleUnlistedPartVendor(value: boolean) {
    setUseUnlistedPartVendor(value);
    if (value) {
      set('part_vendor', null);
      setPartPaymentStatus(''); setPartPaymentMode('');
    } else {
      set('part_unlisted_vendor_name', '');
    }
  }

  function selectSchedule(scheduleId: string) {
    const schedule = schedules.find((s) => s.id === scheduleId);
    setForm((f) => ({ ...f, schedule: scheduleId || null, part_name: schedule ? schedule.part_name : f.part_name }));
    setConfirmNoSchedule(false);
  }

  function setPartName(value: string) {
    set('part_name', value);
    setConfirmNoSchedule(false);
  }

  // Mirrors the backend's own auto-match (MaintenanceLogSerializer.validate)
  // so the warning shows up before a round trip, not after a rejected save.
  // Applies for any work_type - a consumable like engine/brake/hydraulic oil
  // is just as interval-tracked as a part, it just never needs a disposal
  // plan or part ID (no physical unit to retire).
  const scheduleMatch = form.work_type && !form.schedule && form.part_name.trim()
    ? schedules.find((s) => s.part_name.trim().toLowerCase() === form.part_name.trim().toLowerCase())
    : undefined;
  const scheduleReady = !scheduleMatch || confirmNoSchedule;

  const billingReady = !form.performed_by ? false : form.billing === 'paid'
    ? (useUnlistedVendor ? !!form.unlisted_vendor_name : !!form.vendor)
      && !!form.amount && !!paymentStatus && (paymentStatus === 'pending' || !!paymentMode)
    : form.billing === 'done_internally'
      ? form.performed_by !== 'external' && !!form.internal_note
      : false;
  const selectedStockItem = form.inventory_item ? stockItems.find((i) => i.id === form.inventory_item) : undefined;
  const stockAvailable = selectedStockItem ? Number(selectedStockItem.quantity_on_hand) : null;
  const requestedQty = form.part_quantity ? Number(form.part_quantity) : null;
  const stockShortfall = stockAvailable != null && requestedQty != null && requestedQty > stockAvailable;

  const partPaymentReady = (useUnlistedPartVendor ? !!form.part_unlisted_vendor_name : !!form.part_vendor)
    && !!form.part_amount && !!partPaymentStatus && (partPaymentStatus === 'pending' || !!partPaymentMode);

  const partSourceReady = form.work_type !== 'part_replacement'
    ? true
    : form.part_source === 'from_inventory'
      ? !!form.inventory_item && !!requestedQty && requestedQty > 0 && !stockShortfall
      : form.part_source === 'new_purchase' && partPaymentReady;

  const partReady = form.work_type === 'part_replacement'
    ? !!form.disposal_plan && (!!form.old_part_number || !!oldPartPhoto) && partSourceReady
    : form.work_type === 'consumable';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.work_type) {
      setError('Say whether a physical part was replaced, or this was a consumable/fluid/labour-only job.');
      return;
    }
    if (form.work_type === 'part_replacement' && !form.disposal_plan) {
      setError("Say what happened to the old part - nothing removed should go unaccounted for.");
      return;
    }
    if (form.work_type === 'part_replacement' && !form.old_part_number && !oldPartPhoto) {
      setError('Identify the old part with a part/serial number, a photo, or both.');
      return;
    }
    if (form.work_type === 'part_replacement' && !form.part_source) {
      setError('Say whether the new part was bought for this job, or used from spare/inventory.');
      return;
    }
    if (form.work_type === 'part_replacement' && form.part_source === 'from_inventory' && !form.inventory_item) {
      setError('Select which stocked part this came from.');
      return;
    }
    if (form.work_type === 'part_replacement' && form.part_source === 'from_inventory' && !requestedQty) {
      setError('Enter how many units were used.');
      return;
    }
    if (form.work_type === 'part_replacement' && form.part_source === 'from_inventory' && stockShortfall) {
      setError(`Only ${stockAvailable} ${selectedStockItem?.unit} of ${selectedStockItem?.name} in stock.`);
      return;
    }
    if (form.part_source === 'new_purchase' && (useUnlistedPartVendor ? !form.part_unlisted_vendor_name : !form.part_vendor)) {
      setError('Select who the part was bought from.');
      return;
    }
    if (form.part_source === 'new_purchase' && !form.part_amount) {
      setError('Enter what the part cost.');
      return;
    }
    if (form.part_source === 'new_purchase' && !partPaymentStatus) {
      setError('Say whether the part has already been paid for.');
      return;
    }
    if (form.part_source === 'new_purchase' && partPaymentStatus === 'settled' && !partPaymentMode) {
      setError('Select how the part was paid for.');
      return;
    }
    if (scheduleMatch && !confirmNoSchedule) {
      setError(`This looks like it matches "${scheduleMatch.part_name}" - link its schedule or confirm this isn't that item.`);
      return;
    }
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
    setSaving(true);
    try {
      const files: MaintenanceLogFiles = { old_part_photo: oldPartPhoto };
      const saved = await createMaintenanceLog({ ...form, confirm_no_schedule: confirmNoSchedule }, files);
      // Works for an unlisted vendor too now - mark_paid settles it
      // directly on the Expense itself when there's no vendor ledger to
      // post against (see economics.views.ExpenseViewSet.mark_paid).
      if (form.billing === 'paid' && paymentStatus === 'settled' && saved.expense) {
        await markExpensePaid(saved.expense, paymentMode);
      }
      // The part's own payment settles independently of the labour one above.
      if (form.part_source === 'new_purchase' && partPaymentStatus === 'settled' && saved.part_expense) {
        await markExpensePaid(saved.part_expense, partPaymentMode);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save log entry.');
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <form onSubmit={handleSubmit}>
        <div className="form-section">
        <h4>What happened</h4>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="schedule">Matches schedule (optional)</label>
            <select id="schedule" value={form.schedule ?? ''} onChange={(e) => selectSchedule(e.target.value)}>
              <option value="">One-off / not on a schedule</option>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.part_name}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="part_name">Part / task</label>
            <input id="part_name" required value={form.part_name} onChange={(e) => setPartName(e.target.value)} />
          </div>
          {scheduleMatch && (
            <div className="field span-2" style={{
              background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8, padding: '8px 10px', fontSize: 12,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <span>
                This looks like it matches the tracked schedule "{scheduleMatch.part_name}" - link it so the
                due date resets, or confirm this isn't that item.
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="link-btn" onClick={() => selectSchedule(scheduleMatch.id)}>
                  Link "{scheduleMatch.part_name}"
                </button>
                <button type="button" className="link-btn" onClick={() => setConfirmNoSchedule(true)}>
                  This isn't that item
                </button>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="odometer">{isHours ? 'Hours' : 'Odometer'}</label>
            <input id="odometer" type="number" step="0.1" value={form.odometer ?? ''}
              onChange={(e) => set('odometer', e.target.value || null)} />
          </div>

          <div className="field span-2">
            <label>What kind of job is this?</label>
            <div className="chip-group">
              {MAINTENANCE_WORK_TYPES.map((w) => (
                <span key={w} className={`chip${form.work_type === w ? ' on' : ''}`} onClick={() => set('work_type', w)}>
                  {w === 'part_replacement' ? 'Part replacement' : 'Consumable / fluid / labour only'}
                </span>
              ))}
            </div>
          </div>
        </div>
        </div>

        {form.work_type === 'part_replacement' && (
          <div className="form-section">
          <h4>Part sourcing</h4>
          <div className="form-grid">
              <div className="field">
                <label htmlFor="old_part_number">Old part / serial number</label>
                <input id="old_part_number" placeholder="e.g. printed on the part or box"
                  value={form.old_part_number} onChange={(e) => set('old_part_number', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="old_part_photo">Photo of old part</label>
                <input id="old_part_photo" type="file" accept="image/*"
                  onChange={(e) => setOldPartPhoto(e.target.files?.[0] ?? null)} />
              </div>
              <div className="field span-2">
                <label htmlFor="disposal_plan">What happened to the old part?</label>
                <select id="disposal_plan" required value={form.disposal_plan}
                  onChange={(e) => set('disposal_plan', e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {PART_DISPOSAL_PLANS.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
                </select>
              </div>
              {!form.old_part_number && !oldPartPhoto && (
                <div className="field span-2" style={{
                  background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8, padding: '8px 10px', fontSize: 12,
                }}>
                  Add a part number, a photo, or both - the old part needs to be identifiable, not just described.
                </div>
              )}

              <div className="field span-2">
                <label>Where did the new part come from?</label>
                <div className="chip-group">
                  {PART_SOURCES.map((s) => (
                    <span key={s} className={`chip${form.part_source === s ? ' on' : ''}`} onClick={() => setPartSource(s)}>
                      {PART_SOURCE_LABELS[s]}
                    </span>
                  ))}
                </div>
              </div>
              {form.part_source === 'from_inventory' && (
                <>
                  <div className="field span-2">
                    <label htmlFor="inventory_item">Stocked part</label>
                    <select id="inventory_item" required value={form.inventory_item ?? ''}
                      onChange={(e) => set('inventory_item', e.target.value || null)}>
                      <option value="" disabled>Select…</option>
                      {stockItems.map((i) => (
                        <option key={i.id} value={i.id} disabled={Number(i.quantity_on_hand) <= 0}>
                          {i.name} — {Number(i.quantity_on_hand).toLocaleString('en-IN')} {i.unit} in stock
                        </option>
                      ))}
                    </select>
                    {stockItems.length === 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                        No parts stocked yet - add one under Parts Inventory first.
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="part_quantity">Quantity used{selectedStockItem ? ` (${selectedStockItem.unit})` : ''}</label>
                    <input id="part_quantity" type="number" step="0.1" min="0.1" required
                      value={form.part_quantity ?? ''} onChange={(e) => set('part_quantity', e.target.value || null)} />
                  </div>
                  {stockShortfall && (
                    <div className="field span-2" style={{
                      background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 8, padding: '8px 10px', fontSize: 12,
                    }}>
                      Only {stockAvailable} {selectedStockItem?.unit} of {selectedStockItem?.name} in stock - can't issue {requestedQty}.
                    </div>
                  )}
                  <div className="field span-2" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    Its cost was already recorded when this stock was received - the billing below covers labour only,
                    if any was charged for fitting it.
                  </div>
                </>
              )}
              {form.part_source === 'new_purchase' && (
                <>
                  <div className="field span-2" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    The part's own cost, paid to whoever sold it - independent of the labour/fitting charge below,
                    even if it happens to be the same person or shop.
                  </div>
                  <div className="field">
                    <label htmlFor="part_vendor">
                      {useUnlistedPartVendor ? 'Bought from (not in system)' : 'Bought from'}
                    </label>
                    {useUnlistedPartVendor ? (
                      <input id="part_vendor" required placeholder="e.g. Roadside Auto Spares"
                        value={form.part_unlisted_vendor_name} onChange={(e) => set('part_unlisted_vendor_name', e.target.value)} />
                    ) : (
                      <select id="part_vendor" required value={form.part_vendor ?? ''} onChange={(e) => set('part_vendor', e.target.value || null)}>
                        <option value="" disabled>Select…</option>
                        {vendors.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    )}
                    <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
                      onClick={() => toggleUnlistedPartVendor(!useUnlistedPartVendor)}>
                      {useUnlistedPartVendor ? 'Pick from vendor list instead' : 'Vendor not in the system?'}
                    </button>
                  </div>
                  <div className="field">
                    <label htmlFor="part_amount">Part cost (₹)</label>
                    <input id="part_amount" type="number" step="0.01" required value={form.part_amount ?? ''}
                      onChange={(e) => set('part_amount', e.target.value || undefined)} />
                  </div>
                  <div className="field span-2">
                    <label>Has the part been paid for?</label>
                    <div className="chip-group">
                      <span className={`chip${partPaymentStatus === 'settled' ? ' on' : ''}`} onClick={() => setPartPaymentStatus('settled')}>
                        Paid already
                      </span>
                      <span className={`chip${partPaymentStatus === 'pending' ? ' on' : ''}`} onClick={() => { setPartPaymentStatus('pending'); setPartPaymentMode(''); }}>
                        Not yet — pay later
                      </span>
                    </div>
                  </div>
                  {partPaymentStatus === 'settled' && (
                    <div className="field span-2">
                      <label htmlFor="part_payment_mode">Payment mode</label>
                      <select id="part_payment_mode" required value={partPaymentMode} onChange={(e) => setPartPaymentMode(e.target.value)}>
                        <option value="" disabled>Select…</option>
                        {VENDOR_PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
          </div>
          </div>
          )}

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
            <label>Billing (labour / fitting)</label>
            <div className="chip-group">
              {SERVICE_BILLING_OPTIONS
                // An outside person is always paid - "done internally" isn't
                // an option once that's the declared performer. Unrelated to
                // part_source now: a bought part's own cost is billed
                // separately above, whether or not the fitting itself is
                // billed to anyone.
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
                <label htmlFor="vendor">
                  {useUnlistedVendor ? "Vendor (not in system)" : 'Vendor'}
                </label>
                {useUnlistedVendor ? (
                  <input id="vendor" required placeholder="e.g. Roadside Auto Spares"
                    value={form.unlisted_vendor_name} onChange={(e) => set('unlisted_vendor_name', e.target.value)} />
                ) : (
                  <select id="vendor" required value={form.vendor ?? ''} onChange={(e) => set('vendor', e.target.value || null)}>
                    <option value="" disabled>Select…</option>
                    {garages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <button type="button" className="link-btn" style={{ marginTop: 4, fontSize: 11.5 }}
                  onClick={() => toggleUnlistedVendor(!useUnlistedVendor)}>
                  {useUnlistedVendor ? 'Pick from vendor list instead' : "Vendor not in the system?"}
                </button>
              </div>
              <div className="field">
                <label htmlFor="amount">Cost (₹)</label>
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

        {form.schedule && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            This will update the schedule's "last done" to this date/odometer.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !billingReady || !partReady || !scheduleReady}>{saving ? 'Saving…' : 'Log service'}</button>
        </div>
      </form>
  );

  if (bare) return body;

  return (
    <Modal title="Log maintenance service" onClose={onClose}>
      {body}
    </Modal>
  );
}
