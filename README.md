# APTIS ESOL GENERAL — B2 Performance Course

Web estática del curso de ocho semanas. Incluye 32 sesiones (`W1D1`–`W8D4`), diagnóstico, cuatro simulacros en bloques, Masterbooks, solucionario interactivo, Listening mediante voz del navegador, temporizadores, progreso y Error Tracker.

## Arquitectura

- `index.html` y `styles.css`: estructura y diseño adaptativo.
- `src/app.js`: navegación, ejercicios y estado local, sin servidor ni claves API.
- `data/course.json`: índice generado desde los 16 PDFs finales.
- `pdfs/`: documentos originales descargables. **Son la fuente de verdad académica.**
- `tools/build_content.py`: vuelve a extraer IDs, enunciados, respuestas y guiones si se actualizan los PDFs.

El sitio no requiere instalación de paquetes para publicarse. Usa rutas con `#`, por lo que funciona bajo el subdirectorio que asigna GitHub Pages a un repositorio. El progreso, las respuestas, las escuchas y el Error Tracker se guardan con `localStorage` en el navegador y dispositivo actual. Borrar los datos del navegador los elimina.

## Publicar en GitHub Pages

1. Crea un repositorio de GitHub y sube **todo el contenido de esta carpeta** a la rama `main`.
2. En el repositorio, abre **Settings → Pages**.
3. Selecciona **Deploy from a branch**, rama `main` y carpeta **/(root)**.
4. Guarda la configuración y abre la URL que muestre GitHub Pages.

La página de entrada es `index.html`; no hay compilación ni variables de entorno. `.nojekyll` evita transformaciones de Jekyll sobre los archivos estáticos.

## Probar en local

Desde esta carpeta, ejecuta `python -m http.server 8765` y abre `http://localhost:8765/`. El acceso directo mediante `file://` no puede cargar `data/course.json` en algunos navegadores por las restricciones normales de seguridad.

## Contenido y corrección

- Cada pregunta conserva su ID del PDF y se asocia al mismo ID del `14_COMPLETE_ANSWER_BOOK.pdf`.
- Las preguntas con una solución objetiva por letra se corrigen automáticamente. Writing, Speaking y otras respuestas abiertas muestran las orientaciones del solucionario para revisión personal; no se les asigna una nota automática.
- Writing muestra el recuento de palabras y el intervalo pedido en el PDF.
- Speaking ofrece los tiempos indicados en el material: 30 segundos por respuesta en Part 1, 45 segundos en Parts 2–3, y un minuto de preparación más dos minutos de respuesta en Part 4.
- Listening lee los guiones del solucionario con `speechSynthesis`. El texto permanece oculto durante el intento en la interfaz y se limita cada grabación a dos reproducciones por navegador. La calidad y disponibilidad de la voz dependen del sistema del estudiante.
- Cada simulacro se divide en A: Core + Reading (25 + 35 min), B: Writing + revisión (50 + 10 min), C: Listening + Speaking + revisión (40 + 12 + 8 min). Los tiempos de los componentes son los indicados en los PDFs; la revisión completa los bloques de 60 minutos.

El diagnóstico es opcional y separado de las 32 sesiones. Las actividades no introducen enunciados académicos nuevos: el sitio organiza el material existente y añade controles técnicos para responderlo.

## Actualizar el índice tras cambiar un PDF

Con Python y `pypdf` instalados, ejecuta `python tools/build_content.py` desde la raíz. El script informa del número de preguntas y soluciones enlazadas. No edites `data/course.json` a mano: realiza las correcciones de contenido en los PDFs y vuelve a generar el índice.

## Privacidad

No hay cuenta, analítica, backend, envío de respuestas ni claves API. Los PDFs y el índice se sirven como archivos públicos del repositorio si GitHub Pages se habilita; publícalo en un repositorio adecuado para compartir ese material.

## Mejoras v1.1

- Speaking Part 2 y Part 3 muestran fotografías basadas en los briefs originales, con descripciones accesibles. Las preguntas y los IDs siguen en `data/course.json` sin cambios.
- Speaking permite grabar y reproducir respuestas con `MediaRecorder`. Los clips quedan solo en memoria hasta cerrar la pestaña; el navegador pide permiso para usar el micrófono. Si no lo admite, siguen disponibles los temporizadores y las notas.
- `audio/manifest.json` reserva la estructura para grabaciones de calidad. Se deja sin archivos de audio porque no se dispone de una generación fiable con naturalidad B2. Listening usa automáticamente `speechSynthesis`, alterna voces o entonación en diálogos y conserva el límite de dos escuchas.
- El panel permite exportar e importar el progreso como JSON con versión de esquema. La importación valida los datos y solicita confirmación antes de reemplazar lo guardado. Las grabaciones de Speaking no se incluyen en el JSON.
