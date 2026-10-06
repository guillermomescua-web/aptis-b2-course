# Academia APTIS B2 — cierre v2.1

## Arquitectura y autonomía

Frontend ligero HTML/CSS/JavaScript en [GitHub Pages](https://guillermomescua-web.github.io/aptis-b2-course/). Supabase Auth identifica usuarios; PostgreSQL conserva progreso, borradores, comentarios y feedback; Storage guarda Speaking privado. El [Worker](https://aptis-b2-ai.aptis-b2-ai.workers.dev) autentica antes de acceder a OpenAI. No se añaden frameworks ni servicios nuevos.

La alumna puede realizar el 100 % del curso sin aprobación docente. El profesor consulta solo a las alumnas asignadas y añade comentarios opcionales. No escribe respuestas ni progreso. RLS y funciones verifican identidad, rol, propiedad y revisión; no basta con ocultar botones.

## Contenido conservado y adiciones

- `course.json`: SHA-256 `5aa99ddddb39da625b22cc07bef9d7cdeb0072e4862cfbff0713e4ec67e49ccf` del archivo local original; 972 IDs únicos, 201 ejercicios, 32 sesiones y cuatro mocks intactos. Git normaliza saltos de línea para publicar; `tools/check_live_content.mjs` compara los bytes Git originales con producción.
- Los 16 PDFs, Complete Answer Book, Writing plan y 306 unidades de Vocabulary Lab conservan sus hashes. Baselines: `v2-content-baseline.json` y `v2.1-content-baseline.json`.
- Listening: 88 MP3 estáticos, 80 de mocks y ocho semanales. `audio/manifest.json` relaciona los IDs originales con archivos. Scripts, respuestas y contadores se conservan. Primero MP3, voz del navegador solo si falta un archivo. Máximo dos escuchas, guardadas en servidor.
- Audio generado una vez con `gpt-4o-mini-tts`, resuelto en Usage a `gpt-4o-mini-tts-2025-12-15`. Se alternan seis voces; matching tiene cuatro distintas por mock, diálogos usan marin y cedar. PCM convertido a MP3 de 96 kbps con ajuste moderado de ritmo. Sin música o ruido. Reproducción sin llamadas a OpenAI.
- Coste observado el 6/10/2026 en Usage: audio output 0,46 USD + text input 0,009 USD, aproximadamente **0,47 USD**, incluida la muestra inicial. Total de cuenta mostrado: 0,51 USD, incluidas correcciones anteriores. Son cifras redondeadas de Usage, no una factura de precisión ilimitada.
- Reading Lab: 16 P2 (primera frase fija y cinco ordenables), diez P3 (cuatro opiniones y siete afirmaciones). Práctica original independiente, no oficial. Modos P2/P3/mixto y 5/10 minutos. Corrección determinista, explicación, pistas y categorías, sin IA. Cuenta guarda intentos, aciertos, errores y precisión por parte; profesor consulta estadísticas. Migración aditiva `003_reading_lab.sql`, aplicada y comprobada mediante prueba real RLS con rollback.

## Interfaz

Un sistema CSS de colores, espacios, tipografía, controles, foco y estados. Dashboard con nombre, avance semanal, Continuar y accesos a Writing/Speaking/Labs. Sesiones distinguen pendiente, empezada y completada. Lectura con ancho cómodo; Writing y controles Speaking adaptados al móvil; feedback con jerarquía; Labs comparten presentación. Mocks tienen entrada, tiempos, intento sin soluciones ni IA y correcciones al terminar. Auth y profesor usan la misma identidad. Reduced motion y controles de teclado conservados.

## Auth, sincronización, IA y copias

Email/contraseña, recuperación y sesiones mediante SDK Supabase. Las contraseñas no se incluyen en código ni documentación. Brevo permanece proveedor de correo configurado.

Se guarda primero caché por usuario y después servidor. Cola pendiente sobrevive recarga; sincroniza al reconectar y al volver a la pestaña. Revisiones conservan ambas versiones si dos dispositivos entran en conflicto. «Guardado en servidor» solo tras confirmación. Importación antigua conserva originales y no duplica el mismo paquete; las dos sesiones importadas de Lucía siguen independientes de Reading Lab.

Writing usa `gpt-6-luna`, reasoning medium. Speaking usa `gpt-audio-1.5` y analiza el WAV privado exacto de la grabación. Feedback guardado se consulta sin repetir generación. Original y WAV vinculados por ID/hash; URLs firmadas de 120 segundos. Bucket privado. Rutas antiguas y v2 rechazan llamadas anónimas; profesor no puede consumir IA. Se mantienen Turnstile, cuotas, validación, CORS, timeout y recuperación idempotente.

«Exportar progreso» conserva formato histórico. «Descargar respaldo completo» incluye Reading, Vocabulary, feedback, comentarios y metadatos de grabaciones. Importación valida también Reading. El JSON no contiene los MP3/WebM/WAV privados: para una copia externa de voz debe exportarse Storage mediante administración Supabase. Nunca contiene contraseñas ni claves del backend.

## Mantenimiento mínimo

**Cuotas:** cambiar las variables de `worker/wrangler.toml` y desplegar Worker. Actualmente Writing 30/día/usuario, Speaking 12/día/usuario, tres solicitudes/minuto/usuario; global 100 reservas/día. Son límites de peticiones, no límites monetarios. Writing, Speaking y generación inicial comparten saldo OpenAI. Las escuchas de MP3 no consumen saldo.

**Añadir cuenta:** crear o invitar desde Supabase Authentication; después ejecutar el procedimiento administrativo de `supabase/setup_accounts.sql`, adaptando UUID, email, nombre, rol y asignación. No conceder roles desde frontend. Confirmar URL de retorno Pages y correo. Profesor solo supervisa a sus asignadas; no activar signup público sin diseñar antes el alta autorizada.

**Renovar claves:** introducir `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY` y `RATE_LIMIT_SALT` únicamente como secrets del Worker cuando corresponda. Probar antes de revocar la anterior. La clave de generación local va en `.env`, ignorado por Git; no se publica. Frontend solo lleva URL y clave publishable Supabase. Cambiar la clave local de generación no sustituye automáticamente el secret del Worker.

**Producción sana:** confirmar último deploy Pages; ejecutar `node tools/verify_v2.mjs`, `node tools/verify_release.mjs`, `node --test tests/*.test.mjs`, `node tests/v2-browser.mjs`, `node tools/check_live_content.mjs`. Abrir producción, comprobar cuenta, guardado, audio, consola y respuestas HTTP. Petición IA sin JWT debe responder 401; audio público privado no debe descargarse. `supabase/live_reading_check.sql` usa datos temporales y rollback para verificar RLS sin conservar fixtures.

## Verificación y límites prácticos

40 pruebas automáticas pasan: SQL/RLS, roles, audio privado, cuotas, IA, importación, caché, conflictos, corrección Reading y respaldo. Regresión navegador con PostgreSQL y proveedor sintético: 27 comprobaciones, dos cuentas, dos contextos, móviles de 390 px, tablet de 768 y escritorio de 1440, sin desbordamiento ni excepciones. Incluye Writing/Speaking, Listening dos escuchas, Reading persistente, profesor con estadísticas, comentario escapado y autonomía hasta W8.

En producción v2 ya se comprobaron Writing y Speaking reales, audio humano privado de 31,92 s, consulta y comentario docente y progreso importado. Esta revisión mantiene ese Worker. La nueva migración Reading se verificó también en Supabase real, con alumno ajeno y profesor no asignado denegados. No se realizan nuevas correcciones de pago para repetir pruebas del Worker sin cambios.

El 6/10/2026 se repitió la protección real: las 16 tablas privadas, incluida Reading, y `learning_snapshot` rechazan anónimos con 401; el Speaking privado no es accesible por URL pública. Los cuatro endpoints IA antiguos/v2 y un JWT falsificado responden 401 sin llamadas al modelo. Alta pública desactivada. La prueba transaccional real Reading RLS pasó y retiró sus fixtures mediante rollback.

Prueba publicada con Lucía: Reading P2 5/5 y P3 7/7 recuperados tras recargar desde Supabase; permanecen un intento de verificación por parte, separados del curso. Se conservan las dos sesiones importadas (2/32). El MP3 del mock 1 reproduce y guarda 2/2, sin tercera escucha tras recargar; las soluciones aparecen solo después de terminar el intento. Consola sin errores o avisos. Los 136 archivos comprobados por HTTP coincidieron con Git y los baselines, incluidos los 88 MP3.

Se corrigió detener un MP3 durante la carga: cancela la petición de reproducción sin iniciar después audio/TTS ni consumir una escucha. `node tests/listening-browser.mjs` comprueba esa carrera y dos reproducciones completas persistentes sin llamadas IA. También se corrigió el idioma accesible de la explicación P3. Muestra de tail Worker: un evento con outcome `ok`, cero excepciones en una ventana de 55 segundos; no representa una garantía fuera de esa ventana.

Formato comprobado contra [preparación oficial General](https://www.britishcouncil.org/exam/english/aptis/prepare-general) y [tabla oficial ESOL](https://england.britishcouncil.org/exam/aptis-esol/prepare): Core 25 + 25 / 25 minutos; Reading cuatro partes / 35; Listening 17 tareas y 20 grabaciones / 40, dos escuchas; Writing cuatro partes / 50; Speaking cuatro partes / aproximadamente 12. Bloques de práctica A/B/C conservan revisión adicional del plan. No se detectó discrepancia estructural que exigiera modificar curso o PDFs. Este material no sustituye un examen oficial ni garantiza una calificación.

La escucha humana de las voces y el segundo dispositivo físico corresponden a la prueba manual. Se verifican integridad y reproducción; no se afirma haber valorado físicamente el sonido. Una transcripción opcional de cuatro muestras fue rechazada por revisión automática de permisos y no se ejecutó, sin gasto adicional.

Al completar la comprobación publicada se congela v2.1: no ampliar alcance, salvo corregir fallos reales.

## Publicación

La release se publica desde main. Si una subida mediante integración no inicia Pages, la edición final de esta documentación desde GitHub activa el build sin cambiar su fuente. Confirmar el SHA desplegado y los archivos publicados antes de cerrar. Los audios ya generados se publican como archivos; desplegar no debe regenerarlos.

## Cierre de alcance

La v2.1 es la versión final de este proyecto. Tras verificar el despliegue se congela su alcance: conservar contenido y datos; intervenir únicamente para corregir fallos reales. La escucha humana y la prueba desde un segundo dispositivo forman la aceptación manual prevista.
