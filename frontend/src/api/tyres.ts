import { apiFetch } from './client';
import type {
  Tyre, TyreInput, TyreReplacementInput, TyreReplacementResult, TyreService, TyreServiceInput,
} from './types';

export const listTyres = () => apiFetch<Tyre[]>('/tyres/');
export const createTyre = (input: TyreInput) =>
  apiFetch<Tyre>('/tyres/', { method: 'POST', body: JSON.stringify(input) });
export const updateTyre = (id: string, input: TyreInput) =>
  apiFetch<Tyre>(`/tyres/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retireTyre = (id: string) =>
  apiFetch<null>(`/tyres/${id}/`, { method: 'DELETE' });

export const listTyreServices = () => apiFetch<TyreService[]>('/tyre-services/');
export const createTyreService = (input: TyreServiceInput) =>
  apiFetch<TyreService>('/tyre-services/', { method: 'POST', body: JSON.stringify(input) });
export const retireTyreService = (id: string) =>
  apiFetch<null>(`/tyre-services/${id}/`, { method: 'DELETE' });
export const replaceTyre = (input: TyreReplacementInput) =>
  apiFetch<TyreReplacementResult>('/tyre-services/replace_tyre/', { method: 'POST', body: JSON.stringify(input) });
