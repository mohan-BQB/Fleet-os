import { apiFetch } from './client';
import type { ApiKey, JobRun, OrganizationAdmin, OrganizationCreateInput, SystemHealth } from './types';

export const listOrganizations = () => apiFetch<OrganizationAdmin[]>('/console/organizations/');

export const createOrganization = (input: OrganizationCreateInput) =>
  apiFetch<OrganizationAdmin>('/console/organizations/', { method: 'POST', body: JSON.stringify(input) });

export const updateOrganization = (
  id: string, input: Partial<Pick<OrganizationAdmin, 'is_active' | 'disabled_modules'>>,
) => apiFetch<OrganizationAdmin>(`/console/organizations/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });

export const impersonateOrganization = (id: string) =>
  apiFetch<null>(`/console/organizations/${id}/impersonate/`, { method: 'POST' });

export const stopImpersonation = () => apiFetch<null>('/console/stop-impersonation/', { method: 'POST' });

export const getSystemHealth = () => apiFetch<SystemHealth>('/console/system-health/');

export const listApiKeys = () => apiFetch<ApiKey[]>('/console/api-keys/');

export const createApiKey = (name: string) =>
  apiFetch<ApiKey>('/console/api-keys/', { method: 'POST', body: JSON.stringify({ name }) });

export const revokeApiKey = (id: string) => apiFetch<null>(`/console/api-keys/${id}/revoke/`, { method: 'POST' });

export const listJobRuns = () => apiFetch<JobRun[]>('/console/job-runs/');

export const triggerComplianceJob = () =>
  apiFetch<JobRun>('/console/jobs/check-compliance/trigger/', { method: 'POST' });
