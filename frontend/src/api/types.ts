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
  current_meter: string | null;
  meter_reading_date: string | null;
  status: 'active' | 'in_service' | 'sold' | 'scrapped';
}

export interface Driver {
  id: string;
  code: string;
  name: string;
  mobile: string;
  licence_valid_till: string | null;
  status: 'active' | 'on_leave' | 'relieved';
}

export interface ComplianceDocument {
  id: string;
  vehicle: string | null;
  driver: string | null;
  holder_display: string;
  doc_type: string;
  valid_till: string | null;
  reminder_days_before: number;
  is_expired: boolean;
  is_due: boolean;
  status: string;
}

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
