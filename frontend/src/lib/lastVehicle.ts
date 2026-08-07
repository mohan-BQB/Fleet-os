// Shared across Tyres/Maintenance (Masters + Operations) so switching
// between those pages doesn't force re-picking the vehicle every time.
const KEY = 'fleet:lastVehicleId';

export function getLastVehicleId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastVehicleId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage unavailable (private mode, quota) - picking still works,
    // it just won't be remembered across pages.
  }
}
