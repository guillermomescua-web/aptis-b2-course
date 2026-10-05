import fs from 'node:fs';
import path from 'node:path';
import catalog from '../worker/src/catalog.js';
const root = path.resolve(import.meta.dirname, '..');
const course = JSON.parse(fs.readFileSync(path.join(root, 'data/course.json')));
const vocab = JSON.parse(fs.readFileSync(path.join(root, 'data/vocabulary.json')));
const quote = s => `'${String(s).replaceAll("'", "''")}'`;
const rows = [];
for (const ex of course.exercises) {
  rows.push(['exercise', ex.id]);
  for (const q of ex.questions) rows.push(['answer', q.id]);
}
for (const id of [...Object.keys(course.sessions), 'DIAG', ...[1,2,3,4].flatMap(n => ['A','B','C'].map(b => `MOCK${n}-${b}`))]) rows.push(['session', id]);
for (const id of Object.keys(course.recordings)) rows.push(['listening', id]);
for (const unit of vocab.units) rows.push(['vocabulary', unit.id]);
for (const [id, task] of Object.entries(catalog)) rows.push([task.kind, id]);
const sql = '-- Generated reference IDs only. The academic source files are unchanged.\ninsert into public.content_refs(kind,id) values\n' + rows.map(row => `(${row.map(quote).join(',')})`).join(',\n') + '\non conflict do nothing;\n';
fs.mkdirSync(path.join(root, 'supabase/migrations'), {recursive: true});
fs.writeFileSync(path.join(root,'supabase/migrations/002_content_refs.sql'),sql);
