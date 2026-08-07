import { apiFetch, toFormData } from './client';
import type { CompanyProfile, CompanyProfileInput, CurrentUser } from './types';

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

export function changePassword(old_password: string, new_password: string) {
  return apiFetch<null>('/auth/change-password/', {
    method: 'POST',
    body: JSON.stringify({ old_password, new_password }),
  });
}

export function getCompanyProfile() {
  return apiFetch<CompanyProfile>('/auth/company-profile/');
}

export function updateCompanyProfile(input: CompanyProfileInput, logo?: File | null) {
  return apiFetch<CompanyProfile>('/auth/company-profile/', {
    method: 'PATCH',
    body: toFormData(input, { logo }),
  });
}
