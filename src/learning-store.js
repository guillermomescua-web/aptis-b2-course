export const KINDS=['answer','session','exercise','listening','error','vocabulary'];
const keyOf=(kind,id)=>`${kind}:${id}`;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
export class LearningStore {
  constructor(userId,transport,storage=globalThis.localStorage,onChange=()=>{}){
    this.userId=userId;this.transport=transport;this.storage=storage;this.onChange=onChange;this.key=`aptis-v2-state:${userId}`;
    try{this.cache=JSON.parse(storage.getItem(this.key)||'null');}catch{}
    this.cache ||= {rows:{},pending:{},backups:[]};this.cache.pending ||= {};this.cache.backups ||= [];this.status='Pendiente de sincronizar';
  }
  persist(){try{this.storage.setItem(this.key,JSON.stringify(this.cache));this.localFailure=false;}catch{this.localFailure=true;this.status='No se pudo guardar la copia local. Mantén abierta la pestaña.';}this.onChange(this);}
  get(kind,id){const p=this.cache.pending[keyOf(kind,id)];if(p)return p.data;const r=this.cache.rows[kind]?.[id];return r?.deleted?null:r?.data;}
  entries(kind){const ids=new Set([...Object.keys(this.cache.rows[kind]||{}),...Object.values(this.cache.pending).filter(p=>p.kind===kind).map(p=>p.id)]);return [...ids].map(id=>[id,this.get(kind,id)]).filter(([,value])=>value!=null);}
  set(kind,id,data){if(same(this.get(kind,id),data))return;const key=keyOf(kind,id),old=this.cache.pending[key];this.cache.pending[key]={kind,id,data:structuredClone(data),expected:old?.expected??this.cache.rows[kind]?.[id]?.revision??0,version:(old?.version||0)+1,conflict:old?.conflict||false};this.status='Guardando…';this.persist();clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),650);}
  async refresh(){
    if(this.flushing)await this.flushing;
    try{const snapshot=await this.transport.snapshot();
      for(const kind of KINDS){this.cache.rows[kind] ||= {};for(const row of snapshot[kind]||[]){const p=this.cache.pending[keyOf(kind,row.id)];
        if(p&&row.revision!==p.expected){if(same(p.data,row.deleted?null:row.data)){delete this.cache.pending[keyOf(kind,row.id)];}else p.conflict=true;}
        this.cache.rows[kind][row.id]=row;
      }}
      this.status=Object.values(this.cache.pending).some(p=>p.conflict)?'Nueva versión en otro dispositivo':Object.keys(this.cache.pending).length?'Pendiente de sincronizar':'Guardado en servidor';this.persist();
    }catch{this.status='Pendiente de sincronizar';this.persist();}return this;
  }
  async flush(){
    if(this.flushing)return this.flushing;
    this.flushing=this._flush().finally(()=>{this.flushing=null;});return this.flushing;
  }
  async _flush(){
    for(const key of Object.keys(this.cache.pending)){
      const p=this.cache.pending[key];if(!p||p.conflict)continue;
      const sent=structuredClone(p);this.status='Guardando…';this.onChange(this);
      try{const result=await this.transport.save(sent);this.cache.rows[p.kind] ||= {};
        if(result.row)this.cache.rows[p.kind][p.id]=result.row;
        const current=this.cache.pending[key];if(!current)continue;
        if(!result.ok){current.conflict=true;this.status='Nueva versión en otro dispositivo';}
        else if(current.version===sent.version){delete this.cache.pending[key];}
        else {current.expected=result.row.revision;}
        this.persist();
      }catch{this.status='Pendiente de sincronizar';this.persist();return false;}
    }
    this.status=Object.values(this.cache.pending).some(p=>p.conflict)?'Nueva versión en otro dispositivo':Object.keys(this.cache.pending).length?'Pendiente de sincronizar':'Guardado en servidor';this.persist();
    // Edits made during an outstanding request remain queued and get their own revision.
    if(Object.values(this.cache.pending).some(p=>!p.conflict))setTimeout(()=>this.flush(),650);
    return Object.keys(this.cache.pending).length===0;
  }
  conflicts(){return Object.entries(this.cache.pending).filter(([,p])=>p.conflict).map(([key,p])=>({key,...p,server:this.cache.rows[p.kind]?.[p.id]}));}
  resolve(key,useLocal){const p=this.cache.pending[key];if(!p)return;
    this.cache.backups.push({kind:p.kind,id:p.id,local:structuredClone(p.data),server:structuredClone(this.cache.rows[p.kind]?.[p.id]||null),date:new Date().toISOString()});
    if(useLocal){p.expected=this.cache.rows[p.kind]?.[p.id]?.revision||0;p.conflict=false;p.version++;}else delete this.cache.pending[key];
    this.persist();this.flush();
  }
  state(){return {responses:Object.fromEntries(this.entries('answer').map(([id,d])=>[id,d.text])),completed:Object.fromEntries(this.entries('session').map(([id,d])=>[id,d.completed])),checked:Object.fromEntries(this.entries('exercise').map(([id,d])=>[id,d.checked])),plays:Object.fromEntries(this.entries('listening').map(([id,d])=>[id,d.plays])),errors:this.entries('error').map(([,d])=>d)};}
  applyState(state){for(const [kind,field,valueKey] of [['answer','responses','text'],['session','completed','completed'],['exercise','checked','checked'],['listening','plays','plays']]){
    for(const [id,value] of Object.entries(state[field]||{}))this.set(kind,id,{[valueKey]:value});
    for(const [id] of this.entries(kind))if(!(id in (state[field]||{})))this.set(kind,id,null);
  }const errors=new Map((state.errors||[]).map(e=>[e.key,e]));for(const [id,data] of errors)this.set('error',id,data);for(const [id]of this.entries('error'))if(!errors.has(id))this.set('error',id,null);}
  vocabulary(){return {schemaVersion:1,units:Object.fromEntries(this.entries('vocabulary'))};}
}
