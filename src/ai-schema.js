// Shared contract: used by the Worker and by the browser before rendering feedback.
export const AI_SCHEMA_VERSION = 1;
export const ERROR_CATEGORIES = ['G', 'V', 'C', 'R', 'COH', 'TF'];
const text = { type: 'string' };
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const strings = { type: 'array', items: text, maxItems: 4 };
const trackerError = object({ error: text, correction: text, category: { type: 'string', enum: ERROR_CATEGORIES } });
export const writingSchema = object({
  overall: object({ summary: text, levelComment: text }),
  taskFulfilment: text, grammar: text, vocabulary: text, cohesion: text, register: text,
  wordCount: object({ current: { type: 'integer' }, target: text }),
  strengths: strings,
  errors: { type: 'array', maxItems: 6, items: object({ original: text, correction: text, category: { type: 'string', enum: ERROR_CATEGORIES }, explanation: text }) },
  priorities: { ...strings, maxItems: 3 }, improvedVersion: text, trackerErrors: { type: 'array', maxItems: 6, items: trackerError },
});
export const speakingSchema = object({
  transcript: text, summary: text, taskFulfilment: text, fluency: text, pronunciation: text,
  rhythmIntonation: text, grammar: text, vocabulary: text, strengths: strings,
  issues: { type: 'array', maxItems: 6, items: object({ type: text, example: text, feedback: text }) },
  priorities: { ...strings, maxItems: 3 }, betterAnswer: text, trackerErrors: { type: 'array', maxItems: 6, items: trackerError },
});

export function validateFeedback(kind, value) {
  const schema = kind === 'writing' ? writingSchema : kind === 'speaking' ? speakingSchema : null;
  if (!schema) throw new Error('Tipo de feedback inválido.');
  function check(rule, item, key = '') {
    if (rule.type === 'object') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Feedback incompleto.');
      if (Object.keys(item).some(k => !Object.hasOwn(rule.properties, k))) throw new Error('Feedback incompatible.');
      for (const k of rule.required) check(rule.properties[k], item[k], k);
    } else if (rule.type === 'array') {
      const max = key === 'priorities' ? 3 : key === 'strengths' ? 4 : 6;
      if (!Array.isArray(item) || item.length > max) throw new Error('Feedback fuera de los límites.');
      item.forEach(x => check(rule.items, x));
    } else if (rule.type === 'string') {
      if (typeof item !== 'string' || item.length > (['transcript', 'improvedVersion', 'betterAnswer'].includes(key) ? 8000 : 2000) || (rule.enum && !rule.enum.includes(item))) throw new Error('Texto de feedback inválido.');
    } else if (!Number.isInteger(item) || item < 0 || item > 6000) throw new Error('Recuento inválido.');
  }
  check(schema, value);
  if (kind === 'speaking' && value.trackerErrors.some(e => !['G', 'V', 'C'].includes(e.category))) throw new Error('Error de Speaking no verificable.');
  return value;
}

export function parseModelJSON(content) {
  if (typeof content !== 'string' || content.length > 50000) throw new Error('Respuesta no válida.');
  const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

export const countWords = value => (String(value || '').trim().match(/\S+/g) || []).length;
