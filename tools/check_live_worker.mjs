// Real production security probe. No credentials, model calls or data writes.
import assert from 'node:assert/strict';
const base='https://aptis-b2-ai.aptis-b2-ai.workers.dev';
const headers={Origin:'https://guillermomescua-web.github.io','Content-Type':'application/json'};
const results=[];
for(const path of ['/api/writing-feedback','/api/speaking-feedback','/api/v2/writing-feedback','/api/v2/speaking-feedback']){
  const r=await fetch(base+path,{method:'POST',headers,body:'{}'});
  const body=await r.json();
  assert.equal(r.status,401,path+' must reject anonymous requests');
  results.push({path,status:r.status,code:body.error?.code??body.code});
}
const forged=[{alg:'HS256',typ:'JWT'},{sub:'7f64e9b5-f2ba-4507-9f9b-d0fe8acd151e',aud:'authenticated',iss:'https://hahwtsmiopmlcqypfojb.supabase.co/auth/v1',exp:Math.floor(Date.now()/1000)+600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.forged';
const r=await fetch(base+'/api/v2/writing-feedback',{method:'POST',headers:{...headers,Authorization:'Bearer '+forged},body:'{}'});
assert.equal(r.status,401,'Forged JWT must be rejected');
results.push({check:'forged JWT',status:r.status});
console.log(JSON.stringify({worker:base,results,modelCalls:0},null,2));
