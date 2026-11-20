export class ApiProblemError extends Error {
  status: number;
  title: string;
  detail: string;
  traceId?: string;

  constructor(status: number, title: string, detail: string, traceId?: string) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.traceId = traceId;
  }
}

const TOKEN_KEY = 'flagship_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await res.json() : await res.text();

  if (!res.ok) {
    if (typeof data === 'object' && data !== null) {
      const problem = data as { title?: string; detail?: string; traceId?: string };
      throw new ApiProblemError(
        res.status,
        problem.title || `HTTP ${res.status}`,
        problem.detail || res.statusText,
        problem.traceId,
      );
    }
    throw new ApiProblemError(res.status, `HTTP ${res.status}`, String(data || res.statusText));
  }

  return data as T;
}
