import { apiFetch } from './client';
import type {
  PartInventoryItem, PartInventoryItemInput, PartStockMovement, PartStockMovementInput,
} from './types';

export const listPartInventoryItems = () => apiFetch<PartInventoryItem[]>('/parts/inventory-items/');
export const createPartInventoryItem = (input: PartInventoryItemInput) =>
  apiFetch<PartInventoryItem>('/parts/inventory-items/', { method: 'POST', body: JSON.stringify(input) });
export const updatePartInventoryItem = (id: string, input: PartInventoryItemInput) =>
  apiFetch<PartInventoryItem>(`/parts/inventory-items/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
export const retirePartInventoryItem = (id: string) =>
  apiFetch<null>(`/parts/inventory-items/${id}/`, { method: 'DELETE' });

export const listPartStockMovements = () => apiFetch<PartStockMovement[]>('/parts/stock-movements/');
export const createPartStockMovement = (input: PartStockMovementInput) =>
  apiFetch<PartStockMovement>('/parts/stock-movements/', { method: 'POST', body: JSON.stringify(input) });
