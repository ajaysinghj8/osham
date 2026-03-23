async function readJsonResponse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok || body.ok === false) {
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
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
