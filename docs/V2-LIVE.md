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

- Usuario ha elegido Brevo como proveedor gratuito para invitaciones/recuperación. Hace falta iniciar sesión/crear cuenta allí y configurar SMTP en Supabase. No se ha enviado ninguna invitación aún.
- Crear las dos cuentas con los emails proporcionados de forma privada, asignar roles y vínculo. No guardar emails personales en GitHub.
- Contraseñas mediante Auth, elegidas por sus titulares; ningún password por chat.
- Secret Supabase en Worker, versión de prueba con secrets existentes y pruebas de sesión/JWT reales, media privada, Writing/Speaking reales y ambos usuarios.
- Publicar frontend y Worker coordinados tras validar. Producción actual sigue en v1; sus endpoints no han sido sustituidos todavía. La configuración local `enabled=true` no significa que esté publicado.

El despliegue no está terminado. Las pruebas locales no se presentan como pruebas OpenAI reales. Sigue intacto el contenido del curso y no se han consumido créditos en estas comprobaciones.

## Fuentes oficiales

- [Restricción del correo predeterminado de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [SMTP transaccional de Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
