# Fleet ERP — System Specification

Status of this document: living spec. Section markers show what's **built**
(verified against the actual code as of this writing) versus **designed,
not yet built** (agreed shape, no code exists). Update both the code and
this file together going forward — this is what's built against.

Stack: Django 5 + DRF + PostgreSQL backend (`fleet-foundation 2/`), React +
TypeScript (Vite) frontend (`frontend/`). Multi-tenant: every tenant is an
`Organization`; every record is scoped to one.

---

## 1. Cross-cutting rules

These apply to every master in the system, built or planned. They're
enforced once, in `core/`, not re-implemented per app.

- **Multi-tenancy.** Every tenant-scoped model subclasses `BaseModel`
  (`core/models.py`), which carries `organization`. The default manager
  (`TenantManager`) auto-filters every query to the current request's
  tenant via thread-local state (`core/tenancy.py`,
  `core/middleware.py:CurrentTenantMiddleware`). An `all_objects` manager
  bypasses this for admin/migrations.
- **No hard delete.** `BaseModel.delete()` raises `PermissionError`.
  Records are retired via `retire()`, which flips `status` and saves —
  subclasses override the target status (e.g. `Vehicle.retire()` →
  `sold`, `Driver.retire()` → `relieved`, `Tyre.retire()` → `retired`).
  History stays intact; nothing disappears.
- **Immutable audit trail.** `BaseModel.save()` diffs against the DB
  row before saving and writes an `AuditLog` entry (`core/audit.py`) —
  who, when, model, object id, and a `{field: [old, new]}` changes dict.
  `AuditLog` itself refuses updates and deletes at the model level.
- **Role-based capabilities**, not per-model permissions. `core/permissions.py`
  defines a capability → allowed-roles matrix (`MATRIX`); every view checks
  one named capability (`required_capability` + `HasCapability`), not a
  raw CRUD verb. Roles: `owner`, `admin`, `manager`, `driver`, `accountant`.

  | Capability | Roles |
  |---|---|
  | `manage_users` | owner, admin |
  | `edit_vehicles_drivers` | owner, admin, manager, accountant |
  | `retire_masters` | owner, admin, accountant |
  | `set_tracking_mode` | owner, admin |
  | `build_sop_templates` | owner, admin, accountant |
  | `enter_trip_sheets` | owner, admin, manager (+ driver: own only) |
  | `complete_sop` | owner, admin, manager, driver |
  | `driver_ledger` | owner, admin, manager, accountant |
  | `compliance_maintenance` | owner, admin, manager |
  | `manage_expenses` | owner, admin, manager, accountant |
  | `view_pnl_reports` | owner, admin, manager, accountant |
  | `manage_vendors` | owner, admin, manager, accountant |
  | `vendor_ledger` | owner, admin, manager, accountant |
  | `edit_company_profile` | admin |
  | `upload_logo` | admin |
  | `view_audit_log` | owner, admin |

  Two capabilities (`build_sop_templates`, `complete_sop`) are already
  reserved for the SOP master — see §4.1, not yet built.

