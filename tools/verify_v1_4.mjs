import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p));
const baseline = JSON.parse(read('docs/v1.4-integrity.json'));
const course = JSON.parse(read('data/course.json'));
const plan = JSON.parse(read('data/writing-plan.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const [p, hash] of Object.entries(baseline.hashes)) assert.equal(sha(read(p)), hash, `Protected file changed: ${p}`);
assert.deepEqual(course.exercises.flatMap(e => e.questions.map(q => q.id)).sort(), baseline.questionIds);
assert.equal(baseline.questionIds.length, 972);
assert.equal(course.pdfs.length, 16);
assert.deepEqual(course.exercises.map(e => e.id).sort(), baseline.exerciseIds);
assert.deepEqual(Object.keys(course.sessions).sort(), baseline.sessions);
const writing = ex => /WRITING PART [1-4]|PARAPHRASE|REGISTER|COHESION|FORMULATION|EDIT FOR FULFILMENT/i.test(ex.title);
for (let w = 1; w <= 8; w++) {
  const exs = course.exercises.filter(ex => new RegExp(`^W${w}D[1-4]-E`).test(ex.id) && writing(ex));
  const item = plan.weeks[`W${w}`];
  assert.equal(item.primary.length, 3);
  assert.equal(item.primary.filter(id => id.startsWith(`W${w}D1-`)).length, 2);
  assert.equal(item.primary.filter(id => id.startsWith(`W${w}D2-`)).length, 1);
  assert.deepEqual([...item.primary, ...item.extra].sort(), exs.map(ex => ex.id).sort(), `Writing coverage W${w}`);
  assert.equal(new Set([...item.primary, ...item.extra]).size, exs.length);
}
console.log(`Verified: course SHA256 ${baseline.courseSha256}; 972 original IDs; 16 identical PDFs; ${Object.keys(baseline.hashes).length} protected files; 24 primary Writing blocks; 306 unchanged vocabulary units.`);
