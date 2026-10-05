# Academia APTIS B2 — v2 MVP

Estado: implementación local comprobada; pendiente de crear y configurar Supabase y validar el despliegue real. Producción sigue en `99a0792`. Rama `aptis-v2-mvp`. No se han aplicado migraciones remotas ni gastado créditos OpenAI durante estas pruebas.

## Arquitectura

GitHub Pages conserva HTML/CSS/JavaScript y rutas hash. `auth.html` gestiona email/contraseña, logout, recuperación e invitaciones con el SDK oficial de Supabase, incluido localmente. Supabase Auth identifica usuarios; PostgreSQL conserva estado y Storage guarda Speaking en un bucket privado. El Worker existente verifica sesión mediante Supabase Auth antes de usar OpenAI. Se mantienen Writing `gpt-6-luna` con reasoning `medium` y Speaking `gpt-audio-1.5`.

La alumna puede completar todo el curso sin intervención docente. Revisiones, comentarios y su fecha son información adicional. No hay aprobaciones, bloqueos o semanas que requieran profesor. El profesor consulta únicamente a su alumna asignada y añade comentarios; nunca modifica respuestas ni progreso.

## Datos y permisos

`profiles`, `user_roles`, `teacher_students`, `content_refs`: roles y asignación protegidos, administrados fuera del navegador.

Estado: `answer_drafts`, `session_progress`, `exercise_progress`, `listening_progress`, `error_entries`, `vocabulary_progress`. Se mantienen IDs académicos de texto y la distinción entre abrir solución, completar ejercicio y completar sesión.

Complementos: `entity_conflicts`, `activity_events`, `speaking_recordings`, `ai_feedback`, `teacher_reviews`, `migration_imports`.

Todas las tablas tienen RLS. Cliente autenticado dispone únicamente de SELECT sujeto a sus políticas; escrituras mediante funciones que comprueban identidad, rol, propiedad, IDs, tamaño y revisión. Anónimos sin permisos. Profesor sin permisos sobre escrituras de estado ni asignaciones. `ai_feedback` de procedencia `worker` solo lo escribe backend. Feedback importado se identifica como `legacy_import`, sin inventar input histórico ni actividad.

## Sincronización y migración

Se guarda inmediatamente en caché separada por UUID y se envía con debounce de 650 ms. Solo se muestra «Guardado en servidor» tras confirmación. Cola pendiente sobrevive recarga, se reintenta al recuperar conexión; comprobación periódica y al volver a la pestaña. Revisiones impiden sobrescritura silenciosa: se conservan ambas variantes y se ofrece elegir, con respaldo de la descartada.

Tres almacenes originales se detectan sin borrarlos: `aptis-b2-performance-v1`, `aptis-b2-vocabulary-v1`, `aptis-b2-ai-feedback-v1`. Importación solo tras confirmación de alumna, con descarga previa del respaldo, validación académica, transacción y comparación posterior. Hash canónico calculado en servidor evita duplicaciones del mismo paquete. Datos ya existentes se conservan; diferencias se registran como conflictos. Importación no crea actividad ficticia de hoy. Audios antiguos que desaparecieron de memoria no pueden recuperarse.

Se conserva exportación/importación original del progreso y se añade respaldo completo autenticado con vocabulario, feedback, comentarios, cola pendiente y metadatos de audio. El JSON no contiene los archivos de audio.

## Speaking

Reproducción local inmediata, copia de recuperación en IndexedDB por cuenta, original más WAV de análisis privados. Subidas inmutables; estado «ready» solo tras comprobar ambos objetos. Ante fallo se mantiene la copia local y se permite reintentar. URLs firmadas de 120 segundos; alumna propietaria y profesor asignado pueden leer. El Worker descarga el WAV almacenado de la cuenta verificada, inspecciona PCM y liga feedback al ID y hash exactos analizados. El original y el audio analizado pueden escucharse desde el panel docente.

## Protección de IA

Los endpoints originales y `/api/v2/…` exigen Authorization válido en el código nuevo. JWT: issuer, audiencia, expiración y subject se comprueban, y Supabase Auth verifica realmente la firma; decodificar no basta. Rol activo se lee de la tabla protegida usando el token del usuario. Identidad enviada en payload no concede permisos. Profesor no puede generar IA. Abrir feedback guardado no llama a OpenAI.

Se mantienen Origin/CORS, Turnstile, inspección de audio, límites de payload y timeout. En `worker/wrangler.toml`: Writing 30/día/usuario; Speaking 12/día/usuario; 3 solicitudes/minuto/usuario; IP 60/día y 3/minuto; presupuesto global 100 reservas/día y 10/minuto; timeout proveedor 45 s. Speaking reserva dos intentos ante JSON inválido. Cuotas conservadoras cuentan intentos, no solo éxitos.

UUID de solicitud y hash del input hacen idempotentes los reintentos de una corrección terminada durante siete días; resultados se retienen en Durable Object antes de guardarse en PostgreSQL. Si falla ese guardado se recupera sin repetir el proveedor. No se promete ejecución exactamente una vez ante cualquier caída externa o un reintento transcurridos siete días.

Claves: navegador únicamente URL y `sb_publishable_…`. `OPENAI_API_KEY` permanece secret del Worker. `SUPABASE_SECRET_KEY` (`sb_secret_…`) solo secret del Worker, usada para insertar feedback. No introducir claves secretas en archivos ni chat. Sesión del SDK en navegador: la contraseña no se conserva; todo texto remoto se escapa y feedback opcional se valida antes de renderizar.

## Comprobaciones locales realizadas

