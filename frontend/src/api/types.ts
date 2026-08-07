export type Role = 'owner' | 'admin' | 'manager' | 'driver' | 'accountant';

export const PERMISSION_SECTIONS = [
  'vehicles', 'drivers', 'expenses', 'trip_work_cards', 'fuel_log',
  'money_box_settlement', 'reports', 'customers_vendors', 'company_users',
] as const;
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];
export type PermissionAction = 'view' | 'add_edit' | 'change_status';
export type PermissionGrid = Record<PermissionSection, Record<PermissionAction, boolean>>;

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  organization: string | null;
  organization_name: string | null;
  driver_id: string | null;
  is_active: boolean;
  is_superuser: boolean;
  organization_disabled_modules: string[];
  // The caller's own resolved section x action grid - see
  // core.permissions.effective_permissions. Drives nav/button gating
  // without a separate round-trip.
  permissions: PermissionGrid;
  // Only present on the /auth/me/ response (not the login response) - see
  // core.views.MeView.
  impersonating?: boolean;
}

export type AppUser = CurrentUser;

export interface UserCreateInput {
  username: string;
  email: string;
  password: string;
  role: Role;
  driver_id?: string | null;
}

export interface UserUpdateInput {
  role?: Role;
  is_active?: boolean;
  driver_id?: string | null;
}

// A singleton per organization - the tenant's own record, not a list like
// Vehicle/Driver. 1 = January ... 12 = December (4 = April, the Indian FY
// default already set server-side).
export interface CompanyProfile {
  legal_name: string;
  entity_type: string;
  logo: string | null;
  gstin: string;
  pan: string;
  tan: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  fy_start_month: number;
  updated_at: string;
}

export type CompanyProfileInput = Omit<CompanyProfile, 'logo' | 'updated_at'>;

export interface AuditLogEntry {
  id: string;
  user: { id: string; username: string } | null;
  action: 'create' | 'update' | 'retire' | 'login';
  model_name: string;
  object_id: string;
  changes: Record<string, [string, string]>;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// tipper/rig already exist on the backend (vehicles.models.Category) but
// were never added here, so they were unselectable in this picker.
export const VEHICLE_CATEGORIES = [
  'lorry', 'tipper', 'four_wheeler', 'car', 'two_wheeler', 'tractor', 'jcb', 'rig',
] as const;
export const VEHICLE_USAGE = ['commercial', 'private'] as const;
export const TRACKING_MODES = ['manual', 'gps'] as const;
export const FUEL_TYPES = ['diesel', 'petrol', 'cng', 'lpg', 'electric'] as const;
export const AXLE_LAYOUTS = [
  { value: 'lorry_6', label: 'Lorry · 6-wheeler' },
  { value: 'lorry_10', label: 'Lorry · 10-wheeler' },
  { value: 'lorry_12', label: 'Lorry · 12-wheeler' },
  { value: 'lorry_14', label: 'Lorry · 14-wheeler' },
  { value: 'lorry_16', label: 'Lorry · 16-wheeler' },
  { value: 'car_4_1', label: 'Car · 4 + 1' },
  { value: 'two_wheeler_2', label: 'Two-wheeler · 2' },
  { value: 'tractor', label: 'Tractor · small front + big rear' },
  { value: 'tipper_6', label: 'Tipper · 6-wheeler' },
  { value: 'tipper_10', label: 'Tipper · 10-wheeler' },
  { value: 'tipper_12', label: 'Tipper · 12-wheeler' },
  { value: 'jcb_4', label: 'JCB · 4-wheel' },
  { value: 'rig_6', label: 'Rig · 6-wheeler' },
  { value: 'rig_10', label: 'Rig · 10-wheeler' },
  { value: 'four_wheeler_4_1', label: 'Four-wheeler · 4 + 1' },
] as const;

export interface Vehicle {
  id: string;
  registration_number: string;
  category: string;
  usage: string;
  metering_unit: string;
  tracking_mode: 'gps' | 'manual';
  registration_date: string | null;
  rto: string;
  chassis_number: string;
  engine_number: string;
  rc_valid_till: string | null;
  fuel_norm: string;
  rto_vehicle_class: string;
  maker: string;
  model: string;
  mfg_year: number | null;
  fuel_type: string;
  cc: number | null;
  seating_capacity: number | null;
  gvw: string | null;
  colour: string;
  owner_name: string;
  owner_relation: string;
  address: string;
  financier: string;
  hypothecation_till: string | null;
  number_of_owners: number;
  acquisition_type: 'new' | 'second_hand';
  purchase_date: string | null;
  previous_owner: string;
  ownership_transfer_date: string | null;
  // Optional - not every purchase goes through a broker.
  broker_name: string;
  broker_info: string;
  broker_commission: string | null;
  fleet_id: string;
  current_meter: string | null;
  meter_reading_date: string | null;
  purchase_price: string | null;
  status: 'active' | 'in_service' | 'sold' | 'scrapped';
  number_of_tyres: number;
  spare_tyres: number;
  axle_layout: string;
  rc_copy: string | null;
  // The reverse side of this vehicle's own RC - not conditional on
  // acquisition type, every RC has a back side.
  rc_copy_back: string | null;
  photo: string | null;
  // The previous owner's own RC, for a second-hand purchase.
  previous_rc_copy: string | null;
}

export type VehicleInput = Omit<
  Vehicle,
  'id' | 'status' | 'metering_unit' | 'rc_copy' | 'rc_copy_back' | 'photo' | 'previous_rc_copy'
>;

export const ACQUISITION_TYPES = ['new', 'second_hand'] as const;

export const VEHICLE_LOAN_PAYMENT_MODES = ['cash', 'bank', 'upi', 'cheque'] as const;

export interface VehicleLoanInstallment {
  id: string;
  loan: string;
  vehicle: string;
  registration_number: string;
  due_date: string;
  amount: string;
  paid: boolean;
  paid_date: string | null;
  payment_mode: string;
  is_overdue: boolean;
}

export interface VehicleLoan {
  id: string;
  vehicle: string;
  financier: string;
  principal_amount: string;
  // Reference/display only - not used in any P&L/cash computation (see
  // vehicles.models.VehicleLoan's docstring).
  interest_rate: string | null;
  tenure_months: number;
  emi_amount: string;
  start_date: string;
  notes: string;
  installments: VehicleLoanInstallment[];
  outstanding_installments: number;
}

export type VehicleLoanInput = Omit<
  VehicleLoan, 'id' | 'installments' | 'outstanding_installments'
>;

export const LICENCE_CLASSES = ['lmv', 'hmv', 'htv', 'multiple'] as const;
export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'temporary'] as const;
export const WAGE_BASES = ['monthly', 'per_trip', 'per_day'] as const;

