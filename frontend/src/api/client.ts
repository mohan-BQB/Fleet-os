const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

// In dev, Vite proxies /api to Django on the same origin (see vite.config.ts).
// In production, frontend (Vercel) and backend (Render) are different
// domains - set VITE_API_BASE_URL to the deployed backend's URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// Cross-site, JS can't read the csrftoken cookie Django set for its own
// domain - so the token comes back in the /auth/csrf/ response body instead
// (see core/views.CsrfView). Fetched fresh before every mutation rather than
// cached: Django rotates the token on login/logout, so a cached value from
// before login silently 403s every request after.
async function fetchCsrfToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/csrf/`, { credentials: 'include' });
  const data = await res.json();
  return data.csrfToken ?? null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (!SAFE_METHODS.has(method)) {
    const token = await fetchCsrfToken();
    if (token) headers.set('X-CSRFToken', token);
  }
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
