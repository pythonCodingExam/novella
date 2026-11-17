

'use strict';
/* Novella v11.15 — focused account picker, preferred identity independent from switching. */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>{const e=document.createElement('div');e.textContent=String(s||'');return e.textContent.trim()};
const url=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:null}catch{return null}};
const KEY='novella-v3-';
const getLocal=(k,def)=>{try{return JSON.parse(localStorage.getItem(KEY+k))??def}catch{return def}};
const putLocal=(k,v)=>{try{localStorage.setItem(KEY+k,JSON.stringify(v))}catch{}};
let conf=window.NOVELLA_CONFIG||{};
let configured=false;
function nvReadRuntimeConfig(){
 conf=window.NOVELLA_CONFIG||{};
 configured=!!(conf.supabaseUrl&&/^https:\/\//.test(conf.supabaseUrl)&&conf.supabaseAnonKey&&!conf.supabaseAnonKey.startsWith('PASTE_'));
}
nvReadRuntimeConfig();
let db=null; // Set when the third-party auth SDK loads; guest discovery and reading must remain available.
function nvMember(){return !!(db&&me?.id&&nvProfile?.user_id===me.id)}
let nvGateFeature='use this feature',nvGateReturnFocus=null;
function nvRequireMember(feature='use this feature'){
 if(nvMember())return true;
 // Show a choice first, without navigating away or starting sign-in automatically.
 nvGateFeature=String(feature||'use this feature').replace(/\s+/g,' ').slice(0,100);
 nvGateReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 openAuth('member-required');
 return false;
}
function nvGuestRestrictedPage(kind){
 const journal=kind==='history';
 return `<section class="nv-member-gate" aria-labelledby="nv-member-title">
 <span class="intro-label">NOVELLA / YOUR PRIVATE READING SPACE</span>
 <div class="nv-member-gate-card">
  <span class="nv-member-gate-icon" aria-hidden="true">${journal?'◷':'♡'}</span>
  <h1 id="nv-member-title">${journal?'Your reading journal awaits.':'A bookshelf of your own.'}</h1>
  <p>${journal?'Sign in to see your reading history, revisit books you opened, and search your journal across devices.':'Create a free Novella account to save books to your bookshelf and keep your collection across devices.'}</p>
  <div class="nv-member-gate-actions"><button type="button" class="primary-btn" data-auth="signup">Create account →</button><button type="button" class="secondary-btn" data-auth="signin">Sign in</button></div>
  <p class="nv-member-gate-caption">You can still discover books and read available editions without an account.</p>
  <button type="button" class="link-btn" data-view="explore">Browse books instead ↗</button>
 </div></section>`;
}

let nvAuthInitialized=false;
function nvStartAuthWhenReady(){
 if(nvAuthInitialized||!configured||!window.supabase?.createClient)return;
 try{db=window.supabase.createClient(conf.supabaseUrl,conf.supabaseAnonKey);nvAuthInitialized=true;initAuth();
  if(!$('#modal-overlay').classList.contains('hidden')&&['signin','signup'].includes(authMode)){
   const oldForm=$('#auth-form');const entered=oldForm?Array.from(oldForm.elements).filter(e=>e.name).map(e=>({name:e.name,value:e.value,checked:e.checked})):[];
   authPaint(); // Enable Google login without discarding a partially filled registration form.
   for(const item of entered){const field=Array.from($('#auth-form')?.elements||[]).find(e=>e.name===item.name);if(field){field.value=item.value;if(field.type==='checkbox')field.checked=item.checked}}
  }
 }catch(e){console.warn('Novella account service is unavailable');}
}
window.addEventListener('novella:supabase-ready',nvStartAuthWhenReady);
window.addEventListener('novella:config-ready',()=>{nvReadRuntimeConfig();nvStartAuthWhenReady();if(screen==='info')paint();});
window.addEventListener('novella:supabase-error',()=>{console.warn('Novella account provider could not load; guest browsing remains available')});

// NOVELLA 11.23 · SITE-WIDE ANNEX CONTENT POLICY AND SERVER-VERIFIED SPECIAL CODE
// An administrator-curated blocklist is shared by all visitors. The automatic
// fallback only identifies metadata explicitly describing visual sexual material;
// text-only erotica / smut / romance are not considered illustrated material.
// The credential is NOT in this public JavaScript. The Cloudflare Pages Function
// at /api/annex verifies it using a Cloudflare encrypted environment secret.
const NV_ANNEX_NAME='The Annex';
let nvAnnexUnlockedOwner='',nvAnnexExpiresAt=0,nvAnnexDetailOwner='',nvAnnexBusy=false;
let nvAnnexSearchResults=[],nvAnnexRequestEpoch=0,nvAnnexRestoredOwner='';
let nvAnnexBlockedKeys=new Set(),nvAnnexAllowedKeys=new Set(),nvAnnexPolicyLoaded=false;
function nvAnnexOwner(){return String(me?.id||'guest')}
function nvAnnexKeyOf(b){return b?String(b.source||'')+':'+String(b.id||''):''}
function nvAnnexIsFlagged(b){
 if(!b)return false;
 const key=nvAnnexKeyOf(b);
 if(nvAnnexBlockedKeys.has(key))return true;
 if(nvAnnexAllowedKeys.has(key))return false;
 const subjects=(b.genres||[]).join(' / ');
 const phrase=[b.title,subjects,String(b.description||'').slice(0,900)].join(' ').toLowerCase();
 // Must refer to a visual medium, not just sex, smut, nudity discussed in prose,
 // a mature plot or academic research *about* pornography.
 return /\b(?:pornographic|sexually explicit|hardcore|erotic|adult|nude|naked)\s+(?:photograph(?:s|y|ic)?|photos?|photo\s?books?|picture\s?books?|images?|illustrations?|visuals?|image\s?collections?|photo\s?collections?)\b|\b(?:photography|photographs?|photos?|images?|illustrations?|picture collections?)\s+(?:of\s+)?(?:explicit sexual acts|sexual activity|nude (?:models|adults)|pornographic (?:scenes|content))\b|\b(?:explicitly illustrated pornography|visual pornography|pornographic photo albums)\b/i.test(phrase);
}
function nvPublicBooks(a){return (a||[]).filter(b=>b&&!nvAnnexIsFlagged(b))}
function nvAnnexBooks(){
 const keyed=new Map();
 for(const v of [...nvAnnexSearchResults,...bookMap.values()])if(v?.title&&nvAnnexIsFlagged(v))keyed.set(nvAnnexKeyOf(v),v);
 return [...keyed.values()].slice(0,160);
}
function nvAnnexUnlocked(){return nvAnnexUnlockedOwner===nvAnnexOwner()&&Date.now()<nvAnnexExpiresAt}
async function nvAnnexRestore(){
 const owner=nvAnnexOwner();if(nvAnnexUnlocked()||nvAnnexRestoredOwner===owner)return;
 nvAnnexRestoredOwner=owner;const request=++nvAnnexRequestEpoch;
 try{const res=await fetch('/api/annex?owner='+encodeURIComponent(owner),{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)return;const value=await res.json();
  if(request===nvAnnexRequestEpoch&&owner===nvAnnexOwner()&&value.unlocked&&Number(value.expiresAt)>Date.now()){
   nvAnnexUnlockedOwner=owner;nvAnnexExpiresAt=Number(value.expiresAt);
   if(screen==='annex'){paint();nvAnnexHydrateList();}
  }
 }catch{}
}
async function nvLoadAnnexPolicy(){
 try{
  const response=await fetch('/annex-catalog.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Missing catalog');
  const data=await response.json();
  const keys=list=>Array.isArray(list)?list.filter(k=>typeof k==='string'&&/^[a-z]+:[a-z0-9_-]+$/i.test(k)).slice(0,1000):[];
  nvAnnexBlockedKeys=new Set(keys(data.blocked_keys));nvAnnexAllowedKeys=new Set(keys(data.allowed_keys));
 }catch{ /* The strong visual-media metadata rule still applies offline. */ }
 finally{nvAnnexPolicyLoaded=true;if(screen==='explore'||screen==='home'||screen==='annex')paint();}
}
function nvAnnexGate(){
 return `<section class="nv-annex-gate" aria-label="Locked collection"><div class="nv-annex-icon" aria-hidden="true">✦</div><span class="intro-label">A SEPARATE COLLECTION</span><h1>The Annex</h1>
 <p>This collection opens with a special access code from the Novella administrator.</p>
 <form id="nv-annex-form" autocomplete="off"><label for="nv-annex-password">Enter special code</label>
 <span class="nv-password-wrap"><input id="nv-annex-password" type="password" name="code" autocomplete="off" spellcheck="false" required placeholder="Special code" aria-describedby="nv-annex-message"/>
 ${nvPasswordEye()}</span>
 <button class="primary-btn" type="submit" id="nv-annex-unlock">Unlock The Annex →</button>
 <p class="nv-annex-message" id="nv-annex-message" role="status" aria-live="polite"></p></form>
 <small>Only people who have received the administrator's code should enter.</small></section>`;
}
function nvAnnexView(){
 if(!nvAnnexUnlocked()){
  if(nvAnnexRestoredOwner!==nvAnnexOwner())queueMicrotask(nvAnnexRestore);
  return nvAnnexGate();
 }
 const books=nvAnnexBooks();
 return `<section class="nv-annex-page"><div class="nv-annex-heading"><div><span class="intro-label">YOUR SPECIAL COLLECTION</span><h1 class="page-title">The Annex</h1><p class="subtitle">A separate curated collection. Titles appear after they have been identified in the catalogue.</p></div><button class="secondary-btn" type="button" data-nv-annex-lock="1" aria-label="Lock The Annex">Lock collection</button></div>
 <form id="nv-annex-search" class="nv-annex-search" role="search"><input name="q" type="search" placeholder="Find a title in this collection" aria-label="Search this collection" required/><button class="primary-btn" type="submit">Search</button></form>
 <p class="nv-annex-count" id="nv-annex-count">${books.length?books.length+' matching book'+(books.length===1?'':'s'):'No verified titles loaded yet.'}</p>
 ${books.length?`<div class="book-grid nv-annex-books">${books.map(b=>`<div class="nv-annex-item">${card(b)}</div>`).join('')}</div>`:'<div class="nv-annex-empty">Books confirmed by the administrator or clearly identified by catalogue metadata appear here. Try searching a title.</div>'}</section>`;
}
async function nvAnnexFormSubmit(form){
 if(nvAnnexBusy)return;
 const code=String(form.querySelector('#nv-annex-password')?.value||'').trim();
 const message=form.querySelector('#nv-annex-message'),button=form.querySelector('button[type="submit"]');
 if(!code){message.textContent='Enter the code provided by the administrator.';return}
 nvAnnexBusy=true;button.disabled=true;message.textContent='Checking code…';
 try{
  const response=await fetch('/api/annex',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({code,owner:nvAnnexOwner()})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.unlocked){
    if(response.status===404||response.status===405)throw Error('The Annex service is missing. The administrator must deploy functions/api/annex.js in Cloudflare Pages.');
    if(response.status===503)throw Error('The Annex service needs its Cloudflare NOVELLA_ANNEX_CODE secret configured by the administrator.');
    throw Error(data.message||'The code was not accepted.');
   }
  nvAnnexUnlockedOwner=nvAnnexOwner();nvAnnexExpiresAt=Number(data.expiresAt)||Date.now()+600000;
  nvAnnexRestoredOwner=nvAnnexOwner();
  form.reset();paint();void nvAnnexHydrateList();
 }catch(error){message.textContent=error?.message||'Unable to check the code. Please try again.'}
 finally{nvAnnexBusy=false;if(button.isConnected)button.disabled=false}
}
async function nvAnnexHydrateList(){
 if(!nvAnnexUnlocked())return;
 const owner=nvAnnexOwner(),epoch=++nvAnnexRequestEpoch;
 const active=()=>epoch===nvAnnexRequestEpoch&&nvAnnexUnlocked()&&owner===nvAnnexOwner();
 // Admin-reviewed work keys come first. Only run extra catalogues after unlock;
 // these queries never delay public Browse or any homepage interaction.
 const missing=[...nvAnnexBlockedKeys].filter(k=>!bookMap.has(k)).slice(0,18);
 const loadReviewed=Promise.allSettled(missing.map(async key=>{
  try{const book=await hydrate(key);if(book&&active())remember(book)}catch{}
 }));
 // Conservative preview pool; still only returns explicit VISUAL metadata,
 // never generic text-only erotica, smut or mature romance.
 const subjects=['subject:"erotic photography"','subject:"nude photography"'];
 const loadCatalogues=Promise.allSettled(subjects.map(async q=>{
  const response=await getOL(q,1,24);
  if(!active())return;
  const matching=nvDistinct(response.items||[]).filter(nvAnnexIsFlagged);
  nvAnnexSearchResults=nvDistinct([...nvAnnexSearchResults,...matching]).slice(0,90);
  if(screen==='annex')paint();
 }));
 await Promise.allSettled([loadReviewed,loadCatalogues]);
 if(active()&&screen==='annex')paint();
}
async function nvAnnexLock(){
 // Immediately forget the unlocked state even while the server revokes its cookie.
 nvAnnexUnlockedOwner='';nvAnnexExpiresAt=0;nvAnnexRestoredOwner=nvAnnexOwner();
 nvAnnexDetailOwner='';
 ++nvAnnexRequestEpoch;nvAnnexSearchResults=[];
 try{await fetch('/api/annex',{method:'DELETE',credentials:'same-origin',cache:'no-store',keepalive:true})}catch{}
 if(screen==='annex')paint();
}
// A navigation away from the protected collection requires a new code next time.
function nvAnnexLockOnLeave(destination){
 if(destination==='annex')return;
 if(screen==='annex'||nvAnnexDetailOwner||nvAnnexUnlocked())void nvAnnexLock();
}
void nvLoadAnnexPolicy();

let me=null,screen='home',active=null,searchText='',selectedGenre='',page=1,sort='relevance',source='all';
// Opt-in discovery scope. A fresh visit and the regular Browse navigation always show all books.
let nvCompleteOnly=false;
let nvDetailEpoch=0; // Reject details returned after another navigation or newer book click.
let featured=[],classics=[],results=[],fetchError='',lastSearch='',seq=0,authMode='signin',recoveryMode=false,hasMore=false,personalSyncIssue='';
let nvAuthEmailDraft=''; // Retain only the email when changing between Sign in and Register.
// Remembered accounts and sessions are scoped to this Novella browser origin, not to Google, Windows or other websites.
// Novella always asks which account to use in a new tab when multiple accounts are remembered.
// One-tap session saving is enabled on successful sign-in; explicit Sign Out and Forget Account revoke access.
// Never save passwords. Saved auth tokens are sensitive: use Novella only on a trusted personal browser.
const NV_KNOWN_ACCOUNTS_KEY=KEY+'known-accounts-v1';
const NV_PREFERRED_ACCOUNT_KEY=KEY+'preferred-account-v1';
const NV_STARTUP_PICKED_KEY=KEY+'startup-account-chosen-tab-v1';
const nvQuickDefaultEnabled=()=>true;
const nvAskOnOpenEnabled=()=>true;
const nvPreferredAccount=()=>{try{return localStorage.getItem(NV_PREFERRED_ACCOUNT_KEY)||''}catch{return ''}};
const nvSetPreferredAccount=id=>{try{if(id)localStorage.setItem(NV_PREFERRED_ACCOUNT_KEY,id);else localStorage.removeItem(NV_PREFERRED_ACCOUNT_KEY)}catch{}};
function nvMarkStartupChosen(){try{sessionStorage.setItem(NV_STARTUP_PICKED_KEY,'1')}catch{}}
// Ask on a *fresh visit* (new tab, bookmarked link or direct navigation),
// not on Reload, browser history restoration, or SPA navigation. A new document
// is allowed to ask again even if its tab reused/cloned sessionStorage.
// For older browsers with no Navigation Timing entry, fall back to the tab flag.
let nvStartupPickerAttempted=false;
function nvFreshVisitForPicker(){
 try{
  const nav=performance.getEntriesByType?.('navigation')?.[0];
  if(nav?.type)return nav.type==='navigate';
  if(performance.navigation?.type!==undefined)return performance.navigation.type===0;
 }catch{}
 try{return sessionStorage.getItem(NV_STARTUP_PICKED_KEY)!=='1'}catch{return true}
}
function nvMaybeAskOnOpen(){
 if(nvStartupPickerAttempted||nvAuthReturnAtBoot||!nvAskOnOpenEnabled()||nvKnownAccounts.length<2||nvPickerBusy||nvPendingGoogle||recoveryMode)return;
 // Never reopen the chooser after an OAuth response (the SDK may have already
 // consumed its URL parameters before this delayed check runs).
 if(location.hash.includes('type=recovery')||location.search.includes('code=')||location.hash.includes('access_token='))return;
 if(!nvFreshVisitForPicker()||!$('#modal-overlay')?.classList.contains('hidden'))return;
 nvStartupPickerAttempted=true;
 nvMarkStartupChosen();
 nvShowPicker('Choose which Novella account to use on this visit. You can change this anytime in Settings.');
}

const NV_KNOWN_LIMIT=8;
let nvPickerBusy=false,nvPickerMessage='',nvSelectedKnownId='';
function nvReadKnownAccounts(){
 try{
  const a=JSON.parse(localStorage.getItem(NV_KNOWN_ACCOUNTS_KEY)||'[]');
  if(!Array.isArray(a))return [];
  return a.filter(v=>v&&typeof v.id==='string'&&/^[0-9a-f-]{32,36}$/i.test(v.id))
   .slice(0,NV_KNOWN_LIMIT).map(v=>({id:v.id,email:String(v.email||'').slice(0,254),name:String(v.name||'Reader').slice(0,80),lastUsed:Number(v.lastUsed)||0,
    optOut:!!v.optOut,authMethod:['google','email'].includes(v.authMethod)?v.authMethod:'',avatar:nvAvatarData(v.avatar),quick:!!v.quick,session:v.quick&&typeof v.session?.access_token==='string'&&typeof v.session?.refresh_token==='string'?{access_token:v.session.access_token,refresh_token:v.session.refresh_token}:null}));
 }catch{return []}
}
let nvKnownAccounts=nvReadKnownAccounts();
function nvWriteKnownAccounts(a){
 nvKnownAccounts=a.sort((a,b)=>b.lastUsed-a.lastUsed).slice(0,NV_KNOWN_LIMIT);
 try{localStorage.setItem(NV_KNOWN_ACCOUNTS_KEY,JSON.stringify(nvKnownAccounts))}catch{ /* Browsing still works when storage is unavailable. */ }
}
function nvKnownAccount(id){return nvKnownAccounts.find(a=>a.id===id)||null}
function nvQuickReady(a){return !!(a?.quick&&a.session?.access_token&&a.session?.refresh_token)}
function nvForgetKnownAccount(id){
 nvWriteKnownAccounts(nvKnownAccounts.filter(a=>a.id!==id));
 if(nvPreferredAccount()===id)nvSetPreferredAccount('');
 nvRefreshAccountMenu();
}
function nvDisableKnownSession(id){nvWriteKnownAccounts(nvKnownAccounts.map(a=>a.id===id?{...a,quick:false,optOut:true,session:null}:a))}
function nvRecordKnownAccount(user,profile,session,enableQuick=undefined,intent=''){
 if(!user?.id||!profile?.user_id||user.id!==profile.user_id)return;
 const previous=nvKnownAccount(user.id);
 // A verified sign-in makes one-tap available; Sign Out explicitly clears that account's saved session.
 // A missing/failed session lookup may still decline caching rather than storing unverified credentials.
 const quick=enableQuick!==false;
 const valid=quick&&session?.user?.id===user.id&&session.access_token&&session.refresh_token;
 const existing=quick&&previous?.quick?previous.session:null;
 const authMethod=intent.startsWith('google-')?'google':intent==='email-signin'||intent==='email-register'?'email':
  (previous?.authMethod||((user.app_metadata?.providers||[]).includes('google')||user.app_metadata?.provider==='google'?'google':'email'));
 const record={id:user.id,email:user.email||previous?.email||'',name:profile.display_name||previous?.name||'Reader',authMethod,avatar:nvAvatarData(user.user_metadata?.novella_avatar),lastUsed:Date.now(),quick,optOut:!quick,session:valid?{access_token:session.access_token,refresh_token:session.refresh_token}:existing};
 nvWriteKnownAccounts([record,...nvKnownAccounts.filter(a=>a.id!==user.id)]);
 nvRefreshAccountMenu();
}
function nvUpdateKnownTokenFromEvent(session){
 const id=session?.user?.id;
 if(!id||me?.id!==id||nvProfile?.user_id!==id)return;
 const old=nvKnownAccount(id);
 if(old?.quick&&session.access_token&&session.refresh_token){
  nvWriteKnownAccounts(nvKnownAccounts.map(a=>a.id===id?{...a,session:{access_token:session.access_token,refresh_token:session.refresh_token}}:a));
 }
}
async function nvEnableQuickCurrent(){
 if(!db||!me||!nvProfile)return false;
 const {data,error}=await db.auth.getSession();
 if(error||data?.session?.user?.id!==me.id)return false;
 nvRecordKnownAccount(me,nvProfile,data.session,true);return true;
}
function nvPasswordEye(){return `<button type="button" class="nv-password-eye" data-nv-password-toggle aria-label="Show password" aria-pressed="false" title="Show password"><svg class="nv-eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="nv-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M9.8 5.3A11 11 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.4 4.1M6.4 6.6C3.5 8.5 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.6-.8"/><path d="M10.6 10.6a3 3 0 0 0 2.8 2.8"/></svg></button>`}
function nvShowPicker(message=''){nvPickerMessage=message;openAuth('account-picker')}
function nvContinueKnownAccount(item){
 if(!item)return;
 nvMarkStartupChosen();nvAuthEmailDraft=item.email||'';
 if(item.authMethod==='google'){void nvStartGoogleSignIn(item,false);return}
 if(item.authMethod==='email'){
  openAuth('signin');const msg=$('#auth-msg');if(msg)msg.textContent='Your previous session is no longer available. Enter your Novella password to reconnect.';
  return;
 }
 // Older remembered entries have no provider metadata. Ask rather than guessing or exposing a different account.
 nvSelectedKnownId=item.id;openAuth('account-method');
}
async function nvStartGoogleSignIn(item=null,register=false){
 if(!db){nvShowPicker('The account service is still loading. Please try again when it is connected.');return}
 const intent=register?'google-register':'google-signin';
 nvIntentSet(intent);nvExpectedGoogleSet(item?.id||'');
 // IMPORTANT: An identity has ALREADY been selected in Novella's account picker.
 // Forcing prompt=select_account tells Google to show its account chooser AGAIN.
 // login_hint directs Google to that identity and ordinarily skips the extra chooser.
 // New/unspecified sign-ins still allow the visitor to choose a Google account.
 const options={redirectTo:location.origin+location.pathname,queryParams:item?.email?
  {login_hint:item.email}:{prompt:'select_account'}};
 try{
  const {error}=await db.auth.signInWithOAuth({provider:'google',options});
  if(error)throw error;
 }catch(err){
  nvIntentTake();nvExpectedGoogleTake();
  if(item)nvShowPicker('Google could not reconnect this account. Please try again.');
  else{const msg=$('#auth-msg');if(msg)msg.textContent='Google sign-in could not start. Please try again.'}
 }
}
async function nvPickKnownAccount(id){
 if(nvPickerBusy)return;
 const item=nvKnownAccount(id);if(!item)return;
 // A remembered account label is not itself a login. First reuse the ACTIVE
 // verified Supabase session, then a saved session; only expired/revoked sessions
 // should need to go through the provider again.
 if(!db){nvPickerMessage='The account service is still loading. Try again shortly.';authPaint();return}
 nvPickerBusy=true;
 const root=$('#modal-body'),buttons=[...root.querySelectorAll('[data-nv-picker]')];
 buttons.forEach(b=>b.disabled=true);
 const status=$('#nv-picker-status');if(status)status.textContent='Checking your saved sign-in…';
 let previousSession=null,invalidSavedSession=false,needsReconnect=false;
 try{
  const old=await db.auth.getSession();
  if(old.error)throw old.error;
  previousSession=old.data?.session||null;
  if(previousSession?.user?.id===id){
   // The account is already authenticated. Never send it through Google again.
   let activeUser=previousSession.user;
   if(me?.id!==id||nvProfile?.user_id!==id){
    const validated=await db.auth.getUser();
    if(validated.error||validated.data?.user?.id!==id)throw Error('Please reconnect this account to continue.');
    activeUser=validated.data.user;
    await nvCheckRegistration(activeUser,'account-picker-active');
   }
   if(me?.id!==id||nvProfile?.user_id!==id)throw Error('Could not finish loading this account.');
   nvRecordKnownAccount(activeUser,nvProfile,previousSession,true);
   nvMarkStartupChosen();closeAuth();userUI();paint();return;
  }
  if(!nvQuickReady(item)){
   needsReconnect=true;return;
  }
  if(previousSession?.user?.id===me?.id&&nvProfile?.user_id===me.id)
   nvRecordKnownAccount(me,nvProfile,previousSession,true);
  ++nvAuthEpoch; // Ignore any in-flight data requests for the previous account.
  const {data,error}=await db.auth.setSession(item.session);
  if(error){
   // Only clearly rejected credentials should be marked expired. Transient
   // offline/server errors must not destroy a user's otherwise usable login.
   invalidSavedSession=/invalid.*refresh|refresh.*(invalid|expired|not found|revoked)|session.*(expired|revoked)|unauthorized|invalid jwt/i.test(String(error.message||'')) || [400,401,403].includes(Number(error.status||0));
   throw error;
  }
  if(data?.session?.user?.id!==id){invalidSavedSession=true;throw Error('The selected session did not belong to that account.');}
  // Verify the selected identity before displaying any private account data.
  const verified=await db.auth.getUser();
  if(verified.error)throw verified.error;
  if(verified.data?.user?.id!==id){invalidSavedSession=true;throw Error('Account identity did not match.');}
  await nvCheckRegistration(verified.data.user,'account-switch');
  if(me?.id!==id||nvProfile?.user_id!==id)throw Error('Could not load the selected reading profile.');
  nvMarkStartupChosen();closeAuth();userUI();paint();notify('Switched to '+(nvProfile.display_name||'your account'));
 }catch(err){
  if(invalidSavedSession)nvDisableKnownSession(id);
  // Restore the previous account after an unsuccessful switch; never display
  // books from an identity different from Supabase's active session.
  if(previousSession?.user?.id&&previousSession.user.id!==id){
   try{
    const restored=await db.auth.setSession({access_token:previousSession.access_token,refresh_token:previousSession.refresh_token});
    if(restored.error||restored.data?.session?.user?.id!==previousSession.user.id)throw Error('Restoration failed');
    if(me?.id!==previousSession.user.id)await nvCheckRegistration(restored.data.session.user,'restore-account');
   }catch{++nvAuthEpoch;me=null;nvProfile=null;shelves=[];historyRows=[];userUI();paint()}
  }else if(previousSession?.user?.id!==id){++nvAuthEpoch;me=null;nvProfile=null;shelves=[];historyRows=[];userUI();paint()}
  nvPickerMessage=invalidSavedSession?'That saved sign-in expired. Please reconnect once to renew it.':
   'The account service could not confirm this session. Check your connection and retry.';
  if(invalidSavedSession)needsReconnect=true;
  else if($('#modal-overlay')&&!$('#modal-overlay').classList.contains('hidden'))authPaint();
 }finally{
  nvPickerBusy=false;
  if(needsReconnect){
   // Google can require its secure authentication page when its saved session
   // was revoked. login_hint avoids repeating the *account selection* step.
   nvContinueKnownAccount(nvKnownAccount(id)||item);
  }else if(root.isConnected&&authMode==='account-picker'){
   root.querySelectorAll('[data-nv-picker]').forEach(b=>b.disabled=false);
  }
 }
}

let nvProfile=null, nvPendingGoogle=null, nvAuthEpoch=0, nvAuthBusy=false;
const NV_OAUTH_INTENT='novella-oauth-intent-v11';
const NV_GOOGLE_EXPECTED='novella-oauth-expected-account-v11';
const nvExpectedGoogleSet=id=>{try{if(id)sessionStorage.setItem(NV_GOOGLE_EXPECTED,id);else sessionStorage.removeItem(NV_GOOGLE_EXPECTED)}catch{}};
const nvExpectedGoogleTake=()=>{try{const id=sessionStorage.getItem(NV_GOOGLE_EXPECTED)||'';sessionStorage.removeItem(NV_GOOGLE_EXPECTED);return id}catch{return ''}};
const nvIntentSet=value=>{try{sessionStorage.setItem(NV_OAUTH_INTENT,value)}catch{}};
const nvIntentTake=()=>{try{const v=sessionStorage.getItem(NV_OAUTH_INTENT)||'';sessionStorage.removeItem(NV_OAUTH_INTENT);return v}catch{return ''}};
// Capture the INITIAL URL, before any browser-history manipulation or Supabase
// OAuth parsing. The default Supabase browser OAuth flow returns access_token
// and refresh_token in the URL fragment. Deleting that fragment before the SDK
// reads it makes a successful Google login appear to fail and reopens the picker.
const nvAuthReturnAtBoot=(()=>{
 try{
  const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,''));
  return ['access_token','refresh_token','code','error','error_code','error_description'].some(k=>query.has(k)||hash.has(k)) ||
   !!sessionStorage.getItem(NV_OAUTH_INTENT);
 }catch{return false}
})();
const nvAuthRedirectErrorAtBoot=(()=>{
 try{
  const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.replace(/^#/,''));
  return !!(q.get('error')||q.get('error_code')||h.get('error')||h.get('error_code'));
 }catch{return false}
})();
function clearNovellaDeviceData(){
 try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&((k.startsWith(KEY)&&k!==NV_KNOWN_ACCOUNTS_KEY)||k.startsWith('novella-reader-')))localStorage.removeItem(k)}}catch{}
 guestShelf=[];guestHistory=[];nvAuthEmailDraft='';
 nv205ResetMemory();nvPhotoOriginalClearBrowser();try{indexedDB.deleteDatabase(NV209_DB)}catch{}
}

let homeRefreshId=0, homeRefreshPending=false, surpriseBusy=false;
let guestShelf=getLocal('guest-shelf',[]),guestHistory=getLocal('guest-history',[]);
let shelves=[],historyRows=[],bookMap=new Map(),userTheme=getLocal('theme','light'),shelfFilter='all';
let nvJournalQuery='',nvJournalFilter='all',nvShelfQuery='',nvPersonalSearchOwner='guest';
let nv208ShelfSort='recent',nv208ShelfCollection='all',nv208ShelfGenre='all',nv208RecMood='all',nv208RecComplete=false;

// Novella 2.0.5: reading sync is independent of OAuth and the existing
// shelves/reading_history tables. The server migration is required for cloud sync.
const NV205_TABLE='novella_reader_state';
const nv205States=new Map(),nv205Pending=new Map(),nv205Timers=new Map();
const nv205Summary=new Map();
let nv205CloudReady=false,nv205CloudIssue='';
/* 2.1.10: per-record retry guards keep temporary network failures from
   stranding saved positions. Failed writes remain account-scoped on-device. */
const nv210ProgressActive=new Set(),nv210NotesActive=new Set();
const nv210ProgressAttempts=new Map(),nv210NotesAttempts=new Map();
let nv210ManualSyncBusy=false,nv210ManualSyncMessage='';
function nv210Retryable(error){
 const code=Number(error?.status||error?.code||0);
 if([408,425,429,500,502,503,504].includes(code))return true;
 const msg=String(error?.message||error||'');
 // Permission, revoked-session and missing-table errors require a real fix, not repeated writes.
 if(/permission|not authorized|unauthori[sz]ed|invalid.*jwt|401|403|row.level|does not exist|could not find the function|not found|404|PGRST202|42501/i.test(msg))return false;
 return /fetch|network|timeout|timed out|temporar|connection|unavailable|rate.limit|gateway|server error|5\d\d|429/i.test(msg);
}
function nv210ScheduleRetry(kind,key,error){
 if(!nvMember()||navigator.onLine===false||!nv210Retryable(error))return;
 const progress=kind==='progress';
 const attempts=progress?nv210ProgressAttempts:nv210NotesAttempts;
 const timers=progress?nv205Timers:nv206Timers;
 const pending=progress?nv205Pending:nv206Pending;
 if(!pending.has(key))return;
 const next=(attempts.get(key)||0)+1;
 if(next>3)return;
 attempts.set(key,next);
 clearTimeout(timers.get(key));
 const delay=[3000,9000,22000][next-1];
 timers.set(key,setTimeout(()=>{
  timers.delete(key);
  if(!nvMember()||!pending.has(key)||navigator.onLine===false)return;
  void (progress?nv205Flush(key):nv206Flush(key));
 },delay));
}
function nv210ResetRetryState(){
 nv210ProgressAttempts.clear();nv210NotesAttempts.clear();
 // In-flight requests complete against their original owner; they do not authorize
 // writes under a newly selected account.
}
function nv210SyncStatus(){
 if(!nvMember())return 'Sign in to sync your reading progress and highlights.';
 if(navigator.onLine===false)return 'You are offline. Your changes stay on this device until you reconnect.';
 const owner=me.id;
 const positions=[...nv205Pending.values()].filter(r=>r?.user_id===owner).length;
 const notes=[...nv206Pending.values()].filter(r=>r?.user_id===owner).length;
 if(positions||notes)return `${positions} reading position${positions===1?'':'s'} and ${notes} note${notes===1?'':'s'} waiting to sync.`;
 return nv205CloudReady&&nv206CloudReady?'Your progress and notes are connected.':'Your saved changes are kept on this device while Novella checks cloud sync.';
}
function nv210SyncPaint(){
 const node=document.getElementById('nv210-sync-status');
 if(node)node.textContent=nv210ManualSyncMessage||nv210SyncStatus();
 const button=document.querySelector('[data-nv210-sync]');
 if(button){button.disabled=nv210ManualSyncBusy;button.setAttribute('aria-busy',String(nv210ManualSyncBusy));}
}
async function nv210SyncNow(){
 if(nv210ManualSyncBusy)return;
 if(!nvRequireMember('sync your books and reading notes'))return;
 if(navigator.onLine===false){nv210ManualSyncMessage='You are offline. Reconnect and try syncing again.';nv210SyncPaint();return}
 const owner=me.id,client=db;
 nv210ManualSyncBusy=true;nv210ManualSyncMessage='Checking your reading data…';nv210SyncPaint();
 try{
  // Use the existing, owner-checked cloud merges and preserve unsynced changes.
  await Promise.all([nv205LoadSummary(owner),nv206Load(owner)]);
  if(!nvMember()||me.id!==owner||db!==client)return;
  nv210ProgressAttempts.clear();nv210NotesAttempts.clear();
  const tasks=[];
  for(const [key,row] of nv205Pending)if(row.user_id===owner)tasks.push(nv205Flush(key));
  for(const [key,row] of nv206Pending)if(row.user_id===owner)tasks.push(nv206Flush(key));
  await Promise.allSettled(tasks);
  if(!nvMember()||me.id!==owner||db!==client)return;
  const waiting=[...nv205Pending.values(),...nv206Pending.values()].filter(r=>r?.user_id===owner).length;
  nv210ManualSyncMessage=waiting?`${waiting} change${waiting===1?'':'s'} saved on this device. Novella will retry when the connection is available.`:
   nv205CloudReady&&nv206CloudReady?'Reading progress and notes are up to date.':'Sync checked. Some cloud features may need their Supabase setup.';
 }catch{
  if(me?.id===owner)nv210ManualSyncMessage='Could not finish syncing. Your changes are still kept on this device.';
 }finally{nv210ManualSyncBusy=false;nv210SyncPaint()}
}
document.addEventListener('click',event=>{
 const button=event.target instanceof Element?event.target.closest('[data-nv210-sync]'):null;
 if(!button)return;event.preventDefault();void nv210SyncNow();
});
window.addEventListener('online',()=>{nv210ManualSyncMessage='';nv210SyncPaint()});
window.addEventListener('offline',()=>{nv210ManualSyncMessage='';nv210SyncPaint()});
const nv205Id=(owner,bookKey,edition)=>owner+'|'+bookKey+'|'+edition;
const nv205LocalKey=(owner,bookKey,edition)=>KEY+'reader-state-v205:'+encodeURIComponent(owner)+':'+encodeURIComponent(bookKey)+':'+encodeURIComponent(edition);
const nv205Clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
function nv205Normal(row){
 if(!row||typeof row!=='object')return null;
 return {user_id:String(row.user_id||''),book_key:String(row.book_key||'').slice(0,160),edition_key:String(row.edition_key||'').slice(0,200),
  format:['text','epub','pdf'].includes(row.format)?row.format:'text',progress:nv205Clamp(row.progress),locator:String(row.locator||'').slice(0,700),
  bookmark_progress:row.bookmark_progress==null?null:nv205Clamp(row.bookmark_progress),bookmark_locator:String(row.bookmark_locator||'').slice(0,700),updated_at:String(row.updated_at||'')};
}
function nv205LocalGet(owner,bookKey,edition){
 if(!owner)return null;
 const key=nv205Id(owner,bookKey,edition);
 if(nv205States.has(key))return nv205States.get(key);
 let row=null;try{row=nv205Normal(JSON.parse(localStorage.getItem(nv205LocalKey(owner,bookKey,edition))||'null'))}catch{}
 if(row&&row.user_id===owner&&row.book_key===bookKey&&row.edition_key===edition)nv205States.set(key,row);
 return row;
}
function nv205Summarize(row){
 if(!row||!row.user_id||!row.book_key)return;
 const k=row.user_id+'|'+row.book_key,prev=nv205Summary.get(k);
 if(!prev||Date.parse(row.updated_at||0)>=Date.parse(prev.updated_at||0))nv205Summary.set(k,row);
}
function nv205LocalSet(row){
 const r=nv205Normal(row);if(!r?.user_id||!r.book_key||!r.edition_key)return null;
 nv205States.set(nv205Id(r.user_id,r.book_key,r.edition_key),r);
 nv205Summarize(r);
 try{localStorage.setItem(nv205LocalKey(r.user_id,r.book_key,r.edition_key),JSON.stringify(r))}catch{}
 return r;
}
function nv205BookState(bookKey){
 if(!nvMember())return null;
 const owner=me.id,k=owner+'|'+bookKey;
 const fromMap=nv205Summary.get(k);if(fromMap)return fromMap;
 // Public-domain text uses a stable edition ID across devices.
 const local=nv205LocalGet(owner,bookKey,'gutenberg:text');
 if(local)nv205Summarize(local);
 return local;
}
function nv205ReaderIndicator(status){
 const element=document.querySelector('#nv205-reader-sync');if(!element)return;
 const meaning={synced:'☁ Synced',pending:'↻ Saving progress',device:'◌ Saved on this device',loading:'↻ Checking your place',guest:'Sign in to save progress'};
 element.dataset.state=status;element.textContent=meaning[status]||meaning.device;
}
function nv205Stage(bookKey,edition,patch={},immediate=false){
 if(!nvMember()||!bookKey||!edition)return null;
 const owner=me.id,key=nv205Id(owner,bookKey,edition),old=nv205LocalGet(owner,bookKey,edition);
 const row=nv205LocalSet({...old,user_id:owner,book_key:bookKey,edition_key:edition,format:patch.format||old?.format||'text',
  progress:patch.progress??old?.progress??0,locator:patch.locator??old?.locator??'',
  bookmark_progress:patch.bookmark_progress!==undefined?patch.bookmark_progress:old?.bookmark_progress??null,
  bookmark_locator:patch.bookmark_locator??old?.bookmark_locator??'',updated_at:new Date().toISOString()});
 if(!row)return null;
 nv205Pending.set(key,row);nv205ReaderIndicator('pending');
 clearTimeout(nv205Timers.get(key));
 nv205Timers.set(key,setTimeout(()=>{nv205Timers.delete(key);void nv205Flush(key)},immediate?0:1800));
 return row;
}
async function nv205Flush(key){
 const row=nv205Pending.get(key);if(!row)return;
 if(!nvMember()||me.id!==row.user_id||!db)return;
 const client=db;
 if(navigator.onLine===false){nv205ReaderIndicator('device');return}
 if(nv210ProgressActive.has(key))return;
 nv210ProgressActive.add(key);
 try{
  const {error}=await client.rpc('novella_save_reader_state',{
    p_book_key:row.book_key,p_edition_key:row.edition_key,p_format:row.format,
    p_progress:row.progress,p_locator:row.locator,p_bookmark_progress:row.bookmark_progress,
    p_bookmark_locator:row.bookmark_locator,p_updated_at:row.updated_at});
  if(error)throw error;
  if(!nvMember()||me.id!==row.user_id||db!==client)return;
  if(nv205Pending.get(key)?.updated_at===row.updated_at){nv205Pending.delete(key);nv205ReaderIndicator('synced')}
  else if(nv205Pending.has(key)){clearTimeout(nv205Timers.get(key));nv205Timers.set(key,setTimeout(()=>void nv205Flush(key),600))}
  nv205CloudReady=true;nv205CloudIssue='';nv210ProgressAttempts.delete(key);
 }catch(err){
  if(nvMember()&&me.id===row.user_id&&db===client){
   nv205CloudIssue=String(err?.message||'Cloud sync unavailable');
   nv205ReaderIndicator('device');
   // Keep the local copy, retry only transient failures, and never discard it.
   nv210ScheduleRetry('progress',key,err);
  }
 }finally{nv210ProgressActive.delete(key);nv210SyncPaint()}
}
async function nv205GetState(bookKey,edition){
 if(!nvMember())return null;
 const owner=me.id,key=nv205Id(owner,bookKey,edition),local=nv205LocalGet(owner,bookKey,edition);
 if(!navigator.onLine)return local;
 const client=db;
 try{
  const {data,error}=await client.from(NV205_TABLE).select('*').eq('user_id',owner).eq('book_key',bookKey).eq('edition_key',edition).maybeSingle();
  if(error)throw error;
  if(!nvMember()||me.id!==owner||db!==client)return null;
  nv205CloudReady=true;nv205CloudIssue='';
  const current=nv205LocalGet(owner,bookKey,edition);
  const remote=nv205Normal(data);
  if(remote&&(remote.user_id!==owner||remote.book_key!==bookKey||remote.edition_key!==edition))throw Error('Unexpected reading-state owner or edition');
  if(remote&&(!current||Date.parse(remote.updated_at)>Date.parse(current.updated_at))){
   return nv205LocalSet(remote);
  }
  if(current&&(!remote||Date.parse(current.updated_at)>Date.parse(remote.updated_at))) {
   nv205Pending.set(key,current);clearTimeout(nv205Timers.get(key));nv205Timers.set(key,setTimeout(()=>void nv205Flush(key),150));
  }
  return current;
 }catch(err){nv205CloudIssue=String(err?.message||'Cloud sync unavailable');return nv205LocalGet(owner,bookKey,edition)}
}
function nv205ResetMemory(){
 for(const timer of nv205Timers.values())clearTimeout(timer);
 nv205Timers.clear();nv205Pending.clear();nv205States.clear();nv205Summary.clear();
 nv210ResetRetryState();nv210ManualSyncMessage='';
 nv205CloudReady=false;nv205CloudIssue='';
}
function nv205LocalRows(owner){
 if(!owner)return [];
 const prefix=KEY+'reader-state-v205:'+encodeURIComponent(owner)+':';
 const records=[];
 try{
  for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);if(!k?.startsWith(prefix))continue;
   const row=nv205Normal(JSON.parse(localStorage.getItem(k)||'null'));
   if(row?.user_id===owner&&row.book_key&&row.edition_key)records.push(row);
  }
 }catch{}
 return records;
}
function nv205UpdateBanner(){
 const label=document.querySelector('#nv205-sync-message');if(!label)return;
 label.textContent=nv205Pending.size?'Your latest reading changes are saved here while Novella syncs them.':nv205CloudReady?'Your reading progress is connected.':'Your place is saved on this device. We’ll sync it when your account connection is available.';
}
async function nv205LoadSummary(owner){
 if(!owner||!db)return;
 const client=db;
 try{
  const {data,error}=await client.from(NV205_TABLE).select('*').eq('user_id',owner).order('updated_at',{ascending:false}).limit(1000);
  if(error)throw error;
  if(!nvMember()||me.id!==owner||db!==client)return;
  nv205CloudReady=true;nv205CloudIssue='';
  const cloud=new Map();
  for(const item of data||[]){const row=nv205Normal(item);if(!row||row.user_id!==owner)continue;
   const key=nv205Id(owner,row.book_key,row.edition_key);cloud.set(key,row);
   const local=nv205LocalGet(owner,row.book_key,row.edition_key);
   if(!local||Date.parse(row.updated_at)>Date.parse(local.updated_at))nv205LocalSet(row);
  }
  // Recover locally-saved changes from earlier offline sessions, including
  // books the reader hasn't reopened after coming back online.
  for(const row of nv205LocalRows(owner)){
   const key=nv205Id(owner,row.book_key,row.edition_key),remote=cloud.get(key);
   if(!remote||Date.parse(row.updated_at)>Date.parse(remote.updated_at)){
    nv205LocalSet(row);nv205Pending.set(key,row);
    clearTimeout(nv205Timers.get(key));nv205Timers.set(key,setTimeout(()=>void nv205Flush(key),200));
   }
  }
  nv205UpdateBanner();
  if(screen==='library')nvRefreshShelfResults();
  if(screen==='home')paint();
 }catch(err){if(me?.id===owner){nv205CloudIssue=String(err?.message||'Cloud sync not configured');nv205UpdateBanner()}}
}
window.addEventListener('online',()=>{if(!nvMember())return;for(const [key,row] of nv205Pending){if(row.user_id===me.id)void nv205Flush(key)}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')return;for(const [key,row] of nv205Pending){if(me?.id===row.user_id){clearTimeout(nv205Timers.get(key));void nv205Flush(key)}}});


/* Novella 2.0.6: account-scoped annotations. Cloud sync is optional until the
   owner applies novella_206_setup.sql. A note can never be read under a
   different Supabase account. Tombstones preserve offline deletions. */
const NV206_TABLE='novella_reader_notes';
const nv206Cache=new Map(),nv206Pending=new Map(),nv206Timers=new Map(),nv206Loaded=new Set();
let nv206CloudReady=false,nv206TargetNote=null;
const nv206StoragePrefix=owner=>KEY+'annotation-v206:'+encodeURIComponent(owner)+':';
const nv206Colors=['lavender','mint','peach'];
function nv206Uuid(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return [...bytes].map((v,i)=>v.toString(16).padStart(2,'0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5')}
function nv206Normal(row){
 if(!row||typeof row!=='object')return null;
 const id=String(row.note_id||'');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return null;
 const owner=String(row.user_id||''),book=String(row.book_key||'').slice(0,160),edition=String(row.edition_key||'').slice(0,200);
 if(!owner||!book||!edition)return null;
 return {note_id:id,user_id:owner,book_key:book,edition_key:edition,title:String(row.title||'Untitled book').slice(0,220),author:String(row.author||'').slice(0,160),quote:String(row.quote||'').slice(0,500),note:String(row.note||'').slice(0,4000),paragraph_index:Math.max(0,Math.min(999999,Math.floor(Number(row.paragraph_index)||0))),start_offset:Math.max(0,Math.min(1000000,Math.floor(Number(row.start_offset)||0))),color:nv206Colors.includes(row.color)?row.color:'lavender',deleted:row.deleted===true,updated_at:String(row.updated_at||new Date().toISOString())};
}
function nv206Hydrate(owner){
 if(!owner||nv206Loaded.has(owner))return;
 nv206Loaded.add(owner);const prefix=nv206StoragePrefix(owner);
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const row=nv206Normal(JSON.parse(localStorage.getItem(key)||'null'));if(row?.user_id===owner)nv206Cache.set(row.note_id,row)}}catch{}
}
function nv206Store(value){
 const row=nv206Normal(value);if(!row)return null;nv206Cache.set(row.note_id,row);
 try{localStorage.setItem(nv206StoragePrefix(row.user_id)+row.note_id,JSON.stringify(row))}catch{notify('Browser storage is unavailable. Your note is kept for this session; cloud sync can preserve it if connected.')}
 document.dispatchEvent(new CustomEvent('nv206-changed',{detail:{owner:row.user_id,book:row.book_key,edition:row.edition_key}}));
 return row;
}
function nv206Rows(owner,book='',edition='',includeDeleted=false){
 if(!owner)return[];nv206Hydrate(owner);
 return [...nv206Cache.values()].filter(r=>r.user_id===owner&&(!book||r.book_key===book)&&(!edition||r.edition_key===edition)&&(includeDeleted||!r.deleted)).sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0));
}
function nv206Stage(value){
 if(!nvMember())return null;
 const row=nv206Store({...value,user_id:me.id,updated_at:new Date().toISOString()});if(!row)return null;
 nv206Pending.set(row.note_id,row);clearTimeout(nv206Timers.get(row.note_id));
 nv206Timers.set(row.note_id,setTimeout(()=>{nv206Timers.delete(row.note_id);void nv206Flush(row.note_id)},650));
 return row;
}
async function nv206Flush(noteId){
 const row=nv206Pending.get(noteId);if(!row||!nvMember()||me.id!==row.user_id||!db||navigator.onLine===false)return;
 const client=db;
 if(nv210NotesActive.has(noteId))return;
 nv210NotesActive.add(noteId);
 try{const {error}=await client.rpc('novella_save_reader_note',{
  p_note_id:row.note_id,p_book_key:row.book_key,p_edition_key:row.edition_key,p_title:row.title,p_author:row.author,
  p_quote:row.quote,p_note:row.note,p_paragraph_index:row.paragraph_index,p_start_offset:row.start_offset,
  p_color:row.color,p_deleted:row.deleted,p_updated_at:row.updated_at});
  if(error)throw error;
  if(!nvMember()||me.id!==row.user_id||db!==client)return;
  if(nv206Pending.get(noteId)?.updated_at===row.updated_at)nv206Pending.delete(noteId);
  nv210NotesAttempts.delete(noteId);nv206CloudReady=true;
 }catch(err){
  if(nvMember()&&me.id===row.user_id&&db===client){
   nv206CloudReady=false;
   nv210ScheduleRetry('notes',noteId,err);
  }
 }finally{nv210NotesActive.delete(noteId);nv210SyncPaint()}
}
async function nv206Load(owner){
 if(!owner||!db||!nvMember()||me.id!==owner)return;
 nv206Hydrate(owner);const client=db;
 try{const {data,error}=await client.from(NV206_TABLE).select('*').eq('user_id',owner).order('updated_at',{ascending:false}).limit(1500);
  if(error)throw error;if(!nvMember()||me.id!==owner||db!==client)return;
  nv206CloudReady=true;const remote=new Map();
  for(const raw of data||[]){const row=nv206Normal(raw);if(!row||row.user_id!==owner)continue;remote.set(row.note_id,row);const local=nv206Cache.get(row.note_id);
    if(!local||Date.parse(row.updated_at)>Date.parse(local.updated_at))nv206Store(row)}
  for(const local of nv206Rows(owner,'','',true)){
   const remoteRow=remote.get(local.note_id);if(!remoteRow||Date.parse(local.updated_at)>Date.parse(remoteRow.updated_at)){
    nv206Pending.set(local.note_id,local);void nv206Flush(local.note_id);
   }
  }
  if(screen==='history'&&nvJournalFilter==='highlights')nvRefreshJournalResults();
 }catch{nv206CloudReady=false}
}
window.addEventListener('online',()=>{if(!nvMember())return;void nv206Load(me.id);for(const [id,r] of nv206Pending){if(r.user_id===me.id)void nv206Flush(id)}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&nvMember())for(const [id,r] of nv206Pending)if(r.user_id===me.id)void nv206Flush(id)});
function nv206JournalMarkup(){
 const owner=nvMember()?me.id:'';const tokens=nvJournalQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const items=nv206Rows(owner).filter(row=>tokens.every(t=>(row.title+' '+row.author+' '+row.quote+' '+row.note).toLocaleLowerCase().includes(t)));
 if(!items.length)return `<div class="empty"><h3>${tokens.length?'No matching highlights.':'Your favorite passages belong here.'}</h3><p>${tokens.length?'Try another word or phrase.':'While reading a text book, select a passage and tap Highlight. Your notes will appear here.'}</p></div>`;
 return `<div class="nv206-journal-grid">${items.map(row=>`<article class="nv206-journal-card"><h3>${esc(row.title)}</h3><small>${esc(row.author||'Your reading notes')}</small>${row.quote?`<blockquote>${esc(row.quote)}</blockquote>`:''}${row.note?`<p>${esc(row.note)}</p>`:''}<button type="button" data-nv206-open="${esc(row.note_id)}">Open in reader ↗</button></article>`).join('')}</div>`;
}

function nvEnsurePersonalSearchOwner(){const owner=String(me?.id||'guest');if(nvPersonalSearchOwner!==owner){nvPersonalSearchOwner=owner;nvJournalQuery='';nvJournalFilter='all';nvShelfQuery='';shelfFilter='all';nv208ShelfSort='recent';nv208ShelfCollection='all';nv208ShelfGenre='all';nv208RecMood='all';nv208RecComplete=false;nv201SuggestionMemo=null}}
const popular=['Fiction','Fantasy','Romance','Mystery','Science Fiction','Biography','History','Poetry','Horror','Thriller','Young Adult','Philosophy'];
const GROUPS={
  'Fiction & stories':['Fiction','Literary Fiction','Contemporary Fiction','Historical Fiction','Classics','Adventure','Action','Mystery','Detective Fiction','Crime Fiction','Thriller','Psychological Thriller','Suspense','Horror','Gothic Fiction','Dystopian Fiction','Satire','Humor','Short Stories','Novels','Novellas','Drama','Magical Realism','Family Saga','Coming of Age','War Fiction'],
  'Fantasy & science fiction':['Fantasy','Epic Fantasy','High Fantasy','Dark Fantasy','Urban Fantasy','Romantasy','Fairy Tales','Folklore','Mythology','Magic','Dragons','Science Fiction','Space Opera','Cyberpunk','Steampunk','Time Travel','Alternate History','Post-Apocalyptic','Dystopia','Utopia','Artificial Intelligence','Robots','Aliens','Superheroes'],
  'Love & relationships':['Romance','Historical Romance','Contemporary Romance','Romantic Comedy','Paranormal Romance','Fantasy Romance','Dark Romance','Sports Romance','LGBTQ Fiction','Queer Romance','Family','Friendship','Marriage','Relationships','New Adult'],
  'For younger readers':['Young Adult','Middle Grade','Children’s Fiction','Picture Books','Early Readers','Bedtime Stories','School Stories','Teen Fiction','Educational Books','Graphic Novels','Manga','Comics','Folktales'],
  'Life & knowledge':['Biography','Autobiography','Memoir','History','World History','Ancient History','Modern History','Politics','Economics','Business','Entrepreneurship','Finance','Investing','Psychology','Philosophy','Self-Help','Personal Development','Productivity','Leadership','Education','Language Learning','Religion','Spirituality','Sociology','Anthropology','Feminism','True Crime','Law'],
  'Science & creativity':['Science','Popular Science','Mathematics','Physics','Chemistry','Biology','Astronomy','Space','Environment','Nature','Medicine','Health','Fitness','Nutrition','Technology','Computers','Programming','Artificial Intelligence','Machine Learning','Engineering','Design','Art','Art History','Architecture','Photography','Music','Poetry','Theater','Film'],
  'Hobbies & world':['Travel','Geography','Cooking','Food','Baking','Gardening','Crafts','DIY','Sports','Football','Cricket','Games','Chess','Pets','Wildlife','Parenting','Reference','Essays','Journalism']
};
const allGenres=[...new Set(Object.values(GROUPS).flat())];
const id=b=>b.source+':'+b.id;
const remember=b=>{bookMap.set(id(b),b);return b};
const notify=m=>{const t=$('#toast');t.textContent=m;t.classList.remove('hidden');clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>t.classList.add('hidden'),4200)};
const icons={heart:'♡',star:'★'};
const seed=[
  {id:'1342',title:'Pride and Prejudice',author:'Jane Austen',cover:'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg'},
  {id:'84',title:'Frankenstein',author:'Mary Shelley',cover:'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg'},
  {id:'2701',title:'Moby-Dick',author:'Herman Melville',cover:'https://www.gutenberg.org/cache/epub/2701/pg2701.cover.medium.jpg'},
  {id:'11',title:'Alice’s Adventures in Wonderland',author:'Lewis Carroll',cover:'https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg'},
  {id:'1661',title:'The Adventures of Sherlock Holmes',author:'Arthur Conan Doyle',cover:'https://www.gutenberg.org/cache/epub/1661/pg1661.cover.medium.jpg'},
  {id:'174',title:'The Picture of Dorian Gray',author:'Oscar Wilde',cover:'https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg'}
].map(b=>remember({...b,source:'gutenberg',description:'Explore this public-domain classic from Project Gutenberg.',genres:['Classics','Fiction'],year:'',pages:'',preview:null,buy:null,isbn:'',formats:{},seed:true}));

// Bundled catalogue: instant, real public-domain reading picks on a first-ever visit.
// External catalogue metadata and cover images still load online and may vary by region.
const NV_STARTER = [...seed, ...[
  {"id": "345", "title": "Dracula", "author": "Bram Stoker"},
  {"id": "76", "title": "Adventures of Huckleberry Finn", "author": "Mark Twain"},
  {"id": "74", "title": "The Adventures of Tom Sawyer", "author": "Mark Twain"},
  {"id": "98", "title": "A Tale of Two Cities", "author": "Charles Dickens"},
  {"id": "158", "title": "Emma", "author": "Jane Austen"},
  {"id": "514", "title": "Little Women", "author": "Louisa May Alcott"},
  {"id": "1260", "title": "Jane Eyre", "author": "Charlotte Brontë"},
  {"id": "768", "title": "Wuthering Heights", "author": "Emily Brontë"},
  {"id": "1400", "title": "Great Expectations", "author": "Charles Dickens"},
  {"id": "43", "title": "The Strange Case of Dr. Jekyll and Mr. Hyde", "author": "Robert Louis Stevenson"},
  {"id": "36", "title": "The War of the Worlds", "author": "H. G. Wells"},
  {"id": "35", "title": "The Time Machine", "author": "H. G. Wells"},
  {"id": "120", "title": "Treasure Island", "author": "Robert Louis Stevenson"},
  {"id": "55", "title": "The Wonderful Wizard of Oz", "author": "L. Frank Baum"},
  {"id": "16", "title": "Peter Pan", "author": "J. M. Barrie"},
  {"id": "145", "title": "Middlemarch", "author": "George Eliot"},
  {"id": "2600", "title": "War and Peace", "author": "Leo Tolstoy"},
  {"id": "215", "title": "The Call of the Wild", "author": "Jack London"},
  {"id": "46", "title": "A Christmas Carol", "author": "Charles Dickens"},
  {"id": "1257", "title": "The Three Musketeers", "author": "Alexandre Dumas"},
  {"id": "730", "title": "Oliver Twist", "author": "Charles Dickens"},
  {"id": "219", "title": "Heart of Darkness", "author": "Joseph Conrad"},
  {"id": "161", "title": "Sense and Sensibility", "author": "Jane Austen"},
  {"id": "105", "title": "Persuasion", "author": "Jane Austen"},
  {"id": "164", "title": "Twenty Thousand Leagues Under the Seas", "author": "Jules Verne"},
  {"id": "2554", "title": "Crime and Punishment", "author": "Fyodor Dostoyevsky"},
  {"id": "996", "title": "Don Quixote", "author": "Miguel de Cervantes"},
  {"id": "1727", "title": "The Odyssey", "author": "Homer"},
  {"id": "2591", "title": "Grimms’ Fairy Tales", "author": "Jacob and Wilhelm Grimm"},
  {"id": "521", "title": "The Adventures of Pinocchio", "author": "Carlo Collodi"},
  {"id": "2542", "title": "A Doll’s House", "author": "Henrik Ibsen"},
  {"id": "1232", "title": "The Prince", "author": "Niccolò Machiavelli"},
  {"id": "2097", "title": "The Sign of the Four", "author": "Arthur Conan Doyle"},
  {"id": "205", "title": "Walden", "author": "Henry David Thoreau"}
].map(b=>remember({...b,source:'gutenberg',cover:`https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.cover.medium.jpg`,description:'A public-domain title from Project Gutenberg. Availability and rights may vary by country.',genres:['Classics','Literature'],year:'',pages:'',preview:null,buy:null,isbn:'',formats:{},seed:true}))];

const NV_ARCHIVE_EDITIONS = [
 [
  "174",
  "The Picture of Dorian Gray",
  "Oscar Wilde",
  "The-Picture-of-Dorian-Gray",
  "174.txt",
  "Gothic Fiction"
 ],
 [
  "345",
  "Dracula",
  "Bram Stoker",
  "Dracula",
  "345.txt",
  "Horror"
 ],
 [
  "74",
  "The Adventures of Tom Sawyer",
  "Mark Twain",
  "The-Adventures-of-Tom-Sawyer",
  "74.txt",
  "Adventure"
 ],
 [
  "1952",
  "The Yellow Wallpaper",
  "Charlotte Perkins Gilman",
  "The-Yellow-Wallpaper",
  "1952.txt",
  "Horror"
 ],
 [
  "4300",
  "Ulysses",
  "James Joyce",
  "Ulysses",
  "4300.txt",
  "Literary Fiction"
 ],
 [
  "5200",
  "The Metamorphosis",
  "Franz Kafka",
  "Metamorphosis",
  "5200.txt",
  "Literary Fiction"
 ],
 [
  "1232",
  "The Prince",
  "Niccolò Machiavelli",
  "The-Prince",
  "1232.txt",
  "Philosophy"
 ],
 [
  "6130",
  "The Iliad",
  "Homer",
  "The-Iliad",
  "6130-0.txt",
  "Mythology"
 ],
 [
  "1184",
  "The Count of Monte Cristo",
  "Alexandre Dumas",
  "The-Count-of-Monte-Cristo",
  "1184.txt",
  "Adventure"
 ],
 [
  "1080",
  "A Modest Proposal",
  "Jonathan Swift",
  "A-Modest-Proposal",
  "1080.txt",
  "Satire"
 ],
 [
  "2814",
  "Dubliners",
  "James Joyce",
  "Dubliners",
  "2814.txt",
  "Short Stories"
 ],
 [
  "1260",
  "Jane Eyre",
  "Charlotte Brontë",
  "Jane-Eyre",
  "1260.txt",
  "Romance"
 ],
 [
  "829",
  "Gulliver’s Travels",
  "Jonathan Swift",
  "Gulliver-s-Travels",
  "829-0.txt",
  "Adventure"
 ],
 [
  "161",
  "Sense and Sensibility",
  "Jane Austen",
  "Sense-and-Sensibility",
  "161.txt",
  "Romance"
 ],
 [
  "2500",
  "Siddhartha",
  "Hermann Hesse",
  "Siddhartha",
  "2500.txt",
  "Philosophy"
 ],
 [
  "2542",
  "A Doll’s House",
  "Henrik Ibsen",
  "A-Doll-s-House---a-play",
  "2542.txt",
  "Drama"
 ],
 [
  "120",
  "Treasure Island",
  "Robert Louis Stevenson",
  "Treasure-Island",
  "120.txt",
  "Adventure"
 ],
 [
  "23",
  "Narrative of the Life of Frederick Douglass",
  "Frederick Douglass",
  "Narrative-of-the-Life-of-Frederick-Douglass",
  "23.txt",
  "Autobiography"
 ],
 [
  "215",
  "The Call of the Wild",
  "Jack London",
  "The-Call-of-the-Wild",
  "215.txt",
  "Adventure"
 ],
 [
  "1257",
  "The Three Musketeers",
  "Alexandre Dumas",
  "The-Three-Musketeers",
  "1257-0.txt",
  "Adventure"
 ],
 [
  "19942",
  "Candide",
  "Voltaire",
  "Candide",
  "19942.txt",
  "Satire"
 ],
 [
  "141",
  "Mansfield Park",
  "Jane Austen",
  "Mansfield-Park",
  "141.txt",
  "Romance"
 ],
 [
  "3296",
  "The Confessions of St. Augustine",
  "Augustine of Hippo",
  "The-Confessions-of-St.-Augustine",
  "3296.txt",
  "Philosophy"
 ],
 [
  "3207",
  "Leviathan",
  "Thomas Hobbes",
  "Leviathan",
  "3207.txt",
  "Philosophy"
 ],
 [
  "2097",
  "The Sign of the Four",
  "Arthur Conan Doyle",
  "The-Sign-of-the-Four",
  "2097.txt",
  "Mystery"
 ],
 [
  "2413",
  "Madame Bovary",
  "Gustave Flaubert",
  "Madame-Bovary",
  "2413.txt",
  "Literary Fiction"
 ],
 [
  "514",
  "Little Women",
  "Louisa May Alcott",
  "Little-Women",
  "514.txt",
  "Family"
 ],
 [
  "10007",
  "Carmilla",
  "Sheridan Le Fanu",
  "Carmilla",
  "10007.txt",
  "Horror"
 ],
 [
  "805",
  "This Side of Paradise",
  "F. Scott Fitzgerald",
  "This-Side-of-Paradise",
  "805.txt",
  "Literary Fiction"
 ],
 [
  "121",
  "Northanger Abbey",
  "Jane Austen",
  "Northanger-Abbey",
  "121.txt",
  "Romance"
 ],
 [
  "145",
  "Middlemarch",
  "George Eliot",
  "Middlemarch",
  "145.txt",
  "Literary Fiction"
 ],
 [
  "8492",
  "The King in Yellow",
  "Robert W. Chambers",
  "The-King-in-Yellow",
  "8492.txt",
  "Horror"
 ],
 [
  "34901",
  "On Liberty",
  "John Stuart Mill",
  "On-Liberty",
  "34901.txt",
  "Philosophy"
 ],
 [
  "526",
  "Heart of Darkness",
  "Joseph Conrad",
  "Heart-of-Darkness",
  "526.txt",
  "Literary Fiction"
 ],
 [
  "1597",
  "Andersen’s Fairy Tales",
  "Hans Christian Andersen",
  "Andersen-s-Fairy-Tales",
  "1597.txt",
  "Fairy Tales"
 ],
 [
  "421",
  "Kidnapped",
  "Robert Louis Stevenson",
  "Kidnapped",
  "421.txt",
  "Adventure"
 ],
 [
  "3177",
  "Roughing It",
  "Mark Twain",
  "Roughing-It",
  "3177.txt",
  "Travel"
 ],
 [
  "7849",
  "The Trial",
  "Franz Kafka",
  "The-Trial",
  "7849.txt",
  "Literary Fiction"
 ],
 [
  "834",
  "The Memoirs of Sherlock Holmes",
  "Arthur Conan Doyle",
  "The-Memoirs-of-Sherlock-Holmes",
  "834.txt",
  "Mystery"
 ],
 [
  "209",
  "The Turn of the Screw",
  "Henry James",
  "The-Turn-of-the-Screw",
  "209.txt",
  "Horror"
 ],
 [
  "4280",
  "The Critique of Pure Reason",
  "Immanuel Kant",
  "The-Critique-of-Pure-Reason",
  "4280.txt",
  "Philosophy"
 ],
 [
  "972",
  "The Devil’s Dictionary",
  "Ambrose Bierce",
  "The-Devil-s-Dictionary",
  "972.txt",
  "Satire"
 ],
 [
  "113",
  "The Secret Garden",
  "Frances Hodgson Burnett",
  "The-Secret-Garden",
  "113.txt",
  "Children’s Fiction"
 ],
 [
  "139",
  "The Lost World",
  "Arthur Conan Doyle",
  "The-Lost-World",
  "139.txt",
  "Science Fiction"
 ],
 [
  "4093",
  "Hedda Gabler",
  "Henrik Ibsen",
  "Hedda-Gabler",
  "4093.txt",
  "Drama"
 ],
 [
  "974",
  "The Secret Agent",
  "Joseph Conrad",
  "The-Secret-Agent--A-Simple-Tale",
  "974.txt",
  "Mystery"
 ],
 [
  "1268",
  "The Mysterious Island",
  "Jules Verne",
  "The-Mysterious-Island",
  "1268.txt",
  "Adventure"
 ],
 [
  "833",
  "The Theory of the Leisure Class",
  "Thorstein Veblen",
  "The-Theory-of-the-Leisure-Class",
  "833.txt",
  "Economics"
 ],
 [
  "10800",
  "The Anatomy of Melancholy",
  "Robert Burton",
  "The-Anatomy-of-Melancholy",
  "10800.txt",
  "Psychology"
 ],
 [
  "2759",
  "The Man in the Iron Mask",
  "Alexandre Dumas",
  "The-Man-in-the-Iron-Mask",
  "2759.txt",
  "Adventure"
 ],
 [
  "23700",
  "The Decameron",
  "Giovanni Boccaccio",
  "The-Decameron-of-Giovanni-Boccaccio",
  "23700.txt",
  "Short Stories"
 ],
 [
  "32",
  "Herland",
  "Charlotte Perkins Gilman",
  "Herland",
  "32.txt",
  "Science Fiction"
 ],
 [
  "301",
  "The Ballad of Reading Gaol",
  "Oscar Wilde",
  "The-Ballad-of-Reading-Gaol",
  "301.txt",
  "Poetry"
 ],
 [
  "901",
  "The Jew of Malta",
  "Christopher Marlowe",
  "The-Jew-of-Malta",
  "901.txt",
  "Drama"
 ],
 [
  "21279",
  "2 B R 0 2 B",
  "Kurt Vonnegut",
  "2-B-R-0-2-B",
  "21279.txt",
  "Science Fiction"
 ],
 [
  "51",
  "Anne of the Island",
  "L. M. Montgomery",
  "Anne-of-the-Island",
  "51.txt",
  "Coming of Age"
 ],
 [
  "201",
  "Flatland",
  "Edwin Abbott Abbott",
  "Flatland--A-Romance-of-Many-Dimensions--Illustrated-",
  "201.txt",
  "Mathematics"
 ],
 [
  "46",
  "A Christmas Carol",
  "Charles Dickens",
  "A-Christmas-Carol",
  "46.txt",
  "Classics"
 ],
 [
  "55",
  "The Wonderful Wizard of Oz",
  "L. Frank Baum",
  "The-Wonderful-Wizard-of-Oz",
  "55.txt",
  "Fantasy"
 ],
 [
  "36",
  "The War of the Worlds",
  "H. G. Wells",
  "The-War-of-the-Worlds",
  "36.txt",
  "Science Fiction"
 ],
 [
  "35",
  "The Time Machine",
  "H. G. Wells",
  "The-Time-Machine",
  "35.txt",
  "Science Fiction"
 ],
 [
  "16",
  "Peter Pan",
  "J. M. Barrie",
  "Peter-Pan",
  "16.txt",
  "Fantasy"
 ],
 [
  "730",
  "Oliver Twist",
  "Charles Dickens",
  "Oliver-Twist",
  "730.txt",
  "Classics"
 ],
 [
  "43",
  "The Strange Case of Dr Jekyll and Mr Hyde",
  "Robert Louis Stevenson",
  "The-Strange-Case-of-Dr.-Jekyll-and-Mr.-Hyde",
  "43.txt",
  "Horror"
 ],
 [
  "105",
  "Persuasion",
  "Jane Austen",
  "Persuasion",
  "105.txt",
  "Romance"
 ],
 [
  "219",
  "Heart of Darkness",
  "Joseph Conrad",
  "Heart-of-Darkness",
  "219.txt",
  "Literary Fiction"
 ]
];
const NV_ARCHIVE_TEXTS = Object.fromEntries(NV_ARCHIVE_EDITIONS.map(([bookId,, ,repo,file])=>[
 bookId,`https://raw.githubusercontent.com/GITenberg/${repo}_${bookId}/master/${file}`
]));
// Seed real public-domain source *candidates*. A book is only shown as complete
// after downloading the text and finding its actual end-of-ebook marker.
for(const [bookId,title,author,, ,genre] of NV_ARCHIVE_EDITIONS){
 if(NV_STARTER.some(b=>String(b.id)===bookId))continue;
 NV_STARTER.push(remember({source:'gutenberg',id:bookId,title,author,
 cover:`https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.cover.medium.jpg`,
 description:'Explore a public-domain edition. Novella verifies its complete text before listing it as readable.',
 genres:['Classics','Literature',genre],year:'',pages:'',preview:null,buy:null,isbn:'',formats:{},seed:true}));
}

const cache=new Map();const pending=new Map();const TTL=12*60*60*1000;const NV_LATEST_TTL=45*60*1000;
const NV_API_MEMORY_MAX=32, NV_API_STORAGE_MAX=24;
let nvApiPruneScheduled=false;
function nvCacheRemember(key,entry){
 if(cache.has(key))cache.delete(key);
 cache.set(key,entry);
 if(cache.size>NV_API_MEMORY_MAX)cache.delete(cache.keys().next().value);
}
function nvPruneApiStorage(){
 nvApiPruneScheduled=false;
 // Only Novella API response entries on THIS site's origin. Never clear global storage.
 try{
  const prefix=KEY+'api:',records=[],expired=[];
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;
   let when=0;try{when=Number(JSON.parse(localStorage.getItem(key))?.when)||0}catch{}
   if(!when||Date.now()-when>30*86400000)expired.push(key);
   else records.push({key,when});
  }
  records.sort((a,b)=>b.when-a.when);
  for(const key of [...expired,...records.slice(NV_API_STORAGE_MAX).map(x=>x.key)])localStorage.removeItem(key);
 }catch{}
}
function nvScheduleApiPrune(){
 if(nvApiPruneScheduled)return;
 nvApiPruneScheduled=true;
 if('requestIdleCallback' in window)requestIdleCallback(nvPruneApiStorage,{timeout:10000});
 else setTimeout(nvPruneApiStorage,8000);
}
// 2.1.9: Catalogue requests get one bounded retry on temporary failures.
// Never retry Supabase, account mutations, book downloads, or private requests.
let nv219ForceRefreshUntil=0;
let nv219StaleCatalogUsed=false;
function nv219IsCatalogueURL(request){
 try{const u=new URL(request);return (u.hostname==='openlibrary.org'&&u.pathname==='/search.json')||(u.hostname==='gutendex.com'&&u.pathname==='/books');}
 catch{return false}
}
function nv219CanRetry(error,status){
 return status===429||status===502||status===503||status===504||status>=500||
        error?.name==='AbortError'||error instanceof TypeError;
}
// Novella 2.2.0 — Small per-tab public metadata request budget.
// This prevents bursts of overlapping Browse/search queries from competing with the
// reader and with each other. This is not a site-wide API rate-limit guarantee.
const nv220CatalogQueue=[];
let nv220CatalogActive=0;
const NV220_CATALOG_SLOTS=2;
function nv220CatalogFetch(request,options){
 if(!nv219IsCatalogueURL(request))return fetch(request,options);
 return new Promise((resolve,reject)=>{
  nv220CatalogQueue.push({request,options,resolve,reject});
  nv220DrainCatalogQueue();
 });
}
function nv220DrainCatalogQueue(){
 while(nv220CatalogActive<NV220_CATALOG_SLOTS&&nv220CatalogQueue.length){
  const job=nv220CatalogQueue.shift();
  if(job.options?.signal?.aborted){job.reject(new DOMException('Cancelled','AbortError'));continue}
  nv220CatalogActive++;
  Promise.resolve().then(()=>fetch(job.request,job.options)).then(job.resolve,job.reject).finally(()=>{
   nv220CatalogActive--;nv220DrainCatalogQueue();
  });
 }
}

async function fetchJSON(request,{timeout=7500}={}){
 const cacheKey=KEY+'api:'+request;
 let old=cache.get(request);
 if(!old){old=getLocal('api:'+request,null);if(old)nvCacheRemember(request,old)}
 else nvCacheRemember(request,old);
 const ttl=/[?&]sort=new(?:&|$)/.test(request)?NV_LATEST_TTL:TTL;
 const catalogue=nv219IsCatalogueURL(request);
 const force=catalogue&&Date.now()<nv219ForceRefreshUntil;
 if(!force&&old&&Date.now()-old.when<ttl)return old.value;
 if(pending.has(request))return pending.get(request);
 const promise=(async()=>{
  // Only one retry, and never while offline or on data-saver/2G connections.
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const retries=catalogue&&navigator.onLine!==false&&!conn?.saveData&&!['slow-2g','2g'].includes(conn?.effectiveType)?1:0;
  let failure;
  for(let attempt=0;attempt<=retries;attempt++){
   const controller=new AbortController();
   const perAttemptTimeout=attempt===0?Math.min(timeout,5500):Math.max(1100,Math.min(2300,timeout-5500));
   const timer=setTimeout(()=>controller.abort(),perAttemptTimeout);
   let status=0;
   try{
    const r=await nv220CatalogFetch(request,{signal:controller.signal,headers:{Accept:'application/json'}});
    status=r.status;
    if(!r.ok)throw Error('HTTP '+r.status);
    const d=await r.json();const entry={when:Date.now(),value:d};
    nvCacheRemember(request,entry);
    if(JSON.stringify(d).length<185000){putLocal('api:'+request,entry);nvScheduleApiPrune();}
    return d;
   }catch(e){
    failure=e;
    if(attempt>=retries||navigator.onLine===false||!nv219CanRetry(e,status))break;
    // Small, deterministic backoff: prevent repeated slow searches and request bursts.
    await new Promise(resolve=>setTimeout(resolve,status===429?700:250));
   }finally{clearTimeout(timer)}
  }
  if(old){
   if(catalogue)nv219StaleCatalogUsed=true;
   return old.value;
  }
  throw failure||Error('Catalogue unavailable');
 })();
 pending.set(request,promise);
 try{return await promise}finally{if(pending.get(request)===promise)pending.delete(request)}
}
// A work (Open Library) and its readable edition (Gutenberg) may use different IDs.
// These are individually checked public-domain *works*, NOT arbitrary copyrighted editions.
const VERIFIED_FREE_WORKS=[
  {title:'adventures of huckleberry finn',id:'76',author:'Mark Twain',aliases:['the adventures of huckleberry finn']},
  {title:'pride and prejudice',id:'1342',author:'Jane Austen'},
  {title:'frankenstein',id:'84',author:'Mary Shelley',aliases:['frankenstein or the modern prometheus']},
  {title:'moby dick',id:'2701',author:'Herman Melville',aliases:['moby dick or the whale']},
  {title:'alice s adventures in wonderland',id:'11',author:'Lewis Carroll'},
  {title:'the adventures of sherlock holmes',id:'1661',author:'Arthur Conan Doyle'},
  {title:'the picture of dorian gray',id:'174',author:'Oscar Wilde'},
  {title:'dracula',id:'345',author:'Bram Stoker'},
  {title:'the adventures of tom sawyer',id:'74',author:'Mark Twain'},
  {title:'a tale of two cities',id:'98',author:'Charles Dickens'},
  {title:'emma',id:'158',author:'Jane Austen'},
  {title:'little women',id:'514',author:'Louisa May Alcott'},
];
const normTitle=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/^(the )/,'');
const normAuthor=s=>normTitle(s).replace(/\b(born|unknown|author)\b/g,'').trim();
function matchedFreeWork(b){
  if(!b||b.source!=='openlibrary')return null;
  const y=Number(b.year||0);
  // Skip later adaptations and books with no reliable publication year.
  if(!y||y>1930)return null;
  const t=normTitle(b.title),a=normAuthor(b.author);
  return VERIFIED_FREE_WORKS.find(v=>{
    if(![v.title,...(v.aliases||[])].some(label=>normTitle(label)===t))return false;
    const expected=normAuthor(v.author), words=expected.split(' ');
    return !a||a==='unknown'||a===expected||words.every(w=>a.includes(w));
  })||null;
}
function fallbackFreeEdition(b,info){
 const source={source:'gutenberg',id:info.id,title:b.title,author:info.author,cover:b.cover||'',description:'A freely accessible classic published by Project Gutenberg.',genres:[...(b.genres||[]),'Classics'],year:b.year,pages:'',isbn:'',preview:null,buy:null,formats:{}};
 return remember(source);
}
// Extra editions are matched by an actual Gutenberg search, and verified by title + author.
async function findFreeEdition(b){
 const verified=matchedFreeWork(b);
 if(verified){
   try{const r=await fetchJSON('https://gutendex.com/books?ids='+encodeURIComponent(verified.id),{timeout:7000});
       const g=(r.results||[]).find(x=>String(x.id)===verified.id);
       if(g)return gutenNorm(g);
   }catch{}
   return fallbackFreeEdition(b,verified);
 }
 if(b.source==='gutenberg')return b;
 const title=normTitle(b.title),author=normAuthor(b.author);
 if(!title||title.length<4||!b.year||Number(b.year)>1930)return null;
 const all=await getGuten(b.title);
 // Strict title and author matches: we must not associate adaptations with original novels.
 const match=all.find(g=>{
   const gt=normTitle(g.title);
   const titleMatch=gt===title||gt.startsWith(title+' ')&&gt.length<title.length+22;
   const ga=normAuthor(g.author).replace(/\b\d{4}\b/g,'').trim();
   const toks=author.split(' ').filter(x=>x.length>=3);
   return titleMatch && toks.length>=1 && toks.some(x=>ga.includes(x));
 });
 return match||null;
}
function openBookNorm(d){const work=String(d.key||'').split('/').pop();if(!work||!d.title)return null;
  return remember({source:'openlibrary',id:work,title:d.title,author:(d.author_name||[]).slice(0,3).join(', ')||VERIFIED_FREE_WORKS.find(v=>normTitle(v.title)===normTitle(d.title))?.author||'Unknown author',cover:d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`:'',coverEdition:/^OL\d+M$/.test(String(d.cover_edition_key||''))?d.cover_edition_key:'',popularity:Math.max(0,Number(d.edition_count)||0),description:'Description and editions may be available from Open Library. Select this book for details.',genres:(d.subject||[]).slice(0,18),year:d.first_publish_year||'',pages:'',isbn:(d.isbn||[])[0]||'',preview:'https://openlibrary.org/works/'+encodeURIComponent(work),buy:null,formats:{},ia:(d.ia||[]).filter(x=>/^[a-zA-Z0-9_-]+$/.test(x)).slice(0,3),ebookAccess:d.ebook_access||'',publicScan:d.public_scan_b===true});
}
function gutenNorm(d){return remember({source:'gutenberg',id:String(d.id),title:d.title||'Untitled',author:(d.authors||[]).map(a=>a.name).join(', ')||'Unknown author',cover:d.formats?.['image/jpeg']||'',description:'A public-domain classic available to read and download from Project Gutenberg. Availability may vary by country.',genres:(d.subjects||[]).slice(0,18),year:'',pages:'',isbn:'',preview:null,buy:null,popularity:Math.max(0,Number(d.download_count)||0),copyright:d.copyright===true,formats:d.formats||{}})}
async function getOL(q,p=1,limit=24,sortMode='',searchField='q'){const params=new URLSearchParams({[searchField==='title'?'title':'q']:q,fields:'key,title,author_name,cover_i,cover_edition_key,first_publish_year,subject,isbn,edition_count,ia,ebook_access,public_scan_b',limit:String(limit),page:String(p)});if(sortMode==='newest')params.set('sort','new');else if(sortMode==='oldest')params.set('sort','old');const d=await fetchJSON('https://openlibrary.org/search.json?'+params);return{items:(d.docs||[]).map(openBookNorm).filter(Boolean),count:Number(d.numFound??d.num_found??d.docs?.length??0)};}
// A title-specific second pass is only used when a broad provider search yields
// few actual title/author matches. This recovers books buried behind irrelevant
// full-text metadata without making every search issue multiple requests.
async function nvRelevantOL(q,p=1,mode='',userQuery=''){
 const query=String(userQuery||'').trim();
 const genre=!!query&&allGenres.some(g=>nvQueryTokens(g).join(' ')===nvQueryTokens(query).join(' '));
 let broad;
 try{broad=await getOL(q,p,24,mode)}
 catch(err){
  // If the broad query fails, a title-only lookup can still find the book.
  // Genre searches have no meaningful title-only fallback.
  if(!query||genre)throw err;
  return getOL(query,p,24,mode,'title');
 }
 if(!query||genre)return broad;
 const relevant=nvMatchAndRank(broad.items,query,mode);
 if(relevant.length>=5)return broad;
 try{
  const direct=await getOL(query,p,24,mode,'title');
  return {items:nvDistinct([...relevant,...nvMatchAndRank(direct.items,query,mode)]),count:Math.max(broad.count,direct.count)};
 }catch{return broad}
}
async function getGutenPage(q='',p=1,verifiedTextCandidatesOnly=false,topic=''){
 const params=new URLSearchParams({languages:'en',page:String(p)});
 if(q){
  // A genre selected in All Books also searches Gutenberg subjects, not just titles.
  const isGenre=!topic&&NV_GENRE_QUERY_KEYS.has(nvQueryTokens(q).join(' '));
  params.set(isGenre?'topic':'search',q);
 }
 // Gutendex distinguishes a title/author search from subject browsing. Without
 // this, choosing Horror or Fantasy could silently miss most relevant books.
 if(verifiedTextCandidatesOnly&&topic)params.set('topic',topic);
 // Only public-domain metadata with text formats becomes a *candidate*; actual
 // pages appear in Complete Books only after verified text is fetched in-browser.
 if(verifiedTextCandidatesOnly){params.set('mime_type','text/');params.set('copyright','false')}
 const d=await fetchJSON('https://gutendex.com/books?'+params);
 return{items:(d.results||[]).map(gutenNorm),more:!!d.next};
}
async function getGuten(q=''){return (await getGutenPage(q,1)).items}
// V11.6: Cover pipeline — display real metadata images first, then enrich only
// missing visible covers. Covers are independent of search and auth requests.
const NV_COVER_CACHE_KEY='cover-sources-v1132';
let nvCoverStore=(()=>{const saved=getLocal(NV_COVER_CACHE_KEY,{});return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}})();
const nvCoverJobs=[],nvCoverQueued=new Set();
let nvCoverActive=0,nvCoverLookupCount=0,nvCoverIO=null,nvCoverObserver=null,nvCoverScanPending=false;
function nvCoverStored(b){
 const saved=nvCoverStore[id(b)];
 if(!saved||!saved.at||Date.now()-saved.at>(saved.src?30*86400000:2*60*1000))return null;
 return saved;
}
function nvSaveCover(b,src){
 const key=id(b);nvCoverStore[key]={src:src||'',at:Date.now()};
 const entries=Object.entries(nvCoverStore).sort((a,b)=>b[1].at-a[1].at).slice(0,220);
 nvCoverStore=Object.fromEntries(entries);
 putLocal(NV_COVER_CACHE_KEY,nvCoverStore);
}
function nvCoverEdition(b){
 const edition=String(b.coverEdition||'');
 return /^OL\d+M$/.test(edition)?`https://covers.openlibrary.org/b/olid/${edition}-M.jpg?default=false`:'';
}
function nvCoverIsbn(b){
 const isbn=String(b.isbn||'').replace(/[^0-9X]/gi,'').toUpperCase();
 return /^[0-9]{9}[0-9X]$|^[0-9]{13}$/.test(isbn)?
  `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`:'';
}
function nvCoverImageUrl(source){
 const validated=url(source);if(!validated)return '';
 // Open Library returns a 1px blank for missing covers unless default=false.
 try{const u=new URL(validated);if(u.hostname==='covers.openlibrary.org')u.searchParams.set('default','false');return u.href}catch{return validated}
}
function nvCoverInitial(b){
 const cached=nvCoverStored(b);
 if(cached?.src)return {src:nvCoverImageUrl(cached.src),stage:'cached'};
 if(!cached&&b.cover)return {src:nvCoverImageUrl(b.cover),stage:'original'};
 if(!cached&&b.coverEdition)return {src:nvCoverEdition(b),stage:'edition'};
 if(!cached&&b.isbn)return {src:nvCoverIsbn(b),stage:'isbn'};
 return {src:'',stage:'none'};
}
let nvEagerCoverBudget=3;
function cover(b,eager=false){
 const priority=!!eager&&nvEagerCoverBudget>0;
 if(priority)nvEagerCoverBudget--;
 const initial=nvCoverInitial(b);
 const palettes=[['#d9d8e7','#283448'],['#d6e6e9','#29434e'],['#eedbcd','#513b35'],['#dcdeda','#334338'],['#e2d8e9','#463953'],['#ebdfc7','#59452e']];
 const n=[...id(b)].reduce((sum,c)=>sum+c.charCodeAt(0),0)%palettes.length;
 const [background,foreground]=palettes[n];
 return `<div class="book-cover v8-cover" style="--book-bg:${background};--book-ink:${foreground}">
 <span class="placeholder v8-cover-fallback"><small>NOVELLA · THE LIBRARY</small><b>${esc(b.title)}</b><i>${esc(b.author||'')}</i></span>
 <img class="nv-cover-img" data-nv-cover-id="${esc(id(b))}" data-nv-cover-stage="${initial.stage}" ${initial.src?`src="${esc(initial.src)}"`:''} alt="Cover of ${esc(b.title)}" loading="${priority?'eager':'lazy'}" fetchpriority="${priority?'high':'auto'}" decoding="async">
 ${b.source==='gutenberg'?'<span class="cover-chip">FREE CLASSIC</span>':''}</div>`;
}
// Only near-screen missing covers create extra metadata requests. Avoid querying
// Open Library's covers endpoint repeatedly or guessing at unrelated editions.
function nvCoverNotice(img){
 if(nvCoverIO)nvCoverIO.observe(img);
 else nvCoverQueueBook(img.dataset.nvCoverId);
}
function nvCoverFailed(img){
 if(!img?.isConnected)return;
 const book=bookMap.get(img.dataset.nvCoverId);
 img.classList.remove('v8-loaded');
 const stage=img.dataset.nvCoverStage;
 if(!book){img.removeAttribute('src');return}
 const next=[];
 if(stage==='original')next.push({src:nvCoverEdition(book),stage:'edition'},{src:nvCoverIsbn(book),stage:'isbn'});
 if(stage==='edition')next.push({src:nvCoverIsbn(book),stage:'isbn'});
 if(stage==='cached'){next.push({src:nvCoverEdition(book),stage:'edition'},{src:nvCoverIsbn(book),stage:'isbn'});}
 if(stage==='cached'){
  // Invalidate even when an edition or ISBN fallback is available; otherwise a
  // subsequent failed fallback can resurrect this already-broken cached image.
  delete nvCoverStore[id(book)];
  putLocal(NV_COVER_CACHE_KEY,nvCoverStore);
  if(book.cover===img.currentSrc||book.cover===img.getAttribute('src'))book.cover='';
 }
 const candidate=next.find(x=>x.src&&x.src!==img.src);
 if(candidate){img.dataset.nvCoverStage=candidate.stage;img.src=candidate.src;return}
 if(stage==='recovered'){nvSaveCover(book,'');if(book.cover===img.currentSrc||book.cover===img.getAttribute('src'))book.cover='';} // Clear a broken recovered cover.
 img.dataset.nvCoverStage='none';img.removeAttribute('src');
 // The older code returned early here for failed cached covers, leaving a title
 // placeholder permanently. Try another verified provider, only near the screen.
 nvCoverNotice(img);
}
function nvCoverApply(bookKey,source){
 const safe=nvCoverImageUrl(source);if(!safe)return;
 const book=bookMap.get(bookKey);if(book){book.cover=safe;nvSaveCover(book,safe)}
 // Apply to every visible copy (Browse, Home, Shelf, Recommendations).
 for(const img of document.querySelectorAll('img.nv-cover-img')){
  if(img.dataset.nvCoverId!==bookKey||!img.isConnected)continue;
  img.dataset.nvCoverStage='recovered';
  if(img.src!==safe)img.src=safe;
 }
}
function nvCoverBookMatch(b,vol){
 const info=vol?.volumeInfo||{};
 if(!info.imageLinks)return false;
 const local=normTitle(b.title).replace(/\bbook\s*\d+\b.*$/,'').trim();
 const other=normTitle(info.title||'');
 const short=local.replace(/\s*\([^)]*\).*/,'').trim();
 const matching=local===other||(short.length>5&&(other===short||other.startsWith(short+' ')||short.startsWith(other+' ')));
 if(!matching)return false;
 const authors=String(b.author||'').split(/,| and | & /).map(x=>normAuthor(x).split(' ').filter(w=>w.length>=4).slice(-1)[0]).filter(Boolean);
 const provider=(info.authors||[]).map(normAuthor).join(' ');
 // Avoid applying a similar book's artwork; match at least one supplied surname.
 return !authors.length||(!!provider&&authors.some(name=>provider.includes(name)));
}
// Images are verified before caching, so an invalid remote cover does not
// become a persistent positive cache entry (or repeatedly flash as a blank).
function nvProbeCover(value){
 const source=nvCoverImageUrl(value);if(!source)return Promise.resolve('');
 return new Promise(resolve=>{
  const img=new Image();let done=false;
  const finish=ok=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(ok?source:'')};
  const timer=setTimeout(()=>finish(false),4500);
  img.onload=()=>finish(img.naturalWidth>=35&&img.naturalHeight>=35);
  img.onerror=()=>finish(false);img.src=source;
 });
}
async function nvCoverLookup(b){
 const title=String(b.title||'').slice(0,90).replace(/\([^)]*\)/g,'').trim();
 const author=String(b.author||'').split(',')[0].slice(0,60).trim();
 if(!title||title.length<2)return '';
 // Prefer precise Open Library edition/work matching before slower Google image searches.
 // Work covers and matching-edition covers from the same Open Library work.
 // This is an *on-demand* recovery for visible cards; no catalogue-wide crawling.
 if(b.source==='openlibrary'&&/^OL\d+W$/.test(String(b.id||''))){
  try{
   const work=await fetchJSON('https://openlibrary.org/works/'+b.id+'.json',{timeout:4800});
   const workTitle=normTitle(work.title||'');
   const shownTitle=normTitle(b.title||'');
   // Cover artwork must belong to this work, not just a vaguely similar search result.
   if(workTitle===shownTitle){
    for(const coverId of (work.covers||[]).slice(0,3)){
     if(!Number.isSafeInteger(coverId)||coverId<=0)continue;
     const image=await nvProbeCover(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false`);
     if(image)return image;
    }
   }
   const editions=await fetchJSON('https://openlibrary.org/works/'+b.id+'/editions.json?limit=24',{timeout:5200});
   const matched=(editions.entries||[]).filter(e=>normTitle(e.title||'')===shownTitle);
   matched.sort((a,b)=>Number(!!b.covers?.length)-Number(!!a.covers?.length));
   for(const edition of matched.slice(0,10)){
    for(const coverId of (edition.covers||[]).slice(0,2)){
     if(!Number.isSafeInteger(coverId)||coverId<=0)continue;
     const image=await nvProbeCover(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false`);
     if(image)return image;
    }
   }
  }catch{}
 }
 // For titles whose initial publisher/Gutenberg image is unavailable, check
 // Open Library work-level covers by an exact title + author match. This also
 // rescues classics without relying on Google Books artwork being available.
 try{
  const params=new URLSearchParams({title:String(b.title||'').slice(0,105),fields:'key,title,author_name,cover_i,cover_edition_key',limit:'8'});
  if(author&&normAuthor(author)!=='unknown')params.set('author',author);
  const matches=await fetchJSON('https://openlibrary.org/search.json?'+params,{timeout:4900});
  for(const record of (matches.docs||[])){
   if(normTitle(record.title)!==normTitle(b.title))continue;
   const names=(record.author_name||[]).map(normAuthor);
   const wanted=normAuthor(b.author||'');
   // Do not use a cover from a different author who reused the same title.
   if(wanted&&wanted!=='unknown'&&!names.some(n=>n===wanted||n.split(' ').some(x=>x.length>3&&wanted.split(' ').includes(x))))continue;
   const candidates=[];
   if(Number.isSafeInteger(record.cover_i)&&record.cover_i>0)candidates.push('https://covers.openlibrary.org/b/id/'+record.cover_i+'-M.jpg?default=false');
   if(/^OL\d+M$/.test(record.cover_edition_key||''))candidates.push('https://covers.openlibrary.org/b/olid/'+record.cover_edition_key+'-M.jpg?default=false');
   for(const candidate of candidates){const good=await nvProbeCover(candidate);if(good)return good}
  }
 }catch{}
 // A precise title/author query helps prevent covers from unrelated editions.
 const query=`intitle:"${title.replace(/"/g,'')}"`+(author?` inauthor:"${author.replace(/"/g,'')}"`:'');
 // If the provider omitted an author's spelling, try title-only matching as a
 // second (strictly verified) search rather than concluding there is no cover.
 const probes=[query];
 if(author)probes.push(`intitle:"${title.replace(/"/g,'')}"`);
 for(const probe of probes){
  const endpoint='https://www.googleapis.com/books/v1/volumes?'+new URLSearchParams({q:probe,maxResults:'8',printType:'books',fields:'items(volumeInfo(title,authors,imageLinks))'});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4800);
  try{
   const response=await fetch(endpoint,{signal:controller.signal,cache:'force-cache'});
   if(!response.ok)continue;
   const data=await response.json();
   for(const entry of (data.items||[])){
    if(!nvCoverBookMatch(b,entry))continue;
    const links=entry.volumeInfo.imageLinks||{};
    let candidate=links.small||links.medium||links.thumbnail||links.smallThumbnail||'';
    if(candidate.startsWith('http://')&&/books\.google\.|googleusercontent\.com/.test(candidate))candidate='https://'+candidate.slice(7);
    const image=await nvProbeCover(candidate);if(image)return image;
   }
  }catch{}finally{clearTimeout(timeout)}
 }
 return '';
}
function nvCoverQueueBook(key){
 if(!key||nvCoverQueued.has(key)||nvCoverLookupCount>=240)return;
 const b=bookMap.get(key);if(!b||!b.title)return;
 const stored=nvCoverStored(b);
 if(stored?.src){nvCoverApply(key,stored.src);return}
 if(stored&&!stored.src)return; // Failed recently: avoid repeated requests.
 nvCoverQueued.add(key);nvCoverJobs.push(key);nvCoverPump();
}
function nvCoverPump(){
 while(nvCoverActive<3&&nvCoverJobs.length&&nvCoverLookupCount<240){
  const key=nvCoverJobs.shift(),book=bookMap.get(key);
  if(!book){nvCoverQueued.delete(key);continue}
  nvCoverActive++;nvCoverLookupCount++;
  nvCoverLookup(book).then(src=>{if(src)nvCoverApply(key,src);else nvSaveCover(book,'')})
   .catch(()=>nvSaveCover(book,''))
   .finally(()=>{nvCoverActive--;nvCoverQueued.delete(key);nvCoverPump()});
 }
}
function nvCoverScan(){
 if(nvCoverScanPending)return;
 nvCoverScanPending=true;
 requestAnimationFrame(()=>{
  nvCoverScanPending=false;
  for(const img of document.querySelectorAll('img.nv-cover-img:not([data-nv-cover-observed])')){
   img.dataset.nvCoverObserved='1';
   if(!img.getAttribute('src'))nvCoverNotice(img);
  }
 });
}
function nvCoverBoot(){
 document.addEventListener('load',e=>{
  const img=e.target;
  if(!(img instanceof HTMLImageElement)||!img.matches('img.nv-cover-img'))return;
  if(img.naturalWidth<25||img.naturalHeight<25){nvCoverFailed(img);return}
  img.classList.add('v8-loaded');
 },true);
 document.addEventListener('error',e=>{
  const img=e.target;
  if(img instanceof HTMLImageElement&&img.matches('img.nv-cover-img'))nvCoverFailed(img);
 },true);
 if('IntersectionObserver' in window){
  nvCoverIO=new IntersectionObserver(entries=>{
   for(const entry of entries){if(!entry.isIntersecting)continue;
    nvCoverIO.unobserve(entry.target);
    if(!entry.target.getAttribute('src'))nvCoverQueueBook(entry.target.dataset.nvCoverId);
   }
  },{rootMargin:'450px 0px'});
 }
 const main=document.querySelector('#main');
 if(main&&'MutationObserver' in window){
  nvCoverObserver=new MutationObserver(nvCoverScan);
  nvCoverObserver.observe(main,{subtree:true,childList:true});
 }
 nvCoverScan();
}

function card(b,index=0){const saved=(nvMember()?shelves:[]).some(x=>x.book_key===id(b));return `<div class="book-card-wrap"><article class="book-card" tabindex="0" role="button" data-book="${esc(id(b))}" aria-label="View ${esc(b.title)}">${cover(b,index<6)}<div class="card-line"><h3 title="${esc(b.title)}">${esc(b.title)}</h3></div><div class="author">${esc(b.author)}</div>${nv210SeriesFor(b)?`<span class="nv210-card-series">${esc(nv210SeriesFor(b).series.name)} · ${nv210SeriesFor(b).index+1}/${nv210SeriesFor(b).series.titles.length}</span>`: ''}<div class="rating">${esc(availabilityLabel(b))}${b.year?' / '+esc(b.year):''}</div></article><button class="quick-save ${saved?'is-saved':''}" data-save="${esc(id(b))}" aria-label="${saved?'Book saved':'Save '+esc(b.title)}" title="${saved?'Saved to shelf':nvMember()?'Save to shelf':'Sign in to save books'}">${saved?'♥':'♡'}</button></div>`}

const grid=a=>nvPublicBooks(a).length?`<div class="book-grid">${nvPublicBooks(a).map(card).join('')}</div>`:'<div class="empty"><h3>More stories are on their way.</h3><p>Explore the handpicked collection while we prepare this shelf.</p><button class="secondary-btn" data-view="explore">Explore the collection</button></div>';
function unavailableGrid(){return `<div class="v8-provider-error" role="alert"><strong>We couldn't reach the book catalogue</strong><p>Your search hasn't completed because one of the book services is unavailable. Nothing was deleted or lost.</p><button class="secondary-btn" data-retry="1">Try this search again ↻</button><button class="secondary-btn" data-view="home">Browse curated classics</button></div>`}
function loadingGrid(){
 const term=searchText?'“'+esc(searchText)+'”':selectedGenre?esc(selectedGenre):'books';
 return `<div class="nv-search-loading" role="status" aria-live="polite"><div class="nv-search-loading-top"><span class="nv-load-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6a8 8 0 1 1-1 9"/><path d="M4 2v5h5"/></svg></span><div><h3>Finding ${term}…</h3><p>Checking book availability. Your results will appear here automatically.</p></div></div></div><section class="nv-waiting-collection"><div class="nv-waiting-collection-head"><strong>Start reading while we search</strong><span>Handpicked classics · Separate from your search results</span></div><div class="nv-waiting-row">${NV_STARTER.slice(0,6).map(card).join('')}</div></section>`;
}

// Compact, scoped search snapshots: draw results immediately on repeat visits.
// Never call localStorage.clear(), caches.delete(), or affect other origins.
const NV_SNAPSHOT_MAX=9, NV_SNAPSHOT_TTL=14*24*60*60*1000;
function nvSnapshotKey(q,g,s){return ['1142',s,String(q||'').trim().toLowerCase(),String(g||'').trim().toLowerCase()].join('|').slice(0,180)}
function nvLeanBook(b){return {source:b.source,id:String(b.id),title:String(b.title||'').slice(0,240),author:String(b.author||'').slice(0,150),cover:String(b.cover||'').slice(0,500),isbn:String(b.isbn||'').slice(0,25),year:b.year||'',genres:(b.genres||[]).slice(0,7),description:String(b.description||'').slice(0,320),preview:b.preview||null,ia:(b.ia||[]).slice(0,3),ebookAccess:b.ebookAccess||'',publicScan:!!b.publicScan,popularity:Number(b.popularity)||0,coverEdition:b.coverEdition||'',formats:b.formats||{},copyright:b.copyright===true?true:b.copyright===false?false:null,seed:!!b.seed}}
function nvLoadSnapshot(q,g,s){
 try{const key=nvSnapshotKey(q,g,s),entry=getLocal('snapshot:'+key,null);
  if(!entry||!Array.isArray(entry.books)||Date.now()-entry.when>NV_SNAPSHOT_TTL)return null;
  return {items:entry.books.filter(x=>x&&x.title&&x.id&&['gutenberg','openlibrary'].includes(x.source)).map(remember),more:!!entry.more};
 }catch{return null}
}
function nvSaveSnapshot(q,g,s,books,more){
 if(!Array.isArray(books)||!books.length)return;
 try{
  const key=nvSnapshotKey(q,g,s),name='snapshot:'+key;
  putLocal(name,{when:Date.now(),more:!!more,books:nvDistinct(books).slice(0,36).map(nvLeanBook)});
  const keys=(getLocal('snapshot-index',[])||[]).filter(x=>typeof x==='string'&&x!==key);
  keys.push(key);
  while(keys.length>NV_SNAPSHOT_MAX){const old=keys.shift();try{localStorage.removeItem(KEY+'snapshot:'+old)}catch{}}
  putLocal('snapshot-index',keys);
 }catch{}
}
let nvStarterActive=false, nvStarterCursor=0, nvStagedBooks=[], nvRemoteMore=false;
let nvSessionBrowsePool=null;
function nvBuildSessionBrowsePool(){
 if(nvSessionBrowsePool)return nvSessionBrowsePool;
 const full=nvShuffle(nvDistinct(NV_STARTER.filter(b=>b.source==='gutenberg'&&b.copyright!==true&&!nvAnnexIsFlagged(b))));
 const cached=getLocal('home-pool-cache',null);
 const discovered=nvShuffle(nvDistinct((Array.isArray(cached?.books)?cached.books:[]).filter(b=>b?.source==='openlibrary'&&b.title&&!nvAnnexIsFlagged(b)).map(remember)));
 const picked=[];
 while(full.length||discovered.length){
  for(let i=0;i<4&&full.length;i++)picked.push(full.shift());
  if(discovered.length)picked.push(discovered.shift());
 }
 nvSessionBrowsePool=nvDistinct(picked);
 return nvSessionBrowsePool;
}

/* 2.1.14: local-first discovery. These are catalogue metadata already seen in
   this browser session, NOT a claim that an edition is verified or downloadable.
   Complete Books deliberately bypasses this path and retains its strict text
   verification. Do not prefetch remote files from a keystroke. */
function nv213KnownMatches(query='',genre='',provider=source){
 if(nvCompleteOnly)return [];
 const q=String(query||'').trim(),g=String(genre||'').trim();
 const known=nvDistinct([...nvBuildSessionBrowsePool(),...bookMap.values()])
  .filter(b=>b?.title&&['openlibrary','gutenberg'].includes(b.source)&&!nvAnnexIsFlagged(b)&&(provider==='all'||b.source===provider))
  .filter(b=>!g||nv207CompleteGenreMatches(b,g)||nvSearchRelevance(b,g)>=0);
 let matched=q?nvMatchAndRank(known,q,'relevance'):known;
 if(!q)matched=[...matched].sort((a,b)=>nvPopularityScore(b)-nvPopularityScore(a));
 return matched.slice(0,30);
}
function nv213SuggestionMatches(value){
 const query=String(value||'').trim();if(query.length<2)return [];
 const all=nvDistinct([...seed,...featured,...classics,...results,...nvBuildSessionBrowsePool(),...bookMap.values()])
  .filter(b=>b?.title&&['openlibrary','gutenberg'].includes(b.source)&&!nvAnnexIsFlagged(b));
 return nvMatchAndRank(all,query,'relevance').slice(0,6);
}
function nvInstantMore(){return !nvCompleteOnly&&nvStarterActive&&(nvStarterCursor<nvBuildSessionBrowsePool().length||nvStagedBooks.length>0)}
function nvUpdateStarterMore(){hasMore=nvInstantMore()||nvRemoteMore}
function nvRevealBooks(){
 if(!nvInstantMore())return false;
 const next=[];
 if(nvStarterCursor<nvBuildSessionBrowsePool().length){next.push(...nvBuildSessionBrowsePool().slice(nvStarterCursor,nvStarterCursor+12));nvStarterCursor+=next.length}
 if(next.length<12&&nvStagedBooks.length){
  const candidates=nvDistinct(nvStagedBooks);
  const accessible=candidates.filter(b=>b.source==='gutenberg'&&b.copyright!==true);
  const discovery=candidates.filter(b=>!(b.source==='gutenberg'&&b.copyright!==true));
  const want=12-next.length,fullBudget=Math.max(0,Math.ceil(want*.8));
  const chosen=[...accessible.slice(0,fullBudget),...discovery.slice(0,Math.max(0,want-Math.min(fullBudget,accessible.length)))];
  if(chosen.length<want)chosen.push(...candidates.filter(b=>!chosen.includes(b)).slice(0,want-chosen.length));
  next.push(...chosen);const used=new Set(chosen.map(nvWorkFingerprint));
  nvStagedBooks=nvStagedBooks.filter(b=>!used.has(nvWorkFingerprint(b)));
 }
 results=nvDistinct([...results,...next]);
 nvUpdateStarterMore();lastSearch='Showing '+displayResults().length+' books · more editions available online';
 nvUpdateBrowse();return true;
}

let searchBusy=false, nvExtraCatalogPending=false, nvBrowseRoot=0;
let nvMoreObserver=null;const nvPrefetchedPages=new Set();
// Shuffle genre order only once per cycle; persist across refreshes on this device.
function nvShuffle(array){const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function nvGenreCycle(name){
 let value=getLocal(name,null);
 if(!value||!Array.isArray(value.order)||value.order.length!==allGenres.length){value={order:nvShuffle(allGenres),index:0}}
 if(value.index>=value.order.length){value={order:nvShuffle(allGenres),index:0}}
 return value;
}
function nvNextGenres(name,count){const q=nvGenreCycle(name);const picked=[];
 for(let i=0;i<count;i++){
  if(q.index>=q.order.length){q.order=nvShuffle(allGenres);q.index=0}
  picked.push(q.order[q.index++]);
 }
 putLocal(name,q);return picked;
}
function nvWorkFingerprint(b){const a=normAuthor(b.author).split(/\s+/).filter(w=>w&&!/^[0-9]+$/.test(w)&&w!=='and').sort().join(' ');return normTitle(b.title)+'|'+a}
function nvDistinct(books){const seen=new Set();return books.filter(b=>{if(!b?.title)return false;const k=nvWorkFingerprint(b);if(seen.has(k))return false;seen.add(k);return true})}
function nvNewFromPool(pool,history,count){let used=new Set(history);let fresh=nvDistinct(pool).filter(b=>!used.has(nvWorkFingerprint(b)));
 return nvShuffle(fresh).slice(0,count)
}
async function nvWarmDiscoveryCatalog(){
 // Independent, optional discovery metadata for Browse's 20% catalogue portion.
 const genres=nvNextGenres('home-genre-cycle',4);
 const query=genres.map(g=>'subject:"'+g.replace(/"/g,'')+'"').join(' OR ');
 try{
  const response=await getOL(query,1,36);
  const candidates=nvDistinct(response.items);
  if(candidates.length)putLocal('home-pool-cache',{when:Date.now(),books:candidates.slice(0,44).map(nvLeanBook)});
 }catch{}
}
async function refreshHomePicks(){
 // Never wait for APIs or accidentally replace readable titles with preview-only data.
 ++homeRefreshId;
 featured=nvHomeReadableLineup(true);
 if(screen==='home'){
  const list=$('#nv-home-picks');if(list)list.innerHTML=grid(featured);
  const button=$('#nv-refresh-picks');if(button){button.disabled=false;button.textContent='New selection ↻'}
 }
 return featured;
}

async function surpriseMe(){
 if(surpriseBusy)return;
 surpriseBusy=true;
 const button=$('#surprise-btn');if(button)button.disabled=true;
 try{
  const prior=getLocal('surprise-readable-seen',[]);
  const seen=new Set(Array.isArray(prior)?prior:[]);
  // Do not infer full-text permission from Open Library metadata. A curated
  // Gutenberg text-source URL is required, and the Reading Desk checks the
  // downloaded end-of-ebook marker before displaying it as complete.
  const pool=nvPublicBooks(NV_STARTER.filter(b=>b.source==='gutenberg'&&b.copyright!==true&&Object.hasOwn(CURATED_TEXTS,String(b.id))));
  if(!pool.length){notify('Our free reading picks are temporarily unavailable.');return}
  let fresh=pool.filter(b=>!seen.has(id(b)));
  if(!fresh.length){fresh=pool;seen.clear()}
  const chosen=nvShuffle(fresh)[0];
  putLocal('surprise-readable-seen',[...seen,id(chosen)].slice(-200));
  const picked=remember(chosen);
  await showBook(id(picked)); // Show book details first; reading remains the reader's choice.
 }catch{notify('Could not open a free reading pick. Try again.');}
 finally{surpriseBusy=false;if(button?.isConnected)button.disabled=false}
}

const title=(name,sub='',action='')=>`<div class="section-head"><div><h2>${esc(name)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>${action?`<button class="link-btn" data-view="${esc(action)}">View all →</button>`:''}</div>`;

/* NOVELLA 2.0.1 — No invented stats and no guest access to personal records. */
let nv201SuggestionMemo=null;
/* NOVELLA 2.0.8: recommendations use real account signals without new requests. */
function nv208GenreKeys(book){
 return [...new Set((Array.isArray(book?.genres)?book.genres:[]).map(v=>String(v||'').trim().toLowerCase()).filter(v=>v.length>2))];
}
function nv208Taste(){
 const authors=new Map(),genres=new Map();
 if(!nvMember())return {authors,genres};
 const bump=(map,key,value)=>{if(key)map.set(key,(map.get(key)||0)+value)};
 for(const row of shelves){
  if(!row?.book_key)continue;
  const b=bookForRow(row),weight=row.is_favorite?6:row.status==='read'?4:row.status==='reading'?3:1;
  bump(authors,normAuthor(b.author),weight);
  for(const g of nv208GenreKeys(b))if(!['books','fiction','literature','classics','english literature'].includes(g))bump(genres,g,weight);
 }
 for(const row of historyRows){
  if(!row?.book_key||shelves.some(s=>s.book_key===row.book_key))continue;
  const b=bookForRow(row);bump(authors,normAuthor(b.author),1);
  for(const g of nv208GenreKeys(b))if(!['books','fiction','literature','classics'].includes(g))bump(genres,g,1);
 }
 return {authors,genres};
}
function nv201Suggestions(){
 if(!nvMember())return [];
 const saved=shelves.filter(r=>r?.book_key),seen=new Set([...saved,...historyRows].map(r=>r.book_key));
 const signature=me.id+'|'+saved.map(r=>r.book_key+':'+r.status+':'+!!r.is_favorite).sort().join('|')+'|'+historyRows.map(r=>r.book_key).sort().join('|')+'|'+nv208RecMood+'|'+nv208RecComplete+'|'+nvCompleteTexts.size;
 if(nv201SuggestionMemo?.key===signature)return nv201SuggestionMemo.items;
 const taste=nv208Taste(),mood=nv208RecMood.toLowerCase();
 const pool=nvDistinct(nvPublicBooks(NV_STARTER).filter(b=>b.source==='gutenberg'&&b.copyright!==true&&!seen.has(id(b))&&!nvAnnexIsFlagged(b)));
 const filtered=pool.filter(b=>(mood==='all'||nv208GenreKeys(b).some(g=>g.includes(mood)))&&(!nv208RecComplete||nvHasCompleteEdition(b)));
 const ranked=nvShuffle(filtered).map(b=>{
  const author=normAuthor(b.author),authorScore=taste.authors.get(author)||0;
  const match=nv208GenreKeys(b).map(g=>({name:g,weight:taste.genres.get(g)||0})).sort((a,b)=>b.weight-a.weight)[0];
  const genreScore=match?.weight||0;
  const score=authorScore*3+genreScore*2+(Object.hasOwn(CURATED_TEXTS,String(b.id))?1:0);
  const reason=authorScore>genreScore&&authorScore>0?'More by a saved author':genreScore>0?'Because you enjoy '+match.name:mood!=='all'?'A '+nv208RecMood.toLowerCase()+' discovery':'Something different for your shelf';
  return {b,score,reason};
 }).sort((a,b)=>b.score-a.score).slice(0,4);
 nv201SuggestionMemo={key:signature,items:ranked};return ranked;
}
function nv208RecMarkup(){
 const picks=nv201Suggestions();
 return picks.length?picks.map(({b,reason})=>`<button type="button" class="nv201-rec" data-book="${esc(id(b))}" aria-label="View ${esc(b.title)}">${cover(b)}<strong>${esc(b.title)}</strong><small>${esc(reason)}</small></button>`).join(''):`<div class="nv208-empty-recs">No matches in this selection yet. <button type="button" data-nv208-rec-reset>Show all suggestions</button></div>`;
}
function nv208RefreshRecommendations(){
 const target=document.querySelector('#nv208-recommendations');if(target){target.innerHTML=nv208RecMarkup();return}
 if(screen==='home')paint();
}
function nv208ReadingInsights(saved,finished,reading,opened){
 const active=reading.filter(r=>r?.book_key&&!finished.some(f=>f.book_key===r.book_key));
 const statuses=[{label:'Reading',count:active.length},{label:'Want to read',count:saved.filter(r=>r.status==='want_to_read'&&!active.some(a=>a.book_key===r.book_key)).length},{label:'Finished',count:finished.length}];
 const sum=statuses.reduce((n,r)=>n+r.count,0);
 const cutoff=Date.now()-30*864e5;
 const recently=historyRows.filter(r=>r?.book_key&&Number.isFinite(Date.parse(r.accessed_at))&&Date.parse(r.accessed_at)>=cutoff).length;
 const highlights=nv206Rows(me.id).length;
 const top=[...nv208Taste().genres.entries()].sort((a,b)=>b[1]-a[1])[0];
 return `<div class="nv208-insights" aria-label="Reading insights from your account"><div class="nv208-insight-heading"><strong>A little reading snapshot</strong><span>Based on saved books and recorded activity</span></div><div class="nv208-insight-grid"><div class="nv208-insight-tile"><b>${recently}</b><span>Opened in the last 30 days</span></div><div class="nv208-insight-tile"><b>${highlights}</b><span>Saved notes &amp; highlights</span></div><div class="nv208-insight-tile"><b>${top?esc(top[0]).replace(/(^|\s)\S/g,x=>x.toUpperCase()):'—'}</b><span>Most common genre${top?'':' · none yet'}</span></div></div><div class="nv208-status-bars">${statuses.map(v=>`<div><span>${v.label}</span><div class="nv208-bar-track" role="meter" aria-label="${v.label}: ${v.count} books" aria-valuemin="0" aria-valuemax="${Math.max(1,sum)}" aria-valuenow="${v.count}"><i style="width:${sum?100*v.count/sum:0}%"></i></div><strong>${v.count}</strong></div>`).join('')}</div></div>`;
}
function nv201ReadingSpace(){
 if(!nvMember())return `<section class="nv201-space nv201-guest" aria-label="Your reading space"><div><span class="nv201-kicker">NOVELLA / YOUR READING SPACE</span><h2>Make it your reading room.</h2><p class="nv201-lead">Explore freely. Sign in to keep a personal shelf, reading journal and recommendations based on the stories you save.</p></div><button type="button" class="nv201-open" data-view="library">Set up your space ↗</button></section>`;
 const saved=shelves.filter(r=>r?.book_key&&!nvAnnexIsFlagged(bookForRow(r)));
 const finished=saved.filter(r=>r.status==='read');
 const completed=new Set(finished.map(r=>r.book_key));
 const recentStates=nv205LocalRows(me.id).filter(r=>!completed.has(r.book_key))
   .sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0));
 const recentHistory=historyRows.filter(r=>r?.book_key&&r.last_action==='reading'&&!completed.has(r.book_key));
 const readingKeys=new Set([...saved.filter(r=>r.status==='reading').map(r=>r.book_key),
   ...recentStates.map(r=>r.book_key),...recentHistory.map(r=>r.book_key)]);
 const reading=[...readingKeys].map(k=>saved.find(r=>r.book_key===k)||recentHistory.find(r=>r.book_key===k)||
   (()=>{const b=matchingBook(k);return b?{...localRow(b),status:'reading'}:null})()).filter(Boolean)
   .filter(r=>!nvAnnexIsFlagged(bookForRow(r)));
 const opened=new Set([...historyRows.map(r=>r.book_key),...recentStates.map(r=>r.book_key)].filter(Boolean));
 const chosen=reading[0]||saved.find(r=>r.status==='want_to_read')||saved[0];
 const current=chosen?bookForRow(chosen):null;
 return `<section class="nv201-space" aria-label="Your personalized reading space">
  <div class="nv201-head"><div><span class="nv201-kicker">NOVELLA / YOUR READING SPACE</span><h2>Every story has a place here.</h2><p class="nv201-lead">Your actual shelf, reading activity and a few fresh possibilities. Your book status comes from your Novella account.</p></div><button type="button" class="nv201-open" data-view="library">Open my bookshelf ↗</button></div>
  <div class="nv201-metrics" aria-label="Your reading statistics"><div class="nv201-metric"><strong>${reading.length}</strong><span>Reading now</span></div><div class="nv201-metric"><strong>${finished.length}</strong><span>Finished</span></div><div class="nv201-metric"><strong>${opened.size}</strong><span>Books opened</span></div></div>
  ${nv208ReadingInsights(saved,finished,reading,opened)}
  <div class="nv201-body"><div class="nv201-feature"><span class="nv201-kicker">${current?(chosen.status==='reading'?'PICK UP A STORY':'FROM YOUR SHELF'):'YOUR FIRST BOOK'}</span><h3>${current?'A story to return to.':'It starts with one book.'}</h3>${current?`<div class="nv201-inline"><button type="button" class="nv201-cover" data-book="${esc(id(current))}" aria-label="Open ${esc(current.title)}">${cover(current)}</button><div><strong class="nv201-name">${esc(current.title)}</strong><p class="nv201-author">${esc(current.author||'Unknown author')}</p><button type="button" class="nv201-action" ${saved.some(r=>r.book_key===id(current))?`data-nv205-continue="${esc(id(current))}"`:`data-book="${esc(id(current))}"`}>${chosen.status==='read'?'Read again ↗':chosen.status==='reading'||(nv205BookState(chosen.book_key)?.progress||0)>0?'Continue reading ↗':'Start reading ↗'}</button></div></div><p class="nv201-fine">Opens the book page; available reading editions are checked there. Your place is remembered as you read.</p>`:`<p class="nv201-lead">Find a title you love and save it to begin your reading journey.</p><button type="button" class="nv201-action" data-view="explore">Find a book ↗</button>`}</div>
  <div class="nv201-recs"><div class="nv201-recs-head"><div><span class="nv201-kicker">SUGGESTED STORIES</span><h3>${saved.length?'Picked around your shelf.':'A few places to begin.'}</h3><p>Personalized from your favorites, reading activity and saved genres. Availability is checked before reading.</p></div></div><div class="nv208-recommend-controls"><label>Mood <select id="nv208-rec-mood" aria-label="Choose recommendation mood">${["all","Mystery","Fantasy","Romance","Adventure","Horror","Poetry"].map(g=>`<option value="${g}" ${nv208RecMood===g?"selected":""}>${g==="all"?"All stories":g}</option>`).join("")}</select></label><label class="nv208-check"><input type="checkbox" id="nv208-rec-complete" ${nv208RecComplete?"checked":""}> Verified text only</label></div><div id="nv208-recommendations" class="nv201-recs-grid">${nv208RecMarkup()}</div></div></div>
  <div class="nv201-foot"><span>Find your next mood</span><div class="nv201-moods">${['Mystery','Fantasy','Romance','Adventure','Horror'].map(g=>`<button type="button" data-genre="${g}">${g}</button>`).join('')}</div><button type="button" class="nv201-open" data-view="history">My reading journal ↗</button></div>
 </section>`;
}

function home(){
 const visual=nvHomeVisualPick();
 const f=nvPublicBooks(featured.length?featured:nvHomeReadableLineup());
 const c=nvHomepageFullBooks();
 const saved=nvMember()?shelves:[];
 const finished=new Set(saved.filter(r=>r.status==='read').map(r=>r.book_key));
 const resumed=nvMember()?nv205LocalRows(me.id).sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0)):[];
 const currentKeys=[...new Set([...resumed.map(r=>r.book_key),...saved.filter(r=>r.status==='reading').map(r=>r.book_key)])].filter(k=>!finished.has(k));
 const currently=currentKeys.map(k=>saved.find(r=>r.book_key===k)||historyRows.find(r=>r.book_key===k)||
  (matchingBook(k)?{...localRow(matchingBook(k)),book_key:k}:null)).filter(Boolean)
  .slice(0,3).map(r=>bookForRow(r));
 const heroBook=visual.hero;
 const sideBook=visual.side;
 const nextReading=currently[0];
 return `<div class="edition-note"><span>THE READING ROOM</span><span>THOUGHTFUL STORIES · YOUR OWN PACE</span><span>EST. 2026</span></div>
 <section class="nv25-opening nv26-foyer" aria-label="Discover your next read">
  <aside class="nv26-margin nv26-margin-left" aria-hidden="true">
   <span class="nv26-margin-heading">NOVELLA / NOTES FROM THE MARGIN</span>
   <div class="nv26-spine-cluster"><span></span><span></span><span></span><span></span></div>
   <div class="nv26-side-quote"><span class="nv26-quote-glyph">“</span><p>There is always another world between the pages.</p><span class="nv26-side-rule"></span></div>
   <span class="nv26-margin-footer">CURATED WITH CURIOSITY <b>✦</b></span>
  </aside>
  <div class="nv26-center">
   <div class="nv25-feature">
   <div class="nv25-feature-copy">
    <div class="nv25-eyebrow"><span class="nv25-sparkle" aria-hidden="true">✦</span> WELCOME TO YOUR READING SANCTUARY</div>
    <h1>Stories worth <em>staying for.</em></h1>
    <p>Discover your next favorite book, make space for the stories you love, and return whenever the mood strikes.</p>
    <div class="nv25-feature-actions">
     <button class="primary-btn" data-view="explore">Explore the library <span aria-hidden="true">↗</span></button>
     <button class="secondary-btn" data-view="genres">Browse by feeling</button>
    </div>
    <div class="nv25-feature-foot"><span class="nv25-foot-mark" aria-hidden="true">◉</span> For the love of good stories · Always yours to explore</div>
   </div>
   <button class="nv25-cover-stage" data-book="${esc(id(heroBook))}" aria-label="Explore ${esc(heroBook.title)}">
    <span class="nv25-stage-kicker">TODAY'S FEATURED CLASSIC</span>
    <span class="nv25-stage-halo" aria-hidden="true"></span>
    <span class="nv231-book-jacket" aria-hidden="true"><span class="nv231-book-top">THE NOVELLA COLLECTION <span>✧</span></span><span class="nv231-book-title">${esc(heroBook.title)}</span><span class="nv231-book-author">${esc(heroBook.author||'A timeless classic')}</span><span class="nv231-book-end">N · STORIES TO STAY WITH</span></span>
    <span class="nv25-cover-credit"><strong>${esc(heroBook.title)}</strong><small>Open this story <span aria-hidden="true">↗</span></small></span>
   </button>
  </div>
  <aside class="nv25-rail" aria-label="Quick reading choices">
   <section class="nv25-rail-card nv25-pick-card">
    <div class="nv25-rail-top"><span class="nv25-rail-label">A GOOD PLACE TO START</span><span class="nv25-rail-star" aria-hidden="true">✳</span></div>
    <div class="nv25-pick-content">
     <button type="button" class="nv25-pick-cover" data-book="${esc(id(sideBook))}" aria-label="Open ${esc(sideBook.title)}">
      <span class="nv24-mini-jacket" aria-hidden="true"><small>NOVELLA COLLECTION</small><strong>${esc(sideBook.title)}</strong></span>
     </button>
     <div class="nv25-pick-info"><span class="nv25-pill">FREE CLASSIC</span><h2>${esc(sideBook.title)}</h2><p>${esc(sideBook.author||'A timeless story')}</p><button type="button" data-book="${esc(id(sideBook))}" class="nv25-rail-link">Explore book <span aria-hidden="true">↗</span></button></div>
    </div>
   </section>
   <section class="nv25-rail-card nv25-my-card">
    <div class="nv25-rail-top"><span class="nv25-rail-label">YOUR READING CORNER</span><span aria-hidden="true" class="nv25-rail-star">⌁</span></div>
    ${nextReading?`<h2>Pick up where you left off.</h2><p>${esc(nextReading.title)} · ${esc(nextReading.author||'')}</p><button data-book="${esc(id(nextReading))}" class="nv25-rail-link">Continue reading <span aria-hidden="true">↗</span></button>`:`<h2>Your shelf, your stories.</h2><p>Keep favourites close and return to them whenever you like.</p><button data-view="library" class="nv25-rail-link">Visit your bookshelf <span aria-hidden="true">↗</span></button>`}
   </section>
   <section class="nv25-rail-card nv25-mood-card">
    <div class="nv25-rail-top"><span class="nv25-rail-label">WHAT ARE YOU IN THE MOOD FOR?</span><span class="nv25-rail-star" aria-hidden="true">♡</span></div>
    <div class="nv25-mood-links">${visual.moods.map(([genre,label])=>`<button type="button" data-genre="${esc(genre)}">${esc(label)}</button>`).join('')}</div>
   </section>
  </aside>
  </div>
  <aside class="nv26-margin nv26-margin-right" aria-hidden="true">
   <span class="nv26-margin-heading">A LITTLE READING RITUAL</span>
   <div class="nv26-orbit-art"><span class="nv26-orbit-star">✧</span><span class="nv26-orbit-dot">·</span></div>
   <div class="nv26-side-quote"><p>Turn a page. Find a place to stay.</p><span class="nv26-side-rule"></span><small>ONE CHAPTER AT A TIME</small></div>
   <div class="nv26-end-mark"><span>n.</span><span>EST. 2026</span></div>
  </aside>
 </section>
 <div class="nv24-reading-trail" aria-label="Ways to explore the library">
  <div class="nv24-trail-heading"><span class="nv24-trail-icon" aria-hidden="true">✦</span><div><strong>Your next chapter starts here</strong><small>Choose how you'd like to discover</small></div></div>
  <div class="nv24-trail-links"><button type="button" data-view="explore">Explore all books <span aria-hidden="true">↗</span></button><button type="button" data-view="genres">Find your genre <span aria-hidden="true">↗</span></button><button type="button" data-view="library">My bookshelf <span aria-hidden="true">↗</span></button></div>
 </div>
 ${currently.length?`<div class="intro-label home-chapter">YOUR BOOKMARKS</div>${title('Pick up where you left off','Your currently reading shelf','library')}${grid(currently)}`:''}
 <div class="intro-label home-chapter">THE EDITOR'S TABLE</div><div class="nv-home-head">${title('Books worth a look','Complete public-domain editions · a fresh mix on every visit','explore')}<button type="button" class="nv-refresh-picks" id="nv-refresh-picks" ${homeRefreshPending?'disabled':''}>${homeRefreshPending?'Curating…':'New selection ↻'}</button></div><div id="nv-home-picks">${grid(f.slice(0,10))}</div>
 ${nv201ReadingSpace()}

 <section class="quote-break"><span>AN EXCERPT FROM OUR PHILOSOPHY</span><p>“Books don't just fill the shelves. They make room for everything you haven't imagined yet.”</p><button class="link-btn" data-view="info">Why Novella exists ↗</button></section>
 <div class="intro-label home-chapter">A LIBRARY YOU CAN ACTUALLY READ</div>${title('Open the classics','Public-domain texts from Project Gutenberg · full-edition paths','explore')}<div id="nv-home-classics">${grid(c.slice(0,6))}</div>
 <div class="intro-label home-chapter">READ WHAT MOVES YOU</div>${title('Follow a feeling','The best next book often starts with a mood','genres')}
 <div class="mood-grid">${[['Fantasy','Wonder, worlds & possibility'],['Romance','Love in all its forms'],['Mystery','Curiosity with a twist'],['Science Fiction','Tomorrow, imagined'],['Horror','Something after dark'],['Biography','A life worth knowing']].map(([g,sub],i)=>`<button class="mood mood-${i}" data-genre="${esc(g)}"><small>COLLECTION / 0${i+1}</small><strong>${esc(g)}</strong><span>${esc(sub)} &nbsp; ↗</span></button>`).join('')}</div>`;
}

// "Newest" must query the catalogue, not just rearrange 24 locally downloaded records.
// Recent works are filtered on Open Library's first-published year (NOT a site's update date).
function nvCatalogQuery(q='',genre='',mode=sort){
 const base=String(q||'').trim()||(genre?'subject:"'+String(genre).replace(/"/g,'')+'"':'fiction');
 if(mode!=='newest'||q)return base;
 const year=new Date().getFullYear();
 const recent='first_publish_year:['+(year-1)+' TO '+year+']';
 return (genre?'subject:"'+String(genre).replace(/"/g,'')+'" AND ':'')+recent;
}
function nvBrowseSnapshotSource(){return source+(sort==='newest'?'|newest':'')}
function nv207GenreOptions(){
 return `<option value="" ${!selectedGenre?'selected':''}>All subjects & genres</option>`+
  Object.entries(GROUPS).map(([group,items])=>`<optgroup label="${esc(group)}">${items.map(g=>`<option value="${esc(g)}" ${g.toLowerCase()===selectedGenre.toLowerCase()?'selected':''}>${esc(g)}</option>`).join('')}</optgroup>`).join('');
}
function categoryControls(){
 if(nvCompleteOnly)return `<div class="filter-bar nv207-complete-filters">
  <label><span>Genre</span><select id="nv207-complete-genre" aria-label="Filter complete books by genre">${nv207GenreOptions()}</select></label>
  <label><span>Sort</span><select id="sort-filter" aria-label="Sort complete books"><option value="relevance" ${sort==='relevance'?'selected':''}>Popular first</option><option value="title" ${sort==='title'?'selected':''}>Title A–Z</option><option value="shortest" ${sort==='shortest'?'selected':''}>Shortest first</option><option value="longest" ${sort==='longest'?'selected':''}>Longest first</option></select></label>
  <label><span>Length</span><select id="nv-complete-length" aria-label="Filter by complete book length"><option value="all" ${nvCompleteLength==='all'?'selected':''}>Any length</option><option value="short" ${nvCompleteLength==='short'?'selected':''}>Short · under 25k words</option><option value="medium" ${nvCompleteLength==='medium'?'selected':''}>Medium · 25–90k words</option><option value="long" ${nvCompleteLength==='long'?'selected':''}>Long · over 90k words</option></select></label>
  <button type="button" class="nv207-reset" data-nv207-reset ${!selectedGenre&&!searchText&&nvCompleteLength==='all'&&sort==='relevance'?'disabled':''}>Reset filters ↺</button>
 </div>`;
 return `<div class="filter-bar"><select id="source-filter" aria-label="Book source"><option value="all" ${source==='all'?'selected':''}>All books</option><option value="openlibrary" ${source==='openlibrary'?'selected':''}>Discover books</option><option value="gutenberg" ${source==='gutenberg'?'selected':''}>Public-domain classics</option></select><select id="sort-filter" aria-label="Sort books"><option value="relevance" ${sort==='relevance'?'selected':''}>Best matches · Popular first</option><option value="newest" ${sort==='newest'?'selected':''}>Latest publications</option><option value="oldest" ${sort==='oldest'?'selected':''}>Oldest first</option><option value="title" ${sort==='title'?'selected':''}>Title A–Z</option></select><button class="secondary-btn compact" data-view="genres">All subjects & genres</button></div>`;
}
function nvBrowseScopeTabs(){return `<section class="nv42-browse-scope" aria-label="Choose which books to browse">
  <div class="nv42-scope-controls" role="group" aria-label="Browsing collection">
   <button type="button" data-nv-browse-scope="all" class="nv42-scope-tab ${nvCompleteOnly?'':'is-active'}" aria-pressed="${!nvCompleteOnly}"><span aria-hidden="true">▤</span> All books</button>
   <button type="button" data-nv-browse-scope="complete" class="nv42-scope-tab ${nvCompleteOnly?'is-active':''}" aria-pressed="${nvCompleteOnly}"><span aria-hidden="true">✓</span> Complete books</button>
  </div>
  <p class="nv42-scope-copy">${nvCompleteOnly?'Enjoy full stories, from the first page to the last.':'Explore books, editions, and new discoveries.'}</p>
 </section>`}

// Search state is separate from the browsing state: never claim a search was run
// merely because a remote service hasn't returned any books.
function nvBrowseEmptyState(){
 const term=searchText.trim(),genre=selectedGenre.trim();
 if(nvCompleteOnly){
  const filtered=!!(term||genre||nvCompleteLength!=='all');
  return `<section class="nv-empty-results nv42-empty" role="status" aria-live="polite"><span class="nv-editorial-eyebrow">YOUR READING COLLECTION</span><h3>${filtered?'Nothing matches just yet.':'More stories are on their way.'}</h3><p>${fetchError?'The library is having trouble connecting. ':''}${searchBusy?'Finding stories for you…':hasMore?'Try Load more for the next selection.':'Try a different genre, book length, or title.'}</p><div class="nv-empty-actions">${filtered?'<button type="button" class="primary-btn" data-nv207-reset>Clear filters</button>':''}<button type="button" class="secondary-btn" data-nv-browse-scope="all">Explore all books ↗</button></div></section>`;
 }
 const recommendations=nvPublicBooks(NV_STARTER).slice(0,12);
 const browseDefault=!term&&!genre;
 if(browseDefault){return `<section class="nv-empty-curated" role="region" aria-label="Ready-to-browse classics"><div class="nv-empty-curated-head"><div><span class="nv-editorial-eyebrow">READY WHEN YOU ARE</span><h3>A good story is always close.</h3><p>${source==='openlibrary'?'Our live discovery catalogue is taking longer than expected. These classics are available to explore while it connects.':'Start with these handpicked books while the catalogue refreshes.'}</p></div><button type="button" class="secondary-btn nv-browse-reset" data-reset-catalogue="1">Browse all books ↗</button></div>${grid(recommendations)}</section>`}
 if(fetchError)return unavailableGrid();
 const label=term?'“'+esc(term)+'”':'the '+esc(genre)+' shelf';
 return `<section class="nv-empty-results" role="status" aria-live="polite"><span class="nv-editorial-eyebrow">LET'S FIND ANOTHER CHAPTER</span><h3>${sort==='newest'?'No recent titles found for '+label+' yet.':'No titles found for '+label+' yet.'}</h3><p>Try a shorter title, a different spelling, or another subject. The catalogue may not include every edition.</p><div class="nv-empty-actions"><button class="primary-btn" type="button" data-reset-catalogue="1">Explore all books ↗</button><button class="secondary-btn" type="button" data-view="genres">Browse genres</button></div></section><section class="nv-empty-alternatives"><div class="nv-alternatives-head"><strong>In the meantime, try a classic</strong><span>Suggestions, not search results</span></div>${grid(recommendations.slice(0,6))}</section>`;
}
// A search is for a *work*, not just its latest reprint or study guide.
// Always surface one exact-title main match before differently named editions.
let nvCanonicalRemote=null;
function nvMainBook(){
 const requested=normTitle(searchText);
 if(!requested||selectedGenre)return null;
 const same=b=>b&&!nvAnnexIsFlagged(b)&&(!nvCompleteOnly||(nvHasCompleteEdition(b)&&displayResults().some(r=>id(r)===id(b))))&&normTitle(b.title)===requested&&(source==='all'||b.source===source);
 const curated=NV_STARTER.find(same);
 if(curated)return curated; // Full public-domain editions are particularly useful.
 const choices=[nvCanonicalRemote,...results].filter(same);
 choices.sort((a,b)=>nvPopularityScore(b)-nvPopularityScore(a)||Number(!!b.cover)-Number(!!a.cover)||a.title.length-b.title.length);
 return choices[0]||null;
}
function nvOtherResults(){
 const main=nvMainBook();
 const fingerprint=main&&nvWorkFingerprint(main);
 return displayResults().filter(b=>!fingerprint||nvWorkFingerprint(b)!==fingerprint);
}
function nvMainBookMarkup(b){
 if(!b)return '';
 const key=esc(id(b));
 return `<section class="nv-main-book" aria-label="Main book matching your search">
  <div class="nv-main-eyebrow"><span class="nv-main-dot" aria-hidden="true"></span> MAIN BOOK MATCH <span class="nv-main-note">Other editions and related books are listed below</span></div>
  <div class="nv-main-body"><button type="button" class="nv-main-art" data-book="${key}" aria-label="Open ${esc(b.title)}">${cover(b,true)}</button>
   <div class="nv-main-copy"><h3>${esc(b.title)}</h3><p class="nv-main-author">${esc(b.author||'Unknown author')}</p>
    <p class="nv-main-description">${b.source==='gutenberg'?'Explore this complete public-domain edition from Project Gutenberg.':'This is the title that most closely matches your search. Choose an edition to check available reading options.'}</p>
    <div class="nv-main-actions"><button class="primary-btn" type="button" data-book="${key}">View book &amp; reading options ↗</button>${b.source==='gutenberg'?'<span class="nv-main-access">Free classic edition</span>':''}</div>
   </div></div></section>`;
}
function nv219RecoveryMarkup(){
 if(!fetchError)return '';
 return `<div class="nv219-recovery" role="status" aria-live="polite"><span aria-hidden="true">↻</span><p>${esc(fetchError)}</p><button type="button" data-nv219-retry="1" aria-label="Try loading catalogue results again">Try again</button></div>`;
}
function nvBrowseResultMarkup(){
 const main=nvMainBook(),shown=nvOtherResults();
 if(main||shown.length)return `<div class="nv-match-layout"><div class="nv-primary-slot" data-primary-key="${main?esc(id(main)):''}">${nvMainBookMarkup(main)}</div>
   <div class="nv-results-grid">${shown.length?(main?'<h3 class="nv-other-title">Other matching books &amp; editions</h3>':'')+grid(shown):main&&searchBusy?'<p class="nv-other-pending">Looking for other matching editions…</p>':''}</div></div>`;
 if(searchBusy||nvExtraCatalogPending){
  if(nvCompleteOnly)return `<section class="nv-search-loading" role="status" aria-live="polite"><div class="nv-search-loading-top"><span class="nv-load-mark" aria-hidden="true">◌</span><div><h3>Finding complete books…</h3><p>Finding books you can read from beginning to end.</p></div></div></section>`;
  // A first-time visitor always sees real book choices, not empty placeholders.
  if(!searchText&&!selectedGenre)return nvBrowseEmptyState();
  return loadingGrid();
 }
 return nvBrowseEmptyState();
}
function nvBrowseMoreMarkup(){
 if(nvCompleteOnly&&fetchError&&!searchBusy&&!hasMore){
  return `<button type="button" class="nv-load-more" id="nv204-complete-retry"><span>Retry complete-book catalogue ↻</span><small>We couldn't reach the library just now. Try again.</small></button>`;
 }
 // Keep a visible, honest next-step control as soon as book cards exist.
 // Do not wait for every catalogue provider, and never promise a nonexistent page.
 if(nvCompleteOnly&&!displayResults().length&&hasMore&&!searchBusy)return `<button type="button" class="nv-load-more" id="load-more"><span>Find more complete books ↓</span><small>Explore another selection of stories</small></button>`;
 if(!displayResults().length)return ''; // Suggestions in empty states are distinct from actual catalogue pages.
 const instant=nvInstantMore();
 const ready=instant||(hasMore&&!searchBusy);
 const awaiting=!instant&&(searchBusy||nvExtraCatalogPending);
 if(ready||awaiting){
  const label=ready?'Load more books ↓':'Load more books ↓';
  const hint=nvCompleteOnly?(ready?'More stories to explore':'Finding more stories…'):instant?'Next selection is ready':ready?'More books are ready': 'Checking the next selection…';
  return `<button type="button" class="nv-load-more" id="load-more" ${ready?'':'disabled aria-busy="true"'}><span>${label}</span><small>${hint}</small></button>`;
 }
 // If the current search really has no next page, offer a working alternative.
 return `<button type="button" class="nv-load-more nv-next-collection" id="load-more" data-next-collection="1"><span>Discover more books ↗</span><small>Explore a different collection</small></button>`;
}
function nvUpdateBrowse(){
 if(screen!=='explore')return;
 const container=$('#results'),more=$('#more-wrap'),caption=$('#result-caption');
 if(!container||!more)return;
 const main=nvMainBook(),shown=nvOtherResults();
 const frame=container.querySelector('.nv-match-layout');
 if(!frame||(!main&&!shown.length))container.innerHTML=nvBrowseResultMarkup();
 else{
   const slot=frame.querySelector('.nv-primary-slot'),primaryKey=main?id(main):'';
  if(slot&&slot.dataset.primaryKey!==primaryKey){slot.dataset.primaryKey=primaryKey;slot.innerHTML=nvMainBookMarkup(main)}
  const section=frame.querySelector('.nv-results-grid'),existing=section?.querySelector('.book-grid');
  if(section){
   if(!shown.length)section.innerHTML=main&&searchBusy?'<p class="nv-other-pending">Looking for other matching editions…</p>':'';
   else{
    const oldKeys=existing?Array.from(existing.querySelectorAll('.book-card[data-book]'),e=>e.dataset.book):[];
    const isPrefix=!!existing&&oldKeys.length<=shown.length&&oldKeys.every((key,i)=>key===id(shown[i]));
    if(isPrefix){if(shown.length>oldKeys.length)existing.insertAdjacentHTML('beforeend',shown.slice(oldKeys.length).map(book=>card(book).replace('class="book-card-wrap"','class="book-card-wrap nv210-new-book"')).join(''))}
    else section.innerHTML=(main?'<h3 class="nv-other-title">Other matching books &amp; editions</h3>':'')+grid(shown);
   }
  }
 }
 if(caption)caption.textContent=nvCompleteOnly?`${displayResults().length} ${displayResults().length===1?'matching book':'matching books'}${searchBusy?' · finding more…':''}`:(lastSearch||'Browse books');
 const completeStatus=$('#nv204-complete-status');
 if(completeStatus)completeStatus.innerHTML=nvCompleteStatusMarkup();
 const recovery=$('#nv219-recovery');
 if(recovery)recovery.innerHTML=nv219RecoveryMarkup();
 nv207RefreshFilterUI();
 const previous=more.querySelector('#load-more'),wasFocused=previous===document.activeElement;
 const nextMore=nvBrowseMoreMarkup();if(more.innerHTML!==nextMore)more.innerHTML=nextMore;
 if(wasFocused)more.querySelector('#load-more')?.focus({preventScroll:true});
 nvArmNextPagePrefetch();
}
function nvArmNextPagePrefetch(){
 if(nvMoreObserver){nvMoreObserver.disconnect();nvMoreObserver=null}
 const button=$('#load-more');
 if(!button||!hasMore||searchBusy||nvInstantMore()||!('IntersectionObserver' in window)||!nvBackgroundNetworkOK()||navigator.onLine===false)return;
 const next=page+1,term=nvCatalogQuery(searchText,selectedGenre);
 const key=[source,sort,term,next].join('|');
 if(nvPrefetchedPages.has(key))return;
 const root=nvBrowseRoot,provider=source,prefetchSort=sort;
 nvMoreObserver=new IntersectionObserver(entries=>{
  if(!entries.some(x=>x.isIntersecting))return;
  nvMoreObserver?.disconnect();nvMoreObserver=null;
  if(root!==nvBrowseRoot||screen!=='explore'||page!==next-1||searchBusy||sort!==prefetchSort||!nvBackgroundNetworkOK()||navigator.onLine===false)return;
  nvPrefetchedPages.add(key);
  // Verified full-text prefetch is strictly optional and never adds unchecked
  // books to results. Limited to five candidates and two concurrent downloads.
  if(nvCompleteOnly){
   nvPrefetchCompleteNext(searchText,selectedGenre,next,root).catch(()=>{nvPrefetchedPages.delete(key)});
   return;
  }
  const work=provider==='gutenberg'?getGutenPage(searchText||selectedGenre,next):getOL(term,next,24,prefetchSort);
  work.catch(()=>{nvPrefetchedPages.delete(key)});
 },{rootMargin:'260px 0px'});
 nvMoreObserver.observe(button);
}
function explore(){return `<div class="nv-explore-intro"><div><div class="intro-label">THE CATALOGUE · EVERY READER BELONGS</div><h1 class="page-title">Find your next book.</h1><p class="subtitle">Discover a fresh selection on every visit. Open a free classic, explore other editions, or find the story you came for.</p></div><div class="nv-explore-detail"><span class="nv-detail-spark" aria-hidden="true">✳</span><strong>Stories worth staying for</strong><small>Discover · Save · Read</small></div></div>${nvBrowseScopeTabs()}${nvCompleteOnly?nv207ScopedSearchMarkup():''}<div class="pill-row">${['All',...popular.slice(0,11)].map(g=>`<button class="pill ${selectedGenre.toLowerCase()===(g==='All'?'':g.toLowerCase())?'active':''}" data-genre="${g==='All'?'':esc(g)}">${esc(g)}</button>`).join('')}</div><div class="nv43-filters-wrap"><button type="button" class="nv43-filters-toggle" id="nv43-filters-toggle" aria-expanded="false" aria-controls="nv43-filter-content">Filters &amp; sorting <span aria-hidden="true">⌄</span></button><div id="nv43-filter-content">${categoryControls()}</div></div>${nvCompleteOnly?'<div id="nv207-active-filters">'+nv207FilterChips()+'</div>':''}<div class="section-head"><div><h2>${nvCompleteOnly?(searchText?'Complete editions for “'+esc(searchText)+'”':selectedGenre?esc(selectedGenre)+' · complete books':'Complete books'):searchText?'Results for “'+esc(searchText)+'”':selectedGenre?esc(selectedGenre)+' books':'Browse the library'}</h2><p id="result-caption" aria-live="polite">${esc(lastSearch||(!searchText&&!selectedGenre?nvCompleteOnly?'Complete editions, ready to explore':'Handpicked books, ready to explore':'Discovering your next read'))}</p></div><button class="nv43-results-jump" type="button" data-nv43-scroll="results">See books ↓</button></div><div id="nv204-complete-status">${nvCompleteStatusMarkup()}</div><div id="nv219-recovery">${nv219RecoveryMarkup()}</div><div id="results">${nvBrowseResultMarkup()}</div><div id="more-wrap" aria-live="polite">${nvBrowseMoreMarkup()}</div>${!nvCompleteOnly?nv210BrowseSeriesMarkup():''}` }
// V11.20: Search is a match gate FIRST and a popularity sort SECOND.
// Open Library's broad full-text results may mention a query only in description or
// metadata. Those are not automatically relevant title / author matches.
function nvQueryTokens(value){
 const text=String(value||'').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const tokens=text.split(/\s+/).filter(Boolean);
 const meaningful=tokens.filter(t=>!['a','an','and','the','of','in','on','for','to','at','by','with'].includes(t));
 return meaningful.length?meaningful:tokens;
}
function nvTokenLike(a,b){
 if(a===b)return true;
 if(a.length>=4&&b.length>=4&&(a.startsWith(b)||b.startsWith(a)))return Math.min(a.length,b.length)/Math.max(a.length,b.length)>=.73;
 if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
 // At most one character typo; avoids unrelated loose-matching results.
 let i=0,j=0,changes=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue}
  if(++changes>1)return false;
  if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
 }
 return changes+(a.length-i)+(b.length-j)<=1;
}
const NV_GENRE_QUERY_KEYS=new Set(allGenres.map(g=>nvQueryTokens(g).join(' ')));
function nvSearchRelevance(book,query){
 const tokens=nvQueryTokens(query);
 if(!tokens.length)return 1;
 const qt=tokens.join(' '),title=nvQueryTokens(book.title),author=nvQueryTokens(book.author);
 const titleText=title.join(' '),authorText=author.join(' ');
 const matchCount=(arr)=>tokens.filter(t=>arr.some(v=>nvTokenLike(t,v))).length;
 const t=matchCount(title),a=matchCount(author),needed=Math.max(1,Math.ceil(tokens.length*.8));
 // Exact work/series titles take priority over other matches even when newer.
 if(titleText===qt)return 700;
 if(titleText.startsWith(qt+' '))return 620;
 if(titleText.includes(' '+qt+' '))return 560;
 if(t>=needed)return 410+Math.min(120,Math.round(t/tokens.length*100))-(title.length>tokens.length?Math.min(38,title.length-tokens.length)*2:0);
 if(a>=needed)return authorText===qt?545:470;
 // Generic genre searches can match an actual subject, never unrelated book metadata.
 const genreQuery=NV_GENRE_QUERY_KEYS.has(qt);
 if(genreQuery){
  const subjects=(book.genres||[]).slice(0,18).map(g=>nvQueryTokens(g).join(' '));
  if(subjects.some(v=>v===qt||v.startsWith(qt+' ')||v.includes(' '+qt+' ')))return 260;
 }
 return -1; // Reject broad API hits that are not the searched title, author or subject.
}
function nvPopularityScore(book){
 // Edition count (Open Library) and downloads (Gutenberg) are different proxies;
 // log scale prevents a huge provider count from defeating a strong title match.
 const raw=Math.max(0,Number(book.popularity)||0);
 return Math.log1p(raw)*(book.source==='gutenberg'?12:24);
}
function nvMatchAndRank(items,query='',mode='relevance'){
 // Compute every work's relevance once, not once per comparison: fast for broad searches.
 const ranked=(items||[]).map((b,index)=>({b,index,match:query?nvSearchRelevance(b,query):0})).filter(x=>x.match>=0);
 if(mode==='relevance'){
  for(const r of ranked)r.popularity=nvPopularityScore(r.b);
  // Work/title relevance is primary; popularity only resolves comparable matches.
  // An exact Pride and Prejudice must beat a popular Pride and Prejudice workbook.
  ranked.sort((a,b)=>b.match-a.match||b.popularity-a.popularity||Number(!!b.b.cover)-Number(!!a.b.cover)||a.index-b.index);
 }
 return ranked.map(x=>x.b);
}

// NOVELLA 2.0.7 — Functional Complete Books controls, independent of auth/reader.
function nv207ScopedSearchMarkup(){
 return `<form id="nv207-complete-search" class="nv207-search" role="search" aria-label="Search complete books"><label for="nv207-complete-query">Find a complete book</label><div class="nv207-search-line"><input id="nv207-complete-query" type="search" maxlength="120" autocomplete="off" placeholder="Book title or author…" value="${esc(searchText)}" aria-label="Search complete books by title or author"><button type="submit">Search ↗</button>${searchText?'<button type="button" class="nv207-search-clear" data-nv207-clear="query">Clear</button>':''}</div></form>`;
}
function nv207FilterChips(){
 const chips=[];
 if(selectedGenre)chips.push(['genre','Genre: '+selectedGenre]);
 if(nvCompleteLength!=='all')chips.push(['length',{short:'Short reads',medium:'Medium reads',long:'Long reads'}[nvCompleteLength]]);
 if(searchText)chips.push(['query','Search: '+searchText]);
 if(sort!=='relevance')chips.push(['sort',({title:'Title A–Z',shortest:'Shortest first',longest:'Longest first'})[sort]||sort]);
 return chips.length?`<div class="nv207-chips" aria-label="Active filters"><span>Showing</span>${chips.map(([name,label])=>`<button type="button" data-nv207-clear="${name}" aria-label="Remove ${esc(label)} filter">${esc(label)} <span aria-hidden="true">×</span></button>`).join('')}<button type="button" class="nv207-clear-all" data-nv207-reset>Clear all</button></div>`:'';
}
function nv207RefreshFilterUI(){
 if(!nvCompleteOnly||screen!=='explore')return;
 const chips=document.getElementById('nv207-active-filters');if(chips)chips.innerHTML=nv207FilterChips();
 const reset=document.querySelector('[data-nv207-reset].nv207-reset');
 if(reset)reset.disabled=!selectedGenre&&!searchText&&nvCompleteLength==='all'&&sort==='relevance';
 const genre=document.getElementById('nv207-complete-genre');if(genre&&genre.value!==selectedGenre)genre.value=selectedGenre;
 const length=document.getElementById('nv-complete-length');if(length&&length.value!==nvCompleteLength)length.value=nvCompleteLength;
 const ordering=document.getElementById('sort-filter');if(ordering&&ordering.value!==sort)ordering.value=sort;
}
function nv207ResetCompleteFilters(){
 searchText='';selectedGenre='';nvCompleteLength='all';sort='relevance';source='gutenberg';
 const global=document.getElementById('global-search');if(global)global.value='';
 if(typeof nvSearch!=='undefined'&&nvSearch)nvSearch.value='';
 browse('','',1);
}
function nv207CompleteGenreMatches(book,genre){
 if(!genre)return true;
 const desired=nvQueryTokens(genre).join(' ');
 const normalized=String(desired||'').trim();
 if(!normalized)return true;
 const aliases={
  'science fiction':['science fiction','sci fi','space fiction'],
  'young adult':['young adult','juvenile','teen'],
  'horror':['horror','ghost stories','gothic'],
  'fantasy':['fantasy','fantastic fiction','fairy tales'],
  'mystery':['mystery','detective','crime fiction'],
  'romance':['romance','love stories'],
  'biography':['biography','biographies','autobiography'],
  'history':['history','historical'],
  'poetry':['poetry','poems','verse']
 };
 const accepted=aliases[normalized]||[normalized];
 return (book.genres||[]).some(subject=>{
  const text=nvQueryTokens(subject).join(' ');
  return accepted.some(word=>text===word||text.startsWith(word+' ')||text.includes(' '+word+' ')||text.endsWith(' '+word));
 });
}
function nv207CompleteMatches(book,query,genre){
 return nv207CompleteGenreMatches(book,genre)&&(!query||nvSearchRelevance(book,query)>=0);
}

// NOVELLA 2.0.4: verified texts, never previews. Keep account, Annex and
// navigation ownership outside this collection; it only changes Browse.
// Every visitor gets a readable edition only after its actual bytes pass the
// integrity check. The browser's HTTP cache and this session's memory cache
// speed up returning without claiming previously checked URLs are still online.
let nvCompleteLength='all',nvCompleteChecked=0,nvCompleteAttempts=0;
const NV_COMPLETE_REMOTE_SLICES=3,NV_COMPLETE_REMOTE_SLICE=11;
const nvCompleteTexts=new Map();
const nvCompleteChecks=new Map();
const nvCompleteFailed=new Map();
function nvCountWords(text){
 // Calculate once per verified edition, never on every rerender.
 let words=0,inWord=false;
 for(let i=0;i<text.length;i++){
  const c=text.charCodeAt(i),space=c<=32||c===160;
  if(space)inWord=false;else if(!inWord){words++;inWord=true}
 }
 return words;
}
function nvCompleteLengthMatches(b){
 if(nvCompleteLength==='all')return true;
 const words=nvCompleteTexts.get(id(b))?.words;
 if(!Number.isFinite(words))return false;
 return nvCompleteLength==='short'?words<25000:nvCompleteLength==='medium'?words>=25000&&words<=90000:words>90000;
}
function nvHasCompleteEdition(b){
 return !!b&&b.source==='gutenberg'&&!nvAnnexIsFlagged(b)&&nvCompleteTexts.has(id(b));
}
function nvCompleteRemoteWindow(pageNumber,localPages,filtered){
 // Gutendex returns up to 32 entries per page. Previous builds inspected only
 // the first eight then advanced, losing most of the catalogue. Three rounds
 // cover all entries (11 + 11 + remaining), never skipping a page's tail.
 const round=filtered?pageNumber-1:pageNumber-localPages-1;
 if(round<0)return null;
 return {page:Math.floor(round/NV_COMPLETE_REMOTE_SLICES)+1,segment:round%NV_COMPLETE_REMOTE_SLICES};
}
function nvCompleteStatusMarkup(){
 if(!nvCompleteOnly)return '';
 const shown=displayResults().length;
 const checked=results.filter(nvHasCompleteEdition).length;
 const status=searchBusy?'Finding your next reads…':fetchError?'Some books are unavailable right now':hasMore?'Explore more with Load more':'Your current selection is ready';
 return `<div class="nv204-complete-status" role="status" aria-live="polite"><span class="nv204-status-dot" aria-hidden="true"></span><span><strong>${shown} ${shown===1?'book':'books'} ready to read</strong><small>${status}${checked>shown?' · '+checked+' checked in this session':''}</small></span><span class="nv204-verified-tag">Full books ✓</span>${shown?'<button type="button" class="nv207-surprise" id="nv207-complete-surprise">Surprise me ✧</button>':''}</div>`;
}
function nvCompleteTextCandidate(b){
 if(!b||b.source!=='gutenberg'||b.copyright===true||nvAnnexIsFlagged(b))return false;
 if(Object.prototype.hasOwnProperty.call(CURATED_TEXTS,String(b.id)))return true;
 return Object.entries(b.formats||{}).some(([type,link])=>
   /^(?:text\/plain|text\/html)(?:;|$)/i.test(type)&&nvTextSourceURL(link));
}
async function nvVerifyCompleteText(b){
 if(!nvCompleteTextCandidate(b))return false;
 const key=id(b);
 if(nvCompleteTexts.has(key))return true;
 if(nvCompleteFailed.has(key)&&Date.now()-nvCompleteFailed.get(key)<120000)return false;
 if(nvCompleteChecks.has(key))return nvCompleteChecks.get(key);
 const task=(async()=>{
  try{
   // Only test actual fetchable, trusted text. Never count a bare EPUB link,
   // preview page, catalogue record or HTTP success without an ebook end marker.
   const links=[];
   const add=link=>{if(nvTextSourceURL(link)&&!links.includes(link))links.push(link)};
   const curated=CURATED_TEXTS[String(b.id)];
   // Known GITenberg text is preferable to automated repeated downloads
   // from Project Gutenberg's main website. Use Gutendex formats as fallback.
   add(curated);
   for(const link of nvGutenbergFormatURLs(b.formats,'text/plain'))add(link);
   if(curated&&/^https:\/\/raw\.githubusercontent\.com\/GITenberg\//.test(curated)){
    const base=curated.replace(/[^/]+$/,'');
    add(base+String(b.id)+'-0.txt');add(base+String(b.id)+'.txt');
   }
   for(const link of nvGutenbergFormatURLs(b.formats,'text/html'))add(link);
   // Faster per-source timeout; retain fallback paths, but avoid long serial
   // retries that make Load more feel locked. Verified integrity is unchanged.
   const maxAttempts=links.length>=3?3:links.length;
   for(let i=0;i<maxAttempts;i++){
    const link=links[i];
    try{
     const file=await nvDownloadFullText(link,7200);
     if(file.valid&&file.complete&&file.text){
      nvCompleteTexts.set(key,{text:file.text,source:link,title:b.title,words:nvCountWords(file.text)});
      nvCompleteFailed.delete(key);
      return true;
     }
    }catch{} // Only a complete, successfully fetched ebook can be listed.
   }
  }catch{}
  nvCompleteFailed.set(key,Date.now());
  return false;
 })();
 nvCompleteChecks.set(key,task);
 try{return await task}finally{nvCompleteChecks.delete(key)}
}
// A smaller, immediately rendered first batch makes the section responsive.
// Background look-ahead verifies the next page as its button comes into view.
const NV_COMPLETE_BATCH=10;
function nvCompleteCandidates(query='',genre=''){
 return nvDistinct(NV_STARTER.filter(b=>nvCompleteTextCandidate(b)&&nv207CompleteMatches(b,query,genre)));
}
const nvCompletePrefetching=new Set();
async function nvPrefetchCompleteNext(query,genre,pageNumber,root){
 // No speculative ebook downloads on metered/data-saver or very slow networks.
 const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 if(connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType)||document.hidden)return;
 const key=JSON.stringify([query,genre,pageNumber]);
 if(nvCompletePrefetching.has(key))return;
 nvCompletePrefetching.add(key);
 try{
  const start=(pageNumber-1)*NV_COMPLETE_BATCH;
  const books=nvCompleteCandidates(query,genre).slice(start,start+Math.min(2,NV_COMPLETE_BATCH));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,books.length)},async()=>{
   while(cursor<books.length){
    if(root!==nvBrowseRoot||!nvCompleteOnly||screen!=='explore')return;
    const book=books[cursor++];
    if(!nvCompleteTexts.has(id(book)))await nvVerifyCompleteText(book);
   }
  }));
 }finally{nvCompletePrefetching.delete(key)}
}
async function nvBrowseVerifiedComplete({first,pageNumber,query,genre,isCurrent}){
 const candidates=nvCompleteCandidates(query,genre);
 const start=(pageNumber-1)*NV_COMPLETE_BATCH;
 const starter=candidates.slice(start,start+NV_COMPLETE_BATCH);
 const moreLocal=start+NV_COMPLETE_BATCH<candidates.length;
 const localPages=Math.ceil(candidates.length/NV_COMPLETE_BATCH);
 const remoteWindow=nvCompleteRemoteWindow(pageNumber,localPages,!!(query||genre));
 const root=nvBrowseRoot;
 let renderQueued=false;
 const showProgress=()=>{
  if(!isCurrent())return;
  lastSearch=displayResults().length+' '+(displayResults().length===1?'book':'books')+' ready'+(searchBusy?' · finding more…':'');
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;if(isCurrent())nvUpdateBrowse()});
 };
 async function checkQueue(items,workers){
  let cursor=0;
  const seen=new Set(results.map(id));
  const batch=nvDistinct(items).filter(b=>!seen.has(id(b)));
  await Promise.all(Array.from({length:Math.min(workers,batch.length)},async()=>{
   while(cursor<batch.length){
    if(!isCurrent())return;
    const book=batch[cursor++],key=id(book);
    if(seen.has(key))continue;
    const exists=nvCompleteTexts.has(key);
    const verified=await nvVerifyCompleteText(book);
    if(!isCurrent())return;
    nvCompleteChecked++;
    if(verified&&!seen.has(key)){
     seen.add(key);results.push(book);showProgress();
    }else if(!exists)showProgress();
   }
  }));
 }
 const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 // Limit traffic rather than fire six large book downloads simultaneously.
 const workers=connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType)?1:3;
 let remote=[],remoteMore=false,providerError='',remoteAvailable=false;
 // Start metadata in parallel; it does not block the first verified local books.
 const remotePromise=remoteWindow?getGutenPage(query,remoteWindow.page,true,genre).then(r=>{
  const from=remoteWindow.segment*NV_COMPLETE_REMOTE_SLICE;
  remote=(r.items||[]).slice(from,remoteWindow.segment===2?undefined:from+NV_COMPLETE_REMOTE_SLICE);
  remoteMore=!!r.more||from+NV_COMPLETE_REMOTE_SLICE<(r.items||[]).length;
  remoteAvailable=true;
 }).catch(()=>{providerError='Complete-book discovery is temporarily unavailable. You can retry without losing verified books.'}):Promise.resolve();
 await checkQueue(starter,workers);
 if(!isCurrent())return;
 // Local pages can be loaded even if Gutendex is slow or unavailable.
 if(!remoteWindow){
  hasMore=moreLocal||(!query&&!genre);
  searchBusy=false;nvExtraCatalogPending=false;
  lastSearch=displayResults().length?'Your next stories are ready · Load more anytime':'More books to explore · tap Load more';
  nvUpdateBrowse();return;
 }
 await remotePromise;
 if(!isCurrent())return;
 const matches=(query?nvMatchAndRank(remote,query,'relevance'):remote)
  .filter(b=>nv207CompleteMatches(b,query,genre))
  .filter(nvCompleteTextCandidate)
  .filter(b=>!results.some(r=>id(r)===id(b)));
 await checkQueue(matches,workers);
 if(!isCurrent())return;
 hasMore=moreLocal||(!providerError&&remoteMore);
 searchBusy=false;nvExtraCatalogPending=false;
 fetchError=providerError||(nv219StaleCatalogUsed?'Showing saved book information while the live catalogue reconnects.':'');
 lastSearch=displayResults().length
  ?'✓ '+displayResults().length+' complete editions verified and ready to read'
  :providerError|| (hasMore?'No matches in this group. Tap Load more to check the next.':'No accessible complete texts matched your selection.');
 nvUpdateBrowse();
}
function displayResults(){
 let a=nvPublicBooks(results);
 if(nvCompleteOnly){
  a=a.filter(b=>nvHasCompleteEdition(b)&&nvCompleteLengthMatches(b)&&nv207CompleteMatches(b,searchText,selectedGenre));
  if(sort==='title')a.sort((x,y)=>x.title.localeCompare(y.title));
  else if(sort==='shortest'||sort==='longest')a.sort((x,y)=>(sort==='shortest'?1:-1)*(nvCompleteTexts.get(id(x)).words-nvCompleteTexts.get(id(y)).words)||x.title.localeCompare(y.title));
  else a.sort((x,y)=>nvPopularityScore(y)-nvPopularityScore(x)||x.title.localeCompare(y.title));
  return nv210StableResults(a);
 }
 if(source!=='all')a=a.filter(x=>x.source===source);
 // A selected genre constrains existing as well as newly appended book cards.
 if(selectedGenre)a=a.filter(b=>nv207CompleteGenreMatches(b,selectedGenre)||nvSearchRelevance(b,selectedGenre)>=0);
 if(sort==='relevance'&&!(nvStarterActive&&!searchText&&!selectedGenre))a=nvMatchAndRank(a,searchText,sort);
 else if(searchText)a=a.filter(b=>nvSearchRelevance(b,searchText)>=0);
 if(sort==='newest')a.sort((x,y)=>Number(y.year||0)-Number(x.year||0)||Number(!!y.cover)-Number(!!x.cover));
 if(sort==='oldest')a.sort((x,y)=>Number(x.year||9999)-Number(y.year||9999));
 if(sort==='title')a.sort((x,y)=>x.title.localeCompare(y.title));
 return nv210StableResults(a);
}
function genresView(){return `<div class="intro-label">THE SUBJECT INDEX</div><h1 class="page-title">Whatever you’re in the mood for.</h1><p class="subtitle">Browse a wide range of genres and subgenres. Books may have more subject tags than the collections listed here.</p><div class="genre-search"><span>⌕</span><input id="genre-search" type="search" placeholder="Find a genre or subgenre..." aria-label="Filter genres"></div><div id="genre-groups">${genreGroups('')}</div>`}
function genreGroups(filter){return Object.entries(GROUPS).map(([name,arr])=>{const found=arr.filter(g=>g.toLowerCase().includes(filter.toLowerCase()));return found.length?`<section class="genre-group">${title(name,'Browse subjects and subgenres')}<div class="genre-tags">${found.map(g=>`<button data-genre="${esc(g)}">${esc(g)} <span>↗</span></button>`).join('')}</div></section>`:''}).join('')||'<div class="empty">No matching genres. Try a broader word.</div>'}
const localRow=b=>({user_id:me?.id||'guest',book_key:id(b),book_id:String(b.id),source:b.source,title:b.title,author:b.author,cover:b.cover||'',status:'want_to_read',created_at:new Date().toISOString()});
function nv205ShelfProgress(row){const record=nv205BookState(row.book_key);if(!record||record.progress<=0)return '';const pct=Math.min(100,Math.round(record.progress*100));return `<div class="nv205-shelf-info"><span>Reading progress</span><strong>${pct}%</strong></div><div class="nv205-progress-track" role="progressbar" aria-label="Reading progress for ${esc(row.title)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;}
/* 2.0.8: custom shelf groups are deliberately account-scoped and device-local.
   They do not pretend to be synced without a separate Supabase migration. */
function nv208Collections(owner=me?.id){
 if(!owner)return {names:[],assign:{}};
 const stored=getLocal('shelf-groups-v208:'+owner,null);
 const names=Array.isArray(stored?.names)?[...new Set(stored.names.filter(n=>typeof n==='string'&&n.trim()).map(n=>n.slice(0,32)))].slice(0,12):[];
 const assign={};if(stored?.assign&&typeof stored.assign==='object')for(const [key,val] of Object.entries(stored.assign))if(typeof val==='string'&&names.includes(val))assign[key]=val;
 return {names,assign};
}
function nv208StoreCollections(state){if(!nvMember())return false;try{const key=KEY+'shelf-groups-v208:'+me.id;localStorage.setItem(key,JSON.stringify(state));return localStorage.getItem(key)===JSON.stringify(state)}catch{return false}}
function nv208BookDate(row){const saved=Date.parse(row.created_at||0)||0;const progress=Date.parse(nv205BookState(row.book_key)?.updated_at||0)||0;const opened=Date.parse(historyRows.find(r=>r.book_key===row.book_key)?.accessed_at||0)||0;return Math.max(saved,progress,opened)}
function nv208BookGenres(row){return nv208GenreKeys(bookForRow(row));}
function nv208GenreOptions(){
 const map=new Map();for(const row of shelves){if(!row?.book_key)continue;for(const g of nv208BookGenres(row))if(!['fiction','books','literature','classics'].includes(g))map.set(g,(map.get(g)||0)+1)}
 return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,24).map(([g])=>g);
}
function shelfCard(row){const b=remember(bookMap.get(row.book_key)||{source:row.source,id:String(row.book_id),title:row.title,author:row.author,cover:row.cover,description:'Open this book to see more.',genres:[],formats:{}});return `<div class="shelf-item">${card(b)}${nv205ShelfProgress(row)}<div class="nv205-shelf-extra"><button type="button" data-nv205-continue="${esc(row.book_key)}">↗ Continue reading</button><button type="button" class="nv205-favorite" data-nv205-favorite="${esc(row.book_key)}" aria-label="${row.is_favorite?'Remove from favorites':'Add to favorites'}" aria-pressed="${!!row.is_favorite}">${row.is_favorite?'★':'☆'}</button></div><div class="nv208-card-group"><label>Collection <select data-nv208-tag-book="${esc(row.book_key)}" aria-label="Collection for ${esc(row.title)}"><option value="">None</option>${nv208Collections().names.map(n=>`<option value="${esc(n)}" ${nv208Collections().assign[row.book_key]===n?"selected":""}>${esc(n)}</option>`).join('')}</select></label></div><div class="shelf-controls"><select data-status="${esc(row.book_key)}" aria-label="Reading status for ${esc(row.title)}"><option value="want_to_read" ${row.status==='want_to_read'?'selected':''}>Want to read</option><option value="reading" ${row.status==='reading'?'selected':''}>Reading</option><option value="read" ${row.status==='read'?'selected':''}>Finished</option></select><button title="Remove from shelf" aria-label="Remove ${esc(row.title)}" data-remove="${esc(row.book_key)}">×</button></div></div>`}
function nvFilteredShelf(){
 const all=(nvMember()?shelves:[]).filter(r=>r?.book_key&&!nvAnnexIsFlagged(bookForRow(r)));
 const term=nvShelfQuery.trim().toLocaleLowerCase();
 const groups=nv208Collections();
 const filtered=all.filter(r=>{
  const progress=nv205BookState(r.book_key)?.progress||0;
  const status=shelfFilter==='all'||(shelfFilter==='favorites'?!!r.is_favorite:shelfFilter==='reading'?(r.status==='reading'||(r.status!=='read'&&progress>0)):r.status===shelfFilter);
  return status&&(!term||(String(r.title||'')+' '+String(r.author||'')).toLocaleLowerCase().includes(term))&&
   (nv208ShelfCollection==='all'||groups.assign[r.book_key]===nv208ShelfCollection)&&
   (nv208ShelfGenre==='all'||nv208BookGenres(r).includes(nv208ShelfGenre));
 });
 filtered.sort((a,b)=>{
  if(nv208ShelfSort==='title')return String(a.title||'').localeCompare(String(b.title||''));
  if(nv208ShelfSort==='author')return String(a.author||'').localeCompare(String(b.author||''))||String(a.title||'').localeCompare(String(b.title||''));
  if(nv208ShelfSort==='progress')return (nv205BookState(b.book_key)?.progress||0)-(nv205BookState(a.book_key)?.progress||0)||nv208BookDate(b)-nv208BookDate(a);
  return nv208BookDate(b)-nv208BookDate(a);
 });return filtered;
}
function nvShelfResultsMarkup(){
 const all=(nvMember()?shelves:[]).filter(r=>r?.book_key&&!nvAnnexIsFlagged(bookForRow(r)));
 const a=nvFilteredShelf();
 if(!a.length)return `<div class="empty"><h3>${all.length?'No matching books on this shelf.':'Every good shelf starts somewhere.'}</h3><p>${all.length?'Try clearing your search, filters or collection.':'Browse a book, tap the heart, and make it yours.'}</p>${all.length?'<button type="button" class="secondary-btn" data-nv-clear-shelf>Clear search</button>':'<button class="primary-btn" data-view="explore">Find something to read ↗</button>'}</div>`;
 return `<div class="book-grid shelf-grid">${a.map(shelfCard).join('')}</div>`;
}
function nvRefreshShelfResults(){
 if(screen!=='library')return;
 const el=$('#nv-shelf-grid');if(el)el.innerHTML=nvShelfResultsMarkup();
 const count=$('#nv-shelf-count');if(count)count.textContent=`${nvFilteredShelf().length} saved book${nvFilteredShelf().length===1?'':'s'} shown`;
}
function library(){
 nvEnsurePersonalSearchOwner();
 if(!nvMember())return nvGuestRestrictedPage('library');
 const total=shelves.filter(r=>r?.book_key&&!nvAnnexIsFlagged(bookForRow(r))).length;
 const tabs=[['all','All books'],['want_to_read','Want to read'],['reading','Reading now'],['read','Finished'],['favorites','★ Favorites']];
 return `<div class="intro-label">A SHELF OF YOUR OWN</div><h1 class="page-title">Your books, your pace.</h1><p class="subtitle">${total} saved ${total===1?'book':'books'}. Synced with your Novella account.</p>
 <div class="nv-personal-toolbar"><label for="nv-shelf-search">Find a saved book</label><div class="nv-personal-search"><span aria-hidden="true">⌕</span><input id="nv-shelf-search" type="search" autocomplete="off" placeholder="Search title or author…" value="${esc(nvShelfQuery)}" aria-label="Search your saved bookshelf"></div><small id="nv-shelf-count" role="status">${nvFilteredShelf().length} saved book${nvFilteredShelf().length===1?'':'s'} shown</small></div>
 <div class="shelf-tabs" role="group" aria-label="Filter reading shelf">${tabs.map(([key,name])=>`<button class="${shelfFilter===key?'active':''}" data-shelf-tab="${key}" aria-pressed="${shelfFilter===key}">${name}</button>`).join('')}</div>
 <section class="nv208-shelf-tools" aria-label="Organize your Bookshelf"><div class="nv208-shelf-tools-row"><label>Sort by<select id="nv208-shelf-sort"><option value="recent" ${nv208ShelfSort==='recent'?'selected':''}>Recently active</option><option value="title" ${nv208ShelfSort==='title'?'selected':''}>Title A–Z</option><option value="author" ${nv208ShelfSort==='author'?'selected':''}>Author A–Z</option><option value="progress" ${nv208ShelfSort==='progress'?'selected':''}>Reading progress</option></select></label><label>Genre<select id="nv208-shelf-genre"><option value="all">All genres</option>${nv208GenreOptions().map(g=>`<option value="${esc(g)}" ${nv208ShelfGenre===g?'selected':''}>${esc(g)}</option>`).join('')}</select></label><label>Collection<select id="nv208-shelf-collection"><option value="all">All collections</option>${nv208Collections().names.map(n=>`<option value="${esc(n)}" ${nv208ShelfCollection===n?'selected':''}>${esc(n)}</option>`).join('')}</select></label></div><div class="nv208-new-collection"><input id="nv208-collection-name" type="text" autocomplete="off" placeholder="Name a collection" maxlength="32" aria-label="New collection name"><button type="button" data-nv208-new-collection>Create collection</button>${nv208ShelfCollection!=='all'?'<button type="button" class="nv208-remove-collection" data-nv208-remove-collection>Delete selected collection</button>':''}</div><small>Custom collections stay on this device, separate for each account. Books, favorites and progress continue to use your existing account sync.</small></section>
 ${personalSyncIssue?syncBanner():''}
 <div class="nv205-sync-caption"><span aria-hidden="true">✧</span><div><strong>Reading progress on every device</strong><br><span id="nv205-sync-message">${nv205CloudReady?'Your reading place is up to date on your devices.':'Your place is saved on this device. We’ll sync it when your account connection is available.'}</span></div></div>
 <div id="nv-shelf-grid">${nvShelfResultsMarkup()}</div>
 ${nv209ShelfMarkup()}`;
}
function nvJournalEntries(){
 const opened=nvMember()?historyRows:[],saved=nvMember()?shelves:[];
 const found=new Map();
 for(const r of opened){
  if(!r?.book_key)continue;
  found.set(r.book_key,{...r,opened:true,saved:false,sortDate:r.accessed_at||r.created_at||''});
 }
 for(const r of saved){
  if(!r?.book_key)continue;
  const previous=found.get(r.book_key);
  found.set(r.book_key,{...previous,...r,opened:!!previous?.opened,saved:true,
   last_action:previous?.last_action||'saved',accessed_at:previous?.accessed_at||'',
   sortDate:previous?.accessed_at||r.created_at||''});
 }
 return [...found.values()].filter(r=>!nvAnnexIsFlagged(bookForRow(r)))
  .sort((a,b)=>Date.parse(b.sortDate||0)-Date.parse(a.sortDate||0));
}
function nvJournalResultsMarkup(){
 if(nvJournalFilter==='highlights')return nv206JournalMarkup();
 const entries=nvJournalEntries();
 const tokens=nvJournalQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const matching=entries.filter(r=>(nvJournalFilter==='all'||(nvJournalFilter==='saved'?r.saved:r.opened))&&tokens.every(token=>(String(r.title||'')+' '+String(r.author||'')).toLocaleLowerCase().includes(token)));
 if(!matching.length)return `<div class="empty"><h3>${entries.length?'No books match that search.':'Your reading story starts here.'}</h3><p>${entries.length?'Try a different title or author, or show all books.':'Save or open a book and it will appear here.'}</p>${entries.length?'<button type="button" class="secondary-btn" data-nv-clear-journal>Show all books</button>':'<button type="button" class="primary-btn" data-view="explore">Explore books ↗</button>'}</div>`;
 return `<div class="history-list">${matching.map(r=>`<button type="button" class="history-row nv-journal-row" data-book="${esc(r.book_key)}" aria-label="Open ${esc(r.title)}"><span class="nv-history-cover"><span aria-hidden="true">📖</span>${url(r.cover)?`<img src="${esc(url(r.cover))}" loading="lazy" alt="" onerror="this.remove()">`:''}</span><span class="nv-journal-description"><strong>${esc(r.title||'Untitled')}</strong><small>${esc(r.author||'Unknown author')}</small><span class="nv-journal-tags">${r.saved?`<span>♡ Saved${r.status==='reading'?' · Reading':r.status==='read'?' · Finished':''}</span>`:''}${r.opened?'<span>Opened</span>':''}</span></span><small class="nv-journal-date">${r.sortDate&&!Number.isNaN(Date.parse(r.sortDate))?new Date(r.sortDate).toLocaleDateString():''}</small></button>`).join('')}</div>`;
}
function nvRefreshJournalResults(){
 if(screen!=='history')return;
 const node=$('#nv-journal-results');if(node)node.innerHTML=nvJournalResultsMarkup();
 const count=$('#nv-journal-count');if(count){const entries=nvJournalEntries();count.textContent=nvJournalFilter==='highlights'?`${nv206Rows(me?.id).length} saved passages`:`${entries.length} book${entries.length===1?'':'s'} in your journal`;}
 $$('.nv-journal-tab').forEach(b=>{const active=b.dataset.journalTab===nvJournalFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function historyView(){
 if(!nvMember())return nvGuestRestrictedPage('history');
 nvEnsurePersonalSearchOwner();
 const all=nvJournalEntries(),saved=all.filter(x=>x.saved).length,opened=all.filter(x=>x.opened).length;
 const tabs=[['all',`All (${all.length})`],['saved',`Saved (${saved})`],['opened',`Opened (${opened})`],['highlights',`Highlights (${nv206Rows(me.id).length})`]];
 return `<div class="intro-label">YOUR READING JOURNAL</div><h1 class="page-title">Your story so far.</h1><p class="subtitle">Find books you saved or opened. Only visible to this account.</p>
 ${me&&personalSyncIssue?syncBanner():''}
 <div class="nv-personal-toolbar"><label for="nv-journal-search">Search your journal</label><div class="nv-personal-search"><span aria-hidden="true">⌕</span><input type="search" id="nv-journal-search" placeholder="Search books, passages and notes…" autocomplete="off" value="${esc(nvJournalQuery)}" aria-label="Search books in your reading journal"></div><small role="status" id="nv-journal-count">${all.length} book${all.length===1?'':'s'} in your journal</small></div>
 <div class="nv-journal-tabs" role="group" aria-label="Journal filter">${tabs.map(([k,label])=>`<button type="button" class="nv-journal-tab ${nvJournalFilter===k?'active':''}" data-journal-tab="${k}" aria-pressed="${nvJournalFilter===k}">${label}</button>`).join('')}</div>
 <div id="nv-journal-results" aria-live="polite">${nvJournalResultsMarkup()}</div>`;
}
function info(){return `<div class="intro-label">A LETTER FROM NOVELLA</div><h1 class="page-title">A home for curious readers.</h1>
 <div class="about-lead"><p>We believe a good book deserves more than a thumbnail and a star rating.</p><p>Novella is an independent-inspired reading room for finding stories, keeping the ones that matter, and enjoying open editions without the clutter.</p></div>
 <div class="about-grid"><section><span class="intro-label">01 / DISCOVERY</span><h2>Explore without the noise.</h2><p>Search books and authors, wander through genres and subjects, and save your next chapter to a personal shelf.</p></section><section><span class="intro-label">02 / THE READER</span><h2>Make the page yours.</h2><p>Use Gutenberg’s official online editions, or open your own EPUB, PDF, TXT, or HTML file in a private reading desk with chapters, font controls, and bookmarks.</p></section><section><span class="intro-label">03 / YOUR SPACE</span><h2>Private shelves, public conversations.</h2><p>Saving books, viewing reading history, and downloading Novella editions require a registered Novella account. Signed-in readers can sync libraries and write public reviews.</p></section><section><span class="intro-label">04 / RIGHTS & SOURCES</span><h2>Respect the work.</h2><p>Metadata comes from Open Library; public-domain editions come from Project Gutenberg. Copyright and regional download permissions vary. Store links go to the retailer.</p></section></div>
 <section class="about-note"><h2>The fine print</h2><p>This public-beta service uses free hosting and third-party data sources, each with usage limits. There is no promise that every title is available as a free full text. Reviews are public; account data is subject to Supabase security policies. We do not collect payments.</p><p>Clear legacy guest data stored in this browser, or visit Settings to manage or delete your Novella account securely. Authentication emails need a configured mail service for public use.</p><button class="secondary-btn" type="button" data-view="settings">Open privacy &amp; data settings ↗</button><p class="subtitle">Account connection: ${db?'Supabase configured':'Guest-only until your Supabase publishable key is added to config.js'}. Email delivery must be configured separately for public signups.</p></section>`}

function nvAvatarData(value){
 const v=typeof value==='string'?value:'';
 return v.length<=95000&&/^data:image\/(?:webp|jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(v)?v:'';
}
function nvCurrentAvatar(){return nvAvatarData(me?.user_metadata?.novella_avatar)}
function nvAvatarMarkup(data,initial,extra=''){
 const safe=nvAvatarData(data);
 return `<span class="nv-profile-avatar ${extra}" aria-hidden="true">${safe?`<img class="nv-avatar-image" alt="" src="${esc(safe)}">`:esc(String(initial||'R').slice(0,1).toUpperCase())}</span>`;
}
function nvSyncRememberedIdentity(user){
 if(!user?.id)return;
 nvWriteKnownAccounts(nvKnownAccounts.map(a=>a.id===user.id?{...a,email:user.email||a.email,avatar:nvAvatarData(user.user_metadata?.novella_avatar)}:a));
}
function nvAvatarDisplaySize(){
 return 144;
}
function nvSettingsView(){
 const signed=!!(me&&nvProfile),name=nvProfile?.display_name||'Guest reader',initial=name.charAt(0).toUpperCase();
 return `<section class="nv29-page nv-settings-page">
 <header class="nv29-lead nv30-lead"><div><div class="nv29-kicker">NOVELLA / YOUR SPACE</div><h1>Thoughtful settings<span class="nv30-head-period">.</span></h1><p class="subtitle">Everything for your account and reading life, in one quiet place.</p></div><span class="nv29-pill"><span class="nv29-dot"></span>${signed?'Account connected':'Guest session · discovery only'}</span></header>
 <div class="nv29-settings-grid">
  <section class="nv29-panel nv29-settings-panel nv30-account-panel"><div class="nv30-panel-heading"><span class="nv29-kicker">01 / IDENTITY & ACCESS</span><span class="nv30-panel-glyph" aria-hidden="true">✧</span></div><h2>Your account</h2><p>Make it personal. Keep the right account close at hand.</p>
   <button type="button" class="nv29-settings-action" data-view="profile">${nvAvatarMarkup(nvCurrentAvatar(),initial,'nv-avatar-small')}<span><strong>${esc(name)}</strong><small>${signed?'Edit photo, display name and email':'Set up your reading identity'}</small></span><span aria-hidden="true">↗</span></button>
   <button type="button" class="nv29-settings-action" data-nv-settings="open-picker"><span class="nv29-icon" aria-hidden="true">⇄</span><span><strong>Switch reading account</strong><small>Choose from remembered accounts or add another</small></span><span aria-hidden="true">›</span></button>
   <div class="nv29-settings-divider"></div>
   ${signed?`<div class="nv29-settings-inline"><button class="secondary-btn" type="button" data-profile-action="signout">Sign out</button><button class="secondary-btn" type="button" data-profile-action="password">${me.app_metadata?.provider==='google'?'Set / change password':'Change password'}</button></div>`:'<p class="nv29-settings-tiny">Sign in to save books, see your reading history, and download verified editions.</p>'}
   <div class="nv30-panel-foot"><span class="nv30-foot-icon" aria-hidden="true">✦</span><p>Account changes here apply only to Novella. Your other accounts stay untouched.</p></div>
  </section>
  <section class="nv29-panel nv29-settings-panel nv30-data-panel"><div class="nv30-panel-heading"><span class="nv29-kicker">02 / YOUR LIBRARY</span><span class="nv30-panel-glyph" aria-hidden="true">◈</span></div><h2>Reading data</h2><p>Back up your library and take care of your reading records.</p>
   <button type="button" class="nv29-settings-action" data-profile-action="export"><span class="nv29-icon" aria-hidden="true">↓</span><span><strong>Export my reading data</strong><small>${signed?'Download your shelf, journal and cached reading progress':'Sign in to export your saved books and journal'}</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="nv29-settings-action" data-profile-action="local"><span class="nv29-icon" aria-hidden="true">⌁</span><span><strong>Clear local Novella data</strong><small>Removes device-only searches, settings and reading positions. Cloud records stay.</small></span><span aria-hidden="true">›</span></button>
   ${signed?`<div class="nv29-settings-divider"></div><button type="button" class="nv29-settings-action" data-profile-action="history"><span class="nv29-icon" aria-hidden="true">◷</span><span><strong>Clear synced history</strong><small>Deletes your reading history everywhere. Saved books stay.</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="nv29-settings-action" data-profile-action="shelf"><span class="nv29-icon" aria-hidden="true">▤</span><span><strong>Empty synced bookshelf</strong><small>Removes your saved books everywhere. Reading history stays.</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="nv29-settings-action" data-profile-action="reader-state"><span class="nv29-icon" aria-hidden="true">⌑</span><span><strong>Clear synced reading positions</strong><small>Remove cloud reading progress and bookmarks for this Novella account.</small></span><span aria-hidden="true">›</span></button>`:''}
   <div class="nv30-panel-foot"><span class="nv30-foot-icon" aria-hidden="true">⌑</span><p>Destructive actions ask for confirmation before changing your library.</p></div>
  </section>
 </div>
 ${nv209SettingsMarkup()}
 <section class="nv209-panel nv210-sync-panel" aria-label="Reading sync recovery">
  <div class="intro-label">NOVELLA / KEEP YOUR PLACE</div>
  <h2>Your reading data, together.</h2>
  <p>Progress and highlights are saved while you read. If a connection is interrupted, Novella keeps your latest changes on this device and retries safely.</p>
  <div class="nv210-sync-actions"><button type="button" class="nv209-button nv209-button-main" data-nv210-sync>↻ Sync reading data</button><p id="nv210-sync-status" role="status" aria-live="polite">${esc(nv210ManualSyncMessage||nv210SyncStatus())}</p></div>
  <small>Requires a signed-in Novella account and your existing Supabase reading-sync tables. No reading data is deleted by this action.</small>
 </section>
 ${signed?`<details class="nv29-panel nv29-settings-danger"><summary><span><strong>Account deletion</strong><small>Permanent changes are kept separate from everyday settings</small></span></summary><div><p>Deleting your Novella account permanently removes your profile and associated reading data. This does not delete your Google, Cloudflare, or device accounts. Confirmation is required.</p><button type="button" class="nv-danger-button" data-profile-action="delete">Delete my Novella account…</button></div></details>`:''}
 <p class="nv29-settings-tiny">These controls affect Novella only. Some actions are account-wide; please read the confirmation shown before proceeding.</p>
 </section>`;
}
function profileView(){
 const logged=!!(me&&nvProfile),name=logged?(nvProfile.display_name||'Reader'):'Guest reader';
 const initial=name.charAt(0).toUpperCase(),email=logged?(me.email||''):'';
 const since=logged&&nvProfile.created_at?new Date(nvProfile.created_at).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'';
 const bio=logged?String(me.user_metadata?.novella_bio||'').slice(0,220):'';
 const photoSize=nvAvatarDisplaySize();
 return `<section class="nv29-page nv-profile-page">
 <header class="nv29-lead nv30-lead"><div><div class="nv29-kicker">NOVELLA / THE PERSON BEHIND THE PAGES</div><h1>Your profile<span class="nv30-head-period">.</span></h1><p class="subtitle">A place for your name, your story, and the books you love.</p></div><button type="button" class="secondary-btn nv30-lead-link" data-view="settings">Account settings <span aria-hidden="true">↗</span></button></header>
 <div class="nv29-identity-grid">
  <div class="nv29-panel">
   <div class="nv29-hero" style="--nv-avatar-size:${photoSize}px"><div class="nv30-hero-mark" aria-hidden="true">n.</div><div class="nv29-hero-label">YOUR PERSONAL READING SPACE <span aria-hidden="true">/</span> THE READER</div>
    <div class="nv29-hero-identity"><div class="nv33-avatar-frame">${nvAvatarMarkup(nvCurrentAvatar(),initial,'nv-avatar-large')}${logged?`<button type="button" class="nv33-avatar-upload" data-profile-action="upload-avatar" aria-label="Upload a new profile picture">✎</button>`:''}</div><div><h2>${esc(name)}</h2><p>${logged?esc(email):'Not signed in'}</p>${logged&&since?`<small>Here since ${esc(since)}</small>`:''}</div></div>
    ${logged?`<div class="nv29-hero-edit"><button type="button" data-profile-action="edit-avatar">✦ ${nvCurrentAvatar()?'Edit current photo':'Add a photo'}</button>${nvCurrentAvatar()?'<button type="button" data-profile-action="remove-avatar">Remove picture</button>':''}</div><p id="nv-avatar-msg" class="nv-profile-message nv30-avatar-status" role="status" aria-live="polite"></p>`:''}
   </div>
   ${logged?`<input type="file" class="nv-file-input" id="nv-profile-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif">`:''}
   ${logged?`
   <div class="nv29-section"><h3>Display name</h3><p>The name people see inside your Novella reading space.</p><form id="nv-profile-form" class="nv-profile-field-group"><label for="nv-profile-name">Your name</label><input id="nv-profile-name" name="name" minlength="2" maxlength="50" required autocomplete="nickname" value="${esc(nvProfile.display_name||'')}"><div class="nv-profile-form-actions"><button class="primary-btn" type="submit">Save name</button></div><p id="nv-profile-msg" class="nv-profile-message" role="status"></p></form></div>
   <div class="nv29-section"><h3>Email address</h3><p>Update your contact address securely using email confirmation.</p><form id="nv-profile-email-form" class="nv-profile-field-group"><label for="nv-profile-email">Your email</label><input id="nv-profile-email" name="email" type="email" autocomplete="email" maxlength="254" value="${esc(email)}" required><p class="nv-field-help">Your previous email stays active until Supabase confirms the change.</p><div class="nv-profile-form-actions"><button class="secondary-btn" type="submit">Update email</button></div><p id="nv-profile-email-msg" class="nv-profile-message" role="status" aria-live="polite"></p></form></div>
   <div class="nv29-section"><h3>Your introduction</h3><p>A few lines about the stories you enjoy.</p><form id="nv-profile-bio-form" class="nv-profile-field-group"><label for="nv-profile-bio">About me <span style="font-weight:400;color:var(--sub)">(optional)</span></label><textarea id="nv-profile-bio" name="bio" maxlength="220" placeholder="A few words about your reading interests…">${esc(bio)}</textarea><div class="nv-profile-form-actions"><button class="secondary-btn" type="submit">Save introduction</button></div><p id="nv-profile-bio-msg" class="nv-profile-message" role="status" aria-live="polite"></p></form></div>`:
   `<div class="nv29-section"><h3>Come on in</h3><p>Sign in to keep a reading identity that follows you across devices.</p><div class="nv-profile-actions"><button class="primary-btn" data-auth="signup">Create account</button><button class="secondary-btn" data-auth="signin">Sign in</button></div></div>`}
  </div>
  <aside class="nv29-panel nv29-side">
   <div class="nv29-preview-quote"><span class="nv29-kicker">FROM YOUR NOVELLA JOURNAL</span><p>Every reader has a story<span class="nv30-quote-dot">.</span></p><div class="nv30-quote-flourish" aria-hidden="true">✧ &nbsp; ❧ &nbsp; ✧</div></div>
   <div class="nv29-side-block"><span class="nv29-kicker">YOUR INTRODUCTION</span><h3>A little about you</h3><p class="nv29-bio-live" id="nv29-bio-preview">${esc(bio||'Your reading interests will appear here when you write an introduction.')}</p><div class="nv29-mini-stats"><div><strong>${logged?shelves.length:0}</strong><span>Saved books</span></div><div><strong>${logged?historyRows.length:0}</strong><span>Journal entries</span></div></div></div>
   <div class="nv29-side-block"><span class="nv29-kicker">MADE PERSONAL</span><h3>Your details, your choice.</h3><p>Your profile photo and introduction are tied to your Novella account. They don't edit your Google or other accounts.</p><button type="button" class="secondary-btn" data-view="settings">Manage privacy &amp; settings ↗</button></div>
  </aside>
 </div></section>`;
}
function paint(){const main=$('#main');if(!main)return;document.body.dataset.nvScreen=screen;nvEagerCoverBudget=3;$$('.nav').forEach(b=>{const selected=b.dataset.view===screen;b.classList.toggle('active',selected);if(b.closest('.nv-mobile-bottom-nav')){if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}});const html=screen==='home'?home():screen==='explore'?explore():screen==='genres'?genresView():screen==='library'?library():screen==='history'?historyView():screen==='profile'?profileView():screen==='settings'?nvSettingsView():screen==='annex'?nvAnnexView():info();main.innerHTML=html;if(screen==='settings')queueMicrotask(nv216UpdatePaint);if(screen==='library'||screen==='settings')queueMicrotask(()=>nv209RefreshViews());}
function path(s=''){const u=new URL(location.href);u.searchParams.delete('book');if(s&&s!=='home')u.searchParams.set('view',s);else u.searchParams.delete('view');return u.pathname+u.search;}
// Keep a single Home entry behind every in-site route. Android's first Back
// returns Home; the following Back is left to the browser (exit/previous page).
let nvRouteStacked=false;
function nvRouteURLCurrent(){return !!(new URL(location.href)).searchParams.get('view')||!!(new URL(location.href)).searchParams.get('book')}
function nvRegisterInternalRoute(url){
 if(!nvRouteStacked){history.pushState({nvNovellaRoute:true},'',url);nvRouteStacked=true;}
 else history.replaceState({nvNovellaRoute:true},'',url);
}

function navigate(s,update=true){
 if(update&&s==='home'&&nvRouteStacked){history.back();return;}
 if(nvCompleteOnly&&(s!=='explore'||update)){
  nvCompleteOnly=false;source='all';sort='relevance';
  if(s==='explore'){browse('','',1);return}
 }
 if(update&&!nvMember()&&(s==='library'||s==='history')){
  nvRequireMember(s==='history'?'view your reading history':'open your bookshelf');
  return;
 }
 if(nvPhotoEdit)nvPhotoEditorClose();
 nvAnnexLockOnLeave(s);
 ++nvDetailEpoch;
 const old=screen;screen=s;active=null;
 nvCloseMobileMenu();
 if(update){if(s==='home')history.replaceState({nvNovellaHome:true},'',path(s));else nvRegisterInternalRoute(path(s));}
 // Navigation should never show a false no-results state on an untouched Browse page.
 if(s==='explore'&&!results.length&&!searchText&&!selectedGenre&&(source==='all'||source==='gutenberg')){
  nvStarterActive=true;nvStarterCursor=24;nvStagedBooks=[];nvRemoteMore=false;
  results=nvDistinct(nvBuildSessionBrowsePool().slice(0,24));nvUpdateStarterMore();
  lastSearch='A fresh mix of books · more ready to explore';
 }
 paint();
 if(s==='home'&&old!=='home')refreshHomePicks();
 window.scrollTo({top:0,behavior:'instant'});
}
// When a genre is chosen on a phone, show its results instead of restoring the catalogue intro.
function nv43FocusGenreResults(){if(!window.matchMedia('(max-width:780px)').matches)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(screen!=='explore')return;document.querySelector('#main .section-head')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}));}
async function browse(q='',g='',p=1,{preserve=false}={}){
 nvAnnexLockOnLeave('explore');
 ++nvDetailEpoch;active=null;
 const first=p===1&&!preserve;
 if(screen!=='explore')nvRegisterInternalRoute(path('explore'));
 const previousPage=page,wasHasMore=hasMore;
 screen='explore';searchText=String(q||'').trim();selectedGenre=g;page=p;
 const term=nvCatalogQuery(searchText,g);
 const originalQuery=searchText,originalGenre=g,originalSource=source,originalSort=sort;
 const defaultBrowse=first&&!nvCompleteOnly&&!searchText&&!g&&sort!=='newest'&&(source==='all'||source==='gutenberg');
 if(first){
  nv210BrowseOrder=[];nv210BrowseOrderKey='';
  nvCanonicalRemote=null;
  nvBrowseRoot++;nvStarterActive=defaultBrowse;nvStarterCursor=defaultBrowse?24:0;
  nvStagedBooks=[];nvRemoteMore=false;nvExtraCatalogPending=source==='all'&&sort!=='newest';
  const cached=defaultBrowse?null:nvLoadSnapshot(searchText,g,nvBrowseSnapshotSource());
  results=defaultBrowse?nvDistinct(nvBuildSessionBrowsePool().slice(0,nvStarterCursor))
   :nvCompleteOnly?(first?[]:results.filter(nvHasCompleteEdition))
   :nvDistinct([...nvMatchAndRank(cached?.items||[],searchText,sort),
     ...(['newest','oldest'].includes(sort)?[]:nv213KnownMatches(searchText,g,source))]);
  hasMore=defaultBrowse?nvStarterCursor<nvBuildSessionBrowsePool().length:!!cached?.more;
 }
 const root=nvBrowseRoot,number=++seq;
 nv219StaleCatalogUsed=false;
 fetchError='';searchBusy=true;
 lastSearch=first?(nvCompleteOnly?'Finding complete books for you…':defaultBrowse?'A fresh selection is ready · finding more…':sort==='newest'?'Checking recently published books…':results.length?'Showing known matches · checking for more…':'Finding your next read…'):'Loading more books…';
 if(first){
  paint();
  // Genre chips can be clicked near the bottom of a very long index page.
  // Reset scroll *after* Browse has rendered; never preserve the genre page's position.
  if(typeof window.scrollTo==='function'){
   try{window.scrollTo({top:0,left:0,behavior:'instant'})}
   catch{window.scrollTo(0,0)}
  }
 }else nvUpdateBrowse();
 const current=()=>root===nvBrowseRoot&&screen==='explore'&&source===originalSource&&(nvCompleteOnly||sort===originalSort)&&searchText===originalQuery&&selectedGenre===originalGenre;
 const primaryCurrent=()=>current()&&number===seq;
 if(nvCompleteOnly){
  await nvBrowseVerifiedComplete({first,pageNumber:p,query:searchText,genre:g,isCurrent:primaryCurrent});
  return;
 }
 // Latest-publications mode searches the newest records, which can omit the main
 // original book entirely. Find the exact main title independently, non-blocking.
 if(first&&searchText&&source!=='gutenberg'&&!nvMainBook()&&nvQueryTokens(searchText).length>=2){
  getOL(searchText,1,14,'','title').then(found=>{
   if(!current())return;
   const exact=found.items.filter(b=>normTitle(b.title)===normTitle(searchText));
   exact.sort((a,b)=>nvPopularityScore(b)-nvPopularityScore(a));
   if(exact.length){nvCanonicalRemote=exact[0];nvUpdateBrowse()}
  }).catch(()=>{});
 }
 if(first&&source==='all'&&sort!=='newest'){
  if(defaultBrowse){
   // Book cards and the local next selection exist already; do not compete with
   // their first paint or image downloads by firing catalogues on navigation.
   await new Promise(resolve=>{
    if('requestIdleCallback' in window)requestIdleCallback(resolve,{timeout:2200});
    else setTimeout(resolve,950);
   });
   if(!primaryCurrent())return;
  }
  let olGood=false,freeGood=false;
  const primary=nvRelevantOL(term,1,sort,searchText).then(r=>{
   if(!primaryCurrent())return;
   olGood=true;
   if(nvStarterActive){
    nvStagedBooks=nvDistinct([...nvStagedBooks,...nvMatchAndRank(r.items,searchText,sort)]).filter(b=>!results.some(x=>nvWorkFingerprint(x)===nvWorkFingerprint(b)));
    nvRemoteMore=r.count>24||r.items.length===24;nvUpdateStarterMore();
   }else{results=nvDistinct([...results,...nvMatchAndRank(r.items,searchText,sort)]);hasMore=r.count>24||r.items.length===24;}
   nvSaveSnapshot(searchText,g,source,r.items,hasMore);
   searchBusy=false;
   lastSearch=nvStarterActive?'Handpicked books ready · new catalogue titles queued':`Showing ${displayResults().length} books${nvExtraCatalogPending?' · checking free classics…':''}`;
   nvUpdateBrowse();
  }).catch(()=>{
   if(!primaryCurrent())return;
   searchBusy=false;lastSearch=results.length?'Showing saved books · checking other editions…':'Checking free editions…';nvUpdateBrowse();
  });
  const extra=getGuten(searchText||g).then(items=>{
   if(!current())return;
   freeGood=true;
   if(nvStarterActive){
    nvStagedBooks=nvDistinct([...nvStagedBooks,...nvMatchAndRank(items,searchText,sort).slice(0,12)]).filter(b=>!results.some(x=>nvWorkFingerprint(x)===nvWorkFingerprint(b)));
    nvUpdateStarterMore();
   }else results=nvDistinct([...results,...nvMatchAndRank(items,searchText,sort).slice(0,12)]);
   nvExtraCatalogPending=false;
   if(!nvStarterActive&&results.length)nvSaveSnapshot(searchText,g,source,results,hasMore);
   lastSearch=results.length?'Showing '+displayResults().length+' books':'Finishing search…';
   nvUpdateBrowse();
  }).catch(()=>{if(current()){nvExtraCatalogPending=false;nvUpdateBrowse()}});
  await Promise.allSettled([primary,extra]);
  if(!current())return;
  nvExtraCatalogPending=false;
  if(!olGood&&!freeGood){
   fetchError=results.length?'Live catalogue unavailable; showing saved or curated books.':'Book partners are temporarily unavailable. Try again.';
  }else if(nv219StaleCatalogUsed){
   fetchError='Showing saved book information while the live catalogue reconnects.';
  }
  if(!results.length&&!searchText&&!g)results=nvDistinct(nvBuildSessionBrowsePool().slice(0,24));
  lastSearch=fetchError?(results.length?'Saved or curated books · live catalogue unavailable':'Catalogue unavailable · explore handpicked books'):results.length?'Showing '+displayResults().length+' book records':(searchText||g?'No matching editions found':'Handpicked classics ready to explore');
  nvUpdateBrowse();return;
 }
 try{
  const r=source==='gutenberg'?await getGutenPage(searchText||g,p):await nvRelevantOL(term,p,sort,searchText);
  if(!primaryCurrent())return;
  const rawItems=r.items||[],items=nvMatchAndRank(rawItems,searchText,sort),before=results.length;
  const more=source==='gutenberg'?r.more:r.count>p*24||rawItems.length===24;
  if(first&&nvStarterActive){
   nvStagedBooks=nvDistinct([...nvStagedBooks,...items]).filter(b=>!results.some(x=>nvWorkFingerprint(x)===nvWorkFingerprint(b)));
   nvRemoteMore=!!more;nvUpdateStarterMore();
  }else{
   results=first?nvDistinct([...results,...items]):nvDistinct([...results,...items]);
   hasMore=!!more&&(first||results.length>before);
   if(!first)nvRemoteMore=!!more;
  }
  if(first)nvSaveSnapshot(searchText,g,nvBrowseSnapshotSource(),items,!!more);
  searchBusy=false;
  if(nv219StaleCatalogUsed)fetchError='Showing saved book information while the live catalogue reconnects.';
  lastSearch=results.length?(sort==='newest'?'Recently published · '+displayResults().length+' catalogue records':'Showing '+displayResults().length+' book records'):(sort==='newest'?'No recent publications matched; try another topic':(searchText||g?'No matching editions found':'Handpicked classics ready to explore'));
 }catch(e){
  if(!primaryCurrent())return;
  fetchError=results.length?'The live catalogue is unavailable; your saved books remain.':'The book catalogue is temporarily unavailable. Please retry.';
  if(first&&!results.length)hasMore=false;
  else if(!first){page=previousPage;hasMore=wasHasMore;}
  searchBusy=false;lastSearch=results.length?'Showing available books':'Catalogue unavailable · retry';
 }
 if(primaryCurrent())nvUpdateBrowse();
}

async function initCatalog(){
 classics=nvHomepageFullBooks();
 featured=nvHomeReadableLineup();
 if(screen==='home'){
  const picks=$('#nv-home-picks');if(picks)picks.innerHTML=grid(featured);
  const classicsBox=$('#nv-home-classics');if(classicsBox)classicsBox.innerHTML=grid(classics.slice(0,6));
 }
 // Nonessential catalogues must never fight the first paint, sign-in,
 // Surprise or reading for network connections. Start only on an idle Home,
 // with small, bounded batches; metered/hidden sessions skip this work.
 const deferHomeCatalog=(fn,delay)=>setTimeout(()=>{
  if(screen!=='home'||!nvBackgroundNetworkOK())return;
  const run=()=>{if(screen==='home'&&nvBackgroundNetworkOK())void fn().catch(()=>{})};
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:8000});
  else setTimeout(run,500);
 },delay);
 deferHomeCatalog(nvWarmHomeRotation,11000);
 deferHomeCatalog(nvWarmDiscoveryCatalog,18000);
}

function matchingBook(k){return bookMap.get(k)||[...seed,...classics,...featured,...results].find(b=>id(b)===k)}
async function hydrate(k){const existing=matchingBook(k);if(existing&&(nvCompleteTexts.has(k)||(!existing.seed&&existing.source!=='openlibrary'&&existing.genres?.length)))return existing;const [kind,bookid]=k.split(':');try{
 if(kind==='gutenberg'){const d=await fetchJSON('https://gutendex.com/books/'+encodeURIComponent(bookid));return d?.title&&String(d.id)===bookid?gutenNorm(d):existing}
 if(kind==='openlibrary'){const d=await fetchJSON('https://openlibrary.org/works/'+encodeURIComponent(bookid)+'.json');let desc=d.description;if(typeof desc==='object')desc=desc?.value;return remember({...existing,source:kind,id:bookid,title:d.title||existing?.title||'Untitled',author:existing?.author||'Unknown author',cover:existing?.cover||(d.covers?.[0]?`https://covers.openlibrary.org/b/id/${d.covers[0]}-M.jpg`:''),description:typeof desc==='string'?desc:'No description available for this edition.',genres:(d.subjects||existing?.genres||[]).slice(0,30),formats:{},ebookAccess:existing?.ebookAccess||'',publicScan:existing?.publicScan||false,ia:existing?.ia||[],preview:'https://openlibrary.org/works/'+encodeURIComponent(bookid)})}
 }catch(e){if(existing)return existing;throw e}return existing;}
const CURATED_TEXTS={
 '1342':'https://raw.githubusercontent.com/GITenberg/Pride-and-Prejudice_1342/master/1342-0.txt',
 '84':'https://raw.githubusercontent.com/GITenberg/Frankenstein_84/master/84-0.txt',
 '2701':'https://raw.githubusercontent.com/GITenberg/Moby-Dick--Or-The-Whale_2701/master/2701-0.txt',
 '11':'https://raw.githubusercontent.com/GITenberg/Alice-s-Adventures-in-Wonderland_11/master/11-0.txt',
 '1661':'https://raw.githubusercontent.com/GITenberg/The-Adventures-of-Sherlock-Holmes_1661/master/1661.txt',
 '98':'https://raw.githubusercontent.com/GITenberg/A-Tale-of-Two-Cities_98/master/98-0.txt',
 '158':'https://raw.githubusercontent.com/GITenberg/Emma_158/master/158-0.txt',
 '76':'https://raw.githubusercontent.com/GITenberg/Adventures-of-Huckleberry-Finn_76/master/76-0.txt'
};
Object.assign(CURATED_TEXTS, NV_ARCHIVE_TEXTS);
// V11.32: rotating homepage choices are deliberately limited to known Gutenberg
// full-text candidates, never catalogue-only works or publisher previews.
const NV_HOME_MOODS=[
 ['Fantasy','✧ Wonder'],['Mystery','◈ Mystery'],['Romance','♡ Romance'],
 ['Adventure','↗ Adventure'],['Science Fiction','✦ Sci-fi'],['Horror','☾ Horror'],
 ['Historical Fiction','⌛ History'],['Poetry','❦ Poetry'],['Philosophy','◇ Ideas'],
 ['Biography','☼ Lives'],['Fairy Tales','☆ Magic'],['Crime Fiction','◆ Crime']
];
let nvHomeVisual=null,nvHomeBookLineup=null;
// On the homepage, never promote every candidate source as already readable.
// Established sources are available immediately; other titles join after
// they pass the same complete-edition verification used by Browse.
const NV_HOME_ESTABLISHED=new Set(['1342','84','2701','11','1661','98','158','76','174','345','74','1184']);
function nvHomepageFullBooks(){
 return nvPublicBooks(nvDistinct(NV_STARTER.filter(b=>b.source==='gutenberg'&&b.copyright!==true&&
  Object.prototype.hasOwnProperty.call(CURATED_TEXTS,String(b.id))&&
  (NV_HOME_ESTABLISHED.has(String(b.id))||nvHasCompleteEdition(b)))));
}
// A home-cover rotation is distinct from Complete Books: showing a cover does not
// claim that a full edition has already passed Novella's download verification.
// Persistent, bounded history prevents repeats until the eligible pool is exhausted.
const NV_HOME_ROTATION_KEY='home-cover-rotation-v206';
const NV_HOME_ROTATION_CACHE='home-gutenberg-pool-v206';
const NV_HOME_ROTATION_CURSOR='home-gutenberg-cursor-v2052';
let nvHomeRotationLoading=false,nvHomeRotationPoolMemo=null;
function nvHomeRotationPool(){
 // This catalogue rarely changes within a visit. Avoid repeatedly parsing its
 // localStorage JSON on every Home paint or book-card interaction.
 if(nvHomeRotationPoolMemo)return nvHomeRotationPoolMemo;
 const cached=getLocal(NV_HOME_ROTATION_CACHE,[]);
 const extra=Array.isArray(cached)?cached.filter(b=>b?.source==='gutenberg'&&/^\d{1,7}$/.test(String(b.id))&&b.copyright!==true&&b.title&&b.author).map(remember):[];
 nvHomeRotationPoolMemo=nvPublicBooks(nvDistinct([...NV_STARTER,...extra]))
  .filter(b=>b.source==='gutenberg'&&b.copyright!==true&&b.title&&!/^(untitled|unknown)$/i.test(b.title));
 return nvHomeRotationPoolMemo;
}
function nvBackgroundNetworkOK(){
 const link=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 const focused=document.activeElement;
 const accountModal=document.querySelector('#modal-overlay');
 return !document.hidden&&!link?.saveData&&!['slow-2g','2g'].includes(link?.effectiveType)&&
  !surpriseBusy&&!searchBusy&&!nvAuthBusy&&!document.querySelector('#nv-reader')&&
  (!accountModal||accountModal.classList.contains('hidden'))&&
  !focused?.matches?.('input,textarea,select,[contenteditable="true"]');
}
async function nvWarmHomeRotation(){
 // Previous releases fetched up to TEN Gutenberg pages immediately after Home
 // loaded. That competed with covers, Surprise, sign-in and actual reading.
 // Incrementally warm at most two small metadata pages on an idle visit.
 if(nvHomeRotationLoading||!nvBackgroundNetworkOK())return;
 let list=nvHomeRotationPool();if(list.length>=240)return;
 nvHomeRotationLoading=true;
 let page=Math.max(1,Math.min(500,Number(getLocal(NV_HOME_ROTATION_CURSOR,1))||1));
 try{
  for(let attempts=0;attempts<1&&list.length<260;attempts++){
   if(!nvBackgroundNetworkOK()||screen!=='home')break;
   const response=await getGutenPage('',page,true);
   const filtered=response.items.filter(b=>b?.source==='gutenberg'&&b.copyright!==true&&b.title&&b.author);
   const next=nvDistinct([...list,...filtered]);
   if(next.length>list.length){
    list=next;
    putLocal(NV_HOME_ROTATION_CACHE,list.slice(0,310).map(nvLeanBook));
    nvHomeRotationPoolMemo=null;
   }
   // Advance only after a successful response, never after a provider failure.
   page=response.more?page+1:1;
   putLocal(NV_HOME_ROTATION_CURSOR,page);
   if(!response.more)break;
  }
 }catch{/* Browsing and sign-in never depend on this optional metadata. */}
 finally{nvHomeRotationLoading=false}
}
function nvHomeVisualPick(){
 if(nvHomeVisual)return nvHomeVisual;
 const pool=nvHomeRotationPool();
 let state=getLocal(NV_HOME_ROTATION_KEY,{});
 if(!state||typeof state!=='object'||Array.isArray(state))state={};
 let seen=Array.isArray(state.seen)?state.seen.filter(k=>typeof k==='string').slice(-200):[];
 // Carry forward the last choice from older installations to avoid immediate repeats.
 const legacy=getLocal('home-visual-last-v1132',{});
 if(!seen.length&&legacy?.hero)seen.push(legacy.hero);
 const used=new Set(seen);
 let fresh=pool.filter(b=>!used.has(id(b)));
 if(!fresh.length){
  // Only start a new cycle when all currently available candidates have appeared.
  // When at least 200 are available, a hero never repeats inside 200 visits.
  seen=[];fresh=pool;
 }
 const previousHero=state.hero||legacy?.hero||'';
 const hero=nvShuffle(fresh.filter(b=>id(b)!==previousHero))[0]||nvShuffle(fresh)[0]||pool[0]||seed[0];
 seen.push(id(hero));
 const side=nvShuffle(pool.filter(b=>id(b)!==id(hero)&&id(b)!==state.side))[0]||
  pool.find(b=>id(b)!==id(hero))||hero;
 const prior=Array.isArray(state.moods)?state.moods:[];
 const moods=nvShuffle(NV_HOME_MOODS.filter(x=>!prior.includes(x[0]))).slice(0,3);
 if(moods.length<3)moods.push(...nvShuffle(NV_HOME_MOODS.filter(x=>!moods.some(m=>m[0]===x[0]))).slice(0,3-moods.length));
 nvHomeVisual={hero,side,moods};
 putLocal(NV_HOME_ROTATION_KEY,{seen:seen.slice(-200),hero:id(hero),side:id(side),moods:moods.map(x=>x[0])});
 return nvHomeVisual;
}
function nvHomeReadableLineup(force=false){
 if(nvHomeBookLineup&&!force)return nvHomeBookLineup;
 const pool=nvHomepageFullBooks(),old=getLocal('home-readable-first-v1132','');
 const first=nvShuffle(pool.filter(b=>id(b)!==old))[0]||pool[0];
 nvHomeBookLineup=first?[first,...nvShuffle(pool.filter(b=>id(b)!==id(first)))]:[];
 if(first)putLocal('home-readable-first-v1132',id(first));
 return nvHomeBookLineup;
}
// An on-demand GITenberg resolver expands the reader beyond the seven curated editions.
// A catalog entry is not proof that full text is fetchable. Never access restricted books.
const readerSourcePending=new Map();
const GITENBERG_API='https://api.github.com';
async function gitJSON(path){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),11500);
  try{
    const res=await fetch(GITENBERG_API+path, {signal:controller.signal,headers:{Accept:'application/vnd.github+json'}});
    if(res.status===403||res.status===429)throw Error('The free ebook source is busy or rate limited. Please try again later.');
    if(!res.ok)throw Error('The source catalogue is currently unavailable ('+res.status+').');
    return await res.json();
  } finally {clearTimeout(timer)}
}
async function discoverGitText(b){
  if(b?.source!=='gutenberg'||!/^\d{1,7}$/.test(String(b.id)))return null;
  const id=String(b.id);
  if(Object.hasOwn(CURATED_TEXTS,id))return CURATED_TEXTS[id];
  const memo=getLocal('text-source:'+id,null);
  if(memo?.url && /^https:\/\/raw\.githubusercontent\.com\/GITenberg\//.test(memo.url))return memo.url;
  // A short-lived negative result avoids repeating failed searches on each visit.
  if(memo?.miss && Date.now()-memo.when<2*60*60*1000)return null;
  if(readerSourcePending.has(id))return readerSourcePending.get(id);
  const lookup=(async()=>{
    // Never scrape Gutenberg's live book files. GITenberg is a separate GitHub archive.
    const qs=new URLSearchParams({q:'org:GITenberg '+id+' in:name',per_page:'20'});
    const result=await gitJSON('/search/repositories?'+qs.toString());
    const repo=(result.items||[]).find(r=>r?.full_name?.startsWith('GITenberg/')&&r.name.endsWith('_'+id));
    if(!repo){putLocal('text-source:'+id,{miss:true,when:Date.now()});return null}
    const entries=await gitJSON('/repos/'+encodeURIComponent(repo.owner.login)+'/'+encodeURIComponent(repo.name)+'/contents');
    if(!Array.isArray(entries))return null;
    // Prefer well-formed plain UTF-8 book files at the repository root.
    const files=entries.filter(f=>f.type==='file'&&/\.txt$/i.test(f.name)&&!/(license|readme|contribut|metadata)/i.test(f.name)&&f.size>=3000&&f.size<=8*1024*1024);
    const file=files.sort((a,b)=>{
      const score=f=>(f.name===id+'-0.txt'?0:f.name===id+'.txt'?1:f.name.startsWith(id)?2:3);
      return score(a)-score(b);
    })[0];
    const target=file?.download_url;
    if(!target||!/^https:\/\/raw\.githubusercontent\.com\/GITenberg\//.test(target)){
      putLocal('text-source:'+id,{miss:true,when:Date.now()});return null;
    }
    putLocal('text-source:'+id,{url:target,when:Date.now()});
    return target;
  })().finally(()=>readerSourcePending.delete(id));
  readerSourcePending.set(id,lookup);
  return lookup;
}


/* NOVELLA V11.19 — Eleven-source discovery network.
 * No background bulk scraping. Direct catalogue links work immediately;
 * extra JSON lookups run only when a reader requests them. Catalogue matches
 * do not imply permission to download or reproduce a copyrighted work.
 * OPEN LIBRARY / GUTENDEX / GOOGLE are already covered by nvResolveAccess().
 */
const NV_SOURCE_DIRECTORY=[
 {id:'gutenberg',name:'Project Gutenberg',kind:'Public-domain ebooks',role:'text'},
 {id:'standard',name:'Standard Ebooks',kind:'Curated public-domain editions',role:'text'},
 {id:'archive',name:'Internet Archive',kind:'Text collections · rights vary',role:'catalog'},
 {id:'openlibrary',name:'Open Library',kind:'Library records and borrowing',role:'borrow'},
 {id:'manybooks',name:'ManyBooks',kind:'Free ebooks and promotions',role:'catalog'},
 {id:'feedbooks',name:'Feedbooks',kind:'Publisher and ebook catalogue',role:'catalog'},
 {id:'google',name:'Google Books',kind:'Full view or publisher preview',role:'catalog'},
 {id:'hathi',name:'HathiTrust',kind:'Full-view and search-only books',role:'catalog'},
 {id:'doab',name:'DOAB',kind:'Open-access books · metadata',role:'oa'},
 {id:'oapen',name:'OAPEN',kind:'Open-access academic editions',role:'oa'},
 {id:'librivox',name:'LibriVox',kind:'Volunteer-read audiobooks',role:'audio'}
];
function nvSourceUrl(source,b){
 const title=String(b?.title||'').slice(0,160),author=String(b?.author||'').slice(0,110);
 const q=(title+' '+author).trim(), eq=encodeURIComponent(q),et=encodeURIComponent(title);
 switch(source){
  case 'gutenberg':return 'https://www.gutenberg.org/ebooks/search/?query='+eq;
  case 'standard':return 'https://standardebooks.org/ebooks?query='+eq;
  case 'archive':return 'https://archive.org/search?query='+encodeURIComponent('title:"'+title.replace(/"/g,'')+'" AND mediatype:texts');
  case 'openlibrary':return 'https://openlibrary.org/search?q='+eq;
  case 'manybooks':return 'https://manybooks.net/search-book?search='+eq;
  case 'feedbooks':return 'https://www.feedbooks.com/'; // Search navigation varies by region; no guessed endpoint.
  case 'google':return 'https://books.google.com/books?q='+eq;
  case 'hathi':return 'https://catalog.hathitrust.org/Search/Home?lookfor='+eq+'&type=all';
  case 'doab':return 'https://directory.doabooks.org/search?query='+et;
  case 'oapen':return 'https://library.oapen.org/search?query='+et;
  case 'librivox':return 'https://librivox.org/search?title='+et+'&author='+encodeURIComponent(author);
 }
 return '';
}
function nvSourcePanel(b){
 const sites=NV_SOURCE_DIRECTORY.map(site=>`<a class="nv-source-tile" href="${esc(nvSourceUrl(site.id,b))}" target="_blank" rel="noopener noreferrer" title="Search ${esc(site.name)} for this title"><strong>${esc(site.name)}</strong><small>${esc(site.kind)}</small><span aria-hidden="true">↗</span></a>`).join('');
 return `<section class="nv-source-network" data-nv-source-book="${esc(id(b))}" aria-label="Find this book across eleven library sources">
 <div class="nv-source-top"><div><span class="nv-source-eyebrow">MORE WAYS TO FIND THIS EDITION</span><h3>More places to look</h3><p>Search libraries, free editions and audiobooks when you need them.</p></div><button type="button" class="nv-source-check" data-nv-source-check>Check matching catalogues</button></div>
 <div class="nv-source-status" data-nv-source-status role="status" aria-live="polite" hidden></div>
 <details class="nv-source-catalogues"><summary>See all 11 libraries <span aria-hidden="true">⌄</span></summary><div class="nv-source-grid">${sites}</div></details>
 </section>`;
}
const nvExtraSourceCache=new Map(),nvExtraSourcePending=new Map(),NV_EXTRA_TTL=15*60*1000;
function nvTextValue(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(nvTextValue).filter(Boolean).join(' ');if(value&&typeof value==='object')return String(value.value||value.text||'');return '';}
function nvStrictSourceMatch(input,b){
 const a=normTitle(input||'');const t=normTitle(b?.title||'');
 return !!a&&!!t&&(a===t||a===t.replace(/^the /,'')||t===a.replace(/^the /,''));
}
function nvJsonLink(raw,host){
 try{const u=new URL(String(raw||''));return u.protocol==='https:'&&(u.hostname===host||u.hostname.endsWith('.'+host))?u.href:''}catch{return ''}
}
function nvOaField(record,field){
 const data=record?.metadata;
 if(Array.isArray(data))return data.filter(x=>x?.key===field||x?.name===field).map(x=>nvTextValue(x.value)).filter(Boolean).join(' ');
 return nvTextValue(data?.[field]||record?.[field]);
}
async function nvOaMatch(provider,b){
 const host=provider==='oapen'?'library.oapen.org':'directory.doabooks.org';
 const title=String(b.title||'').replace(/["\\]/g,'').slice(0,95);
 if(title.length<4)return null;
 const query=new URLSearchParams({query:'dc.title:"'+title+'"'});
 const data=await fetchJSON('https://'+host+'/rest/search?'+query,{timeout:5200});
 const rows=Array.isArray(data)?data:Array.isArray(data?.items)?data.items:Array.isArray(data?.results)?data.results:[];
 const r=rows.slice(0,20).find(item=>nvStrictSourceMatch(nvOaField(item,'dc.title')||item.name||item.title,b));
 if(!r)return null;
 const handle=String(r.handle||nvOaField(r,'dc.identifier.uri')||'');
 let link=nvSourceUrl(provider,b);
 if(/^20\.\d{4,6}\/[a-zA-Z0-9._/-]+$/.test(handle))link='https://'+host+'/handle/'+encodeURI(handle);
 else {const recordUrl=nvJsonLink(handle,host);if(recordUrl)link=recordUrl;}
 return {source:provider,label:provider==='oapen'?'Open-access library match':'Open-access directory match',link,detail:'Matching title in '+(provider==='oapen'?'OAPEN':'DOAB')+'. Check the book’s individual licence and available files.'};
}
async function nvAudioMatch(b){
 const title=String(b.title||'').slice(0,100);
 if(title.length<3)return null;
 const query=new URLSearchParams({title,format:'json',limit:'8'});
 const raw=await fetchJSON('https://librivox.org/api/feed/audiobooks/?'+query,{timeout:5300});
 const matches=Array.isArray(raw?.books)?raw.books:[];
 const match=matches.find(x=>nvStrictSourceMatch(x?.title,b));
 if(!match)return null;
 return {source:'librivox',label:'Audiobook catalogue match',link:nvJsonLink(match.url_librivox,'librivox.org')||nvSourceUrl('librivox',b),detail:'A narration is listed. Check whether all chapters have been recorded.'};
}
async function nvArchiveMatch(b){
 const title=String(b.title||'').replace(/"/g,'').slice(0,90);
 if(title.length<4)return null;
 const params=new URLSearchParams({q:'title:"'+title+'" AND mediatype:texts',rows:'12',page:'1',output:'json'});
 params.append('fl[]','identifier');params.append('fl[]','title');params.append('fl[]','creator');
 const raw=await fetchJSON('https://archive.org/advancedsearch.php?'+params,{timeout:5300});
 const docs=Array.isArray(raw?.response?.docs)?raw.response.docs:[];
 const match=docs.find(x=>nvStrictSourceMatch(x?.title,b)&&/^[\w-]{1,120}$/.test(x?.identifier||''));
 if(!match)return null;
 return {source:'archive',label:'Internet Archive catalogue match',link:'https://archive.org/details/'+encodeURIComponent(match.identifier),detail:'An item record exists. Check public-domain status or borrowing restrictions before reading.'};
}
async function nvHathiMatch(b){
 const isbn=nvIsbn(b);if(!isbn)return null;
 const raw=await fetchJSON('https://catalog.hathitrust.org/api/volumes/brief/isbn/'+encodeURIComponent(isbn)+'.json',{timeout:5300});
 const records=raw?.records;if(!records||typeof records!=='object'||!Object.keys(records).length)return null;
 const found=Object.values(records).some(x=>nvStrictSourceMatch(x?.titles?.[0]||x?.title||'',b));
 if(!found)return null;
 return {source:'hathi',label:'HathiTrust catalogue match',link:nvSourceUrl('hathi',b),detail:'A bibliographic match exists. HathiTrust distinguishes Full View from restricted Search Only.'};
}
async function nvCheckExtraSources(b){
 const key=id(b),saved=nvExtraSourceCache.get(key);
 if(saved&&Date.now()-saved.when<NV_EXTRA_TTL)return saved.results;
 if(nvExtraSourcePending.has(key))return nvExtraSourcePending.get(key);
 const task=(async()=>{
  const results=await Promise.allSettled([nvOaMatch('doab',b),nvOaMatch('oapen',b),nvAudioMatch(b),nvArchiveMatch(b),nvHathiMatch(b)]);
  const found=results.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
  nvExtraSourceCache.set(key,{when:Date.now(),results:found});
  if(nvExtraSourceCache.size>35)nvExtraSourceCache.delete(nvExtraSourceCache.keys().next().value);
  return found;
 })().finally(()=>nvExtraSourcePending.delete(key));
 nvExtraSourcePending.set(key,task);return task;
}
async function nvRunSourceSearch(container,b){
 if(!container||container.dataset.running==='1')return;
 const status=container.querySelector('[data-nv-source-status]'),button=container.querySelector('[data-nv-source-check]');
 if(!status||!button)return;
 container.dataset.running='1';status.hidden=false;status.textContent='Checking catalogue records from OAPEN, DOAB, LibriVox, Internet Archive and HathiTrust…';button.disabled=true;
 try{
  const matches=await nvCheckExtraSources(b);
  if(!container.isConnected||container.dataset.nvSourceBook!==id(b))return;
  if(!matches.length){status.textContent='No additional exact-title matches confirmed from these APIs. Some providers block browser requests; use the source links below to check manually.';return}
  status.innerHTML='<strong>Additional matching records</strong><div class="nv-source-matches">'+matches.map(x=>`<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"><span>${esc(x.label)} ↗</span><small>${esc(x.detail)}</small></a>`).join('')+'</div>';
 }catch{if(container.isConnected)status.textContent='Some catalogue checks were unavailable. You can still search every source below.'}
 finally{container.dataset.running='0';button.disabled=false}
}
document.addEventListener('click',e=>{
 const trigger=e.target.closest?.('[data-nv-source-check]');if(!trigger)return;
 e.preventDefault();e.stopPropagation();
 const container=trigger.closest('.nv-source-network');if(!container)return;
 const book=matchingBook(container.dataset.nvSourceBook)||(active&&id(active)===container.dataset.nvSourceBook?active:null);
 if(book)nvRunSourceSearch(container,book);
});

// V11.9 SMART BOOK ACCESS. Book discovery ≠ permission to download/read.
// Provider metadata is checked on-demand, never during first-page Browse.
const nvAccessResults=new Map(), nvAccessTasks=new Map(), NV_ACCESS_TTL=20*60*1000;
function nvAccessOfficial(b){
 if(b?.source==='gutenberg'&&/^\d+$/.test(String(b.id)))return 'https://www.gutenberg.org/ebooks/'+encodeURIComponent(b.id);
 if(b?.source==='openlibrary'&&/^OL\d+W$/.test(String(b.id)))return 'https://openlibrary.org/works/'+encodeURIComponent(b.id);
 return 'https://openlibrary.org/search?q='+encodeURIComponent(String(b?.title||'')+' '+String(b?.author||''));
}
function nvIsbn(b){const n=String(b?.isbn||'').replace(/[^0-9X]/gi,'').toUpperCase();return /^(?:\d{13}|\d{9}[\dX])$/.test(n)?n:''}
function nvSafeProviderLink(link){
 const u=url(link);if(!u)return '';
 try{const x=new URL(u);if(!['https:'].includes(x.protocol))return '';
  if(['books.google.com','play.google.com','openlibrary.org','archive.org','standardebooks.org','www.gutenberg.org'].includes(x.hostname))return x.href;
 }catch{}return '';
}
function nvGoogleCandidate(v,b){
 if(!v?.volumeInfo?.title||!v?.id||!/^[a-zA-Z0-9_-]{3,64}$/.test(v.id))return false;
 const title=normTitle(b.title),other=normTitle(v.volumeInfo.title);
 if(!title||!(title===other||other.startsWith(title+' ')||title.startsWith(other+' ')))return false;
 const author=normAuthor(b.author),names=(v.volumeInfo.authors||[]).map(normAuthor);
 if(author&&author!=='unknown'&&names.length){
  const tokens=author.split(/\s+/).filter(t=>t.length>=4);
  if(tokens.length&&!names.some(n=>tokens.every(t=>n.includes(t))))return false;
 }
 return true;
}
async function nvGoogleForBook(b){
 const isbn=nvIsbn(b);const q=isbn?'isbn:'+isbn:'intitle:'+String(b.title).slice(0,100)+' inauthor:'+String(b.author||'').split(',')[0].slice(0,60);
 const lookup=async(q)=>{const params=new URLSearchParams({q,maxResults:'8',printType:'books',projection:'full'});
  const data=await fetchJSON('https://www.googleapis.com/books/v1/volumes?'+params,{timeout:6300});return (data.items||[]).filter(v=>nvGoogleCandidate(v,b))};
 let matches=[];
 try{matches=await lookup(q)}catch{return null}
 if(!matches.length&&isbn){try{matches=await lookup('intitle:'+String(b.title).slice(0,100)+' inauthor:'+String(b.author||'').split(',')[0].slice(0,60))}catch{}}
 const scored=matches.map(v=>{
  const a=v.accessInfo||{},identifiers=v.volumeInfo?.industryIdentifiers||[];
  const sameIsbn=!!isbn&&identifiers.some(x=>String(x.identifier||'').replace(/[^0-9X]/gi,'').toUpperCase()===isbn);
  const viewable=['PARTIAL','ALL_PAGES'].includes(a.viewability)&&a.accessViewStatus!=='NONE';
  return {v,a,rank:(sameIsbn?12:0)+(viewable?8:0)+(a.embeddable?4:0)};
 }).sort((a,b)=>b.rank-a.rank);
 const best=scored[0];if(!best)return null;
 const a=best.a;const preview=['PARTIAL','ALL_PAGES'].includes(a.viewability)&&a.accessViewStatus!=='NONE';
 if(!preview)return null;
 return {id:best.v.id,embedded:a.embeddable===true,full:a.viewability==='ALL_PAGES',
  link:nvSafeProviderLink(a.webReaderLink)||nvSafeProviderLink(best.v.volumeInfo.previewLink)||'https://books.google.com/books?id='+encodeURIComponent(best.v.id)};
}
function nvBorrowStatus(b,raw){
 const items=raw?.items||Object.values(raw||{}).find(v=>Array.isArray(v?.items))?.items||[];
 const lists=items.filter(item=>!/^OL\d+W$/.test(String(b.id))||!item['ol-work-id']||item['ol-work-id']===b.id);
 const item=lists.find(v=>v.status==='lendable'&&v.match==='exact')||lists.find(v=>v.status==='lendable')||
  lists.find(v=>v.status==='checked out'&&v.match==='exact')||lists.find(v=>v.status==='checked out')||
  lists.find(v=>v.status==='full access')||null;
 if(!item)return null;
 const status=String(item.status||'');
 const ref=nvSafeProviderLink(item.itemURL)||nvAccessOfficial(b);
 const match=String(item['ol-work-id']||'')===String(b.id)?'same-work':item.match;
 return {status,link:ref,match};
}
async function nvLibraryForBook(b){
 // ISBN edition lookup is most accurate; otherwise search for a matching work.
 // A catalogue listing is not proof that the book is freely readable.
 const isbn=nvIsbn(b);
 if(isbn){try{const raw=await fetchJSON('https://openlibrary.org/api/volumes/brief/isbn/'+isbn+'.json',{timeout:6500});
  const found=nvBorrowStatus(b,raw);if(found)return found;}catch{}}
 const needle=normTitle(b.title),author=normAuthor(b.author);
 if(!needle||needle.length<3)return null;
 try{
  const query='title:"'+String(b.title).replace(/["\\]/g,'').slice(0,130)+'"';
  const docs=(await getOL(query,1,9)).items||[];
  const matched=docs.find(item=>{
   if(normTitle(item.title)!==needle)return false;
   const a=normAuthor(item.author);
   const main=author.split(' ').filter(t=>t.length>=4);
   return !main.length||!a||a==='unknown'||main.some(t=>a.includes(t));
  });
  if(!matched)return null;
  // Work-level catalogue access can change; do not claim a live loan slot.
  if(matched.ebookAccess==='borrowable')return {status:'catalog-borrow',link:nvAccessOfficial(matched),match:'catalog'};
  return {status:'catalog',link:nvAccessOfficial(matched),match:'catalog'};
 }catch{return null}
}

const NV_STANDARD_VERIFIED={
 'pride and prejudice|jane austen':'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice'
};
function nvStandardLink(b){
 const key=normTitle(b.title)+'|'+normAuthor(b.author);
 if(NV_STANDARD_VERIFIED[key])return NV_STANDARD_VERIFIED[key];
 if(b.source==='gutenberg'||matchedFreeWork(b))return 'https://standardebooks.org/ebooks?query='+encodeURIComponent(b.title+' '+b.author);
 return '';
}
function nvBuildAccess(b){
 const fromGuten=b.source==='gutenberg';const classic=matchedFreeWork(b);
 return {work:id(b),free:fromGuten?b:classic?fallbackFreeEdition(b,classic):null,
  scan:verifiedOpenScan(b)?b.ia[0]:null,google:null,borrow:null,
  official:nvAccessOfficial(b),standard:nvStandardLink(b),searchGoogle:'https://books.google.com/books?q='+encodeURIComponent(String(b.title||'')+' '+String(b.author||'')),checked:Date.now(),issues:[]};
}
async function nvResolveAccess(b){
 if(!b)return null;
 const k=id(b),saved=nvAccessResults.get(k);
 if(saved&&Date.now()-saved.checked<NV_ACCESS_TTL)return saved;
 if(nvAccessTasks.has(k))return nvAccessTasks.get(k);
 const task=(async()=>{
  const plan=nvBuildAccess(b);
  if(!plan.free){
   const [google,library,free]=await Promise.allSettled([
    nvGoogleForBook(b),nvLibraryForBook(b),
    // Only older works that meet the existing strict title-and-author matching policy.
    b.source==='openlibrary'&&b.year&&Number(b.year)<=1930?findFreeEdition(b):Promise.resolve(null)
   ]);
   if(google.status==='fulfilled')plan.google=google.value;
   if(library.status==='fulfilled')plan.borrow=library.value;
   if(free.status==='fulfilled'&&free.value)plan.free=free.value;
   if([google,library,free].some(x=>x.status==='rejected'))plan.issues.push('Provider temporarily unavailable');
  }
  plan.checked=Date.now();nvAccessResults.set(k,plan);
  if(nvAccessResults.size>50)nvAccessResults.delete(nvAccessResults.keys().next().value);
  return plan;
 })().finally(()=>nvAccessTasks.delete(k));
 nvAccessTasks.set(k,task);return task;
}
function nvAccessSummary(plan){
 if(plan.free)return ['Public-domain edition found','Novella will check the downloaded edition through its ending before calling it complete.'];
 if(plan.scan)return ['Public scan available','An open scan may be read in Novella through the Internet Archive.'];
 if(plan.google?.embedded)return [plan.google.full?'Full Google Books view':'Google Books preview available',plan.google.full?'Available pages can be viewed in Novella.':'The publisher allows a preview; the full book may require borrowing or purchase.'];
 if(plan.google)return ['Preview available on Google Books','This preview must be opened on Google Books; embedded viewing is not permitted.'];
 if(plan.borrow?.status==='full access')return ['Full Open Library edition available','Open Library lists a public full-access edition. Use its authorized reader to see all available pages.'];
 if(plan.borrow?.status==='lendable')return ['Library borrowing option','Open Library lists a borrowable edition. Availability can change.'];
 if(plan.borrow?.status==='checked out')return ['Library lending / waitlist','An edition is checked out; Open Library may offer a waitlist.'];
 if(plan.borrow?.status==='catalog-borrow')return ['Check library borrowing','Open Library lists a potentially borrowable edition. You may need a library account, and availability can change.'];
 if(plan.borrow?.status==='catalog')return ['Library catalogue match','An Open Library record exists. Check its editions for any available borrowing or reading options.'];
 return ['Full free access not confirmed','No complete free edition was confirmed for this book. Open a legally obtained EPUB, PDF, TXT or HTML file here; check authorized library access, or buy a complete licensed copy. A preview is not the full book.'];
}
function nvAccessLinks(plan,includePreview=true){
 const parts=[];
 // Label "full" only for a provider-confirmed full view; previews are never advertised as complete.
 if(plan.standard)parts.push(`<a href="${esc(plan.standard)}" target="_blank" rel="noopener noreferrer">Complete public-domain edition ↗</a>`);
 if(plan.google?.full&&plan.google?.link)parts.push(`<a href="${esc(plan.google.link)}" target="_blank" rel="noopener noreferrer">Read full Google Books edition ↗</a>`);
 if(plan.borrow?.status==='full access'&&plan.borrow.link)parts.push(`<a href="${esc(plan.borrow.link)}" target="_blank" rel="noopener noreferrer">Read full Open Library edition ↗</a>`);
 if(plan.borrow?.status==='lendable')parts.push(`<a href="${esc(plan.borrow.link)}" target="_blank" rel="noopener noreferrer">Borrow complete library edition ↗</a>`);
 if(plan.borrow?.status==='checked out')parts.push(`<a href="${esc(plan.borrow.link)}" target="_blank" rel="noopener noreferrer">Join library waitlist ↗</a>`);
 if(plan.borrow?.status==='catalog-borrow')parts.push(`<a href="${esc(plan.borrow.link)}" target="_blank" rel="noopener noreferrer">Check borrowing eligibility ↗</a>`);
 if(plan.google?.link&&includePreview&&!plan.google.full)parts.push(`<a href="${esc(plan.google.link)}" target="_blank" rel="noopener noreferrer">Google Books preview (partial) ↗</a>`);
 if(plan.borrow?.status==='catalog')parts.push(`<a href="${esc(plan.borrow.link)}" target="_blank" rel="noopener noreferrer">View library record ↗</a>`);
 if(plan.official&&!plan.borrow)parts.push(`<a href="${esc(plan.official)}" target="_blank" rel="noopener noreferrer">Check Open Library editions ↗</a>`);
 if(!plan.google?.link&&plan.searchGoogle)parts.push(`<a href="${esc(plan.searchGoogle)}" target="_blank" rel="noopener noreferrer">Search Google Books ↗</a>`);
 return parts.join('');
}
function nvRenderDetailAccess(b,plan){
 const holder=document.getElementById('nv-smart-access');
 if(!holder||holder.dataset.accessBook!==id(b)||screen!=='detail'||!active||id(active)!==id(b))return;
 const [name,desc]=nvAccessSummary(plan);
 const linkMarkup=nvAccessLinks(plan);
 const parsed=document.createElement('div');parsed.innerHTML=linkMarkup;
 const links=[...parsed.querySelectorAll('a')];
 const top=links.shift();
 holder.innerHTML=`<span class="nv-access-brow">READING AVAILABILITY</span><strong>${esc(name)}</strong><p>${esc(desc)}</p>${top?`<div class="nv-smart-links">${top.outerHTML}</div>`:''}${links.length?`<details class="nv-access-extra"><summary>See ${links.length} more reading link${links.length>1?'s':''} <span aria-hidden="true">⌄</span></summary><div class="nv-smart-links">${links.map(a=>a.outerHTML).join('')}</div></details>`:''}`;
}
function nvCheckDetailAccess(b){
 const k=id(b);
 if(nvCompleteTexts.has(k)){
  const holder=document.getElementById('nv-smart-access');
  if(holder?.dataset.accessBook===k){
   holder.innerHTML='<span class="nv-access-brow">READING AVAILABILITY</span><strong>Complete text verified and ready</strong><p>Novella has checked the Gutenberg text through its ending. Tap “Read full book” to open it immediately, without downloading it again.</p>';
  }
  return;
 }
 const existing=nvAccessResults.get(k);
 if(existing&&Date.now()-existing.checked<NV_ACCESS_TTL){nvRenderDetailAccess(b,existing);return}
 nvResolveAccess(b).then(plan=>{if(plan)nvRenderDetailAccess(b,plan)}).catch(()=>{
  const holder=document.getElementById('nv-smart-access');if(holder?.dataset.accessBook===k)holder.querySelector('p').textContent='Providers are currently unavailable. Your local ebook and official source links still work.';
 });
}
function nvStartSmartReader(b){
 if(!b)return;
 const known=matchedFreeWork(b);
 // Verified classics open directly without waiting for three external metadata APIs.
 if(b.source==='gutenberg'||known){readerModal(known?fallbackFreeEdition(b,known):b);return}
 readerModal(b,{smart:true});
}

function canTryCommunityEdition(b){return b?.source==='gutenberg'&&/^\d{1,7}$/.test(String(b.id));}

function canReadInNovella(b){return b?.source==='gutenberg'&&(nvCompleteTexts.has(id(b))||Object.hasOwn(CURATED_TEXTS,String(b.id)));}
function verifiedOpenScan(b){return b?.source==='openlibrary'&&b.ebookAccess==='public'&&b.publicScan===true&&Array.isArray(b.ia)&&b.ia.length>0;}
function availabilityLabel(b){return canReadInNovella(b)?'FREE CLASSIC · VERIFY FULL TEXT':matchedFreeWork(b)?'FREE CLASSIC · CHECK EDITION':verifiedOpenScan(b)?'OPEN SCAN':b.source==='gutenberg'?'FREE CLASSIC · FIND READABLE COPY':'BOOK DETAILS / PREVIEW';}

/* Novella 2.1.1: series are catalogue relationships, NOT full-text availability. */
const NV210_SERIES=[
 {name:'The Empyrean',author:'Rebecca Yarros',titles:['Fourth Wing','Iron Flame','Onyx Storm']},
 {name:'The Hunger Games',author:'Suzanne Collins',titles:['The Hunger Games','Catching Fire','Mockingjay','The Ballad of Songbirds and Snakes','Sunrise on the Reaping'],note:'Main trilogy followed by separately published prequel stories; order shown is publication order.'},
 {name:'Harry Potter',author:'J. K. Rowling',titles:["Harry Potter and the Philosopher’s Stone","Harry Potter and the Chamber of Secrets","Harry Potter and the Prisoner of Azkaban","Harry Potter and the Goblet of Fire","Harry Potter and the Order of the Phoenix","Harry Potter and the Half-Blood Prince","Harry Potter and the Deathly Hallows"]},
 {name:'The Lord of the Rings',author:'J. R. R. Tolkien',titles:['The Fellowship of the Ring','The Two Towers','The Return of the King'],note:'The Hobbit is set earlier but is not numbered as part of this trilogy.'},
 {name:'Dune',author:'Frank Herbert',titles:['Dune','Dune Messiah','Children of Dune','God Emperor of Dune','Heretics of Dune','Chapterhouse: Dune']},
 {name:'Percy Jackson and the Olympians',author:'Rick Riordan',titles:['The Lightning Thief','The Sea of Monsters',"The Titan’s Curse",'The Battle of the Labyrinth','The Last Olympian','The Chalice of the Gods','Wrath of the Triple Goddess']},
 {name:'The Chronicles of Narnia',author:'C. S. Lewis',titles:['The Lion, the Witch and the Wardrobe','Prince Caspian','The Voyage of the Dawn Treader','The Silver Chair','The Horse and His Boy',"The Magician’s Nephew",'The Last Battle'],note:'Publication order; chronological reading order differs.'},
 {name:'A Court of Thorns and Roses',author:'Sarah J. Maas',titles:['A Court of Thorns and Roses','A Court of Mist and Fury','A Court of Wings and Ruin','A Court of Frost and Starlight','A Court of Silver Flames']},
 {name:'Twilight',author:'Stephenie Meyer',titles:['Twilight','New Moon','Eclipse','Breaking Dawn']},
 {name:'His Dark Materials',author:'Philip Pullman',titles:['Northern Lights','The Subtle Knife','The Amber Spyglass']},
 {name:'The Maze Runner',author:'James Dashner',titles:['The Maze Runner','The Scorch Trials','The Death Cure','The Kill Order','The Fever Code'],note:'Publication order, including prequels released later.'},
 {name:'A Song of Ice and Fire',author:'George R. R. Martin',titles:['A Game of Thrones','A Clash of Kings','A Storm of Swords','A Feast for Crows','A Dance with Dragons']},
 {name:'The Lunar Chronicles',author:'Marissa Meyer',titles:['Cinder','Scarlet','Cress','Winter']},
 {name:'Anne of Green Gables',author:'L. M. Montgomery',titles:['Anne of Green Gables','Anne of Avonlea','Anne of the Island','Anne of Windy Poplars',"Anne’s House of Dreams",'Anne of Ingleside','Rainbow Valley','Rilla of Ingleside']},
 {name:'Alice in Wonderland',author:'Lewis Carroll',titles:["Alice’s Adventures in Wonderland",'Through the Looking-Glass']},
 {name:'Little Women',author:'Louisa May Alcott',titles:['Little Women','Little Men',"Jo’s Boys"],note:'Good Wives is often included as the second part of Little Women.'},
 {name:'Sherlock Holmes',author:'Arthur Conan Doyle',titles:['A Study in Scarlet','The Sign of the Four','The Adventures of Sherlock Holmes','The Memoirs of Sherlock Holmes','The Hound of the Baskervilles','The Return of Sherlock Holmes','The Valley of Fear','His Last Bow','The Case-Book of Sherlock Holmes'],note:'Publication order of the main novels and story collections.'},
 {name:'The Wonderful Wizard of Oz',author:'L. Frank Baum',titles:['The Wonderful Wizard of Oz','The Marvelous Land of Oz','Ozma of Oz','Dorothy and the Wizard in Oz','The Road to Oz','The Emerald City of Oz']},
 {name:'The Foundation Trilogy',author:'Isaac Asimov',titles:['Foundation','Foundation and Empire','Second Foundation']}
];
const nv210Normalize=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘´]/g,"'").replace(/[^a-z0-9]+/g,' ').trim();
function nv210SeriesFor(book){
 if(!book?.title)return null;
 const title=nv210Normalize(book.title),author=nv210Normalize(book.author),found=NV210_SERIES.find(s=>{
  const surname=nv210Normalize(s.author).split(' ').at(-1);
  return surname&&author.includes(surname)&&s.titles.some(t=>nv210Normalize(t)===title);
 });
 return found?{series:found,index:found.titles.findIndex(t=>nv210Normalize(t)===title)}:null;
}
function nv210FindIndexedBook(title,author){const n=nv210Normalize(title),surname=nv210Normalize(author).split(' ').at(-1);
 return [...bookMap.values(),...NV_STARTER,...results].find(b=>nv210Normalize(b.title)===n&&nv210Normalize(b.author).includes(surname))||null;
}
function nv210SeriesBookButton(title,series,index,currentIndex=-1){
 const cached=nv210FindIndexedBook(title,series.author);
 const current=index===currentIndex;
 return `<button type="button" class="nv210-series-book ${current?'is-current':''}" ${current?'aria-current="true"':''} ${cached?`data-book="${esc(id(cached))}"`:`data-nv210-find="${esc(title)}" data-nv210-author="${esc(series.author)}"`} aria-label="${esc(title)} book ${index+1} in ${esc(series.name)}">
  <span class="nv210-series-count">${String(index+1).padStart(2,'0')}</span><span class="nv210-series-book-info"><strong>${esc(title)}</strong><small>${current?'Currently viewing':cached&&nvHasCompleteEdition(cached)?'Verified edition available':'Explore editions'}</small></span><span aria-hidden="true" class="nv210-series-arrow">↗</span>
 </button>`;
}
function nv210DetailSeriesMarkup(book){const found=nv210SeriesFor(book);if(!found)return '';
 const {series,index}=found;
 return `<section class="nv210-series-detail" aria-labelledby="nv210-series-detail-heading"><div class="nv210-series-head"><div><span class="nv33-section-kicker">READ IN ORDER</span><h2 id="nv210-series-detail-heading">${esc(series.name)}</h2><p>Book ${index+1} of ${series.titles.length} · Find the earlier and later stories in one place.</p></div><span class="nv210-series-position">${index+1} / ${series.titles.length}</span></div><div class="nv210-series-books">${series.titles.map((title,i)=>nv210SeriesBookButton(title,series,i,index)).join('')}</div>${series.note?`<p class="nv210-series-note">${esc(series.note)}</p>`:''}<p class="nv210-series-note">Reading order is informational. Other titles may require borrowing or purchase; only verified complete books can be read for free in Novella.</p></section>`;
}
function nv210BrowseSeriesMarkup(){
 const picks=[NV210_SERIES[0],NV210_SERIES[16],NV210_SERIES[14],NV210_SERIES[3],NV210_SERIES[1],NV210_SERIES[13]];
 return `<section class="nv210-series-discover" aria-label="Explore book series"><div class="nv210-series-discover-top"><div><span class="nv33-section-kicker">STORIES THAT CONTINUE</span><h2>Explore a book series</h2><p>Discover reading order, prequels and sequels. Tap a series to explore its books.</p></div><button type="button" class="nv210-series-expand" id="nv210-series-expand" aria-expanded="false" aria-controls="nv210-all-series">All series <span aria-hidden="true">⌄</span></button></div><div class="nv210-series-quick">${picks.map(s=>`<button type="button" class="nv210-series-pill" data-nv210-series="${esc(s.name)}"><strong>${esc(s.name)}</strong><small>${s.titles.length} books ↗</small></button>`).join('')}</div><div id="nv210-all-series" class="nv210-series-all" hidden>${NV210_SERIES.map(s=>`<button type="button" data-nv210-series="${esc(s.name)}">${esc(s.name)} <span>${s.titles.length} books →</span></button>`).join('')}</div><div id="nv210-browse-series-detail" aria-live="polite"></div></section>`;
}
function nv210OpenSeries(name){const s=NV210_SERIES.find(v=>v.name===name);if(!s)return;
 const host=document.querySelector('#nv210-browse-series-detail');if(!host)return;
 host.innerHTML=`<div class="nv210-series-expanded"><div class="nv210-series-expanded-heading"><strong>${esc(s.name)} — reading order</strong><button type="button" data-nv210-series-close aria-label="Close reading order">×</button></div><div class="nv210-series-books">${s.titles.map((title,i)=>nv210SeriesBookButton(title,s,i)).join('')}</div>${s.note?`<p>${esc(s.note)}</p>`:''}<p>Availability differs by edition; catalogue records are not guaranteed complete books.</p></div>`;
 host.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}
async function nv210FindSeriesTitle(title,author,button){
 if(!title||!author)return;
 const existing=nv210FindIndexedBook(title,author);if(existing){await showBook(id(existing));return}
 if(button){button.disabled=true;button.classList.add('is-loading')}
 try{
  const response=await getOL(title,1,18,'','title');
  const matched=response.items.filter(b=>nv210Normalize(b.title)===nv210Normalize(title)&&nv210Normalize(b.author).includes(nv210Normalize(author).split(' ').at(-1)));
  if(matched.length){matched.sort((a,b)=>nvPopularityScore(b)-nvPopularityScore(a));await showBook(id(matched[0]));return}
 }catch{}
 if(button?.isConnected){button.disabled=false;button.classList.remove('is-loading')}
 // Search is an honest fallback; never synthesize an edition or grant access.
 source='all';sort='relevance';nvCompleteOnly=false;
 await browse(title,'',1);
}
// Once a result has appeared, new pages append after it instead of reshuffling it.
let nv210BrowseOrder=[],nv210BrowseOrderKey='';
function nv210StableResults(books){
 const key=JSON.stringify([source,sort,searchText,selectedGenre,nvCompleteOnly,nvCompleteLength]);
 if(nv210BrowseOrderKey!==key){nv210BrowseOrderKey=key;nv210BrowseOrder=[]}
 const matches=new Map(books.map(b=>[id(b),b]));
 const older=nv210BrowseOrder.filter(k=>matches.has(k));
 const seen=new Set(older);const added=books.filter(b=>!seen.has(id(b)));
 nv210BrowseOrder=[...older,...added.map(id)];
 return nv210BrowseOrder.map(k=>matches.get(k)).filter(Boolean);
}

const NV43_SYNOPSES={
 'the adventures of sherlock holmes':'Twelve mysteries introduce Sherlock Holmes at his most observant, with Dr Watson chronicling strange puzzles and brilliant deductions on the streets of Victorian London.',
 'frankenstein':'Victor Frankenstein brings a living creature into the world, then turns away from his creation. Mary Shelley follows the consequences of that rejection through loneliness, ambition and the need to belong.',
 'pride and prejudice':'Elizabeth Bennet meets the reserved Mr Darcy in a world shaped by family expectations, money and marriage. Their first impressions are challenged as wit and misunderstandings reshape their feelings.',
 'alice s adventures in wonderland':'Alice follows a white rabbit into a place where logic twists, language plays tricks and ordinary rules no longer apply. Her encounters bring curiosity, absurdity and adventure.',
 'dracula':'Letters, diaries and newspaper accounts unfold the arrival of Count Dracula in England. A small group of friends must piece together the danger and confront an ancient threat.',
 'the picture of dorian gray':'A young man wishes that his painted portrait might age instead of him. As Dorian pursues beauty and pleasure without consequences, the portrait reveals what his appearance hides.',
 'jane eyre':'An independent young governess finds work at Thornfield Hall and develops a bond with its mysterious owner. Jane must weigh love against her principles as secrets surface.',
 'a tale of two cities':'Against the upheaval of the French Revolution, people in London and Paris navigate divided loyalties, sacrifice and the possibility of a new beginning.',
 'moby dick':'Ishmael joins the whaling ship Pequod, captained by Ahab, whose pursuit of the white whale becomes an all-consuming obsession. The voyage explores friendship, fate and the sea.'
};
function nv43Synopsis(b){const original=String(b?.description||'').trim();const curated=NV43_SYNOPSES[normTitle(b?.title||'')];const generic=!original||original.length<95||/^(explore|discover|read|browse|find) (this|the|a|our) (public.domain |free )?(classic|edition|story|book)/i.test(original);return curated&&generic?curated:(original||'No publisher synopsis is available for this edition. Explore reading options or browse related subjects below.');}
function bookDetails(b){
 const edition=matchedFreeWork(b),free=b.source==='gutenberg',ready=canReadInNovella(b),scan=verifiedOpenScan(b);
 const official=nvAccessOfficial(b);
 const amazon=`https://www.amazon.in/s?k=${encodeURIComponent(b.isbn||b.title+' '+b.author)}&i=stripbooks`;
 const sourceName=free?'Project Gutenberg':edition?'Gutenberg edition':scan?'Public library scan':'Open Library';
 const description=nv43Synopsis(b);
 const accessLabel=ready?'Read full book →':free||edition||scan?'Open reading options →':'Find reading options →';
 const access=`<button type="button" class="primary-btn nv33-read-btn" data-read="${esc(id(b))}">${accessLabel}</button>`;
 const status=ready?'FULL-TEXT CLASSIC':edition?'PUBLIC-DOMAIN EDITION':scan?'PUBLIC SCAN':'DISCOVER AN EDITION';
 const subjects=(b.genres||[]).filter(Boolean).slice(0,12);
 const aboutCard=(variant)=>`<section class="nv33-about-card ${variant}" aria-label="About this book"><div class="nv33-about-header"><span class="nv33-section-kicker">BEHIND THE PAGES</span><h2>The story at a glance</h2></div><div class="nv-synopsis"><p class="description">${esc(description.slice(0,690))}${description.length>690?'…':''}</p>${description.length>690?`<details><summary>Read the full description</summary><p>${esc(description)}</p></details>`:''}</div></section>`;
 return `<section class="nv33-book-page nv45-book-page" aria-label="Book details for ${esc(b.title)}">
  <div class="nv33-breadcrumb"><button class="detail-back" type="button" ${nv218BrowseReturn?'data-nv218-return-results="1"':'data-view="explore"'}>${nv218BrowseReturn?'← Back to your results':'← Back to the library'}</button><span class="nv33-breadcrumb-rule"></span><span class="nv45-trail">THE READING ROOM <span class="nv45-trail-separator">/</span> ${esc(b.title)}</span><button class="nv43-breadcrumb-cue" type="button" data-nv43-scroll="nv-start-reading">Start reading ↓</button></div>
  <div class="detail-hero nv33-book-hero nv45-book-hero">
   <div class="nv33-book-art nv45-book-art"><div class="nv33-cover-frame">${cover(b,true)}</div><div class="nv43-mobile-head"><span class="nv43-mobile-status"><span class="nv33-status-dot"></span>${esc(status)}</span><h1>${esc(b.title)}</h1><p>by <strong>${esc(b.author||'Unknown author')}</strong></p><small>${b.year?`${esc(b.year)} · `:''}${esc(sourceName)}</small></div><div class="nv33-cover-note"><span class="nv33-mark">✦</span><span>${nvHasCompleteEdition(b)?'Full text checked and ready to open':ready?'Curated public-domain reading option':'Discover the best available edition'}</span></div>${aboutCard("nv43-about-desktop")}</div>
   <div class="detail-info nv33-book-content nv45-book-content">
    <div class="nv33-book-eyebrow"><span class="nv33-status-dot"></span>${esc(status)}<span class="nv33-eyebrow-line"></span> A NOVELLA BOOK PAGE</div>
    <h1>${esc(b.title)}</h1><p class="byline">Written by <strong>${esc(b.author||'Unknown author')}</strong></p>
    <div class="nv33-book-meta">${b.year?`<span><small>FIRST PUBLISHED</small><strong>${esc(b.year)}</strong></span>`:''}<span><small>EDITION SOURCE</small><strong>${esc(sourceName)}</strong></span><span><small>READING STATUS</small><strong>${nvHasCompleteEdition(b)?'Complete book ready':ready?'Reading options available':free||edition?'Public edition':'Check availability'}</strong></span></div>
    <div class="nv45-reading-grid">
     <div class="nv36-action-card" id="nv-start-reading"><div class="nv36-card-title"><span class="nv33-section-kicker">YOUR NEXT CHAPTER</span><p>Pick up this story in the way that suits you.</p></div><div class="actions nv-detail-main-actions nv33-book-actions">${access}<button class="secondary-btn" type="button" data-save="${esc(id(b))}">♡ Save to shelf</button><button class="secondary-btn" type="button" data-read-local="${esc(id(b))}">Open ebook file</button>${free||edition?`<button class="secondary-btn nv210-save-offline" type="button" data-nv210-offline="${esc(id(b))}" title="Save a complete verified text to this device">↓ Save offline</button>`:''}</div></div>
     <div class="nv-smart-access nv33-book-access" id="nv-smart-access" data-access-book="${esc(id(b))}" aria-live="polite"><span class="nv-access-brow">YOUR READING OPTIONS</span><strong>Checking this edition…</strong><p>Looking for available full-text and authorized reading options.</p></div>
    </div>
    ${aboutCard("nv43-about-mobile")}
    <section class="nv36-quick-links" aria-label="Book links"><div class="nv36-quick-heading"><span class="nv33-section-kicker">KEEP THIS STORY CLOSE</span><p>Share the title, find a print edition, or visit its source.</p></div><div class="nv36-link-grid"><button class="secondary-btn" type="button" data-share="${esc(id(b))}">↗ Share book</button><a class="secondary-btn" href="${esc(amazon)}" target="_blank" rel="noopener noreferrer">↗ Amazon</a><a class="secondary-btn" href="${esc(official)}" target="_blank" rel="noopener noreferrer">↗ Official source</a></div></section>
    <details class="nv-detail-extra nv33-extras nv36-provider-details"><summary><span>Other libraries and editions <small>See more authorized ways to find this book</small></span><span aria-hidden="true">⌄</span></summary><div class="nv-detail-extra-content">${nvSourcePanel(b)}</div></details>
    <p class="nv33-rights-note">${nvHasCompleteEdition(b)?'The full book text has been checked. Availability and copyright rules may vary by location.':ready?'Novella checks each book before marking it ready to read. Availability and copyright rules may vary by location.':'Book discovery does not guarantee full-text access. Previews and catalogue records are not complete books.'}</p>
   </div>
  </div>
  ${nv210DetailSeriesMarkup(b)}
  <section class="nv33-book-bottom nv45-book-bottom">
   <div class="subjects nv33-book-topics"><div class="nv45-topics-label"><span class="nv33-section-kicker">THEMES & SUBJECTS</span><strong>Explore this book's world</strong></div><div class="pill-row">${subjects.map(g=>`<button class="pill" data-genre="${esc(g)}">${esc(g)}</button>`).join('')||'<span class="subtitle">No subjects listed for this title.</span>'}</div></div>
   <section class="nv45-related-section" aria-label="More books to discover"><div class="nv45-section-heading"><div><span class="nv33-section-kicker">HANDPICKED FOR CURIOUS READERS</span><h2>More stories to fall into<span class="nv45-period">.</span></h2><p>One good story has a way of leading to another.</p></div><button type="button" class="nv45-explore-more" data-view="explore">Explore all books ↗</button></div><div id="recommendations">${grid([...featured,...classics].filter(x=>id(x)!==id(b)).slice(0,5))}</div><p class="nv45-swipe-hint" aria-hidden="true">Swipe for more stories →</p></section>
   <section class="nv45-review-section" aria-label="Reader reviews"><div class="nv45-section-heading"><div><span class="nv33-section-kicker">THE CONVERSATION CONTINUES</span><h2>Readers’ thoughts<span class="nv45-period">.</span></h2><p>Different readers. Different chapters. What did this one mean to you?</p></div><span class="nv45-review-mark" aria-hidden="true">“</span></div><div id="reviews" class="review-layout"><div class="loading">Loading reviews…</div></div></section>
  </section>
 </section>`;
}


// Novella 2.1.8: an in-memory Browse return point. Never persist across reloads,
// because a real reload must open Home, and shared book links remain direct.
let nv218BrowseReturn=null;
function nv218RestoreBrowse(){
 const saved=nv218BrowseReturn;
 if(!saved||saved.view!=='explore'){navigate('explore');return;}
 nv218BrowseReturn=null;
 if(nvPhotoEdit)nvPhotoEditorClose();
 nvAnnexLockOnLeave('explore');
 ++nvDetailEpoch;
 active=null;screen='explore';
 nvCloseMobileMenu();
 nvRegisterInternalRoute(path('explore'));
 paint();
 // Wait for the new grid and fixed-height cover placeholders before restoring.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(screen!=='explore')return;
  const maxY=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
  window.scrollTo({top:Math.max(0,Math.min(saved.y,maxY)),left:0,behavior:'instant'});
  const card=Array.from(document.querySelectorAll('.book-card[data-book]')).find(node=>node.dataset.book===saved.bookKey);
  if(card){card.classList.add('nv218-return-highlight');setTimeout(()=>card.classList.remove('nv218-return-highlight'),1800);}
 }));
}
function nv218RefreshConnectivity(){
 const notice=document.getElementById('nv218-connection');if(!notice)return;
 const offline=navigator.onLine===false;
 notice.hidden=!offline;
 const action=document.getElementById('nv218-offline-action');
 if(action)action.textContent=nvMember()?'Open offline bookshelf':'Open an ebook file';
}
window.addEventListener('offline',nv218RefreshConnectivity);
window.addEventListener('online',nv218RefreshConnectivity);
document.getElementById('nv218-offline-action')?.addEventListener('click',()=>{
 if(nvMember())navigate('library');
 else document.getElementById('reader-shortcut')?.click();
});
// After account hydration, the button label updates on the next connection event
// or user interaction; no extra backend request or network poll is needed.
document.addEventListener('pointerdown',e=>{if(e.target.closest('#nv218-offline-action'))nv218RefreshConnectivity()},{capture:true});
requestAnimationFrame(nv218RefreshConnectivity);

async function showBook(k,record=true){
 if(screen==='explore'&&record){nv218BrowseReturn={view:'explore',y:window.scrollY||0,bookKey:k};}
 else if(screen!=='detail'){nv218BrowseReturn=null;}
 const request=++nvDetailEpoch;
 let b=matchingBook(k);
 if(!b){
  // Direct links to uncached catalogue records should display an immediate,
  // understandable loading state instead of apparently freezing on Home.
  const main=document.querySelector('#main');
  if(main)main.innerHTML='<div class="nv-empty-results" role="status" aria-live="polite"><h2>Opening your book…</h2><p>Finding this edition and its reading options.</p><button type="button" class="secondary-btn" data-view="explore">Browse the library ↗</button></div>';
  try{b=await hydrate(k)}catch{}
 }
 if(request!==nvDetailEpoch)return; // Another book or a different screen was selected.
 if(!b){const row=[...shelves,...guestShelf,...historyRows,...guestHistory].find(x=>x.book_key===k);if(row)b=remember({...row,id:String(row.book_id),description:'Discover this book and its available editions.',genres:[],formats:{}})}
 if(!b){$('#main').innerHTML='<div class="alert">This book was not found. Please search again.</div>';return}
 if(nvAnnexIsFlagged(b)&&!nvAnnexUnlocked()){navigate('annex');return}
 if(!nvAnnexIsFlagged(b))nvAnnexLockOnLeave('detail');
 nvAnnexDetailOwner=nvAnnexIsFlagged(b)?nvAnnexOwner():'';
 active=b;screen='detail';document.body.dataset.nvScreen='detail';
 if(record){const u=new URL(location.href);u.searchParams.delete('view');u.searchParams.set('book',k);nvRegisterInternalRoute(u.pathname+u.search)}
 $('#main').innerHTML=bookDetails(b);syncSaveButtons(k);window.scrollTo(0,0);
 // The details page is usable immediately. Defer non-verified source lookups
 // so they cannot compete with a reader opening on a slow phone or network.
 if(nvCompleteTexts.has(k))nvCheckDetailAccess(b);
 else setTimeout(()=>{
  if(request===nvDetailEpoch&&screen==='detail'&&active&&id(active)===k&&!document.querySelector('#nv-reader'))nvCheckDetailAccess(active);
 },350);
 // Core book details are already visible. Never keep Surprise or a card
 // click waiting for remote metadata, review or recommendation providers.
 void track(b,'viewed').catch(()=>{});
 setTimeout(()=>{
  if(request!==nvDetailEpoch||screen!=='detail'||!active||id(active)!==k)return;
  void loadReviews(b).catch(()=>{});
 },120);
 setTimeout(()=>{
  if(request!==nvDetailEpoch||screen!=='detail'||!active||id(active)!==k)return;
  void recommend(b).catch(()=>{});
 },750);
 setTimeout(()=>{
  if(request!==nvDetailEpoch||screen!=='detail'||!active||id(active)!==k)return;
  void hydrate(k).then(detailed=>{
   if(request!==nvDetailEpoch||screen!=='detail'||!active||id(active)!==k||!detailed)return;
   active=detailed;
   // A late response must never discard a review being typed, reset scroll,
   // or replace the details while the reader is open.
   const typing=document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
   const reading=!!document.querySelector('#nv-reader');
   if(typing||reading||window.scrollY>230)return;
   // Avoid redundant entire-page rerenders when the metadata did not change.
   if(detailed===b||(
    detailed.title===b.title&&detailed.author===b.author&&detailed.description===b.description&&
    detailed.cover===b.cover&&JSON.stringify(detailed.genres||[])===JSON.stringify(b.genres||[])))return;
   $('#main').innerHTML=bookDetails(detailed);syncSaveButtons(k);nvCheckDetailAccess(detailed);
   void loadReviews(detailed).catch(()=>{});
  }).catch(()=>{});
 },1150);
}
async function recommend(b){const node=$('#recommendations');if(!node)return;const tag=(b.genres||[]).find(x=>x.length<40)||'fiction';try{const r=await getOL('subject:"'+tag.replace(/"/g,'')+'"',1,8);if(active&&id(active)===id(b)&&$('#recommendations'))$('#recommendations').innerHTML=grid(r.items.filter(x=>id(x)!==id(b)).slice(0,5))}catch{ /* Existing suggestions remain visible. */ }}
function bookForRow(r){return remember(matchingBook(r.book_key)||{source:r.source,id:r.book_id,title:r.title,author:r.author,cover:r.cover,description:'View this title for available reading options.',genres:[],formats:{}})}
async function track(b,action){
 if(!nvMember())return;
 const owner=me.id,client=db;
 if(owner&&client){
  const row={user_id:owner,book_key:id(b),book_id:String(b.id),source:b.source,title:b.title,author:b.author,cover:b.cover||'',last_action:action,accessed_at:new Date().toISOString()};
  const {error}=await client.from('reading_history').upsert(row,{onConflict:'user_id,book_key'});
  if(!error&&me?.id===owner&&db===client)historyRows=[row,...historyRows.filter(r=>r.book_key!==row.book_key)];
 }
}
/* NOVELLA 2.1.11 — instant-feeling, account-scoped shelf updates.
   The interface changes immediately. Each book has one serialized cloud writer;
   fast consecutive taps coalesce, and failed writes restore the last confirmed state. */
/* Novella 2.1.12 — Undo applies a new desired state through the same serialized,
   account-scoped writer; never an unsynchronized visual-only reversal. */
let nv212UndoState=null;
function nv212DismissUndo(){
 const current=nv212UndoState;
 if(current?.timer)clearTimeout(current.timer);
 nv212UndoState=null;
 const el=document.getElementById('nv212-action-undo');
 if(el)el.hidden=true;
}
function nv212OfferUndo(bookKey,before,label){
 if(!nvMember())return;
 nv212DismissUndo();
 const box=document.getElementById('nv212-action-undo');
 const text=document.getElementById('nv212-action-text');
 if(!box||!text)return;
 const action={owner:me.id,client:db,bookKey,before:nvFastRow(before),timer:null};
 nv212UndoState=action;
 text.textContent=label;
 box.hidden=false;
 action.timer=setTimeout(()=>{if(nv212UndoState===action)nv212DismissUndo()},6000);
}
function nv212UndoLastAction(){
 const action=nv212UndoState;
 nv212DismissUndo();
 if(!action)return;
 if(!nvMember()||me.id!==action.owner||db!==action.client)return;
 nvFastWrite(action.bookKey,nvFastRow(action.before),true);
 notify('Undone. Your shelf is back to the previous choice.');
}
document.addEventListener('click',event=>{
 if(event.target.closest('#nv212-action-restore')){event.preventDefault();nv212UndoLastAction();}
 else if(event.target.closest('#nv212-action-dismiss')){event.preventDefault();nv212DismissUndo();}
});
const nvFastShelfJobs=new Map();
const nvReadingStartJobs=new Set();
const nvFastRow=row=>row?{...row}:null;
const nvFastSignature=row=>row?JSON.stringify([row.book_key,row.status||'want_to_read',!!row.is_favorite]):'removed';
function nvFastShow(bookKey,structural=false){
 syncSaveButtons(bookKey);
 const row=shelves.find(r=>r.book_key===bookKey);
 $$('[data-nv205-favorite]').forEach(button=>{
  if(button.dataset.nv205Favorite!==bookKey)return;
  const selected=!!row?.is_favorite;
  button.textContent=selected?'★':'☆';
  button.setAttribute('aria-pressed',String(selected));
  button.setAttribute('aria-label',selected?'Remove from favorites':'Add to favorites');
  button.classList.toggle('nv-fast-selected',selected);
 });
 $$('[data-status]').forEach(select=>{if(select.dataset.status===bookKey&&row&&select.value!==row.status)select.value=row.status||'want_to_read';});
 nv201SuggestionMemo=null;
 if(structural&&screen==='library'){
  requestAnimationFrame(()=>{
   if(screen!=='library')return;
   nvRefreshShelfResults();
   const subtitle=document.querySelector('.page-title + .subtitle');
   if(subtitle){const total=shelves.filter(r=>r?.book_key&&!nvAnnexIsFlagged(bookForRow(r))).length;subtitle.textContent=`${total} saved ${total===1?'book':'books'}. Synced with your Novella account.`;}
  });
 }
}
function nvFastSet(bookKey,row,structural=false){
 const index=shelves.findIndex(r=>r.book_key===bookKey);
 if(row){if(index<0)shelves=[row,...shelves];else shelves[index]=row;}
 else if(index>=0)shelves.splice(index,1);
 nvFastShow(bookKey,structural);
}
function nvFastWrite(bookKey,next,structural=false){
 if(!nvMember())return false;
 const owner=me.id,client=db,token=owner+'|'+bookKey;
 let job=nvFastShelfJobs.get(token);
 if(!job){
  job={owner,client,bookKey,remote:nvFastRow(shelves.find(r=>r.book_key===bookKey)),desired:null,running:false,timer:null};
  nvFastShelfJobs.set(token,job);
 }
 job.desired=nvFastRow(next);
 nvFastSet(bookKey,job.desired,structural);
 if(!job.running&&!job.timer){job.timer=setTimeout(()=>{job.timer=null;void nvFastFlush(job)},85);}
 return true;
}
async function nvFastFlush(job){
 if(job.running)return;
 job.running=true;
 const key=job.owner+'|'+job.bookKey;
 try{
  while(nvFastSignature(job.remote)!==nvFastSignature(job.desired)){
   // The authenticated account and client must still be the same.
   if(me?.id!==job.owner||db!==job.client)return;
   const target=nvFastRow(job.desired),previous=nvFastRow(job.remote);
   let response;
   if(!target){response=await job.client.from('shelves').delete().eq('user_id',job.owner).eq('book_key',job.bookKey);}
   else if(!previous){
    const payload={user_id:job.owner,book_key:target.book_key,book_id:String(target.book_id||''),source:target.source,title:target.title,author:target.author,cover:target.cover||'',status:target.status||'want_to_read'};
    if(target.is_favorite)payload.is_favorite=true;
    response=await job.client.from('shelves').upsert(payload,{onConflict:'user_id,book_key'});
   }else{
    const patch={};
    if(previous.status!==target.status)patch.status=target.status||'want_to_read';
    if(!!previous.is_favorite!==!!target.is_favorite)patch.is_favorite=!!target.is_favorite;
    if(!Object.keys(patch).length){job.remote=target;continue;}
    response=await job.client.from('shelves').update(patch).eq('user_id',job.owner).eq('book_key',job.bookKey);
   }
   if(response?.error)throw response.error;
   job.remote=target;
   // Record completion only after the server confirms the shelf change.
   if(target?.status==='read'&&previous?.status!=='read'&&me?.id===job.owner&&db===job.client){
    void track(bookForRow(target),'read').catch(()=>{});
   }
  }
 }catch(error){
  // Never roll back a newly selected account using an older account's response.
  if(me?.id===job.owner&&db===job.client){
   if(nv212UndoState?.owner===job.owner&&nv212UndoState?.bookKey===job.bookKey)nv212DismissUndo();
   nvFastSet(job.bookKey,nvFastRow(job.remote),true);
   notify('Could not save that change. Your previous saved state has been restored.');
  }
  job.desired=nvFastRow(job.remote);
 }finally{
  job.running=false;
  // Coalesce new clicks that arrived while the previous request was in flight.
  if(me?.id===job.owner&&db===job.client&&nvFastSignature(job.remote)!==nvFastSignature(job.desired)){
   job.timer=setTimeout(()=>{job.timer=null;void nvFastFlush(job)},40);
  }else if(nvFastShelfJobs.get(key)===job)nvFastShelfJobs.delete(key);
 }
}
async function nvRecordReadingStart(book,edition='',format='text'){
 if(!book||!nvMember())return;
 const owner=me.id,key=id(book);
 if(edition&&!nv205LocalGet(owner,key,edition))nv205Stage(key,edition,{format,progress:0});
 const existing=shelves.find(row=>row.book_key===key);
 if(existing?.status!=='read'&&existing?.status!=='reading'){
  const next=existing?{...existing,status:'reading'}:{...localRow(book),user_id:owner,status:'reading'};
  nvFastWrite(key,next);
 }
 void track(book,'reading').catch(()=>{});
}
async function save(book){
 if(!nvRequireMember('save books'))return false;
 const key=id(book),existing=shelves.find(row=>row.book_key===key);
 const accepted=nvFastWrite(key,existing?null:{...localRow(book),user_id:me.id},screen==='library');
 if(accepted)nv212OfferUndo(key,existing,existing?'Removed from your shelf':'Added to your shelf');
 return accepted;
}
function syncSaveButtons(key){
 const saved=nvMember()&&shelves.some(row=>row.book_key===key);
 $$('[data-save]').forEach(button=>{
  if(button.dataset.save!==key)return;
  button.setAttribute('aria-pressed',String(!!saved));
  button.classList.toggle('is-saved',!!saved);
  if(button.classList.contains('quick-save')){
   button.textContent=saved?'♥':'♡';
   button.setAttribute('aria-label',saved?'Remove book from shelf':'Save book to shelf');
  }else button.textContent=saved?'♥ Remove from shelf':'♡ Save to shelf';
  button.title=saved?'Saved to shelf':nvMember()?'Save to shelf':'Sign in to save books';
 });
}

function syncBanner(){
 return `<aside class="nv-sync-banner" role="status"><span class="nv-sync-icon" aria-hidden="true">ⓘ</span><div><strong>Your reading space is temporarily not syncing</strong><p>We couldn’t load your reading data just now. Please try again shortly.</p></div></aside>`;
}
async function loadPersonal(){
 if(!me||!db){personalSyncIssue='';shelves=[];historyRows=[];if(['library','history','home','profile'].includes(screen))paint();return}
 const signedInId=me.id;
 let pair;
 try{
  pair=await Promise.all([
   db.from('shelves').select('*').eq('user_id',signedInId).order('created_at',{ascending:false}).limit(1000),
   db.from('reading_history').select('*').eq('user_id',signedInId).order('accessed_at',{ascending:false}).limit(1000)
  ]);
 }catch(e){if(me?.id!==signedInId)return;personalSyncIssue='Unable to reach the sync service';if(['library','history'].includes(screen))paint();return}
 if(me?.id!==signedInId)return; // Don't show a previous account's books after sign-out or account switching.
 const [s,h]=pair;
 personalSyncIssue=s.error?.message||h.error?.message||'';
 if(!s.error){
  shelves=s.data||[];
  // A slow account-data refresh cannot overwrite a newer on-screen action.
  for(const job of nvFastShelfJobs.values()){
   if(job.owner!==signedInId)continue;
   const i=shelves.findIndex(r=>r.book_key===job.bookKey);
   if(job.desired){if(i<0)shelves.unshift(nvFastRow(job.desired));else shelves[i]=nvFastRow(job.desired);}
   else if(i>=0)shelves.splice(i,1);
  }
 }
 if(!h.error)historyRows=h.data||[];
 // Permission failures are displayed once in the user's shelf, never as repeated toast popups.
 if(['library','history','home','profile'].includes(screen))paint();
 void nv205LoadSummary(signedInId);
 void nv206Load(signedInId);
}

async function changeStatus(bookKey,status){
 if(!nvRequireMember('change reading status'))return false;
 const row=shelves.find(r=>r.book_key===bookKey);
 if(!row||!['want_to_read','reading','read'].includes(status))return false;
 if(row.status===status)return true;
 const accepted=nvFastWrite(bookKey,{...row,status},true);
 if(accepted)nv212OfferUndo(bookKey,row,status==='read'?'Marked as finished':status==='reading'?'Moved to Currently Reading':'Moved to Want to Read');
 return accepted;
}
async function nv205ToggleFavorite(bookKey){
 if(!nvRequireMember('save favorite books'))return false;
 const row=shelves.find(r=>r.book_key===bookKey);
 if(!row)return false;
 const accepted=nvFastWrite(bookKey,{...row,is_favorite:!row.is_favorite},shelfFilter==='favorites');
 if(accepted)nv212OfferUndo(bookKey,row,row.is_favorite?'Removed from favorites':'Added to favorites');
 return accepted;
}
async function removeShelf(bookKey){
 if(!nvRequireMember('manage your bookshelf'))return false;
 if(!shelves.some(r=>r.book_key===bookKey))return false;
 const previous=shelves.find(r=>r.book_key===bookKey);
 const accepted=nvFastWrite(bookKey,null,true);
 if(accepted)nv212OfferUndo(bookKey,previous,'Removed from your shelf');
 return accepted;
}

async function loadReviews(b){const holder=$('#reviews');if(!holder)return;if(!db){holder.innerHTML='<div class="alert">Community reviews are available when Supabase is connected. You can still browse and read books as a guest.</div>';return}
 const {data,error}=await db.from('reviews').select('id,user_id,display_name,rating,body,created_at').eq('book_key',id(b)).order('created_at',{ascending:false}).limit(40);if(!active||id(active)!==id(b)||holder!==$('#reviews'))return;
 const rows=data||[];const avg=rows.length?(rows.reduce((sum,r)=>sum+r.rating,0)/rows.length).toFixed(1):null;
 holder.innerHTML=(error?`<div class="alert">${esc(error.message)}</div>`:'')+`<div class="review"><strong>${avg?'★ '+avg+' / 5 · '+rows.length+' community reviews':'Be the first to review'}</strong><p>Share a thoughtful, spoiler-conscious review.</p>${me?`<form id="review-form"><div class="field"><label for="review-rating">Your rating</label><select id="review-rating" name="rating">${[5,4,3,2,1].map(n=>`<option value="${n}">${'★'.repeat(n)} · ${n}/5</option>`).join('')}</select></div><div class="field"><label for="review-body">Your review</label><textarea id="review-body" name="body" minlength="5" maxlength="1200" rows="3" required placeholder="What did you think?"></textarea></div><button class="primary-btn">Publish review</button><p class="form-msg" id="review-message"></p></form>`:'<button class="secondary-btn" data-auth="signin">Sign in to review</button>'}</div>`+(rows.length?rows.map(r=>`<div class="review"><header><strong>${esc(r.display_name||'Reader')}</strong><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></header><p>${esc(r.body)}</p><small>${new Date(r.created_at).toLocaleDateString()}</small>${me?.id===r.user_id?` <button class="link-btn" data-delete-review="${esc(r.id)}">Delete</button>`:''}</div>`).join(''):'<div class="empty">No reviews yet. Start the conversation!</div>');
 if($('#review-form'))$('#review-form').onsubmit=async e=>{
  e.preventDefault();const owner=me?.id,client=db,form=e.currentTarget,button=form.querySelector('[type=submit],button.primary-btn');
  if(!owner||!client||button?.disabled)return;
  const f=new FormData(form);if(button)button.disabled=true;
  try{
   const {error:err}=await client.from('reviews').upsert({user_id:owner,book_key:id(b),display_name:(me.user_metadata?.name||me.email?.split('@')[0]||'Reader').slice(0,50),rating:Number(f.get('rating')),body:String(f.get('body')).trim()},{onConflict:'user_id,book_key'});
   if(me?.id!==owner||client!==db||!form.isConnected)return;
   if(err)$('#review-message').textContent=err.message;else{notify('Review published!');loadReviews(b).catch(()=>{})}
  }catch{if(me?.id===owner&&form.isConnected)$('#review-message').textContent='Could not publish your review. Please retry.'}
  finally{if(button?.isConnected)button.disabled=false}
 };
}
// V11.16: Preserve the full edition, never accept a size threshold alone as proof.
const NV_TEXT_MAX_BYTES=12*1024*1024;
const NV_PG_START=/^\s*\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG (?:EBOOK|E-BOOK)\b[^\r\n]*\*{3}\s*$/im;
const NV_PG_END=/^\s*(?:\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG (?:EBOOK|E-BOOK)\b[^\r\n]*\*{3}|end of (?:the )?project gutenberg(?:'s)? (?:ebook|e-book)\b[^\r\n]*)\s*$/im;
function nvInspectGutenbergText(raw){
 if(typeof raw!=='string'||raw.length<3000)return {valid:false,complete:false,reason:'The downloaded text is too short to verify.'};
 const text=raw.replace(/^\uFEFF/,'');
 const begin=NV_PG_START.exec(text);
 const after=begin?begin.index+begin[0].length:0;
 const end=NV_PG_END.exec(text.slice(after));
 const endAt=end?after+end.index:-1;
 // A footer establishes the file reached Gutenberg's end marker; it does not establish local copyright status.
 const complete=!!end&&endAt-after>=2400;
 const novel=complete?(begin?text.slice(after,endAt).trim():text.slice(0,endAt).trim()):text;
 return {valid:true,complete,text:novel,reason:complete?'Gutenberg end-of-ebook marker found.':'This source has no verifiable end-of-ebook marker.'};
}
function nvTextSourceURL(link){
 try{const u=new URL(link);if(u.protocol!=='https:')return false;
  return ['www.gutenberg.org','gutenberg.org','raw.githubusercontent.com','www.gutenberg.net','gutenberg.net'].includes(u.hostname)
   &&(u.hostname!=='raw.githubusercontent.com'||u.pathname.startsWith('/GITenberg/'));
 }catch{return false}
}
function nvGutenbergFormatURLs(formats,type){
 return Object.entries(formats||{}).filter(([key,value])=>key.toLowerCase().startsWith(type)&&nvTextSourceURL(value))
  .sort(([a],[b])=>Number(!/utf-8/i.test(a))-Number(!/utf-8/i.test(b))).map(([,value])=>value);
}
async function nvDownloadFullText(url,timeout=10500){
 if(!nvTextSourceURL(url))throw Error('Untrusted ebook source');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{signal:controller.signal,cache:'force-cache'});
  if(!response.ok)throw Error('Source returned '+response.status);
  const length=Number(response.headers.get('content-length')||0);
  if(length>NV_TEXT_MAX_BYTES)throw Error('Book file exceeds size limit');
  const blob=await response.blob();
  if(blob.size>NV_TEXT_MAX_BYTES)throw Error('Book file exceeds size limit');
  const raw=await blob.text();
  // Gutenberg also publishes complete HTML editions. Convert their body to text
  // before checking the same end-of-ebook marker; never assume HTML alone is complete.
  const isHtml=/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type')||'')||/\.x?html?(?:$|[?#])/i.test(url);
  return nvInspectGutenbergText(isHtml?nvHtmlToReadableText(raw):raw);
 }finally{clearTimeout(timer)}
}
async function nvGutenbergSourceList(book,deep=false){
 const id=String(book.id),sources=[],epubs=[];
 if(book.copyright===true)return {sources,epubs,deferred:false};
 const add=(list,url)=>{if(nvTextSourceURL(url)&&!list.includes(url))list.push(url)};
 add(sources,CURATED_TEXTS[id]);
 for(const link of nvGutenbergFormatURLs(book.formats,'text/plain'))add(sources,link);
 for(const link of nvGutenbergFormatURLs(book.formats,'text/html'))add(sources,link);
 for(const link of nvGutenbergFormatURLs(book.formats,'application/epub+zip'))add(epubs,link);
 // Fast path: don't delay a known text download on a metadata API or GitHub lookup.
 if(!deep&&sources.length)return {sources,epubs,deferred:true};
 // Lookup providers in parallel only when the first sources aren't known, or have failed.
 const responses=await Promise.allSettled([
  fetchJSON('https://gutendex.com/books/'+encodeURIComponent(id),{timeout:6500}),
  discoverGitText(book)
 ]);
 if(responses[0].status==='fulfilled'&&responses[0].value?.copyright!==true){
  const data=responses[0].value;
  for(const link of nvGutenbergFormatURLs(data?.formats,'text/plain'))add(sources,link);
  for(const link of nvGutenbergFormatURLs(data?.formats,'text/html'))add(sources,link);
  for(const link of nvGutenbergFormatURLs(data?.formats,'application/epub+zip'))add(epubs,link);
 }
 if(responses[1].status==='fulfilled')add(sources,responses[1].value);
 return {sources,epubs,deferred:false};
}
function nvHtmlToReadableText(markup){
 const doc=new DOMParser().parseFromString(markup,'text/html');
 doc.querySelectorAll('script,style,noscript,nav,iframe,object,embed,svg,form').forEach(n=>n.remove());
 const block=new Set(['P','DIV','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','LI','UL','OL','BR','HR','PRE','TR']);
 function read(n){if(n.nodeType===3)return n.nodeValue||'';if(n.nodeType!==1)return '';
  const txt=Array.from(n.childNodes).map(read).join('');return block.has(n.nodeName)?'\n'+txt+'\n':txt;}
 return read(doc.body||doc.documentElement).replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
async function nvCheckEpubSpine(buffer){
 const zip=await window.JSZip.loadAsync(buffer);
 const container=zip.file('META-INF/container.xml');if(!container)throw Error('This EPUB is missing its container metadata.');
 const xml=new DOMParser().parseFromString(await container.async('text'),'application/xml');
 const root=xml.getElementsByTagName('rootfile')[0];const pkg=root?.getAttribute('full-path');
 if(!pkg||!zip.file(pkg))throw Error('The EPUB package is missing.');
 const opf=new DOMParser().parseFromString(await zip.file(pkg).async('text'),'application/xml');
 if(opf.querySelector('parsererror'))throw Error('The EPUB package is damaged.');
 const resources=new Map(Array.from(opf.getElementsByTagName('item')).map(e=>[e.getAttribute('id'),e.getAttribute('href')]));
 const sequence=Array.from(opf.getElementsByTagName('itemref')).filter(e=>e.getAttribute('linear')!=='no');
 if(!sequence.length)throw Error('No readable spine chapters were found.');
 const directory=pkg.includes('/')?pkg.slice(0,pkg.lastIndexOf('/')+1):'';
 const missing=sequence.filter(e=>{
  const ref=resources.get(e.getAttribute('idref'));if(!ref)return true;
  try{const u=new URL(ref,'https://novella.invalid/'+directory);const path=decodeURIComponent(u.pathname.slice(1));return !zip.file(path)}catch{return true}
 });
 if(missing.length)throw Error('The EPUB is incomplete: '+missing.length+' chapter file(s) are missing.');
 return sequence.length;
}

/* Local reader: does not bypass publisher restrictions or upload the reader's files. */
let openReaderPanel=null;


// Offline is not a sign-in method. Only an unexpired existing Supabase session
// with a profile previously verified online can reopen the personal offline shelf.
function nv209RememberVerifiedProfile(user,profile){
 if(!user?.id||profile?.user_id!==user.id)return;
 try{localStorage.setItem(KEY+'verified-offline-profile:'+encodeURIComponent(user.id),JSON.stringify({user_id:user.id,display_name:String(profile.display_name||'Reader').slice(0,100),created_at:String(profile.created_at||'').slice(0,80)}))}catch{}
}
function nv209DropCachedProfile(owner){
 try{localStorage.removeItem(KEY+'verified-offline-profile:'+encodeURIComponent(owner))}catch{}
}
async function nv209TryOfflineProfile(user,epoch){
 if(navigator.onLine!==false||!user?.id||!db?.auth?.getSession)return false;
 let profile=null;try{profile=JSON.parse(localStorage.getItem(KEY+'verified-offline-profile:'+encodeURIComponent(user.id))||'null')}catch{}
 if(profile?.user_id!==user.id)return false;
 try{
  const {data,error}=await Promise.race([db.auth.getSession(),new Promise(resolve=>setTimeout(()=>resolve({error:true}),1600))]);
  const session=data?.session;
  if(error||!session||session.user?.id!==user.id||!Number.isFinite(session.expires_at)||session.expires_at*1000<=Date.now()+3000)return false;
  if(epoch!==nvAuthEpoch)return false;
  me=session.user;nvProfile=profile;nvPendingGoogle=null;userUI();paint();
  notify('Offline reading is ready. Your online library will reconnect when your internet returns.');
  return true;
 }catch{return false}
}

// Novella 2.1.1 — explicitly saved verified public-domain texts only.
// This database is device-local and account-scoped; never cache account APIs.
const NV209_DB='novella-offline-books-v1';
let nv209InstallEvent=null;
function nv209DB(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(Error('Offline storage is not supported in this browser.'));return}
  const request=indexedDB.open(NV209_DB,1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore('books',{keyPath:'key'});store.createIndex('owner','owner',{unique:false})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Offline storage could not open.'));
  request.onblocked=()=>reject(Error('Close other Novella tabs and try again.'));
 });
}
async function nv209Request(owner,mode,callback){
 const database=await nv209DB();
 return new Promise((resolve,reject)=>{
  let result=null;
  let done=false;
  function finish(error){if(done)return;done=true;database.close();error?reject(error):resolve(result)}
  try{
   const txn=database.transaction('books',mode);const store=txn.objectStore('books');
   const req=callback(store);
   if(req){req.onsuccess=()=>{result=req.result};req.onerror=()=>{}};
   txn.oncomplete=()=>finish(null);
   txn.onerror=()=>finish(txn.error||Error('Could not save offline book.'));
   txn.onabort=()=>finish(txn.error||Error('Offline book operation was interrupted.'));
  }catch(e){finish(e)}
 });
}
const nv209Key=(owner,bookKey)=>owner+'|'+bookKey;
async function nv209Get(owner,bookKey){
 if(!owner||!bookKey)return null;
 const row=await nv209Request(owner,'readonly',store=>store.get(nv209Key(owner,bookKey)));
 return row?.owner===owner&&row?.bookKey===bookKey?row:null;
}
async function nv209List(owner){
 if(!owner)return [];
 const rows=await nv209Request(owner,'readonly',store=>store.index('owner').getAll(owner));
 return (rows||[]).filter(row=>row.owner===owner&&row.complete===true&&typeof row.text==='string').sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
}
async function nv210SaveFromDetail(book,button){
 if(!nvRequireMember('save books offline'))return;
 if(!book)return;
 const owner=me.id;
 const label=button?.textContent||'↓ Save offline';
 if(button){button.disabled=true;button.textContent='Checking full text…'}
 try{
  const full=book.source==='gutenberg'?book:await findFreeEdition(book);
  if(!full||full.source!=='gutenberg')throw Error('No verified complete text is available to save for this title.');
  const verified=await nvVerifyCompleteText(full);
  if(!verified||!nvCompleteTexts.has(id(full)))throw Error('Could not verify a complete edition. Try another book or check your connection.');
  if(!nvMember()||me.id!==owner)throw Error('Your account changed. Sign in again to save this book.');
  const text=nvCompleteTexts.get(id(full)).text;
  const name=(full.title||'book').replace(/[^a-z0-9 _-]/gi,'').slice(0,65)+'.txt';
  if(button)button.textContent='Saving…';
  const ok=await nv209Save(full,text,name);
  if(ok){if(button)button.textContent='✓ Saved offline';notify('Saved on this device. Open it in My bookshelf → Offline books.');}
  else throw Error('Could not save this edition for offline reading.');
 }catch(error){if(button)button.textContent=label;notify(error?.message||'Offline save failed. Please try again.');}
 finally{if(button){button.disabled=false}}
}
async function nv209Save(book,text,fileName){
 if(!nvRequireMember('save books offline'))return false;
 if(!book||book.source!=='gutenberg'||typeof text!=='string'||text.length<1500)throw Error('Only verified complete text editions can be saved offline.');
 const owner=me.id,bookKey=id(book);
 if(text.length>12*1024*1024)throw Error('This edition is too large for offline saving.');
 const row={key:nv209Key(owner,bookKey),owner,bookKey,source:'gutenberg',bookId:String(book.id),title:String(book.title||'Untitled').slice(0,180),author:String(book.author||'Unknown author').slice(0,140),fileName:String(fileName||'book.txt').slice(0,160),text,complete:true,savedAt:new Date().toISOString()};
 await nv209Request(owner,'readwrite',store=>store.put(row));
 if(!nvMember()||me.id!==owner)return false;
 nv209RefreshViews();return true;
}
function nv209ShelfMarkup(){return `<section class="nv209-panel" aria-labelledby="nv209-offline-heading"><div class="intro-label">YOUR OFFLINE SHELF</div><h2 id="nv209-offline-heading">Stories you can take anywhere.</h2><p>Save a verified full-text book from its reader to open it later without a connection. These copies stay on this device and are available only when your account session is active.</p><div id="nv209-offline-list" class="nv209-offline-list" aria-live="polite"><p>Checking your saved books…</p></div></section>`}
function nv209SettingsMarkup(){return `<section class="nv209-panel nv209-settings" aria-label="Install Novella app"><div class="intro-label">NOVELLA / ON YOUR DEVICE</div><h2>Make room for reading.</h2><p>Install Novella for an app-like experience. Save verified text editions in the reader for offline access on this device.</p><div class="nv209-install-row"><button type="button" class="nv209-button nv209-button-main" data-nv209-action="install">Install Novella ↗</button><button type="button" class="nv209-button" data-view="library">My offline books</button><button type="button" class="nv209-button" data-nv216-action="check">Check for updates ↻</button></div><p id="nv209-install-info" role="status">Installation depends on your browser and device.</p><div class="nv216-update-status" aria-live="polite"><span id="nv216-update-message">${nv216UpdateMessage()}</span><button type="button" class="nv209-button nv216-update-reload" data-nv216-action="reload" ${nv216UpdateReady?'':'hidden'}>Reload when ready ↻</button></div></section>`}
async function nv209RefreshViews(){
 const owner=nvMember()?me.id:null;
 const box=document.querySelector('#nv209-offline-list');
 if(!box)return;
 if(!owner){box.textContent='Sign in to see your offline books.';return}
 try{
  const rows=await nv209List(owner);
  if(!box.isConnected||!nvMember()||me.id!==owner)return;
  if(!rows.length){box.innerHTML='<p>No offline books yet. Open a complete book, then choose “Save offline” in the reader.</p>';return}
  box.replaceChildren();
  for(const row of rows){
   const item=document.createElement('article');item.className='nv209-book';
   const title=document.createElement('strong');title.textContent=row.title;
   const author=document.createElement('small');author.textContent=row.author;
   const info=document.createElement('small');info.textContent='Saved on this device';
   const actions=document.createElement('div');actions.className='nv209-book-actions';
   for(const [action,label] of [['open','Read offline →'],['remove','Remove']]){
    const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.nv209Action=action;btn.dataset.nv209Book=row.bookKey;actions.append(btn);
   }
   item.append(title,author,info,actions);box.append(item);
  }
 }catch(e){if(box.isConnected)box.textContent='Offline books are unavailable on this browser. Try again or check your browser storage settings.'}
}
async function nv209Install(){
 const status=document.querySelector('#nv209-install-info');
 const write=s=>{if(status)status.textContent=s};
 if(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone){write('Novella is already installed.');return}
 if(nv209InstallEvent){const event=nv209InstallEvent;nv209InstallEvent=null;try{await event.prompt();const chosen=await event.userChoice;write(chosen?.outcome==='accepted'?'Novella installation started.':'You can install Novella later from your browser menu.')}catch{write('Open your browser menu and choose Install app or Add to Home Screen.')}return}
 write(/iPhone|iPad|iPod/.test(navigator.userAgent)?'On iPhone or iPad, use Share → Add to Home Screen.':'Open your browser menu and choose Install app or Add to Home Screen.');
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();nv209InstallEvent=event});
window.addEventListener('appinstalled',()=>{nv209InstallEvent=null;const s=document.querySelector('#nv209-install-info');if(s)s.textContent='Novella is installed.'});

// A deployment must never silently refresh a book, erase a draft, or drop unsynced progress.
// Keep updates opt-in and expose their state in the existing Settings panel.
let nv216UpdateReady=false,nv216UpdateChecking=false,nv216UpdateNote='',nv216ApplyingUpdate=false;
function nv216UpdateMessage(){
 if(nv216UpdateNote)return nv216UpdateNote;
 if(typeof navigator!=='undefined'&&navigator.onLine===false)return 'You appear offline. Previously saved books may still open on this device.';
 if(!('serviceWorker' in navigator))return 'This browser does not support app updates. Refresh Novella normally to see new changes.';
 return nv216UpdateReady?'A newer Novella version is ready. Save your work first; refreshing opens Discover at the top.':'Updates are checked when you visit. Refresh opens Discover at the top; saved books and notes are not cleared.';
}
function nv216UpdatePaint(){
 const node=document.getElementById('nv216-update-message');if(node)node.textContent=nv216UpdateMessage();
 const reload=document.querySelector('[data-nv216-action="reload"]');
 if(reload){reload.hidden=!nv216UpdateReady;reload.disabled=nv216ApplyingUpdate;reload.setAttribute('aria-busy',String(nv216ApplyingUpdate));}
 const check=document.querySelector('[data-nv216-action="check"]');if(check){check.disabled=nv216UpdateChecking;check.setAttribute('aria-busy',String(nv216UpdateChecking));}
}
async function nv216CheckUpdates(){
 if(!('serviceWorker' in navigator)){nv216UpdateNote='This browser does not support app updates.';nv216UpdatePaint();return}
 if(nv216UpdateChecking)return;
 if(navigator.onLine===false){nv216UpdateNote='You appear offline. Reconnect to check for a newer version.';nv216UpdatePaint();return}
 nv216UpdateChecking=true;nv216UpdateNote='Checking for a newer version…';nv216UpdatePaint();
 try{
  const registration=await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  await registration.update();
  nv216UpdateNote=nv216UpdateReady||registration.waiting?'An update is ready. Finish reading, then reload from Settings.':'Update check complete. If a new version is found, Novella will offer to reload.';
  if(registration.waiting)nv216UpdateReady=true;
 }catch(error){nv216UpdateNote='Could not check for updates. Check your connection and try again.'}
 finally{nv216UpdateChecking=false;nv216UpdatePaint()}
}
document.addEventListener('click',event=>{
 const button=event.target instanceof Element?event.target.closest('[data-nv216-action]'):null;if(!button)return;
 event.preventDefault();
 if(button.dataset.nv216Action==='check'){void nv216CheckUpdates();return}
 if(button.dataset.nv216Action==='reload'){
  if(!nv216UpdateReady||nv216ApplyingUpdate)return;
  // Only an explicit user click may activate an update; never interrupt the reader.
  if(document.getElementById('nv-reader')){notify('Close your book after saving notes, then reload from Settings.');return}
  if(!document.getElementById('modal-overlay')?.classList.contains('hidden')){notify('Finish the open account dialog before reloading.');return}
  nv216ApplyingUpdate=true;nv216UpdateNote='Opening your updated Novella…';nv216UpdatePaint();
  void (async()=>{
   try{
    const registration=await navigator.serviceWorker.getRegistration('./');
    if(!registration?.waiting){nv216ApplyingUpdate=false;location.reload();return}
    registration.waiting.postMessage({type:'NOVELLA_ACTIVATE_UPDATE'});
    // A failed activation must never leave a permanently disabled button.
    setTimeout(()=>{
     if(!nv216ApplyingUpdate)return;
     nv216ApplyingUpdate=false;
     nv216UpdateNote='The update did not finish. Check for updates and try again.';
     nv216UpdatePaint();
    },8000);
   }catch{
    nv216ApplyingUpdate=false;
    nv216UpdateNote='Could not open the update. Please try again.';
    nv216UpdatePaint();
   }
  })();
 }
});
window.addEventListener('online',()=>{nv216UpdateNote='';nv216UpdatePaint()});
window.addEventListener('offline',()=>{nv216UpdateNote='';nv216UpdatePaint()});

// The prompt and local book controls are intentionally delegated across route repaint.
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-nv209-action]');if(!b)return;
 const action=b.dataset.nv209Action;if(!['install','open','remove'].includes(action))return;
 if(action==='install'){nv209Install();return}
 if(!nvRequireMember('use offline books'))return;
 const owner=me.id,bookKey=b.dataset.nv209Book;
 if(!bookKey)return;
 b.disabled=true;
 try{
  const row=await nv209Get(owner,bookKey);
  if(!nvMember()||me.id!==owner)return;
  if(!row){notify('This offline copy is no longer available.');nv209RefreshViews();return}
  if(action==='remove'){
   if(!confirm('Remove this offline copy from this device? Your online books and reading progress will stay.'))return;
   await nv209Request(owner,'readwrite',store=>store.delete(nv209Key(owner,bookKey)));
   if(nvMember()&&me.id===owner){notify('Offline copy removed from this device.');nv209RefreshViews()}
  }else{
   const book={source:'gutenberg',id:row.bookId,title:row.title,author:row.author,cover:'',genres:[],formats:{}};
   readerModal(book,{offlineText:row});
  }
 }catch{notify('Offline book action failed. Check storage access and try again.')}
 finally{b.disabled=false}
});
// Never store account data or third-party book requests in the service worker.
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
 // Ignore the first install, but notify readers if an existing controlled app updates.
 let hadController=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(nv216ApplyingUpdate){nv216ApplyingUpdate=false;location.reload();return}
  if(hadController){nv216UpdateReady=true;nv216UpdateNote='A newer Novella version is ready. Save your work, then reload from Settings.';nv216UpdatePaint();}
  hadController=true;
 });
 // Register at DOM readiness, not window.load: slow cover images must not delay PWA readiness.
 function nv216RegisterWorker(){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
   if(reg.waiting&&navigator.serviceWorker.controller){nv216UpdateReady=true;nv216UpdatePaint()}
  }).catch(()=>{});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',nv216RegisterWorker,{once:true});
 else nv216RegisterWorker();
}

function readerModal(book=null,options={}){
 if(openReaderPanel)openReaderPanel();
 const known=!!book, bookId=known?id(book):'local:upload';const localOnly=!!options.localOnly;
 const official=known&&book.source==='gutenberg'?`https://www.gutenberg.org/ebooks/${encodeURIComponent(book.id)}`:known?(url(book.preview)||'https://openlibrary.org'):'https://www.gutenberg.org/';
 const nv211PreviousFocus=document.activeElement;
 const panel=document.createElement('section');panel.className='nv-reader';panel.id='nv-reader';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Novella reading desk');
 const savedPrefs=getLocal('reader-prefs',{size:19,theme:'paper'});
 const prefs={size:Math.min(30,Math.max(14,Number(savedPrefs.size)||19)),theme:['paper','white','night','contrast'].includes(savedPrefs.theme)?savedPrefs.theme:'paper',width:[620,760,900].includes(Number(savedPrefs.width))?Number(savedPrefs.width):760,leading:[1.65,1.9,2.1].includes(Number(savedPrefs.leading))?Number(savedPrefs.leading):1.9,font:['serif','sans','mono','ease'].includes(savedPrefs.font)?savedPrefs.font:'serif',speed:[180,220,280].includes(Number(savedPrefs.speed))?Number(savedPrefs.speed):220,paragraphGap:[1.05,1.25,1.65].includes(Number(savedPrefs.paragraphGap))?Number(savedPrefs.paragraphGap):1.25};
 let epubBook=null,rendition=null,fileMode='none',bookProgress='',lastTextPercent=0,pdfObjectUrl=null,pdfDocument=null,pdfRenderJob=null,pdfRenderTicket=0,pdfPageNumber=1,nvReaderTotalWords=0,nvReaderFindTimer=null,nvReaderFindMatches=[],nvReaderFindLast=null,nvProgressTimer=null,nvLastProgressStored=0;
 let progressKey=KEY+'progress:'+bookId,nvReaderEdition='',nvReaderCloudLoading=null,nvReaderState=null,nvReaderVerified=false,nvReaderOwner=nvMember()?me.id:'';
 panel.innerHTML=`<div class="nv-reader-top"><button class="nv-reader-exit" id="nv-reader-close" type="button" aria-label="Return to book details">← <span>Back to book</span></button><div class="nv-reader-heading"><small>✦ NOVELLA / YOUR READING ROOM</small><strong id="nv-reader-title"></strong><span class="nv-reader-author" id="nv-reader-author"></span></div><div class="nv-reader-header-actions"><button type="button" class="nv-reader-focus-toggle" id="nv-reader-focus" aria-pressed="false" aria-label="Enter distraction-free reading" title="Distraction-free reading">◫ <span>Focus</span></button><button type="button" class="nv-reader-find-toggle" id="nv-reader-find-toggle" aria-label="Find a passage in this book" aria-expanded="false" aria-controls="nv-reader-find-panel" title="Find words in this book">⌕ <span>Find</span></button><button type="button" class="nv211-listen-toggle" id="nv211-listen-toggle" aria-expanded="false" aria-controls="nv211-listen-panel" aria-label="Listen to this book" title="Narrate readable text">◖ <span>Listen</span></button><button type="button" class="nv206-toggle" id="nv206-toggle" aria-expanded="false" aria-controls="nv206-panel" title="Highlights and notes">✎ <span>Notes</span></button><button type="button" class="nv-reader-display-toggle" id="nv-reader-display-toggle" aria-label="Reader display settings" aria-expanded="false" aria-controls="nv-reader-display-panel">✧ <span>Display</span></button><button type="button" class="nv-reader-help" id="nv-reader-help">Help</button></div></div>
 <div class="nv-reader-controls" id="nv-reader-controls-actions"><label class="nv-reader-palette"><span>THEME</span><select id="nv-reader-theme" aria-label="Reading colors"><option value="paper">Parchment</option><option value="white">Blue mist</option><option value="night">Midnight</option><option value="contrast">High contrast</option></select></label><div class="nv-reader-type-controls" role="group" aria-label="Font size"><button id="nv-reader-minus" type="button" aria-label="Decrease font size">A−</button><span id="nv-reader-font-size" aria-live="polite">19px</span><button id="nv-reader-plus" type="button" aria-label="Increase font size">A+</button></div><button id="nv-reader-mark" class="nv-reader-bookmark" type="button">☆ <span>Bookmark</span></button><button id="nv-reader-more-toggle" type="button" aria-expanded="false" aria-controls="nv-reader-extra">··· <span>More</span></button><div class="nv-reader-extra" id="nv-reader-extra" hidden><button id="nv-reader-quickupload" type="button">↥ Open ebook file</button><button id="nv205-jump-bookmark" type="button">↳ Return to bookmark</button>${known?'<button id="nv-reader-finish" type="button">✓ Mark finished</button>':''}<button id="nv-reader-mobile-help" type="button">ⓘ Reading help</button><button id="nv211-skip-text" type="button">↳ Jump to book text</button></div></div>
 <div class="nv-reader-display-panel" id="nv-reader-display-panel" hidden><div class="nv-reader-panel-title"><strong>Make the page yours</strong><button id="nv-reader-display-close" type="button" aria-label="Close display options">×</button></div><label>Reading width <select id="nv-reader-width"><option value="620">Focused</option><option value="760">Comfortable</option><option value="900">Wide</option></select></label><label>Line spacing <select id="nv-reader-leading"><option value="1.65">Compact</option><option value="1.9">Comfortable</option><option value="2.1">Airy</option></select></label><label>Reading font <select id="nv-reader-font"><option value="serif">Book serif</option><option value="sans">Clean sans</option><option value="mono">Monospace</option><option value="ease">Easy-read sans</option></select></label><label>Paragraph spacing <select id="nv211-paragraph-spacing"><option value="1.05">Close</option><option value="1.25">Comfortable</option><option value="1.65">Spacious</option></select></label><label>Reading pace <select id="nv-reader-speed"><option value="180">Relaxed</option><option value="220">Average</option><option value="280">Quick</option></select></label><p>Font, width, spacing and estimated reading time stay on this device. No account required to change the display.</p></div><section class="nv-reader-find-panel" id="nv-reader-find-panel" role="search" aria-label="Search within the open book" hidden><label for="nv-reader-find-input">Find a word or phrase</label><div class="nv-reader-find-row"><input id="nv-reader-find-input" type="search" maxlength="90" autocomplete="off" placeholder="Search this text…"><button type="button" class="nv-reader-find-close" id="nv-reader-find-close" aria-label="Close book search">×</button></div><p class="nv-reader-find-status" id="nv-reader-find-status" role="status" aria-live="polite">Open a text book to search its pages.</p><div class="nv-reader-find-results" id="nv-reader-find-results"></div></section>
 <section class="nv211-listen-panel" id="nv211-listen-panel" role="region" aria-label="Listen to book" hidden>
  <div class="nv-reader-panel-title"><strong>Listen to this book</strong><button type="button" id="nv211-listen-close" aria-label="Close narration controls">×</button></div>
  <p class="nv211-listen-intro">Listen to available text in your browser's voice. Choose a voice, adjust the pace, and follow along if you like.</p>
  <p class="nv211-listen-status" id="nv211-listen-status" role="status" aria-live="polite">Open a text edition to start listening.</p>
  <div class="nv211-listen-actions"><button type="button" id="nv211-listen-play" class="nv211-listen-primary">▶ Play</button><button type="button" id="nv211-listen-restart">↳ From here</button><button type="button" id="nv211-listen-stop">■ Stop</button></div>
  <div class="nv213-voice-discovery" role="group" aria-label="Find a narration voice">
   <div class="nv213-voice-heading"><label for="nv213-voice-search">Find your voice</label><button type="button" id="nv213-voice-clear" aria-label="Clear voice filters">Clear filters</button></div>
   <input id="nv213-voice-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search voice name or language…" aria-controls="nv211-listen-voice">
   <div class="nv213-voice-toggles"><label><input type="checkbox" id="nv213-voice-english"> English voices</label><label><input type="checkbox" id="nv213-voice-local"> On-device voices</label></div>
   <label class="nv213-voice-select-label" for="nv211-listen-voice">Choose narration voice</label>
   <select id="nv211-listen-voice" aria-label="Narration voice"><option value="">Automatic voice</option></select>
   <p id="nv213-voice-count" role="status" aria-live="polite">Voices are provided by your browser. Try Test voice before reading.</p>
  </div>
  <div class="nv212-voice-tools"><button type="button" id="nv212-test-voice">▶ Test voice</button><button type="button" id="nv212-refresh-voices">↻ Refresh voices</button></div>
  <label class="nv211-listen-field">Narration speed<select id="nv211-listen-rate"><option value="0.75">0.75× Slow</option><option value="0.9">0.9× Gentle</option><option value="1">1× Normal</option><option value="1.15">1.15× Faster</option><option value="1.3">1.3× Quick</option><option value="1.5">1.5× Fast</option></select></label>
  <label class="nv211-follow"><input type="checkbox" id="nv211-listen-follow" checked> Follow the spoken paragraph</label>
  <p class="nv211-listen-hint">The voices listed here come from this browser and device; a listed voice is not guaranteed to work. Test one to check it. Online voices need a connection, and Novella falls back automatically when a selected voice fails. EPUB and PDF viewers have their own accessibility controls.</p>
 </section><section class="nv206-panel" id="nv206-panel" role="region" aria-label="Book highlights and notes" hidden><div class="nv206-heading"><strong>Notes &amp; highlights</strong><button type="button" class="nv206-close" id="nv206-close" aria-label="Close notes">×</button></div><p class="nv206-caption" id="nv206-caption">Select a passage to highlight it, or write a note for this book.</p><div class="nv206-editor"><blockquote class="nv206-quote-preview" id="nv206-preview" hidden></blockquote><label for="nv206-note-input">Your note (optional for highlights)</label><textarea id="nv206-note-input" maxlength="4000" placeholder="What would you like to remember?"></textarea><div class="nv206-editor-actions"><div class="nv206-colors" role="group" aria-label="Highlight color"><button type="button" data-nv206-color="lavender" aria-label="Lavender" aria-pressed="true"></button><button type="button" data-nv206-color="mint" aria-label="Mint" aria-pressed="false"></button><button type="button" data-nv206-color="peach" aria-label="Peach" aria-pressed="false"></button></div><button type="button" class="nv206-save" id="nv206-save">Save highlight</button></div></div><div class="nv206-list-title">SAVED IN THIS BOOK</div><div class="nv206-list" id="nv206-list" aria-live="polite"></div><p class="nv206-hint" id="nv206-sync-hint">Notes are private to your account. Cloud syncing requires the optional notes setup.</p></section>
 <div class="nv-reader-progress"><div id="nv-reader-meter"></div></div><div class="nv205-reader-sync" id="nv205-reader-sync" role="status" aria-live="polite">Sign in to save progress</div><div id="nv-reader-integrity" class="nv-reader-integrity" role="status" aria-live="polite" hidden></div>
 <div class="nv-reader-scroller paper" id="nv-reader-scroller" tabindex="0"><div class="nv-reader-welcome" id="nv-reader-welcome">
  <div class="nv-reader-simple"><span class="nv-reader-wordmark">NOVELLA <i>·</i> READING ROOM</span>
   <div class="nv-reader-simple-cover" aria-hidden="true">✧</div>
   <span class="nv-kicker">${book?'YOUR READING OPTIONS':'YOUR PERSONAL READER'}</span>
   <h2 id="nv-reader-welcome-title">${book?(canTryCommunityEdition(book)?'Getting your book ready…':'Choose how to read'):'Read your ebook'}</h2>
   <p>${book?'We’ll check whether a complete edition is available. You can also open a copy you have.':'Choose an EPUB, PDF, TXT or HTML file to start reading.'}</p>
   <div class="nv-reader-access" id="nv-reader-access" role="status" aria-live="polite" ${!book||localOnly?'hidden':''}><strong>Checking reading availability…</strong><p>We’ll show the most useful option here.</p><div class="nv-smart-links" id="nv-reader-access-links"></div></div>
   <div class="nv-reader-restricted" id="nv-reader-restricted" hidden><span class="nv-restricted-kicker">AVAILABLE OPTIONS</span><h3>More ways to read</h3><p></p><div class="nv-reader-restricted-actions" id="nv-reader-restricted-actions"></div></div>
   <div class="nv-reader-choices">${book&&verifiedOpenScan(book)?'<button type="button" class="primary-btn" id="nv-reader-online">Open available scan</button>':''}<button type="button" class="primary-btn" id="nv-reader-upload">Open a downloaded ebook file</button><a class="secondary-btn" id="nv-reader-official" target="_blank" rel="noopener noreferrer">${known?'Find other editions':'Explore free classics'}</a></div>
   <p class="nv-reader-note">PDF · EPUB · TXT · HTML · Your files stay on this device.</p>
   ${book?`<details class="nv-reader-details"><summary>Explore more reading sources <span aria-hidden="true">⌄</span></summary>${nvSourcePanel(book)}</details>`:''}
  </div>
 </div><div id="nv-reader-text" class="nv-reader-text" hidden></div><div id="nv-epub-stage" class="nv-epub-stage" hidden></div><div id="nv-ia-stage" class="nv-ia-stage" hidden></div><div id="nv-google-stage" class="nv-google-stage" hidden></div><div id="nv-pdf-stage" class="nv-pdf-stage" hidden></div></div>
 <div class="nv206-selection-bar" id="nv206-selection-bar" hidden><button type="button" id="nv206-highlight-selection">✎ Highlight selected passage</button></div>
 <div class="nv-reader-bottom" id="nv-reader-bottom" hidden><div class="nv-reader-bottom-head"><span class="nv-reader-bottom-brand">✧ YOUR READING PROGRESS</span><span id="nv-reader-page-label" role="status" aria-live="off">0% read</span><button type="button" id="nv-reader-scroll-top" title="Return to the beginning of this book">↑ Top</button></div><div class="nv-reader-chapter-controls"><button id="nv-reader-prev" type="button">← Previous</button><label for="nv-reader-chapters" class="nv-reader-chapter-label"><span>CHAPTER</span><select id="nv-reader-chapters" aria-label="Choose chapter" hidden></select></label><button id="nv-reader-next" type="button">Next →</button><button id="nv-reader-jump-end" type="button" title="Jump to the last chapter or end of the text">Last chapter ↗</button></div></div>
 <div id="nv-reader-guide" hidden role="note"><button type="button" id="nv-reader-guide-close" aria-label="Close reading help">×</button><strong>Reading options</strong><p><b>Free classics:</b> Novella checks the GITenberg public-domain archive for readable text. <b>Public scans:</b> These use Internet Archive's viewer. <b>Google Books:</b> Publisher-authorized previews may appear inside Novella. <b>Borrowing:</b> Open Library may require a separate account. <b>Local files:</b> Open EPUB, PDF, TXT or HTML ebooks you have permission to use; they stay on your device.</p><p>The source directory includes 11 libraries; extra catalogue checks run only when requested. A catalogue listing does not confirm reading rights. The paper and font buttons apply to your local files. Embedded Google Books and Internet Archive readers have their own controls; access varies by country and title.</p></div><input type="file" id="nv-reader-file" accept=".epub,application/epub+zip,.pdf,application/pdf,.txt,text/plain,.html,.htm,text/html" hidden>`;
 document.body.append(panel);document.body.classList.add('nv-reader-open');openReaderPanel=close;nvRefreshBackToTop();
 const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';requestAnimationFrame(()=>panel.querySelector('#nv-reader-close')?.focus({preventScroll:true}));
 const el=(s)=>panel.querySelector(s), scroller=el('#nv-reader-scroller'),textEl=el('#nv-reader-text'),stage=el('#nv-epub-stage'),pdfStage=el('#nv-pdf-stage'),meter=el('#nv-reader-meter'),label=el('#nv-reader-page-label');
 // Keep all reader popovers below the measured header, including on narrow screens.
 let nvReaderOverlayFrame=0;
 function nvReaderOverlayLayout(){
  if(nvReaderOverlayFrame)return;
  nvReaderOverlayFrame=requestAnimationFrame(()=>{
   nvReaderOverlayFrame=0;
   if(!panel.isConnected)return;
   const head=el('.nv-reader-top'),controls=el('#nv-reader-controls-actions');
   const panelTop=panel.getBoundingClientRect().top;
   const headBottom=head?.getBoundingClientRect().bottom||panelTop+78;
   const controlsBottom=controls?.getBoundingClientRect().bottom||headBottom;
   panel.style.setProperty('--nv-reader-popover-top',Math.ceil(Math.max(0,headBottom-panelTop+7))+'px');
   panel.style.setProperty('--nv-reader-more-top',Math.ceil(Math.max(0,controlsBottom-panelTop+7))+'px');
  });
 }
 const nvReaderOverlayObserver=typeof ResizeObserver==='function'?new ResizeObserver(nvReaderOverlayLayout):null;
 if(nvReaderOverlayObserver){nvReaderOverlayObserver.observe(el('.nv-reader-top'));nvReaderOverlayObserver.observe(el('#nv-reader-controls-actions'))}
 window.addEventListener('resize',nvReaderOverlayLayout,{passive:true});
 window.visualViewport?.addEventListener('resize',nvReaderOverlayLayout,{passive:true});
 nvReaderOverlayLayout();
 const nvPdfSync=()=>scroller.classList.toggle('nv-pdf-mode',!pdfStage.hidden);const nvPdfObserver=new MutationObserver(nvPdfSync);nvPdfObserver.observe(pdfStage,{attributes:true,attributeFilter:['hidden']});nvPdfSync();
 el('#nv-reader-title').textContent=book?.title||'Your reading desk';el('#nv-reader-author').textContent=book?.author||'Your personal library';el('#nv-reader-official').href=official;el('#nv-reader-theme').value=prefs.theme;el('#nv-reader-width').value=String(prefs.width);el('#nv-reader-leading').value=String(prefs.leading);el('#nv-reader-font').value=prefs.font;el('#nv-reader-speed').value=String(prefs.speed);el('#nv211-paragraph-spacing').value=String(prefs.paragraphGap); const iaStage=el('#nv-ia-stage'),googleStage=el('#nv-google-stage');
 let nvSmartScanIdentifier='',nvReaderIntent=0;
 function nvReaderIntegrity(message='',status='ok'){const node=el('#nv-reader-integrity');node.textContent=(status==='ok'?'✓  ':status==='unverified'?'ⓘ  ':'!  ')+message;node.className='nv-reader-integrity'+(status==='unverified'?' nv-unverified':status==='incomplete'?' nv-incomplete':'');node.hidden=!message;}
 function savePrefs(){putLocal('reader-prefs',prefs)}
 function setTheme(){scroller.className='nv-reader-scroller '+prefs.theme;panel.dataset.readerTheme=prefs.theme;nvPdfSync();if(rendition){rendition.themes.register('novella-paper',{'body':{'background':'#f7f2eb!important','color':'#2b3445!important','font-family':({serif:'Georgia,serif',sans:'Arial,Helvetica,sans-serif',mono:'Consolas,monospace',ease:'Verdana,Tahoma,Arial,sans-serif'}[prefs.font]||'Georgia,serif')+'!important'}});rendition.themes.register('novella-white',{'body':{'background':'#edf4fb!important','color':'#23364b!important'}});rendition.themes.register('novella-night',{'body':{'background':'#172432!important','color':'#f1eff5!important'}});rendition.themes.register('novella-contrast',{'body':{'background':'#000!important','color':'#fff!important','font-family':'Arial,Helvetica,sans-serif!important'}});rendition.themes.select('novella-'+prefs.theme)}savePrefs()}
 function setFont(){const faces={serif:"Georgia,'Times New Roman',serif",sans:"Arial,Helvetica,sans-serif",mono:"ui-monospace,Consolas,'Liberation Mono',monospace",ease:"Verdana,Tahoma,Arial,sans-serif"};panel.style.setProperty('--nv-reader-font',faces[prefs.font]||faces.serif);panel.classList.toggle('nv211-easy-font',prefs.font==='ease');textEl.style.fontSize=prefs.size+'px';el('#nv-reader-font-size').textContent=prefs.size+'px';try{rendition?.themes.font(faces[prefs.font]||faces.serif);rendition?.themes.fontSize(prefs.size+'px')}catch{}savePrefs()}
 function nvReaderLayout(){panel.style.setProperty('--nv-reader-column',prefs.width+'px');panel.style.setProperty('--nv-reader-leading',String(prefs.leading));panel.style.setProperty('--nv211-paragraph-gap',String(prefs.paragraphGap)+'em');savePrefs()}
 function setProgress(f){const percent=Math.round(Math.max(0,Math.min(1,f))*100);meter.style.width=percent+'%';const remaining=nvReaderTotalWords>0&&fileMode==='text'?Math.ceil((nvReaderTotalWords*(1-percent/100))/prefs.speed):0;label.textContent=percent+'% read'+(remaining>0?' · ~'+remaining+' min left':'')}
 // Imported only when a user opens a PDF; regular Novella page load stays fast.
 async function nvLoadPdfLibrary(){
  if(window.nvPdfJsLib?.getDocument)return window.nvPdfJsLib;
  if(!window.nvPdfJsLoading)window.nvPdfJsLoading=import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.min.mjs')
   .then(lib=>{lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs';window.nvPdfJsLib=lib;return lib})
   .catch(e=>{window.nvPdfJsLoading=null;throw e});
  return window.nvPdfJsLoading;
 }
 function disposePdf(){pdfRenderTicket++;try{pdfRenderJob?.cancel()}catch{}pdfRenderJob=null;try{pdfDocument?.destroy()}catch{}pdfDocument=null}

 function nv205ReaderState(patch,urgent=false){
  if(!nvMember()||me.id!==nvReaderOwner||!nvReaderEdition)return;
  nvReaderState=nv205Stage(bookId,nvReaderEdition,patch,urgent)||nvReaderState;
 }
 function nv205ReaderPosition(){
  if(fileMode==='pdf')return pdfDocument?nv205Clamp((pdfPageNumber-1)/Math.max(1,pdfDocument.numPages-1)):0;
  if(fileMode==='epub')return nv205Clamp(lastTextPercent);
  return nv205Clamp(scroller.scrollTop/Math.max(1,scroller.scrollHeight-scroller.clientHeight));
 }
 function nv205EditionFor(file,integrity){
  const fmt=/\.pdf$/i.test(file.name)||file.type==='application/pdf'?'pdf':/\.epub$/i.test(file.name)||file.type==='application/epub+zip'?'epub':'text';
  if(known&&integrity?.source==='gutenberg')return {edition:'gutenberg:'+fmt,format:fmt};
  return {edition:('file:'+fmt+':'+file.name.slice(0,85)+':'+file.size).slice(0,200),format:fmt};
 }
 async function nv205ReaderRestore(){
  if(!nvMember()||me.id!==nvReaderOwner||!nvReaderCloudLoading)return null;
  try{return await Promise.race([nvReaderCloudLoading,new Promise(resolve=>setTimeout(()=>resolve(nv205LocalGet(me.id,bookId,nvReaderEdition)),2300))])}catch{return null}
 }
 async function nv205JumpBookmark(){
  if(!nvRequireMember('view your bookmark'))return;
  const state=nv205LocalGet(me.id,bookId,nvReaderEdition)||nvReaderState;
  if(state?.bookmark_progress==null){notify('No bookmark saved for this edition yet.');return}
  const p=state.bookmark_progress;
  if(fileMode==='text')scroller.scrollTop=p*Math.max(0,scroller.scrollHeight-scroller.clientHeight);
  else if(fileMode==='epub'&&rendition){try{await rendition.display(state.bookmark_locator||undefined)}catch{notify('Bookmark location could not be opened.')}}
  else if(fileMode==='pdf'){const input=panel.querySelector('.nv-pdf-page');if(input){input.value=String(Math.max(1,Math.round(Number(state.bookmark_locator)||1)));input.dispatchEvent(new Event('change',{bubbles:true}))}}
  else notify('Open the bookmarked file to return to it.');
 }


 // Highlights use stable paragraph anchors within an edition, not a percentage
 // of scroll height. Embedded PDF/EPUB readers retain their own annotations UI.
 let nv206Selected=null,nv206Editing=null,nv206Color='lavender';
 const nv206TextParagraphs=()=>Array.from(textEl.querySelectorAll('.nv-reader-chapter-body p, #nv-reader-text > p'));
 function nv206SelectionCapture(){
  if(fileMode!=='text'||textEl.hidden)return;
  const selection=window.getSelection();if(!selection||selection.isCollapsed)return;
  const range=selection.getRangeAt(0),start=range.startContainer?.parentElement?.closest('p'),end=range.endContainer?.parentElement?.closest('p');
  if(!start||!textEl.contains(start)||end!==start)return;
  const quote=range.toString();if(!quote.trim()||quote.length>500)return;
  const paragraphs=nv206TextParagraphs(),index=paragraphs.indexOf(start);if(index<0)return;
  const before=document.createRange();before.selectNodeContents(start);
  try{before.setEnd(range.startContainer,range.startOffset)}catch{return}
  const leading=quote.length-quote.trimStart().length;
  nv206Selected={quote:quote.trim(),paragraph_index:index,start_offset:before.toString().length+leading};
  el('#nv206-selection-bar').hidden=false;
 }
 function nv206ClearSelection(){el('#nv206-selection-bar').hidden=true;try{window.getSelection()?.removeAllRanges()}catch{}}
 function nv206SetColor(color){nv206Color=nv206Colors.includes(color)?color:'lavender';el('#nv206-panel').querySelectorAll('[data-nv206-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.nv206Color===nv206Color)))}
 function nv206RefreshPanel(){
  if(!panel.isConnected)return;const items=nvMember()?nv206Rows(me.id,bookId,nvReaderEdition):[];
  const holder=el('#nv206-list');holder.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='nv206-hint';p.textContent='No notes yet. Highlight a sentence or add a note above.';holder.append(p)}
  for(const row of items){const item=document.createElement('article');item.className='nv206-item';item.dataset.color=row.color;
   if(row.quote){const quote=document.createElement('blockquote');quote.textContent=row.quote;item.append(quote)}
   if(row.note){const note=document.createElement('p');note.textContent=row.note;item.append(note)}
   const meta=document.createElement('small');meta.textContent=row.quote?'Saved passage':'Book note';item.append(meta);
   const actions=document.createElement('div');actions.className='nv206-item-actions';
   for(const [action,label] of [['jump','Go to',''],['edit','Edit'],['delete','Remove']]){
    const b=document.createElement('button');b.type='button';b.dataset.nv206Action=action;b.dataset.noteId=row.note_id;b.textContent=label;actions.append(b);
   }item.append(actions);holder.append(item);
  }
  el('#nv206-sync-hint').textContent=nv206CloudReady?'Your notes are available to sync across your devices.':'Your notes stay private and are saved on this device.';
 }
 function nv206RefreshPreview(){const p=el('#nv206-preview');p.textContent=nv206Selected?.quote||'';p.hidden=!nv206Selected?.quote;el('#nv206-save').textContent=nv206Editing?'Update note':nv206Selected?.quote?'Save highlight':'Save book note'}
 function nv206Panel(show,keepSelection=false){if(show)nv211Panel(false);
  if(show&&!nvRequireMember('save highlights and notes')){nv206ClearSelection();return}
  if(show&&fileMode!=='text'){notify('Highlights are available for text editions. For EPUB or PDF, use their own reading tools.');nv206ClearSelection();return}
  el('#nv206-panel').hidden=!show;el('#nv206-toggle').setAttribute('aria-expanded',String(show));
  if(show){el('#nv-reader-guide').hidden=true;nvReaderDisplay(false);nvReaderFind(false);nvReaderMore(false);nv206RefreshPreview();nv206RefreshPanel();if(!keepSelection)el('#nv206-note-input').focus()}
  else{nv206ClearSelection();nv206Editing=null;nv206Selected=null;el('#nv206-note-input').value='';nv206RefreshPreview()}
 }
 function nv206TextRange(paragraph,start,length){
  const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);const parts=[];let node,pos=0;
  while(node=walker.nextNode()){const next=pos+node.nodeValue.length;parts.push({node,a:pos,b:next});pos=next}
  const left=parts.find(x=>x.b>start),right=parts.find(x=>x.b>=start+length);
  if(!left||!right)return null;const r=document.createRange();r.setStart(left.node,start-left.a);r.setEnd(right.node,start+length-right.a);return r;
 }
 function nv206PaintHighlights(){
  if(fileMode!=='text'||!nvMember())return;
  // Never duplicate highlight markup on a remote refresh or after an edit.
  textEl.querySelectorAll('mark.nv206-mark').forEach(mark=>{mark.replaceWith(...mark.childNodes)});
  const items=nv206Rows(me.id,bookId,nvReaderEdition).filter(r=>r.quote);
  const paragraphs=nv206TextParagraphs(),grouped=new Map();
  for(const row of items){let p=paragraphs[row.paragraph_index],index=row.paragraph_index;
   const oldQuoted=String(row.quote||'');
   const displayQuote=oldQuoted.replace(/(^|[^\p{L}\p{N}_\\])_([^_]{1,900}?)_(?=$|[^\p{L}\p{N}_])/gu,(whole,lead,words)=>words.trim()===words?lead+words:whole);
   const quote=p?.textContent.includes(oldQuoted)?oldQuoted:displayQuote;
   if(!p||!p.textContent.includes(quote)){
    const found=paragraphs.findIndex(x=>x.textContent.includes(quote));if(found<0)continue;p=paragraphs[found];index=found;
   }
   let at=p.textContent.slice(row.start_offset,row.start_offset+quote.length)===quote?row.start_offset:p.textContent.indexOf(quote);
   if(at<0)continue;const list=grouped.get(index)||[];list.push({...row,at,paintLength:quote.length});grouped.set(index,list)
  }
  for(const [index,rows] of grouped){const paragraph=paragraphs[index];let next=Infinity;
   for(const row of rows.sort((a,b)=>b.at-a.at)){
    if(row.at+row.paintLength>next)continue;const range=nv206TextRange(paragraph,row.at,row.paintLength);if(!range)continue;
    try{const mark=document.createElement('mark');mark.className='nv206-mark';mark.dataset.color=row.color;mark.dataset.noteId=row.note_id;mark.setAttribute('tabindex','0');mark.setAttribute('title','Open saved note');try{range.surroundContents(mark)}catch{const contents=range.extractContents();mark.append(contents);range.insertNode(mark)}next=row.at}catch{}
   }
  }
 }
 function nv206JumpTo(row){
  if(fileMode!=='text')return;
  const mark=Array.from(textEl.querySelectorAll('mark.nv206-mark')).find(x=>x.dataset.noteId===row.note_id);
  const p=mark||nv206TextParagraphs()[row.paragraph_index];if(!p){notify('This passage could not be located in this edition.');return}
  scroller.scrollTop=Math.max(0,p.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-scroller.clientHeight*.22);
  p.classList.add('nv-reader-find-hit');setTimeout(()=>{if(p.isConnected)p.classList.remove('nv-reader-find-hit')},1600);
 }
 function nv206OnChange(e){if(!nvMember()||e.detail?.owner!==me.id||e.detail?.book!==bookId||e.detail?.edition!==nvReaderEdition)return;
  nv206PaintHighlights();nv206RefreshPanel()}
 document.addEventListener('nv206-changed',nv206OnChange);
 const nv206CaptureBound=()=>nv206SelectionCapture();
 textEl.addEventListener('mouseup',nv206CaptureBound);textEl.addEventListener('keyup',nv206CaptureBound);
 textEl.addEventListener('touchend',()=>setTimeout(nv206CaptureBound,90),{passive:true});
 el('#nv206-toggle').onclick=()=>nv206Panel(el('#nv206-panel').hidden);
 el('#nv206-close').onclick=()=>nv206Panel(false);
 el('#nv206-highlight-selection').onclick=()=>{if(!nv206Selected){notify('Select a passage first.');return}nv206ClearSelection();nv206Panel(true)};
 el('#nv206-panel').addEventListener('click',e=>{
  const color=e.target.closest('[data-nv206-color]');if(color){nv206SetColor(color.dataset.nv206Color);return}
  const btn=e.target.closest('[data-nv206-action]');if(!btn||!nvMember())return;
  const row=nv206Rows(me.id,bookId,nvReaderEdition).find(r=>r.note_id===btn.dataset.noteId);if(!row)return;
  if(btn.dataset.nv206Action==='jump'){nv206Panel(false);nv206JumpTo(row)}
  else if(btn.dataset.nv206Action==='edit'){nv206Editing=row.note_id;nv206Selected=row.quote?{quote:row.quote,paragraph_index:row.paragraph_index,start_offset:row.start_offset}:null;el('#nv206-note-input').value=row.note;nv206SetColor(row.color);nv206RefreshPreview();el('#nv206-note-input').focus()}
  else if(btn.dataset.nv206Action==='delete'){if(!confirm('Remove this saved highlight or note?'))return;nv206Stage({...row,deleted:true});if(nv206Editing===row.note_id){nv206Editing=null;nv206Selected=null;el('#nv206-note-input').value='';nv206RefreshPreview()}notify('Note removed')}
 });
 el('#nv206-save').onclick=()=>{
  if(!nvRequireMember('save highlights and notes'))return;if(fileMode!=='text')return;
  const note=el('#nv206-note-input').value.trim();if(!note&&!nv206Selected?.quote){notify('Select a passage or write a note first.');return}
  const original=nv206Editing?nv206Rows(me.id,bookId,nvReaderEdition).find(x=>x.note_id===nv206Editing):null;
  let index=nv206Selected?.paragraph_index??original?.paragraph_index;
  if(index==null){const blocks=nv206TextParagraphs();const edge=scroller.getBoundingClientRect().top+scroller.clientHeight*.26;index=Math.max(0,blocks.findIndex(p=>p.getBoundingClientRect().bottom>=edge))}
  const row=nv206Stage({...original,note_id:original?.note_id||nv206Uuid(),book_key:bookId,edition_key:nvReaderEdition,
   title:book?.title||el('#nv-reader-title').textContent||'Local edition',author:book?.author||el('#nv-reader-author').textContent||'',
   quote:nv206Selected?.quote||'',note,paragraph_index:index,start_offset:nv206Selected?.start_offset||0,color:nv206Color,deleted:false});
  if(!row)return;nv206Editing=null;nv206Selected=null;el('#nv206-note-input').value='';nv206RefreshPreview();nv206ClearSelection();nv206PaintHighlights();nv206RefreshPanel();notify('Saved to your highlights and notes');
 };
 textEl.addEventListener('click',e=>{const mark=e.target.closest('mark.nv206-mark');if(!mark)return;const row=nv206Rows(me?.id,bookId,nvReaderEdition).find(x=>x.note_id===mark.dataset.noteId);if(!row)return;nv206Panel(true);nv206Editing=row.note_id;nv206Selected=row.quote?{quote:row.quote,paragraph_index:row.paragraph_index,start_offset:row.start_offset}:null;el('#nv206-note-input').value=row.note;nv206SetColor(row.color);nv206RefreshPreview()});
 textEl.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('mark.nv206-mark')){e.preventDefault();e.target.click()}});

 function nvFlushTextPosition(){if(nvMember()&&fileMode==='text')try{const f=scroller.scrollTop/Math.max(1,scroller.scrollHeight-scroller.clientHeight);localStorage.setItem(progressKey,String(Math.max(0,Math.min(1,f))));nv205ReaderState({format:'text',progress:f},true)}catch{}}
 function close(){nv211Stop('');clearTimeout(nv212VoicesTimer);try{window.speechSynthesis?.removeEventListener?.('voiceschanged',nv211VoiceHandler)}catch{};nvReaderOverlayObserver?.disconnect();window.removeEventListener('resize',nvReaderOverlayLayout);window.visualViewport?.removeEventListener('resize',nvReaderOverlayLayout);cancelAnimationFrame(nvReaderOverlayFrame);document.removeEventListener('nv206-changed',nv206OnChange);nvFlushTextPosition();clearTimeout(nvProgressTimer);clearTimeout(nvReaderFindTimer);nvReaderIntent++;nvPdfObserver.disconnect();disposePdf();document.removeEventListener('keydown',escapeListener);document.removeEventListener('pointerdown',nv215ReaderOutside,true);document.body.style.overflow=oldOverflow;try{rendition?.destroy()}catch{}try{epubBook?.destroy()}catch{}iaStage.replaceChildren();googleStage.replaceChildren();pdfStage.replaceChildren();if(pdfObjectUrl){URL.revokeObjectURL(pdfObjectUrl);pdfObjectUrl=null}panel.remove();document.body.classList.remove('nv-reader-open');openReaderPanel=null;nvRefreshBackToTop();try{if(nv211PreviousFocus?.isConnected)nv211PreviousFocus.focus({preventScroll:true})}catch{}}
 function escapeListener(e){if(e.key==='Escape'){e.preventDefault();if(!el('#nv211-listen-panel').hidden){nv211Panel(false);return}if(!el('#nv206-panel').hidden){nv206Panel(false);return}if(!el('#nv-reader-find-panel').hidden){nvReaderFind(false);return}if(!el('#nv-reader-display-panel').hidden){nvReaderDisplay(false);return}if(!el('#nv-reader-guide').hidden){el('#nv-reader-guide').hidden=true;return}if(!el('#nv-reader-extra').hidden){nvReaderMore(false);return}close()}else if(['ArrowRight','ArrowLeft'].includes(e.key)&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.target.closest('button,input,select,textarea,[contenteditable]')&&fileMode==='text'){e.preventDefault();el(e.key==='ArrowRight'?'#nv-reader-next':'#nv-reader-prev').click()}}
 // Novella 2.1.1: speech is opt-in, local to this reader, and never sent to Novella servers.
 const nv211SpeechAvailable=typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance==='function';
 const nv211SpeechPrefs=Object.assign({rate:1,voice:'',follow:true},getLocal('reader-narration-prefs',{}));
 if(![.75,.9,1,1.15,1.3,1.5].includes(Number(nv211SpeechPrefs.rate)))nv211SpeechPrefs.rate=1;
 const nv211VoiceInput=el('#nv211-listen-voice'),nv211RateInput=el('#nv211-listen-rate'),nv211FollowInput=el('#nv211-listen-follow');
 const nv213VoiceSearch=el('#nv213-voice-search'),nv213VoiceEnglish=el('#nv213-voice-english'),nv213VoiceLocal=el('#nv213-voice-local'),nv213VoiceCount=el('#nv213-voice-count');
 nv211RateInput.value=String(nv211SpeechPrefs.rate);nv211FollowInput.checked=nv211SpeechPrefs.follow!==false;
 const nv211Speech={active:false,paused:false,run:0,paragraphs:[],index:0,segments:[],segment:0,highlight:null,needsNext:false,attemptedFallback:false,utterance:null,startTimer:null,nextTimer:null};
 const nv212VoiceButton=el('#nv212-test-voice'),nv212RefreshButton=el('#nv212-refresh-voices');
 let nv212PreviewRun=0,nv212PreviewTimer=null,nv212VoicesTimer=null;
 const nv212VoiceKey=voice=>String(voice.voiceURI||voice.name+'|'+voice.lang);
 const nv212VoiceList=()=>{try{return [...(window.speechSynthesis.getVoices()||[])]}catch{return []}};
 function nv211Status(message){const status=el('#nv211-listen-status');if(status)status.textContent=message}
 function nv211PaintControls(){const button=el('#nv211-listen-play');button.textContent=nv211Speech.active?(nv211Speech.paused?'▶ Resume':'Ⅱ Pause'):'▶ Play';button.disabled=!nv211SpeechAvailable||fileMode!=='text';el('#nv211-listen-restart').disabled=!nv211SpeechAvailable||fileMode!=='text';el('#nv211-listen-stop').disabled=!nv211Speech.active;nv212VoiceButton.disabled=!nv211SpeechAvailable;nv212RefreshButton.disabled=!nv211SpeechAvailable;}
 function nv211Voices(){
  if(!nv211SpeechAvailable)return;
  const selected=nv211VoiceInput.value||nv211SpeechPrefs.voice||'';
  const voices=nv212VoiceList();
  const query=nv213VoiceSearch.value.trim().toLocaleLowerCase();
  const englishOnly=nv213VoiceEnglish.checked,localOnly=nv213VoiceLocal.checked;
  const ordered=voices.map((voice,index)=>({voice,index})).sort((a,b)=>{
   const english=v=>/^en(?:-|$)/i.test(v.lang||'')?0:1;
   return english(a.voice)-english(b.voice)||Number(b.voice.localService===true)-Number(a.voice.localService===true)||a.index-b.index;
  });
  const matching=ordered.filter(({voice})=>(!englishOnly||/^en(?:-|$)/i.test(voice.lang||''))&&(!localOnly||voice.localService===true)&&(!query||(voice.name+' '+voice.lang+' '+voice.voiceURI).toLocaleLowerCase().includes(query)));
  const selectedVoice=voices.find(v=>nv212VoiceKey(v)===selected);
  nv211VoiceInput.replaceChildren();
  const def=document.createElement('option');def.value='';def.textContent='Automatic (browser default)';nv211VoiceInput.append(def);
  // Keep an explicitly selected voice available even when search results hide it.
  if(selectedVoice&&!matching.some(({voice})=>nv212VoiceKey(voice)===selected)){
   const option=document.createElement('option');option.value=selected;option.textContent='✓ Selected · '+selectedVoice.name+' ('+selectedVoice.lang+')';nv211VoiceInput.append(option);
  }
  for(const {voice} of matching){const option=document.createElement('option');option.value=nv212VoiceKey(voice);option.textContent=voice.name+' · '+voice.lang+(voice.localService?' · on device':' · may need internet');nv211VoiceInput.append(option)}
  nv211VoiceInput.value=selectedVoice?selected:'';
  nv213VoiceCount.textContent=matching.length+' matching '+(matching.length===1?'voice':'voices')+' · '+voices.length+' available'+(selectedVoice&&!matching.some(({voice})=>nv212VoiceKey(voice)===selected)?' · current selection kept':'')+'.';
  if(!voices.length&&panel.isConnected&&fileMode==='text')nv211Status('No extra voices loaded yet. Try Refresh voices or use Automatic.');
 }
 function nv212VoiceSelection(){return nv212VoiceList().find(v=>nv212VoiceKey(v)===nv211VoiceInput.value)||null}
 function nv212UseVoice(utterance,voice){if(voice)utterance.voice=voice;utterance.lang=voice?.lang||document.documentElement.lang||navigator.language||'en-US'}
 function nv212ClearTimers(){clearTimeout(nv211Speech.startTimer);clearTimeout(nv211Speech.nextTimer);nv211Speech.startTimer=null;nv211Speech.nextTimer=null}
 function nv211ClearSpoken(){if(nv211Speech.highlight){nv211Speech.highlight.classList.remove('nv211-speaking');nv211Speech.highlight=null}}
 function nv212CancelPreview(){nv212PreviewRun++;clearTimeout(nv212PreviewTimer);nv212PreviewTimer=null}
 function nv211Stop(message='Narration stopped.'){
  nv211Speech.run++;nv212ClearTimers();nv212CancelPreview();nv211Speech.active=false;nv211Speech.paused=false;nv211Speech.paragraphs=[];nv211Speech.segments=[];nv211Speech.index=0;nv211Speech.segment=0;nv211Speech.needsNext=false;nv211Speech.attemptedFallback=false;nv211Speech.utterance=null;
  try{if(nv211SpeechAvailable)window.speechSynthesis.cancel()}catch{}
  nv211ClearSpoken();nv211Status(message);nv211PaintControls();
 }
 function nv211Split(text){
  const result=[];let remaining=String(text||'').replace(/\s+/g,' ').trim();
  while(remaining.length>180){let at=remaining.lastIndexOf(' ',180);if(at<75)at=180;result.push(remaining.slice(0,at).trim());remaining=remaining.slice(at).trim()}
  if(remaining)result.push(remaining);return result;
 }
 function nv212SpeechError(error){
  const code=typeof error==='string'?error:(error?.error||error?.message||'');
  if(code==='not-allowed'||code==='audio-busy')return 'Your browser blocked speech or audio is busy. Try Play again.';
  if(code==='language-unavailable'||code==='voice-unavailable'||code==='network')return 'This voice may be missing or require internet. Try a different voice or Automatic.';
  return 'This voice could not speak on this device. Try Automatic or Test voice.';
 }
 function nv211NarrateNext(run){
  if(!panel.isConnected||!nv211Speech.active||run!==nv211Speech.run||nv211Speech.paused)return;
  nv212ClearTimers();
  while(nv211Speech.index<nv211Speech.paragraphs.length){
   const paragraph=nv211Speech.paragraphs[nv211Speech.index];
   if(!nv211Speech.segments.length){nv211Speech.segments=nv211Split(paragraph.textContent);nv211Speech.segment=0}
   if(nv211Speech.segment>=nv211Speech.segments.length){nv211Speech.index++;nv211Speech.segments=[];continue}
   if(nv211Speech.highlight!==paragraph){nv211ClearSpoken();paragraph.classList.add('nv211-speaking');nv211Speech.highlight=paragraph;
    if(nv211FollowInput.checked&&el('#nv206-panel').hidden&&el('#nv-reader-find-panel').hidden){
     const target=paragraph.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-scroller.clientHeight*.22;
     scroller.scrollTop=Math.max(0,target);
    }
   }
   const utterance=new SpeechSynthesisUtterance(nv211Speech.segments[nv211Speech.segment]);
   const voice=nv211Speech.attemptedFallback?null:nv212VoiceSelection();
   nv212UseVoice(utterance,voice);
   utterance.rate=Number(nv211RateInput.value)||1;
   nv211Speech.utterance=utterance;
   let started=false,finished=false;
   const fallback=error=>{
    if(finished||run!==nv211Speech.run||!nv211Speech.active)return;
    finished=true;nv212ClearTimers();
    if(voice&&!nv211Speech.attemptedFallback){
     // A listed voice can be unusable. Retry this segment once with the system default.
     nv211Speech.attemptedFallback=true;
     nv211VoiceInput.value='';nv211SpeechPrefs.voice='';putLocal('reader-narration-prefs',nv211SpeechPrefs);
     nv211Status('Selected voice failed; trying the browser default.');
     try{window.speechSynthesis.cancel()}catch{}
     nv211Speech.nextTimer=setTimeout(()=>nv211NarrateNext(run),160);
    }else nv211Stop(nv212SpeechError(error));
   };
   utterance.onstart=()=>{if(finished||run!==nv211Speech.run)return;started=true;clearTimeout(nv211Speech.startTimer);nv211Speech.startTimer=null;nv211Status('Speaking paragraph '+(nv211Speech.index+1)+' of '+nv211Speech.paragraphs.length+'.')};
   utterance.onend=()=>{if(finished||run!==nv211Speech.run)return;if(!started){fallback('voice-unavailable');return}finished=true;nv212ClearTimers();nv211Speech.segment++;nv211Speech.attemptedFallback=false;if(nv211Speech.paused){nv211Speech.needsNext=true;return}nv211Speech.nextTimer=setTimeout(()=>nv211NarrateNext(run),50)};
   utterance.onerror=e=>fallback(e);
   nv211Status('Starting narration…');
   try{window.speechSynthesis.speak(utterance);
    nv211Speech.startTimer=setTimeout(()=>{if(!started&&run===nv211Speech.run){try{window.speechSynthesis.cancel()}catch{}fallback('voice-unavailable')}},8500);
   }catch(e){fallback(e)}
   return;
  }
  nv211Stop('Finished reading the available text aloud.');
 }
 function nv211Start(fromHere=true){
  if(!nv211SpeechAvailable){nv211Status('Text-to-speech is unavailable in this browser. Try another browser or use your device’s accessibility reader.');return}
  if(fileMode!=='text'||textEl.hidden){nv211Status('Open a TXT, HTML, or verified complete-text edition to listen.');return}
  nv211Stop('Preparing narration…');
  const paragraphs=nv206TextParagraphs().filter(p=>p.textContent.trim().length>0&&p.getClientRects().length);
  if(!paragraphs.length){nv211Status('No readable paragraphs were found in this edition.');return}
  const viewTop=scroller.getBoundingClientRect().top+Math.min(80,scroller.clientHeight*.15);
  const first=fromHere?paragraphs.findIndex(p=>p.getBoundingClientRect().bottom>viewTop):0;
  nv211Speech.paragraphs=paragraphs;nv211Speech.index=first<0?0:first;nv211Speech.active=true;nv211Speech.paused=false;
  nv211PaintControls();nv211NarrateNext(nv211Speech.run);
 }
 function nv211PauseResume(){
  if(!nv211Speech.active){nv211Start();return}
  try{
   if(nv211Speech.paused){window.speechSynthesis.resume();nv211Speech.paused=false;nv211Status('Narration resumed.');if(nv211Speech.needsNext){nv211Speech.needsNext=false;nv211NarrateNext(nv211Speech.run)}}
   else{window.speechSynthesis.pause();nv211Speech.paused=true;nv211Status('Narration paused.');}
  }catch{nv211Stop('The voice engine could not pause or resume. Press Play to restart.')}nv211PaintControls();
 }
 function nv212TestVoice(){
  if(!nv211SpeechAvailable){nv211Status('This browser does not provide text-to-speech.');return}
  nv211Stop('Testing the chosen voice…');
  const ticket=++nv212PreviewRun;
  const utterance=new SpeechSynthesisUtterance('Welcome to Novella. This is a sample of your selected reading voice.');
  nv212UseVoice(utterance,nv212VoiceSelection());utterance.rate=Number(nv211RateInput.value)||1;
  let started=false,finished=false;
  nv212VoiceButton.disabled=true;
  const finish=message=>{if(finished||ticket!==nv212PreviewRun)return;finished=true;clearTimeout(nv212PreviewTimer);nv212PreviewTimer=null;nv212VoiceButton.disabled=false;nv211Status(message)};
  utterance.onstart=()=>{if(ticket!==nv212PreviewRun)return;started=true;nv211Status('Voice test is speaking…')};
  utterance.onend=()=>finish(started?'✓ Voice test finished. If you did not hear it, try another voice.':'Voice produced no audio. Try Automatic or another voice.');
  utterance.onerror=e=>finish(nv212SpeechError(e));
  try{window.speechSynthesis.speak(utterance);nv212PreviewTimer=setTimeout(()=>{if(!started&&ticket===nv212PreviewRun){try{window.speechSynthesis.cancel()}catch{}finish('This voice did not start. Try Automatic or another voice.')}},8500)}catch(e){finish(nv212SpeechError(e))}
 }
 function nv211Panel(show){
  const node=el('#nv211-listen-panel');node.hidden=!show;el('#nv211-listen-toggle').setAttribute('aria-expanded',String(show));
  if(show){nv206Panel(false);el('#nv-reader-guide').hidden=true;nvReaderDisplay(false);nvReaderFind(false);nvReaderMore(false);nv211Voices();nv211PaintControls();if(!nv211SpeechAvailable)nv211Status('Narration is not supported in this browser.');else if(fileMode!=='text')nv211Status('Open a TXT, HTML, or verified text edition to listen.');nv211RateInput.focus()}
 }
 el('#nv211-listen-toggle').onclick=()=>nv211Panel(el('#nv211-listen-panel').hidden);
 el('#nv211-listen-close').onclick=()=>nv211Panel(false);
 el('#nv211-listen-play').onclick=nv211PauseResume;
 el('#nv211-listen-restart').onclick=()=>nv211Start(true);
 el('#nv211-listen-stop').onclick=()=>nv211Stop();
 nv213VoiceSearch.addEventListener('input',nv211Voices);
 nv213VoiceEnglish.addEventListener('change',nv211Voices);
 nv213VoiceLocal.addEventListener('change',nv211Voices);
 el('#nv213-voice-clear').addEventListener('click',()=>{nv213VoiceSearch.value='';nv213VoiceEnglish.checked=false;nv213VoiceLocal.checked=false;nv211Voices();nv213VoiceSearch.focus()});
 nv213VoiceSearch.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();if(nv213VoiceSearch.value){e.preventDefault();nv213VoiceSearch.value='';nv211Voices()}}});
 nv212VoiceButton.onclick=nv212TestVoice;
 nv212RefreshButton.onclick=()=>{nv211Voices();const count=nv212VoiceList().length;nv211Status(count?count+' browser voices found. Select one and use Test voice to check it.':'No extra voices available yet. Try the device default or your operating system voice settings.')};
 nv211RateInput.onchange=()=>{nv211SpeechPrefs.rate=Number(nv211RateInput.value)||1;putLocal('reader-narration-prefs',nv211SpeechPrefs);if(nv211Speech.active)nv211Start(true)};
 nv211VoiceInput.onchange=()=>{nv211SpeechPrefs.voice=nv211VoiceInput.value;putLocal('reader-narration-prefs',nv211SpeechPrefs);if(nv211Speech.active)nv211Start(true);else nv211Status('Use Test voice to check that this voice works on your device.')};
 nv211FollowInput.onchange=()=>{nv211SpeechPrefs.follow=nv211FollowInput.checked;putLocal('reader-narration-prefs',nv211SpeechPrefs)};
 const nv211VoiceHandler=()=>{if(panel.isConnected)nv211Voices()};
 try{if(nv211SpeechAvailable){window.speechSynthesis.addEventListener?.('voiceschanged',nv211VoiceHandler);nv211Voices();nv212VoicesTimer=setTimeout(()=>{if(panel.isConnected)nv211Voices()},950)}}catch{}
 nv211PaintControls();
 el('#nv211-skip-text').onclick=()=>{nvReaderMore(false);if(fileMode==='text'&&!textEl.hidden){textEl.scrollIntoView({block:'start',behavior:'instant'});scroller.focus({preventScroll:true})}else notify('Open a text book first.')};
 function nvReaderDisplay(show){if(show){nv211Panel(false);nv206Panel(false);el('#nv-reader-guide').hidden=true}const dlg=el('#nv-reader-display-panel'),btn=el('#nv-reader-display-toggle');dlg.hidden=!show;btn.setAttribute('aria-expanded',String(show));if(show){nvReaderMore(false);nvReaderFind(false)}}
 function nvReaderMore(show){if(show){nv211Panel(false);nv206Panel(false);el('#nv-reader-guide').hidden=true}const extra=el('#nv-reader-extra'),btn=el('#nv-reader-more-toggle');extra.hidden=!show;btn.setAttribute('aria-expanded',String(show));if(show){nvReaderDisplay(false);nvReaderFind(false)}}
 // Clicking empty reading space dismisses only *temporary* reader panels.
 // Real reading, highlighting, page controls, unsaved note text and narration state stay intact.
 function nv215ReaderOutside(event){
  if(!panel.isConnected||!panel.contains(event.target))return;
  const target=event.target;
  if(!(target instanceof Element))return;
  const layers=[
   ['#nv211-listen-panel',()=>nv211Panel(false),'#nv211-listen-toggle'],
   ['#nv206-panel',()=>nv206Panel(false),'#nv206-toggle, #nv206-highlight-selection'],
   ['#nv-reader-find-panel',()=>nvReaderFind(false),'#nv-reader-find-toggle'],
   ['#nv-reader-display-panel',()=>nvReaderDisplay(false),'#nv-reader-display-toggle'],
   ['#nv-reader-guide',()=>{el('#nv-reader-guide').hidden=true},'#nv-reader-help, #nv-reader-mobile-help'],
   ['#nv-reader-extra',()=>nvReaderMore(false),'#nv-reader-more-toggle']
  ];
  for(const [selector,hide,trigger] of layers){
   const layer=el(selector);
   if(layer&& !layer.hidden && !layer.contains(target) && !target.closest(trigger))hide();
  }
 }
 document.addEventListener('pointerdown',nv215ReaderOutside,true);
 document.addEventListener('keydown',escapeListener);el('#nv-reader-close').onclick=close;el('#nv-reader-help').onclick=()=>{const info=el('#nv-reader-guide'),show=info.hidden;if(show){nv211Panel(false);nv206Panel(false);nvReaderFind(false);nvReaderDisplay(false);nvReaderMore(false)}info.hidden=!show;};
 el('#nv-reader-display-toggle').onclick=()=>nvReaderDisplay(el('#nv-reader-display-panel').hidden);
 el('#nv-reader-display-close').onclick=()=>nvReaderDisplay(false);
 el('#nv-reader-more-toggle').onclick=()=>nvReaderMore(el('#nv-reader-extra').hidden);
 el('#nv-reader-mobile-help').onclick=()=>{nv211Panel(false);nvReaderMore(false);nv206Panel(false);nvReaderFind(false);nvReaderDisplay(false);el('#nv-reader-guide').hidden=false};
 function nvReaderFind(show){
  if(show&&fileMode!=='text'){notify('Find is available for text editions. PDF and EPUB viewers use their own search tools.');return}
  const dlg=el('#nv-reader-find-panel'),btn=el('#nv-reader-find-toggle');dlg.hidden=!show;btn.setAttribute('aria-expanded',String(show));
  if(show){nv211Panel(false);nv206Panel(false);el('#nv-reader-guide').hidden=true;nvReaderDisplay(false);nvReaderMore(false);el('#nv-reader-find-input').focus()}
  else{clearTimeout(nvReaderFindTimer);if(nvReaderFindLast){nvReaderFindLast.classList.remove('nv-reader-find-hit');nvReaderFindLast=null}}
 }
 function nvReaderFindSearch(){
  const query=el('#nv-reader-find-input').value.toLocaleLowerCase().trim(),holder=el('#nv-reader-find-results'),status=el('#nv-reader-find-status');
  nvReaderFindMatches=[];holder.replaceChildren();
  if(query.length<2){status.textContent='Enter at least two characters to find passages.';return}
  const paragraphs=textEl.querySelectorAll('.nv-reader-chapter-body p, #nv-reader-text > p');
  let total=0;
  for(const item of paragraphs){
   const text=String(item.textContent||''),at=text.toLocaleLowerCase().indexOf(query);
   if(at<0)continue;
   total++;
   if(nvReaderFindMatches.length>=24)continue;
   const from=Math.max(0,at-55),to=Math.min(text.length,at+query.length+85);
   nvReaderFindMatches.push(item);
   const button=document.createElement('button');button.type='button';button.dataset.match=String(nvReaderFindMatches.length-1);
   button.textContent=(from?'…':'')+text.slice(from,to).replace(/\s+/g,' ').trim()+(to<text.length?'…':'');
   holder.append(button);
  }
  status.textContent=total?total+' matching paragraph'+(total===1?'':'s')+(total>24?' · showing first 24':''):'No matches found in this text.';
 }
 el('#nv-reader-find-toggle').onclick=()=>nvReaderFind(el('#nv-reader-find-panel').hidden);
 el('#nv-reader-find-close').onclick=()=>nvReaderFind(false);
 el('#nv-reader-find-input').addEventListener('input',()=>{clearTimeout(nvReaderFindTimer);nvReaderFindTimer=setTimeout(nvReaderFindSearch,120)});
 el('#nv-reader-find-results').addEventListener('click',e=>{
  const button=e.target.closest('button[data-match]');if(!button)return;
  const target=nvReaderFindMatches[Number(button.dataset.match)];if(!target||!target.isConnected)return;
  if(nvReaderFindLast)nvReaderFindLast.classList.remove('nv-reader-find-hit');
  nvReaderFindLast=target;target.classList.add('nv-reader-find-hit');
  scroller.scrollTop=Math.max(0,target.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-Math.min(100,scroller.clientHeight*.2));
  nvReaderFind(false);target.classList.add('nv-reader-find-hit');nvReaderFindLast=target;
 });
 el('#nv-reader-focus').onclick=()=>{
  const active=panel.classList.toggle('nv-focus-active'),btn=el('#nv-reader-focus');
  btn.setAttribute('aria-pressed',String(active));btn.title=active?'Exit distraction-free reading':'Distraction-free reading';btn.setAttribute('aria-label',active?'Exit distraction-free reading':'Enter distraction-free reading');
  btn.querySelector('span').textContent=active?'Exit focus':'Focus';
  if(active){nv211Panel(false);nv206Panel(false);el('#nv-reader-guide').hidden=true;nvReaderDisplay(false);nvReaderFind(false);nvReaderMore(false)}
 };

 el('#nv-reader-width').onchange=e=>{prefs.width=Number(e.target.value)||760;nvReaderLayout()};
 el('#nv-reader-leading').onchange=e=>{prefs.leading=Number(e.target.value)||1.9;nvReaderLayout()};
 el('#nv211-paragraph-spacing').onchange=e=>{prefs.paragraphGap=Number(e.target.value)||1.25;nvReaderLayout()};
 el('#nv-reader-font').onchange=e=>{prefs.font=e.target.value;setFont()};
 el('#nv-reader-speed').onchange=e=>{prefs.speed=Number(e.target.value)||220;savePrefs();setProgress(lastTextPercent)};
 nvReaderLayout();setTheme();setFont();
 el('#nv-reader-scroll-top').onclick=()=>{scroller.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})};
 el('#nv-reader-upload').onclick=()=>el('#nv-reader-file').click();el('#nv-reader-quickupload').onclick=()=>el('#nv-reader-file').click();el('#nv-reader-guide-close').onclick=()=>el('#nv-reader-guide').hidden=true;
 el('#nv-reader-theme').onchange=e=>{prefs.theme=e.target.value;setTheme()};
 el('#nv-reader-minus').onclick=()=>{prefs.size=Math.max(14,prefs.size-1);setFont()};
 el('#nv-reader-plus').onclick=()=>{prefs.size=Math.min(30,prefs.size+1);setFont()};
 el('#nv-reader-mark').onclick=()=>{if(!nvRequireMember('save reading bookmarks'))return;if(fileMode==='iframe'){notify('Use the embedded reader’s own bookmark controls');return}if(['none','loading'].includes(fileMode)){notify('Open a book first to save a bookmark');return}
  const position=nv205ReaderPosition(),locator=fileMode==='epub'?bookProgress:fileMode==='pdf'?String(pdfPageNumber):'';
  try{localStorage.setItem(progressKey,fileMode==='epub'?bookProgress:fileMode==='pdf'?String(pdfPageNumber):String(position))}catch{}
  nv205ReaderState({format:fileMode,progress:position,locator,bookmark_progress:position,bookmark_locator:locator},true);notify('Bookmark saved · '+(navigator.onLine?'syncing to your account':'will sync when online'))};
 el('#nv205-jump-bookmark').onclick=nv205JumpBookmark;
 if(el('#nv-reader-finish'))el('#nv-reader-finish').onclick=async()=>{if(!nvRequireMember('save finished books'))return;try{if(!shelves.some(r=>r.book_key===bookId))await save(book);await changeStatus(bookId,'read');notify('Marked as finished · saving to your account')}catch{notify('Could not update your shelf')}};
 scroller.addEventListener('scroll',()=>{if(fileMode!=='text'||nvProgressTimer)return;
  // Avoid a DOM walk and localStorage write on every pixel of a long book scroll.
  nvProgressTimer=setTimeout(()=>{nvProgressTimer=null;if(!panel.isConnected||fileMode!=='text')return;
   lastTextPercent=scroller.scrollTop/Math.max(1,scroller.scrollHeight-scroller.clientHeight);setProgress(lastTextPercent);
   const chapter=nvReaderCurrentChapter();if(chapter>=0){const option=el('#nv-reader-chapters');if(option.value!=='text-'+chapter)option.value='text-'+chapter}
   if(nvMember()&&Date.now()-nvLastProgressStored>1200){nvLastProgressStored=Date.now();try{localStorage.setItem(progressKey,String(lastTextPercent))}catch{}nv205ReaderState({format:'text',progress:lastTextPercent})}
  },90)},{passive:true});
 function nvReaderTextChapters(){return Array.from(textEl.querySelectorAll('.nv-text-section[data-reader-chapter]'))}
 function nvReaderCurrentChapter(){const chapters=nvReaderTextChapters();if(!chapters.length)return -1;const edge=scroller.getBoundingClientRect().top+Math.min(60,scroller.clientHeight*.15);let current=0;chapters.forEach((part,i)=>{if(part.getBoundingClientRect().top<=edge)current=i});return current}
 function nvReaderGoToChapter(chapter){
  if(!chapter)return;
  if(nv211Speech.active)nv211Stop('Chapter changed. Press Play to listen from here.');
  const target=chapter.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-28;
  // Jump immediately: long Gutenberg chapters can take several seconds to smooth-scroll.
  scroller.scrollTop=Math.max(0,target);
  const index=chapter.dataset.readerChapter;
  if(index!==undefined)el('#nv-reader-chapters').value='text-'+index;
 }
 function nvReaderNavigatePages(delta){if(rendition){if(nv211Speech.active)nv211Stop();void (delta>0?rendition.next():rendition.prev());return}if(fileMode==='text'&&nvReaderTextChapters().length){const chapters=nvReaderTextChapters(),here=nvReaderCurrentChapter();const next=Math.min(chapters.length-1,Math.max(0,here+delta));if(next!==here)nvReaderGoToChapter(chapters[next]);else if(delta<0&&here===0)scroller.scrollTo({top:0,behavior:'smooth'});return}scroller.scrollBy({top:delta*scroller.clientHeight*.85,behavior:'smooth'})}
 el('#nv-reader-prev').onclick=()=>nvReaderNavigatePages(-1);
 el('#nv-reader-next').onclick=()=>nvReaderNavigatePages(1);
 el('#nv-reader-chapters').onchange=e=>{if(nv211Speech.active)nv211Stop('Chapter changed. Press Play to listen from here.');if(rendition)rendition.display(e.target.value).catch(()=>notify('Chapter could not be opened'));else if(e.target.value.startsWith('text-')){nvReaderGoToChapter(panel.querySelector('#nv-text-chapter-'+e.target.value.slice(5)));}};
 el('#nv-reader-jump-end').onclick=()=>{if(rendition){const last=epubBook?.spine?.last?.();if(last)rendition.display(last.href||last).catch(()=>notify('Last chapter could not be opened'));}
  else if(fileMode==='text'){const chapters=nvReaderTextChapters();if(chapters.length)nvReaderGoToChapter(chapters[chapters.length-1]);else scroller.scrollTo({top:scroller.scrollHeight,behavior:'smooth'})}};
 async function loadScript(src,check){if(check())return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>reject(Error('Reader library could not load'));document.head.append(script)});if(!check())throw Error('Reader library unavailable')}
 async function openFileInReader(file,integrity=null){
  if(!file||!panel.isConnected)return;
  nv211Stop('Open a text edition to listen.');nv211Panel(false);
  nvFlushTextPosition();clearTimeout(nvProgressTimer);nvProgressTimer=null;
  const intent=++nvReaderIntent;
  googleStage.hidden=true;googleStage.replaceChildren();setEmbedControls(false);nvReaderFind(false);nv206Panel(false);nvReaderTotalWords=0;
  // Resume positions are private to this Novella account and this exact file, not every edition of the same book.
  progressKey=KEY+'progress:'+(me?.id||'guest')+':'+bookId+':'+file.name.slice(0,120)+':'+file.size;
  const nv205Edition=nv205EditionFor(file,integrity);nvReaderEdition=nv205Edition.edition;nvReaderOwner=nvMember()?me.id:'';nv206Editing=null;nv206Selected=null;nvReaderState=nvMember()?nv205LocalGet(me.id,bookId,nvReaderEdition):null;
  nvReaderCloudLoading=nvMember()?nv205GetState(bookId,nvReaderEdition):Promise.resolve(null);nvReaderVerified=!!integrity?.complete;
  nv205ReaderIndicator(nvMember()?'loading':'guest');
  const pdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
  if(file.size>(pdf?75:25)*1024*1024){notify('Please choose a '+(pdf?'PDF under 75 MB':'book file under 25 MB'));return}
  try{rendition?.destroy();epubBook?.destroy()}catch{}rendition=null;epubBook=null;disposePdf();pdfStage.replaceChildren();pdfStage.hidden=true;if(pdfObjectUrl){URL.revokeObjectURL(pdfObjectUrl);pdfObjectUrl=null}
  el('#nv-reader-welcome').hidden=true;textEl.hidden=true;stage.hidden=true;pdfStage.hidden=true;iaStage.hidden=true;iaStage.replaceChildren();googleStage.hidden=true;googleStage.replaceChildren();el('#nv-reader-bottom').hidden=true;
  const chapterSelect=el('#nv-reader-chapters');chapterSelect.replaceChildren();chapterSelect.hidden=true;
   el('#nv-reader-prev').textContent='← Previous';el('#nv-reader-next').textContent='Next →';
  nvReaderIntegrity('');setProgress(0);lastTextPercent=0;scroller.scrollTop=0;
  el('#nv-reader-title').textContent=integrity?.title||file.name;fileMode='loading';
  try{
   if(pdf){
     // PDF.js renders the entire supplied file locally, one page at a time.
     // Nothing in a personal book file is sent to Novella or a PDF-processing server.
     const signature=new TextDecoder('ascii').decode(await file.slice(0,5).arrayBuffer());
     if(signature!=='%PDF-')throw Error('This is not a valid PDF file.');
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     pdfObjectUrl=URL.createObjectURL(file);
     const note=document.createElement('div');note.className='nv-pdf-note';
     const description=document.createElement('span');description.textContent='Your private PDF · Read every page of the supplied file.';
     const external=document.createElement('a');external.href=pdfObjectUrl;external.target='_blank';external.rel='noopener noreferrer';external.textContent='Open in another tab ↗';
     note.append(description,external);
     const loader=document.createElement('div');loader.className='nv-pdf-loading';loader.setAttribute('role','status');loader.textContent='Preparing PDF pages…';
     pdfStage.replaceChildren(note,loader);pdfStage.hidden=false;fileMode='pdf';
     el('#nv-reader-welcome').hidden=true;
     nvReaderIntegrity('Local PDF · '+(file.size/1024/1024).toFixed(1)+' MB. All pages in your file can be browsed; completeness of the publisher edition cannot be independently verified.','unverified');
     try{
       const lib=await nvLoadPdfLibrary();
       if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='pdf')return;
       const bytes=new Uint8Array(await file.arrayBuffer());
       if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='pdf')return;
       const task=lib.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false});
       const loaded=await task.promise;
       if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='pdf'){try{loaded.destroy()}catch{}return}
       if(!Number.isInteger(loaded.numPages)||loaded.numPages<1)throw Error('The PDF contains no pages.');
       pdfDocument=loaded;
       if(known)void nvRecordReadingStart(book,nvReaderEdition,'pdf');
       const saved=nvMember()?Number((()=>{try{return localStorage.getItem(progressKey)}catch{return null}})()):0;
       const restored=await nv205ReaderRestore();if(!panel.isConnected||intent!==nvReaderIntent)return;
       const cloudPage=restored?.locator?Number(restored.locator):restored?1+nv205Clamp(restored.progress)*(loaded.numPages-1):NaN;
       pdfPageNumber=Number.isFinite(cloudPage)&&cloudPage>=1?Math.min(loaded.numPages,Math.round(cloudPage)):Number.isFinite(saved)&&saved>=1?Math.min(loaded.numPages,Math.round(saved)):1;
       const nav=document.createElement('div');nav.className='nv-pdf-toolbar';
       nav.innerHTML='<button type="button" class="nv-pdf-prev" aria-label="Previous PDF page">← Previous</button><label>Page <input type="number" class="nv-pdf-page" min="1" step="1" aria-label="Go to PDF page"> <span class="nv-pdf-total"></span></label><button type="button" class="nv-pdf-next" aria-label="Next PDF page">Next →</button><button type="button" class="nv-pdf-zoom-out" aria-label="Zoom out">−</button><button type="button" class="nv-pdf-zoom-in" aria-label="Zoom in">＋</button>';
       const pageWrap=document.createElement('div');pageWrap.className='nv-pdf-page-wrap';
       pdfStage.replaceChildren(note,nav,pageWrap);
       let zoom=1;
       async function showPage(number){
         if(!pdfDocument||!panel.isConnected||fileMode!=='pdf'||intent!==nvReaderIntent)return;
         const ticket=++pdfRenderTicket;
         try{
         try{pdfRenderJob?.cancel()}catch{}pdfRenderJob=null;
         pdfPageNumber=Math.max(1,Math.min(pdfDocument.numPages,Math.round(Number(number)||1)));
         const input=nav.querySelector('.nv-pdf-page');input.max=String(pdfDocument.numPages);input.value=String(pdfPageNumber);
         nav.querySelector('.nv-pdf-total').textContent='of '+pdfDocument.numPages;
         nav.querySelector('.nv-pdf-prev').disabled=pdfPageNumber===1;
         nav.querySelector('.nv-pdf-next').disabled=pdfPageNumber===pdfDocument.numPages;
         const page=await pdfDocument.getPage(pdfPageNumber);
         if(ticket!==pdfRenderTicket||!panel.isConnected||fileMode!=='pdf')return;
         const base=page.getViewport({scale:1});
         const desiredWidth=Math.max(240,Math.min(950,Math.max(240,pdfStage.clientWidth-32)));
         const viewport=page.getViewport({scale:Math.min(3.4,Math.max(.2,desiredWidth/base.width*zoom))});
         const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16777216/(viewport.width*viewport.height)));
         const canvas=document.createElement('canvas');canvas.className='nv-pdf-canvas';
         canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));
         canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
         pageWrap.replaceChildren(canvas);
         pdfRenderJob=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});
         try{await pdfRenderJob.promise}catch(error){if(ticket!==pdfRenderTicket||error?.name==='RenderingCancelledException')return;throw error}
         if(ticket!==pdfRenderTicket||!panel.isConnected||fileMode!=='pdf')return;
         if(nvMember())try{localStorage.setItem(progressKey,String(pdfPageNumber))}catch{}
         nv205ReaderState({format:'pdf',progress:(pdfPageNumber-1)/Math.max(1,pdfDocument.numPages-1),locator:String(pdfPageNumber)});
         setProgress(pdfPageNumber/pdfDocument.numPages);label.textContent='Page '+pdfPageNumber+' of '+pdfDocument.numPages;
         pageWrap.scrollTop=0;pageWrap.scrollLeft=0;
         }catch(error){if(ticket!==pdfRenderTicket||error?.name==='RenderingCancelledException')return;notify('Could not draw this PDF page. Try Open in another tab.')}
       }
       nav.querySelector('.nv-pdf-prev').onclick=()=>showPage(pdfPageNumber-1);
       nav.querySelector('.nv-pdf-next').onclick=()=>showPage(pdfPageNumber+1);
       nav.querySelector('.nv-pdf-zoom-in').onclick=()=>{zoom=Math.min(3,zoom*1.2);showPage(pdfPageNumber)};
       nav.querySelector('.nv-pdf-zoom-out').onclick=()=>{zoom=Math.max(.5,zoom/1.2);showPage(pdfPageNumber)};
       nav.querySelector('.nv-pdf-page').onchange=e=>showPage(e.target.value);
       const onKeys=e=>{if(!panel.isConnected||fileMode!=='pdf'||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;
         if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();showPage(pdfPageNumber+1)}
         if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();showPage(pdfPageNumber-1)}};
       panel.onkeydown=onKeys;
       pdfStage.ontouchstart=e=>{pdfStage.dataset.touchX=String(e.touches[0]?.clientX||0);pdfStage.dataset.touchY=String(e.touches[0]?.clientY||0)};
       pdfStage.ontouchend=e=>{if(!pdfDocument)return;const dx=(e.changedTouches[0]?.clientX||0)-Number(pdfStage.dataset.touchX||0);const dy=(e.changedTouches[0]?.clientY||0)-Number(pdfStage.dataset.touchY||0);if(Math.abs(dx)>90&&Math.abs(dx)>Math.abs(dy)*1.5)showPage(pdfPageNumber+(dx<0?1:-1))};
       // PDF bookmarks remain available while font/theme controls are not relevant to page images.
       setEmbedControls(true);el('#nv-reader-mark').disabled=false;el('#nv-reader-mark').title='Save your current PDF page';
       await showPage(pdfPageNumber);
       return;
     }catch(error){
       if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='pdf')return;
       // Graceful fallback on browsers that cannot load the PDF renderer.
       const warning=document.createElement('p');warning.className='nv-pdf-fallback';warning.textContent='The in-page PDF renderer is unavailable. Try the browser PDF viewer below, or open this file in a new tab.';
       const frame=document.createElement('iframe');frame.src=pdfObjectUrl;frame.title='Your PDF book (browser viewer)';frame.setAttribute('aria-label','PDF document reader');
       pdfStage.replaceChildren(note,warning,frame);setEmbedControls(true);
       nvReaderIntegrity('PDF viewer fallback · The supplied file is private and has not been verified against the publisher edition.','unverified');
       return;
     }
   }
   if(/\.epub$/i.test(file.name)||file.type==='application/epub+zip'){
     stage.hidden=false;stage.textContent='Checking EPUB chapters…';
     await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',()=>!!window.JSZip);
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     const bytes=await file.arrayBuffer();
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     const sections=await nvCheckEpubSpine(bytes);
     await loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',()=>typeof window.ePub==='function');
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     stage.textContent='';epubBook=window.ePub(bytes);rendition=epubBook.renderTo(stage,{width:'100%',height:'100%',flow:'paginated',spread:'none'});
     fileMode='epub';setTheme();setFont();
     rendition.on('relocated',loc=>{if(!panel.isConnected||intent!==nvReaderIntent)return;
      bookProgress=loc.start?.cfi||'';lastTextPercent=nv205Clamp(loc.start?.percentage||0);if(nvMember())try{if(bookProgress)localStorage.setItem(progressKey,bookProgress)}catch{}
      nv205ReaderState({format:'epub',progress:lastTextPercent,locator:bookProgress});setProgress(lastTextPercent);
     });
     const saved=nvMember()?(()=>{try{return localStorage.getItem(progressKey)||undefined}catch{return undefined}})():undefined;
     const restored=await nv205ReaderRestore();if(!panel.isConnected||intent!==nvReaderIntent)return;
     try{await rendition.display(restored?.locator||saved||undefined)}catch{await rendition.display()}
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     try{const nav=await epubBook.loaded.navigation;const sel=chapterSelect;const toc=nav.toc||[];
      function flatten(chapters){for(const item of chapters){const opt=document.createElement('option');opt.value=item.href;opt.textContent=item.label;sel.append(opt);if(item.subitems?.length)flatten(item.subitems)}}flatten(toc);sel.hidden=!sel.options.length;
     }catch{}
     nvReaderIntegrity('EPUB structure checked: '+sections+' readable spine sections. This checks file integrity, not whether the publisher edition includes every part.','ok');
   }else{
     const raw=await file.text();
     if(!panel.isConnected||intent!==nvReaderIntent)return;
     const html=/\.html?$/i.test(file.name)||file.type==='text/html';
     const body=html?nvHtmlToReadableText(raw):raw;
     if(!body.trim())throw Error('This book file contains no readable text');
     // Display only: preserve the source. Reflow hard-wrapped prose, not poetry.
     // Gutenberg often hard-wraps text at ~70 columns; raw <pre> wrapping can look broken.
     // A display-only parsing pass handles Gutenberg italic markers even when
     // the emphasized words wrap across lines or short paragraph boundaries.
     // The original book bytes remain untouched for downloads and offline saving.
     function nv213EncodeBookItalics(value){
      const raw=String(value||'').replace(/\r\n?/g,'\n');
      return raw.replace(/(^|[^\p{L}\p{N}_\\])_([^_]{1,900}?)_(?=$|[^\p{L}\p{N}_])/gu,(match,lead,words)=>{
       if(words!==words.trim()||!words.trim()||words.includes('\uE000')||words.includes('\uE001'))return match;
       if((words.match(/\n\s*\n/g)||[]).length>1)return match;
       return lead+'\uE000'+words+'\uE001';
      });
     }
     const displayBody=nv213EncodeBookItalics(body);
     // Additional protection for narrow Gutenberg emphasis cases that were not
     // recognized by the long-span formatter. Run BEFORE paragraph and chapter
     // splitting so underscores are never emitted as literal reader prose.
     // This only recognizes balanced _word_ / _short phrase_ markers; it does
     // not change technical identifiers like under_score, source files, or URLs.
     function nv214EncodeShortItalics(text){
      return String(text||'').replace(/(^|[^\p{L}\p{N}_\\])_([\p{L}\p{N}][^_\n]{0,180}?)_(?=$|[^\p{L}\p{N}_])/gu,(whole,lead,words)=>{
       if(words!==words.trim()||!words.trim()||/[\uE000\uE001]/.test(words))return whole;
       return lead+'\uE000'+words+'\uE001';
      });
     }
     // Repairs any remaining balanced emphasis markers IN THE RENDERED READER
     // without rebuilding paragraphs or discarding existing notes/highlights.
     // In particular, underscores in a simple _that_ or _can_ token must not
     // be visible, even when earlier document processing kept them literal.
     function nv214RepairRenderedItalics(root){
      if(!root)return 0;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      const pending=[];
      while(walker.nextNode()){
       const node=walker.currentNode,raw=node.nodeValue||'';
       if(!raw.includes('_')||node.parentElement?.closest('script,style,code,pre'))continue;
       const re=/(^|[^\p{L}\p{N}_\\])_([\p{L}\p{N}][^_\n]{0,180}?)_(?=$|[^\p{L}\p{N}_])/gu;
       if(re.test(raw))pending.push(node);
      }
      let changed=0;
      for(const node of pending){
       if(!node.isConnected)continue;
       const raw=node.nodeValue||'',re=/(^|[^\p{L}\p{N}_\\])_([\p{L}\p{N}][^_\n]{0,180}?)_(?=$|[^\p{L}\p{N}_])/gu;
       const fragment=document.createDocumentFragment();let last=0,hit,found=false;
       while((hit=re.exec(raw))!==null){
        const words=hit[2];if(!words||words!==words.trim())continue;
        fragment.append(document.createTextNode(raw.slice(last,hit.index)+hit[1]));
        const em=document.createElement('em');em.textContent=words;fragment.append(em);
        last=hit.index+hit[0].length;found=true;changed++;
       }
       if(found){fragment.append(document.createTextNode(raw.slice(last)));node.replaceWith(fragment)}
      }
      return changed;
     }
     const nv214Body=nv214EncodeShortItalics(displayBody);
     // Emphasis state is shared across paragraphs so an italic phrase cannot
     // leak its underscores at a hard wrap or a Gutenberg paragraph break.
     let nv213EmphasisOpen=false;
     function nv212InlineEmphasis(node,value){
      const parts=String(value||'').split(/([\uE000\uE001])/);
      for(const part of parts){
       if(part==='\uE000'){nv213EmphasisOpen=true;continue}
       if(part==='\uE001'){nv213EmphasisOpen=false;continue}
       if(!part)continue;
       if(nv213EmphasisOpen){const em=document.createElement('em');em.textContent=part;node.append(em)}
       else node.append(document.createTextNode(part));
      }
     }
     function nvAppendBookParagraphs(target,passage){
      const blocks=String(passage||'').split(/\n[ \t]*\n+/);
      for(const block of blocks){
       if(!block.trim())continue;
       const lines=block.replace(/^\n+/,'').replace(/\n+$/,'').split('\n');
       const nonempty=lines.filter(line=>line.trim());
       if(!nonempty.length)continue;
       const typical=nonempty.filter(line=>line.trim().length>=45&&line.trim().length<=110).length;
       const indented=nonempty.some(line=>/^[ \t]{3,}\S/.test(line));
       const numbered=nonempty.some(line=>/^\s*(?:\d+\.|[-*•]\s)/.test(line));
       const prose=nonempty.length>1&&nonempty[0].trim().length>=55&&typical>=Math.ceil(nonempty.length*.45)&&!indented&&!numbered;
       const paragraph=document.createElement('p');
       if(prose){nv212InlineEmphasis(paragraph,nonempty.map(line=>line.trim()).join(' '));}
       else{paragraph.className='nv-reader-preserved-lines';nv212InlineEmphasis(paragraph,lines.join('\n').trim());}
       target.append(paragraph);
      }
     }
     textEl.hidden=false;textEl.replaceChildren();
     // The full text is never sliced: the final section always extends to body.length.
     const headingPattern=/^[ \t]*(?:CHAPTER[ \t]+(?:\d{1,4}|[IVXLCDM]{1,14})\b[^\r\n]{0,85}|(?:PART|BOOK)[ \t]+(?:\d{1,3}|[IVXLCDM]{1,14})\b[^\r\n]{0,80}|PROLOGUE\b[^\r\n]{0,65}|EPILOGUE\b[^\r\n]{0,65})[ \t]*$/gim;
     const matches=Array.from(nv214Body.matchAll(headingPattern));
     const headings=matches.filter((h,i)=>{
      const next=matches[i+1]?.index??nv214Body.length;
      return nv214Body.slice(h.index+h[0].length,next).trim().length>=130;
     });
     if(headings.length>=2&&headings.length<=3000){
       if(headings[0].index>0){const intro=document.createElement('details');intro.className='nv-reader-frontmatter';const heading=document.createElement('summary');heading.textContent='Title pages & publication notes';const contents=document.createElement('div');nv212InlineEmphasis(contents,nv214Body.slice(0,headings[0].index).trim());intro.append(heading,contents);textEl.append(intro)}
       const parts=document.createDocumentFragment();
       headings.forEach((h,i)=>{
         const section=document.createElement('section');section.className='nv-text-section';section.id='nv-text-chapter-'+i;section.dataset.readerChapter=String(i);
         const end=i+1<headings.length?headings[i+1].index:nv214Body.length;
         const passage=nv214Body.slice(h.index,end);const lineEnd=passage.indexOf('\n');
         const title=document.createElement('h2');title.className='nv-reader-chapter-title';nv212InlineEmphasis(title,(lineEnd<0?passage:passage.slice(0,lineEnd)).trim());
         const content=document.createElement('div');content.className='nv-reader-chapter-body';nvAppendBookParagraphs(content,lineEnd<0?'':passage.slice(lineEnd+1));
         section.append(title,content);parts.append(section);
         const option=document.createElement('option');option.value='text-'+i;option.textContent=h[0].replace(/[\uE000\uE001]/g,'').trim().slice(0,85);chapterSelect.append(option);
       });textEl.append(parts);chapterSelect.hidden=false;
       el('#nv-reader-prev').textContent='← Chapter';el('#nv-reader-next').textContent='Next chapter →';
     }else nvAppendBookParagraphs(textEl,nv214Body);
     fileMode='text';
     if(known&&book?.source==='gutenberg'&&integrity?.complete===true&&nvMember()){
      const offlineButton=document.createElement('button');offlineButton.type='button';offlineButton.className='nv209-offline-action';
      offlineButton.textContent='↓ Save offline';offlineButton.setAttribute('aria-label','Save this complete book for offline reading');
      const owner=me.id;
      el('#nv-reader-bottom').querySelector('.nv-reader-bottom-head')?.append(offlineButton);
      nv209Get(owner,bookId).then(row=>{if(row&&panel.isConnected&&nvMember()&&me.id===owner)offlineButton.textContent='✓ Saved offline'}).catch(()=>{});
      offlineButton.onclick=async()=>{
       if(!nvRequireMember('save books offline'))return;
       offlineButton.disabled=true;offlineButton.textContent='Saving…';
       try{const ok=await nv209Save(book,raw,file.name);if(ok){offlineButton.textContent='✓ Saved offline';notify('This complete book is ready to read offline on this device.')}}
       catch(e){offlineButton.textContent='↓ Save offline';notify(e?.message||'Could not save this offline book. Check storage space.')}
       finally{offlineButton.disabled=false}
      };
     }
     nv214RepairRenderedItalics(textEl);
     nvReaderTotalWords=(body.match(/\S+/g)||[]).length;setFont();setTheme();setProgress(lastTextPercent);nv206PaintHighlights();
     if(nv206TargetNote&&nv206TargetNote.book_key===bookId&&nv206TargetNote.edition_key===nvReaderEdition){const target=nv206TargetNote;nv206TargetNote=null;requestAnimationFrame(()=>{if(panel.isConnected)nv206JumpTo(target)})}
     const message=integrity?.complete?'The complete edition is ready for you.':integrity?.source==='gutenberg'?'This edition may be incomplete. You can compare it with the official source.': 'Your '+(html?'HTML':'text')+' file is ready. Its contents have not been checked against an official edition.';
     nvReaderIntegrity(message,integrity?.complete?'ok':'unverified');
     const restore=await nv205ReaderRestore();if(!panel.isConnected||intent!==nvReaderIntent)return;
     requestAnimationFrame(()=>{if(!panel.isConnected||intent!==nvReaderIntent)return;
      let p=0;if(nvMember())try{p=Number(localStorage.getItem(progressKey)||0)}catch{};
      if(restore&&Number.isFinite(restore.progress))p=restore.progress;
      lastTextPercent=nv205Clamp(p);scroller.scrollTop=lastTextPercent*Math.max(0,scroller.scrollHeight-scroller.clientHeight);setProgress(lastTextPercent);
      nv205ReaderIndicator(!nvMember()?'guest':nv205CloudReady?'synced':'device');
     });
   }
   if(!panel.isConnected||intent!==nvReaderIntent)return;
   el('#nv-reader-bottom').hidden=false;el('#nv-reader-help').textContent='Reading options';
   if(known&&['text','epub'].includes(fileMode))void nvRecordReadingStart(book,nvReaderEdition,fileMode);
  }catch(error){if(!panel.isConnected||intent!==nvReaderIntent)return;
   fileMode='none';stage.hidden=true;disposePdf();pdfStage.hidden=true;pdfStage.replaceChildren();if(pdfObjectUrl){URL.revokeObjectURL(pdfObjectUrl);pdfObjectUrl=null}textEl.hidden=true;iaStage.hidden=true;el('#nv-reader-welcome').hidden=false;nvReaderIntegrity('');
   const msg=el('#nv-reader-welcome').querySelector('p');if(msg)msg.textContent='This copy could not be opened fully. Check the source or choose another file.';
   notify(error.message||'Could not open this ebook');
  }
 }
 el('#nv-reader-file').onchange=e=>{const selected=e.target.files?.[0];e.target.value='';openFileInReader(selected)};

 // An official embeddable BookReader, only for records marked public by Open Library.
 async function findPublicScan(b){
   const approved=x=>x?.ebookAccess==='public'&&Array.isArray(x.ia)&&x.ia.length?x.ia[0]:null;
   let match=approved(b);if(match)return match;
   const clean=x=>String(x||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
   const name=clean(b.title);if(!name)return null;
   const term='title:"'+String(b.title).replace(/"/g,'')+'"';
   const results=await getOL(term,1,8);
   for(const x of results.items){
     const titleMatch=clean(x.title)===name||clean(x.title).startsWith(name+' ');
     const authors=(b.author||'').split(/[;,]/)[0].trim();
     const authorMatch=!authors||!x.author||clean(x.author).includes(clean(authors).split(' ')[0]);
     if(titleMatch&&authorMatch&&(match=approved(x)))return match;
   }
   return null;
 }
 function setEmbedControls(embedded){el('#nv-reader-find-toggle').title=embedded?'Find is only available for text editions':'Find words in this book';
   for(const node of [el('#nv-reader-theme'),el('#nv-reader-minus'),el('#nv-reader-plus'),el('#nv-reader-mark')]){
     node.disabled=embedded;
     node.title=embedded?'This setting is controlled by the embedded Internet Archive reader':'';
   }
 }
 async function showOnlineReader(){
   const btn=el('#nv-reader-online');if(!book)return;
   if(btn){btn.disabled=true;btn.textContent='Checking online access…'}
   try{
     const identifier=nvSmartScanIdentifier||await findPublicScan(book);
     if(!panel.isConnected)return;
     if(!identifier){notify('No verified open scan found. Try the official book page or a local ebook.');return}
     const src='https://archive.org/embed/'+encodeURIComponent(identifier);
     const frame=document.createElement('iframe');frame.src=src;frame.title='Public-access edition of '+book.title;
     frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;
     frame.setAttribute('allow','fullscreen');
     frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-downloads');
     iaStage.replaceChildren(frame);
     frame.addEventListener('load',()=>{if(panel.isConnected&&fileMode==='iframe'&&known)void nvRecordReadingStart(book,'archive:scan','pdf')},{once:true});
     const note=document.createElement('div');note.className='nv-ia-notice';
     note.innerHTML='Reading an open scan through the Internet Archive. Use the controls inside the book viewer. <span><a target="_blank" rel="noopener noreferrer" href="'+esc('https://archive.org/details/'+identifier)+'">Open original ↗</a> &nbsp; <button type="button" id="nv-reader-back-options">Other options</button></span>';
     note.querySelector('#nv-reader-back-options').onclick=()=>{iaStage.hidden=true;iaStage.replaceChildren();el('#nv-reader-welcome').hidden=false;fileMode='none';setEmbedControls(false)};
     iaStage.prepend(note);iaStage.hidden=false;
     el('#nv-reader-welcome').hidden=true; textEl.hidden=true;stage.hidden=true;pdfStage.hidden=true;googleStage.hidden=true;googleStage.replaceChildren();nvReaderIntent++;
     el('#nv-reader-bottom').hidden=true;fileMode='iframe';setEmbedControls(true);
     notify('Public edition opened. Page controls are inside the book viewer.');
   }catch(e){notify('Online reading is temporarily unavailable. Open the official edition instead.');}
   finally{if(panel.isConnected&&btn){btn.disabled=false;btn.textContent='Open public scan →'}}
 }

 // Google Books is embedded only if its accessInfo permits it. Failed viewers leave alternatives visible.
 function nvViewerScript(){
  if(window.google?.books?.DefaultViewer)return Promise.resolve(window.google.books);
  if(window.nvGoogleViewerLoading)return window.nvGoogleViewerLoading;
  window.nvGoogleViewerLoading=new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(window.google.books)};
   const timer=setTimeout(()=>finish(Error('Google preview did not respond')),14000);
   const initialize=()=>{
    try{if(!window.google?.books)throw Error('Google preview unavailable');
     window.google.books.load();window.google.books.setOnLoadCallback(()=>finish(window.google?.books?.DefaultViewer?null:Error('Viewer unavailable')));
    }catch(err){finish(err)}
   };
   if(window.google?.books){initialize();return}
   const script=document.createElement('script');script.src='https://www.google.com/books/jsapi.js';script.async=true;
   script.onload=initialize;script.onerror=()=>finish(Error('Google preview script blocked'));document.head.append(script);
  }).catch(error=>{window.nvGoogleViewerLoading=null;throw error});
  return window.nvGoogleViewerLoading;
 }
 async function nvShowGooglePreview(info){
  if(!info?.embedded||!info.id||!panel.isConnected)return;
  const intent=nvReaderIntent;
  const welcome=el('#nv-reader-welcome');const status=el('#nv-reader-access');
  if(status){status.hidden=false;status.querySelector('strong').textContent='Opening Google Books preview…'}
  try{
   await nvViewerScript();if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='none')return;
   const frame=document.createElement('div');frame.className='nv-google-canvas';googleStage.replaceChildren();
   const notice=document.createElement('div');notice.className='nv-ia-notice';
   const infoText=document.createElement('span');infoText.textContent=info.full?'Google Books · available pages':'Google Books · publisher-approved preview (not the full book)';
   const back=document.createElement('button');back.type='button';back.textContent='Other options';
   back.onclick=()=>{googleStage.replaceChildren();googleStage.hidden=true;welcome.hidden=false;fileMode='none';nvReaderIntent++;setEmbedControls(false)};
   notice.append(infoText,back);googleStage.append(notice,frame);googleStage.hidden=false;
   await new Promise((resolve,reject)=>{
    let finished=false;const timer=setTimeout(()=>end(Error('Preview timed out')),13000);
    function end(err){if(finished)return;finished=true;clearTimeout(timer);err?reject(err):resolve()}
    try{const viewer=new window.google.books.DefaultViewer(frame);
     viewer.load(info.id,()=>end(Error('Publisher does not allow embedding')),()=>end());}
    catch(err){end(err)}
   });
   if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='none')return;
   welcome.hidden=true;iaStage.hidden=true;stage.hidden=true;pdfStage.hidden=true;textEl.hidden=true;
   el('#nv-reader-bottom').hidden=true;fileMode='iframe';nvReaderIntent++;setEmbedControls(true);
   if(known)void nvRecordReadingStart(book,'google:preview','text');
  }catch(error){
   if(!panel.isConnected||fileMode!=='none')return;
   googleStage.replaceChildren();googleStage.hidden=true;welcome.hidden=false;
   if(status){status.hidden=false;status.querySelector('strong').textContent='Preview needs Google Books';
    status.querySelector('p').textContent='This preview could not open here. Use the official Google Books link below or choose another option.'}
  }
 }
 function nvReaderRestrictedPaint(plan){
  // The Reading Desk has one primary recommendation and the open-file control.
  // Do not repeat the same links in several nested panels.
  const section=el('#nv-reader-restricted');if(section)section.hidden=true;
 }
 function nvReaderAccessPaint(plan){
  const area=el('#nv-reader-access');if(!area||!panel.isConnected)return;
  const [head,copy]=nvAccessSummary(plan);area.hidden=false;
  area.querySelector('strong').textContent=head;area.querySelector('p').textContent=copy;
  const actions=el('#nv-reader-access-links');actions.replaceChildren();
  const official=el('#nv-reader-official'),choices=el('.nv-reader-choices');
  if(official)official.hidden=false;
  function one(label,href,callback){
   const control=document.createElement(href?'a':'button');control.className='nv-reader-primary-option';
   control.textContent=label;
   if(href){control.href=href;control.rel='noopener noreferrer';control.target='_blank';}
   else{control.type='button';control.onclick=callback;}
   actions.append(control);if(official)official.hidden=true;
  }
  if(plan.google?.full&&plan.google.link)one('Read full edition',plan.google.link);
  else if(plan.borrow?.status==='full access'&&plan.borrow.link)one('Read full library edition',plan.borrow.link);
  else if(plan.standard)one('Read free complete edition',plan.standard);
  else if(plan.scan)one('Read available scan',null,showOnlineReader);
  else if(plan.borrow?.status==='lendable'&&plan.borrow.link)one('Borrow this book',plan.borrow.link);
  else if(plan.google?.embedded)one('Preview available pages',null,()=>nvShowGooglePreview(plan.google));
  else if(plan.borrow?.link&&plan.borrow.status==='catalog-borrow')one('Check borrowing',plan.borrow.link);
  else if(plan.google?.link)one('Preview on Google Books',plan.google.link);
  else one('Find authorized editions',plan.official||nvAccessOfficial(book));
  if(plan.scan&&el('#nv-reader-online'))el('#nv-reader-online').hidden=true;
  nvSmartScanIdentifier=plan.scan||'';nvReaderRestrictedPaint(plan);
 }
 async function nvSmartReadAccess(){
  const accessIntent=nvReaderIntent;
  try{
   const plan=await nvResolveAccess(book);
   if(!panel.isConnected||localOnly||accessIntent!==nvReaderIntent||fileMode!=='none')return;
   nvReaderAccessPaint(plan);
   if(plan.free&&plan.free.source==='gutenberg'){
    // The edition has passed the existing strict title+author checks.
    const title=el('#nv-reader-welcome').querySelector('p');
    title.textContent='A public-domain edition is available. Opening it in the Novella reader…';
    const next=plan.free;
    if(panel.isConnected)readerModal(next);
    return;
   }
   if(plan.scan){await showOnlineReader();return}
   if(plan.google?.embedded){await nvShowGooglePreview(plan.google);return}
   const title=el('#nv-reader-welcome').querySelector('p');
   title.textContent='Choose how to access the complete edition. A publisher preview is not the whole book.';
  }catch{
   if(!panel.isConnected||fileMode!=='none')return;
   nvReaderAccessPaint(nvBuildAccess(book));
   const area=el('#nv-reader-access');if(area){area.querySelector('strong').textContent='Live availability is temporarily offline';area.querySelector('p').textContent='Check the official sources below, or open a legally obtained EPUB, TXT or HTML copy.'}
  }
 }

 if(el('#nv-reader-online'))el('#nv-reader-online').onclick=showOnlineReader;
 // Never search for a public scan of an unverified title. This avoids dead buttons.
 if(!localOnly&&book&&options.offlineText?.complete===true&&options.offlineText.bookKey===id(book)){
  const saved=options.offlineText;
  setTimeout(()=>{
   if(!panel.isConnected||fileMode!=='none'||!nvMember()||me.id!==saved.owner)return;
   openFileInReader(new File([saved.text],saved.fileName||'book.txt',{type:'text/plain'}),{complete:true,source:'gutenberg',title:saved.title});
  },0);
 }else if(!localOnly&&book&&nvCompleteTexts.has(id(book))){
  const verified=nvCompleteTexts.get(id(book));
  // The bytes were fully fetched and Gutenberg's end marker checked before
  // this edition appeared in Complete books. No second network request needed.
  setTimeout(async()=>{
   if(!panel.isConnected||fileMode!=='none')return;
   const name=(book.title||'Complete book').replace(/[^a-z0-9 -]/gi,'').slice(0,80)+'.txt';
   await openFileInReader(new File([verified.text],name,{type:'text/plain'}),
    {complete:true,source:'gutenberg',title:book.title});
   if(!panel.isConnected||fileMode!=='text')return;
   const download=document.createElement('button');download.type='button';download.className='nv-download-book';
   download.textContent=nvMember()?'Download verified text ↓':'Sign in to download ↓';
   download.onclick=()=>{if(!nvRequireMember('download books'))return;
    const blob=new Blob([verified.text],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)};
   el('#nv-reader-extra')?.append(download);
  },0);
 }else if(!localOnly&&book&&options.smart)setTimeout(nvSmartReadAccess,30);
 else if(!localOnly&&verifiedOpenScan(book))setTimeout(showOnlineReader,80);
 // One-click lookup for public-domain texts, including the seven verified editions.
 if(!localOnly&&canTryCommunityEdition(book))setTimeout(async()=>{
   if(!panel.isConnected||fileMode!=='none')return;
   const initialIntent=nvReaderIntent;
   const welcome=el('#nv-reader-welcome'),description=welcome?.querySelector('p');
   if(!description)return;
   description.textContent='Finding a verified public-domain reading edition. Your book grid stays available.';
   const sources=await nvGutenbergSourceList(book);
   if(!panel.isConnected||nvReaderIntent!==initialIntent||fileMode!=='none')return;
   let uncertain=null, verified=null, errorText='';
   const tried=new Set();
   async function attempt(list){
    for(const link of list){
     if(tried.has(link))continue;
     if(!panel.isConnected||nvReaderIntent!==initialIntent||fileMode!=='none')return;
     tried.add(link);
     try{
      description.textContent='Checking the downloaded edition for its ending…';
      const result=await nvDownloadFullText(link);
      if(!result.valid)continue;
      if(result.complete){verified=result;return}
      if(!uncertain)uncertain=result;
     }catch(e){errorText=String(e?.message||'Source unavailable')}
    }
   }
   await attempt(sources.sources);
   if(!verified&&sources.deferred&&panel.isConnected&&nvReaderIntent===initialIntent&&fileMode==='none'){
     description.textContent='Checking an alternative public-domain source…';
     const deeper=await nvGutenbergSourceList(book,true);
     for(const url of deeper.epubs)if(!sources.epubs.includes(url))sources.epubs.push(url);
     await attempt(deeper.sources);
   }
   if(!panel.isConnected||nvReaderIntent!==initialIntent||fileMode!=='none')return;
   if(verified){
      const file=new File([verified.text],book.title.replace(/[^a-z0-9 -]/gi,'').slice(0,80)+'.txt',{type:'text/plain'});
      await openFileInReader(file,{complete:true,source:'gutenberg',title:book.title});
      if(!panel.isConnected||fileMode!=='text')return;
      const download=document.createElement('button');download.type='button';download.className='nv-download-book';download.textContent=nvMember()?'Download verified text ↓':'Sign in to download ↓';
      download.onclick=()=>{if(!nvRequireMember('download books'))return;const blob=new Blob([verified.text],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=book.title.replace(/[^a-z0-9 -]/gi,'').slice(0,65)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),60000)};
      el('#nv-reader-extra')?.append(download);
      notify('The Gutenberg edition has loaded through its end marker.');return;
   }
   const choices=welcome.querySelector('.nv-reader-choices');
   // Never silently pass off an unverified copy as the full edition.
   if(uncertain){
      description.textContent='A readable text was found, but its ending could not be verified. You may open it with a clear warning or compare the official Gutenberg edition.';
      const button=document.createElement('button');button.type='button';button.className='secondary-btn nv-source-try';button.textContent='Read unverified text';
      button.onclick=()=>{button.disabled=true;openFileInReader(new File([uncertain.text],book.title+'.txt',{type:'text/plain'}),{source:'gutenberg',complete:false,title:book.title})};
      choices.prepend(button);
   }else{
      description.textContent='A complete online text could not be verified on this network'+(errorText?' ('+errorText+').':'.')+' Open the official edition, or read your own EPUB or text copy.';
      const kicker=welcome.querySelector('.nv-kicker');if(kicker)kicker.textContent='SOURCE CURRENTLY UNAVAILABLE';
   }
   // EPUB provides a second legal path when Gutenberg's text is unavailable or incomplete.
   if(sources.epubs.length){
      const btn=document.createElement('button');btn.type='button';btn.className='secondary-btn nv-source-try';btn.textContent='Try full EPUB edition';
      btn.onclick=async()=>{
       if(btn.disabled||!panel.isConnected||fileMode!=='none')return;
       btn.disabled=true;btn.textContent='Downloading the EPUB…';
       const intent=nvReaderIntent;
       for(const link of sources.epubs){
        try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
         let blob;try{const response=await fetch(link,{signal:controller.signal});if(!response.ok)throw Error('EPUB source unavailable');blob=await response.blob()}finally{clearTimeout(timer)}
         if(blob.size<1000||blob.size>25*1024*1024)continue;
         if(!panel.isConnected||intent!==nvReaderIntent||fileMode!=='none')return;
         await openFileInReader(new File([blob],book.title+'.epub',{type:'application/epub+zip'}),{source:'gutenberg',title:book.title});
         if(fileMode==='epub')return;
        }catch{}
       }
       if(panel.isConnected){btn.disabled=false;btn.textContent='Try full EPUB edition';notify('This EPUB could not be opened. Use the official source link.');}
      };
      choices.prepend(btn);
   }
   // If the free-text source is missing or unverified, investigate permitted
   // previews and lending options instead of leaving the reader at a dead end.
   Promise.allSettled([nvGoogleForBook(book),nvLibraryForBook(book)]).then(async values=>{
      if(!panel.isConnected||nvReaderIntent!==initialIntent||fileMode!=='none')return;
      const backup=nvBuildAccess(book);backup.free=null;
      if(values[0].status==='fulfilled')backup.google=values[0].value;
      if(values[1].status==='fulfilled')backup.borrow=values[1].value;
      nvReaderAccessPaint(backup);
      if(!uncertain&&backup.google?.embedded&&panel.isConnected&&nvReaderIntent===initialIntent){
        description.textContent='A publisher-approved Google Books view is available. Opening it instead…';
        await nvShowGooglePreview(backup.google);
      }
   }).catch(()=>{});
 },50);

 setTheme();setFont();el('#nv-reader-close').focus();
}
// Registration is a distinct action. An OAuth identity is NOT a Novella account
// until a row in public.novella_profiles exists.
function shouldOnboard(){return !!nvPendingGoogle}
function showAuthNotice(text,mode='signin'){
 openAuth(mode);const msg=$('#auth-msg');if(msg){msg.classList.add('nv-auth-note');msg.textContent=text}
}
function openAuth(mode='signin'){
 if(mode==='account'){navigate('profile');return}
 if(nvPendingGoogle&&mode!=='google-register'){mode='google-register'}
 authMode=mode;
 $('#modal-overlay .modal')?.classList.toggle('nv-picker-modal',mode==='account-picker');
 const email=$('#auth-form input[name="email"]');
 if(email&&(mode==='signin'||mode==='signup'))nvAuthEmailDraft=String(email.value||'').trim().slice(0,254);
 $('#modal-overlay').classList.remove('hidden');
 authPaint();
 $('#close-modal').hidden=(mode==='google-register'||mode==='delete');
 const first=$('#modal-body input:not([type=hidden])');
 (first||$('#modal-heading'))?.focus?.();
}
function closeAuth(){
 if(authMode==='google-register'||authMode==='delete')return;
 const wasGuestPrompt=authMode==='member-required';
 $('#modal-overlay').classList.add('hidden');
 const previous=wasGuestPrompt?nvGateReturnFocus:null;
 nvGateReturnFocus=null;
 const button=$('#auth-button');
 if(previous?.isConnected)previous.focus();
 else if(button)button.focus();
}
async function nvSignOut(opts={}){
 nv212DismissUndo();
 const leavingId=me?.id||null;
 if(openReaderPanel)openReaderPanel(); // Never leave a previous account's reading desk open after sign-out.
 let signOutError=null;
 if(db){try{const {error}=await db.auth.signOut({scope:'local'});signOutError=error||null}catch(error){signOutError=error}}
 if(leavingId){nvDisableKnownSession(leavingId);nv209DropCachedProfile(leavingId)} // Never retain one-tap credentials after explicit sign-out.
 nvAuthEpoch++;me=null;nvProfile=null;nvPendingGoogle=null;nv205ResetMemory();
 shelves=[];historyRows=[];personalSyncIssue='';userUI();
 if(['home','library','history','profile','settings'].includes(screen))paint();
 authMode='signin';closeAuth();
 if(opts.notify!==false)notify(signOutError?'Signed out of this browser. Server sign-out could not be confirmed.':'Signed out of Novella');
}
async function nvCheckRegistration(user,intent=''){
 const epoch=++nvAuthEpoch;
 if(!user){me=null;nvProfile=null;nvPendingGoogle=null;userUI();return}
 let result;
 try{result=await db.from('novella_profiles').select('user_id,display_name,created_at').eq('user_id',user.id).maybeSingle()}
 catch(e){result={error:e}}
 if(epoch!==nvAuthEpoch)return;
 if(result?.error){
  if(await nv209TryOfflineProfile(user,epoch))return;
  me=null;nvProfile=null;userUI();
  if(['account-switch','account-picker-active','restore-account'].includes(intent)){
   nvPickerMessage='The account service could not load your profile. Check your connection and retry.';
   return;
  }
  showAuthNotice('Could not verify your registration. Please retry when the account service is available.','signin');return
 }
 if(result?.data){
  if(me?.id!==user.id){nv201SuggestionMemo=null;if(me?.id&&openReaderPanel)openReaderPanel();nv205ResetMemory();shelves=[];historyRows=[];personalSyncIssue='';}
  me=user;nvPendingGoogle=null;nvProfile=result.data;nv209RememberVerifiedProfile(user,result.data);
  try{const active=await db.auth.getSession();if(epoch!==nvAuthEpoch)return;
   nvRecordKnownAccount(user,result.data,active.data?.session,true,intent);
  }catch{nvRecordKnownAccount(user,result.data,null,false,intent)}
  if(['google-signin','google-registered','google-register'].includes(intent)){
   // A completed Google OAuth redirect is not a new account-selection visit.
   // Navigation Timing reports it as a fresh navigation even though the
   // visitor already selected their identity before leaving for Google.
   nvMarkStartupChosen();nvStartupPickerAttempted=true;
  }
  userUI();
  if(authMode==='google-register'||authMode==='signup'||authMode==='signin'){authMode='signin';closeAuth()}
  await loadPersonal();if(screen==='profile'||screen==='settings')paint();return;
 }
 if(intent==='google-register'){
  me=null;nvProfile=null;nvPendingGoogle=user;nvAuthEmailDraft=user.email||'';userUI();
  openAuth('google-register');return;
 }
 // Email registration was explicitly started from the Register form, not Sign in.
 if(user.app_metadata?.provider==='email'&&user.user_metadata?.novella_registration_requested===true){
  const name=String(user.user_metadata?.name||user.email?.split('@')[0]||'Reader').trim().slice(0,50);
  const {error}=await db.from('novella_profiles').insert({user_id:user.id,display_name:name});
  if(epoch!==nvAuthEpoch)return;
  if(error){me=null;nvProfile=null;userUI();showAuthNotice('Email verified, but registration could not be completed. Please try again or contact support.','signin');return}
  await nvCheckRegistration(user,'registered-email');
  if(me?.id===user.id){openAuth('welcome')}
  return;
 }
 // A new Google OAuth identity can exist internally. Refuse access to Novella
 // until the user chooses Register and completes the actual registration form.
 const unregisteredEmail=user.email||'';
 try{await db.auth.signOut({scope:'local'})}catch{}
 if(epoch!==nvAuthEpoch)return;
 me=null;nvProfile=null;nvPendingGoogle=null;shelves=[];historyRows=[];
 userUI();if(['profile','library','history'].includes(screen))paint();
 nvAuthEmailDraft=unregisteredEmail;
 showAuthNotice('This account has not registered with Novella. Select Register below to create your reading profile first.','signup');
}
function authPaint(){
 const root=$('#modal-body');root.onclick=null;
 if(authMode==='member-required'){
  root.innerHTML=`<section class="nv-guest-prompt" aria-labelledby="modal-heading">
    <span class="nv-guest-prompt-icon" aria-hidden="true">♡</span>
    <span class="intro-label">A LITTLE MORE FOR MEMBERS</span>
    <h2 id="modal-heading" tabindex="-1">Make it yours with Novella.</h2>
    <p>To ${esc(nvGateFeature)}, please <strong>sign in</strong> to your Novella account or <strong>register</strong> for free.</p>
    <p class="nv-guest-prompt-note">You can still browse, search, and read available books as a guest. Nothing will be saved until you sign in.</p>
    <div class="nv-guest-prompt-actions">
      <button type="button" class="primary-btn" data-auth="signin">Sign in</button>
      <button type="button" class="secondary-btn" data-auth="signup">Create account</button>
    </div>
    <button type="button" class="link-btn nv-guest-prompt-skip" data-nv-gate-close>Not now · Keep browsing</button>
   </section>`;
  root.querySelector('[data-nv-gate-close]').onclick=closeAuth;
  return;
 }
 if(authMode==='account-method'){
  const item=nvKnownAccount(nvSelectedKnownId);
  if(!item){nvShowPicker('Account not found. Please choose an account again.');return}
  root.innerHTML=`<span class="intro-label">NOVELLA / SECURE ACCOUNT ACCESS</span><h2 id="modal-heading" tabindex="-1">Continue as ${esc(item.name||'reader')}.</h2><p>For your security, this remembered account needs to reconnect. Choose the way you originally signed in. Your Novella password is not required for Google sign-in.</p>
  <div class="nv-account-method-actions"><button type="button" class="google-auth" data-nv-method="google"><span class="google-symbol" aria-hidden="true">G</span><span>Continue with Google</span></button><button type="button" class="secondary-btn" data-nv-method="email">Use email and password</button><button type="button" class="link-btn" data-nv-method="back">Back to accounts</button></div><p class="form-msg" id="auth-msg" role="status"></p>`;
  root.querySelector('[data-nv-method="google"]').onclick=()=>nvStartGoogleSignIn(item,false);
  root.querySelector('[data-nv-method="email"]').onclick=()=>{nvAuthEmailDraft=item.email;openAuth('signin')};
  root.querySelector('[data-nv-method="back"]').onclick=()=>nvShowPicker();
  return;
 }
 if(authMode==='account-picker'){
  const signed=!!(me&&nvProfile),current=nvKnownAccount(me?.id);
  const pref=nvPreferredAccount();
  const sorted=[...nvKnownAccounts].sort((a,b)=>Number(b.id===pref)-Number(a.id===pref)||b.lastUsed-a.lastUsed);
  const starSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="nv-picker-star-shape" d="m12 2.8 2.85 5.83 6.43.94-4.64 4.52 1.1 6.39L12 17.45l-5.74 3.03 1.1-6.39L2.72 9.57l6.43-.94z"/></svg>';
  const moreSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
  const items=sorted.map(a=>{
   const active=signed&&a.id===me.id,quick=nvQuickReady(a),isPref=pref===a.id,label=esc(a.name||a.email||'Reader');
   return `<div class="nv-picker-card ${active?'nv-picker-is-active':''}">
     <button type="button" class="nv-picker-account" data-nv-picker="use" data-account-id="${esc(a.id)}" aria-label="${active?'Continue as ':quick?'Switch to ':a.authMethod==='google'?'Continue with Google as ':'Sign in as '}${label}">
       <span class="nv-picker-avatar" aria-hidden="true">${nvAvatarData(a.avatar)?`<img class="nv-avatar-image" alt="" src="${esc(nvAvatarData(a.avatar))}">`:esc((a.name||a.email||'R').charAt(0).toUpperCase())}</span>
       <span class="nv-picker-info"><span class="nv-picker-name-line"><span class="nv-picker-name">${label}</span>${active?'<span class="nv-picker-mini-tag nv-picker-tag-current">Current</span>':''}${isPref?'<span class="nv-picker-mini-tag">Preferred</span>':''}</span>
       <span class="nv-picker-email">${esc(a.email)}</span><span class="nv-picker-status-line ${!quick&&!active?'nv-picker-needs-login':''}">${active?'Signed in now':quick?'Ready to switch':a.authMethod==='google'?'Continue with Google':a.authMethod==='email'?'Email sign-in required':'Reconnect to continue'}</span></span>
       <svg class="nv-picker-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
     </button>
     <span class="nv-picker-actions">
       <button type="button" class="nv-picker-icon-button" data-nv-picker="prefer" data-account-id="${esc(a.id)}" aria-pressed="${isPref}" title="${isPref?'Preferred account':'Make preferred account'}" aria-label="${isPref?label+' is your preferred account':'Set '+label+' as preferred'}">${starSvg}</button>
       ${!active?`<button type="button" class="nv-picker-icon-button" data-nv-picker="tools" data-account-id="${esc(a.id)}" aria-haspopup="true" aria-expanded="false" aria-label="More options for ${label}" title="More options">${moreSvg}</button>`:''}
     </span>
     ${!active?`<div class="nv-picker-tools-menu" hidden><button type="button" data-nv-picker="forget" data-account-id="${esc(a.id)}">Remove from this browser</button><small>Your Novella account will not be deleted.</small></div>`:''}
   </div>`;
  }).join('');
  const notice=(nvPickerMessage||'').startsWith('Choose which Novella account to use on this visit.')?'':nvPickerMessage;
  root.innerHTML=`<div class="nv-picker-dialog"><div class="nv-picker-top"><span class="nv-picker-brandmark" aria-hidden="true"></span><span class="nv-picker-eyebrow">NOVELLA / YOUR READING SPACE</span></div>
   <h2 id="modal-heading" tabindex="-1">Who's reading?</h2>
   <p class="nv-picker-lede">Choose an account to continue. Tap the star to set your preferred account.</p>
   <div class="nv-picker-section"><span class="nv-picker-section-title">SAVED ACCOUNTS</span><span class="nv-picker-count">${sorted.length} ${sorted.length===1?'account':'accounts'}</span></div>
   <div class="nv-picker-list">${items||'<p class="nv-picker-empty">No accounts remembered yet. Add your first account below.</p>'}</div>
   ${signed&&!nvQuickReady(current)&&nvQuickDefaultEnabled()?`<div class="nv-picker-trust"><p>Your current session isn't saved for one-tap switching yet.</p><button type="button" class="secondary-btn" data-nv-picker="remember">Save current session</button></div>`:''}
   <button type="button" class="nv-picker-add" data-nv-picker="add"><span class="nv-picker-add-icon" aria-hidden="true">+</span><span class="nv-picker-add-copy">Add another account<small>Sign in or create a Novella account</small></span><span aria-hidden="true">›</span></button>
   <p class="nv-picker-footnote"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 3.5 7v5c0 6 4 9 8.5 10 4.5-1 8.5-4 8.5-10V7z"/><path d="m9 12 2 2 4-4"/></svg>Switching accounts never changes your preference. Sign out on shared devices.</p>
   <p id="nv-picker-status" class="form-msg" role="status" aria-live="polite">${esc(notice)}</p></div>`;
  root.onclick=async e=>{
   const b=e.target.closest('[data-nv-picker]');
   if(!b){root.querySelectorAll('.nv-picker-tools-menu').forEach(n=>n.hidden=true);root.querySelectorAll('[data-nv-picker="tools"]').forEach(n=>n.setAttribute('aria-expanded','false'));return}
   if(nvPickerBusy)return;
   const act=b.dataset.nvPicker,id=b.dataset.accountId;
   if(act==='tools'){
    const entry=b.closest('.nv-picker-card'),menu=entry?.querySelector('.nv-picker-tools-menu'),opening=!!menu?.hidden;
    root.querySelectorAll('.nv-picker-tools-menu').forEach(n=>n.hidden=true);
    root.querySelectorAll('[data-nv-picker="tools"]').forEach(n=>n.setAttribute('aria-expanded','false'));
    if(menu){menu.hidden=!opening;b.setAttribute('aria-expanded',String(opening));if(opening)menu.querySelector('button')?.focus()}
    return;
   }
   if(act==='use'){await nvPickKnownAccount(id);return}
   if(act==='prefer'){
    if(!nvKnownAccount(id))return;
    if(nvPreferredAccount()!==id){nvSetPreferredAccount(id);nvPickerMessage='Preferred account updated.';authPaint();if(screen==='settings')paint();}
    root.querySelector(`[data-nv-picker="prefer"][data-account-id="${id}"]`)?.focus();return;
   }
   if(act==='add'){nvMarkStartupChosen();nvAuthEmailDraft='';openAuth('signin');return}
   if(act==='forget'){
    const account=nvKnownAccount(id);if(!account)return;
    if(!confirm('Remove '+(account.name||account.email||'this account')+' from the account picker on this browser? This does not delete the Novella account.'))return;
    nvForgetKnownAccount(id);nvPickerMessage='Account removed from this browser.';authPaint();if(screen==='settings')paint();return;
   }
   if(act==='remember'){
    const msg=$('#nv-picker-status');b.disabled=true;
    try{if(!await nvEnableQuickCurrent())throw Error('Please sign in again to save this session.');nvPickerMessage='Current session saved for one-tap switching.';authPaint()}
    catch(ex){msg.textContent=ex.message||'Unable to save this session.';b.disabled=false}
   }
  };
  return;
 }
 if(authMode==='google-register'){
  const email=esc(nvPendingGoogle?.email||'');
  const proposed=esc((nvPendingGoogle?.user_metadata?.full_name||nvPendingGoogle?.user_metadata?.name||'').slice(0,50));
  root.innerHTML=`<span class="intro-label">REGISTRATION · GOOGLE ACCOUNT</span><h2 id="modal-heading" tabindex="-1">Create your account.</h2><p>Google has verified <strong>${email}</strong>. This is the <strong>Register</strong> process. Your Novella account is not active until you submit this form.</p>
  <form id="nv-google-register"><div class="field"><label for="nv-google-name">Display name</label><input id="nv-google-name" name="name" autocomplete="nickname" minlength="2" maxlength="50" value="${proposed}" required placeholder="Your reading name"></div><label class="nv-check-row"><input type="checkbox" name="agreement" required> I agree to create a Novella profile and understand that my bookshelf is private and reviews are public.</label><button class="primary-btn" type="submit" style="width:100%">Complete registration →</button><button class="link-btn" id="nv-register-cancel" type="button">Not now · Continue as guest</button><p id="auth-msg" class="form-msg" role="status"></p></form>`;
  $('#nv-google-register').onsubmit=async e=>{
   e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')||'').trim().slice(0,50),msg=$('#auth-msg'),btn=e.currentTarget.querySelector('[type=submit]');
   if(name.length<2||!f.get('agreement')){msg.textContent='Enter your name and confirm registration.';return}
   const user=nvPendingGoogle;if(!user)return;
   btn.disabled=true;msg.textContent='Creating your reading account…';
   try{
    const {error}=await db.from('novella_profiles').insert({user_id:user.id,display_name:name});if(error)throw error;
    const {data}=await db.auth.updateUser({data:{name,novella_onboarded:true}});
    nvPendingGoogle=null;
    await nvCheckRegistration(data?.user||user,'google-registered');
    if(me?.id===user.id)openAuth('welcome');
    else showAuthNotice('Profile created. Please sign in again to complete setup.','signin');
   }catch(err){msg.textContent=err?.message||'Registration failed. Please try again.'}
   finally{btn.disabled=false}
  };
  $('#nv-register-cancel').onclick=async()=>{
   const msg=$('#auth-msg');
   try{await nvSignOut({notify:false})}catch{msg.textContent='Could not leave registration. Please try again.'}
  };
  return;
 }
 if(authMode==='welcome'){
  root.innerHTML=`<span class="intro-label">WELCOME TO NOVELLA</span><h2 id="modal-heading" tabindex="-1">Your next chapter starts here.</h2><p>Registration is complete. Your private bookshelf and reading history are ready.</p><div class="nv-welcome-steps"><p><b>01.</b> Browse books and explore genres</p><p><b>02.</b> Save titles to your personal shelf</p><p><b>03.</b> Pick up where you left off in your reading journal</p></div><button type="button" class="primary-btn" id="nv-welcome-start">Explore Novella →</button>`;
  $('#nv-welcome-start').onclick=()=>{closeAuth();navigate('explore');if(!results.length)browse('','',1)};
  return;
 }
 if(authMode==='delete'){
  root.innerHTML=`<span class="intro-label">ACCOUNT SECURITY</span><h2 id="modal-heading">Delete your account?</h2><p>This permanently deletes your profile, synced books, reading history, and reviews. It cannot be undone.</p><form id="nv-delete-form"><div class="field"><label for="nv-delete-confirm">Type DELETE to confirm</label><input id="nv-delete-confirm" autocomplete="off" required placeholder="DELETE"></div><button class="nv-danger-button" type="submit">Permanently delete account</button><button type="button" class="link-btn" id="nv-delete-cancel">Cancel</button><p id="auth-msg" class="form-msg" role="status"></p></form>`;
  $('#nv-delete-cancel').onclick=()=>{authMode='signin';closeAuth();navigate('settings')};
  $('#nv-delete-form').onsubmit=nvDeleteAccount;
  return;
 }
 root.innerHTML=`<span class="intro-label">YOUR NEXT CHAPTER STARTS HERE</span><h2 id="modal-heading" tabindex="-1">${authMode==='signup'?'Register for Novella':authMode==='forgot'?'Reset your password':authMode==='new-password'?'Set a new password':'Welcome back'}</h2><p>${authMode==='signup'?'Create an account before you sign in. Register with your email and password, or verify your Google account below.':authMode==='forgot'?'We will email you a password reset link.':authMode==='new-password'?'Choose a new password.':'Sign in with an account you have already registered.'}</p>
 ${!db?'<div class="alert">Accounts are temporarily unavailable.</div>':''}
 ${authMode==='new-password'?`<form id="auth-form"><div class="field"><label>New password</label><span class="nv-password-wrap"><input type="password" name="password" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters">${nvPasswordEye()}</span></div><div class="field"><label>Confirm new password</label><span class="nv-password-wrap"><input type="password" name="confirm_password" minlength="8" required autocomplete="new-password" placeholder="Enter it again">${nvPasswordEye()}</span></div><p class="nv-signin-saved-notice">If you registered through Google, setting a password lets you sign in with your email too. Google sign-in will still work.</p><button class="primary-btn">Save password</button><p id="auth-msg" class="form-msg" role="status"></p></form>`:
 authMode==='forgot'?`<form id="auth-form"><div class="field"><label>Email address</label><input type="email" name="email" required autocomplete="email"></div><button class="primary-btn">Send reset email</button><button type="button" class="link-btn" data-auth="signin">Back to sign in</button><p id="auth-msg" class="form-msg" role="status"></p></form>`:
 `<div class="auth-tabs" role="group" aria-label="Account options"><button class="${authMode==='signin'?'active':''}" data-auth="signin">Sign in</button><button class="${authMode==='signup'?'active':''}" data-auth="signup">Register</button></div>
 <form id="auth-form">${authMode==='signup'?'<div class="field"><label>Display name</label><input name="name" minlength="2" maxlength="50" autocomplete="name" required placeholder="What should we call you?"></div>':''}
 <div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required value="${esc(nvAuthEmailDraft)}" placeholder="you@example.com"></div><div class="field"><label>Password</label><span class="nv-password-wrap"><input name="password" type="password" ${authMode==='signup'?'minlength="8"':''} autocomplete="${authMode==='signup'?'new-password':'current-password'}" required placeholder="${authMode==='signup'?'At least 8 characters':'Enter your password'}">${nvPasswordEye()}</span></div>
 ${authMode==='signup'?'<label class="nv-check-row"><input type="checkbox" name="agreement" required> I agree to create a Novella account. My reviews will be public.</label>':''}
 ${authMode==='signin'?'<p class="nv-signin-saved-notice">One-tap account switching is automatically enabled after sign-in. On a shared device, sign out when finished.</p>':''}
 <button class="primary-btn" style="width:100%">${authMode==='signup'?'Create account':'Sign in'} →</button>${authMode==='signin'?'<button type="button" class="link-btn" data-auth="forgot">Forgot password?</button>':''}<p id="auth-msg" class="form-msg" role="status"></p></form>
 <p class="nv-signup-hint">${authMode==='signup'?'Already registered? Choose Sign in above.':'New to Novella? Choose Register above.'}</p>`}`;
 if($('#auth-form'))$('#auth-form').onsubmit=authSubmit;
 if(db&&['signin','signup'].includes(authMode)){
  const google=document.createElement('button');google.type='button';google.className='google-auth';
  google.innerHTML='<span class="google-symbol" aria-hidden="true">G</span><span>'+ (authMode==='signup'?'Register with Google':'Sign in with Google')+'</span>';
  google.onclick=async()=>{
   google.disabled=true;
   await nvStartGoogleSignIn(null,authMode==='signup');
   google.disabled=false;
  };
  $('#auth-form')?.before(google);
 }
}
function nvFriendlyAuthRateLimit(error){
 const raw=String(error?.message||'');
 const status=Number(error?.status||error?.statusCode||0);
 const isRateLimited=status===429||/rate.?limit|too many requests|for security purposes.*after\s+\d+\s+seconds?/i.test(raw);
 if(!isRateLimited)return '';
 const seconds=raw.match(/after\s+(\d+)\s+seconds?/i);
 if(seconds){
  const n=Math.max(1,Math.min(3600,Number(seconds[1])));
  return `Email request limit reached. Please try again in ${n} seconds. This wait is set by the sign-in provider; Google sign-in may work meanwhile.`;
 }
 if(/email/i.test(raw))return 'Email service limit reached. Please use Google sign-in or try again later; Novella cannot shorten this provider limit.';
 return 'Sign-in service is temporarily limiting requests. Please retry shortly or try Google sign-in.';
}
async function authSubmit(e){
 e.preventDefault();const msg=$('#auth-msg'),form=e.currentTarget;
 if(!db){msg.textContent='Account service unavailable';return}
 const btn=form.querySelector('button[type=submit],button.primary-btn');if(!btn||btn.disabled)return;
 btn.disabled=true;msg.textContent='Please wait…';const f=new FormData(form);
 const email=String(f.get('email')||'').trim(),password=String(f.get('password')||'');
 try{
  let r;
  if(authMode==='signup'){
   const name=String(f.get('name')||'').trim();
   if(name.length<2||!f.get('agreement'))throw Error('Enter a name and accept the registration notice.');
   r=await db.auth.signUp({email,password,options:{data:{name,novella_registration_requested:true},emailRedirectTo:location.origin+location.pathname}});
  }else if(authMode==='forgot')r=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  else if(authMode==='new-password'){if(!me&&!recoveryMode)throw Error('Sign in with Google or your current account first to set an email password.');if(password!==String(f.get('confirm_password')||''))throw Error('Passwords do not match.');r=await db.auth.updateUser({password});}
  else r=await db.auth.signInWithPassword({email,password});
  if(r.error)throw r.error;
  msg.style.color='#43876b';
  msg.textContent=authMode==='signup'?'Registration started. Confirm your email if asked, then sign in.':authMode==='forgot'?'If that email is registered, check your inbox.':authMode==='new-password'?'Password updated successfully.':'Checking registration…';
  if(authMode==='signin'){if(r.data?.user){await nvCheckRegistration(r.data.user,'email-signin');if(me?.id===r.data.user.id&&nvProfile)nvMarkStartupChosen()}}
  else if(authMode==='new-password'){authMode='signin';closeAuth();if(recoveryMode){recoveryMode=false;history.replaceState({},'',location.pathname)}notify('Password saved. Email and password sign-in is now available for this account.');}
  else if(authMode==='signup'&&r.data?.session?.user){await nvCheckRegistration(r.data.session.user,'email-register')}
 }catch(err){
  msg.style.color='#bb5371';
  const rateMessage=nvFriendlyAuthRateLimit(err);
  if(rateMessage)msg.textContent=rateMessage;
  else if(authMode==='signin'){
   const remembered=nvKnownAccounts.find(a=>a.email.toLowerCase()===email.toLowerCase());
   if(remembered?.authMethod==='google')msg.textContent='This account was signed in with Google. Use “Sign in with Google” above, or first sign in with Google and set an email password under Settings.';
   else msg.textContent='Could not sign in with that email and password. Check your details, use Forgot password, or continue with Google if you registered there.';
  }
  else msg.textContent=err?.message||'Unable to complete request.';
 }finally{btn.disabled=false}
}
function userUI(){
 if(nvAnnexUnlockedOwner&&nvAnnexUnlockedOwner!==nvAnnexOwner()){nvAnnexUnlockedOwner='';nvAnnexExpiresAt=0;nvAnnexRestoredOwner='';++nvAnnexRequestEpoch;}
 if(nvAnnexDetailOwner&&nvAnnexDetailOwner!==nvAnnexOwner()&&screen==='detail'){nvAnnexDetailOwner='';navigate('annex')}
 const name=nvProfile?.display_name||me?.email?.split('@')[0]||'Guest reader';
 $('#side-name').textContent=name;
 $('#side-status').textContent=me&&nvProfile?'Your private reading space':'Guest reading space';
 const sidebarAvatar=$('#side-account .avatar');if(sidebarAvatar){const avatar=nvCurrentAvatar();sidebarAvatar.innerHTML=avatar?`<img class="nv-avatar-image" alt="" src="${esc(avatar)}">`:esc(name[0].toUpperCase());}
 $('#auth-button').hidden=!!(me&&nvProfile);
 $('#auth-button').textContent='Sign in →';
 nvRefreshAccountMenu();
}
async function nvDeleteAccount(e){
 e.preventDefault();const val=$('#nv-delete-confirm')?.value||'',msg=$('#auth-msg'),btn=e.currentTarget.querySelector('[type=submit]');
 if(val!=='DELETE'){msg.textContent='Type DELETE exactly to confirm.';return}
 if(!me||!db){msg.textContent='You must be signed in.';return}
 btn.disabled=true;msg.textContent='Deleting account securely…';
 try{
  const {data:{session},error}=await db.auth.getSession();if(error||!session?.access_token)throw Error('Please sign in again to confirm your identity.');
  const response=await fetch('/api/account/delete',{method:'POST',headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'}),cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error||(response.status===404?'Account deletion is not enabled on this site.':'Account deletion could not be completed.'));
  const deletedId=me.id;
  try{await db.auth.signOut({scope:'local'})}catch{}
  nvForgetKnownAccount(deletedId);
  try{await nvPhotoOriginalRemove(deletedId)}catch{}
  ++nvAuthEpoch;me=null;nvProfile=null;nvPendingGoogle=null;shelves=[];historyRows=[];
  clearNovellaDeviceData();userUI();authMode='signin';closeAuth();navigate('home');notify('Account permanently deleted.');
 }catch(err){msg.textContent=err.message||'Could not delete account. Try again.'}
 finally{btn.disabled=false}
}
async function nvProfileAction(action){
 if(action==='edit-avatar'){await nvPhotoEditorOpen();return}
 if(action==='upload-avatar'){document.getElementById('nv-profile-avatar-input')?.click();return}
 if(action==='remove-avatar'){
  if(!me||!nvCurrentAvatar())return;
  const ok=await nvSaveIdentityMeta({novella_avatar:null},'#nv-avatar-msg','Removing picture…','Picture removed.');
  if(ok){try{await nvPhotoOriginalRemove(me?.id)}catch{}if(screen==='profile')paint()}
  return;
 }
 if(action==='switch'){nvShowPicker();return}
 if(action==='settings'){navigate('settings');return}
 if(action==='signout'){try{await nvSignOut()}catch{notify('Sign-out failed. Please retry.')}return}
 if(action==='password'){openAuth('new-password');return}
 if(action==='delete'){openAuth('delete');return}
 if(action==='export'){
  if(!nvRequireMember('export your saved books and reading history'))return;
  const data={exported_at:new Date().toISOString(),account:me.email,shelves,history:historyRows,reading_positions:nv205LocalRows(me.id)};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const link=document.createElement('a');const href=URL.createObjectURL(blob);link.href=href;link.download='novella-reading-data.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),2000);return;
 }
 if(action==='local'){
  if(!confirm('Clear Novella data on this browser? Cloud data stays, but offline changes not yet synced will be lost.'))return;
  clearNovellaDeviceData();notify('Local Novella data cleared');paint();if(nvMember())void nv205LoadSummary(me.id);return;
 }
 if(!me||!db)return;
 if(action==='reader-state'){
  if(!confirm('Delete your synced reading progress and bookmarks on every device? Saved books and the reading journal stay. This cannot be undone.'))return;
  const owner=me.id,client=db;
  try{
   const {error}=await client.from(NV205_TABLE).delete().eq('user_id',owner);
   if(error)throw error;
   if(me?.id!==owner||db!==client)return;
   nv205ResetMemory();
   const prefix=KEY+'reader-state-v205:'+encodeURIComponent(owner)+':';
   try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&(key.startsWith(prefix)||key.startsWith(KEY+'progress:'+owner+':')))localStorage.removeItem(key)}}catch{}
   notify('Reading positions and bookmarks cleared for this Novella account.');paint();
  }catch(err){if(me?.id===owner)notify('Could not clear cloud positions: '+(err?.message||'Try again.'))}
  return;
 }
 if(action==='history'||action==='shelf'){
  const table=action==='history'?'reading_history':'shelves',label=action==='history'?'reading history':'saved bookshelf';
  const warning=action==='history'
   ?'Delete reading history on all devices? Saved books stay. This cannot be undone.'
   :'Remove all saved books on all devices? Reading history stays. This cannot be undone.';
  if(!confirm(warning))return;
  const {error}=await db.from(table).delete().eq('user_id',me.id);
  if(error){notify('Could not clear data: '+error.message);return}
  if(action==='history')historyRows=[];else shelves=[];
  notify('Your synced '+label+' has been cleared');paint();return;
 }
}
async function initAuth(){
 if(!db){userUI();return}
 try{
  const {data,error}=await db.auth.getSession();if(error)throw error;
  const intent=nvIntentTake(),expectedId=nvExpectedGoogleTake();
  if(expectedId&&data?.session?.user?.id&&data.session.user.id!==expectedId){
   try{await db.auth.signOut({scope:'local'})}catch{}
   ++nvAuthEpoch;me=null;nvProfile=null;shelves=[];historyRows=[];userUI();
   nvShowPicker('Google returned a different account. Choose the matching Google account to continue.');
  }else if(data?.session?.user)await nvCheckRegistration(data.session.user,intent);
  else{
   me=null;nvProfile=null;userUI();
   if(nvAuthReturnAtBoot&&(intent.startsWith('google-')||nvAuthRedirectErrorAtBoot)){
    // Do not silently return the user to the same saved-account chooser.
    nvStartupPickerAttempted=true;nvMarkStartupChosen();
    showAuthNotice('Google sign-in did not finish. Please try signing in again. If this repeats, check the Supabase redirect URLs and allow cookies for Novella.','signin');
   }
  }
  db.auth.onAuthStateChange((event,session)=>{
   if((event==='TOKEN_REFRESHED'||event==='SIGNED_IN')&&session){
    nvUpdateKnownTokenFromEvent(session);
    // Confirmation links can refresh the same session without changing the account ID.
    if(session.user?.id===me?.id&&(session.user.email!==me.email||
      nvAvatarData(session.user.user_metadata?.novella_avatar)!==nvCurrentAvatar())){
      setTimeout(()=>{if(me?.id!==session.user.id)return;me=session.user;nvSyncRememberedIdentity(me);userUI();if(screen==='profile')paint();},0);
    }
   }
   if(event==='USER_UPDATED'&&session?.user?.id===me?.id){
    setTimeout(()=>{if(me?.id!==session.user.id)return;me=session.user;nvSyncRememberedIdentity(me);userUI();if(screen==='profile')paint();},0);
   }
   if(event==='PASSWORD_RECOVERY'){recoveryMode=true;setTimeout(()=>openAuth('new-password'),0);return}
   if(event==='SIGNED_IN'){
    // Supabase callbacks must not await other Auth APIs inside the callback.
    setTimeout(()=>{
     if(nvPickerBusy)return;
     const current=nvIntentTake();
     if(session?.user&&nvPendingGoogle?.id!==session.user.id&&(!me||me.id!==session.user.id))nvCheckRegistration(session.user,current).catch(()=>{});
    },0);
   }else if(event==='SIGNED_OUT')setTimeout(()=>{if(!nvPendingGoogle&&!me){nvProfile=null;userUI()}},0);
  });
  if(location.hash.includes('type=recovery')){recoveryMode=true;openAuth('new-password')}
  else setTimeout(nvMaybeAskOnOpen,160);
 }catch(error){
  me=null;nvProfile=null;userUI();
  if(nvAuthReturnAtBoot){
   nvStartupPickerAttempted=true;nvMarkStartupChosen();
   showAuthNotice('Your Google sign-in could not be completed. Please try again. If it keeps happening, check the Supabase redirect settings and browser cookie permissions.','signin');
  }else notify('Account service temporarily unavailable. Guest browsing still works.');
 }
}


async function nvSaveIdentityMeta(fields,statusId,working='Saving…',done='Saved.'){
 const status=$(statusId),owner=me?.id,epoch=nvAuthEpoch;
 if(!db||!owner){if(status)status.textContent='Please sign in again.';return false}
 if(status)status.textContent=working;
 try{
  const {data,error}=await db.auth.updateUser({data:fields});if(error)throw error;
  if(me?.id!==owner||epoch!==nvAuthEpoch)throw Error('Your account changed. Please check the updated profile.');
  me=data?.user||{...me,user_metadata:{...me.user_metadata,...fields}};
  nvSyncRememberedIdentity(me);userUI();if(status)status.textContent=done;
  return true;
 }catch(err){if(status)status.textContent=err?.message||'Unable to update this profile.';return false;}
}
/* Novella photo originals are browser-local (IndexedDB), account-scoped, and never sent
   to Supabase. Only the cropped avatar is synced. Browser data clearing removes originals. */
const NV_ORIGINAL_PHOTO_DB='novella-private-photo-originals-v1';
function nvPhotoVersion(data){const s=String(data||'');return s?s.length+'|'+s.slice(0,64)+'|'+s.slice(-64):'';}
function nvPhotoOriginalDB(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(Error('Original-photo storage is unavailable here.'));return}
  const request=indexedDB.open(NV_ORIGINAL_PHOTO_DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('photos'))request.result.createObjectStore('photos')};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Could not open photo storage.'));
  request.onblocked=()=>reject(Error('Photo storage is blocked by another open tab.'));
 });
}
async function nvPhotoOriginalGet(owner,avatar){
 if(!owner)return null;
 const db=await nvPhotoOriginalDB();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly');const req=tx.objectStore('photos').get(owner);req.onsuccess=()=>{const row=req.result;resolve(row?.blob instanceof Blob&&row.version===nvPhotoVersion(avatar)?row.blob:null)};req.onerror=()=>reject(req.error||Error('Could not read original photo.'))})}
 finally{db.close()}
}
async function nvPhotoOriginalPut(owner,file,avatar){
 if(!owner||!(file instanceof Blob))return false;
 const db=await nvPhotoOriginalDB();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({blob:file,version:nvPhotoVersion(avatar)},owner);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||Error('Could not preserve original photo.'));tx.onabort=()=>reject(tx.error||Error('Original photo storage was aborted.'))})}
 finally{db.close()}
}
async function nvPhotoOriginalRemove(owner){
 if(!owner)return;
 const db=await nvPhotoOriginalDB();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(owner);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Could not clear photo.'))})}
 finally{db.close()}
}
function nvPhotoOriginalClearBrowser(){try{indexedDB.deleteDatabase(NV_ORIGINAL_PHOTO_DB)}catch{}}

/* V11.29: local crop editor, only the final compressed square leaves the device for Supabase metadata. */
let nvPhotoEdit=null;
function nvPhotoEditorClose(){
 const modal=document.getElementById('nv-photo-editor');if(modal)modal.remove();
 nvPhotoEdit=null;document.body.style.overflow='';
 if(screen==='profile')document.querySelector('[data-profile-action="edit-avatar"]')?.focus();
}
function nvPhotoEditorCanvas(){return document.getElementById('nv29-photo-canvas')}
function nvPhotoCropGeometry(state,canvasSize=360){
 const turned=state.angle%180!==0;
 const w=turned?state.img.naturalHeight:state.img.naturalWidth;
 const h=turned?state.img.naturalWidth:state.img.naturalHeight;
 const scale=Math.max(canvasSize/w,canvasSize/h)*state.zoom;
 return {scale,maxX:Math.max(0,(w*scale-canvasSize)/2),maxY:Math.max(0,(h*scale-canvasSize)/2)};
}
function nvPhotoEditorDraw(){
 const st=nvPhotoEdit,canvas=nvPhotoEditorCanvas();if(!st||!canvas)return;
 const c=canvas.getContext('2d');if(!c)return;
 const size=canvas.width;const g=nvPhotoCropGeometry(st,size);
 st.offsetX=Math.max(-g.maxX,Math.min(g.maxX,st.offsetX));
 st.offsetY=Math.max(-g.maxY,Math.min(g.maxY,st.offsetY));
 c.save();c.clearRect(0,0,size,size);c.fillStyle='#e7e7ef';c.fillRect(0,0,size,size);
 c.translate(size/2+st.offsetX,size/2+st.offsetY);c.rotate(st.angle*Math.PI/180);
 c.scale(g.scale*(st.flip?-1:1),g.scale);c.drawImage(st.img,-st.img.naturalWidth/2,-st.img.naturalHeight/2);
 c.restore();
 const label=document.getElementById('nv29-zoom-amount');if(label)label.textContent=Math.round(st.zoom*100)+'%';
}
function nvPhotoEditorTemplate(){return `<div id="nv-photo-editor" class="nv29-photo-overlay" role="presentation"><section class="nv29-photo-modal" role="dialog" aria-modal="true" aria-labelledby="nv29-photo-title"><header class="nv29-photo-head"><div><div class="nv29-kicker">NOVELLA / PHOTO STUDIO</div><h2 id="nv29-photo-title">Make it yours.</h2><p>Zoom, drag and rotate until your photo looks just right.</p></div><button type="button" class="nv29-photo-close" data-nv-photo-action="cancel" aria-label="Close photo editor">×</button></header><div class="nv29-photo-body"><div class="nv29-photo-crop-wrap"><canvas id="nv29-photo-canvas" class="nv29-photo-canvas" width="360" height="360" tabindex="0" role="img" aria-label="Photo crop area. Drag or use arrow keys to move the photo"></canvas></div><div class="nv29-photo-side"><label for="nv29-photo-zoom">Zoom <output id="nv29-zoom-amount">100%</output></label><input type="range" min="100" max="350" step="5" value="100" id="nv29-photo-zoom"><div class="nv29-photo-tools"><button type="button" data-nv-photo-action="left">↶ Rotate left</button><button type="button" data-nv-photo-action="right">↷ Rotate right</button><button type="button" data-nv-photo-action="flip">⇋ Flip</button><button type="button" data-nv-photo-action="reset">Reset crop</button></div><p>Drag to move the picture, or focus the preview and use arrow keys. The circle shows what people will see.</p><p>Your original stays in this browser for future edits. Only the cropped avatar syncs across devices.</p></div></div><footer class="nv29-photo-foot"><p id="nv29-editor-msg" role="status" aria-live="polite">Ready to save.</p><button type="button" class="secondary-btn" data-nv-photo-action="cancel">Cancel</button><button type="button" class="primary-btn nv29-photo-save" data-nv-photo-action="save">Save picture</button></footer></section></div>`}
async function nvPhotoEditorOpen(file=null){
 const owner=me?.id,epoch=nvAuthEpoch,msg=document.getElementById('nv-avatar-msg');
 if(!owner||!db){if(msg)msg.textContent='Sign in to edit your photo.';return}
 const previous=nvCurrentAvatar();
 if(!file&&!previous){document.getElementById('nv-profile-avatar-input')?.click();return}
 if(file&&(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)||file.size>10*1024*1024)){if(msg)msg.textContent='Use a JPG, PNG, WebP, or GIF under 10 MB.';return}
 try{
  if(msg)msg.textContent='Opening photo studio…';
  let original=null;
  if(!file){try{original=await nvPhotoOriginalGet(owner,previous)}catch{/* Fallback to existing cropped avatar if local storage is disabled. */}}
  const fullSource=file||original;
  const src=fullSource?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(Error('Could not read the original photo.'));reader.readAsDataURL(fullSource)}):previous;
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('This photo cannot be opened.'));image.src=src});
  if(me?.id!==owner||nvAuthEpoch!==epoch)return;
  if(!img.naturalWidth||!img.naturalHeight)throw Error('Invalid photo.');
  nvPhotoEditorClose();
  nvPhotoEdit={img,owner,epoch,originalToStore:file||null,hasOriginal:!!fullSource,zoom:1,angle:0,flip:false,offsetX:0,offsetY:0,drag:null};
  document.body.insertAdjacentHTML('beforeend',nvPhotoEditorTemplate());document.body.style.overflow='hidden';
  const canvas=nvPhotoEditorCanvas();
  canvas.addEventListener('pointerdown',e=>{if(!nvPhotoEdit||e.button!==0)return;canvas.setPointerCapture?.(e.pointerId);nvPhotoEdit.drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:nvPhotoEdit.offsetX,oy:nvPhotoEdit.offsetY};e.preventDefault()});
  canvas.addEventListener('pointermove',e=>{const st=nvPhotoEdit;if(!st?.drag||st.drag.id!==e.pointerId)return;const rect=canvas.getBoundingClientRect(),k=canvas.width/rect.width;st.offsetX=st.drag.ox+(e.clientX-st.drag.x)*k;st.offsetY=st.drag.oy+(e.clientY-st.drag.y)*k;nvPhotoEditorDraw()});
  for(const end of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(end,()=>{if(nvPhotoEdit)nvPhotoEdit.drag=null});
  canvas.addEventListener('keydown',e=>{if(!nvPhotoEdit)return;const d={ArrowUp:[0,-9],ArrowDown:[0,9],ArrowLeft:[-9,0],ArrowRight:[9,0]}[e.key];if(d){e.preventDefault();nvPhotoEdit.offsetX+=d[0];nvPhotoEdit.offsetY+=d[1];nvPhotoEditorDraw()}});
  document.getElementById('nv29-photo-zoom').addEventListener('input',e=>{if(nvPhotoEdit){nvPhotoEdit.zoom=Number(e.target.value)/100;nvPhotoEditorDraw()}});
  document.querySelector('#nv-photo-editor [data-nv-photo-action="save"]')?.focus();nvPhotoEditorDraw();if(msg)msg.textContent='';
  if(!fullSource){const note=document.querySelector('.nv29-photo-side p:last-child');if(note)note.textContent='This older photo was stored only as a crop. Upload the original once to restore the full image for future edits.';}
 }catch(err){if(msg)msg.textContent=err?.message||'Could not open photo editor.'}
}
async function nvPhotoEditorSave(){
 const st=nvPhotoEdit,msg=document.getElementById('nv29-editor-msg'),button=document.querySelector('#nv-photo-editor [data-nv-photo-action="save"]');
 if(!st||st.saving||!me||me.id!==st.owner||nvAuthEpoch!==st.epoch){if(msg)msg.textContent='Account changed. Open the photo editor again.';return}
 st.saving=true;if(button)button.disabled=true;
 try{
  if(msg)msg.textContent='Optimizing your photo…';
  const source=nvPhotoEditorCanvas();const out=document.createElement('canvas');out.width=256;out.height=256;
  const ctx=out.getContext('2d');if(!ctx||!source)throw Error('Photo editing is unavailable on this device.');
  ctx.drawImage(source,0,0,256,256);
  let data='';
  for(const q of [.84,.72,.6,.47]){const webp=out.toDataURL('image/webp',q);const v=webp.startsWith('data:image/webp;')?webp:out.toDataURL('image/jpeg',q);if(nvAvatarData(v)){data=v;break}}
  if(!data){for(const size of [192,160,128]){out.width=size;out.height=size;out.getContext('2d').drawImage(source,0,0,size,size);for(const q of [.7,.55]){const v=out.toDataURL('image/jpeg',q);if(nvAvatarData(v)){data=v;break}}if(data)break}}
  if(!data)throw Error('Photo could not fit the account image limit. Try another photo.');
  if(me?.id!==st.owner||nvAuthEpoch!==st.epoch)throw Error('Account changed during photo editing.');
  const okay=await nvSaveIdentityMeta({novella_avatar:data},'#nv29-editor-msg','Saving your photo…','Photo saved.');
  if(okay){
   if(st.originalToStore){try{await nvPhotoOriginalPut(st.owner,st.originalToStore,data)}catch{notify('Picture saved, but browser storage could not keep the original for future edits.')}}
   nvPhotoEditorClose();if(screen==='profile')paint()
  }
 }catch(err){if(msg)msg.textContent=err?.message||'Could not save photo.'}
 finally{if(st)st.saving=false;if(button?.isConnected)button.disabled=false}
}
// The photo studio is modal; backdrop clicks can dismiss it just like Cancel.
// If cropping was changed, ask before discarding those unsaved adjustments.
document.addEventListener('click',e=>{
 if(e.target?.id!=='nv-photo-editor'||!nvPhotoEdit||nvPhotoEdit.saving)return;
 const st=nvPhotoEdit;
 const changed=Boolean(st.flip||st.angle||Math.abs((st.zoom||1)-1)>0.001||Math.abs(st.offsetX||0)>0.5||Math.abs(st.offsetY||0)>0.5);
 if(changed&&!confirm('Discard your unsaved photo changes?'))return;
 nvPhotoEditorClose();
});
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-nv-photo-action]');if(!button)return;
 e.preventDefault();const a=button.dataset.nvPhotoAction;
 if(a==='cancel'){if(!nvPhotoEdit?.saving)nvPhotoEditorClose();return}
 const st=nvPhotoEdit;if(!st)return;
 if(a==='save'){void nvPhotoEditorSave();return}
 if(a==='left'||a==='right'){st.angle=(st.angle+(a==='left'?270:90))%360;st.offsetX=st.offsetY=0}
 if(a==='flip')st.flip=!st.flip;
 if(a==='reset'){st.angle=0;st.flip=false;st.zoom=1;st.offsetX=st.offsetY=0;const slider=document.getElementById('nv29-photo-zoom');if(slider)slider.value='100'}
 nvPhotoEditorDraw();
});
document.addEventListener('keydown',e=>{if(!nvPhotoEdit)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!nvPhotoEdit.saving)nvPhotoEditorClose();return}if(e.key==='Tab'){
 const dialog=document.querySelector('#nv-photo-editor .nv29-photo-modal');const focusable=[...dialog.querySelectorAll('button:not(:disabled),input,canvas[tabindex]')];const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}},true);
// Show an unsaved bio preview without sending it to the server.
document.addEventListener('input',e=>{if(e.target?.id==='nv-profile-bio'){const pv=document.getElementById('nv29-bio-preview');if(pv)pv.textContent=e.target.value.trim()||'Your reading interests will appear here when you write an introduction.'}});
// Search personal collections without rebuilding inputs and losing focus.
document.addEventListener('input',e=>{
 if(e.target.id==='nv-journal-search'){nvJournalQuery=e.target.value;nvRefreshJournalResults()}
 if(e.target.id==='nv-shelf-search'){nvShelfQuery=e.target.value;nvRefreshShelfResults()}
});
// Event delegation: works for freshly-rendered pages and saved cards.
document.addEventListener('click',async e=>{
 const t=e.target.closest('button,a,[data-book]');if(!t)return;
 if(t.hasAttribute('data-nv218-return-results')){e.preventDefault();nv218RestoreBrowse();return;}
 if(t.hasAttribute('data-nv207-reset')){e.preventDefault();nv207ResetCompleteFilters();return}
 if(t.hasAttribute('data-nv207-clear')){
  e.preventDefault();const which=t.dataset.nv207Clear;
  if(which==='genre'){selectedGenre='';browse(searchText,'',1)}
  else if(which==='query'){const input=document.getElementById('nv207-complete-query');if(input)input.value='';browse('',selectedGenre,1)}
  else if(which==='length'){nvCompleteLength='all';nvUpdateBrowse()}
  else if(which==='sort'){sort='relevance';nvUpdateBrowse()}
  return;
 }
 if(t.id==='nv207-complete-surprise'){
  const books=displayResults();if(!books.length)return;
  const used=getLocal('complete-surprise-history-v207',[]),set=new Set(Array.isArray(used)?used:[]);
  const available=books.filter(b=>!set.has(id(b)));
  const pick=(available.length?available:books)[Math.floor(Math.random()*(available.length?available.length:books.length))];
  putLocal('complete-surprise-history-v207',[...(available.length?Array.isArray(used)?used:[]:[]),id(pick)].slice(-250));
  void showBook(id(pick));return;
 }
 if(t.dataset.nvBrowseScope){
  const only=t.dataset.nvBrowseScope==='complete';
  if(nvCompleteOnly===only)return;
  nvCompleteOnly=only;source=only?'gutenberg':'all';sort='relevance';nvCompleteLength='all';
  const global=$('#global-search');if(global)global.value='';
  if(typeof nvSearch!=='undefined'&&nvSearch)nvSearch.value='';
  $('#nv-search-clear')?.setAttribute('hidden','');
  browse('','',1);return;
 }
 if(t.hasAttribute('data-nv-browse-clear')){
  const global=$('#global-search');if(global)global.value='';
  if(typeof nvSearch!=='undefined'&&nvSearch)nvSearch.value='';
  browse('','',1);return;
 }
 if(t.hasAttribute('data-nv208-rec-reset')){nv208RecMood='all';nv208RecComplete=false;nv201SuggestionMemo=null;const mood=document.getElementById('nv208-rec-mood');if(mood)mood.value='all';const complete=document.getElementById('nv208-rec-complete');if(complete)complete.checked=false;nv208RefreshRecommendations();return}
 if(t.hasAttribute('data-nv208-new-collection')){
  if(!nvRequireMember('organize your bookshelf'))return;
  const field=document.getElementById('nv208-collection-name');const name=String(field?.value||'').trim().replace(/\s+/g,' ').slice(0,32);
  if(!name){notify('Enter a collection name first.');field?.focus();return}
  const groups=nv208Collections();if(groups.names.some(n=>n.toLowerCase()===name.toLowerCase())){notify('That collection already exists.');return}
  if(groups.names.length>=12){notify('You can create up to 12 collections on this device.');return}
  groups.names.push(name);if(nv208StoreCollections(groups)){nv208ShelfCollection='all';paint();notify('Collection created. Choose it on any book card.')}else notify('This browser cannot save collections. Check site storage permissions.');return;
 }
 if(t.hasAttribute('data-nv208-remove-collection')){
  if(!nvMember()||nv208ShelfCollection==='all')return;
  const name=nv208ShelfCollection;if(!confirm('Remove the collection "'+name+'" from this device? Books will remain saved.'))return;
  const groups=nv208Collections();groups.names=groups.names.filter(n=>n!==name);for(const [key,val] of Object.entries(groups.assign))if(val===name)delete groups.assign[key];
  if(!nv208StoreCollections(groups)){notify('Could not save that change on this device.');return;}nv208ShelfCollection='all';paint();notify('Collection removed; books are still saved.');return;
 }
 if(t.dataset.auth){openAuth(t.dataset.auth);return}
 if(t.dataset.profileAction){await nvProfileAction(t.dataset.profileAction);return}
 if(t.dataset.nvSettings==='open-picker'){nvShowPicker();return}
 if(t.dataset.resetCatalogue){source='all';sort='relevance';$('#global-search').value='';if(typeof nvSearch!=='undefined'&&nvSearch)nvSearch.value='';browse('','',1);return}
 if(t.dataset.retry){browse(searchText,selectedGenre,1);return}
 if(t.dataset.journalTab){nvJournalFilter=t.dataset.journalTab;nvRefreshJournalResults();return}
 if(t.dataset.nv206Open){const row=nv206Rows(me?.id).find(r=>r.note_id===t.dataset.nv206Open);if(!row)return;if(row.edition_key.startsWith('file:')){readerModal(null,{localOnly:true});notify('Open the original ebook file to revisit this note.');return}const b=matchingBook(row.book_key)||remember({source:row.book_key.split(':')[0],id:row.book_key.split(':').slice(1).join(':'),title:row.title,author:row.author,cover:'',formats:{},genres:[]});nv206TargetNote=row;nvStartSmartReader(b);return}
 if(t.hasAttribute('data-nv-clear-journal')){nvJournalQuery='';nvJournalFilter='all';paint();$('#nv-journal-search')?.focus();return}
 if(t.hasAttribute('data-nv-clear-shelf')){nvShelfQuery='';shelfFilter='all';nv208ShelfSort='recent';nv208ShelfCollection='all';nv208ShelfGenre='all';paint();$('#nv-shelf-search')?.focus();return}
 if(t.dataset.shelfTab){shelfFilter=t.dataset.shelfTab;paint();return}
 if(t.dataset.nv205Favorite){e.stopPropagation();void nv205ToggleFavorite(t.dataset.nv205Favorite);return}
 if(t.dataset.nv205Continue){e.stopPropagation();const row=shelves.find(r=>r.book_key===t.dataset.nv205Continue);if(row)nvStartSmartReader(bookForRow(row));return}
 if(t.id==='nv210-series-expand'){const panel=document.querySelector('#nv210-all-series');if(panel){panel.hidden=!panel.hidden;t.setAttribute('aria-expanded',String(!panel.hidden))}return}
 if(t.dataset.nv210SeriesClose!==undefined){const host=document.querySelector('#nv210-browse-series-detail');if(host)host.replaceChildren();return}
 if(t.dataset.nv210Series){nv210OpenSeries(t.dataset.nv210Series);return}
 if(t.dataset.nv210Find){void nv210FindSeriesTitle(t.dataset.nv210Find,t.dataset.nv210Author,t);return}
 if(t.dataset.nv210Offline){e.stopPropagation();const b=matchingBook(t.dataset.nv210Offline);if(b)void nv210SaveFromDetail(b,t);return}
 if(t.dataset.save){e.stopPropagation();const b=matchingBook(t.dataset.save);if(b)save(b);return}
 if(t.dataset.book){$('#suggestions').classList.add('hidden');await showBook(t.dataset.book);return}
 if(t.dataset.view){if(t.dataset.view==='explore'&&!results.length){browse('','',1);return}navigate(t.dataset.view);return}
 if(t.id==='nv43-filters-toggle'){const host=t.closest('.nv43-filters-wrap');const open=host.classList.toggle('nv43-filters-open');t.setAttribute('aria-expanded',String(open));return;}
 if(t.dataset.nv43Scroll){document.getElementById(t.dataset.nv43Scroll)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
 if(t.dataset.genre!==undefined){source=nvCompleteOnly?'gutenberg':'all';if(!nvCompleteOnly)sort='relevance';const global=$('#global-search');if(global)global.value='';browse('',t.dataset.genre,1);nv43FocusGenreResults();return}
 if(t.dataset.freeEdition){
   const b=matchingBook(t.dataset.freeEdition);if(!b)return;
   if(t.disabled)return;
   const label=t.textContent;t.disabled=true;t.textContent='Checking an open edition…';
   try{const free=await findFreeEdition(b);
     if(!free){notify('No matching public-domain edition was found. Try another edition or read a file you own.');return}
     // Do not mutate the original work or mix account shelf identifiers.
     readerModal(free);
   }catch(err){notify('The free-edition catalogue is unavailable. Please try again.');}
   finally{if(t.isConnected){t.disabled=false;t.textContent=label}}
   return;
 }
 if(t.dataset.readLocal){const b=matchingBook(t.dataset.readLocal);readerModal(b||null,{localOnly:true});return}
 if(t.dataset.read){const b=matchingBook(t.dataset.read);if(b)nvStartSmartReader(b);return}
 if(t.dataset.share){const link=new URL(location.href);link.searchParams.set('book',t.dataset.share);try{await navigator.clipboard.writeText(link.href);notify('Book link copied!')}catch{notify('Copy the link from your address bar to share.')}return}
 if(t.dataset.remove){removeShelf(t.dataset.remove);return}
 if(t.dataset.deleteReview&&me&&db){if(!confirm('Delete your review?'))return;const {error}=await db.from('reviews').delete().eq('id',t.dataset.deleteReview).eq('user_id',me.id);notify(error?error.message:'Review deleted');if(active)loadReviews(active);return}
 if(t.hasAttribute('data-nv219-retry')){
  e.preventDefault();if(searchBusy)return;
  if(results.length)nvSaveSnapshot(searchText,selectedGenre,nvBrowseSnapshotSource(),results,hasMore);
  nv219ForceRefreshUntil=Date.now()+15000;
  browse(searchText,selectedGenre,page,{preserve:true});
  return;
 }
 if(t.id==='nv204-complete-retry'){
  nv219ForceRefreshUntil=Date.now()+15000;fetchError='';browse(searchText,selectedGenre,page,{preserve:true});return;
 }
 if(t.id==='load-more'){
  if(t.hasAttribute('data-next-collection')){
   const nextGenre=nvNextGenres('browse-more-genre-cycle',1)[0]||'Fiction';
   source=nvCompleteOnly?'gutenberg':'all';sort='relevance';browse('',nextGenre,1);return;
  }
  if(nvRevealBooks())return;
  if(!searchBusy&&hasMore)browse(searchText,selectedGenre,page+1);
  return;
 }
 if(t.id==='nv-refresh-picks'){if(!homeRefreshPending)refreshHomePicks();return}
 if(t.id==='clear-guest'){if(!confirm('Clear your guest reading shelf and history on this device?'))return;guestShelf=[];guestHistory=[];putLocal('guest-shelf',[]);putLocal('guest-history',[]);try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith(KEY+'progress:'))localStorage.removeItem(k)}}catch{}notify('Guest data cleared');if(screen==='info')paint();return}
});

document.addEventListener('submit',async e=>{
 if(e.target.id==='nv-annex-form'){e.preventDefault();await nvAnnexFormSubmit(e.target);return}
 if(e.target.id==='nv-annex-search'){
  e.preventDefault();if(!nvAnnexUnlocked())return;
  const q=String(e.target.elements.q.value||'').trim();if(!q)return;
  const button=e.target.querySelector('button');button.disabled=true;button.textContent='Searching…';
  try{
   const response=await getOL(q,1,48);
   nvAnnexSearchResults=nvDistinct(response.items||[]).filter(nvAnnexIsFlagged);
   paint();
   if(!nvAnnexSearchResults.length)notify('No matching titles found in this collection.');
  }catch{notify('The catalogue is temporarily unavailable.');}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Search'}}
  return;
 }
});
document.addEventListener('click',e=>{
 const eye=e.target.closest('[data-nv-password-toggle]');
 if(eye){
  e.preventDefault();const input=eye.closest('.nv-password-wrap')?.querySelector('input');
  if(!input)return;
  const visible=input.type==='password';
  input.type=visible?'text':'password';
  eye.setAttribute('aria-pressed',String(visible));
  eye.setAttribute('aria-label',visible?'Hide password':'Show password');
  eye.title=visible?'Hide password':'Show password';
  input.focus({preventScroll:true});
  return;
 }
 const b=e.target.closest('[data-nv-annex-lock]');if(b)void nvAnnexLock();
});
document.addEventListener('change',e=>{if(e.target?.id==='nv-profile-avatar-input'&&e.target.files?.length){const file=e.target.files[0];e.target.value='';void nvPhotoEditorOpen(file)}});
document.addEventListener('keydown',e=>{if(e.target?.classList?.contains('nv-avatar-upload')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('#nv-profile-avatar-input')?.click()}});
document.addEventListener('submit',async e=>{
 if(e.target.id==='nv-profile-email-form'){
  e.preventDefault();const email=$('#nv-profile-email')?.value?.trim().toLowerCase()||'',msg=$('#nv-profile-email-msg'),btn=e.target.querySelector('button[type=submit]');
  if(!me||!db){msg.textContent='Please sign in first.';return}
  if(!e.target.reportValidity()||email.length>254)return;
  if(email===String(me.email||'').toLowerCase()){msg.textContent='This is already your email address.';return}
  const owner=me.id,epoch=nvAuthEpoch;
  btn.disabled=true;msg.textContent='Requesting email change…';
  try{const {data,error}=await db.auth.updateUser({email,options:{emailRedirectTo:location.origin+location.pathname+'?view=profile'}});if(error)throw error;
   if(me?.id!==owner||epoch!==nvAuthEpoch){msg.textContent='Account changed; check the current profile.';return}
   if(data?.user?.email===email){me=data.user;nvSyncRememberedIdentity(me);userUI();msg.textContent='Email updated.'}
   else msg.textContent='Request sent. Follow the confirmation link(s) sent by Supabase. Your current email stays active until confirmed.';
  }catch(err){msg.textContent=err?.message||'Email change could not be started. Check Supabase email settings.'}
  finally{btn.disabled=false}return;
 }
 if(e.target.id==='nv-profile-bio-form'){
  e.preventDefault();const bio=String($('#nv-profile-bio')?.value||'').trim().slice(0,220);const btn=e.target.querySelector('button[type=submit]');
  btn.disabled=true;try{await nvSaveIdentityMeta({novella_bio:bio},'#nv-profile-bio-msg','Saving introduction…','Introduction saved.')}finally{btn.disabled=false}return;
 }
 if(e.target.id!=='nv-profile-form')return;
 e.preventDefault();const name=$('#nv-profile-name')?.value.trim()||'',msg=$('#nv-profile-msg'),btn=e.target.querySelector('[type=submit]');
 if(!me||name.length<2){msg.textContent='Enter at least two characters.';return}
 const owner=me.id,epoch=nvAuthEpoch;
 btn.disabled=true;msg.textContent='Saving…';
 try{const {error}=await db.from('novella_profiles').update({display_name:name}).eq('user_id',me.id);
  if(error)throw error;
  if(me?.id!==owner||epoch!==nvAuthEpoch)throw Error('Account changed while saving.');
  nvProfile={...nvProfile,display_name:name};me.user_metadata={...me.user_metadata,name};
  nvWriteKnownAccounts(nvKnownAccounts.map(a=>a.id===owner?{...a,name}:a));
  db.auth.updateUser({data:{name}}).catch(()=>{});
  userUI();msg.textContent='Name saved.';
 }catch(err){msg.textContent=err?.message||'Unable to save name.'}
 finally{btn.disabled=false}
});
// If a history cover host is offline, keep a useful local-book fallback instead of a broken-image glyph.
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&e.target.closest('.nv-history-cover'))e.target.remove()},true);
document.addEventListener('change',e=>{const t=e.target;
 if(t.id==='nv208-rec-mood'){nv208RecMood=t.value;nv201SuggestionMemo=null;nv208RefreshRecommendations();return}
 if(t.id==='nv208-rec-complete'){nv208RecComplete=!!t.checked;nv201SuggestionMemo=null;nv208RefreshRecommendations();return}
 if(t.id==='nv208-shelf-sort'){nv208ShelfSort=['recent','title','author','progress'].includes(t.value)?t.value:'recent';nvRefreshShelfResults();return}
 if(t.id==='nv208-shelf-genre'){nv208ShelfGenre=t.value;nvRefreshShelfResults();return}
 if(t.id==='nv208-shelf-collection'){nv208ShelfCollection=t.value;paint();return}
 if(t.dataset.nv208TagBook){if(!nvMember())return;const groups=nv208Collections(),key=t.dataset.nv208TagBook;if(!shelves.some(r=>r.book_key===key))return;if(t.value&&groups.names.includes(t.value))groups.assign[key]=t.value;else delete groups.assign[key];if(nv208StoreCollections(groups)){nvRefreshShelfResults();notify('Collection updated on this device.')}else notify('Could not save this collection.');return}
 if(t.id==='nv-complete-length'){
  nvCompleteLength=['all','short','medium','long'].includes(t.value)?t.value:'all';
  nvUpdateBrowse();return;
 }
 if(t.id==='nv207-complete-genre'&&nvCompleteOnly){selectedGenre=t.value;browse(searchText,selectedGenre,1);return}
 if(t.dataset.status)changeStatus(t.dataset.status,t.value);if(t.id==='source-filter'){source=t.value;browse(searchText,selectedGenre,1)}if(t.id==='sort-filter'){sort=t.value;if(nvCompleteOnly){if(!['relevance','title','shortest','longest'].includes(sort))sort='relevance';nvUpdateBrowse();return}if(sort==='newest'&&source==='gutenberg'){source='all';notify('Latest publications use the live catalogue, not the public-domain classics collection.')}if(sort==='newest'||sort==='oldest')browse(searchText,selectedGenre,1);else{++nvBrowseRoot;paint();}}});
document.addEventListener('submit',e=>{if(e.target?.id!=='nv207-complete-search')return;e.preventDefault();if(!nvCompleteOnly)return;const q=String(e.target.querySelector('input')?.value||'').trim();browse(q,selectedGenre,1);});
let nv213SuggestFrame=0;
document.addEventListener('input',e=>{if(e.target.id==='global-search'){
 if(nvVoiceSession&&e.isTrusted)nvVoiceCancelActive();nvVoiceHideReview();
 if(!nv213SuggestFrame)nv213SuggestFrame=requestAnimationFrame(()=>{nv213SuggestFrame=0;renderSearchSuggestions(nvSearch.value)});
 }if(e.target.id==='genre-search'){const groups=$('#genre-groups');if(groups)groups.innerHTML=genreGroups(e.target.value)}});
document.addEventListener('keydown',e=>{
 const b=e.target instanceof Element?e.target.closest('.book-card[role="button"][data-book]'):null;if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();b.click()}
 if(e.key==='Escape'){closeAuth();nvCloseAccountMenu();nvCloseMobileMenu();closeSuggest()}
 if((e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey)&&!e.altKey)){
  e.preventDefault();const field=$('#global-search');field?.focus({preventScroll:true});field?.select();
 }else if(e.key==='/'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable],[role="textbox"]'))){e.preventDefault();$('#global-search').focus()}
});
const nvRecentKey='search-recent',nvSearch=$('#global-search'),nvSuggest=$('#suggestions');
const nvSearchTopics=['Mystery','Fantasy','Romance','Historical Fiction','Science Fiction','Biography','Poetry','Classics'];
const nvPopularQueries=['Huckleberry Finn','Pride and Prejudice','Ikigai','Jane Austen','Sherlock Holmes'];
function nvRecent(){return getLocal(nvRecentKey,[]).filter(s=>typeof s==='string').slice(0,5)}
function rememberQuery(q){q=String(q||'').trim();if(!q)return;putLocal(nvRecentKey,[q,...nvRecent().filter(s=>s.toLowerCase()!==q.toLowerCase())].slice(0,5))}
function closeSuggest(){nvSuggest.classList.add('hidden');nvSearch.setAttribute('aria-expanded','false');}
function quickSearch(q){nvVoiceCancelActive();nvVoiceHideReview();q=String(q||'').trim();nvSearch.value=q;$('#nv-search-clear').hidden=!q;closeSuggest();source=nvCompleteOnly?'gutenberg':'all';sort='relevance';rememberQuery(q);browse(q,'',1);}
function searchChip(label,kind='query'){
 return `<button class="nv-discover-chip" type="button" data-nv-${kind}="${esc(label)}">${esc(label)} <span aria-hidden="true">↗</span></button>`;
}
function renderSearchSuggestions(text=''){
 const val=String(text||'').trim().toLowerCase();$('#nv-search-clear').hidden=!val;
 const match=val?nv213SuggestionMatches(text):[];
 const recent=nvRecent();
 let sections=`<div class="nv-suggest-header"><span>THE NOVELLA INDEX</span><button type="button" class="nv-suggest-close" data-nv-close aria-label="Close search suggestions">Close ×</button></div>`;
 if(val){
   sections+=match.length?`<div class="nv-suggest-caption">BOOKS ALREADY IN YOUR CATALOGUE</div>`+match.map(b=>`<button type="button" class="nv-book-match" data-book="${esc(id(b))}"><span class="nv-result-title">${esc(b.title)}</span><span class="nv-result-author">${esc(b.author)}</span><span aria-hidden="true">↗</span></button>`).join(''):'';
   sections+=`<button type="button" class="nv-search-all" data-nv-query="${esc(text.trim())}"><strong>Search the full catalogue</strong><span>${esc(text.trim())} →</span></button>`;
   const topicMatch=nvSearchTopics.filter(v=>v.toLowerCase().includes(val)).slice(0,5);
   if(topicMatch.length)sections+=`<div class="nv-suggest-caption">RELATED SUBJECTS</div><div class="nv-suggest-chips">${topicMatch.map(v=>searchChip(v,'genre')).join('')}</div>`;
 }else{
   if(recent.length)sections+=`<div class="nv-suggest-caption">RECENT SEARCHES <button data-nv-clearhistory type="button">Clear</button></div><div class="nv-suggest-chips">${recent.map(v=>searchChip(v)).join('')}</div>`;
   sections+=`<div class="nv-suggest-caption">POPULAR RIGHT NOW</div><div class="nv-suggest-chips">${nvPopularQueries.map(v=>searchChip(v)).join('')}</div>`;
   sections+=`<div class="nv-suggest-caption">BROWSE BY MOOD OR GENRE</div><div class="nv-suggest-chips">${nvSearchTopics.map(v=>searchChip(v,'genre')).join('')}</div>`;
   sections+=`<button type="button" class="nv-search-all" data-nv-free><strong>Free books you can actually read</strong><span>Explore public-domain classics →</span></button>`;
 }
 // Always offer an accent setting even when speech recognition produces no transcript.
 if(typeof nvRecognition!=='undefined'&&nvRecognition){
  sections+=`<div class="nv-voice-language-row"><label for="nv-voice-language-quick">Microphone language</label><select id="nv-voice-language-quick" aria-label="Voice search language">${Object.entries(nvVoiceLanguages).map(([v,label])=>`<option value="${v}" ${nvVoiceLanguage===v?'selected':''}>${label}</option>`).join('')}</select></div>`;
 }
 nvSuggest.innerHTML=sections;
 nvSuggest.classList.remove('hidden');nvSearch.setAttribute('aria-expanded','true');
}
nvSearch.addEventListener('focus',()=>renderSearchSuggestions(nvSearch.value));
nvSuggest.addEventListener('change',e=>{if(e.target.id==='nv-voice-language-quick'&&nvVoiceLanguages[e.target.value]){nvVoiceLanguage=e.target.value;putLocal(nvVoiceLangKey,nvVoiceLanguage)}});
nvSearch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();quickSearch(nvSearch.value)}else if(e.key==='ArrowDown'&&!nvSuggest.classList.contains('hidden')){e.preventDefault();nvSuggest.querySelector('button.nv-book-match,button.nv-search-all,button.nv-discover-chip')?.focus()}});
// Arrow navigation keeps the suggestion list usable without a mouse; Escape
// returns to the query without losing the typed text.
nvSuggest.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();closeSuggest();nvSearch.focus({preventScroll:true});return}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 const options=[...nvSuggest.querySelectorAll('button:not(:disabled):not([data-nv-close]):not([data-nv-clearhistory])')];
 if(!options.length)return;
 const current=options.indexOf(document.activeElement);
 if(e.key==='ArrowUp'&&current<=0){e.preventDefault();nvSearch.focus({preventScroll:true});return}
 const next=e.key==='Home'?0:e.key==='End'?options.length-1:e.key==='ArrowDown'?(current+1)%options.length:(current<=0?options.length-1:current-1);
 e.preventDefault();options[next].focus({preventScroll:true});
});
$('#nv-search-submit').onclick=()=>quickSearch(nvSearch.value);
$('#nv-search-clear').onclick=()=>{
 nvVoiceCancelActive();nvVoiceHideReview();
 const hadBrowseQuery=screen==='explore'&&!!String(searchText||'').trim();
 nvSearch.value='';$('#nv-search-clear').hidden=true;
 if(hadBrowseQuery){source=nvCompleteOnly?'gutenberg':'all';sort='relevance';browse('','',1).catch(()=>notify('Could not refresh the catalogue. Please try again.'));}
 nvSearch.focus({preventScroll:true});renderSearchSuggestions('');
};
// V9.2: contextual book-name hints, multiple alternatives and an honest correction step.
// Speech recognition quality and language support ultimately depend on the browser's provider.
const nvVoiceReview=$('#nv-voice-review');
const nvVoiceLangKey='voice-language';
const nvVoiceLanguages={'en-IN':'English (India)','en-US':'English (US)','en-GB':'English (UK)'};
let nvVoiceLanguage=getLocal(nvVoiceLangKey,'en-IN');
if(!nvVoiceLanguages[nvVoiceLanguage])nvVoiceLanguage='en-IN';
let nvVoiceSession=null;
let nvVoiceNoticeTimer=null;
const nvVoiceNormalize=s=>String(s||'').replace(/^(?:please\s+)?(?:search\s+for|find\s+(?:me\s+)?|show\s+me|look\s+up)\s+/i,'').replace(/\s+/g,' ').trim().slice(0,110);
const nvVoiceCompare=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
function nvVoiceDistance(a,b){
 const dp=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let last=dp[0];dp[0]=i;
  for(let j=1;j<=b.length;j++){
   const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,last+(a[i-1]===b[j-1]?0:1));last=old;
  }
 }
 return dp[b.length];
}
function nvVoiceTerms(){
 const books=[...seed,...featured,...classics,...results,...bookMap.values()];
 const terms=[...nvPopularQueries,...nvSearchTopics,...allGenres.slice(0,35),...nvRecent()];
 for(const b of books){if(b?.title)terms.push(b.title);if(b?.author&&b.author!=='Unknown author')terms.push(b.author)}
 return [...new Set(terms.map(x=>String(x||'').trim()).filter(x=>x.length>=4&&x.length<80))].slice(0,140);
}
function nvVoiceClosest(raw){
 const normalized=nvVoiceCompare(raw);
 if(!normalized||normalized.length<4)return null;
 // Common pronunciation-based errors; always offered as a suggestion, never forced.
 const aliases={'icky guy':'Ikigai','icky gay':'Ikigai','ikiguy':'Ikigai','pride and prejudiced':'Pride and Prejudice','pride in prejudice':'Pride and Prejudice','huckle berry fin':'Huckleberry Finn','huckleberry fin':'Huckleberry Finn','alice in wonder land':'Alice in Wonderland','the alchemist paulo coelho':'The Alchemist'};
 if(aliases[normalized])return {text:aliases[normalized],score:.9};
 let best=null;
 for(const term of nvVoiceTerms()){
  const wanted=nvVoiceCompare(term);
  if(!wanted||Math.abs(wanted.length-normalized.length)>Math.max(4,normalized.length*.27))continue;
  const ratio=1-nvVoiceDistance(normalized,wanted)/Math.max(wanted.length,normalized.length);
  if(ratio>=.83&&(!best||ratio>best.score))best={text:term,score:ratio};
 }
 return best;
}
function nvVoiceHideReview(){nvVoiceReview.hidden=true;nvVoiceReview.innerHTML=''}
function nvVoiceResetVisual(){
 const mic=$('#nv-search-voice');
 mic.classList.remove('nv-listening','nv-processing');mic.setAttribute('aria-pressed','false');mic.setAttribute('aria-label','Search by voice');
 mic.innerHTML='<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
 $('#nv-voice-status').classList.remove('nv-voice-hint');$('#nv-voice-status').hidden=true;
}
function nvVoiceNotice(message){
 clearTimeout(nvVoiceNoticeTimer);
 const bar=$('#nv-voice-status');
 bar.classList.add('nv-voice-hint');bar.hidden=false;
 $('#nv-voice-message').textContent=message;
 nvVoiceNoticeTimer=setTimeout(()=>{if(!nvVoiceSession){bar.hidden=true;bar.classList.remove('nv-voice-hint')}},3200);
}
function nvVoiceListening(){
 clearTimeout(nvVoiceNoticeTimer);
 const mic=$('#nv-search-voice');mic.classList.add('nv-listening');
 mic.setAttribute('aria-pressed','true');mic.setAttribute('aria-label','Stop voice search');
 mic.innerHTML='<span class="nv-mic-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
 const bar=$('#nv-voice-status');bar.classList.remove('nv-voice-hint');bar.hidden=false;
 $('#nv-voice-message').textContent='Listening..';
}
function nvVoiceCancelActive(){
 const s=nvVoiceSession;if(!s)return;
 s.cancelled=true;s.finished=true;
 clearTimeout(s.timer);clearTimeout(s.finishTimer);
 nvVoiceSession=null;
 try{s.abort?.abort()}catch{}
 try{s.processor?.disconnect()}catch{}
 try{s.source?.disconnect()}catch{}
 try{s.gain?.disconnect()}catch{}
 try{s.stream?.getTracks().forEach(t=>t.stop())}catch{}
 try{s.context?.close().catch(()=>{})}catch{}
 nvVoiceResetVisual();
}
function nvVoiceReviewResult(values,hint='Check what Novella heard before searching.'){
 const possibilities=[...new Set(values.map(nvVoiceNormalize).filter(Boolean))].slice(0,5);
 const first=possibilities[0]||'';
 // Only show the large editable review when we actually have a recognized phrase.
 if(!first){nvVoiceHideReview();nvVoiceNotice(hint);return}
 const closest=nvVoiceClosest(first);
 const choices=[...new Set([...(closest&&closest.score>=.86?[closest.text]:[]),...possibilities.slice(1)])]
  .filter(s=>nvVoiceCompare(s)!==nvVoiceCompare(first)).slice(0,4);
 const options=Object.entries(nvVoiceLanguages).map(([value,label])=>`<option value="${value}" ${value===nvVoiceLanguage?'selected':''}>${label}</option>`).join('');
 nvVoiceReview.innerHTML=`<div class="nv-vr-label">VOICE SEARCH</div>
  <p class="nv-vr-hint">${esc(hint)}</p>
  <label class="nv-vr-label" for="nv-voice-corrected" style="display:block;margin-top:11px">WHAT I HEARD</label>
  <input class="nv-vr-input" id="nv-voice-corrected" type="text" value="${esc(first)}" maxlength="110" autocomplete="off" placeholder="Book title, author, or genre">
  ${choices.length?`<div class="nv-vr-label" style="margin-top:12px">DID YOU MEAN</div><div class="nv-vr-alternatives">${choices.map(x=>`<button type="button" data-voice-option="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}
  <div class="nv-vr-actions"><button class="nv-vr-confirm" type="button" data-voice-confirm>Search books →</button><button type="button" data-voice-again>Speak again</button><button type="button" data-voice-cancel>Cancel</button></div>
  <div class="nv-vr-foot"><label for="nv-voice-language">Speech language</label><select id="nv-voice-language">${options}</select></div>`;
 nvVoiceReview.hidden=false;$('#nv-voice-corrected').focus();
}
nvVoiceReview.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.hasAttribute('data-voice-option')){$('#nv-voice-corrected').value=button.dataset.voiceOption;$('#nv-voice-corrected').focus();return}
 if(button.hasAttribute('data-voice-confirm')){
  const text=$('#nv-voice-corrected').value.trim();if(!text){$('#nv-voice-corrected').focus();return}
  nvVoiceHideReview();quickSearch(text);return;
 }
 if(button.hasAttribute('data-voice-again')){nvVoiceHideReview();nvVoiceStart();return}
 if(button.hasAttribute('data-voice-cancel')){nvVoiceHideReview();nvSearch.focus()}
});
nvVoiceReview.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nv-voice-corrected'){e.preventDefault();nvVoiceReview.querySelector('[data-voice-confirm]').click()}});
nvVoiceReview.addEventListener('change',e=>{if(e.target.id==='nv-voice-language'){
 const lang=e.target.value;if(nvVoiceLanguages[lang]){nvVoiceLanguage=lang;putLocal(nvVoiceLangKey,lang)}
}});
// V9.6: Auto-finish after speech silence; Cloudflare transcription, not browser SpeechRecognition.
// Audio leaves the device only after a deliberate mic click; no voice recordings are stored.
// Use noise-calibrated voice activity detection (VAD) instead of one fixed volume cutoff.
// Short transient noises cannot start a search: speech must persist for 170ms.
// We measure audio-frame time so background-tab throttling does not confuse silence duration.
function nvVoiceVadStep(v, rms, blockMs) {
 v.elapsedMs += blockMs;
 if(v.elapsedMs <= 140){v.calibration.push(Math.min(.05,Math.max(0,rms)));return 'calibrating'}
 if(!v.calibrated){
  const sorted=[...v.calibration].sort((a,b)=>a-b);
  v.noise=Math.max(.001,Math.min(.025,sorted[Math.floor(sorted.length*.25)]||.003));
  v.calibrated=true;
 }
 // Calibrated against the current room, with gradual noise tracking before speech.
 const threshold=Math.max(.004,Math.min(.055,v.noise*1.85+.0018));
 if(!v.heard){
  if(rms>threshold)v.strongMs+=blockMs;
  else v.strongMs=Math.max(0,v.strongMs-blockMs*1.4);
  if(v.strongMs>=145){
   v.heard=true;v.startSpeechMs=Math.max(0,v.elapsedMs-v.strongMs-320);
   v.lastSpeechMs=v.elapsedMs;return 'started';
  }
  if(rms<threshold)v.noise=v.noise*.995+rms*.005;
  if(v.elapsedMs>=6000)return 'empty';
 }else{
  // Adapt to quiet consonants: do not end during short natural pauses.
  if(rms>Math.max(.0035,threshold*.70,v.noise*1.20))v.lastSpeechMs=v.elapsedMs;
  const pause=v.elapsedMs-v.lastSpeechMs;
  if(pause>=850)return 'end';
 }
 if(v.elapsedMs>=10000)return v.heard?'end':'empty';
 return 'listening';
}
function nvVoiceNewVad(){return {elapsedMs:0,calibration:[],calibrated:false,noise:.003,heard:false,strongMs:0,lastSpeechMs:0,startSpeechMs:0}}
function nvVoiceProcessing(){
 const mic=$('#nv-search-voice');
 mic.classList.remove('nv-listening');mic.classList.add('nv-processing');
 mic.setAttribute('aria-pressed','false');mic.setAttribute('aria-label','Transcribing voice query');
 const bar=$('#nv-voice-status');bar.classList.remove('nv-voice-hint');bar.hidden=false;
 $('#nv-voice-message').textContent='Searching..';
}
function nvVoiceWav(chunks,frames,sampleRate,vad){
 // Trim leading idle time, retain ~320ms leading and ~380ms trailing context.
 if(frames<1||!sampleRate)return null;
 const startMs=vad?.heard?Math.max(0,vad.startSpeechMs||0):0;
 const endMs=vad?.heard?Math.min(frames*1000/sampleRate,(vad.lastSpeechMs||0)+380):frames*1000/sampleRate;
 const first=Math.max(0,Math.floor(startMs*sampleRate/1000));
 const last=Math.min(frames,Math.ceil(endMs*sampleRate/1000));
 if(last-first<sampleRate*.4)return null;
 const input=new Float32Array(last-first);
 let i=0,at=0;
 for(const chunk of chunks){
  const a=Math.max(0,first-at),b=Math.min(chunk.length,last-at);
  if(b>a){input.set(chunk.subarray(a,b),i);i+=b-a}
  at+=chunk.length;if(at>=last)break;
 }
 const rate=16000,outputLength=Math.floor(i*rate/sampleRate);
 if(outputLength<6400||outputLength>16000*12)return null;
 const buffer=new ArrayBuffer(44+outputLength*2),view=new DataView(buffer);
 const ascii=(idx,v)=>{for(let j=0;j<v.length;j++)view.setUint8(idx+j,v.charCodeAt(j))};
 ascii(0,'RIFF');view.setUint32(4,36+outputLength*2,true);ascii(8,'WAVE');ascii(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 ascii(36,'data');view.setUint32(40,outputLength*2,true);
 const ratio=sampleRate/rate;
 for(let j=0;j<outputLength;j++){
  // Area-average low-pass resampling avoids aliasing from naive linear interpolation.
  const a=j*ratio,b=Math.min((j+1)*ratio,i);
  let k=Math.floor(a),sum=0,weight=0;
  while(k<b){const w=Math.min(b,k+1)-Math.max(a,k);sum+=input[k]*w;weight+=w;k++}
  const value=Math.max(-1,Math.min(1,weight?sum/weight:0));
  view.setInt16(44+j*2,Math.round(value*32767),true);
 }
 return buffer;
}
function nvVoiceStopHardware(s){
 clearTimeout(s.timer);
 try{s.processor?.disconnect()}catch{}
 try{s.source?.disconnect()}catch{}
 try{s.gain?.disconnect()}catch{}
 try{s.stream?.getTracks().forEach(t=>t.stop())}catch{}
 try{s.context?.close().catch(()=>{})}catch{}
}
async function nvVoiceFinishCapture(s){
 if(nvVoiceSession!==s||s.finished||s.processing)return;
 s.processing=true;nvVoiceStopHardware(s);
 if(s.cancelled)return;
 if(!s.vad.heard||s.frames<8000){nvVoiceCancelActive();nvVoiceNotice('No clear speech. Try again.');return}
 const audio=nvVoiceWav(s.chunks,s.frames,s.sampleRate,s.vad);
 const startedAt=performance.now();
 if(!audio){nvVoiceCancelActive();nvVoiceNotice('Recording failed. Try again.');return}
 nvVoiceProcessing();
 const abort=new AbortController();s.abort=abort;
 s.timer=setTimeout(()=>abort.abort(),25000);
 try{
  // The request is same-origin on Cloudflare Pages. No public API key is exposed.
  const response=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'audio/wav'},body:audio,signal:abort.signal,cache:'no-store'});
  let data;try{data=await response.json()}catch{data=null}
  if(!response.ok)throw Error(data?.error||'Voice service unavailable ('+response.status+')');
  if(new URLSearchParams(location.search).has('voice_debug'))console.info('Novella voice latency (ms):',Math.round(performance.now()-startedAt));
  const heard=nvVoiceNormalize(data?.text||'');
  if(nvVoiceSession!==s||s.cancelled)return;
  nvVoiceCancelActive();
  if(!heard){nvVoiceNotice('Couldn’t understand. Try again.');return}
  // V9.5: like a voice-search button, search immediately after the person finishes.
  // Very close title matches are corrected; unknown queries still search normally.
  if(!/[\p{L}\p{N}]{2,}/u.test(heard)||/^(um|uh|hmm|ah|you|the)$/i.test(heard)){
   nvVoiceNotice('No clear title heard. Try again.');return;
  }
  const match=nvVoiceClosest(heard);
  const query=match&&match.score>=.90?match.text:heard;
  quickSearch(query);
 }catch(e){
  if(nvVoiceSession!==s||s.cancelled)return;
  nvVoiceCancelActive();
  const msg=e?.name==='AbortError'?'Voice timed out. Retry.':
   (/not configured|not enabled|unavailable|not found|404|429/i.test(String(e.message))?
    'Voice service offline. Check /api/voice.':'Voice failed. Please retry.');
  nvVoiceNotice(msg);
 }
}
async function nvVoiceStart(){
 if(nvVoiceSession){
  const s=nvVoiceSession;
  if(s.processing)return;
  // Backup: tap again when the room is too noisy for automatic silence detection.
  nvVoiceFinishCapture(s);return;
 }
 nvVoiceHideReview();closeSuggest();
 if(!navigator.mediaDevices?.getUserMedia||!(window.AudioContext||window.webkitAudioContext)){
  nvVoiceNotice('Microphone unavailable. Try typing.');return;
 }
 const s={cancelled:false,finished:false,processing:false,stream:null,context:null,source:null,processor:null,gain:null,chunks:[],frames:0,sampleRate:48000,timer:null,finishTimer:null,abort:null,vad:nvVoiceNewVad()};
 nvVoiceSession=s;
 nvVoiceListening();
 try{
  s.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(nvVoiceSession!==s||s.cancelled){s.stream.getTracks().forEach(t=>t.stop());return}
  const Audio=window.AudioContext||window.webkitAudioContext;
  s.context=new Audio();s.sampleRate=s.context.sampleRate;
  if(s.context.state==='suspended')await s.context.resume();
  if(nvVoiceSession!==s||s.cancelled){nvVoiceStopHardware(s);return}
  s.source=s.context.createMediaStreamSource(s.stream);
  s.processor=s.context.createScriptProcessor(1024,1,1);
  s.gain=s.context.createGain();s.gain.gain.value=0;
  s.processor.onaudioprocess=event=>{
   if(nvVoiceSession!==s||s.processing||s.cancelled)return;
   const data=event.inputBuffer.getChannelData(0);
   s.chunks.push(new Float32Array(data));s.frames+=data.length;
   let power=0,count=0;
   for(let i=0;i<data.length;i+=8){power+=data[i]*data[i];count++}
   const rms=Math.sqrt(power/Math.max(1,count));
   const stage=nvVoiceVadStep(s.vad,rms,data.length/s.sampleRate*1000);
   if(stage==='started')nvVoiceListening();
   if(stage==='end')nvVoiceFinishCapture(s);
   if(stage==='empty'){
    nvVoiceCancelActive();
    nvVoiceNotice('No speech detected. Tap to try again.');
   }
  };
  s.source.connect(s.processor);s.processor.connect(s.gain);s.gain.connect(s.context.destination);
  nvVoiceListening();
  // Safety cap; protects against devices that never signal silence / suspended audio.
  s.timer=setTimeout(()=>{
   if(nvVoiceSession!==s||s.processing)return;
   if(!s.vad.heard){nvVoiceCancelActive();nvVoiceNotice('No speech detected. Try again.');}
   else nvVoiceFinishCapture(s);
  },10800);
 }catch(error){
  if(nvVoiceSession!==s||s.cancelled)return;
  const msg=['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name)?
   'Allow microphone in site settings.':
   error?.name==='NotFoundError'?'No microphone found.':
   'Mic could not start. Try typing.';
  nvVoiceCancelActive();nvVoiceNotice(msg);
 }
}

if(navigator.mediaDevices?.getUserMedia){
 const mic=$('#nv-search-voice');mic.hidden=false;
 mic.title='Speak, then pause to search automatically';
 mic.onclick=nvVoiceStart;
}
document.addEventListener('click',e=>{
 const button=e.target.closest('button');
 if(button?.dataset.nvQuery!==undefined){quickSearch(button.dataset.nvQuery);return}
 if(button?.dataset.nvGenre!==undefined){closeSuggest();nvSearch.value='';source=nvCompleteOnly?'gutenberg':'all';sort='relevance';browse('',button.dataset.nvGenre,1);return}
 if(button?.hasAttribute('data-nv-free')){closeSuggest();nvSearch.value='';source='gutenberg';sort='relevance';browse('','',1);return}
 if(button?.hasAttribute('data-nv-close')){closeSuggest();return}
 if(button?.hasAttribute('data-nv-clearhistory')){putLocal(nvRecentKey,[]);renderSearchSuggestions('');return}
 if(!e.target.closest('.search-wrap'))closeSuggest();
});
// The account menu is the main entry to Profile, Settings, Switch Account, and Sign Out.
const nvAccountTrigger=$('#side-account'),nvAccountMenu=$('#nv-account-menu');
function nvAccountOpen(){return nvAccountTrigger?.getAttribute('aria-expanded')==='true'}
function nvCloseAccountMenu(){nvAccountMenu.hidden=true;nvAccountTrigger.setAttribute('aria-expanded','false')}
function nvRefreshAccountMenu(){
 const signed=!!(me&&nvProfile);
 const display=signed?esc(nvProfile.display_name||me.email||'Reader'):'Guest reader';
 nvAccountMenu.innerHTML=`<div class="nv-account-caption">${display}${signed&&me.email?'<div>'+esc(me.email)+'</div>':''}</div>`+
 (signed?`<button type="button" data-nv-account="profile">Profile <span aria-hidden="true">↗</span></button><button type="button" data-nv-account="library">My bookshelf</button><button type="button" data-nv-account="history">Reading journal</button><button type="button" data-nv-account="switch">Switch account</button><button type="button" data-nv-account="settings">Settings</button><button type="button" data-nv-account="signout" class="nv-account-destructive">Sign out</button>`:
 `${nvKnownAccounts.length?'<button type="button" data-nv-account="switch">Switch account</button>':''}<button type="button" data-nv-account="signin">Sign in</button><button type="button" data-nv-account="signup">Create account</button><button type="button" data-nv-account="settings">Settings</button><button type="button" data-nv-account="library">Bookshelf · sign in required</button>`);
}
nvRefreshAccountMenu();
nvAccountTrigger.onclick=()=>{
 const opening=!nvAccountOpen();nvCloseMobileMenu();nvCloseAccountMenu();
 if(opening){nvRefreshAccountMenu();nvAccountMenu.hidden=false;nvAccountTrigger.setAttribute('aria-expanded','true');nvAccountMenu.querySelector('button')?.focus();}
};
nvAccountMenu.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-nv-account]');if(!btn)return;
 const action=btn.dataset.nvAccount;nvCloseAccountMenu();
 if(action==='signin'||action==='signup'){openAuth(action);return}
 if(action==='profile'||action==='library'||action==='history'||action==='settings'){navigate(action);$('.sidebar').classList.remove('open');return}
 if(action==='switch'||action==='signout'){
  try{await nvProfileAction(action)}catch{notify('Account action could not be completed. Try again.')}
 }
});
document.addEventListener('click',e=>{if(!e.target.closest('#nv-account-holder')&&nvAccountOpen())nvCloseAccountMenu()});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&nvAccountOpen()){e.preventDefault();nvCloseAccountMenu();nvAccountTrigger.focus()}
 if(!nvAccountOpen())return;
 const buttons=[...nvAccountMenu.querySelectorAll('button')];const at=buttons.indexOf(document.activeElement);
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
});
$('#auth-button').onclick=()=>openAuth('signin');
$('#close-modal').onclick=closeAuth;$('#modal-overlay').onclick=e=>{if(e.target.id==='modal-overlay')closeAuth()};
// Mobile navigation is a real, focusable menu with a dismissible backdrop.
const nvMobileNavToggle=$('#nv-mobile-menu-trigger'),nvMobileBackdrop=$('#nv-mobile-scrim');
function nvCloseMobileMenu(){
 document.body.classList.remove('nv-menu-open');$('.sidebar').classList.remove('open');
 nvMobileBackdrop.hidden=true;nvMobileNavToggle.setAttribute('aria-expanded','false');
 nvMobileNavToggle.setAttribute('aria-label','Open navigation');
}
function nvToggleMobileMenu(){
 const next=!document.body.classList.contains('nv-menu-open');
 if(!next){nvCloseMobileMenu();return}
 nvCloseAccountMenu();closeSuggest();
 $('.sidebar').classList.add('open');document.body.classList.add('nv-menu-open');
 nvMobileBackdrop.hidden=false;nvMobileNavToggle.setAttribute('aria-expanded','true');
 nvMobileNavToggle.setAttribute('aria-label','Close navigation');
 $('.sidebar nav[aria-label="Main navigation"] .nav.active')?.focus({preventScroll:true});
}
nvMobileNavToggle.onclick=nvToggleMobileMenu;
nvMobileBackdrop.onclick=()=>{nvCloseMobileMenu();nvMobileNavToggle.focus({preventScroll:true})};
$('#menu-btn').onclick=nvToggleMobileMenu;
// Mobile keyboard should not cover search, review or sign-in inputs with the bottom navigation.
document.addEventListener('focusin',e=>{if(e.target.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"]'))document.body.classList.add('nv-mobile-input-active')});
document.addEventListener('focusout',()=>{requestAnimationFrame(()=>{const a=document.activeElement;if(!a?.matches?.('input:not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable="true"]'))document.body.classList.remove('nv-mobile-input-active')})});
window.addEventListener('resize',()=>{if(window.innerWidth>780)nvCloseMobileMenu()});
document.addEventListener('click',e=>{if(e.target.closest('[data-view],[data-genre],#brand'))nvCloseMobileMenu()});


// Short, accessible hover and keyboard-focus hints. Nothing lingers on touchscreens.
const nvTooltip=document.createElement('div');nvTooltip.id='nv-tooltip';nvTooltip.setAttribute('role','tooltip');nvTooltip.hidden=true;document.body.append(nvTooltip);
// V11.22.1: Keep Novella's styled hints, never the browser's second native tooltip.
// Preserve title-only hint text before removing the native title attribute.
const nvTooltipControlSelector='button,a,select,[role="button"]';
function nvSuppressNativeHint(node){
 if(!node?.matches?.(nvTooltipControlSelector))return;
 const original=node.getAttribute('title');
 if(original===null)return;
 if(original.trim()&&!node.hasAttribute('data-nv-native-hint'))node.setAttribute('data-nv-native-hint',original);
 node.removeAttribute('title');
}
function nvSuppressNativeHintsIn(root){
 if(root?.nodeType!==1)return;
 nvSuppressNativeHint(root);
 root.querySelectorAll?.(nvTooltipControlSelector+'[title]').forEach(nvSuppressNativeHint);
}
nvSuppressNativeHintsIn(document.body);
const nvNativeHintObserver=new MutationObserver(changes=>{
 for(const change of changes){
  if(change.type==='attributes')nvSuppressNativeHint(change.target);
  else for(const node of change.addedNodes)nvSuppressNativeHintsIn(node);
 }
});
nvNativeHintObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
let nvTipTimeout=null,nvTipTarget=null;
function nvTipClose(){clearTimeout(nvTipTimeout);nvTipTarget=null;nvTooltip.hidden=true}
function nvTipText(element){
 if(!element||element.closest('.nv-reader-text,.nv-epub-stage,.nv-pdf-stage'))return '';
 const explicit=element.dataset.nvTip||element.getAttribute('aria-label')||element.dataset.nvNativeHint;
 if(explicit)return String(explicit).replace(/\s+/g,' ').slice(0,58);
 if(element.dataset.book)return 'Open book details';
 if(element.matches('select'))return element.getAttribute('aria-label')||'Choose an option';
 let value=(element.textContent||'').trim().replace(/\s+/g,' ').replace(/[↗→↻✧]+$/g,'').trim();
 return value.length>0&&value.length<=32?value:'';
}
function nvTipShow(target){
 if(!target?.isConnected)return;
 const hint=nvTipText(target);if(!hint)return;
 nvTooltip.textContent=hint;nvTooltip.hidden=false;
 const box=target.getBoundingClientRect();const w=nvTooltip.offsetWidth||155;
 const x=Math.max(8,Math.min(innerWidth-w-8,box.left+box.width/2-w/2));
 let y=box.top-nvTooltip.offsetHeight-8;if(y<7)y=box.bottom+9;
 nvTooltip.style.left=x+'px';nvTooltip.style.top=Math.min(innerHeight-32,y)+'px';
}
document.addEventListener('pointerover',e=>{
 if(e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
 const t=e.target.closest?.('button,a,select,[role="button"]');if(!t||t===nvTipTarget)return;
 nvTipClose();nvTipTarget=t;nvTipTimeout=setTimeout(()=>nvTipShow(t),160);
});
document.addEventListener('pointerout',e=>{if(nvTipTarget?.contains(e.relatedTarget))return;nvTipClose()});
document.addEventListener('focusin',e=>{const t=e.target.closest?.('button,a,select,[role="button"]');if(!t)return;nvTipClose();nvTipTarget=t;nvTipTimeout=setTimeout(()=>nvTipShow(t),90)});
document.addEventListener('focusout',nvTipClose);
document.addEventListener('pointerdown',nvTipClose);
window.addEventListener('scroll',nvTipClose,{passive:true});
$('#theme-btn').onclick=()=>{userTheme=userTheme==='dark'?'light':'dark';putLocal('theme',userTheme);document.body.classList.toggle('dark-mode',userTheme==='dark');$('#theme-btn').textContent=userTheme==='dark'?'☀':'☾'};
$('#surprise-btn').onclick=surpriseMe;
$('#reader-shortcut').onclick=()=>{readerModal(null);document.querySelector('#nv-reader-file')?.click()};
// Persistent global Back to Top works on every route and inside the local reader.
const nvTopButton=$('#nv-back-to-top');
let nvTopTick=0;
function nvRefreshBackToTop(){
 if(!nvTopButton)return;
 const readerScroll=$('#nv-reader-scroller');
 // Reader navigation has its own non-floating Top button. Never cover reader panels.
 const y=window.scrollY||document.documentElement.scrollTop||0;
 const modal=$('#modal-overlay');
 const blocked=!!readerScroll||screen==='detail'||window.matchMedia('(max-width:780px)').matches||!!(modal&&!modal.classList.contains('hidden'))||
  !!$('#novella-maintenance-screen:not([hidden])')||
  !!document.querySelector('.nv-account-menu:not([hidden])');
 nvTopButton.hidden=y<320||blocked;
 nvTopButton.classList.toggle('nv-in-reader',false);
 nvTopButton.setAttribute('aria-label','Back to top of page');
}
function nvTopScrollChange(){if(nvTopTick)return;nvTopTick=requestAnimationFrame(()=>{nvTopTick=0;nvRefreshBackToTop()})}
window.addEventListener('scroll',nvTopScrollChange,{passive:true});
document.addEventListener('scroll',nvTopScrollChange,{capture:true,passive:true});
nvTopButton.addEventListener('click',()=>{
 const reader=$('#nv-reader-scroller');
 const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 if(reader)reader.scrollTo({top:0,behavior});
 else window.scrollTo({top:0,behavior});
});
nvRefreshBackToTop();
$('#nv210-footer-top').onclick=()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
$('#footer-privacy').onclick=()=>navigate('info');
$('#brand').onclick=e=>{e.preventDefault();navigate('home')};
window.addEventListener('popstate',()=>{
 nvRouteStacked=!!history.state?.nvNovellaRoute;
 if(openReaderPanel)openReaderPanel();
 const u=new URL(location.href),b=u.searchParams.get('book');
 if(b&&/^(gutenberg|openlibrary|google):[a-zA-Z0-9_-]+$/.test(b))showBook(b,false);
 else navigate(['explore','genres','library','history','info','profile','settings','annex'].includes(u.searchParams.get('view'))?u.searchParams.get('view'):'home',false);
});
// Remove referral tracking without touching book, view, OAuth or anchor parameters.
try{const u=new URL(location.href);if(u.searchParams.has('utm_source')){u.searchParams.delete('utm_source');history.replaceState(history.state,'',u.href)}}catch{}
const start=new URL(location.href);
// A *real browser reload* returns to the Novella homepage. First-time shared
// book URLs still open their book, and internal client-side navigation remains intact.
// Use Navigation Timing rather than sessionStorage flags (which survive some reloads).
const nv217ReloadDetected=(()=>{
 try{
  const nav=performance.getEntriesByType?.('navigation')?.[0];
  return nav?nav.type==='reload':performance.navigation?.type===1;
 }catch{return false}
})();
// Do not destroy a pending OAuth/PKCE response or a password-recovery link.
const nv217ReloadHome=nv217ReloadDetected&&!nvAuthReturnAtBoot&&!location.hash.includes('type=recovery');
function nv217ScrollHomeTop(){
 if(!nv217ReloadHome)return;
 try{window.scrollTo({top:0,left:0,behavior:'instant'})}catch{window.scrollTo(0,0)}
}
// Never rewrite the URL while an OAuth callback is awaiting the auth SDK.
// The original code rewrote to pathname+search, DROPPING #access_token and
// #refresh_token before Supabase could establish the session (login loop).
// Also avoid putting bearer tokens into extra browser-history entries.
const nvStartupIsRoute=!!start.searchParams.get('book')||!!start.searchParams.get('view');
if(nvAuthReturnAtBoot){
 nvStartupPickerAttempted=true;nvMarkStartupChosen();
}else if(nv217ReloadHome){
 // Replace, do not push: Refresh must not create a phantom Back entry.
 const homepage=new URL(location.href);
 homepage.searchParams.delete('book');homepage.searchParams.delete('view');
 homepage.hash='';
 history.replaceState({nvNovellaHome:true},'',homepage.pathname+homepage.search);
 nvRouteStacked=false;
 nv217ScrollHomeTop();
}else if(nvStartupIsRoute){
 const landing=location.pathname+location.search;
 const home=new URL(location.href);home.searchParams.delete('view');home.searchParams.delete('book');
 history.replaceState({nvNovellaHome:true},'',home.pathname+home.search+home.hash);
 nvRegisterInternalRoute(landing);
}else history.replaceState({nvNovellaHome:true},'',location.pathname+location.search+location.hash);
// Resolve from the final URL, *after* the refresh-to-Home rewrite.
const nv217Landing=new URL(location.href);
const route=nv217Landing.searchParams.get('view');screen=['explore','genres','library','history','info','profile','settings','annex'].includes(route)?route:'home';
document.body.classList.toggle('dark-mode',userTheme==='dark');$('#theme-btn').textContent=userTheme==='dark'?'☀':'☾';
nvCoverBoot();if(screen==='explore')browse('','',1);else paint();
// Paint the interface before scanning history and scheduling non-critical catalogues.
requestAnimationFrame(()=>setTimeout(initCatalog,0));
nvScheduleApiPrune();
nvStartAuthWhenReady();if(!db)userUI();const book=nv217Landing.searchParams.get('book');if(book&&/^(gutenberg|openlibrary|google):[a-zA-Z0-9_-]+$/.test(book))setTimeout(()=>showBook(book,false),250);
// Chrome, Safari and installed PWAs may restore their old scroll after first paint.
// Restrict these top corrections to reload startup; never steal scroll later.
if(nv217ReloadHome){
 nv217ScrollHomeTop();
 requestAnimationFrame(()=>{nv217ScrollHomeTop();requestAnimationFrame(nv217ScrollHomeTop)});
 window.addEventListener('pageshow',nv217ScrollHomeTop,{once:true});
}

  

// Optional site-wide maintenance setting: publish maintenance.json with {"enabled":true}.
// Polling is intentionally low-frequency so GitHub Pages isn't repeatedly hammered.
const maintenanceMessages=[
 'We’re carefully editing the next chapter.',
 'A better reading room is taking shape.',
 'Even the finest libraries need a little tending.',
 'The shelves are being rearranged. Stories return soon.',
 'Good books deserve a thoughtful place to live.'
];
let maintenanceVisible=false,maintenanceTick=null,maintenancePoll=null,maintenanceLastVersion='';
function maintenanceScreen(on){
 if(on===maintenanceVisible)return;
 maintenanceVisible=on;
 const existing=$('#novella-maintenance-screen');if(existing)existing.remove();
 if(maintenanceTick){clearInterval(maintenanceTick);maintenanceTick=null;}
 if(!on)return;
 const pane=document.createElement('div');pane.id='novella-maintenance-screen';pane.setAttribute('role','status');pane.setAttribute('aria-live','polite');
 pane.innerHTML='<div class="nv-maint-brand"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MzAgMTQyIiB3aWR0aD0iNTMwIiBoZWlnaHQ9IjE0MiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJOb3ZlbGxhIj4KPHRpdGxlPk5vdmVsbGE8L3RpdGxlPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwIDMpIHNjYWxlKC44NykiPgo8cGF0aCBkPSJNNTggOGMtMTggNi0yOSAyMy0yNSA0MCAzIDE1IDE3IDI3IDM1IDI4LTktNy0xNC0xNy0xNC0yOCAwLTE2IDEwLTMxIDI0LTM4LTYtMi0xMy0zLTIwLTJ6IiBmaWxsPSIjZDZhOTc1Ii8+CjxwYXRoIGQ9Ik05MiAyNmwzLjIgOC40TDEwNCAzOGwtOC44IDMuNEw5MiA1MGwtMy40LTguNi04LjQtMy40IDguNC0zLjZ6IiBmaWxsPSIjYzk5YTY4Ii8+CjxwYXRoIGQ9Ik0xMTEgOGwxLjcgNS4zIDUuMyAxLjctNS4zIDEuNi0xLjcgNS40LTEuOC01LjQtNS4yLTEuNiA1LjItMS43eiIgZmlsbD0iI2M5OWE2OCIgb3BhY2l0eT0iLjg3Ii8+CjxwYXRoIGQ9Ik0xMTMgNTlsMS4xIDMuNyAzLjYgMS4zLTMuNiAxLTEuMSAzLjctMS4zLTMuNy0zLjctMSAzLjctMS4zeiIgZmlsbD0iI2M5OWE2OCIgb3BhY2l0eT0iLjcyIi8+CjxwYXRoIGQ9Ik04IDc1YzE1LTkgMzAtMTAgNDUtM2wxMiAxMiAxMi0xMmMxNS03IDMxLTYgNDUgM3YzMGMtMTYtNS0zMS00LTQ1IDNsLTEyIDgtMTItOGMtMTQtNy0yOS04LTQ1LTN6IiBmaWxsPSIjOWI4MGJiIiBvcGFjaXR5PSIuMTciLz4KPHBhdGggZD0iTTggNzRjMjAtOCA0MS0xMCA1NyAxMCAxNS0yMCAzNy0xOCA1Ny0xME02NSA4NHYyNk04IDc0djI5YzE5LTYgNDItNSA1NyAxMCAxNC0xNSAzOC0xNiA1Ny0xMFY3NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWI4MGJiIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTcgODdjMTctNCAyOC0yIDQwIDhtMTYgMGMxMi0xMCAyMy0xMiA0MC04TTE3IDk2YzE1LTMgMjctMiA0MCA3bTE2IDBjMTItOSAyNS0xMCA0MC03IiBzdHJva2U9IiM5YjgwYmIiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIGZpbGw9Im5vbmUiIG9wYWNpdHk9Ii44MyIvPgo8cGF0aCBkPSJNNDQgNjljLTktNy0xOC04LTI3LTVtNTEgNWM3LTUgMTgtNyAyNS02IiBzdHJva2U9IiNiM2ExY2IiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIuNTciIGZpbGw9Im5vbmUiLz4KPC9nPgo8cGF0aCBkPSJNNDAgMEM2NiAtMiA3OSAtMyA5NSAtM0MxMzggLTMgMTY1IDMgMTkxIDE5QzI0MCA0OSAyOTAgMTE5IDMyMiAyMDRDMzM4IDI0NiAzNDQgMjY4IDM4NyA0NDJDNDEyIDMzNCA0MTIgMzMzIDQyMyAyODdDNDUxIDE3MiA0NzkgODYgNTExIDIyQzU3MiAtMTAyIDY2MCAtMTYzIDc3OCAtMTYzQzgyOSAtMTYzIDg2NSAtMTU0IDkxMCAtMTI4TDg4NiAtMzlDODU2IC0xMDkgODI4IC0xMzYgNzg0IC0xMzZDNzIxIC0xMzYgNjYzIC04NyA2MTIgMTBDNjI5IDk2IDYzNyAxMzUgNjYzIDI0MEM3MDYgNDE0IDcyOCA0ODYgNzYwIDU1MkM3ODEgNTk1IDgwNSA2MTAgODUxIDYxMEM4NTkgNjEwIDg2NSA2MTAgODc4IDYwOEw5MTUgNjc1QzkwMyA2NzYgODkyIDY3NyA4ODQgNjc3Qzg0MiA2NzcgNzk3IDY0OCA3NDUgNTg3QzY5NyA1MzEgNjc5IDQ4MSA2MzAgMjY0QzYyMCAyMTcgNjA5IDE3MCA1OTggMTIyQzU5NyAxMTcgNTkyIDk2IDU4MyA2NUM1NDAgMTQ4IDUxNiAyMjEgNDM0IDUzMUw0MTYgNTk2TDM4MiA1NjVDMzU4IDU2NyAzNDYgNTY4IDMyNyA1NjhDMjY2IDU2OCAyMzEgNTU3IDE5NCA1MjlDMTMxIDQ3OSA4NyA0MDcgODcgMzUyQzg3IDMyNiA5NCAzMDEgMTEyIDI2NEwxODEgMzExQzE1NiAzNjUgMTQ5IDM4NiAxNDkgNDEyQzE0OSA0NDIgMTY2IDQ2OSAxOTQgNDg0QzIxOCA0OTcgMjQxIDUwMSAyODggNTAxQzMxMyA1MDEgMzI5IDUwMSAzNjQgNDk5QzMxOCAyOTggMjc5IDE3MiAyNDYgMTEzQzIyNSA3NiAyMDMgNjUgMTUwIDY1QzEyOSA2NSAxMTYgNjYgODggNjlaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMjUuMDAwIDEwMy4wMDApIHNjYWxlKDAuMTM1MDAwIC0wLjEzNTAwMCkiIGZpbGw9IiM2NjUyNzciIC8+PHBhdGggZD0iTTM1OSA0MTFDMzE5IDQxMSAyNTUgMzgyIDE5NiAzMzhDMTMyIDI5MCA4NyAxODYgODcgODZDODcgMjYgMTIxIC0xMyAxNzQgLTEzQzIwMiAtMTMgMjMxIC0zIDI3NiAyMUMzMjYgNDkgMzU5IDc0IDM3NyA5N0M0MTcgMTUyIDQ0OSAyNTAgNDQ5IDMxOUM0NDkgMzczIDQxMiA0MTEgMzU5IDQxMVpNMzA3IDM2NEMzNDcgMzY0IDM3MiAzMjYgMzcyIDI2NUMzNzIgMjIyIDM1OCAxNzEgMzM0IDEyMkMzMDUgNjUgMjY5IDM0IDIzMSAzNEMxOTAgMzQgMTY0IDcxIDE2NCAxMjhDMTY0IDI0NCAyMzcgMzY0IDMwNyAzNjRaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMTkuNTAwIDEwMy4wMDApIHNjYWxlKDAuMTM1MDAwIC0wLjEzNTAwMCkiIGZpbGw9IiM2NjUyNzciIC8+PHBhdGggZD0iTTEwNCAyMTVDMTMzIDMwNSAxNDAgMzE0IDE3NyAzMTZDMjMzIDMxNyAyNDggMzE4IDI3MyAzMjRDMjE0IDI1OCAxOTggMjM4IDE4NCAyMTVDMTU1IDE2NyAxMzggMTEwIDEzOCA2MUMxMzggMTUgMTU5IC0xMyAxOTIgLTEzQzI3MSAtMTMgMzc1IDcwIDQ0NCAxODhDNDg0IDI1NSA1MTAgMzMzIDUxMCAzODNDNTEwIDQwNyA1MDMgNDIwIDQ4NCA0MzdDNDYwIDQzMCA0NDkgNDI2IDQxNyA0MTBDNDI5IDM4MyA0MzMgMzY4IDQzMyAzNDBDNDMzIDI3OSA0MTUgMjE2IDM4MSAxNThDMzQyIDkyIDI4NyA0NCAyNTAgNDRDMjI3IDQ0IDIxMCA3MCAyMTAgMTA0QzIxMCAxNTAgMjI2IDIwNSAyNTQgMjU1QzI3NCAyOTEgMjk0IDMxOCAzNDAgMzcxVjM3OEMzNDAgMzgwIDM0MCAzODQgMzM5IDM4OUgzMjlDMzE4IDM3NSAzMDcgMzcyIDI3NiAzNzJDMjYzIDM3MiAyNTEgMzcyIDIyMCAzNzRDMTk1IDM3NSAxNzggMzc2IDE3MSAzNzZDMTUxIDM3NiAxNDIgMzczIDEzNiAzNjVDMTIzIDM0OSAxMDcgMzA4IDg3IDIzNloiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI3My41MDAgMTAzLjAwMCkgc2NhbGUoMC4xMzUwMDAgLTAuMTM1MDAwKSIgZmlsbD0iIzY2NTI3NyIgLz48cGF0aCBkPSJNMzgwIDEzN0MzMDAgNjkgMjU3IDQ0IDIxOSA0NEMxOTMgNDQgMTczIDYxIDE2NiA4N0MxNjIgMTAzIDE2MSAxMTQgMTYxIDE0M0MyMDcgMTcyIDIzNSAxOTIgMjk0IDIzNkMzNDkgMjc3IDM2OSAzMTAgMzY5IDM1NUMzNjkgMzkwIDM0OCA0MTEgMzEyIDQxMUMyOTAgNDExIDI3NSA0MDYgMjUxIDM5M0MyMTMgMzcxIDE3OSAzNDQgMTU5IDMyMEMxMjEgMjc0IDg3IDE2NCA4NyA4M0M4NyAyNCAxMTggLTEzIDE2OSAtMTNDMjI4IC0xMyAzMDQgMzEgMzc5IDEwOFpNMTY0IDE3OUMxODEgMjg3IDIyNiAzNjkgMjcwIDM2OUMyODYgMzY5IDI5NyAzNTMgMjk3IDMyOEMyOTcgMjc4IDI2OCAyNDYgMTY0IDE3OVoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDMzMi45MDAgMTAzLjAwMCkgc2NhbGUoMC4xMzUwMDAgLTAuMTM1MDAwKSIgZmlsbD0iIzY2NTI3NyIgLz48cGF0aCBkPSJNMzA3IDEyOUMyODYgMTE3IDI4NiAxMTcgMjQzIDkwQzIxNCA3MiAxOTcgNjQgMTg2IDY0QzE3NiA2NCAxNjggNzYgMTY4IDkwVjk5VjEwOEMxNjggMTI2IDIxMyAzMjAgMjUwIDQ2MUMyODkgNjA5IDI5OCA2MjYgMzQyIDYyNkMzNTcgNjI2IDM2NyA2MjUgMzkxIDYxOUw0MzQgNjcyQzQxMyA2NzcgNDAzIDY3OCAzODkgNjc4QzM0OSA2NzggMzE4IDY2MyAyNjkgNjE5QzIyNSA1ODAgMjE0IDU2NCAyMDEgNTI4QzE5MyA1MDQgMTcxIDQyMyAxNjEgMzc5TDg5IDY2Qzg4IDYwIDg3IDU0IDg3IDQ4Qzg3IDE3IDEwNCAtMTMgMTIwIC0xM0gxMjZIMTI5QzEzNSAtMTYgMTY3IDYgMzA3IDEwN1oiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDM3OC44MDAgMTAzLjAwMCkgc2NhbGUoMC4xMzUwMDAgLTAuMTM1MDAwKSIgZmlsbD0iIzY2NTI3NyIgLz48cGF0aCBkPSJNMzA3IDEyOUMyODYgMTE3IDI4NiAxMTcgMjQzIDkwQzIxNCA3MiAxOTcgNjQgMTg2IDY0QzE3NiA2NCAxNjggNzYgMTY4IDkwVjk5VjEwOEMxNjggMTI2IDIxMyAzMjAgMjUwIDQ2MUMyODkgNjA5IDI5OCA2MjYgMzQyIDYyNkMzNTcgNjI2IDM2NyA2MjUgMzkxIDYxOUw0MzQgNjcyQzQxMyA2NzcgNDAzIDY3OCAzODkgNjc4QzM0OSA2NzggMzE4IDY2MyAyNjkgNjE5QzIyNSA1ODAgMjE0IDU2NCAyMDEgNTI4QzE5MyA1MDQgMTcxIDQyMyAxNjEgMzc5TDg5IDY2Qzg4IDYwIDg3IDU0IDg3IDQ4Qzg3IDE3IDEwNCAtMTMgMTIwIC0xM0gxMjZIMTI5QzEzNSAtMTYgMTY3IDYgMzA3IDEwN1oiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQxMS4yMDAgMTAzLjAwMCkgc2NhbGUoMC4xMzUwMDAgLTAuMTM1MDAwKSIgZmlsbD0iIzY2NTI3NyIgLz48cGF0aCBkPSJNNDkyIDEzMUM0MTkgODEgNDAyIDcxIDM5MiA3MUMzODUgNzEgMzgwIDc5IDM4MCA5MUMzODAgMTE4IDQwMyAyMjMgNDQwIDM2MEM0NTEgMzc2IDQ1MyAzNzggNDY5IDM5NkM0MjEgNDA3IDM4NyA0MTEgMzQzIDQxMUMzMDIgNDExIDI4MiA0MDcgMjU3IDM5MUMyMjEgMzcwIDE3OSAzMzkgMTY2IDMyNUMxMjggMjgzIDg3IDE0OCA4NyA2N0M4NyAxOSAxMDMgLTEzIDEyOCAtMTNDMTUwIC0xMyAxODMgNyAzMDggOTdDMjk3IDQ2IDI5MyAyMSAyOTMgOEMyOTMgLTYgMjk5IC0xMyAzMDkgLTEzQzMyMiAtMTMgMzMwIC05IDQwMSAzOEM0MzUgNjEgNDU0IDc0IDQ5MSAxMDFaTTMxNiAxMzhDMjgxIDExMiAyNjMgOTkgMjYyIDk4QzIyOSA3NyAyMDMgNjQgMTkwIDY0QzE3MyA2NCAxNjQgODIgMTY0IDExNEMxNjQgMTY1IDE3OSAyMzEgMjA1IDI4OUMyMjkgMzQ0IDI1MSAzNjUgMjg1IDM2NUMzMDMgMzY1IDMzNyAzNjAgMzcwIDM1MkMzNTAgMjgwIDM0MyAyNTMgMzQyIDI0OEMzMzYgMjIzIDMzMSAxOTggMzI1IDE3MkMzMjQgMTY3IDMyMSAxNTUgMzE2IDEzOFoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDQ0My42MDAgMTAzLjAwMCkgc2NhbGUoMC4xMzUwMDAgLTAuMTM1MDAwKSIgZmlsbD0iIzY2NTI3NyIgLz4KPHBhdGggZD0iTTIxNiAxMTljNDYgOSAxMDAgNiAxNDItMTEiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzliODBiYiIgc3Ryb2tlLXdpZHRoPSIyLjYiIG9wYWNpdHk9Ii43OCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik01MTEgMTAzbDQgNC00IDQtNC00eiIgZmlsbD0iI2Q2YTk3NSIvPgo8L3N2Zz4=" alt="Novella" width="192" height="52"></div><div class="nv-maint-inner"><span class="nv-maint-kicker">A NOTE FROM THE READING ROOM</span><h1>Good stories take<br><em>thoughtful editing.</em></h1><p>Novella is undergoing maintenance. Thank you for being part of our story.</p><div class="nv-maint-quote" id="nv-maint-quote"></div><div class="nv-maint-indicator">● &nbsp; WE’RE WORKING ON IT</div></div><small class="nv-maint-foot">THE READING ROOM · EST. 2026</small>';
 document.body.append(pane);
 let i=0;const node=$('#nv-maint-quote');node.textContent='“'+maintenanceMessages[i]+'”';
 maintenanceTick=setInterval(()=>{i=(i+1)%maintenanceMessages.length;node.classList.remove('nv-fade');void node.offsetHeight;node.classList.add('nv-fade');node.textContent='“'+maintenanceMessages[i]+'”';},6000);
}
async function pollMaintenance(){
 try{const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),4000);
 const response=await fetch('./maintenance.json?_='+Math.floor(Date.now()/30000),{cache:'no-store',signal:ctl.signal});clearTimeout(timeout);
 if(!response.ok){if(maintenanceVisible)maintenanceScreen(false);return}
 const data=await response.json();maintenanceScreen(data.enabled===true);
 }catch{/* Keep the last known state on temporary network failure. */}
}
pollMaintenance();
const NV220_MAINTENANCE_INTERVAL=180000;
maintenancePoll=setInterval(()=>{if(!document.hidden&&navigator.onLine!==false)pollMaintenance()},NV220_MAINTENANCE_INTERVAL);
let nv220MaintenanceVisibleCheck=Date.now();
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&navigator.onLine!==false&&Date.now()-nv220MaintenanceVisibleCheck>=NV220_MAINTENANCE_INTERVAL){
  nv220MaintenanceVisibleCheck=Date.now();pollMaintenance();
 }
});


  