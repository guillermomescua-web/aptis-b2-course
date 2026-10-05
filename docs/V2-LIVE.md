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

## Revisión de producción — 5 de octubre de 2026

- Commit `77fa4ecd5f877405784a3e0cdc652584ed73c0e9` incluye solo corrección del indicador Vocabulary Lab (`CUENTA` al sincronizar con servidor) y comparador de publicación con cache bust por commit. Pruebas locales: 36/36; integridad: 35 archivos originales, 972 IDs, 201 ejercicios, 16 PDF y 306 unidades.
- Funcionalidad real comprobada en la v2: sesiones de alumna y profesor; Writing y Speaking con feedback IA; Error Tracker; importación confirmada del progreso heredado; dashboard, comentarios opcionales y reproducción de audio privado. La alumna puede avanzar sin revisión docente.
- Seguridad en producción: endpoints de OpenAI antiguos y v2 rechazan peticiones anónimas y JWT falsificados (401); tablas personales y RPC denegadas a anon; profesor limitado a la alumna asignada.
- GitHub Pages sigue sirviendo una versión anterior. El run `37365821562` terminó sin adquirir runner hosted tras varios intentos; `deploy` se omitió. Se mantiene la fuente `main`; no marcar como publicada hasta que el contenido remoto coincida con el commit actual. Consola del navegador: sin errores/avisos. Network detallado y emulación móvil directa no estuvieron disponibles; el recorrido móvil simulado local pasó.
