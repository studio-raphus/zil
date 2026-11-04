// Studio API client: same gateway as the app, session cookie for auth.
export const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

async function req(method, path, body) {
  const res = await fetch(base + path, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return json;
}

export const api = {
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b || {}),
  patch: (p, b) => req('PATCH', p, b),
  del: p => req('DELETE', p)
};
