# Escuchas ilimitadas — 21/10/2026

Decisión pedagógica expresa: no aplicar el límite oficial de dos escuchas, tampoco durante examen.

## Cambio

- Reproductor común: sin tope de reproducciones, pausa/reanudación y volver a escuchar desde el inicio. Reanudar conserva la posición y no incrementa el contador.
- Contadores históricos conservados como estadística. Los controles solo se deshabilitan transitoriamente durante carga o cuando no hay audio que pausar.
- Copias antiguas válidas; exportación/importación admite contadores superiores a dos. El límite de representación numérica no bloquea el acceso al audio.
- Migración aditiva `004_unlimited_listening.sql`: amplía únicamente la validación del contador. Conserva IDs, validación de otras entidades, revisiones, RLS, roles y tablas. No escribe ni borra progreso.
- Los MP3 existentes, transcripciones, preguntas y soluciones no cambian. Solo se adapta la indicación de reproducción al mostrarla en pantalla; `course.json` permanece idéntico.
- Las soluciones y transcripciones siguen ocultas durante el intento. Sin nuevas llamadas OpenAI al reproducir ni reanudar.

## Verificación

`tests/listening-browser.mjs` reproduce realmente tres veces cada uno de los 88 MP3 (ocho semanales y 20 por cada uno de los cuatro mocks), comprueba pausa/reanudación, conservación de posición, contador tras recargar, controles habilitados y móvil de 390 px sin desbordamiento. Comprueba además Detener durante la carga y cero llamadas al proveedor IA.

Pruebas de base de datos: contadores 2, 3 y 100000 persistidos; valores negativos, fraccionarios, strings y valores no representables rechazados. Profesor sin permiso de escritura. `live_unlimited_listening_check.sql` permite repetir la validación en producción sin modificar datos de la alumna.

El baseline `unlimited-listening-baseline.json` conserva hashes de contenido académico, Reading Lab y los 88 MP3. Regresión de 43 pruebas automáticas, recorrido v2 y regresión del scroll incluidos.

## Alcance actual y despliegue

Los tres nuevos exámenes solicitados en v2.2 todavía no están implementados en este checkout. La regla de escuchas ilimitadas sustituye el requisito anterior para su futura implementación; no se afirma haberlos probado ni publicado.

Aplicar primero la migración 004 en Supabase y ejecutar la comprobación real. Después publicar el frontend, verificar el commit de Pages y comprobar reproducción/guardado en producción. No publicar una interfaz que prometa guardar contadores superiores a dos mientras el servidor conserve la validación antigua.

Migración 004 aplicada en el Supabase de producción el 21/10/2026. La comprobación real devuelve PASS: acepta 0, 2, 3, 99999 y el máximo entero representable; rechaza valores inválidos; mantiene RLS y permisos. La comprobación no escribe datos de la alumna.
