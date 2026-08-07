import { apiFetch, toFormData } from './client';
import type {
  MaintenanceLog, MaintenanceLogInput, MaintenanceSchedule, MaintenanceScheduleInput,
} from './types';

export const listMaintenanceSchedules = () => apiFetch<MaintenanceSchedule[]>('/maintenance/schedules/');
export const createMaintenanceSchedule = (input: MaintenanceScheduleInput) =>
  apiFetch<MaintenanceSchedule>('/maintenance/schedules/', { method: 'POST', body: JSON.stringify(input) });
export const updateMaintenanceSchedule = (id: string, input: MaintenanceScheduleInput) =>
  apiFetch<MaintenanceSchedule>(`/maintenance/schedules/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireMaintenanceSchedule = (id: string) =>
  apiFetch<null>(`/maintenance/schedules/${id}/`, { method: 'DELETE' });

export type MaintenanceLogFiles = Partial<Record<'old_part_photo', File | null>>;

export const listMaintenanceLogs = () => apiFetch<MaintenanceLog[]>('/maintenance/logs/');
export const createMaintenanceLog = (input: MaintenanceLogInput, files: MaintenanceLogFiles = {}) =>
  apiFetch<MaintenanceLog>('/maintenance/logs/', { method: 'POST', body: toFormData(input, files) });
export const retireMaintenanceLog = (id: string) =>
  apiFetch<null>(`/maintenance/logs/${id}/`, { method: 'DELETE' });
