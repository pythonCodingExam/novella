
// Novella V11: securely delete the current authenticated user.
// Set SUPABASE_URL and SUPABASE_SECRET_KEY as Cloudflare environment bindings.
// Alternatively use the legacy SUPABASE_SERVICE_ROLE_KEY.
// Never put these secrets in public website files.
const respond=(status,obj)=>new Response(JSON.stringify(obj),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export async function onRequestPost({request,env}){
  const origin=request.headers.get('Origin');
  if(origin && origin!==new URL(request.url).origin)return respond(403,{error:'Invalid origin'});
  if(!env.SUPABASE_URL||!(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY))
    return respond(503,{error:'Account deletion is not configured yet. Contact Novella support.'});
  const token=(request.headers.get('Authorization')||'').match(/^Bearer\s+([\w.-]+)$/i)?.[1];
  if(!token)return respond(401,{error:'Sign in again to confirm your identity.'});
  let body;
  try{body=await request.json()}catch{return respond(400,{error:'Invalid request'})}
  if(body?.confirmation!=='DELETE')return respond(400,{error:'Type DELETE to confirm.'});
  const url=env.SUPABASE_URL.replace(/\/$/,'');
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const adminHeaders=key.startsWith('sb_secret_')?{apikey:key}:{Authorization:'Bearer '+key,apikey:key};
  try{
    const identity=await fetch(url+'/auth/v1/user',{
      headers:{Authorization:'Bearer '+token,apikey:key},redirect:'error'
    });
    if(!identity.ok)return respond(401,{error:'Your session expired. Please sign in again.'});
    const account=await identity.json();
    if(!account?.id)return respond(401,{error:'No authenticated account found.'});
    const result=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(account.id),{
      method:'DELETE',headers:adminHeaders,redirect:'error'
    });
    if(!result.ok)return respond(502,{error:'Could not delete account. If you own uploaded Storage files, contact support.'});
    return respond(200,{deleted:true});
  }catch{
    return respond(503,{error:'Account deletion is unavailable. Please retry later.'});
  }
}
