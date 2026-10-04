// Public configuration only. This tool never accepts API keys or secret tokens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [workerUrl, turnstileSiteKey] = process.argv.slice(2);
if (!workerUrl || !turnstileSiteKey || process.argv.length !== 4) throw new Error('Uso: node tools/configure_ai.mjs https://NOMBRE.SUBDOMINIO.workers.dev SITEKEY_PUBLICA');
const url = new URL(workerUrl);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password || !url.hostname.endsWith('.workers.dev')) throw new Error('Usa la URL pública HTTPS del Worker.');
if (!/^[A-Za-z0-9_-]{10,100}$/.test(turnstileSiteKey) || turnstileSiteKey.startsWith('sk-')) throw new Error('Se necesita la sitekey PÚBLICA de Turnstile, nunca un secreto.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(path.join(root, 'data/ai-config.json'), JSON.stringify({ schemaVersion: 1, workerUrl: url.origin, turnstileSiteKey, requestTimeoutMs: 150000 }, null, 2) + '\n');
console.log('Configuración pública guardada. No se ha guardado ningún secreto.');
