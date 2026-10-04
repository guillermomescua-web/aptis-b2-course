// Read-only extraction: never writes the academic course or PDFs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const course = JSON.parse(fs.readFileSync(path.join(root, 'data/course.json'), 'utf8'));
const catalog = {};
for (const ex of course.exercises) {
  const speaking = /SPEAKING/i.test(ex.title) || ex.source === '12_SPEAKING_MASTERBOOK.pdf';
  const writing = /WRITING PART [1-4]|PARAPHRASE|REGISTER|COHESION|FORMULATION|EDIT FOR FULFILMENT|EDIT A WORD-COUNT/i.test(ex.title) || ex.source === '10_WRITING_MASTERBOOK.pdf';
  if (!speaking && !writing) continue;
  for (const q of ex.questions) {
    if (/^([A-Z])\s*[-–]/.test(course.answers[q.id] || '')) continue;
    catalog[q.id] = { kind: speaking ? 'speaking' : 'writing', title: ex.title, prompt: q.prompt, context: ex.context, intro: q.intro || '', wordRange: q.wordRange || '', part: q.part || '', answerBookGuidance: course.answers[q.id] || '' };
  }
}
fs.mkdirSync(path.join(root, 'worker/src'), { recursive: true });
fs.writeFileSync(path.join(root, 'worker/src/catalog.js'), '// Allowlist extracted without modifying data/course.json.\nexport default ' + JSON.stringify(catalog, null, 2) + ';\n');
console.log(`AI allowlist: ${Object.keys(catalog).length} original question IDs.`);
