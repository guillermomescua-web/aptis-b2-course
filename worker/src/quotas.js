export class Quotas {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    if(new URL(request.url).pathname==='/job')return this.job(request);
    const { ipHash, phase, cost = 1, userId, kind } = await request.json();
    if (!/^[a-f0-9]{64}$/.test(ipHash) || !['gate', 'reserve'].includes(phase) || ![1, 2].includes(cost)) return Response.json({ allowed: false }, { status: 400 });
    const now = Date.now(), day = Math.floor(now / 86400000), minute = Math.floor(now / 60000);
    const limit = (key, fallback) => {
      const n = Number(this.env[key]);
      return Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : fallback;
    };
    const allowed = await this.state.storage.transaction(async txn => {
      let data = await txn.get('counts');
      if (!data || data.day !== day) data = { day, total: 0, minute, calls: 0, gate: 0, ips: {} };
      if (data.minute !== minute) { data.minute = minute; data.calls = 0; data.gate = 0; }
      const ip = data.ips[ipHash] || { total: 0, minute, calls: 0, gate: 0 };
      data.users ||= {};
      const user=userId ? data.users[userId] || {writing:0,speaking:0,minute,calls:0} : null;
      if(user && user.minute!==minute){user.minute=minute;user.calls=0;}
      if (ip.minute !== minute) { ip.minute = minute; ip.calls = 0; ip.gate = 0; }
      if (phase === 'gate') {
        if (ip.gate >= 12 || data.gate >= 120 || Object.keys(data.ips).length >= 2000 && !data.ips[ipHash]) return false;
        ip.gate++; data.gate++;
      } else {
        if(user && (user[kind]>=limit(kind==='writing'?'DAILY_USER_WRITING_LIMIT':'DAILY_USER_SPEAKING_LIMIT',kind==='writing'?30:12) || user.calls>=limit('MINUTE_USER_LIMIT',3)))return false;
        if (data.total + cost > limit('DAILY_TOTAL_LIMIT', 100) || ip.total + cost > limit('DAILY_IP_LIMIT', 20) || ip.calls >= limit('MINUTE_IP_LIMIT', 3) || data.calls >= limit('MINUTE_TOTAL_LIMIT', 10)) return false;
        // Reserve both potential audio attempts up front; malformed JSON may retry once.
        ip.total += cost; data.total += cost; ip.calls++; data.calls++;
        if(user){user[kind]++;user.calls++;data.users[userId]=user;}
      }
      data.ips[ipHash] = ip;
      await txn.put('counts', data);
      await txn.setAlarm((day + 1) * 86400000);
      return true;
    });
    return Response.json({ allowed }, { status: allowed ? 200 : 429 });
  }
  async job(request){
    const {userId,id,phase,payloadHash,saved}=await request.json();
    const uuid=/^[a-f0-9-]{36}$/i;
    if(!uuid.test(userId||'')||!uuid.test(id||'')||!['begin','complete','fail'].includes(phase))return Response.json({}, {status:400});
    const key=`job:${userId}:${id}`;
    return this.state.storage.transaction(async tx=>{
      const existing=await tx.get(key);
      if(phase==='begin'){
        if(!/^[a-f0-9]{64}$/.test(payloadHash||''))return Response.json({}, {status:400});
        if(existing){if(existing.payloadHash!==payloadHash)return Response.json({}, {status:409});if(existing.saved)return Response.json({saved:existing.saved});return Response.json({}, {status:409});}
        await tx.put(key,{payloadHash,createdAt:Date.now()});await tx.setAlarm((Math.floor(Date.now()/86400000)+1)*86400000);return Response.json({started:true});
      }
      if(phase==='complete'){if(!existing||!saved?.row||!saved?.response)return Response.json({}, {status:400});await tx.put(key,{...existing,saved});}
      if(phase==='fail')await tx.delete(key);
      return Response.json({ok:true});
    });
  }
  async alarm() {
    await this.state.storage.transaction(async txn => {
      const data = await txn.get('counts');
      if (data && data.day < Math.floor(Date.now() / 86400000)) await txn.delete('counts');
      if(txn.list){for(const [key,value]of await txn.list({prefix:'job:'}))if(value.createdAt<Date.now()-7*86400000)await txn.delete(key);}
      await txn.setAlarm((Math.floor(Date.now()/86400000)+1)*86400000);
    });
  }
}