`node --test tests/*.test.mjs`: 34 pruebas aprobadas. PostgreSQL real embebido (PGlite), SQL/RLS reales: otro propietario, escalada de rol, profesor no asignado, anónimo, audio ajeno, falsificación de feedback, comentarios sin bloqueo, conflictos e importación idempotente. Worker: tokens de firma inválida, expiración/issuer/audiencia, identidad manipulada, cuotas, exactitud de input/audio y recuperación de fallo al persistir.

`node tests/v2-browser.mjs`: SDK oficial, SQL y Worker reales conectados a adaptadores locales de Auth/Storage y proveedor sintético exclusivo de tests. Comprueba recuperación con callback exacto, importación de las tres claves intactas, Writing, tracker, dos dispositivos, desconexión/recarga/conflictos, MediaRecorder y ambos objetos privados, Speaking, timers, Listening, Vocabulary Lab, libros/PDFs/mocks, exportación completa, dos roles, comentario escapado, cero llamadas del profesor, autonomía hasta W8 y móvil 390 px. Informe: `v2-browser-results.json`; capturas: `v2-student.png`, `v2-mobile.png`. Esto no acredita correo real, Supabase desplegado, URLs firmadas reales ni correcciones reales OpenAI: están pendientes.

`node tools/verify_v2.mjs`: 35 archivos originales byte a byte idénticos. 972 question IDs únicos, 201 ejercicios, 16 PDFs, 306 unidades de vocabulario. SHA256 course.json: `5aa99ddddb39da625b22cc07bef9d7cdeb0072e4862cfbff0713e4ec67e49ccf`. Incluye datasets, plan Writing, imágenes/audio y catálogo del Worker. No se regeneró el contenido.

## Activación pendiente, por orden

1. Usuario inicia sesión en Supabase en su navegador. Proyecto nuevo gratuito, región europea. Password de base de datos solo en Supabase; nunca por chat.
2. Aplicar `supabase/migrations/001_mvp.sql` y después `002_content_refs.sql` en proyecto dedicado vacío. Guardar confirmación de cada transacción; no aplicar sobre proyecto ajeno.
3. Auth: email/password activo, «Allow new users to sign up» desactivado. Sin formulario público. Site URL `https://guillermomescua-web.github.io/aptis-b2-course/auth.html`. Redirect allowlist exacta: esa URL y `https://guillermomescua-web.github.io/aptis-b2-course/auth.html?mode=reset`; sin comodines en producción. Revisar plantillas de invitación/recuperación y entrega de correo; configurar SMTP si la restricción del servicio predeterminado lo requiere.
4. Solicitar únicamente dos emails; invitar mediante administración Auth. Contraseñas elegidas mediante enlace seguro. Ejecutar `supabase/setup_accounts.sql` con emails y nombres, nunca contraseñas. Confirmar roles/asignación por consulta administrativa.
5. Configurar datos públicos con `node tools/configure_accounts.mjs URL PUBLISHABLE_KEY`. Introducir `SUPABASE_SECRET_KEY` en Cloudflare Secrets de forma privada. Mantener secrets existentes OpenAI/Turnstile/salt. Sin secretos en salida ni historial de comandos.
6. Validar RLS/Storage en Supabase real y ambos usuarios, firma JWT real, recuperación por email y límites. Probar una corrección real Writing y una Speaking sin pruebas repetitivas de pago. Revisar network y logs sanitizados. No afirmar validación remota a partir de los tests locales.
7. Usar despliegue de prueba y callback explícito autorizado para pruebas previas. Coordinar actualización Worker y frontend solo después de validación; el código nuevo protege también endpoints antiguos. Confirmar 401 anónimo en los cuatro endpoints, jamás dejar una ruta anónima de IA tras activar v2. Durante el cambio puede ser necesaria una ventana corta de mantenimiento.
8. Publicar rama verificada en main, revisar GitHub Pages, exportar progreso antiguo desde el navegador original e importar con confirmación de la alumna. Repetir Writing/Speaking real, dos dispositivos, profesor y privacidad. Registrar commits/URLs y coste observado.

Actualmente la v1 publicada sigue con su comportamiento anterior: no se ha desplegado aún la protección nueva de endpoints ni la autenticación. No activar `enabled` ni fusionar rama sin backend listo.

## Recuperación y límites del piloto

No hay cuotas de pago contratadas. Revisar uso/límites/posibles pausas del proyecto gratuito en Supabase. «Servidor persistente» no sustituye copias: descargar regularmente respaldo completo y conservar originales de Speaking necesarios. Caché local puede desaparecer si se borran datos del navegador antes de sincronizar; se muestra pendiente para evitar confundirla con persistencia remota. Grabación no subida permanece en ese dispositivo. El acceso al curso tras abrir requiere red para login; no se ofrece curso entero offline.

Antes de producción conservar commit v1 y configuración del Worker. Una vuelta temporal a frontend anterior conserva tablas v2 y almacenes originales, pero no restaura en v1 datos creados solo en servidor. Ante incidencia IA mantener endpoints protegidos; nunca recuperar servicio reabriendo acceso anónimo. Exportar v2 antes de cualquier cambio destructivo. Las migraciones no contienen DROP de tablas ni borrado de progreso anterior.

## Referencias oficiales consultadas

- [Claves publishable y secret, uso en apikey](https://supabase.com/docs/guides/getting-started/api-keys).
- [Desactivar altas y configuración Auth](https://supabase.com/docs/guides/auth/general-configuration).
- [URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls).
- [Claves de firma JWT](https://supabase.com/docs/guides/auth/signing-keys).
