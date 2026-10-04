import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = fs.realpathSync(path.join(root, 'worker/node_modules/wrangler'));
const { Miniflare, convertV4MiniflareOptions } = createRequire(path.join(wrangler, 'package.json'))('miniflare');
const mf = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-10-04',
  modules: [{ type: 'ESModule', path: path.join(root, 'tests/quota-entry.js'), contents: `import {Quotas} from '../worker/src/quotas.js'; export {Quotas}; export default {fetch:(request,env)=>env.QUOTAS.get(env.QUOTAS.idFromName('test-global')).fetch(request)};` }, { type: 'ESModule', path: path.join(root, 'worker/src/quotas.js'), contents: fs.readFileSync(path.join(root, 'worker/src/quotas.js'), 'utf8') }],
  bindings: { DAILY_TOTAL_LIMIT: '2', DAILY_IP_LIMIT: '2' }, durableObjects: { QUOTAS: { className: 'Quotas', useSQLite: true } },
}));
try {
  const results = await Promise.all([1, 2, 3, 4].map(() => mf.dispatchFetch('https://test/quota', { method: 'POST', body: JSON.stringify({ ipHash: 'a'.repeat(64), phase: 'reserve', cost: 1 }) })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 429, 429]);
  console.log('Actual Cloudflare workerd + SQLite Durable Object: concurrent quotas enforce global/IP limits.');
} finally { await mf.dispose(); }
