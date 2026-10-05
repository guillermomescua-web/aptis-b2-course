# Configuración real — 5 de octubre de 2026

Proyecto gratuito `aptis-b2-academia`, organización `Academia APTIS B2`, región West EU (Ireland), referencia `hahwtsmiopmlcqypfojb`.

URL pública de API: https://hahwtsmiopmlcqypfojb.supabase.co

## Completado

- Proyecto inicialmente vacío: 0 tablas propias y 0 cuentas, comprobado antes de migrar.
- Aplicadas `001_mvp.sql` y `002_content_refs.sql`: ambas devuelven `Success. No rows returned.`
- Auditoría real: 16 tablas, 16 con RLS, 972 referencias question ID, 306 unidades Vocabulary, bucket Speaking `public=false`, 0 grants para anon y 0 grants de escritura directa para authenticated.
- Altas públicas desactivadas, email habilitado, acceso anónimo desactivado, confirmación email activada.
- Site URL: `https://guillermomescua-web.github.io/aptis-b2-course/auth.html`.
- Dos redirects exactos, sin comodines: esa URL y la misma terminada en `?mode=reset`.
- `node tools/check_live_anonymous.mjs`: API real devuelve 401 para las 15 tablas personales consultadas y `learning_snapshot`; Auth confirma `disable_signup=true`. Ninguna llamada a OpenAI.
- `supabase/live_rls_check.sql`, ejecutado también en Supabase real, devuelve PASS. Prueba acceso cruzado, impersonación de propietario, cambios de rol/asignación, feedback falso, profesor asignado/no asignado, lectura privada y rechazo de reemplazo de audio, comentario visible, alumna completando W8 y anónimo denegado. Fixtures sin emails/contraseñas dentro de una transacción, revertidos al final. Se prueban permisos sobre metadatos de Storage; reproducción y URLs firmadas reales aún pendientes.
- Configuración pública de frontend y Worker preparada localmente. Solo contiene URL y publishable key. No se ha incluido ninguna clave administrativa.

## Pendiente