export interface Driver {
  id: string;
  code: string;
  name: string;
  dob: string | null;
  mobile: string;
  emergency_contact: string;
  address: string;
  blood_group: string;
  licence_number: string;
  licence_class: string;
  licence_issue_date: string | null;
  licence_valid_till: string | null;
  issuing_rto: string;
  badge_number: string;
  badge_valid_till: string | null;
  date_of_joining: string | null;
  employment_type: string;
  wage_basis: string;
  wage_amount: string | null;
  advance_limit: string | null;
  has_app_login: boolean;
  status: 'active' | 'on_leave' | 'relieved';
  photo: string | null;
  licence_copy: string | null;
  id_proof: string | null;
}

export type DriverInput = Omit<Driver, 'id' | 'status' | 'photo' | 'licence_copy' | 'id_proof'>;

export const VENDOR_TYPES = [
  'fuel_station', 'garage', 'tyre_shop', 'parts_supplier', 'insurance_agent', 'other',
] as const;
export const VENDOR_PAYMENT_MODES = ['cash', 'bank', 'upi', 'cheque'] as const;
export const VENDOR_LEDGER_ENTRY_TYPES = ['bill', 'payment'] as const;
// A bill increases what's owed to the vendor (credit, in accounting terms -
// a payable liability grows on credit); a payment reduces it (debit).
export const VENDOR_LEDGER_CREDIT_TYPES = new Set(['bill']);

export interface Vendor {
  id: string;
  name: string;
  vendor_type: string;
  contact_person: string;
  mobile: string;
  email: string;
  address: string;
  gstin: string;
  tds_applicable: boolean;
  notes: string;
  status: 'active' | 'inactive';
}

export type VendorInput = Omit<Vendor, 'id' | 'status'>;

export interface VendorLedgerEntry {
  id: string;
  vendor: string;
  date: string;
  entry_type: string;
  payment_mode: string;
  amount: string;
  remarks: string;
}

export type VendorLedgerEntryInput = Omit<VendorLedgerEntry, 'id'>;

// The receivable-side twin of Vendor - who you bill, not who bills you.
export interface Customer {
  id: string;
  name: string;
  gstin: string;
  contact_person: string;
  mobile: string;
  email: string;
  address: string;
  notes: string;
  status: 'active' | 'inactive';
}

export type CustomerInput = Omit<Customer, 'id' | 'status'>;

export const CUSTOMER_LEDGER_ENTRY_TYPES = ['invoice', 'receipt'] as const;
// An invoice increases what's owed by the customer (credit); a receipt
// reduces it (debit) - the receivable mirror of VENDOR_LEDGER_CREDIT_TYPES.
export const CUSTOMER_LEDGER_CREDIT_TYPES = new Set(['invoice']);

export interface CustomerLedgerEntry {
  id: string;
  customer: string;
  date: string;
  entry_type: string;
  payment_mode: string;
  amount: string;
  remarks: string;
  source_model: string;
  source_id: string;
}

export type CustomerLedgerEntryInput = Omit<CustomerLedgerEntry, 'id' | 'source_model' | 'source_id'>;

export const VEHICLE_DOC_TYPES = [
  'rc', 'insurance', 'permit', 'national_permit', 'fitness', 'puc', 'road_tax', 'other',
] as const;
export const DRIVER_DOC_TYPES = [
  'licence', 'badge', 'police_verification', 'medical_certificate', 'other',
] as const;
export const DOCUMENT_TYPES = [...VEHICLE_DOC_TYPES.slice(0, -1), ...DRIVER_DOC_TYPES] as const;

