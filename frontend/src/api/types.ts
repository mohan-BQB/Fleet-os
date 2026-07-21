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
}

export type DriverInput = Omit<Driver, 'id' | 'status'>;

export const DOCUMENT_TYPES = [
  'rc', 'insurance', 'permit', 'national_permit', 'fitness', 'puc', 'road_tax',
  'licence', 'badge', 'police_verification', 'medical_certificate', 'other',
] as const;

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
  is_expired: boolean;
  is_due: boolean;
  status: string;
}

export type DocumentInput = Omit<
  ComplianceDocument, 'id' | 'holder_display' | 'is_expired' | 'is_due' | 'status'
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
