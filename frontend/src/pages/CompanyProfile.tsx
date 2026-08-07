import { useEffect, useState, type FormEvent } from 'react';
import { usePermission } from '../context/AuthContext';
import { getCompanyProfile, updateCompanyProfile } from '../api/auth';
import { ApiError } from '../api/client';
import type { CompanyProfile, CompanyProfileInput } from '../api/types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toInput(p: CompanyProfile): CompanyProfileInput {
  return {
    legal_name: p.legal_name, entity_type: p.entity_type, gstin: p.gstin, pan: p.pan, tan: p.tan,
    address: p.address, city: p.city, state: p.state, pin: p.pin, fy_start_month: p.fy_start_month,
  };
}

export default function CompanyProfilePage() {
  const canEdit = usePermission('company_users', 'add_edit');

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState<CompanyProfileInput | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCompanyProfile()
      .then((p) => { setProfile(p); setForm(toInput(p)); })
      .catch((err) => setError(err.message));
  }, []);

  function set<K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCompanyProfile(form, logo);
      setProfile(updated);
      setForm(toInput(updated));
      setLogo(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save company profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile || !form) {
    return (
      <>
        <header className="page-head"><div><h1>Company Profile</h1></div></header>
        <main className="content">{error && <div className="error-banner">{error}</div>}</main>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Company Profile</h1>
          <div className="sub">Your organization's own record — appears on payslips, statements and reports</div>
        </div>
      </header>

      <main className="content">
        {error && <div className="error-banner">{error}</div>}
        {!canEdit && (
          <div className="error-banner" style={{ color: 'var(--ink-soft)', background: 'var(--paper)' }}>
            Only an Admin can edit the company profile. You can view it here.
          </div>
        )}

        <section className="table-card" style={{ padding: '20px 24px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-section">
              <h4>Company details</h4>
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor="legal_name">Legal name</label>
                  <input id="legal_name" required disabled={!canEdit} value={form.legal_name}
                    onChange={(e) => set('legal_name', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="entity_type">Entity type</label>
                  <input id="entity_type" disabled={!canEdit} placeholder="e.g. Proprietorship, Pvt Ltd"
                    value={form.entity_type} onChange={(e) => set('entity_type', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="fy_start_month">Financial year starts</label>
                  <select id="fy_start_month" disabled={!canEdit} value={form.fy_start_month}
                    onChange={(e) => set('fy_start_month', Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Tax details</h4>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="gstin">GSTIN</label>
                  <input id="gstin" disabled={!canEdit} placeholder="For billing customers with GST"
                    value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label htmlFor="pan">PAN</label>
                  <input id="pan" disabled={!canEdit} value={form.pan}
                    onChange={(e) => set('pan', e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label htmlFor="tan">TAN</label>
                  <input id="tan" disabled={!canEdit} placeholder="For TDS on driver/vendor payouts"
                    value={form.tan} onChange={(e) => set('tan', e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Address</h4>
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor="address">Address</label>
                  <input id="address" disabled={!canEdit} value={form.address} onChange={(e) => set('address', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="city">City</label>
                  <input id="city" disabled={!canEdit} value={form.city} onChange={(e) => set('city', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input id="state" disabled={!canEdit} value={form.state} onChange={(e) => set('state', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="pin">PIN code</label>
                  <input id="pin" disabled={!canEdit} value={form.pin} onChange={(e) => set('pin', e.target.value)} />
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="form-section">
                <h4>Logo</h4>
                <div className="form-grid">
                  <label className="upload-field">
                    📷 Company logo
                    <input type="file" accept="image/*" onChange={(e) => { setLogo(e.target.files?.[0] ?? null); setSaved(false); }} />
                  </label>
                  {profile.logo && !logo && (
                    <a href={profile.logo} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>View current logo</a>
                  )}
                </div>
              </div>
            )}
            {!canEdit && profile.logo && (
              <div className="form-section">
                <h4>Logo</h4>
                <img src={profile.logo} alt="Company logo" style={{ maxHeight: 60, borderRadius: 7 }} />
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
            {saved && !error && (
              <div className="form-error" style={{ color: 'var(--good)', background: 'var(--good-soft)' }}>
                Saved.
              </div>
            )}

            {canEdit && (
              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </form>
        </section>
      </main>
    </>
  );
}