- SMTP Brevo gratuito configurado y guardado en Supabase. Dos invitaciones enviadas desde Auth; Brevo confirma ambas entregadas. Remitente gratuito reescrito por Brevo a su dominio de envío. No se guarda ninguna credencial SMTP en este repositorio.
- Publicada página aislada de activación en main, commit `deeb334`: ocho archivos añadidos, sin cambiar la aplicación v1. La página confirma la preparación de la contraseña y cierra la sesión local hasta completar el despliegue v2. Comprobada en GitHub Pages.
- Las dos cuentas existen en Auth. Tras confirmación expresa se han aplicado perfiles y roles student/teacher y relación de supervisión de una alumna. SQL devuelve Success. Verificación posterior: Lucía/student y Guillermo/teacher activos; ambas cuentas con email confirmado y al menos un inicio de sesión. Sus contraseñas fueron elegidas por sus titulares y no se han leído. No guardar emails personales en GitHub.
- Contraseñas mediante Auth, elegidas por sus titulares; ningún password por chat.
- Secreto SUPABASE_SECRET_KEY cargado desde archivo privado proporcionado por el titular en versión `3e855560-d859-4bca-977c-2e45eac227be`. Inspección remota confirma tipo `secret_text`, conserva los otros tres secretos y `has_preview=false`. Archivo local temporal eliminado tras comprobarlo; su valor nunca se ha impreso ni añadido a Git.
- Publicación completa inicialmente bloqueada por revisión automática. Tras autorización humana específica, publicado `d5dc0dd` en main y activada versión Worker `3e855560-d859-4bca-977c-2e45eac227be` al 100 %. V1 recuperable en Git y versión Worker anterior `865ff2ef-5515-45f4-831b-f31877ccaf1b`; nunca restaurar endpoints anónimos manteniendo frontend v2 activo.
- `tools/check_live_worker.mjs`, sobre Worker de producción: los cuatro endpoints antiguos/v2 devuelven 401 sin sesión; JWT falsificado también 401. Ninguna llamada a OpenAI en estos probes.
- `tools/check_live_content.mjs`, sobre GitHub Pages: 35 archivos protegidos coinciden byte a byte con los blobs originales de Git; también se comprueba la copia original Windows (CRLF en algunos textos). Los seis archivos clave nuevos coinciden con el commit desplegado. 972 IDs y course.json SHA256 `5aa99ddddb39da625b22cc07bef9d7cdeb0072e4862cfbff0713e4ec67e49ccf`, 16 PDFs sin cambios. Primera comparación detectó únicamente CRLF Windows/LF Git en audio/manifest.json; se corrigió el comparador para contrastar la publicación con la fuente Git original, sin editar ningún contenido.
- Navegación real sin sesión desde `/aptis-b2-course/` redirige a `auth.html`. Pendiente inicio de sesión humano de alumna para probar servidor, media y OpenAI reales; pendiente revisión posterior desde cuenta de profesor. No se presenta la publicación como finalización de esas pruebas.
- Inicio de sesión real de alumna realizado. Writing de prueba de 33 palabras en W1D2-E02-Q01: respuesta guardada, Turnstile/Worker/OpenAI completan corrección dentro de la academia, modelo registrado `gpt-6-luna`, provenance `worker`. SQL real verifica igualdad exacta `input.answer = answer_drafts.data.text`. Uso: 656 inputTokens, 639 outputTokens (179 reasoningTokens incluidos), sin tokens audio. No se dispone aún de coste monetario observado en Usage.
- Error concreto seleccionado del feedback guardado en Error Tracker, estado Guardado en servidor; tras recargar aparece el texto y la corrección. No se han marcado sesiones de estudio como completadas por estas pruebas.
- Progreso v1 detectado en navegador (1 respuesta, 2 sesiones, 1 feedback). Se solicita confirmación de pertenencia antes de importar. Sin respuesta todavía: los originales se conservan y no se ha importado automáticamente.
- Corregidos dos textos informativos heredados del dashboard/Tracker: con cuenta activa indican guardado en cuenta, no exclusivamente en navegador. Sin cambios de contenido académico ni comportamiento de almacenamiento.
- Subida versión Worker de prueba `0ff7b425-d5cb-4e46-bb54-de9cd56b97e7` (alias solicitado `aptis-v2`), sin desplegar a tráfico de producción. La inspección confirma conservación de OPENAI_API_KEY, TURNSTILE_SECRET_KEY y RATE_LIMIT_SALT, solo sus nombres. `has_preview=false`: no hay URL de prueba accesible todavía. No habilitar indiscriminadamente previews de versiones antiguas con endpoints anónimos. Pendiente secret Supabase en backend y pruebas de sesión/JWT reales, media privada, Writing/Speaking reales y ambos usuarios.
- Reejecutadas las 35 pruebas automáticas: todas PASS. Integridad: 35 archivos originales idénticos, 972 IDs, 201 ejercicios, 16 PDFs y 306 unidades de vocabulario.
- Completar las pruebas funcionales con ambas cuentas reales sobre la v2 publicada y corregir cualquier incidencia. La seguridad anónima y la integridad publicada ya están verificadas.

El despliegue no está terminado. Las pruebas locales no se presentan como pruebas OpenAI reales. Sigue intacto el contenido del curso y no se han consumido créditos en estas comprobaciones.

## Fuentes oficiales

- [Restricción del correo predeterminado de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [SMTP transaccional de Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

## Prueba real de Speaking y corrección de interfaz

- Speaking W1D3-E03-Q01, pregunta 1: audio humano de 31,92 s; feedback real registrado con modelo gpt-audio-1.5 y provenance worker. Uso registrado: 1212 inputTokens (319 audioInputTokens incluidos), 516 outputTokens. Coste monetario observado todavía pendiente.
- La respuesta aparece dentro de la academia. No se abrió ChatGPT. La salida IA incluye una explicación de artículo contradictoria; el feedback se conserva fiel al proveedor y no se presenta como una evaluación infalible.
- Corregido selector de pregunta que se reiniciaba durante refrescos de cuenta: conserva la selección durante el refresco y la captura antes de subir/recuperar el audio. Se limpia al cambiar de usuario. Prueba de regresión específica PASS.
- Pendientes: comprobación real con cuenta profesor y comentario opcional; confirmación humana para importar el progreso anterior; acceso real desde otro contexto/dispositivo. El curso sigue funcionando sin intervención del profesor.
