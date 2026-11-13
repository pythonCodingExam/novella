/* Novella 2.1.0 — app shell only. No private data, Supabase calls, books,
   or unrelated origins are cached. The user controls offline book storage. */
const VERSION = 'novella-shell-v211-20261113';
const SHELL = ['./index.html','./manifest.webmanifest','./icons/novella-192.png','./icons/novella-512.png','./icons/novella-maskable-512.png'];
const shellURL = new URL('./index.html',self.registration.scope).href;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  await cache.addAll(SHELL);
  // The public client config and SDK can be used when offline if fetched before.
  // Nothing fetched from Supabase auth/API endpoints is cached.
  await Promise.allSettled([
   cache.add(new Request(new URL('./config.js',self.registration.scope),{cache:'reload'})),
   cache.add(new Request('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',{mode:'cors'}))
  ]);
  await self.skipWaiting();
 })());
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
