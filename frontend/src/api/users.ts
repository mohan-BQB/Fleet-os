import { apiFetch } from './client';
import type { AppUser, PermissionAction, PermissionGrid, PermissionSection, UserCreateInput, UserUpdateInput } from './types';

export const listUsers = () => apiFetch<AppUser[]>('/auth/users/');
export const createUser = (input: UserCreateInput) =>
  apiFetch<AppUser>('/auth/users/', { method: 'POST', body: JSON.stringify(input) });
export const updateUser = (id: string, input: UserUpdateInput) =>
  apiFetch<AppUser>(`/auth/users/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });

export interface EffectivePermissionsResponse {
  user: string;
  role: string;
  permissions: PermissionGrid;
}
export const getEffectivePermissions = (userId: string) =>
  apiFetch<EffectivePermissionsResponse>(`/auth/permissions/effective/?user=${userId}`);
export const setPermission = (
  userId: string, section: PermissionSection, action: PermissionAction, allowed: boolean,
) =>
  apiFetch<EffectivePermissionsResponse>('/auth/permissions/set/', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, section, action, allowed }),
  });
