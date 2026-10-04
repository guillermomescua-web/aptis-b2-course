export class Quotas {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const { ipHash, phase, cost = 1 } = await request.json();
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
      if (ip.minute !== minute) { ip.minute = minute; ip.calls = 0; ip.gate = 0; }
      if (phase === 'gate') {
        if (ip.gate >= 12 || data.gate >= 120 || Object.keys(data.ips).length >= 2000 && !data.ips[ipHash]) return false;
        ip.gate++; data.gate++;
      } else {
        if (data.total + cost > limit('DAILY_TOTAL_LIMIT', 100) || ip.total + cost > limit('DAILY_IP_LIMIT', 20) || ip.calls >= limit('MINUTE_IP_LIMIT', 3) || data.calls >= limit('MINUTE_TOTAL_LIMIT', 10)) return false;
        // Reserve both potential audio attempts up front; malformed JSON may retry once.
        ip.total += cost; data.total += cost; ip.calls++; data.calls++;
      }
      data.ips[ipHash] = ip;
      await txn.put('counts', data);
      await txn.setAlarm((day + 1) * 86400000);
      return true;
    });
    return Response.json({ allowed }, { status: allowed ? 200 : 429 });
  }
  async alarm() {
    await this.state.storage.transaction(async txn => {
      const data = await txn.get('counts');
      if (data && data.day < Math.floor(Date.now() / 86400000)) await txn.delete('counts');
    });
  }
}
