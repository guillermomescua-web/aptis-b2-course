# Clase teórica Semana 2 — 22/10/2026

## Producto

Ruta `#theory`, entrada «Clases teóricas». Una clase opcional con tres capítulos, 24 diapositivas y tres MP3 estáticos. Duración de la narración sincronizada: 1499,999 segundos, aproximadamente 25:00. No se crean clases de otras semanas ni se bloquea ninguna sesión.

Reproductor propio: reproducción/pausa, ±15 segundos, barra temporal, salto a explicación y capítulos anterior/siguiente. Texto principal breve y transcripción del ejemplo nuevo bajo un desplegable. No se incrustan los originales que adelantan soluciones. El PDF descargable tiene seis páginas, 30 entradas léxicas con significado en inglés, combinaciones, gramática, errores y estrategias.

## Revisión de las fuentes originales

Se abrieron las tres URLs públicas de Scrimba y se leyeron sus transcripciones y diapositivas:

- Vocabulary `guide0m9jb3jhl`: resuelve explícitamente opciones de W2D1–W2D4 y usa los contextos originales.
- Grammar `guide09r24io8u`: muestra y explica las cuatro respuestas reales de W2D4, además de ejemplos de Writing demasiado cercanos a las tareas.
- Exam Skills `guide0bc0hn4ue`: incluye un modelo de la tarea real W2D1 y desarrolla ideas para los escenarios originales.

Las páginas públicas presentan el reproductor de Scrimba, la transcripción completa y enlaces externos. No se encontró una edición del contenido desde las herramientas disponibles ni un contrato de control de posición para integrar esas versiones corregidas. Incrustar la página original mantendría las filtraciones. Se eligió la alternativa expresamente autorizada: diapositivas propias con narración sincronizada. No se publican parámetros de propiedad o reclamación.

## Revisión pedagógica interna

Se leyeron todas las preguntas, opciones, soluciones, anuncios, fotografías descritas y grabación de W2D1, W2D2, W2D3 y W2D4. Después se revisó el contenido nuevo completo, no solo la estructura JSON.

| Bloque original | Contenido que se enseña | Separación de los ejercicios reales |
|---|---|---|
| W2D1–W2D4 Vocabulary | Los 20 objetivos léxicos, distinciones semánticas y colocaciones; 30 entradas en el glosario | Facturas, astronomía, conservación, coro y documentos digitales; sin reproducir enunciados, opciones ni letras correctas |
| W2D4 Grammar | Preferencias, necesidad con significado pasivo, concordancia neither/nor y contraste | Pintura y viaje, lavar un coche, entrenador/jugadores y niebla/aterrizaje; sin verbos ni escenas de las respuestas originales |
| W2D1/W2D2/W2D4 Writing | Audiencia, propósito, todos los puntos solicitados, restricciones, registro y extensiones | Picnic y ensayo de coro; un ejemplo nuevo de 26 palabras, sin modelos para intercambio de idiomas, cooperativa o grupo de lectura |
| W2D3 Reading | Propósito del párrafo, evidencia, distractores y coherencia | Un jardín cambia del riego al tratamiento del suelo; sin resumir párrafos de paquetería ni asociarles encabezados |
| W2D3 Speaking | Descripción/evidencia, experiencia, evaluación, comparación y planificación | Reparación de una bicicleta; aprendizaje en aula frente a bosque; sin fotografías o respuestas de compras |
| W2D4 Listening | Plan inicial, cambio, decisión y siguiente actor | Ferry cancelado, tren y reserva por un familiar; sin relato ni respuestas del taller de fotografía |

Enseñar el vocabulario y sus patrones es deliberado; la protección consiste en evitar el ejercicio y su respuesta en contexto, no en ocultar el significado que se está aprendiendo. Las actividades guiadas corresponden exclusivamente a ejemplos nuevos. La comprobación automática detecta preguntas reales completas de ocho o más palabras, la grabación original, parámetros privados y cambios de hashes. Complementa la revisión semántica anterior y no la sustituye.

## Narración y coste

`gpt-4o-mini-tts`, voz cedar, instrucción de narración británica, 3891 palabras, 24 segmentos originales unidos en tres capítulos. Nivelado de volumen y ajuste uniforme moderado del ritmo (tempo 0,9673); no se rellena la duración con silencio ni repeticiones. Los inicios/finales de las diapositivas se calculan desde la longitud PCM de cada segmento.

Estimación previa conservadora: 0,551 USD. Duración fuente generada: 1451 segundos. Estimación por esa duración e input: 0,3659 USD, aproximadamente 0,37 USD. No es una cifra observada de facturación en Usage. [Modelo y tarifas](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts). La clave local existente se mantiene en `.env`, ignorado; las respuestas completadas se cachean para no repetir gastos. Reproducción sin peticiones OpenAI.

## Persistencia y seguridad

Migración aditiva `005_theory_week2.sql`, aplicada en Supabase de producción. Añade únicamente la tabla `theory_progress`, tres IDs y el nuevo tipo a los RPC existentes. Las demás validaciones, incluida Listening ilimitado, se conservan. Guarda inicio, finalización, posición, mayor posición alcanzada y fecha, con revisión para conflictos. Caché y cola por cuenta reutilizan LearningStore. Copia completa e importación incluyen la clase y siguen aceptando respaldos antiguos.

La prueba transaccional `live_theory_check.sql` pasó también en Supabase real: alumno propietario guarda/recupera; otro alumno y profesor no asignado no leen; el profesor asignado solo lee; anónimo denegado. Fixtures temporales retirados mediante rollback. El profesor no aprueba ni desbloquea la clase o el curso.

## Verificación

- 47 pruebas automáticas de contenido, integridad, sincronización, importación, RLS, roles, audio y Worker.
- Recorrido v2: 27 comprobaciones, conservando sesiones, mocks, Writing/Speaking, IA, Labs, profesor/comentarios, grabaciones y copias. La prueba de Listening espera el inicio real del MP3 antes de evaluar el botón; la carga transitoria no se confunde con un bloqueo por contador.
- Clase: 12 comprobaciones con sus tres MP3 reales; pausa, ±15 segundos, selección de diapositiva, recuperación tras recargar, segundo contexto de navegador recuperando el capítulo a 190 segundos, finalización nativa al acabar, PDF y navegación libre.
- Móvil 390 px, tablet 768 y escritorio 1440, sin desbordamiento horizontal. Sin excepciones de página ni llamadas IA en reproducción.
- Regresión del scroll: nueve comprobaciones. El sondeo no redibuja ni reinicia el reproductor.
- PDF: seis páginas renderizadas y revisadas visualmente; texto de estudio, no transcripción de la clase.
- Baseline independiente previo: `theory-week2-baseline.json`. `course.json`, 972 IDs, 201 ejercicios, 32 sesiones, 16 PDFs, cuatro mocks, Writing plan, Vocabulary/Reading Labs y 88 MP3 originales mantienen sus bytes.

La prueba en dos contextos de navegador verifica la recuperación desde servidor; no representa una prueba física de dos dispositivos. La valoración humana de la voz y de la experiencia docente corresponde a la evaluación solicitada de esta primera semana.
