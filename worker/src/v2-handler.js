import catalog from './catalog.js';
import {inspectWav,MAX_AUDIO_BYTES} from './audio.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class Failure extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new Failure(status,code,message);};
export async function sha(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function bounded(request,max){
  if(Number(request.headers.get('Content-Length')||0)>max)fail(413,'TOO_LARGE','Datos demasiado grandes.');
  const reader=request.body?.getReader();if(!reader)fail(400,'INVALID_PAYLOAD','Faltan datos.');const chunks=[];let size=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Failure(408,'BODY_TIMEOUT','La subida tardó demasiado.')),20000);});
  try{while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.length;if(size>max)fail(413,'TOO_LARGE','Datos demasiado grandes.');chunks.push(value);}}
  finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function backend(url,args,fetcher){try{return await fetcher(url,{...args,signal:AbortSignal.timeout(10000)});}catch{fail(503,'DATABASE_UNAVAILABLE','No se pudo conectar al servidor.');}}
export async function authenticate(request,env,fetcher){
  const header=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(header)||header.length>8192)fail(401,'AUTH','Inicia sesión para solicitar una corrección.');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL||'')||!env.SUPABASE_PUBLISHABLE_KEY)fail(503,'AUTH_CONFIGURATION','Las cuentas todavía no están configuradas.');
  const token=header.slice(7);let claims;
  try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{fail(401,'AUTH','Sesión inválida.');}
  if(claims.iss!==`${env.SUPABASE_URL}/auth/v1`||!(claims.aud==='authenticated'||Array.isArray(claims.aud)&&claims.aud.includes('authenticated'))||!Number.isInteger(claims.exp)||claims.exp<=Date.now()/1000||!uuid.test(claims.sub||''))fail(401,'AUTH','Sesión inválida o caducada.');
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:header};
  // Supabase Auth verifies the signature with the project's signing keys. Decoding above only rejects wrong claims early.
  const response=await backend(`${env.SUPABASE_URL}/auth/v1/user`,{headers},fetcher);
  if(response.status===401||response.status===403)fail(401,'AUTH','Sesión inválida o caducada.');
  if(!response.ok)fail(503,'AUTH_UNAVAILABLE','No se pudo verificar la sesión.');
  const user=await response.json();if(user.id!==claims.sub)fail(401,'AUTH','Identidad inválida.');
  const roleResponse=await backend(`${env.SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&select=role,active`,{headers},fetcher);
  if(!roleResponse.ok)fail(503,'AUTH_UNAVAILABLE','No se pudieron comprobar los permisos.');
  const roles=await roleResponse.json();if(roles.length!==1||roles[0].role!=='student'||roles[0].active!==true)fail(403,'PERMISSION','Esta cuenta no puede solicitar correcciones.');
  return {id:user.id,headers};
}
async function job(env,userId,id,phase,payload={}){const stub=env.QUOTAS.get(env.QUOTAS.idFromName('course-global-budget'));const response=await stub.fetch('https://internal/job',{method:'POST',body:JSON.stringify({userId,id,phase,...payload})});if(!response.ok)fail(response.status,'JOB','La corrección está en curso o la solicitud ha cambiado.');return response.json();}
async function persistResult(env,saved,fetcher){
  if(!env.SUPABASE_SECRET_KEY)fail(503,'DATABASE_CONFIGURATION','La persistencia de feedback no está configurada.');
  const response=await backend(`${env.SUPABASE_URL}/rest/v1/ai_feedback?on_conflict=id`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(saved.row)},fetcher);
  if(!response.ok)fail(503,'FEEDBACK_SAVE','El resultado está conservado. Reintenta para completar su guardado sin otra llamada IA.');
}
export async function handleAuthenticated(request,env,fetcher,core){
  const origin=request.headers.get('Origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
  if(origin===env.ALLOWED_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200)=>Response.json(data,{status,headers});
  let user,body,started=false;
  try{
    if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)fail(403,'ORIGIN','Origen no admitido.');
    const match=new URL(request.url).pathname.match(/^\/api\/(?:v2\/)?(writing|speaking)-feedback$/);if(!match)fail(404,'NOT_FOUND','Ruta no encontrada.');const kind=match[1];
    if(request.method==='OPTIONS'){
      if(request.headers.get('Access-Control-Request-Method')!=='POST'||(request.headers.get('Access-Control-Request-Headers')||'').split(',').some(h=>h.trim()&&!['authorization','content-type'].includes(h.trim().toLowerCase())))fail(405,'METHOD','Petición no admitida.');
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    }
    if(request.method!=='POST')fail(405,'METHOD','Utiliza POST.');
    user=await authenticate(request,env,fetcher);
    if(!env.QUOTAS||!env.SUPABASE_SECRET_KEY)fail(503,'NOT_CONFIGURED','La corrección todavía no está configurada.');
    if(!/^application\/json\b/i.test(request.headers.get('Content-Type')||''))fail(415,'CONTENT_TYPE','Envía JSON.');
    try{body=JSON.parse(new TextDecoder().decode(await bounded(request,30000)));}catch(error){if(error instanceof Failure)throw error;fail(400,'INVALID_PAYLOAD','JSON inválido.');}
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['exerciseId','requestId','answer','turnstileToken','recordingId','target','userId'].includes(k))||!uuid.test(body.requestId||'')||catalog[body.exerciseId]?.kind!==kind)fail(400,'INVALID_PAYLOAD','Datos o ejercicio inválidos.');
    // A userId supplied by a caller has no effect; all ownership comes from the verified token.
    let input,bytes,duration,sourceHash,target=body.target||'all';
    if(kind==='writing'){
      if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>8000)fail(400,'ANSWER_LENGTH','Escribe una respuesta de hasta 8000 caracteres.');
      input={answer:body.answer};sourceHash=await sha(body.answer);
    }else{
      if(!uuid.test(body.recordingId||''))fail(400,'RECORDING','Selecciona una grabación guardada.');
      const response=await backend(`${env.SUPABASE_URL}/rest/v1/speaking_recordings?id=eq.${body.recordingId}&user_id=eq.${user.id}&select=*`,{headers:user.headers},fetcher);
      if(!response.ok)fail(503,'DATABASE_UNAVAILABLE','No se pudo consultar el audio.');const rows=await response.json();const row=rows[0];
      if(rows.length!==1||row.user_id!==user.id||row.exercise_id!==body.exerciseId||row.status!=='ready')fail(403,'RECORDING','No tienes acceso a esta grabación guardada.');
      const expected=`${user.id}/${row.id}/`;if(!row.analysis_path.startsWith(expected)||!row.original_path.startsWith(expected))fail(403,'RECORDING','Ruta de grabación inválida.');
      const audio=await backend(`${env.SUPABASE_URL}/storage/v1/object/authenticated/speaking/${row.analysis_path}`,{headers:user.headers},fetcher);
      if(!audio.ok)fail(503,'AUDIO_UNAVAILABLE','No se pudo cargar el WAV privado.');bytes=await bounded(audio,MAX_AUDIO_BYTES);
      try{duration=inspectWav(bytes).duration;}catch(error){fail(400,'AUDIO_INVALID',error.message);}
      if(Math.abs(Number(row.duration)-duration)>2)fail(400,'AUDIO_DURATION','Duración inválida.');
      sourceHash=row.original_hash;input={recordingId:row.id,originalHash:sourceHash,analysisHash:await sha(bytes),originalPath:row.original_path,analysisPath:row.analysis_path};
    }
    const payloadHash=await sha(JSON.stringify({kind,exerciseId:body.exerciseId,input,target}));
    const previous=await job(env,user.id,body.requestId,'begin',{payloadHash});
    if(previous.saved){await persistResult(env,previous.saved,fetcher);return reply(previous.saved.response);}
    started=true;
    const normalizedHeaders=new Headers(request.headers);normalizedHeaders.delete('Content-Length');let normalizedBody;
    if(kind==='writing'){normalizedHeaders.set('Content-Type','application/json');normalizedBody=JSON.stringify({exerciseId:body.exerciseId,answer:body.answer,turnstileToken:body.turnstileToken});}
    else {normalizedHeaders.delete('Content-Type');normalizedBody=new FormData();normalizedBody.set('exerciseId',body.exerciseId);normalizedBody.set('audio',new Blob([bytes],{type:'audio/wav'}),'analysis.wav');normalizedBody.set('duration',String(duration));normalizedBody.set('target',target);normalizedBody.set('turnstileToken',body.turnstileToken);}
    const result=await core(new Request(`https://internal/api/${kind}-feedback`,{method:'POST',headers:normalizedHeaders,body:normalizedBody}),{...env,_VERIFIED_USER:user.id},fetcher);
    const data=await result.json();
    if(!result.ok){await job(env,user.id,body.requestId,'fail');return reply(data,result.status);}
    const id=crypto.randomUUID();data.id=id;
    const row={id,user_id:user.id,exercise_id:body.exerciseId,kind,input,source_hash:sourceHash,model:data.model,feedback:data.feedback,usage:data.usage,recording_id:kind==='speaking'?body.recordingId:null,target:kind==='speaking'?target:'all',duration:duration||null,provenance:'worker',created_at:data.timestamp};
    const saved={row,response:data};await job(env,user.id,body.requestId,'complete',{saved});started=false;
    await persistResult(env,saved,fetcher);
    return reply(data);
  }catch(error){
    if(started&&user&&body?.requestId)await job(env,user.id,body.requestId,'fail').catch(()=>{});
    const status=error instanceof Failure?error.status:500;return reply({error:{code:error instanceof Failure?error.code:'INTERNAL',message:error instanceof Failure?error.message:'No se pudo completar la corrección.'}},status);
  }
}
