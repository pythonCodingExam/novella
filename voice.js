// Cloudflare Pages Function: /api/voice
// Requires one Workers AI binding named AI on the Pages project.
// Never store recordings, transcripts, or users' voice samples.
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:JSON_HEADERS});
export async function onRequestGet({env}){
  return reply({ready:!!env.AI,provider:'Cloudflare Workers AI'});
}
export async function onRequestPost({request,env}){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return reply({error:'Cross-site requests are not allowed'},403);
  if(!env.AI)return reply({error:'Voice service is not configured yet'},503);
  const contentType=request.headers.get('Content-Type')||'';
  if(!contentType.toLowerCase().startsWith('audio/wav'))return reply({error:'Expected WAV audio'},415);
  const contentLength=Number(request.headers.get('Content-Length')||0);
  if(contentLength>420000)return reply({error:'Voice clip too large'},413);
  let bytes;
  try{bytes=new Uint8Array(await request.arrayBuffer())}catch{return reply({error:'Unable to read voice clip'},400)}
  if(bytes.byteLength<1000||bytes.byteLength>420000)return reply({error:'Voice clip must be short'},413);
  const letters=(start,n)=>String.fromCharCode(...bytes.slice(start,start+n));
  if(letters(0,4)!=='RIFF'||letters(8,4)!=='WAVE'||letters(36,4)!=='data')return reply({error:'Invalid WAV audio'},400);
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(dv.getUint16(20,true)!==1||dv.getUint16(22,true)!==1||dv.getUint32(24,true)!==16000||dv.getUint16(34,true)!==16)
   return reply({error:'Unsupported recording format'},400);
  const duration=(bytes.byteLength-44)/32000;
  if(duration<0.5||duration>10)return reply({error:'Record between 0.5 and 10 seconds'},400);
  // Convert verified PCM WAV to base64 for Whisper-large-v3-turbo.
  let binary='';for(let i=0;i<bytes.byteLength;i+=8192){binary+=String.fromCharCode(...bytes.subarray(i,i+8192))}
  const audio=btoa(binary);
  try{
   const result=await env.AI.run('@cf/openai/whisper-large-v3-turbo',{
    audio,task:'transcribe',language:'en',vad_filter:true,
    initial_prompt:'Book titles and authors including Ikigai, Huckleberry Finn, Jane Austen, Sherlock Holmes and Pride and Prejudice.'
   });
   const text=String(result?.text||'').trim().slice(0,180);
   return reply({text});
  }catch(e){
   // Avoid reflecting infrastructure errors to public visitors.
   return reply({error:'Voice transcription is temporarily unavailable'},503);
  }
}
