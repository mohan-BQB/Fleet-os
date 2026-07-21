// In dev, Vite proxies /api to Django on the same origin (see vite.config.ts).
// In production, frontend (Vercel) and backend (Render) are different
// domains - set VITE_API_BASE_URL to the deployed backend's URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// No CSRF token handling: the backend's DEFAULT_AUTHENTICATION_CLASSES skips
// it (see core.authentication.CsrfExemptSessionAuthentication) since
// CORS_ALLOWED_ORIGINS already restricts writes to this one trusted origin.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 204) return null as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = (data && (data.detail ?? JSON.stringify(data))) || res.statusText;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
