
 // Novella: Cloudflare Pages Function
 // File: functions/api/account/delete.js
 // Route: /api/account/delete
 //
 // Required Cloudflare environment variables:
 // SUPABASE_URL
 // SUPABASE_SECRET_KEY (encrypted)
 //
 // Optional:
 // SUPABASE_PUBLISHABLE_KEY
 // SUPABASE_SERVICE_ROLE_KEY (legacy)

 const HEADERS = {
   'Content-Type': 'application/json; charset=utf-8',
   'Cache-Control': 'no-store',
   'X-Content-Type-Options': 'nosniff',
   'Referrer-Policy': 'no-referrer'
 };

 const UUID =
   /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

 function reply(status, code, message, extra = {}) {
   return new Response(
     JSON.stringify({
       ok: status >= 200 && status < 300,
       code,
       ...extra,
       ...(message ? { error: message } : {})
     }),
     { status, headers: HEADERS }
   );
 }

 function log(stage, status, code = '') {
   // Never log credentials, personal data or JWTs.
   console.error(
     'NOVELLA_ACCOUNT_DELETE',
     stage,
     status,
     String(code).replace(/[^\w-]/g, '').slice(0, 48)
   );
 }

 function adminKey(env) {
   const modern = String(
     env.SUPABASE_SECRET_KEY || ''
   ).trim();

   if (modern.startsWith('sb_secret_')) {
     return { value: modern, legacy: false };
   }

   const legacy = String(
     env.SUPABASE_SERVICE_ROLE_KEY || ''
   ).trim();

   if (legacy) {
     try {
       const encoded = legacy.split('.')[1]
         .replace(/-/g, '+')
         .replace(/_/g, '/');

       const payload = JSON.parse(atob(encoded));

       if (payload.role === 'service_role') {
         return { value: legacy, legacy: true };
       }
     } catch {}
   }

   return null;
 }

 async function callSupabase(url, options, timeoutMs) {
   const controller = new AbortController();

   const timer = setTimeout(
     () => controller.abort(),
     timeoutMs
   );

   try {
     return await fetch(url, {
       ...options,
       signal: controller.signal,
       redirect: 'manual'
     });
   } finally {
     clearTimeout(timer);
   }
 }

 async function providerCode(response) {
   try {
     const body = await response.json();

     return String(
       body?.code ||
       body?.error_code ||
       body?.error ||
       ''
     ).slice(0, 100);
   } catch {
     return '';
   }
 }

 export async function onRequestPost({ request, env }) {

   // 1. Reject requests from unrelated websites.
   const requestUrl = new URL(request.url);
   const origin = request.headers.get('Origin');

   if (origin && origin !== requestUrl.origin) {
     return reply(
       403,
       'INVALID_ORIGIN',
       'Request must come from Novella.'
     );
   }

   // 2. Require JSON.
   const type = (
     request.headers.get('Content-Type') || ''
   ).toLowerCase();

   if (!type.startsWith('application/json')) {
     return reply(
       415,
       'INVALID_CONTENT_TYPE',
       'Expected a JSON confirmation.'
     );
   }

   // 3. Validate the admin key.
   const key = adminKey(env || {});

   if (!key) {
     return reply(
       503,
       'ADMIN_KEY_MISSING',
       'Account deletion needs a valid Supabase secret key in Cloudflare Production settings.'
     );
   }

   // 4. Validate the Supabase project URL.
   let base;

   try {
     base = new URL(
       String(env.SUPABASE_URL || '').trim()
     );

     if (
       base.protocol !== 'https:' ||
       !/^[a-z0-9-]+\.supabase\.co$/i.test(base.hostname) ||
       base.username ||
       base.password ||
       base.search ||
       base.hash ||
       base.pathname !== '/'
     ) {
       throw Error('Invalid project URL');
     }
   } catch {
     return reply(
       503,
       'SUPABASE_URL_INVALID',
       'The Supabase project URL in Cloudflare is invalid.'
     );
   }

   // 5. Require a signed-in user's access token.
   const authorization =
     request.headers.get('Authorization') || '';

   const match =
     /^Bearer\s+([A-Za-z0-9_.-]+)$/i.exec(authorization);

   const token = match?.[1] || '';

   if (
     !token ||
     token.length > 6000 ||
     token.split('.').length !== 3
   ) {
     return reply(
       401,
       'LOGIN_REQUIRED',
       'Please sign in again before deleting your account.'
     );
   }

   // 6. Validate explicit deletion confirmation.
   const statedSize = Number(
     request.headers.get('Content-Length') || 0
   );

   if (statedSize > 1024) {
     return reply(
       413,
       'REQUEST_TOO_LARGE',
       'Invalid confirmation.'
     );
   }

   let body;

   try {
     const raw = await request.text();

     if (raw.length > 1024) {
       return reply(
         413,
         'REQUEST_TOO_LARGE',
         'Invalid confirmation.'
       );
     }

     body = JSON.parse(raw);
   } catch {
     return reply(
       400,
       'INVALID_JSON',
       'Invalid confirmation request.'
     );
   }

   if (
     !body ||
     Array.isArray(body) ||
     body.confirmation !== 'DELETE'
   ) {
     return reply(
       400,
       'CONFIRMATION_REQUIRED',
       'Type DELETE to confirm account deletion.'
     );
   }

   // 7. Ask Supabase Auth to verify the user's JWT.
   // Prefer a publishable key if configured.
   const publicKey = String(
     env.SUPABASE_PUBLISHABLE_KEY ||
     env.SUPABASE_ANON_KEY ||
     ''
   ).trim();

   const verificationKey = publicKey || key.value;

   let userResponse;

   try {
     userResponse = await callSupabase(
       new URL('/auth/v1/user', base),
       {
         method: 'GET',
         headers: {
           apikey: verificationKey,
           Authorization: `Bearer ${token}`
         }
       },
       9000
     );
   } catch (error) {
     log(
       'VERIFY_FETCH_FAILED',
       error?.name === 'AbortError' ? 504 : 503
     );

     return reply(
       503,
       'VERIFY_UNAVAILABLE',
       'Could not verify your session. Please retry.'
     );
   }

   if (userResponse.status === 401) {
     return reply(
       401,
       'SESSION_INVALID',
       'Your session has expired. Please sign in again.'
     );
   }

   if (!userResponse.ok) {
     log(
       'VERIFY_REJECTED',
       userResponse.status,
       await providerCode(userResponse)
     );

     return reply(
       502,
       'VERIFY_REJECTED',
       'Supabase could not verify the account. Check the configured API keys.'
     );
   }

   let user;

   try {
     user = await userResponse.json();
   } catch {
     user = null;
   }

   if (!UUID.test(user?.id || '')) {
     return reply(
       401,
       'USER_INVALID',
       'Your account could not be verified. Sign in again.'
     );
   }

   // 8. Delete ONLY the verified user's account.
   // Never trust a user ID supplied by the browser.
   //
   // Modern sb_secret keys use the apikey header.
   // Legacy service_role JWTs additionally use Bearer.

   const adminHeaders = {
     apikey: key.value,
     'Content-Type': 'application/json'
   };

   if (key.legacy) {
     adminHeaders.Authorization = `Bearer ${key.value}`;
   }

   let deleted;

   try {
     deleted = await callSupabase(
       new URL(
         `/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
         base
       ),
       {
         method: 'DELETE',
         headers: adminHeaders,
         body: JSON.stringify({
           should_soft_delete: false
         })
       },
       12000
     );
   } catch (error) {
     log(
       'DELETE_FETCH_FAILED',
       error?.name === 'AbortError' ? 504 : 503
     );

     // Request may have succeeded before the connection failed.
     // Do not automatically retry a destructive operation.
     return reply(
       504,
       'DELETE_STATUS_UNKNOWN',
       'Could not confirm deletion. Check Supabase Authentication → Users before retrying.'
     );
   }

   // 9. Confirm success.
   if (deleted.ok) {
     return reply(
       200,
       'ACCOUNT_DELETED',
       null,
       { deleted: true }
     );
   }

   // 10. Handle specific Supabase failures.
   const reason = await providerCode(deleted);

   log(
     'DELETE_REJECTED',
     deleted.status,
     reason
   );

   if (
     deleted.status === 401 ||
     deleted.status === 403
   ) {
     return reply(
       502,
       'ADMIN_PERMISSION_DENIED',
       'Supabase rejected account deletion. Verify that the Cloudflare secret is an active admin key.'
     );
   }

   if (deleted.status === 404) {
     return reply(
       409,
       'ACCOUNT_NOT_FOUND',
       'This account may already be deleted. Verify it in Supabase Authentication → Users.'
     );
   }

   if ([400, 409, 422].includes(deleted.status)) {
     return reply(
       409,
       'DELETE_CONFLICT',
       'Supabase blocked deletion. Check whether this user owns Storage files or other linked records.'
     );
   }

   if (deleted.status === 429) {
     return reply(
       429,
       'RATE_LIMITED',
       'Too many requests. Try again later.'
     );
   }

   return reply(
     502,
     'SUPABASE_DELETE_FAILED',
     'Supabase could not delete the account. Check Cloudflare function logs for the failure code.'
   );
 }

 // Safe health check. Does not delete anything.
 export function onRequestGet({ env }) {
   return reply(
     200,
     'DELETE_ENDPOINT_READY',
     null,
     {
       ready: !!(
         env?.SUPABASE_URL &&
         adminKey(env)
       )
     }
   );
 }
