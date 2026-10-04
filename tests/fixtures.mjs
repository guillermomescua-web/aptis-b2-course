// Synthetic feedback exclusively for development tests, never used by the deployed app.
export const writing = {
  overall: { summary: 'Respuesta clara y adecuada para B2.', levelComment: 'Buen control de las ideas.' },
  taskFulfilment: 'Responde a lo solicitado.', grammar: 'Revisa la concordancia.', vocabulary: 'Usa collocations adecuadas.', cohesion: 'Organización clara.', register: 'Registro adecuado.',
  wordCount: { current: 20, target: '20-30' }, strengths: ['Ideas claras.'],
  errors: [{ original: 'did progress', correction: 'made progress', category: 'C', explanation: 'La collocation es make progress.' }],
  priorities: ['Revisar collocations.', 'Mantener el registro.', 'Comprobar la extensión.'],
  improvedVersion: 'I would like to learn how to grow vegetables. I can help on Saturday mornings because I am free then.',
  trackerErrors: [{ error: 'did progress', correction: 'made progress', category: 'C' }],
};
export const speaking = {
  transcript: 'I usually visit the park on a free morning.', summary: 'La respuesta es generalmente clara.',
  taskFulfilment: 'Responde a la pregunta seleccionada.', fluency: 'Pausas breves y un ritmo generalmente claro.', pronunciation: 'Generalmente inteligible; el acento no impide comprender.', rhythmIntonation: 'La entonación varía; muestra limitada para una conclusión segura.', grammar: 'Revisa el tiempo verbal.', vocabulary: 'Vocabulario suficiente para la tarea.',
  strengths: ['Idea reconocible.'], issues: [{ type: 'Grammar', example: 'I go yesterday', feedback: 'Usa went para el pasado.' }],
  priorities: ['Consolidar el pasado.', 'Añadir un ejemplo.', 'Mantener pausas naturales.'], betterAnswer: 'On a free morning, I usually visit the park because it helps me relax.',
  trackerErrors: [{ error: 'I go yesterday', correction: 'I went yesterday', category: 'G' }],
};
export function memoryStorage() {
  const values = new Map(); let queue = Promise.resolve();
  const storage = { get: async k => structuredClone(values.get(k)), put: async (k, v) => values.set(k, structuredClone(v)), delete: async k => values.delete(k), setAlarm: async () => {}, deleteAll: async () => values.clear() };
  storage.transaction = fn => { const result = queue.then(() => fn(storage)); queue = result.catch(() => {}); return result; };
  return storage;
}
