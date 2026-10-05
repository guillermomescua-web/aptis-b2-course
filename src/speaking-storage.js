import {rpc,getClient,digest} from './accounts.js';
import {recordingToWav} from './ai-audio.js';
let dbPromise;
function db(){return dbPromise ||= new Promise((resolve,reject)=>{const request=indexedDB.open('aptis-v2-speaking',1);request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function transaction(mode,fn){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('clips',mode);const request=fn(tx.objectStore('clips'));let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
const uploads=new Map();
export async function cacheRecording(account,exerciseId,recording){recording.id ||= crypto.randomUUID();recording.createdAt ||= new Date().toISOString();const saved={key:`${account.id}:${recording.id}`,userId:account.id,exerciseId,id:recording.id,blob:recording.blob,duration:recording.duration,status:'pending',createdAt:recording.createdAt};await transaction('readwrite',s=>s.put(saved));return saved;}
export async function localRecordings(account){return (await transaction('readonly',s=>s.getAll())).filter(r=>r.userId===account.id).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));}
export async function uploadRecording(account,exerciseId,recording,notify=()=>{}){
  if(uploads.has(recording.id))return uploads.get(recording.id);
  const task=(async()=>{
    try{
      notify('Subiendo audio…');let cached;
      try{cached=await cacheRecording(account,exerciseId,recording);}catch{notify('Sin respaldo local de audio. Mantén esta pestaña abierta hasta confirmar la subida.');}
      const converted=await recordingToWav(recording.blob);const hash=await digest(recording.blob);
      const row=await rpc('reserve_recording',{p_id:recording.id,p_exercise:exerciseId,p_mime:recording.blob.type||'audio/webm',p_hash:hash,p_duration:converted.duration,p_bytes:recording.blob.size});
      const client=await getClient();
      for(const [path,blob]of [[row.original_path,recording.blob],[row.analysis_path,converted.blob]]){
        const {error}=await client.storage.from('speaking').upload(path,blob,{contentType:blob.type.split(';')[0],upsert:false});
        if(error&&!['409','Duplicate'].includes(String(error.statusCode))&&!/already exists/i.test(error.message))throw Error('No se pudo subir el audio.');
      }
      const ready=await rpc('finish_recording',{p_id:recording.id});
      if(cached)await transaction('readwrite',s=>s.put({...cached,status:'ready'})).catch(()=>{});
      recording.server=ready;notify('Audio guardado en servidor');return ready;
    }catch(error){notify('Audio pendiente de sincronizar. Puedes reintentar.');throw error;}
  })();uploads.set(recording.id,task);try{return await task;}finally{uploads.delete(recording.id);}
}
export async function signedAudio(path){const c=await getClient();const {data,error}=await c.storage.from('speaking').createSignedUrl(path,120);if(error)throw Error('No se pudo acceder al audio privado.');return data.signedUrl;}
