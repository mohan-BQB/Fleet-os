# Fleet ERP: What It Is, What It Isn't, and What Breaks First

*Cross-functional product review — panel of six: VP Product (Samsara), Staff Product Designer (Motive), Fleet Ops Director (500+ vehicles), daily Fleet Manager user, enterprise SaaS buyer, B2B SaaS founder, enterprise-software VC. Reviewed 6 Aug 2026.*

A line-by-line audit of the `fleet-foundation 2` codebase — Django/DRF + PostgreSQL backend, React/TypeScript frontend — read in full before writing a word of opinion. No feature list, no demo script. Just the code, the models, and the workflows it actually produces.

---

## Summary

This is a genuinely well-modeled fleet **operations-and-accounting** ERP for Indian/emerging-market road-transport SMBs — multi-tenant, audit-everything, no-hard-delete, with a "foolproof billing" discipline (required choices, defense in depth, ledger-derived paid-state) applied consistently across vendors, tyres, maintenance and parts. It is not, and should never be pitched as, a Samsara/Motive/Geotab competitor — there is no telematics, no GPS ingestion, no ELD, no driver mobile app. Its real value is replacing the Excel-plus-paper-ledger-plus-WhatsApp stack for a 5–300 vehicle operator who cares about compliance renewals, driver salary advances, vendor bills, and trip-level P&L.

It's held back from being sellable today by a headline P&L bug (every hours-metered vehicle — JCB, tractor — shows a fabricated loss), a half-wired permission system, ephemeral file storage that will lose the very compliance documents it exists to track, and a handful of security defaults (hardcoded secret key fallback, DEBUG-true default, dev credentials printed on the login screen) that would end a serious buyer's evaluation in the first ten minutes.

| Score | Value |
|---|---|
| **Overall** | **63 / 100** |
| UX | 66 / 100 |
| Business value | 78 / 100 |
| Enterprise readiness | 38 / 100 |
| Competitive | 55 / 100 |

---

## 1. Product Vision

**The problem it actually solves** is not "fleet management" in the Samsara sense (where is my truck, is my driver braking hard, is my ELD log compliant). It's **the paperwork and cash-reconciliation burden of running a small-to-mid Indian road-transport or equipment-rental business**: RC/insurance/permit/fitness/PUC renewals across a mixed fleet of lorries and JCBs/tractors; drivers paid partly in cash advances against a running ledger; trip freight billed per-km/per-ton/per-trip to a consignor who has to be tracked as a receivable; vendor bills for fuel, tyres and repairs that have to be tracked as payables, some of them to shops that will never have a formal account.

