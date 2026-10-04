// Isolated browser contexts and intercepted providers only. No production student data or API keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writing, speaking, memoryStorage } from './fixtures.mjs';
import { Quotas } from '../worker/src/quotas.js';
import { handleRequest } from '../worker/src/index.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/aptis-b2-course\/?/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw Error('Path');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(await fs.readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/aptis-b2-course/`;
const seed = { responses: { 'W1D2-E03-Q01': 'Previously saved extra response.' }, completed: { W1D1: true }, errors: [{ key: 'legacy-error', id: 'W1D1-E01-Q01', category: 'Vocabulary', error: 'old vocabulary error', correction: 'existing correction', resolved: false, date: '1/10/2026' }], plays: {}, checked: {} };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const report = [];
await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, permissions: ['microphone'] });
    const page = await context.newPage();
    const errors = [], missing = []; let calls = 0, providerMode = 'success', delay = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() === 404 && response.url().startsWith(base)) missing.push(response.url()); });
    await context.addInitScript(seed => {
      if (!localStorage.getItem('aptis-b2-performance-v1')) localStorage.setItem('aptis-b2-performance-v1', JSON.stringify(seed));
      if (!localStorage.getItem('aptis-b2-vocabulary-v1')) localStorage.setItem('aptis-b2-vocabulary-v1', JSON.stringify({ schemaVersion: 1, units: { 'VOC-COLL-001': { status: 'Learning', mistakes: 2, lapses: 2, repetitions: 0, dueAt: 1 } } }));
    }, seed);
    await page.route('**/data/ai-config.json', route => route.fulfill({ json: { schemaVersion: 1, workerUrl: 'https://worker.test', turnstileSiteKey: 'test-site-key', requestTimeoutMs: 10000 } }));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile={ready:fn=>fn(),render:(el,opts)=>{setTimeout(()=>opts.callback("test-token-long-enough"),20);return "test-widget";},remove:()=>{}};' }));
    const env = { ALLOWED_ORIGIN: new URL(base).origin, TURNSTILE_HOSTNAME: new URL(base).hostname, OPENAI_API_KEY: 'test-only-placeholder', TURNSTILE_SECRET_KEY: 'test-only-placeholder', RATE_LIMIT_SALT: 'test-only-placeholder', DAILY_TOTAL_LIMIT: 1000, DAILY_IP_LIMIT: 1000, MINUTE_IP_LIMIT: 1000, MINUTE_TOTAL_LIMIT: 1000 };
    const quotas = new Quotas({ storage: memoryStorage() }, env);
    env.QUOTAS = { idFromName: x => x, get: () => ({ fetch: (url, opts) => quotas.fetch(new Request(url, opts)) }) };
    const fetcher = async (url, args) => {
      if (url.includes('siteverify')) return Response.json({ success: true, hostname: env.TURNSTILE_HOSTNAME, action: JSON.parse(args.body).response.includes('test') ? currentKind : '' });
      if (providerMode === '401') return new Response('private details', { status: 401 });
      if (providerMode === '429') return new Response('', { status: 429 });
      if (providerMode === 'timeout') throw new DOMException('timeout', 'TimeoutError');
      return url.endsWith('responses') ? Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(writing) }] }] }) : Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(speaking) } }] });
    };
    let currentKind;
    await page.route('https://worker.test/api/**', async route => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } }); return; }
      calls++;
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (providerMode === 'offline') { await route.abort('failed'); return; }
      currentKind = route.request().url().includes('speaking') ? 'aptis_speaking' : 'aptis_writing';
      const requestHeaders = new Headers(route.request().headers()); requestHeaders.set('Origin', env.ALLOWED_ORIGIN); requestHeaders.set('CF-Connecting-IP', '192.0.2.1');
      const request = new Request(route.request().url(), { method: 'POST', headers: requestHeaders, body: route.request().postDataBuffer() });
      const result = await handleRequest(request, env, fetcher);
      await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: await result.text() });
    });
    await page.goto(base + '#session=W1D1');
    await page.locator('[data-ai-panel="W1D1-E02-Q01"]').waitFor();
    assert.equal(calls, 0, 'No background AI');
    const historical = await page.evaluate(() => JSON.parse(localStorage.getItem('aptis-b2-performance-v1')));
    assert.deepEqual(historical, seed);
    const q = page.locator('[data-response="W1D1-E02-Q01"]');
    const button = page.locator('[data-ai-correct="W1D1-E02-Q01"]');
    await button.click(); await page.getByText('Escribe tu respuesta antes de solicitar una corrección.').waitFor(); assert.equal(calls, 0);
    await q.fill('a'.repeat(8001)); await button.click(); await page.getByText('La respuesta supera 1500 palabras u 8000 caracteres.').waitFor(); assert.equal(calls, 0);
    const answer = 'I would like to learn how to grow vegetables. I can help on Saturday mornings because I am free then.';
    await q.fill(answer); assert.equal(await page.locator('[data-word-count="W1D1-E02-Q01"]').textContent(), '20 / 20-30 palabras');
    delay = 500; await button.evaluate(el => { el.click(); el.click(); });
    await page.getByText('Analizando tu Writing…').waitFor(); assert.equal(await button.isDisabled(), true);
    await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-result').waitFor(); delay = 0; assert.equal(calls, 1);
    await page.reload(); await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-result').waitFor();
    assert.equal(await q.inputValue(), answer);
    await q.fill('I did progress yesterday.'); await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-changed:not([hidden])').waitFor();
    await page.locator('[data-ai-error-id="W1D1-E02-Q01"]').check(); await page.locator('[data-ai-save="W1D1-E02-Q01"]').click();
    await page.locator('[data-ai-error-id="W1D1-E02-Q01"]').check(); await page.locator('[data-ai-save="W1D1-E02-Q01"]').click();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('aptis-b2-performance-v1')));
    assert.equal(after.errors.length, 2); assert.deepEqual(after.errors[1], seed.errors[0]); assert.deepEqual(after.completed, seed.completed);
    await page.goto(base + '#vocabulary-lab'); await page.getByRole('button', { name: 'Personal errors 2' }).waitFor();
    await page.goto(base + '#session=W1D2'); await page.locator('.writing-extra').waitFor();
    assert.equal(await page.locator('.writing-extra').getAttribute('open'), null);
    await page.locator('.writing-extra > summary').click(); assert.equal(await page.locator('[data-response="W1D2-E03-Q01"]').inputValue(), seed.responses['W1D2-E03-Q01']);
    await page.goto(base + '#session=W1D1'); await button.waitFor();
    for (const mode of ['offline', '401', '429', 'timeout']) {
      providerMode = mode; await button.click(); await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-status').filter({ hasText: 'No se pudo completar la corrección.' }).waitFor();
      assert.equal(await q.inputValue(), 'I did progress yesterday.'); assert.equal(await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-result').count(), 1);
    }
    providerMode = 'success'; await button.click(); await page.waitForFunction(() => document.querySelector('[data-ai-panel="W1D1-E02-Q01"] .ai-status').textContent === '');
    delay = 11000; await button.click(); await page.locator('[data-ai-panel="W1D1-E02-Q01"] .ai-status').filter({ hasText: 'La solicitud tardó demasiado.' }).waitFor(); delay = 0;
    assert.equal(await q.inputValue(), 'I did progress yesterday.');
    await page.goto(base + '#session=W1D3'); await page.locator('[data-record-start="W1D3-E03-Q02"]').waitFor();
    assert.equal(await page.locator('[data-ai-correct="W1D3-E03-Q02"]').isDisabled(), true);
    await page.locator('[data-record-start="W1D3-E03-Q02"]').click();
    await page.locator('[data-record-status]').filter({ hasText: 'Grabando…' }).waitFor();
    await page.waitForTimeout(1300); await page.locator('[data-record-stop="W1D3-E03-Q02"]').click();
    const speakingButton = page.locator('[data-ai-correct="W1D3-E03-Q02"]'); await page.waitForFunction(() => !document.querySelector('[data-ai-correct="W1D3-E03-Q02"]').disabled);
    assert.equal(await page.locator('[data-record-audio="W1D3-E03-Q02"]').isVisible(), true);
    await page.locator('[data-record-play="W1D3-E03-Q02"]').click();
    await page.locator('[data-ai-target="W1D3-E03-Q02"]').selectOption('1');
    await speakingButton.click(); await page.locator('[data-ai-panel="W1D3-E03-Q02"] .ai-result').waitFor();
    assert.ok((await page.locator('[data-ai-panel="W1D3-E03-Q02"] .ai-result').textContent()).includes('Speaking Feedback'));
    await page.locator('[data-ai-error-id="W1D3-E03-Q02"]').check(); await page.locator('[data-ai-save="W1D3-E03-Q02"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aptis-b2-performance-v1')).errors.length), 3);
    const oldAudio = await page.locator('[data-record-audio="W1D3-E03-Q02"]').getAttribute('src');
    providerMode = 'offline'; await speakingButton.click(); await page.locator('[data-ai-panel="W1D3-E03-Q02"] .ai-status').filter({ hasText: 'No se pudo completar' }).waitFor();
    assert.equal(await page.locator('[data-record-audio="W1D3-E03-Q02"]').getAttribute('src'), oldAudio);
    providerMode = 'success'; await speakingButton.click(); await page.waitForFunction(() => document.querySelector('[data-ai-panel="W1D3-E03-Q02"] .ai-status').textContent === '');
    await page.locator('[data-record-again="W1D3-E03-Q02"]').click(); await page.locator('[data-record-status]').filter({ hasText: 'Grabando…' }).waitFor(); await page.waitForTimeout(1000); await page.locator('[data-record-stop="W1D3-E03-Q02"]').click();
    await page.waitForFunction(old => document.querySelector('[data-record-audio="W1D3-E03-Q02"]').src !== old, oldAudio);
    await page.locator('[data-ai-panel="W1D3-E03-Q02"] .ai-changed:not([hidden])').waitFor();
    await page.locator('[data-ai-panel="W1D3-E03-Q02"]').screenshot({ path: path.join(root, 'test-results', `speaking-${viewport.width}.png`) });
    await page.clock.install(); await page.locator('[data-timer="45"]').first().click(); await page.locator('#floating-timer').waitFor(); await page.clock.fastForward(45100); await page.locator('#timer-label').filter({ hasText: 'Tiempo terminado' }).waitFor(); await page.locator('[data-stop-timer]').click();
    await page.goto(base + '#session=W1D4'); await page.locator('[data-play]').first().waitFor();
    const audioButton = page.locator('[data-play]').first(); const recordingId = await audioButton.getAttribute('data-play');
    await audioButton.click(); await audioButton.click(); assert.equal(await audioButton.isDisabled(), true);
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('aptis-b2-performance-v1')).plays[id], recordingId), 2);
    for (let w = 1; w <= 8; w++) for (let d = 1; d <= 4; d++) { await page.goto(base + `#session=W${w}D${d}`); await page.locator('.exercise-card').first().waitFor(); }
    for (const route of ['diagnostic', 'mocks', 'books', 'book=writing', 'book=speaking', 'book=vocabulary', 'pdfs', 'tracker', 'mock=1&block=A', 'mock=1&block=B', 'mock=1&block=C']) { await page.goto(base + '#' + route); await page.waitForTimeout(50); assert.ok((await page.locator('#app').textContent()).length > 100); }
    await page.goto(base + '#dashboard'); await page.locator('[data-export-progress]').waitFor();
    const downloadPromise = page.waitForEvent('download'); await page.locator('[data-export-progress]').click(); const download = await downloadPromise; const backup = await fs.readFile(await download.path(), 'utf8');
    const mainBeforeImport = await page.evaluate(() => localStorage.getItem('aptis-b2-performance-v1'));
    await page.locator('#progress-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
    await page.getByText('Archivo de progreso incompatible o sin versión de esquema válida.').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('aptis-b2-performance-v1')), mainBeforeImport);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#progress-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.getByText('Progreso importado correctamente.').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('aptis-b2-performance-v1')), mainBeforeImport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile width');
    assert.equal(context.pages().length, 1, 'No external tabs'); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    const stored = await page.evaluate(() => localStorage.getItem('aptis-b2-ai-feedback-v1')); assert.ok(!stored.includes('base64')); assert.ok(!stored.includes('test-only-placeholder'));
    report.push({ viewport, calls, pageErrors: errors, missingAssets: missing, passed: true });
    await context.close();
  }
  const denied = await browser.newContext(); await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  const deniedPage = await denied.newPage(); await deniedPage.goto(base + '#session=W1D3'); await deniedPage.locator('[data-record-start]').first().click(); await deniedPage.getByText('No se pudo acceder al micrófono. Revisa el permiso del navegador o usa los temporizadores.').waitFor(); await denied.close();
  await fs.writeFile(path.join(root, 'test-results', 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ browser: report, microphoneDenied: 'passed', productionAI: 'not tested; credentials required' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