export interface ComplianceDocument {
  id: string;
  vehicle: string | null;
  driver: string | null;
  holder_display: string;
  doc_type: string;
  doc_number: string;
  issue_date: string | null;
  valid_till: string | null;
  reminder_days_before: number;
  notes: string;
  file: string | null;
  is_expired: boolean;
  is_due: boolean;
  status: string;
}

export type DocumentInput = Omit<
  ComplianceDocument, 'id' | 'holder_display' | 'is_expired' | 'is_due' | 'status' | 'file'
>;

export const LEDGER_ENTRY_TYPES = [
  'advance', 'wage', 'bonus', 'deduction', 'payment', 'advance_return', 'reimbursement',
] as const;
// Wage/bonus increase what's owed to the driver (credit); advance/deduction/
// payment all reduce the running balance (debit) - advance and deduction
// reduce what they're owed, payment clears out a balance already earned.
// advance_return/reimbursement are also credits - cash the driver hands
// back (or is repaid for) reduces what they're holding, same direction as
// an earning, not a second debit. Both are auto-created by a trip sheet's
// settlement fields (see TripSheet.returned_amount/reimbursed_amount) -
// never entered directly here.
export const LEDGER_CREDIT_TYPES = new Set(['wage', 'bonus', 'advance_return', 'reimbursement']);

// subtype is a free-text CharField on the backend (its meaning depends on
// entry_type), these are just the values the UI offers per entry_type.
export const EARNING_SUBTYPES = ['salary', 'bata', 'overtime'] as const;
export const DEDUCTION_SUBTYPES = ['damage', 'penalty', 'fuel_shortage'] as const;
export const PAYMENT_MODES = ['cash', 'bank', 'upi'] as const;

export interface DriverLedgerEntry {
  id: string;
  driver: string;
  trip_sheet: string | null;
  date: string;
  entry_type: string;
  subtype: string;
  payment_mode: string;
  amount: string;
  remarks: string;
}

export type DriverLedgerEntryInput = Omit<DriverLedgerEntry, 'id'>;

// Only meaningful for a route-card trip (vehicle.metering_unit='km') - an
// hours-vehicle trip (JCB/tractor/rig) leaves these blank and just enters
// freight_amount by hand, same as before this existed.
export const TRIP_LEG_LOAD_STATUSES = ['loaded', 'empty'] as const;
export const TRIP_LEG_BASES = ['per_km', 'per_ton', 'per_trip', 'per_load', 'fixed'] as const;

export interface TripLeg {
  id: string;
  trip_sheet: string;
  sequence: number;
  from_place: string;
  to_place: string;
  consignor: string;
  lr_number: string;
  load_status: '' | (typeof TRIP_LEG_LOAD_STATUSES)[number];
  distance_km: string | null;
  // Loaded-only - null/blank for an empty leg (see TripLeg.save() on the backend).
  customer: string | null;
  material: string;
  tonnage: string | null;
  basis: '' | (typeof TRIP_LEG_BASES)[number];
  rate: string | null;
  // Computed server-side for a route-card leg (rate×distance_km for
  // per_km, rate×tonnage for per_ton, rate flat otherwise; 0 if empty) -
  // whatever's sent here is overwritten for that trip. Still plain user
  // input for an hours-vehicle trip.
  freight_amount: string;
  remarks: string;
}

export type TripLegInput = Omit<TripLeg, 'id'>;

// The work-card's line-item kind (JCB/tractor, card_type='work') - the
// parallel of TripLeg for an hours vehicle. Always billable, no "empty" concept.
export const WORK_ITEM_BASES = ['per_hour', 'per_acre', 'per_trip', 'per_feet', 'per_bore', 'fixed'] as const;

export interface WorkItem {
  id: string;
  trip_sheet: string;
  sequence: number;
  site: string;
  customer: string | null;
  work_type: string;
  basis: '' | (typeof WORK_ITEM_BASES)[number];
  qty: string | null;
  rate: string | null;
  // Both optional but required together - how much of qty was overtime,
  // and what it's billed at. Explicit, not derived from a guessed
  // daily-hours threshold.
  overtime_qty: string | null;
  overtime_rate: string | null;
  // A floor - if the computed amount comes in under this, it's billed at
  // this instead (e.g. a short job still costs a minimum call-out).
  min_billable: string | null;
  // Computed server-side: (qty−overtime_qty)×rate + overtime_qty×overtime_rate,
  // floored at min_billable - never hand-entered.
  amount: string;
  remarks: string;
}

export type WorkItemInput = Omit<WorkItem, 'id' | 'amount'>;

// Optional, separate rate masters - a leg/work item always stores its own
// rate regardless of whether a matching card exists (see
// lib/rateResolution.ts for how a card auto-fills one, and the "remember"
// write-back that creates these). Dated (effective_date), not a single
// current value - resolving picks the most recent card on or before the
// leg/item's own date, so an old trip still bills at the rate that applied then.
export interface RouteRate {
  id: string;
  from_place: string;
  to_place: string;
  customer: string | null;
  material: string;
  basis: (typeof TRIP_LEG_BASES)[number];
  rate: string;
  load_pattern: string;
  effective_date: string;
}

