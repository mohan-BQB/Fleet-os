import { apiFetch } from './client';
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

export const listMaintenanceLogs = () => apiFetch<MaintenanceLog[]>('/maintenance/logs/');
export const createMaintenanceLog = (input: MaintenanceLogInput) =>
  apiFetch<MaintenanceLog>('/maintenance/logs/', { method: 'POST', body: JSON.stringify(input) });
export const retireMaintenanceLog = (id: string) =>
  apiFetch<null>(`/maintenance/logs/${id}/`, { method: 'DELETE' });
