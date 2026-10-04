# Backend de corrección APTIS v1.4

El frontend sigue en GitHub Pages. Este Worker hace llamadas reales a OpenAI; los sustitutos de proveedor solo existen en `tests/`. No hay clave en el navegador ni en el repositorio.

## Activación

Desde `worker/`, con Node y pnpm instalados:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write offline_access
pnpm exec wrangler deploy
```

Wrangler abre la autorización de Cloudflare. Inicia sesión y autoriza la gestión del Worker. El despliegue imprime su URL `https://aptis-b2-ai.<tu-subdominio>.workers.dev`. Si ya existe un Worker con ese nombre que tenga otro uso, cambia `name` en `wrangler.toml` antes de desplegar.

En [Cloudflare Dashboard](https://dash.cloudflare.com/), entra en **Workers & Pages → aptis-b2-ai → Settings → Variables and Secrets → Add**. Selecciona tipo **Secret** y añade:

| Nombre | Valor que introduces tú en Cloudflare |
| --- | --- |
| `OPENAI_API_KEY` | Clave del proyecto de OpenAI con facturación habilitada y acceso a los modelos. |
| `TURNSTILE_SECRET_KEY` | Secret key del widget de Turnstile descrito abajo. |
| `RATE_LIMIT_SALT` | Una cadena aleatoria larga (32 bytes o más); se utiliza para anonimizar las IP. |

Pulsa **Deploy/Save and deploy** cuando lo solicite Cloudflare. No escribas estos valores en el chat, en archivos públicos o en `ai-config.json`. Otra opción es `pnpm exec wrangler secret put NOMBRE`, que pide cada valor de forma interactiva. No lo pongas como argumento del comando.

En **Turnstile → Add widget**, crea un widget **Managed**, nombre `APTIS B2`, hostname `guillermomescua-web.github.io`. El widget solo se carga cuando la alumna solicita una corrección. Copia su secret key directamente al secreto del Worker y conserva su **sitekey pública**. No habilites “Any Hostname”.

Desde la raíz del repositorio conecta el frontend:

```sh
node tools/configure_ai.mjs https://aptis-b2-ai.TU-SUBDOMINIO.workers.dev SITEKEY_PUBLICA
```

Este comando admite solo configuración pública. Sube `data/ai-config.json` a GitHub y espera a que Pages termine de desplegar. Mientras la URL/sitekey estén vacías, el botón informa de que la IA está pendiente de activar y conserva todo el trabajo local.

## Contrato y proveedor

- `POST /api/writing-feedback`: JSON con `exerciseId`, `answer`, `turnstileToken`. Hasta 8000 caracteres / 1500 palabras; body máximo 30 KB. El Worker obtiene la tarea y orientación desde `src/catalog.js`, extraído sin alterar `course.json`.
- `POST /api/speaking-feedback`: multipart con `exerciseId`, `audio`, `duration`, `target`, `turnstileToken`. Solo WAV PCM 16 bits, hasta 16 MB, 0,75–185 s. `target`: `all` o `1`–`3`; Part 4 siempre completa. El servidor calcula la duración real, comprueba formato y silencio, y no confía en la duración del cliente.
- Writing: Responses API, `gpt-6-luna`, `reasoning.effort: medium`, Structured Outputs con JSON Schema, `store: false`, máximo 6000 tokens de salida incluyendo razonamiento.
- Speaking: Chat Completions, `gpt-audio-1.5`, audio real codificado en `input_audio`, `modalities: ["text"]`, `store: false`, máximo 3000 tokens de salida. JSON validado; un solo reintento si el formato falla, con el mismo audio. No se hace una segunda llamada a Luna ni se solicita voz de salida.
- El frontend transforma WebM/Opus u otro formato de MediaRecorder a WAV mono 24 kHz en memoria mediante Web Audio. Conserva el contenido, la duración, las pausas y la entonación; no produce una transcripción antes de enviar. La grabación original sigue disponible en los controles existentes.

## Protección y límites

Origin/CORS exactos `https://guillermomescua-web.github.io`; únicamente POST y preflight OPTIONS. Turnstile obligatorio, validado server-side con hostname y action `aptis_writing` / `aptis_speaking`. CORS no se utiliza como única protección.

Un Durable Object SQLite mantiene contadores globales y por IP de manera atómica. La IP se transforma con HMAC SHA256 y una sal diaria; no se guarda la IP original, texto, feedback o audio en ese almacén. Las reservas diarias se limpian tras el cambio de día UTC. Las subidas tienen timeout de 20 s, Turnstile de 10 s y cada llamada al proveedor de hasta 45 s. Los errores del proveedor se devuelven sin detalles internos, claves o stack traces.

Edita `[vars]` de `wrangler.toml` y vuelve a desplegar para ajustar:

| Variable | Valor inicial | Efecto |
| --- | ---: | --- |
| `DAILY_TOTAL_LIMIT` | 100 | Reserva máxima diaria global de llamadas al proveedor. |
| `DAILY_IP_LIMIT` | 20 | Reserva diaria por IP anonimizada. |
| `MINUTE_IP_LIMIT` | 3 | Solicitudes de corrección por minuto e IP. |
| `MINUTE_TOTAL_LIMIT` | 10 | Solicitudes globales por minuto. |
| `PROVIDER_TIMEOUT_MS` | 45000 | Timeout por llamada; máximo permitido 45 s. |

Writing reserva una llamada; Speaking reserva dos por el posible reintento de formato, aunque normalmente consume una. Los intentos fallidos siguen consumiendo su reserva. Antes de Turnstile también se limitan solicitudes a 12/min/IP y 120/min globales. Si faltan secretos o bindings, el endpoint falla cerrado con 503.

Observability deshabilitada. El código no escribe contenido ni secretos en logs. OpenAI recibe el contenido solo al pulsar corregir; su retención y condiciones de API son propias del proveedor. `store: false` evita guardar la respuesta como recurso de API, no equivale a una política de retención cero del proveedor.

## Pruebas y revisión real

```sh
# Desde la raíz
node --test tests/*.test.mjs
node tests/quota-runtime.mjs
node tools/verify_v1_4.mjs
# Playwright instalado, con sus navegadores:
node tests/browser.mjs
# O Chrome instalado:
PLAYWRIGHT_CHANNEL=chrome node tests/browser.mjs
```

Para comprobar el bundle: desde `worker/`, `pnpm exec wrangler deploy --dry-run`. Para desarrollo local, `pnpm exec wrangler dev --local`; el origen configurado continúa restringido. Una `.dev.vars` local está excluida de Git. No actives un bypass de Turnstile en el Worker de producción.

Las pruebas de desarrollo interceptan OpenAI y Turnstile para verificar contratos, fallos y UI. Una llamada real requiere secretos y facturación del usuario; no se presenta como realizada hasta probarla después de activar el Worker.

Tras activar, en GitHub Pages:

1. W1D1-E02: corregir un texto B2 correcto y uno con errores. Comprobar feedback, extensión, cambio de respuesta, recarga y guardado selectivo en Error Tracker.
2. W1D3-E03-Q02: elegir “Pregunta 1”, grabar una respuesta hablada de unos 45 s, reproducir y corregir. Comprobar que transcript y feedback corresponden a la grabación real. Repetir con Part 1 (30 s) y Part 4 (2 min).
3. Con auriculares, revisar la inteligibilidad y que el modelo explicita incertidumbre en audio insuficiente. No hay medición validada de pronunciación ni nota oficial Aptis.
4. Repetir en móvil real (iOS Safari / Android Chrome): permiso de micrófono, reproducción, conversión, Turnstile y envío. Las pruebas automáticas emulan tamaño de móvil, no sustituyen hardware y motores móviles reales.
5. Revisar Network: solo Worker y Turnstile tras pulsar corregir; nunca OpenAI directamente desde el navegador. En Cloudflare no debe quedar texto/audio en logs.

Si el plan gratuito de Workers alcanza su límite de CPU al convertir/validar payloads grandes, revisa el fallo real de despliegue/ejecución antes de decidir si necesitas un plan de pago. No se habilita ninguna suscripción de pago automáticamente.
