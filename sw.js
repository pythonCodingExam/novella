/* Novella 2.2.2 — resilient app shell. No private data, Supabase calls, books,
   or unrelated origins are cached. The user controls offline book storage. */
const VERSION = 'novella-shell-v222-20261117';
const CORE_SHELL = ['./index.html','./novella-theme.css?v=222','./novella-app.js?v=222'];
const OPTIONAL_SHELL = ['./manifest.webmanifest','./icons/novella-192.png','./icons/novella-512.png','./icons/novella-maskable-512.png'];
const shellURL = new URL('./index.html',self.registration.scope).href;
async function nv222CacheVerifiedCore(cache,path){
 const request=new Request(new URL(path,self.registration.scope),{cache:'reload'});
 const response=await fetch(request);
 if(!response.ok)throw Error('Novella core asset unavailable: '+path);
 const mime=(response.headers.get('content-type')||'').toLowerCase();
 // Cloudflare Pages may serve index.html with status 200 for a missing JS/CSS path.
 // Never cache that HTML as executable application code.
 const expected=path.includes('.css')?'text/css':path.includes('.js')?'javascript':'text/html';
 if(!mime.includes(expected))throw Error('Novella core asset has wrong type: '+path);
 await cache.put(request,response);
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  try{
   // A new version is valid only if its actual HTML/CSS/JS files all exist.
   await Promise.all(CORE_SHELL.map(path=>nv222CacheVerifiedCore(cache,path)));
  }catch(error){await caches.delete(VERSION);throw error}
  // Optional icons must not block a valid app update.
  await Promise.allSettled(OPTIONAL_SHELL.map(path=>cache.add(path)));
  // The public client config and SDK can be used when offline if fetched before.
  // Nothing fetched from Supabase auth/API endpoints is cached.
  await Promise.allSettled([
   cache.add(new Request(new URL('./config.js',self.registration.scope),{cache:'reload'})),
   cache.add(new Request('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',{mode:'cors'}))
  ]);
  // Existing readers keep their current worker until they explicitly approve the update.
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='NOVELLA_ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('novella-shell-')&&key!==VERSION)await caches.delete(key);
  await self.clients.claim();
 })());
});
const publicSDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const u=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.mode==='navigate'&&u.origin===scope.origin&&u.pathname.startsWith(scope.pathname)){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request);
    if(response.ok&&response.type==='basic'){
     const cache=await caches.open(VERSION);
     event.waitUntil(cache.put(shellURL,response.clone()).catch(()=>{}));
    }
    return response;
   }catch{
    return await caches.match(shellURL)||Response.error();
   }
  })());return;
 }
 // Versioned public application code: fast, offline-capable, isolated from user data.
 if(u.origin===scope.origin && (u.pathname.endsWith('/novella-app.js')||u.pathname.endsWith('/novella-theme.css'))){
  event.respondWith((async()=>{
   const cache=await caches.open(VERSION);
   const saved=await cache.match(request);
   if(saved)return saved;
   try{const response=await fetch(request);if(response.ok)event.waitUntil(cache.put(request,response.clone()).catch(()=>{}));return response}
   catch{return Response.error()}
  })());return;
 }
 // Strict public asset allowlist: never intercept account, upload, voice, or book APIs.
 const localAssets=['/manifest.webmanifest','/icons/novella-192.png','/icons/novella-512.png','/icons/novella-maskable-512.png'];
 const allowed=u.origin===scope.origin&&(u.pathname.endsWith('/config.js')||localAssets.some(x=>u.pathname.endsWith(x)))||u.href===publicSDK;
 if(!allowed)return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  try{
   const response=await fetch(request);
   if(response.ok){event.waitUntil(cache.put(request,response.clone()).catch(()=>{}));return response}
   return await cache.match(request)||response;
  }catch{return await cache.match(request)||Response.error()}
 })());
});
