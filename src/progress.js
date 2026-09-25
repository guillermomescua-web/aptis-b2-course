export const PROGRESS_SCHEMA = 1;
export const PROGRESS_APP = 'aptis-b2-performance-course';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const entriesValid = (value, ids, check) => plain(value) && Object.entries(value).every(([id, item]) => ids.has(id) && check(item));

export function exportProgress(state) {
  return { app: PROGRESS_APP, schemaVersion: PROGRESS_SCHEMA, exportedAt: new Date().toISOString(), state };
}

export function validateProgress(file, course) {
  if (!plain(file) || file.app !== PROGRESS_APP || file.schemaVersion !== PROGRESS_SCHEMA || !plain(file.state)) {
    throw new Error('Archivo de progreso incompatible o sin versión de esquema válida.');
  }
  const exercises = new Set(course.exercises.map(ex => ex.id));
  const questions = new Set(course.exercises.flatMap(ex => ex.questions.map(q => q.id)));
  const recordings = new Set(Object.keys(course.recordings));
  const sessions = new Set([...Array.from({ length: 8 }, (_, w) => Array.from({ length: 4 }, (_, d) => `W${w + 1}D${d + 1}`)).flat(), 'DIAG', ...[1, 2, 3, 4].flatMap(n => ['A', 'B', 'C'].map(b => `MOCK${n}-${b}`))]);
  const s = file.state;
  if (!entriesValid(s.responses, questions, value => typeof value === 'string' && value.length <= 20000)
      || !entriesValid(s.completed, sessions, value => typeof value === 'boolean')
      || !entriesValid(s.plays, recordings, value => Number.isInteger(value) && value >= 0 && value <= 2)
      || !entriesValid(s.checked, exercises, value => typeof value === 'boolean')
      || !Array.isArray(s.errors) || s.errors.length > 5000
      || !s.errors.every(e => plain(e) && typeof e.key === 'string' && e.key.length <= 100
        && typeof e.id === 'string' && e.id.length <= 100
        && typeof e.category === 'string' && e.category.length <= 100
        && typeof e.error === 'string' && e.error.length <= 20000
        && typeof e.correction === 'string' && e.correction.length <= 20000
        && typeof e.resolved === 'boolean' && typeof e.date === 'string' && e.date.length <= 100)) {
    throw new Error('El archivo contiene datos de progreso inválidos o IDs desconocidos.');
  }
  return { responses: s.responses, completed: s.completed, errors: s.errors, plays: s.plays, checked: s.checked };
}