That is a real, valuable, and — critically — **underserved** problem. Every western fleet-telematics vendor treats this as a rounding error next to hardware and safety; every generic accounting tool (Tally, Zoho Books) treats the vehicle-specific operational detail (which tyre is on which truck, when is this JCB's next service due, how many kilometres a rate card applies over) as out of scope.

**Is the problem valuable enough?** Yes, at the right price point and to the right customer. India alone has millions of small transport operators running 3–500 vehicles on exactly this workflow today, almost entirely on paper, Excel and WhatsApp. It is not, however, a venture-scale "every enterprise needs this" problem in the way Samsara's safety/compliance/insurance story is — it's a high-volume, price-sensitive SMB SaaS play, closer to a vertical Tally-plus-ops than to enterprise telematics.

**Positioning today: unclear, because it doesn't have one yet.** The codebase, feature set and domain modeling all point unmistakably at Indian SMB road transport + construction-equipment rental. But nothing in the product states this. Reviewed cold, a buyer could easily mistake it for "yet another generic fleet app" and compare it feature-for-feature against Samsara — a comparison this product will always lose, because it was never built to win it.

**Who should buy it, as built today:** a 5–300 vehicle Indian (or comparable emerging-market) trucking, logistics, or earthmoving/construction-equipment operator, currently on Excel + a paper advance-ledger + WhatsApp, whose top pains are compliance-renewal misses, messy driver-advance reconciliation, and not knowing which trucks are actually profitable.

**Who should not buy it yet:** anyone expecting GPS/telematics, anyone in a regulatory environment requiring ELD/HOS, and any enterprise buyer who will ask about SSO, data residency, or file-storage durability in the first meeting.

---

## 2. Workflow Review

### Vehicle & driver onboarding
The Vehicle-add form (30+ fields across category, registration, classification, ownership, operational, tyres, attachments) is a near-perfect field-for-field match to real RC-book/onboarding paperwork — verified directly against the standalone RC-entry mockups shipped alongside the repo. **Where it breaks:** no bulk import (CSV/Excel) for Vehicles or Drivers. A fleet owner with an existing 300-vehicle roster in Excel is asked to hand-type 300 RC forms before they can use the product at all — the single biggest first-mile friction point in the app.

### Trip sheet / work card (the daily-ops screen)
The most sophisticated workflow in the product, considerably more built-out than the codebase's own internal spec document admits (the spec still calls rate cards, multi-leg loaded/empty billing, and the approval gate "designed, not yet built" — all of it is live). Loaded/empty leg splitting, per-km/per-ton/per-trip/fixed rate resolution with versioning, a "money box" that reconciles cash advanced to a driver against spend and return, and a submit → approve/close gate that only posts revenue and driver pay once verified. **Matches real operations well** — the cash-advance-and-reconcile pattern is exactly how Indian trucking runs, and no named competitor models it at all.

**Where users get stuck:** reconciliation demands the float balance to zero exactly, with only a written-reason override as an escape hatch — in practice a busy manager will learn to always type a one-word override rather than chase the missing ₹40, and the control quietly stops meaning anything within a month. There's also no in-cab/driver-facing entry path — a trip sheet is filled after the fact by an office person, realistic for the target market today but the ceiling on this workflow without a driver mobile app.

### Tyre replacement
The single best-designed workflow in the product: one enforced "door" for a tyre swap (no path to record a replacement without naming the removal reason and outgoing tyre), atomic, and a lifetime-distance ledger that survives rotations, spare stints and re-fitting. **Where it would frustrate a real user:** the replace-tyre form has ~20 fields once every branch is open — fine for an accountant at month-end, heavy for a workshop mechanic on a phone.

### Compliance renewal
A single unified expiry-tracked document model covering RC/insurance/permit/fitness/PUC (vehicle) and licence/badge/police-verification (driver), a dashboard health ring, and a renew action that correctly creates a new document and archives the old rather than overwriting history. **Solid, but passive:** the only reminder surface is an in-app dashboard tile — no push/SMS/WhatsApp notification anywhere, ironic given replacing WhatsApp-based reminders is exactly the job this should do.

### Driver salary/advance ledger
The single best individual match to informal-sector reality: an advance-limit soft-warning, and a one-click "auto-settle with salary" that nets an outstanding advance off a new wage credit and pays only the difference. This workflow, on its own, can replace the paper advance ledger book today.

### Vendor / customer billing
A clean mirrored payable/receivable ledger with real "foolproof" discipline (paid-state derived from the ledger, never a drift-prone flag). **Where it falls short of fully replacing the accountant's separate books:** `tds_applicable` is a flag with zero calculation behind it, and there's no GST-compliant invoice/bill document generated anywhere — only a ledger line.

> **Net: can this replace Excel + WhatsApp?** For trip logging, compliance tracking, the driver ledger, and vendor/customer billing — largely yes, with a disciplined data-entry person in the loop. For live "where is my truck right now" visibility and instant driver–dispatcher coordination — no. This product replaces the ledger book and the Excel tracker. It does not replace the walkie-talkie.

---

## 3. Feature Audit

| Feature | Purpose | Primary user | Frequency | Value | Complexity | Verdict |
|---|---|---|---|---|---|---|
| Vehicle master (RC data) | System of record for vehicle legal/operational identity | Owner/admin | Once + edits | High | Med | **Keep** |
| Driver master | Identity, licence, employment, pay basis | Owner/admin/manager | Once + edits | High | Med | **Keep** |
| Compliance documents (unified) | Expiry tracking, vehicle + driver | All roles | Weekly | High | Low | **Keep** |
| Trip sheet — route card | Freight billing + revenue per haul | Manager/driver | Daily | Very high | High | **Keep** |
| Trip sheet — work card | Per-hour billing, JCB/tractor | Manager/driver | Daily | High | High | **Improve** — feeds a broken P&L |
| Route/Work Rate Card | Auto-resolve freight rate, versioned | Manager/accountant | Daily | High | Med | **Keep** |
| Money-box reconciliation | Reconcile driver cash advance vs. spend vs. return | Manager/accountant | Daily | Very high | Med | **Keep** — genuine differentiator |
| Trip approval gate | Only verified numbers post to P&L/ledgers | Owner/admin/manager | Daily | High | High | **Improve** — no lock after posting |
| Fuel log (standalone) | Company-wide fuel ledger, mileage | Manager/driver | Daily | High | Low | **Improve** — add source traceability |
| Tyre operations | Fit/replace/service, one enforced door | Manager/workshop | Weekly | High | High | **Keep** |
| Tyres Master | Read-only duplicate view of tyre data | Manager/owner | Weekly | Low–Med | Low (duplicated) | **Remove** — merge as a tab |
| Maintenance schedules + log | Preventive service due-tracking | Manager/workshop | Weekly | High | Med | **Keep** |
| Maintenance Master | Read-only duplicate view | Manager/owner | Weekly | Low–Med | Low (duplicated) | **Remove** — merge as a tab |
| Parts inventory | Stock on-hand via receipt/issue ledger | Workshop/manager | Weekly | Med | Med | **Improve** — reorder level never actioned |
| Expense heads + register | Chart-of-accounts-lite | Accountant | Daily | High | Low | **Keep** |
| Vehicle / dashboard P&L | Per-vehicle and fleet profitability | Owner | Weekly | Very high | Med | **Improve** — materially wrong today |
| Vendor + ledger (payable) | Track who the business owes | Accountant | Daily | High | Med | **Keep** |
| Customer + ledger (receivable) | Track who owes the business | Accountant | Daily | High | Med | **Keep** |
| Combined Customer & Vendor page | One nav entry wrapping two pages | All roles | Daily | Low | Low | **Improve** — cosmetic glue only |
| Vendor/customer payments (aging) | Who's overdue, by how long | Accountant/owner | Weekly | High | Low | **Keep** |
| Driver ledger | Cash-advance-native pay tracking | Manager/accountant | Daily | Very high | Med | **Keep** |
| Vehicle EMI / loan tracking | Cash-flow view of installments due | Owner/accountant | Monthly | Med | Low | **Keep** — disclose P&L exclusion |
| Reports (10 sections) | Compliance, utilization, P&L, fuel, etc. | Owner/accountant | Weekly | High | Med | **Keep** |
| CSV export | Take data to Excel | Accountant | Weekly | Med | Low | **Keep** |
| Print-to-PDF reports | Physical/PDF copies | Owner | Monthly | Low–Med | Low | **Improve** — no real PDF/email delivery |
| Team & permissions grid | Role + per-user overrides | Owner/admin | Rarely | Med | Med | **Improve** — grid promises more than enforced |
| Company profile | Legal/tax identity, logo | Admin | Rarely | Med | Low | **Keep** |
| Audit log | Immutable who/what/when trail | Owner/admin | As-needed | High | Low | **Keep** |
| Developer Dashboard (platform) | Cross-org health, job runner, API keys | Platform operator | As-needed | Med (internal) | Med | **Keep** |
| Control Center (platform) | Org onboarding, module toggles, impersonation | Platform operator | As-needed | Med (internal) | Med | **Improve** — no billing/metering layer |

---

## 4. UX Review

**Navigation & information architecture.** The five-group rail (Operations / Settlements / Reports / Masters / Platform) is clean and learnable at a glance. It's undermined by the **Operations-vs-Masters split** repeated for both Tyres and Maintenance: two nearly-identical pages per module, each self-documenting that the other page exists for the other half of the job. Real IA tax for zero added capability, and it shows up as verbatim-duplicated table markup that can already drift.

**Dashboard design.** Genuinely good hierarchy: a four-tile glance row, a period-scoped expense/compliance row, a compliance health ring plus alerts feed, then pending payments and the full fleet table. This is the one screen that reads like a real "triage in 15 seconds" dashboard rather than a data dump.

**Data density & hierarchy outliers.** The Vehicle Detail modal is a 900-line, six-tab command center that re-renders simplified copies of tables the dedicated pages already own — a single component trying to be the whole app. The tyre-replacement form, at ~20 conditionally-visible fields, is the densest form in the product.

**Mobile-friendliness.** Mixed signal. Real mobile thought exists — a searchable side-panel vehicle picker built explicitly because "a dropdown doesn't scale to a large fleet on a phone," and a "remember last vehicle" convenience across four pages. But the heavy multi-section forms (vehicle add, tyre replacement) are desktop-shaped and will be unpleasant on a phone in a workshop bay — exactly where a mechanic will be standing when they need them.

**Speed of task completion.** Real "fewer taps" design in places: inline customer creation while adding a trip leg, rate-card autofill, and a driver-ledger "auto-settle with salary" that saves a manual netting step. Inconsistently applied — there is no bulk action anywhere in the product.

**Learnability & enterprise usability.** The permission model is the biggest usability trap: Team.tsx presents a full per-section, per-action grid as if it's enforced everywhere, but only five of roughly thirty page/component files actually check it client-side. A restricted user will see fully clickable Add/Edit buttons, fill in a form, and only then discover via a server error that they couldn't do that.

---

## 5. Enterprise Readiness

*Scenario: demoing this to the owner of a 300-vehicle mixed trucking/earthmoving fleet.*

**What they'd ask:**
- "Can I import my existing 300 vehicles and drivers from Excel, or am I typing all of this in by hand?"
- "Where's the GPS? My trucks already have trackers — does this show me where they are?"
- "If your server goes down, is my data backed up? What about the RC copies and licence photos I upload?"
- "Can I give my Chennai depot manager access to only their 40 vehicles, not the whole fleet?"
- "Do you support single sign-on? My IT team requires it for anything touching financial data."
- "What's your uptime SLA, and where is my data physically hosted?"
- "What does this cost per vehicle, and does the price change as we grow?"

**What they'd criticize on sight:**
- The login screen prints a developer username/password in plain text, unconditionally.
- Uploaded compliance documents live on ephemeral local disk today — lost on every redeploy until cloud storage is wired in. For a *compliance* product, losing the compliance documents is close to the worst possible failure mode.
- No bulk import path — a 300-vehicle onboarding by hand is a non-starter.
- The permission grid looks fine-grained but isn't enforced across most of the app's own buttons — a security-literate buyer will find the gap in minutes.

**What would stop them buying today:** the combination of ephemeral file storage (data-loss risk on the exact records this product is meant to safeguard), no bulk migration path, and insecure-by-default backend settings (hardcoded `SECRET_KEY` fallback, `DEBUG` defaulting to `True`, no login rate-limiting, CSRF disabled app-wide in favor of a CORS allow-list). None of these are hard to fix — but as shipped, this is a well-built SMB self-serve product with an enterprise-shaped feature list, not an enterprise sale.

---

## 6. Competitive Analysis

| Axis | Samsara / Motive / Geotab / Verizon Connect | This product |
|---|---|---|
| Workflow quality | Best-in-class for safety, telematics, ELD/HOS — built around hardware data streams | Best-in-class for cash-ledger-native driver pay, mixed km/hours fleets, Indian vendor/GST-adjacent billing — a class the others don't model at all |
| Ease of use | Polished but heavyweight — often needs an implementation partner | Lighter, closer to how a small operator thinks, but inconsistent permission enforcement and duplicate pages add friction |
| Operational efficiency | Huge where hardware/telematics is the bottleneck | Huge where paperwork/reconciliation is the bottleneck — a different, equally real bottleneck |
| Scalability | Proven at tens of thousands of vehicles, enterprise infra, SSO, SLAs | Proven at zero production tenants; unpaginated endpoints, no composite indexes, no S3, no visible CI |
| Buyer value proposition | "Reduce accidents, insurance premiums, fuel waste, compliance risk" — hardware ROI | "Stop losing money to un-reconciled cash advances, missed renewals, unclear vehicle profitability" — bookkeeping-and-ops ROI |

**Where this product is genuinely better:** the money-box/driver-advance reconciliation, dual km/hours metering unifying trucks and earthmoving equipment, rate-card-with-versioning freight billing, and the "foolproof billing" ledger discipline — none of the five named competitors model any of this.

**Where it is decisively weaker:** everything involving a physical sensor — no telematics, no GPS ingestion, no driver scorecards, no route optimization, no ELD. If pitched against those five names on their own turf, it loses every time. It should never be pitched there.

---

## 7. Product Strategy

| Action | What | Why / impact |
|---|---|---|
| **Remove** | TyresMaster.tsx and MaintenanceMaster.tsx as separate routes | Fold into the operational pages as a tab — kills duplicated-table maintenance burden |
| **Simplify** | VehicleDetailModal's six tabs | Extract shared components so modal, page, and Masters page render from one source |
| **Combine** | VendorDetailModal + CustomerDetailModal | One generic party-ledger component parameterized by payable/receivable |
| **Combine** | OPTIONAL_MODULES (org-level) and PERMISSION_SECTIONS (per-user) | Two similarly-named, overlapping lists easy to conflate — reconcile naming |
| **Automate** | Compliance & overdue-maintenance reminders | Push via WhatsApp/SMS/email digest, not just an in-app tile |
| **Automate** | Parts reorder alerting | `reorder_level` is captured today and used nowhere |
| **Redesign** | Permission enforcement on the frontend | Every write control should reflect the resolved grid, not just 5 files |
| **Redesign** | Bulk data entry (import/export) | CSV/Excel import for Vehicles, Drivers, Vendors, Customers, Parts |
| **Combine** | Media storage | Move to S3-compatible storage before onboarding a single paying customer |

---

## 8. Technical Review

| Scale | Verdict | What breaks / must change first |
|---|---|---|
| 10 customers | Fine as-is | Current architecture handles pilot-scale load comfortably. Real risk here is data loss (ephemeral storage), not throughput. |
| 100 customers | Needs fixes | Fix the P&L WorkItem omission. Add default pagination (today only audit log paginates). Add composite indexes on date-scoped fields. Move media to S3. Wire frontend permission enforcement. Add tests for Tyres and Maintenance — currently **zero** automated coverage on the two most transactionally complex apps, versus 1,172 lines of tests elsewhere. |
| 1,000 customers | Real work needed | Replace the N+1 per-vehicle P&L loop with grouped aggregates. Move the synchronous "run now" compliance job to a real background queue (Celery/RQ) — no async worker exists today. Add structured logging/error tracking. Add API throttling (none exists, including on login). |
| Enterprise scale | Not ready | No SSO/SAML, no MFA, no depot/region data partitioning (permissions are flat org-wide), no documented backup/DR/RPO-RTO story, no formal security review. All buildable on the existing foundation — the multi-tenancy and audit-log design are already genuinely enterprise-grade — but none of it exists yet. |

**Technical debt worth naming specifically:** a hardcoded insecure `SECRET_KEY` fallback if unset; `DEBUG` defaulting to `True` if unset; CSRF disabled app-wide, relying entirely on a CORS allow-list; no login rate limiting; `Organization.disabled_modules` enforced only in the frontend nav, not the API; a dead `TripSheetStatus.APPROVED` enum checked but never reachable; no lock preventing a `TripLeg`/`WorkItem` edit after approval, silently desyncing a posted receivable.

The engineering that *is* present is unusually disciplined for a project this young (29 commits, ~two weeks of history) — the "foolproof billing" pattern, the audit-diffing `BaseModel.save()`, and the transaction-wrapped tyre-replacement/inventory-issue flows all show real care. The debt is concentrated almost entirely in security defaults and infra plumbing, not the domain model itself.

---

## 9. Biggest Mistakes

- **Correctness:** Dashboard and per-vehicle P&L never counts `WorkItem` revenue — only `TripLeg` freight. Every hours-metered vehicle shows a fabricated, permanent loss with costs counted but zero revenue. The single most damaging bug in the product — silent, in the headline financial feature, and specifically breaking the segment the dual-metering design was built to serve.
- **Weak product decision:** Nothing stops a `TripLeg`/`WorkItem` from being edited after approval and invoicing — the receivable ledger silently keeps the stale amount forever.
- **Weak UX decision:** The Team.tsx permission grid is presented as comprehensive; only 5 of ~30 frontend files check it, so most write buttons render for users who will be rejected server-side on submit.
- **Missing core functionality:** No bulk import/export, no outbound notification channel despite the product's own "replace WhatsApp" ambition, and no billing/subscription/metering layer for the vendor to monetize tenants at all.
- **Feature bloat / structural over-engineering:** Two nearly-identical pages per module (Tyres/TyresMaster, Maintenance/MaintenanceMaster) plus a third partial copy inside VehicleDetailModal — the same data rendered three ways, none shared.
- **Weak security default:** A developer login/password printed unconditionally on the public login screen; `SECRET_KEY` falls back to a hardcoded insecure default; `DEBUG` defaults to `True`. None exploited yet, all would be caught in the first ten minutes of a real security review.

---

## 10. Final Verdict

| Question | Answer |
|---|---|
| Build this today, from scratch? | **Yes** |
| Invest at this stage? | **Conditional yes** |
| Buy it (300-vehicle fleet)? | **Not yet** |
| Recommend it (SMB 5–50 vehicles)? | **Yes, cautiously** |

**Would we build this?** Yes. The underlying wedge — a cash-ledger-native, GST/TDS-aware, compliance-and-billing-first operations system for emerging-market SMB trucking and equipment-rental fleets — is real, underserved, and correctly identified. The foundational engineering (multi-tenancy, immutable audit trail, no-hard-delete, "foolproof billing") is unusually mature for ~two weeks of commit history. We would not build it exactly this way — no Operations/Masters page duplication, and security/storage defaults fixed before another domain feature.

**Would we invest?** A conditional pre-seed/seed yes — conditional on (1) evidence of real paying-customer pull for this specific workflow, (2) a committed near-term punch list against the security/data-loss items, (3) clarity on go-to-market, since the field-heavy forms imply assisted onboarding more than pure self-serve.

**Would we buy it?** As a 500-vehicle Fleet Ops Director: not at that scale, not until bulk import, durable file storage, and a firmer security posture exist. As a 5–50 vehicle SMB operator on Excel/WhatsApp/paper: yes, eyes open that there's no GPS behind the "GPS" label.

**Would we recommend it?** To an SMB Indian road-transport or construction-equipment operator drowning in spreadsheets: yes, once storage/security items are fixed. To an enterprise buyer expecting Samsara-class telematics: no — different problem entirely.

---

## Top 50 Improvements, Highest ROI First

*Order carries the priority signal — cheap-and-critical first, then structural fixes, then larger strategic bets.*

### Tier 1 — fix before the next demo (hours of work, existential impact)
1. Fix the P&L bug: include WorkItem revenue in `vehicle_pnl`/`dashboard_pnl` — every hours-metered vehicle currently shows a fabricated loss.
2. Remove the hardcoded dev credentials from the public login screen — guard behind a dev/staging build flag.
3. Remove the hardcoded `SECRET_KEY` fallback; fail loudly if unset in production.
4. Make `DEBUG` default to `False`; require explicit opt-in to `True`.
5. Move media/file storage to S3-compatible object storage — compliance documents are lost on every redeploy today.
6. Add login rate limiting/throttling — no brute-force protection exists today.
7. Lock or re-sync `TripLeg`/`WorkItem` edits after trip approval to stop receivable desync.

### Tier 2 — fix before scaling past a handful of tenants
8. Wire real permission enforcement into every page's write controls.
9. Add Tyres, Maintenance, and Parts Inventory to the permission-section list.
10. Add automated tests for the Tyres and Maintenance apps — zero coverage today on the most transactionally complex domains.
11. Add default pagination to every list endpoint.
12. Add composite indexes on date-scoped fields (TripLeg, FuelLog, Expense, DriverLedgerEntry).
13. Replace the N+1 per-vehicle P&L loop with a single grouped aggregate query.
14. Add bulk CSV/Excel import for Vehicles and Drivers.
15. Extend bulk import/export to Tyres, Parts, Vendors, and Customers.

### Tier 3 — structural / UX cleanup
16. Merge Tyres.tsx and TyresMaster.tsx into one page with tabs.
17. Merge Maintenance.tsx and MaintenanceMaster.tsx the same way.
18. Extract shared table components so VehicleDetailModal reuses the dedicated pages' rendering.
19. Merge VendorDetailModal and CustomerDetailModal into one generic party-ledger component.
20. Add a visible source trace to FuelLog rows (direct entry vs. posted from a trip).
21. Fix the "Yearly" timeline tab to mean calendar-year-to-date, or rename it.
22. Reconcile the OPTIONAL_MODULES vs. PERMISSION_SECTIONS naming overlap.
23. Enforce `disabled_modules` at the API layer, not just the frontend nav.

### Tier 4 — close the "replace WhatsApp / Excel" promise
24. Add outbound WhatsApp/SMS/email alerts for compliance-due and overdue maintenance.
25. Add a low-stock/reorder alert for Parts Inventory.
26. Make the "exit impersonation" affordance unmissable while impersonating.
27. Rewrite `docs/SPEC.md` to match the shipped system.
28. Remove the dead `TripSheetStatus.APPROVED` state, or document why it's kept.

### Tier 5 — platform/infra maturity
29. Add a background job queue (Celery/RQ) for compliance checks and future async work.
30. Add structured logging and error tracking (e.g. Sentry).
31. Stand up CI running the existing 1,172-line backend test suite on every push.
32. Add API-wide rate limiting/throttling, not just on login.
33. Unify the three overlapping cost-taxonomy vocabularies (Expense groups, MaintenanceLog.work_type, TyreService.service_type).

### Tier 6 — deepen the India/EM finance fit
34. Implement real TDS calculation, not just a flag.
35. Generate a real GST-compliant invoice/bill document for customer freight billing.
36. Add depot/branch/region modeling with scoped permissions.

### Tier 7 — enterprise-readiness bets
37. Add SSO/SAML support.
38. Add MFA, especially for owner/admin accounts and the platform console's impersonation feature.
39. Document and test a real backup/DR story (RPO/RTO).
40. Commission an external security review before any enterprise sales conversation.

### Tier 8 — bigger strategic bets
41. Build a driver-facing mobile app or PWA for in-cab trip/fuel entry.
42. Define a lightweight GPS/telematics integration story (even a cheap GPS puck or phone-based ping).
43. Add a billing/subscription/metering layer to the console app.
44. Add scheduled, emailed PDF report digests.

### Tier 9 — lower-priority polish
45. Add a "quick mode" with sane defaults to the Vehicle-add and Replace-Tyre forms.
46. Allow bulk rate-card updates (e.g. a fuel-price-linked escalation applied across many routes at once).
47. Consolidate the duplicated AuditLog.tsx / AuditHistory.tsx formatter helpers.
48. Add object-level permission scoping for Drivers, mirroring the row-level carve-out already built for trip sheets.
49. Add integration tests specifically around the trip-approval fan-out transaction.
50. Publish a documented retention/export policy for the audit log and reports.

---

*Panel review of the `fleet-foundation 2` codebase (Django/DRF + PostgreSQL backend, React/TypeScript/Vite frontend) — read directly from source, no assumptions.*