export type RouteRateInput = Omit<RouteRate, 'id'>;

export interface WorkRate {
  id: string;
  equipment: string;
  work_type: string;
  customer: string | null;
  basis: (typeof WORK_ITEM_BASES)[number];
  rate: string;
  min_billable: string | null;
  overtime_rate: string | null;
  effective_date: string;
}

export type WorkRateInput = Omit<WorkRate, 'id'>;

// Decides how an expense feeds reconciliation: only 'advance' counts against
// the cash handed over; 'company_direct' is a company cost excluded from
// that cash math; 'driver_own' becomes a reimbursement owed to the driver.
export const TRIP_EXPENSE_PAID_FROM = ['advance', 'company_direct', 'driver_own'] as const;

export interface TripAdvance {
  id: string;
  trip_sheet: string;
  amount: string;
  given_by: string;
  date: string;
  payment_mode: string;
  remarks: string;
  // The DriverLedgerEntry this advance auto-created - system-maintained.
  ledger_entry: string | null;
}

export type TripAdvanceInput = Omit<TripAdvance, 'id' | 'ledger_entry'>;

export interface TripExpense {
  id: string;
  trip_sheet: string;
  expense_head: string;
  paid_from: (typeof TRIP_EXPENSE_PAID_FROM)[number];
  amount: string;
  vendor: string | null;
  // Only meaningful (and required server-side) when the picked expense_head's
  // slug is 'fuel' - lets a fuel entry post a real Fuel Log row instead of a
  // lump-sum cost.
  litres: string | null;
  rate_per_litre: string | null;
  notes: string;
  date: string;
  // System-maintained: whichever downstream record this posted to (see
  // operations.services.sync_trip_expense_posting) - at most one is ever set.
  fuel_log: string | null;
  expense: string | null;
}

export type TripExpenseInput = Omit<TripExpense, 'id' | 'fuel_log' | 'expense'>;

export interface TripSheet {
  id: string;
  vehicle: string;
  driver: string;
  trip_no: string;
  date: string;
  opening_meter: string;
  closing_meter: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'closed' | 'cancelled';
  remarks: string;
  legs: TripLeg[];
  work_items: WorkItem[];
  distance_covered: string | null;
  total_freight: string;
  // Which face this trip wears - derived from the vehicle's metering unit,
  // not stored. Route legs (card_type='route') and work items
  // (card_type='work') are mutually exclusive line-item kinds.
  card_type: 'route' | 'work';
  total_km: string;
  loaded_km: string;
  empty_km: string;
  empty_running_pct: string | null;
  // Only meaningful for card_type='work' - the productive hours out of
  // distance_covered (that's the vehicle's total engine hours for an
  // hours-vehicle, already generic/unit-agnostic).
  working_hours: string | null;
  idle_hours: string | null;
  idle_pct: string | null;
  // Set once this trip sheet's per-trip wage has been recorded - the
  // DriverLedgerEntry it auto-created (see wage_amount). Never set for a
  // monthly/per-day driver, whose pay isn't tied to any one trip sheet.
  wage_entry: string | null;
  wage_amount: string | null;
  // The money box - every rupee given to the driver, spent, and returned
  // has to reconcile before this trip can be approved (see is_reconciled).
  advances: TripAdvance[];
  trip_expenses: TripExpense[];
  total_advance: string;
  expenses_paid_from_advance: string;
  driver_own_expenses_total: string;
  company_direct_expenses_total: string;
  reconciliation_variance: string;
  is_reconciled: boolean;
  reimbursement_due: string;
  returned_amount: string | null;
  returned_received_by: string;
  returned_date: string | null;
  reimbursed_amount: string | null;
  reimbursed_date: string | null;
  // Only ever set by the approve_close action, when forcing through a trip
  // that doesn't reconcile - who did it and why.
  reconciliation_override_reason: string;
  // Server-computed read-side mirror of TripSheetTransitionPermission's
  // rules - don't re-derive these from the permissions grid, a manager's
  // role default for trip_work_cards/change_status is already true for
  // unrelated reasons (see the backend serializer's docstring).
  can_submit: boolean;
  can_approve_close: boolean;
  can_cancel: boolean;
  created_at: string;
  updated_at: string;
}

export type TripSheetInput = {
  vehicle: string; driver: string; date: string; opening_meter: string; remarks: string;
  // Required only when the selected driver is paid per-trip (see
  // drivers.WAGE_BASES) - there's no fixed wage_amount on the Driver to
  // fall back on for them, so it's entered fresh for this trip.
  driver_wage_amount?: string;
};

// Settlement fields are patched onto an existing trip sheet independently of
// the rest of TripSheetInput - a separate, narrower shape so the settlement
// form doesn't have to carry (or accidentally clobber) vehicle/driver/date.
export type TripSettlementInput = Partial<
  Pick<TripSheet, 'returned_amount' | 'returned_received_by' | 'returned_date' | 'reimbursed_amount' | 'reimbursed_date'>
>;

// Same idea as TripSettlementInput, but for the work-card's hours tracking.
export type TripHoursInput = Partial<Pick<TripSheet, 'working_hours'>>;

