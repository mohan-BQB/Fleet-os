// In dev, Vite proxies /api to Django on the same origin (see vite.config.ts).
// In production, frontend (Vercel) and backend (Render) are different
// domains - set VITE_API_BASE_URL to the deployed backend's URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// No CSRF token handling: the backend's DEFAULT_AUTHENTICATION_CLASSES skips
// it (see core.authentication.CsrfExemptSessionAuthentication) since
// CORS_ALLOWED_ORIGINS already restricts writes to this one trusted origin.

// Builds multipart form data for endpoints with a file field: plain values
// become form fields, `null`/`undefined` are skipped entirely (so a PATCH
// without a new file leaves the existing one untouched), and File objects
// are attached as-is.
export function toFormData(
  fields: Record<string, string | number | boolean | null | undefined>,
  files: Record<string, File | null | undefined> = {},
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    fd.append(key, String(value));
  }
  for (const [key, file] of Object.entries(files)) {
    if (file) fd.append(key, file);
  }
  return fd;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // FormData (file uploads) must NOT get a manual Content-Type - the browser
  // sets one itself with the correct multipart boundary.
  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has('Content-Type')) {
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
