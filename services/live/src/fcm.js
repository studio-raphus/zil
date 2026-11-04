// Firebase Cloud Messaging (HTTP v1) without the Firebase SDK: a service-account JWT is
// exchanged for an OAuth access token, then one request per device token.
// Config: FCM_SERVICE_ACCOUNT_FILE (path to the service account JSON from the Firebase console).
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

let account = null, access = { token: null, exp: 0 };

export function fcmConfigured() {
  if (account) return true;
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (!file) return false;
  try { account = JSON.parse(readFileSync(file, 'utf8')); return !!(account.client_email && account.private_key && account.project_id); }
  catch { account = null; return false; }
}

async function accessToken() {
  if (access.token && Date.now() < access.exp - 60_000) return access.token;
  const now = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }), signal: AbortSignal.timeout(8000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fcm auth failed: ${res.status} ${body.error || ''}`);
  access = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return access.token;
}

/** Sends to every token; returns { sent, failed, dead } where dead = tokens to forget. */
export async function sendToAll(tokens, { title, body, data = {} }) {
  const auth = await accessToken(), url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  let sent = 0, failed = 0; const dead = [];
  const queue = [...tokens];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        const res = await fetch(url, {
          method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ message: { token: t, notification: { title, body }, data, android: { priority: 'high', notification: { color: '#FF5A36', channel_id: 'live' } } } })
        });
        if (res.ok) { sent++; continue; }
        failed++;
        const err = await res.json().catch(() => ({}));
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(err))) dead.push(t);
      } catch { failed++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, tokens.length) }, worker));
  return { sent, failed, dead };
}