export type FuelLogStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface FuelLog {
  id: string;
  vehicle: string;
  // Required going forward (FuelLogSerializer.validate()) - nullable only
  // because pre-existing rows with no trip sheet had no reliable way to
  // backfill who it was for.
  driver: string | null;
  // Who physically filled the tank - the driver above, or a company person
  // on their behalf. Free text, required going forward (same nullable-in-
  // the-DB-but-required-at-the-API-layer idiom as driver above). Distinct
  // from created_by below, which is who entered this record in the app,
  // not who was at the pump.
  filled_by: string;
  trip_sheet: string | null;
  date: string;
  litres: string;
  rate_per_litre: string;
  amount: string;
  odometer: string | null;
  fuel_station: string | null;
  is_full_tank: boolean;
  // null = no fuel station set (not applicable); otherwise derived from the
  // vendor ledger, not stored on this record.
  is_paid: boolean | null;
  // Open -> Submitted -> Approved/Rejected, terminal. Read-only, set only
  // via the submit/approve/reject actions (api/operations.ts).
  status: FuelLogStatus;
  approval_note: string;
  // Read-only - who entered this record in the app, already tracked
  // generically by every model (BaseModel.created_by), just exposed here.
  created_by: string | null;
}

export type FuelLogInput = Omit<
  FuelLog, 'id' | 'amount' | 'is_paid' | 'status' | 'approval_note' | 'created_by'
>;

// Masters -> Expense: the pick-list trip/work cards and maintenance draw
// from. Flat - name + group only, no active/inactive toggle, no delete.
export const EXPENSE_HEAD_GROUPS = ['running', 'load', 'tyre_service', 'repairs'] as const;
export type ExpenseHeadGroup = (typeof EXPENSE_HEAD_GROUPS)[number];

export interface ExpenseHead {
  id: string;
  name: string;
  group: ExpenseHeadGroup;
  slug: string;
}

export type ExpenseHeadInput = Omit<ExpenseHead, 'id'>;

export type ExpenseSource = 'direct' | 'tyre_service' | 'maintenance' | 'trip' | 'parts';

// Granular origin - which of the two independent syncs on a Tyre Service or
// Maintenance Log posted this row, distinct from the coarse `source` above.
// '' = direct entry. Used to build a real link back to the source record
// (see ExpenseSourceBadge) - `source` alone can't tell a labour charge from
// a new-part/tyre purchase, both show as the same coarse category.
export type ExpenseSourceType =
  | ''
  | 'trip_expense'
  | 'tyre_service_labour'
  | 'tyre_purchase'
  | 'maintenance_labour'
  | 'maintenance_part'
  | 'parts_receipt';

export type ExpenseApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  vehicle: string | null;
  expense_head: string;
  date: string;
  amount: string;
  vendor: string | null;
  // A one-off payee not in the Vendor master - mutually exclusive with
  // vendor (see ExpenseSerializer.validate()), same idiom as
  // MaintenanceLog/TyreService/PartStockMovement's own unlisted_vendor_name.
  unlisted_vendor_name: string;
  notes: string;
  created_at: string;
  // null = no vendor set (not applicable); otherwise derived from the
  // vendor ledger, not stored on this record.
  is_paid: boolean | null;
  // Where this row was actually entered - a direct Economics-style entry,
  // or auto-posted from a tyre/maintenance/trip/parts screen. Read-only,
  // derived server-side.
  source: ExpenseSource;
  // Read-only. Set together: source_type blank means source_id is null too.
  // A row with either set is locked - see ExpenseSourceBadge/economics
  // ExpenseSerializer.validate() (the real, backend-enforced gate).
  source_type: ExpenseSourceType;
  source_id: string | null;
  // Read-only, set only via the approve/reject actions (api/economics.ts) -
  // every expense starts 'pending' regardless of source, and is terminal
  // once approved/rejected (no un-approve/un-reject path).
  approval_status: ExpenseApprovalStatus;
  approval_note: string;
}

export type ExpenseInput = Omit<
  Expense,
  'id' | 'created_at' | 'is_paid' | 'source' | 'source_type' | 'source_id'
  | 'approval_status' | 'approval_note'
>;

export interface VehiclePnL {
  vehicle_id: string;
  registration_number: string;
  period: { start: string; end: string };
  revenue: number;
  fuel_cost: number;
  driver_cost: number;
  other_expenses: number;
  net_profit: number;
}

export interface DashboardPnL {
  period: { start: string; end: string };
  totals: {
    revenue: number;
    fuel_cost: number;
    driver_cost: number;
    other_expenses: number;
    unattributed_driver_cost: number;
    unattributed_expenses: number;
    net_profit: number;
  };
  by_vehicle: VehiclePnL[];
}

export interface Tyre {
  id: string;
  vehicle: string;
  position: string;
  brand: string;
  size: string;
  serial_number: string;
  fitted_date: string | null;
  purchase_date: string | null;
  purchase_price: string | null;
  // Odometer at the start of the *current* fitted stint only - null
  // whenever not currently fitted. Don't use this alone for "how far has
  // this tyre gone" (see total_distance).
  odometer_at_fitting: string | null;
  // System-maintained running total of every earlier, now-closed stint -
  // never user-editable (see Tyre.save() on the backend).
  accumulated_distance: string;
  // The number to actually show/use: accumulated_distance plus the open
  // stint if currently fitted. Survives rotations, spare stints, and
  // re-fitting without resetting - null only if this tyre has never once
  // been fitted.
  total_distance: string | null;
  notes: string;
  status: 'fitted' | 'spare' | 'retired';
}

