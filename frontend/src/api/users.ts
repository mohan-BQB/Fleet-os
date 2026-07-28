import { apiFetch } from './client';
import type { AppUser, UserCreateInput, UserUpdateInput } from './types';

export const listUsers = () => apiFetch<AppUser[]>('/auth/users/');
export const createUser = (input: UserCreateInput) =>
  apiFetch<AppUser>('/auth/users/', { method: 'POST', body: JSON.stringify(input) });
export const updateUser = (id: string, input: UserUpdateInput) =>
  apiFetch<AppUser>(`/auth/users/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
