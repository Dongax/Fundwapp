let accessToken = null;
let refreshPromise = null;

export const session = { user: null };
const listeners = new Set();
export const onSessionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setSession(user, token) {
  session.user = user;
  accessToken = token;
  listeners.forEach((fn) => fn(user));
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

async function send(path, { method = 'GET', body, form, auth = true } = {}) {
  const headers = {};
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`/api${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), credentials: 'same-origin' });
}

/** Restores a session from the httpOnly refresh cookie. */
export function refresh() {
  refreshPromise ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) { setSession(null, null); return false; }
      const data = await res.json();
      setSession(data.user, data.access_token);
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function api(path, opts = {}) {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false && (await refresh())) res = await send(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function startSession(data) {
  setSession(data.user, data.access_token);
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' });
  setSession(null, null);
}