// Status is writable for fitted/spare only - retiring goes through the
// dedicated retire action (DELETE), which the backend enforces.
// accumulated_distance/total_distance are read-only/computed - never sent.
export type TyreInput =
  Omit<Tyre, 'id' | 'status' | 'accumulated_distance' | 'total_distance'> & { status: 'fitted' | 'spare' };

export const TYRE_SERVICE_TYPES = [
  'alignment', 'rotation', 'balancing', 'puncture_repair', 'replacement', 'inspection',
] as const;

// The generic "Log service" form's type dropdown deliberately excludes
// "replacement" - replacing a tyre always goes through the dedicated
// Replace-tyre action (see ReplaceTyreModal / replaceTyre()), the only
// entry point that can supply the previous_tyre/removal_reason a
// replacement requires (TyreServiceSerializer.validate()).
export const LOGGABLE_SERVICE_TYPES = TYRE_SERVICE_TYPES.filter((t) => t !== 'replacement');

export const TYRE_REMOVAL_REASONS = ['worn_out', 'puncture', 'sidewall_damage', 'uneven_wear', 'other'] as const;

// Where the incoming tyre on a replacement came from - mirrors
// PART_SOURCES/MaintenanceLog.part_source. See TyreService.tyre_source on
// the backend for the full rationale.
export const TYRE_SOURCES = ['new_purchase', 'from_spare'] as const;

// Every logged service must say whether it cost money (paid, via a linked
// Expense) or was done in-house (internal, with a required note on who) -
// there's no default, so a service can never silently end up unbilled and
// unexplained. Mirrored on the backend by TyreServiceBilling/MaintenanceLogBilling.
export const SERVICE_BILLING_OPTIONS = ['paid', 'done_internally'] as const;

// Who actually did the work - required alongside billing, not instead of
// it. 'external' forces billing='paid' (see *Serializer.validate() on the
// backend) so an outside person's labour can never be logged as "done
// internally" just because the vendor/amount fields were left blank.
export const SERVICE_PERFORMER_OPTIONS = ['internal', 'external'] as const;

export interface TyreService {
  id: string;
  vehicle: string;
  tyre: string | null;
  // Set only for service_type='replacement' - the tyre this one replaced.
  previous_tyre: string | null;
  removal_reason: string;
  removal_odometer: string | null;
  removal_tread_depth_in: string | null;
  service_type: string;
  date: string;
  odometer: string | null;
  tread_depth_in: string | null;
  new_position: string;
  vendor: string | null;
  // Fallback for a one-off purchase from a shop not in the Vendor master -
  // mutually exclusive with `vendor`. No payable ledger entry results (no
  // Vendor row to post against); the name still ends up on the linked
  // Expense's notes so it's not lost. See TyreServiceSerializer.validate().
  unlisted_vendor_name: string;
  // Required alongside billing - 'external' forces billing='paid' (see
  // SERVICE_PERFORMER_OPTIONS). This is what actually closes the loophole:
  // naming an outside worker in service_person_name doesn't by itself mean
  // they were paid.
  performed_by: '' | 'internal' | 'external';
  // Who actually did the work - distinct from `vendor`/`unlisted_vendor_name`
  // (who got paid, not necessarily who showed up), and also used when
  // performed_by='internal' (the in-house mechanic). Optional - a shop
  // won't always give a name, so this is never enforced.
  service_person_name: string;
  service_person_mobile: string;
  notes: string;
  billing: '' | 'paid' | 'done_internally';
  internal_note: string;
  expense: string | null;
  expense_amount: string | null;
  // Derived from the vendor ledger (see Expense.is_paid) - null when
  // billing isn't "paid", OR when it's paid to an unlisted vendor (no
  // payable ledger exists for it to be pending/settled against).
  is_paid: boolean | null;
  // Read-only passthrough of the linked Expense's own approval_status - null
  // when there's no linked Expense at all (billing isn't "paid").
  expense_approval_status: ExpenseApprovalStatus | null;
  // The incoming tyre's own payment - only set for service_type='replacement',
  // entirely independent of vendor/billing/amount above (the fitting/labour
  // charge). Buying the tyre and paying whoever fitted it are two separate
  // obligations, even when it's the same shop - see TyreService.tyre_vendor
  // on the backend.
  tyre_source: '' | 'new_purchase' | 'from_spare';
  tyre_vendor: string | null;
  tyre_unlisted_vendor_name: string;
  tyre_expense: string | null;
  tyre_expense_amount: string | null;
  is_tyre_paid: boolean | null;
  tyre_expense_approval_status: ExpenseApprovalStatus | null;
}

