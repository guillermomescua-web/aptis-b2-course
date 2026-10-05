let configPromise, clientPromise;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function accountConfig() {
  return configPromise ||= fetch(new URL('../data/account-config.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No se pudo cargar la configuración de cuentas.');return r.json();});
}
export async function getClient() {
  return clientPromise ||= (async()=>{
    const c=await accountConfig();
    if(!c.enabled || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabaseUrl) || !c.supabasePublishableKey.startsWith('sb_publishable_')) throw Error('Las cuentas están pendientes de activar.');
    const {createClient}=await import('./vendor/supabase.js');
    return createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{storageKey:'aptis-v2-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  })();
}
export async function requireAccount() {
  const c=await accountConfig(); if(!c.enabled)return null;
  const client=await getClient(); const {data:{session}}=await client.auth.getSession();
  if(!session){location.replace('./auth.html');throw Error('Inicia sesión para continuar.');}
  const {data:{user},error}=await client.auth.getUser(); if(error||!user){location.replace('./auth.html');throw Error('La sesión ha caducado.');}
  const roleResult=await client.from('user_roles').select('role,active').eq('user_id',user.id).single();
  if(roleResult.error||!roleResult.data.active)throw Error('Esta cuenta no tiene acceso a la academia.');
  const profile=await client.from('profiles').select('display_name').eq('user_id',user.id).single();
  // The protected server row is the only authority for UI role selection.
  const account={id:user.id,role:roleResult.data.role,name:profile.data?.display_name||user.email,client};
  client.auth.onAuthStateChange((event,newSession)=>{
    if(event==='SIGNED_OUT'||(newSession&&newSession.user.id!==account.id)){
      document.querySelector('#app')?.replaceChildren(); location.replace('./auth.html');
    }
  });
  return account;
}
export async function accessToken(){const c=await getClient();const {data,error}=await c.auth.getSession();if(error||!data.session)throw Error('Inicia sesión para corregir.');return data.session.access_token;}
export async function rpc(name,args={}){const client=await getClient();const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return Array.isArray(data)&&['reserve_recording','finish_recording','add_teacher_review'].includes(name)?data[0]:data;}
export async function query(table,column,value,limit=200){
  const c=await getClient();const rows=[];let offset=0;
  do{let request=c.from(table).select('*').eq(column,value).order('created_at',{ascending:false});request=limit===null?request.range(offset,offset+499):request.limit(limit);const {data,error}=await request;if(error)throw Error(error.message);rows.push(...data);if(limit!==null||data.length<500)break;offset+=500;}while(true);
  return rows;
}
export async function digest(value){const bytes=value instanceof Blob?await value.arrayBuffer():new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
