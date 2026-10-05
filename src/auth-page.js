import {accountConfig,getClient} from './accounts.js';
const message=document.querySelector('#auth-message');
const login=document.querySelector('#login-form'),reset=document.querySelector('#reset-form'),password=document.querySelector('#password-form');
const recovery=new URLSearchParams(location.search).get('mode')==='reset'||/type=(recovery|invite)/.test(location.hash);
const showReset=()=>{login.hidden=true;reset.hidden=true;password.hidden=false;document.querySelector('#forgot').hidden=true;document.querySelector('#auth-title').textContent='Elige tu contraseña';};
async function run(form,fn){const button=form.querySelector('button');button.disabled=true;message.textContent='Un momento…';try{await fn(new FormData(form));}catch(e){message.textContent=e.message||'No se pudo completar la operación.';}finally{button.disabled=false;}}
try{
  const config=await accountConfig();const client=await getClient();
  client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')showReset();});
  const {data:{session}}=await client.auth.getSession();
  if(recovery){if(session)showReset();else message.textContent='El enlace ha caducado. Solicita uno nuevo.';}
  login.addEventListener('submit',e=>{e.preventDefault();run(login,async data=>{const {error}=await client.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});if(error)throw Error('No se pudo iniciar sesión. Revisa el correo y la contraseña.');login.reset();location.replace('./index.html');});});
  document.querySelector('#forgot').addEventListener('click',()=>{login.hidden=true;reset.hidden=false;message.textContent='Te enviaremos un enlace para elegir una nueva contraseña.';});
  reset.addEventListener('submit',e=>{e.preventDefault();run(reset,async data=>{const {error}=await client.auth.resetPasswordForEmail(String(data.get('email')).trim(),{redirectTo:config.authRedirectUrl+'?mode=reset'});if(error)throw Error('No se pudo enviar el enlace. Inténtalo más tarde.');message.textContent='Si existe una cuenta con ese correo, recibirás el enlace de recuperación.';});});
  password.addEventListener('submit',e=>{e.preventDefault();run(password,async data=>{if(data.get('password')!==data.get('repeat'))throw Error('Las contraseñas no coinciden.');const {error}=await client.auth.updateUser({password:String(data.get('password'))});if(error)throw Error('No se pudo guardar. Usa al menos 12 caracteres y solicita otro enlace si ha caducado.');password.reset();location.replace('./index.html');});});
  for(const el of document.querySelectorAll('button[type=submit]'))el.disabled=false;
}catch(e){message.textContent=e.message;for(const el of document.querySelectorAll('button,input'))el.disabled=true;}