// `amount`/`tyre_amount` are write-only on the backend (what the linked
// Expense should cost) - never present on a read TyreService, only accepted
// on save. `expense` stays writable here (unlike MaintenanceLogInput) so a
// bulk rotation/balancing visit can point every one of its several
// TyreService rows at the single Expense the first row created, instead of
// billing once per tyre - see TyreServiceForm's bulk submit path.
// previous_tyre/removal_* are optional here (unlike on the read TyreService)
// because the ordinary "Log service" create path never sets them - only
// ReplaceTyreModal, via the dedicated replace_tyre action, does.
export type TyreServiceInput = Omit<
  TyreService,
  'id' | 'expense_amount' | 'is_paid' | 'expense_approval_status' | 'previous_tyre' | 'removal_reason'
  | 'removal_odometer' | 'removal_tread_depth_in' | 'tyre_expense' | 'tyre_expense_amount' | 'is_tyre_paid'
  | 'tyre_expense_approval_status'
> & {
  amount?: string;
  tyre_amount?: string;
  previous_tyre?: string | null;
  removal_reason?: string;
  removal_odometer?: string | null;
  removal_tread_depth_in?: string | null;
};

// Payload for POST /tyre-services/replace_tyre/ - a distinct shape from
// TyreServiceInput because it drives two Tyre mutations plus one TyreService
// creation atomically (see tyres.views.TyreServiceViewSet.replace_tyre),
// not a plain TyreService create.
export interface TyreReplacementInput {
  previous_tyre: string;
  disposition: 'retired' | 'spare';
  removal_reason: string;
  removal_odometer?: string | null;
  removal_tread_depth_in?: string | null;
  date: string;
  odometer?: string | null;
  tread_depth_in?: string | null;
  promote_tyre?: string | null;
  new_brand?: string;
  new_size?: string;
  new_serial_number?: string;
  new_purchase_date?: string | null;
  new_purchase_price?: string | null;
  new_notes?: string;
  vendor?: string | null;
  unlisted_vendor_name?: string;
  performed_by: '' | 'internal' | 'external';
  service_person_name?: string;
  service_person_mobile?: string;
  notes?: string;
  billing: '' | 'paid' | 'done_internally';
  internal_note?: string;
  amount?: string;
  // The incoming tyre's own payment - only meaningful when promote_tyre is
  // blank (a brand-new tyre, not a promoted spare); the backend derives
  // tyre_source itself from whether promote_tyre was set, so there's no
  // separate field to send for that. See TyreReplacementResult.service.tyre_vendor.
  tyre_vendor?: string | null;
  tyre_unlisted_vendor_name?: string;
  tyre_amount?: string;
}

export interface TyreReplacementResult {
  service: TyreService;
  new_tyre: Tyre;
  previous_tyre: Tyre;
}

export interface MaintenanceSchedule {
  id: string;
  vehicle: string;
  part_name: string;
  interval_km: number | null;
  interval_days: number | null;
  last_done_date: string | null;
  last_done_odometer: string | null;
  notes: string;
  status: 'active' | 'inactive';
  next_due_km: string | null;
  next_due_date: string | null;
  km_remaining: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
}

export type MaintenanceScheduleInput = Omit<
  MaintenanceSchedule, 'id' | 'status' | 'next_due_km' | 'next_due_date' | 'km_remaining' | 'days_remaining' | 'is_overdue'
>;

// Every logged service says whether a physical part came off the vehicle
// (required, no default - see MaintenanceLog.work_type). Oil/coolant/
// grease top-ups and labour-only jobs are "consumable" and skip the
// part-tracking fields below entirely; anything else must account for the
// old part - a disposal plan plus a part number and/or photo.
export const MAINTENANCE_WORK_TYPES = ['part_replacement', 'consumable'] as const;
export const PART_DISPOSAL_PLANS = ['returned_to_vendor', 'scrapped', 'kept_as_spare', 'handed_to_owner', 'other'] as const;
// Where the *incoming* part on a replacement came from - the mirror of
// disposal_plan, which accounts for the outgoing one. See
// MaintenanceLog.part_source on the backend for the full rationale.
export const PART_SOURCES = ['new_purchase', 'from_inventory'] as const;

