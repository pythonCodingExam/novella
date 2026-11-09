
// Novella - Cloudflare Pages Function for the admin-issued Annex access code.
// Set NOVELLA_ANNEX_CODE as an ENCRYPTED Pages secret. Never commit the code to GitHub.
// GET /api/annex?owner=<Novella-account-id> -> checks this session.
// POST /api/annex {code,owner} -> verifies code, issues a signed HttpOnly cookie.
// DELETE /api/annex -> revokes the current browser's token.

const COOKIE = 'novella_annex_access';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const encoder = new TextEncoder();
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}
function cookieValue(request) {
  const raw = request.headers.get('cookie') || '';
  return raw.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
function hex(bytes) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
async function digest(text) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text))); }
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function safeOwner(raw) { return String(raw || 'guest').slice(0, 100); }
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
async function verifySession(request, env, owner) {
  const token = cookieValue(request);
  const match = /^(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const expiration = Number(match[1]);
  if (!(expiration > Date.now() && expiration <= Date.now() + TWO_HOURS_MS)) return null;
  const ownerHash = (await digest(safeOwner(owner))).slice(0, 32);
  if (ownerHash !== match[3]) return null;
  const payload = match.slice(1, 4).join('.');
  const sig = Uint8Array.from(match[4].match(/../g), x => parseInt(x, 16));
  if (!await crypto.subtle.verify('HMAC', await hmacKey(env.NOVELLA_ANNEX_CODE), sig, encoder.encode(payload))) return null;
  return expiration;
}
export async function onRequestGet({ request, env }) {
  if (!env?.NOVELLA_ANNEX_CODE) return json({ unlocked: false, message: 'The Annex is not configured.' }, 503);
  const owner = new URL(request.url).searchParams.get('owner') || 'guest';
  const expiresAt = await verifySession(request, env, owner);
  return json({ unlocked: !!expiresAt, expiresAt: expiresAt || 0 });
}
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ unlocked: false, message: 'Request origin rejected.' }, 403);
  const secret = env?.NOVELLA_ANNEX_CODE;
  if (typeof secret !== 'string' || secret.length < 20) {
    return json({ unlocked: false, message: 'The Annex is not configured by the administrator yet.' }, 503);
  }
  const raw = await request.text();
  if (raw.length > 1024) return json({ unlocked: false, message: 'Invalid request.' }, 400);
  let data; try { data = JSON.parse(raw); } catch { return json({ unlocked: false, message: 'Invalid request.' }, 400); }
  const submitted = String(data?.code || '').trim();
  const owner = safeOwner(data?.owner);
  // Compare fixed-length digests, not plaintext strings. Admin code is a high-entropy secret.
  const expectedDigest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const suppliedDigest = await crypto.subtle.digest('SHA-256', encoder.encode(submitted));
  const expected = new Uint8Array(expectedDigest), supplied = new Uint8Array(suppliedDigest);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ supplied[i];
  if (!submitted || mismatch) return json({ unlocked: false, message: 'Incorrect special code.' }, 401);
  const expiresAt = Date.now() + TWO_HOURS_MS;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const ownerHash = (await digest(owner)).slice(0, 32);
  const payload = `${expiresAt}.${nonce}.${ownerHash}`;
  const signature = hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload)));
  const cookie = `${COOKIE}=${payload}.${signature}; Path=/api/annex; Max-Age=7200; HttpOnly; Secure; SameSite=Strict`;
  return json({ unlocked: true, expiresAt }, 200, { 'set-cookie': cookie });
}
export async function onRequestDelete({ request }) {
  if (!sameOrigin(request)) return json({ unlocked: false }, 403);
  return json({ unlocked: false }, 200, { 'set-cookie': `${COOKIE}=; Path=/api/annex; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
}
