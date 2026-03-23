export async function apiGet<T>(path: string): Promise<T> {
  const secret = window.localStorage.getItem('osham-admin-secret') || '';
  const res = await fetch(path, {
    headers: secret ? { 'x-osham-admin-secret': secret } : {},
  });

  const body = await res.json();
  if (!res.ok || body.ok === false) {
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
  }
  return body.data as T;
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const secret = window.localStorage.getItem('osham-admin-secret') || '';
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-osham-admin-secret': secret } : {}),
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  if (!res.ok || body.ok === false) {
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
  }
  return body.data as T;
}
