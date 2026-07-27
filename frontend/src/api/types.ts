export type Role = 'owner' | 'admin' | 'manager' | 'driver' | 'accountant';

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  organization: string | null;
  organization_name: string | null;
  driver_id: string | null;
}

export const VEHICLE_CATEGORIES = ['lorry', 'four_wheeler', 'car', 'two_wheeler', 'tractor', 'jcb'] as const;
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
] as const;

export interface Vehicle {
  id: string;
  registration_number: string;
  category: string;
  usage: string;
  metering_unit: string;
  tracking_mode: 'gps' | 'manual';
  rc_valid_till: string | null;
  maker: string;
  model: string;
  mfg_year: number | null;
  fuel_type: string;
  fleet_id: string;
  current_meter: string | null;
  meter_reading_date: string | null;
  status: 'active' | 'in_service' | 'sold' | 'scrapped';
  number_of_tyres: number;
  spare_tyres: number;
  axle_layout: string;
}

export type VehicleInput = Omit<Vehicle, 'id' | 'status' | 'metering_unit'>;

export const LICENCE_CLASSES = ['lmv', 'hmv', 'htv', 'multiple'] as const;
export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'temporary'] as const;
export const WAGE_BASES = ['monthly', 'per_trip', 'per_day'] as const;

export interface Driver {
  id: string;
  code: string;
  name: string;
  mobile: string;
  licence_number: string;
  licence_class: string;
  licence_valid_till: string | null;
  badge_number: string;
  badge_valid_till: string | null;
  employment_type: string;
  wage_basis: string;
  wage_amount: string | null;
  status: 'active' | 'on_leave' | 'relieved';
  photo: string | null;
  licence_copy: string | null;
  id_proof: string | null;
}

export type DriverInput = Omit<Driver, 'id' | 'status' | 'photo' | 'licence_copy' | 'id_proof'>;

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

export const LEDGER_ENTRY_TYPES = ['advance', 'wage', 'bonus', 'deduction'] as const;

export interface DriverLedgerEntry {
  id: string;
  driver: string;
  trip_sheet: string | null;
  date: string;
  entry_type: string;
  amount: string;
  remarks: string;
}

export type DriverLedgerEntryInput = Omit<DriverLedgerEntry, 'id'>;

export interface TripLeg {
  id: string;
  trip_sheet: string;
  sequence: number;
  from_place: string;
  to_place: string;
  consignor: string;
  lr_number: string;
  freight_amount: string;
  remarks: string;
}

export type TripLegInput = Omit<TripLeg, 'id'>;

export interface TripSheet {
  id: string;
  vehicle: string;
  driver: string;
  date: string;
  opening_meter: string;
  closing_meter: string | null;
  status: 'open' | 'closed' | 'cancelled';
  remarks: string;
  legs: TripLeg[];
  distance_covered: string | null;
  total_freight: string;
  created_at: string;
  updated_at: string;
}

export type TripSheetInput = {
  vehicle: string; driver: string; date: string; opening_meter: string; remarks: string;
};

export interface FuelLog {
  id: string;
  vehicle: string;
  trip_sheet: string | null;
  date: string;
  litres: string;
  rate_per_litre: string;
  amount: string;
  odometer: string | null;
  fuel_station: string;
  is_full_tank: boolean;
}

export type FuelLogInput = Omit<FuelLog, 'id' | 'amount'>;

export const EXPENSE_CATEGORIES = [
  'maintenance', 'tyres', 'toll', 'permit_fee', 'insurance_premium', 'spare_parts', 'other',
] as const;

export interface Expense {
  id: string;
  vehicle: string | null;
  category: string;
  date: string;
  amount: string;
  vendor: string;
  notes: string;
  created_at: string;
}

export type ExpenseInput = Omit<Expense, 'id' | 'created_at'>;

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
  odometer_at_fitting: string | null;
  notes: string;
  status: 'fitted' | 'spare' | 'retired';
}

// Status is writable for fitted/spare only - retiring goes through the
// dedicated retire action (DELETE), which the backend enforces.
export type TyreInput = Omit<Tyre, 'id' | 'status'> & { status: 'fitted' | 'spare' };

export const TYRE_SERVICE_TYPES = [
  'alignment', 'rotation', 'balancing', 'puncture_repair', 'replacement', 'inspection',
] as const;

export interface TyreService {
  id: string;
  vehicle: string;
  tyre: string | null;
  service_type: string;
  date: string;
  odometer: string | null;
  tread_depth_in: string | null;
  new_position: string;
  vendor: string;
  notes: string;
}

export type TyreServiceInput = Omit<TyreService, 'id'>;

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

export interface MaintenanceLog {
  id: string;
  vehicle: string;
  schedule: string | null;
  part_name: string;
  date: string;
  odometer: string | null;
  vendor: string;
  notes: string;
}

export type MaintenanceLogInput = Omit<MaintenanceLog, 'id'>;