export interface MaintenanceLog {
  id: string;
  vehicle: string;
  schedule: string | null;
  part_name: string;
  date: string;
  odometer: string | null;
  vendor: string | null;
  // Fallback for a one-off purchase from a shop not in the Vendor master -
  // mutually exclusive with `vendor`. See TyreService.unlisted_vendor_name
  // for the full rationale; same pattern here.
  unlisted_vendor_name: string;
  // Required alongside billing - 'external' forces billing='paid' (see
  // SERVICE_PERFORMER_OPTIONS) - closes the loophole where an outside
  // worker could be named in service_person_name while billing was left
  // at "done internally", meaning nobody was actually paid.
  performed_by: '' | 'internal' | 'external';
  // Who actually did the work - distinct from `vendor`/`unlisted_vendor_name`
  // (who got paid, not necessarily who showed up), and also used when
  // performed_by='internal' (the in-house mechanic). Optional - a shop
  // won't always give a name, so this is never enforced.
  service_person_name: string;
  service_person_mobile: string;
  notes: string;
  billing: '' | 'paid' | 'done_internally';
  internal_note: string;
  expense: string | null;
  expense_amount: string | null;
  is_paid: boolean | null;
  // Read-only passthrough of the linked Expense's own approval_status - null
  // when there's no linked Expense at all (billing isn't "paid").
  expense_approval_status: ExpenseApprovalStatus | null;
  work_type: '' | 'part_replacement' | 'consumable';
  old_part_number: string;
  // URL of the stored file once read back from the API - never set directly;
  // uploading a new one goes through MaintenanceLogFiles (see api/maintenance.ts).
  old_part_photo: string | null;
  disposal_plan: string;
  part_source: '' | 'new_purchase' | 'from_inventory';
  // Set only when part_source='from_inventory' - which stocked part this
  // replacement drew down, and how many units.
  inventory_item: string | null;
  inventory_item_name: string | null;
  part_quantity: string | null;
  // The ISSUE movement this created against the inventory item - read-only,
  // system-maintained (see MaintenanceLog.inventory_movement on the backend).
  inventory_movement: string | null;
  // The PART's own payment - only used when part_source='new_purchase',
  // entirely independent of vendor/billing/amount above (the labour
  // charge). Buying the part and paying whoever fitted it are two separate
  // obligations, even when it's the same vendor - see
  // MaintenanceLog.part_vendor on the backend.
  part_vendor: string | null;
  part_unlisted_vendor_name: string;
  part_expense: string | null;
  part_expense_amount: string | null;
  is_part_paid: boolean | null;
  part_expense_approval_status: ExpenseApprovalStatus | null;
}

export type MaintenanceLogInput = Omit<
  MaintenanceLog,
  'id' | 'expense' | 'expense_amount' | 'is_paid' | 'expense_approval_status' | 'old_part_photo'
  | 'inventory_item_name' | 'inventory_movement' | 'part_expense' | 'part_expense_amount' | 'is_part_paid'
  | 'part_expense_approval_status'
> & {
  amount?: string;
  part_amount?: string;
  // Escape hatch for the backend's schedule auto-match check (see
  // MaintenanceLogSerializer.validate()) - explicitly says "yes, I see the
  // matching schedule, this genuinely isn't that part."
  confirm_no_schedule?: boolean;
};

// Fungible spare-parts stock, bought ahead of need - distinct from a part
// bought just-in-time for one job (recorded directly on the MaintenanceLog
// that used it via part_source='new_purchase', never touching this).
// quantity_on_hand is derived server-side from the movement ledger, never a
// number the UI can set directly.
export interface PartInventoryItem {
  id: string;
  name: string;
  part_number: string;
  unit: string;
  reorder_level: string | null;
  notes: string;
  status: 'active' | 'inactive';
  quantity_on_hand: string;
}

export type PartInventoryItemInput = Omit<PartInventoryItem, 'id' | 'status' | 'quantity_on_hand'>;

export const PART_STOCK_MOVEMENT_TYPES = ['receipt', 'issue'] as const;

// One ledger line for a PartInventoryItem - a RECEIPT (a real purchase,
// cost + vendor) or an ISSUE (stock consumed by some other record, traced
// via source_model/source_id - today always a MaintenanceLog, created
// automatically, never posted directly from this UI).
export interface PartStockMovement {
  id: string;
  item: string;
  movement_type: 'receipt' | 'issue';
  date: string;
  quantity: string;
  unit_cost: string | null;
  vendor: string | null;
  unlisted_vendor_name: string;
  expense: string | null;
  source_model: string;
  source_id: string;
  notes: string;
  total_cost: string | null;
}

export type PartStockMovementInput = Omit<PartStockMovement, 'id' | 'expense' | 'total_cost'>;

// ---------------------------------------------------------------------------
// Superuser console (Developer dashboard / Control center) - see
// core.models.OPTIONAL_MODULES on the backend, the source of truth this
// list mirrors.
// ---------------------------------------------------------------------------
export const OPTIONAL_MODULES: { value: string; label: string }[] = [
  { value: 'tyres', label: 'Tyres' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'parts_inventory', label: 'Parts inventory' },
  { value: 'economics', label: 'Economics' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'customers', label: 'Customers' },
  { value: 'vehicle_expenses', label: 'Vehicle expenses' },
  { value: 'driver_ledger', label: 'Driver ledger' },
  { value: 'reports', label: 'Reports' },
  { value: 'fuel_log', label: 'Fuel log' },
];

export interface OrganizationAdmin {
  id: string;
  name: string;
  is_active: boolean;
  disabled_modules: string[];
  created_at: string;
  user_count: number;
  vehicle_count: number;
  driver_count: number;
}

export interface OrganizationCreateInput {
  name: string;
  disabled_modules: string[];
  owner: { username: string; email: string; password: string };
}

export interface SystemHealth {
  organization_count: number;
  active_organization_count: number;
  user_count: number;
  vehicle_count: number;
  driver_count: number;
  recent_audit_log: (AuditLogEntry & { organization_name: string | null })[];
}

export interface ApiKey {
  id: string;
  name: string;
  organization: string | null;
  prefix: string;
  // Only present once, on the response to the create call that made this key.
  raw_key: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface JobRun {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  summary: string;
  triggered_by: string | null;
  triggered_by_username: string | null;
}
