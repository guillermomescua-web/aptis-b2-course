// Public configuration only. No model calls, credentials or persistent writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync(new URL('../data/account-config.json',import.meta.url)));
const headers={apikey:config.supabasePublishableKey};
const settings=await fetch(config.supabaseUrl+'/auth/v1/settings',{headers}).then(r=>r.json());
assert.equal(settings.disable_signup,true,'Public signup must be disabled');
const checks=['Public signup disabled'];
for(const table of ['profiles','user_roles','teacher_students','answer_drafts','session_progress','exercise_progress','listening_progress','error_entries','vocabulary_progress','reading_progress','ai_feedback','speaking_recordings','teacher_reviews','migration_imports','entity_conflicts','activity_events']){
 const r=await fetch(config.supabaseUrl+'/rest/v1/'+table+'?select=*&limit=1',{headers});
 assert.ok([401,403].includes(r.status),table+' anonymous denied: '+r.status);checks.push(table+': anonymous denied '+r.status);
}
const snapshot=await fetch(config.supabaseUrl+'/rest/v1/rpc/learning_snapshot',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
assert.ok([401,403].includes(snapshot.status),'Anonymous snapshot denied');checks.push('Snapshot RPC anonymous denied '+snapshot.status);
const storage=await fetch(config.supabaseUrl+'/storage/v1/object/public/speaking/no-object.wav',{headers});
assert.equal(storage.ok,false,'Speaking must not be publicly accessible');checks.push('Public Speaking URL unavailable');
console.log(JSON.stringify({project:config.supabaseUrl,checks,modelCalls:0},null,2));
