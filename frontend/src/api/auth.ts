import { apiFetch } from './client';
import type { CurrentUser } from './types';

export function login(username: string, password: string) {
  return apiFetch<CurrentUser>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return apiFetch<null>('/auth/logout/', { method: 'POST' });
}

export function me() {
  return apiFetch<CurrentUser>('/auth/me/');
}
