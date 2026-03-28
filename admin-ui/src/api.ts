export const ADMIN_SECRET_STORAGE_KEY = 'osham-admin-secret';
export const ADMIN_SECRET_OPTIONAL_STORAGE_KEY = 'osham-admin-auth-optional';
export const ADMIN_SECRET_CHANGED_EVENT = 'osham-admin-secret-changed';
export const ADMIN_AUTH_REQUIRED_EVENT = 'osham-admin-auth-required';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: { status: number; code?: string; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

function emitAdminSecretChanged(): void {
  window.dispatchEvent(new Event(ADMIN_SECRET_CHANGED_EVENT));
}

function emitAdminAuthRequired(message: string): void {
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_REQUIRED_EVENT, { detail: { message } }));
}

export function requiresAdminAuth(): boolean {
  return window.sessionStorage.getItem(ADMIN_SECRET_OPTIONAL_STORAGE_KEY) !== 'true';
}

export function markAdminAuthOptional(): void {
  window.sessionStorage.setItem(ADMIN_SECRET_OPTIONAL_STORAGE_KEY, 'true');
  emitAdminSecretChanged();
}

export function getStoredAdminSecret(): string {
  const sessionSecret = window.sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || '';
  if (sessionSecret) return sessionSecret;

  const legacySecret = window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || '';
  if (legacySecret) {
    window.sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, legacySecret);
    window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    emitAdminSecretChanged();
  }
  return legacySecret;
}

export function saveAdminSecret(secret: string): void {
  const trimmed = secret.trim();
  if (trimmed) {
    window.sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, trimmed);
  } else {
    window.sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
  }
  window.sessionStorage.removeItem(ADMIN_SECRET_OPTIONAL_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
  emitAdminSecretChanged();
}

export function clearAdminSecret(): void {
  window.sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
  window.sessionStorage.removeItem(ADMIN_SECRET_OPTIONAL_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
  emitAdminSecretChanged();
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  let body: any = null;
  const rawText = await res.text();
  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
  }

  if (!res.ok || body?.ok === false) {
    const unauthorizedMessage = getStoredAdminSecret()
      ? 'Admin API rejected the saved secret. Update or clear the x-osham-admin-secret and try again.'
      : 'Admin API requires x-osham-admin-secret. Save the admin secret and retry, or continue without one only if insecure local admin access is enabled.';

    if (res.status === 401) {
      if (getStoredAdminSecret()) {
        clearAdminSecret();
      }
      emitAdminAuthRequired(unauthorizedMessage);
    }

    throw new ApiError(
      res.status === 401 ? unauthorizedMessage : body?.error?.message || rawText || `Request failed: ${res.status}`,
      {
        status: res.status,
        code: body?.error?.code,
        details: body?.details,
      },
    );
  }
  return body.data as T;
}

function getAdminHeaders(contentType?: string): HeadersInit {
  const secret = getStoredAdminSecret();
  return {
    ...(contentType ? { 'content-type': contentType } : {}),
    ...(secret ? { 'x-osham-admin-secret': secret } : {}),
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: getAdminHeaders(),
  });

  return readJsonResponse<T>(res);
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: getAdminHeaders('application/json'),
    body: JSON.stringify(payload),
  });

  return readJsonResponse<T>(res);
}

export async function apiPut<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: getAdminHeaders('application/json'),
    body: JSON.stringify(payload),
  });

  return readJsonResponse<T>(res);
}
