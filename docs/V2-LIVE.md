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
- Las dos cuentas existen en Auth. Tras confirmación expresa se han aplicado perfiles y roles student/teacher y relación de supervisión de una alumna. SQL devuelve Success. Pendiente que cada titular acepte su invitación y elija contraseña. No guardar emails personales en GitHub.
- Contraseñas mediante Auth, elegidas por sus titulares; ningún password por chat.
- Subida versión Worker de prueba `0ff7b425-d5cb-4e46-bb54-de9cd56b97e7` (alias solicitado `aptis-v2`), sin desplegar a tráfico de producción. La inspección confirma conservación de OPENAI_API_KEY, TURNSTILE_SECRET_KEY y RATE_LIMIT_SALT, solo sus nombres. `has_preview=false`: no hay URL de prueba accesible todavía. No habilitar indiscriminadamente previews de versiones antiguas con endpoints anónimos. Pendiente secret Supabase en backend y pruebas de sesión/JWT reales, media privada, Writing/Speaking reales y ambos usuarios.
- Reejecutadas las 35 pruebas automáticas: todas PASS. Integridad: 35 archivos originales idénticos, 972 IDs, 201 ejercicios, 16 PDFs y 306 unidades de vocabulario.
- Publicar frontend y Worker coordinados tras validar. Producción actual sigue en v1; sus endpoints no han sido sustituidos todavía. La configuración local `enabled=true` no significa que esté publicado.

El despliegue no está terminado. Las pruebas locales no se presentan como pruebas OpenAI reales. Sigue intacto el contenido del curso y no se han consumido créditos en estas comprobaciones.

## Fuentes oficiales

- [Restricción del correo predeterminado de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [SMTP transaccional de Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
