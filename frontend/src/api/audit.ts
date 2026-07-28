import { apiFetch } from './client';
import type { AuditLogEntry, Paginated } from './types';

export function listAuditLog(params: { model_name?: string; object_id?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.model_name) query.set('model_name', params.model_name);
  if (params.object_id) query.set('object_id', params.object_id);
  if (params.page) query.set('page', String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AuditLogEntry>>(`/auth/audit/${qs ? `?${qs}` : ''}`);
}