- **The "foolproof" billing/accountability pattern**, used everywhere
  money or a physical part changes hands. It recurs enough across Vendor,
  Tyre, and Maintenance that it's worth naming once:
  1. A **required choice with no default** at the point of entry (e.g.
     "paid vs. done internally", "part replacement vs. consumable").
     Enforced at the serializer layer (`validate()` raises if blank),
     never defaulted, so it can't be silently skipped.
  2. **Defense in depth**: the same rule is checked in more than one
     layer where more than one entry point exists — a model-level
     invariant in `save()` (survives any caller, including direct admin
     edits), a serializer `validate()` (the API-level gate), and a
     disabled-until-valid control on the frontend (UX, not the real
     gate).
  3. **Atomic multi-record operations** run inside `transaction.atomic()`
     so a rejected request can't leave the system half-updated (e.g.
     tyre replacement: retiring the old tyre and creating the new one
     either both happen or neither does).
  4. **Ledger state is derived, never stored as a flag.** "Is this
     paid?" is answered by querying for a matching ledger entry
     (`vendors.services.is_paid`), not a boolean column that could drift
     out of sync with reality.
  5. **A vendor not in the system is still accounted for**, not
     silently dropped or falsely mislabeled — captured as free text,
     folded into the linked Expense's notes, explicitly excluded from
     ledger/payable tracking (since there's no real account to owe).

---

## 2. Identity & tenancy — built

- **`Organization`** (`core/models.py`) — one row per tenant. `name`,
  `is_active`.
- **`User`** (`core/models.py`, extends `AbstractUser`) — email login,
  `organization` FK, `role` (see capability matrix above), `driver_id`
  (reserved link to a `Driver` record for driver app-logins).
- **`CompanyProfile`** (`core/models.py`) — one-to-one with
  `Organization`. `legal_name`, `entity_type`, `logo`, `gstin`, `pan`,
  `tan` (enables TDS — see Vendor below), `address`/`city`/`state`/`pin`,
  `fy_start_month`. Edit gated to `admin` only.
- **`AuditLog`** (`core/models.py`) — append-only, immutable at the model
  level. `action` (create/update/retire/login), `model_name`,
  `object_id`, `changes` (JSON), `user`, `created_at`. Indexed by
  `(organization, model_name, object_id)` and `(organization, user,
  created_at)`.

---

## 3. Masters — built

### 3.1 Vehicle (`vehicles/`)

The category is the master switch: it sets `metering_unit` (km vs.
hours) and which compliance documents/reminders apply.

- **Category**: lorry, four_wheeler, car, two_wheeler, tractor, jcb.
  `HOURS_CATEGORIES = {tractor, jcb}` → `metering_unit` auto-derives to
  `hours` on save unless already set; everything else is `km`. This is
  the one place the unit is decided — all downstream distance/interval
  logic (Tyres, Maintenance) just reads `vehicle.metering_unit` and
  relabels, never re-derives it.
- Registration/RC fields: `registration_number` (unique per org),
  `registration_date`, `rto`, `chassis_number`, `engine_number`,
  `rc_valid_till`, `fuel_norm`.
- Classification/specs: `rto_vehicle_class`, `maker`, `model`,
  `mfg_year`, `fuel_type`, `cc`, `seating_capacity`, `gvw`, `colour`,
  `body_type`.
- Ownership: `owner_name`, `owner_relation`, `address`, `financier`,
  `hypothecation_till`, `number_of_owners`, `acquisition_type`
  (new/second_hand), `purchase_date`, `previous_owner`,
  `ownership_transfer_date`.
- Wheel config: `number_of_tyres`, `spare_tyres`, `axle_layout` — feeds
  the Tyres position map (§3.5).
- Operational: `fleet_id` (nickname), **`current_meter`** +
  `meter_reading_date` (the single source of truth for "how far has
  this vehicle gone" — read by Tyres distance tracking, Maintenance due
  dates, and P&L; only reliably advanced by `TripSheet.close()`, see
  §3.8 and the known limitation there), `purchase_price`.
- Attachments: `rc_copy`, `photo`.
- Status: active / in_service / sold / scrapped. `usage`: private /
  commercial. `tracking_mode`: gps / manual (admin-only to change).

### 3.2 Driver (`drivers/`)

- Identity: `code` (unique per org, e.g. `DRV-01`), `name`, `dob`,
  `mobile`, `emergency_contact`, `address`, `blood_group`.
- Licence/badge (feed reminders via Compliance, §3.3): `licence_number`,
  `licence_class` (LMV/HMV/HTV/multiple), `licence_issue_date`,
  `licence_valid_till`, `issuing_rto`, `badge_number`,
  `badge_valid_till`.
- Employment/pay: `date_of_joining`, `employment_type`
  (permanent/contract/temporary), `wage_basis` (monthly/per_trip/per_day),
  `wage_amount`, `has_app_login`, `advance_limit` (warn, not block, when
  outstanding advances would exceed it).
- Attachments: `photo`, `licence_copy`, `id_proof`.
- Status: active / on_leave / relieved.

### 3.3 Compliance documents (`compliance/`)

One `Document` model covers every RC/insurance/permit/licence-type
record with an expiry, for both vehicles and drivers — a single place
the reminder engine and dashboard ask "what's due", instead of a
bespoke expiry field per document per master.

- `vehicle` XOR `driver` (a DB check constraint enforces exactly one
  holder — never both, never neither).
- `doc_type`: rc, insurance, permit, national_permit, fitness, puc,
  road_tax (vehicle); licence, badge, police_verification,
  medical_certificate (driver); other.
- `doc_number`, `issue_date`, `valid_till` (null = doesn't expire),
  `reminder_days_before` (default 30), `file`, `notes`.
- `is_expired` / `is_due` properties; a custom `QuerySet`
  (`expired()`, `due()`, `needs_attention()`) is what the dashboard's
  "due for renewal" list runs against.

### 3.4 Vendor + Vendor Ledger (`vendors/`)

Everyone the business pays — fuel stations, garages, tyre shops, parts
suppliers, insurance agents — mirroring the driver ledger but for money
owed the other way.

- **Vendor**: `name`, `vendor_type` (scopes which picker a vendor shows
  up in — fuel-log picker only shows fuel stations, etc.),
  `contact_person`, `mobile`, `email`, `address`, `gstin`,
  `tds_applicable` (whether TDS applies — the company's own TAN on
  `CompanyProfile` is what actually enables deducting it; no TDS
  calculation logic exists, just the flag).
- **VendorLedgerEntry**: `vendor`, `date`, `entry_type` (bill/payment —
  a bill is the credit side, a payment the debit side, in accounting
  terms), `payment_mode` (cash/bank/upi/cheque — required on payment
  entries), `amount`, `remarks`. `source_model`/`source_id` are a
  lightweight non-FK trace back to whichever `Expense`/`FuelLog`
  triggered a bill (mirrors `AuditLog.model_name`/`object_id` — a real
  FK would create an import cycle between `economics`/`operations` and
  `vendors`).
- **`vendors/services.py`**: `sync_bill()` (posts/reconciles a bill on
  every save of a vendor-linked `Expense`/`FuelLog`/`TyreService`/
  `MaintenanceLog`, not just creation — an edit that adds a vendor or
  corrects an amount reaches the ledger too), `is_paid()` (derives
  paid/unpaid from ledger entries), `mark_paid()` (the one function
  anything that settles a bill goes through; validates `payment_mode`,
  idempotent — a second call on an already-paid bill is a no-op).
- Vendor passbook UI: running balance, oldest-first, bill = credit,
  payment = debit.

### 3.5 Tyre + Tyre Service (`tyres/`)

Physical tyre tracking with a full lifecycle, separate from the
vehicle's basic count/layout (which lives on `Vehicle`).

- **Tyre**: `vehicle`, `position` (free text — position vocabulary
  varies by axle layout, not a fixed enum), `brand`, `size`,
  `serial_number`, `fitted_date`, `purchase_date`, `purchase_price`,
  `odometer_at_fitting` (start of the *current* stint only — null when
  not fitted), `accumulated_distance` (system-maintained running total
  across every earlier *closed* stint — never user-editable),
  `status`: fitted / spare / retired.
  - `total_distance` (property) = `accumulated_distance` + the open
    stint if currently fitted. This is the number the UI shows — it
    survives rotations, spare stints, and re-fitting intact.
  - `Tyre.save()` detects fitted↔non-fitted status transitions
    (comparing against the DB's prior state, not the incoming payload)
    and closes/opens stints automatically: pulling a tyre to spare/
    retired rolls its stint distance into `accumulated_distance` and
    clears `odometer_at_fitting`; fitting one starts a new stint. This
    runs for *every* entry point that can change status — the dedicated
    replace-tyre action, the plain Retire button, and direct edits —
    not just one of them.
- **TyreService**: one service event (alignment, rotation, balancing,
  puncture_repair, replacement, inspection). `vehicle`, `tyre`,
  `date`, `odometer`, `tread_depth_in`, `new_position` (rotation —
  `save()` applies this to the tyre's own position), `vendor` /
  `unlisted_vendor_name` (mutually exclusive — see §1's pattern),
  `notes`.
  - Replacement-only fields: `previous_tyre` (the tyre this one
    replaced — the entire lineage trail; "what happened to the old
    tyre" is answered by its `status`, not a separate flag),
    `removal_reason` (worn_out/puncture/sidewall_damage/uneven_wear/
    other), `removal_odometer`, `removal_tread_depth_in` (the outgoing
    tyre's own final reading, distinct from the incoming tyre's
    `odometer`/`tread_depth_in` above).
  - Billing: `billing` (paid/done_internally, required no default),
    `internal_note`, `expense` (FK to `economics.Expense`, writable —
    lets a bulk rotation/balancing visit, one bill for several tyres,
    point every row at the same Expense instead of billing once per
    tyre).
- **Replace-tyre flow** (`tyres/services.py:apply_tyre_replacement`,
  `tyres/views.py:TyreServiceViewSet.replace_tyre`) — the one intended
  door for a tyre swap, atomic:
  1. Requires: removal reason, disposition (retired vs. moved to spare
     stock — moving to spare relabels the position to `Spare (ex <old
     position>)`, freeing the road position string so the incoming
     tyre can take it with no clash), and either a brand-new tyre's
     details or an existing spare to promote.
  2. Creating a `TyreService` with `service_type=replacement` through
     the plain CRUD endpoint is still possible but rejected unless
     `previous_tyre` and `removal_reason` are also supplied — there's
     no path to a "replacement" that doesn't name both tyres.
  3. The generic "Log service" dropdown excludes `replacement`
     entirely, routing to this flow instead; a "Replace a tyre…"
     picker is also surfaced directly in the Service history section
     for discoverability.
- Position map UI: schematic grid generated from
  `vehicle.number_of_tyres`/`spare_tyres`, click an occupied slot to
  Replace, an empty one to Assign.

### 3.6 Maintenance (`maintenance/`)

Preventive maintenance: recurring part/consumable schedules plus the
log of services actually performed. `part_name` is free text on both
models (mirrors Tyre's `position` — no shared catalog).

- **MaintenanceSchedule**: `vehicle`, `part_name`, `interval_km`,
  `interval_days` (either or both — whichever comes first),
  `last_done_date`, `last_done_odometer`, `notes`, `status`
  (active/inactive). Properties: `next_due_km`, `next_due_date`,
  `km_remaining`, `days_remaining`, `is_overdue`. These fields are
  unit-agnostic numbers under the hood — for an hours-metered vehicle
  (tractor/JCB) they already read correctly as hours; only the UI
  label follows `vehicle.metering_unit`.
- **MaintenanceLog**: `vehicle`, `schedule` (optional link), `part_name`,
  `date`, `odometer`, `vendor` / `unlisted_vendor_name`, `notes`.
  - `save()` rolls the linked schedule's `last_done_date`/
    `last_done_odometer` forward whenever the log's date is on/after
    the schedule's current one — this is what keeps "next due" correct
    on an early/out-of-cycle replacement, *if* it's linked.
  - `work_type`: `part_replacement` vs. `consumable` (oil, coolant,
    grease, brake fluid, labour-only — nothing physical to account
    for). Required, no default.
  - Part-replacement-only: `disposal_plan`
    (returned_to_vendor/scrapped/kept_as_spare/handed_to_owner/other,
    required), `old_part_number` and/or `old_part_photo` (at least one
    required — the outgoing part must be identifiable, not just
    described).
  - Billing: same `billing`/`vendor`/`unlisted_vendor_name`/
    `internal_note`/`expense` shape as TyreService.
  - **Schedule auto-match**: if `part_name` matches an existing active
    schedule for the vehicle (case-insensitive) but no `schedule` is
    linked, the save is rejected until either linked or explicitly
    confirmed as not that item (`confirm_no_schedule`) — applies to
    *every* `work_type`, not just part replacements, since a
    forgotten-to-link oil change goes stale exactly the same way.

### 3.7 Economics: Expense + P&L (`economics/`)

- **Expense**: costs that aren't fuel or driver wages. `vehicle`
  (blank = company-level overhead, shows in the dashboard P&L but
  isn't attributed to one vehicle), `category` (maintenance, tyres,
  toll, permit_fee, insurance_premium, spare_parts, other), `date`,
  `amount`, `vendor`, `notes`, `receipt`. `save()` posts to the
  vendor's payable ledger on every save via `sync_bill()`.
  Tyre/Maintenance billing auto-creates these records; the Economics
  page also creates them directly for costs with no physical-part
  angle (toll, permits, insurance).
- **P&L** (`economics/pnl.py`): `vehicle_pnl(vehicle, start, end)` —
  revenue = sum of `TripLeg.freight_amount` in range; costs = fuel
  (`FuelLog.amount`), trip-attributed driver wages/bonuses
  (`DriverLedgerEntry` linked to a trip sheet), and `Expense.amount`.
  `dashboard_pnl(start, end)` — every vehicle's breakdown ranked by
  profit, plus unattributed driver cost and unattributed expenses
  (company-level, no vehicle).

### 3.8 Operations — trip sheets, fuel, driver ledger (`operations/`) — v1, built

The current, basic version. See §6 for the designed v2 (Route + Rate
Card + multi-leg loaded/empty billing) that supersedes this.

- **TripSheet**: `vehicle`, `driver`, `date`, `opening_meter`,
  `closing_meter`, `remarks`, `status` (open/closed/cancelled).
  `close(closing_meter)` sets status to closed and rolls the reading
  forward onto `Vehicle.current_meter` (only forward — never backward,
  and only if greater than the current reading).
  `total_freight` = sum of its legs' `freight_amount`.
- **TripLeg**: `trip_sheet`, `sequence`, `from_place`, `to_place`,
  `consignor` (free text — no Consignor master exists yet, see §4.2),
  `lr_number` (lorry receipt), `freight_amount` (**manually entered** —
  no rate card exists yet to auto-compute it), `remarks`. No
  loaded/empty distinction, no tonnage, no route link.
- **FuelLog**: `vehicle`, `trip_sheet` (optional), `date`, `litres`,
  `rate_per_litre`, `amount` (auto-computed if blank), `odometer`,
  `fuel_station` (Vendor), `is_full_tank`. Posts to the fuel station's
  payable ledger the same way Expense does.
- **DriverLedgerEntry**: `driver`, `trip_sheet` (optional — linking
  attributes the cost to that vehicle's P&L; blank means a
  company-level cost like a monthly salary run), `date`, `entry_type`
  (advance/wage/bonus/deduction/payment), `subtype` (free text, scoped
  by the UI — `EarningSubtype`: salary/bata/overtime, or
  `DeductionSubtype`: damage/penalty/fuel_shortage), `payment_mode`,
  `amount`, `remarks`.

**Known limitation carried into v2**: `Vehicle.current_meter` is not
reliably continuous. It only advances automatically via
`TripSheet.close()`; it can also be freely overwritten on the Vehicle
edit form. Trips never routed through a closed trip sheet, or edited
directly, leave it stale. All distance-dependent logic (Tyre
`total_distance`, Maintenance due dates, GPS variance in §6.8) reads
this same field — there's one source of truth, but it isn't guaranteed
fresh. Not fixed here; worth a dedicated pass if it becomes a problem
(e.g. requiring every closed leg to reconcile against it).

---

## 4. Masters — reserved, not yet built

### 4.1 SOP (Standard Operating Procedure checklists)

No model exists. Two capabilities are already reserved in the
permission matrix (`build_sop_templates`, `complete_sop`), anticipating
this shape: an admin/accountant builds a checklist template (per
vehicle category, presumably); a driver/manager completes it
pre-trip. §6.5 assumes SOP completion is pulled into the Trip Sheet
and GPS-stamped — that dependency needs this master built first, or
built alongside.

### 4.2 Consignor

No model exists. `TripLeg.consignor` is free text today. §6.1 defines
the master needed for Route + Rate Card (§6) to have something to bill
against and post receivables to.

---

## 5. Reporting & dashboard — built

- Dashboard-wide and per-vehicle P&L (§3.7).
- Compliance "needs attention" (expired + due) list, driven by
  `Document`'s custom queryset.
- Pending vendor payments (`is_paid=False` across Expense/FuelLog/
  TyreService/MaintenanceLog, filtered to entries with a real vendor —
  unlisted-vendor entries are excluded, since there's no payable to
  chase).
- Driver ledger passbook (running balance, credit/debit by entry type).
- Vendor ledger passbook (same shape, mirrored).
- Tyre position map + per-tyre/per-vehicle service history, with
  replacement lineage shown both directions ("replaced by X" / "replaced
  Y — reason").
- Maintenance schedule due list (overdue count, next-due km/date).

---

## 6. Route + Rate Card + Trip Sheet v2 — designed, not yet built

The next major piece: turns trip entry from manual freight typing into
pick-route-and-go, and models a real haul as what it actually is — a
chain of loaded and empty legs, not one A→B line.

### 6.1 Consignor (new master)

Who freight is billed to. `name`, contact fields, billing address,
GSTIN, and whatever receivables need (credit terms/limit, TBD at build
time). Same `BaseModel` conventions as every other master (retire, not
delete; audited).

### 6.2 Route (new master)

A named corridor: `from_place`, `to_place`, **standard distance**
(the reference km/hours a leg on this route is expected to run — this
is what the GPS-actual variance check in §6.8 compares against).
Routes are reusable across many trips and many rate cards.

### 6.3 Rate Card (new master)

The thing that makes trip entry fast: pick a route (+ consignor, on the
trip sheet) and the rate resolves automatically.

- **Rate basis** (pick one per rate): `per_km`, `per_ton`, `per_trip`,
  or `fixed`. Determines how freight is computed for a loaded leg:
  - `per_km`: rate × loaded km.
  - `per_ton`: rate × tonnage carried (e.g. ₹1,200 × 18 t).
  - `per_trip` / `fixed`: a flat figure regardless of distance/weight.
- **Resolution**: a rate is scoped to a route, optionally further
  scoped to a specific consignor. **Consignor-specific overrides the
  default; nearest match wins** — i.e. look for
  (route, consignor)-specific first, fall back to (route, no
  consignor)-default.
- **Versioning**: rate changes are versioned by an effective-from date,
  not edited in place. A trip always bills at the rate version that was
  active on its date — past trips keep the rate they were actually
  billed at even after the card changes. Deactivating a rate (not
  deleting it) removes it from future resolution without touching
  history.
- References the load-pattern/leg concept below — a rate applies to a
  **loaded** leg; empty legs never bill (§6.4).

### 6.4 Load patterns & multi-leg journeys

The real-world case this whole design exists for: a lorry runs loaded
one way and often comes back empty (or the journey is a longer chain
across several pickup/drop points), and both revenue and cost
accounting have to reflect that honestly.

- A journey is modelled as an **ordered list of legs**, each tagged
  **loaded** or **empty** (deadhead) — not a single origin→destination
  line. Example: loaded A→B, empty reposition B→C, loaded C→D — no
  forcing, no special-casing; it's just three rows.
- **Only loaded legs earn.** Each loaded leg records its own load
  status, tonnage (for `per_ton` rates), distance, and can bill a
  *different consignor at its own rate* — posting to that consignor's
  receivable independently of the other legs in the same trip.
- **Empty legs are costed, never billed.** They still burn fuel and
  wear, so they're real cost — never hidden.
- **Cost spreads over total distance** (loaded + empty combined) for
  the trip/vehicle. Profit = total freight (loaded legs only) − cost
  over the whole journey. An empty leg correctly pulls cost-per-km up
  and margin down — that's the honest number, not a bug to paper over.
- **Splitting into legs**: GPS gives one continuous distance; marking
  the pickup/drop points splits it into legs (manually, or
  auto-split by detected stops — TBD at build time), reconciled
  against the odometer the same way §6.8 does for a single leg.

### 6.5 Trip Sheet v2 (the daily-ops screen)

Supersedes §3.8's `TripSheet`/`TripLeg` — the screen the fleet lives in
daily, pulling together legs, meter, fuel, expenses, SOP, and the day's
P&L in one place.

- **Header**: vehicle, driver, date, opening/closing meter (as today).
- **Legs table**: ordered, each row = one leg (loaded/empty, route,
  consignor, tonnage, distance, rate resolved from §6.3, computed
  freight). Loaded legs bill; empty legs don't (§6.4).
- **Fuel**: linked `FuelLog` entries — gives mileage (km/l) and fuel
  cost/km, posts as cost.
- **Expenses**: toll, loading, bata, etc. — post as cost; vendor-linked
  ones hit vendor payables the same way Expense already does (§3.7).
- **SOP**: pre-trip checklist completion pulled in and GPS-stamped
  (depends on §4.1 existing).
- **Day P&L summary**: freight (loaded legs) minus fuel, expenses,
  driver cost for this sheet — a preview of what §3.7's `vehicle_pnl`
  will aggregate once posted.

### 6.6 Approval gate: Draft → Submit → Approve

The one thing worth locking down: **only approved sheets post to the
P&L and ledgers.** A driver can fill and submit, but the numbers only
count once verified — this is what stops an unverified entry from
silently moving money.

On **approval**, the sheet is the single entry that fans out across the
whole system:

- Each loaded leg posts its freight to that consignor's receivable and
  to revenue.
- Fuel posts as cost (and updates mileage stats).
- Expenses post as cost; vendor-linked ones hit vendor payables.
- Driver earnings (per-trip/day, per `wage_basis`) drop into
  `DriverLedgerEntry` automatically.
- Closing meter updates `Vehicle.current_meter` — which is what every
  usage-based reminder (service due, SOP interval, tyre rotation)
  advances against.
- SOP completion is attached to the record permanently.

Before approval (draft/submitted), none of this has happened yet —
the sheet exists but has posted nothing.

### 6.7 JCB / Tractor work-sheet variant

For `HOURS_CATEGORIES` vehicles (§3.1), the same screen renders
differently: hour-meter start/end instead of odometer, site and
operator instead of route/legs, per-hour billing, no loaded/empty leg
concept at all (a JCB doesn't haul freight leg-to-leg the way a lorry
does).

### 6.8 GPS reconciliation

The route's standard distance (§6.2) cross-checks against the GPS
actual for the leg. A large variance flags a likely detour or a short
trip — a review signal, not a hard block.

### 6.9 Reporting this unlocks

- **Empty-running %** = empty km ÷ total km, per vehicle/route/period —
  the number that says whether lorries are dead-heading too much.
- **Revenue per loaded km** — profitability per km actually earning,
  as distinct from the (lower, more honest) revenue per total km.
- Switching a route to a **return-load pattern** (both legs loaded) is
  the lever these two numbers exist to justify — and the rate card
  already supports pricing that pattern like any other route.
- Both extend the existing `economics.pnl` module rather than
  replacing it — v2 trip legs feed the same `revenue`/`net_profit`
  shape §3.7 already computes, with loaded/empty split added.

### 6.10 Suggested build order

1. Consignor (§4.1) — nothing else in this section can post a
   receivable without it.
2. Route + Rate Card (§6.2–6.3), including versioning and the
   nearest-match resolution — a master layer, no trip-sheet changes
   yet.
3. Extend `TripLeg` with load status, tonnage, route/consignor/rate
   links, and auto-computed freight (replacing the manual
   `freight_amount` entry) — keep `TripSheet.status` as-is for now.
4. Approval gate (§6.6) + the post-on-approval fan-out — the highest-
   risk piece, since it touches revenue, payables, driver pay, and the
   vehicle odometer in one transaction; build and test this in
   isolation before wiring the UI to it.
5. JCB/tractor work-sheet variant (§6.7) and GPS reconciliation (§6.8)
   — additive, don't block on either for 1–4 to ship.
6. Empty-running % / revenue-per-loaded-km reporting (§6.9) — reads
   off data §3–4 already produces once approved.
