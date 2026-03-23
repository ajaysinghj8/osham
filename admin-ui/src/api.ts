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

async function readJsonResponse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || body.ok === false) {
    throw new ApiError(body?.error?.message || `Request failed: ${res.status}`, {
      status: res.status,
      code: body?.error?.code,
      details: body?.details,
    });
  }
  return body.data as T;
}

function getAdminHeaders(contentType?: string): HeadersInit {
  const secret = window.localStorage.getItem('osham-admin-secret') || '';
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
