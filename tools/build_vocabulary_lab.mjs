import fs from 'node:fs';

const course = JSON.parse(fs.readFileSync(new URL('../data/course.json', import.meta.url), 'utf8'));
const categories = ['Collocations', 'Synonym nuance', 'Prepositions', 'Verb patterns', 'Word families', 'Confusing words', 'Formal vs informal vocabulary', 'Phrasal verbs / useful chunks'];
const categoryCode = new Map(categories.map((name, index) => [name, ['COLL', 'SYN', 'PREP', 'VERB', 'FAM', 'CONF', 'REG', 'CHUNK'][index]]));
const units = [];
const categoryCounts = Object.fromEntries(categories.map(name => [name, 0]));

function categoryFor(prompt, choices, keyText, guidance, origin) {
  const joined = `${prompt} ${choices.join(' ')} ${keyText} ${guidance}`.toLowerCase();
  if (/formal|informal|natural formal|natural informal|polite|aggressive|friend|message to a friend|register/.test(joined)) return 'Formal vs informal vocabulary';
  if (/affect|effect|advice|advise|rise|raise|principal|principle|further|farther|imminent|eminent|available|suitable|refund|discount|deposit|plausible|certain|efficient|effective|compliment|complement/.test(joined)) return 'Confusing words';
  if (/word family|family member|form of |noun|adjective|adverb|clarify|clarity|accurate|accuracy|significantly|reliable|reliability|significance/.test(joined)) return 'Word families';
  if (/which word means|closest to|means '|similar meaning|similar in meaning|synonym|interchangeable|versus|\bvs\b|distinguish between/.test(joined)) return 'Synonym nuance';
  if (/look forward to|object to|be accustomed to|discuss the issue|explain the rule|affect attendance|request information|respond to|apply for|refer to|verb pattern|gerund|infinitive|remind someone to|deter someone from/.test(joined)) return 'Verb patterns';
  if (/preposition|\bdepend on\b|\bcomply with\b|\bshort of\b|\benquire about\b|\bin favour of\b|\brefer to\b|\bcompatible with\b|\bregardless of\b|\battributable to\b|\bsubject to\b|\bresponsible for\b|\baccess to\b/.test(joined)) return 'Prepositions';
  if (/phrasal verb|settle on|without further ado|at a glance|get straight to the point|take part in|come into effect|take .* by surprise|take .* for granted|jump to conclusions|cast doubt on|call .* into question/.test(joined)) return 'Phrasal verbs / useful chunks';
  if (origin === 'mock' && /similar meaning|definitions/.test(prompt.toLowerCase())) return 'Synonym nuance';
  if (origin === 'mock' && /usage/.test(prompt.toLowerCase())) return 'Verb patterns';
  return 'Collocations';
}

function addUnit({ category, term, definition, example, prompt, correct, choices, source, sourceRef, kind = 'choice' }) {
  categoryCounts[category] += 1;
  const id = `VOC-${categoryCode.get(category)}-${String(categoryCounts[category]).padStart(3, '0')}`;
  const distractors = choices.filter(choice => String(choice).trim().toLowerCase() !== String(correct).trim().toLowerCase());
  units.push({ id, term, category, definition, example, prompt, correct, choices, distractors, source, sourceRef, kind });
}

function parsedAnswer(text) {
  const match = String(text || '').match(/^([A-Z])\s*[-–]\s*([\s\S]*)$/);
  return match ? { letter: match[1], guidance: match[2].trim() } : null;
}

function mockChoices(context) {
  const lines = String(context || '').split(/\r?\n/);
  return lines.map(line => line.match(/^([A-J])\.\s*(.+)$/)).filter(Boolean).map(([, key, text]) => ({ key, text: text.trim() }));
}

for (const exercise of course.exercises) {
  if (exercise.title === 'VOCABULARY' && /^0[2-9]_WEEK_/.test(exercise.source || '')) {
    for (const q of exercise.questions) {
      const parsed = parsedAnswer(course.answers[q.id]);
      const choices = q.options || [];
      const selected = choices.find(option => option.key === parsed?.letter);
      if (!parsed || !selected) continue;
      const category = categoryFor(q.prompt, choices.map(option => option.text), selected.text, parsed.guidance, 'week');
      addUnit({
        category, term: selected.text, definition: parsed.guidance, example: q.prompt,
        prompt: q.prompt, correct: selected.text, choices: choices.map(option => option.text),
        source: 'week', sourceRef: q.id,
      });
    }
  }
  if (/^MOCK0[1-4]-CORE-V$/.test(exercise.id)) {
    for (const [index, q] of exercise.questions.entries()) {
      const parsed = parsedAnswer(course.answers[q.id]);
      const setIndex = Math.floor(index / 5);
      const setContext = setIndex === 0 ? exercise.context : exercise.questions[setIndex * 5].intro;
      const choices = mockChoices(setContext);
      const selected = choices.find(option => option.key === parsed?.letter);
      if (!parsed || !selected || choices.length < 3) continue;
      const category = categoryFor(`${setContext} ${q.prompt}`, choices.map(option => option.text), selected.text, parsed.guidance, 'mock');
      addUnit({
        category, term: selected.text, definition: parsed.guidance, example: q.prompt,
        prompt: q.prompt.replace(/\s*_{2,}\s*$/, '').trim(), correct: selected.text,
        choices: choices.map(option => option.text), source: 'mock', sourceRef: q.id,
      });
    }
  }
}

const masterbook = [
  ['Collocations', 'make', 'Make a recommendation.', 'Choose the verb: ___ a recommendation.', ['make', 'raise', 'meet', 'draw'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “make a recommendation”'],
  ['Collocations', 'raise', 'Raise a concern.', 'Choose the verb: ___ a concern.', ['raise', 'reach', 'provide', 'fulfil'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “raise a concern”'],
  ['Collocations', 'reach', 'Reach an agreement.', 'Choose the verb: ___ an agreement.', ['reach', 'draw', 'address', 'meet'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “reach an agreement”'],
  ['Collocations', 'meet', 'Meet a requirement.', 'Choose the verb: ___ a requirement.', ['meet', 'make', 'raise', 'provide'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “meet a requirement”'],
  ['Collocations', 'draw', 'Draw a conclusion.', 'Choose the verb: ___ a conclusion.', ['draw', 'address', 'fulfil', 'reach'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “draw a conclusion”'],
  ['Collocations', 'address', 'Address a problem.', 'Choose the verb: ___ a problem.', ['address', 'raise', 'meet', 'make'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “address a problem”'],
  ['Collocations', 'provide', 'Provide evidence.', 'Choose the verb: ___ evidence.', ['provide', 'fulfil', 'draw', 'reach'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “provide evidence”'],
  ['Collocations', 'fulfil', 'Fulfil a commitment.', 'Choose the verb: ___ a commitment.', ['fulfil', 'meet', 'raise', 'address'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “fulfil a commitment”'],
  ['Collocations', 'make', 'Make progress.', 'The team ___ steady progress.', ['did', 'made', 'took'], 'MBV-E02-Q01'],
  ['Collocations', 'heavy', 'Heavy rain.', 'Choose the natural combination: ___ rain.', ['heavy', 'sharp', 'strong'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “strong rain” repair'],
  ['Collocations', 'a piece of', 'A piece of evidence.', 'Complete: The report includes ___ evidence.', ['a piece of', 'an item of', 'a number of'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “a piece of evidence”'],
  ['Synonym nuance', 'available / suitable', 'A room can be available but unsuitable: available means accessible or free; suitable means appropriate for a purpose.', 'The room is free on Tuesday but too small for the group. Which pair fits?', ['available, but unsuitable', 'available and suitable', 'unavailable, but suitable'], 'MBV-E01-Q01'],
  ['Synonym nuance', 'effective / efficient', 'Effective describes achieving a result; efficient adds avoiding unnecessary time or resources.', 'A method achieves its aim but uses more staff time than necessary. It is…', ['effective but inefficient', 'ineffective but efficient', 'effective and efficient'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · effective / efficient'],
  ['Synonym nuance', 'plausible', 'Reasonably believable, but not proved.', 'An explanation fits known facts but has not been proved. It is…', ['plausible', 'certain', 'final'], 'MBV-E01-Q03'],
  ['Synonym nuance', 'refund / discount / deposit', 'A refund returns money already paid; a discount reduces the price; a deposit is part-payment or security.', 'A shop returns money you already paid. What is it?', ['a refund', 'a discount', 'a deposit'], 'MBV-E01-Q02'],
  ['Prepositions', 'for', 'responsible for', 'Choose the preposition: responsible ___ the equipment.', ['for', 'of', 'with'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “responsible for”'],
  ['Prepositions', 'in', 'interested in', 'Choose the preposition: interested ___ the evening classes.', ['in', 'on', 'for'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “interested in”'],
  ['Prepositions', 'with', 'compatible with', 'Choose the preposition: compatible ___ the existing software.', ['with', 'to', 'for'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “compatible with”'],
  ['Prepositions', 'on', 'dependent on', 'Choose the preposition: dependent ___ approval.', ['on', 'of', 'with'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “dependent on”'],
  ['Prepositions', 'on', 'an effect on', 'Choose the preposition: an effect ___ attendance.', ['on', 'to', 'for'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “an effect on”'],
  ['Prepositions', 'for', 'a reason for', 'Choose the preposition: a reason ___ the change.', ['for', 'of', 'to'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “a reason for”'],
  ['Prepositions', 'over', 'an advantage over', 'Choose the preposition: an advantage ___ the alternative.', ['over', 'to', 'for'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “an advantage over”'],
  ['Prepositions', 'to', 'access to', 'Choose the preposition: access ___ the records.', ['to', 'for', 'of'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “access to”'],
  ['Verb patterns', 'discuss the issue', 'Discuss takes a direct object: do not add about.', 'Complete with the natural pattern: We discussed ___ revised timetable.', ['the', 'about the', 'on the'], 'MBV-E02-Q02'],
  ['Verb patterns', 'explain the rule', 'Explain takes the thing being explained as its direct object.', 'Complete: Please explain ___ final instruction.', ['the', 'about the', 'to the'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “explain the rule”'],
  ['Verb patterns', 'affect attendance', 'Affect is a transitive verb and takes a direct object.', 'Complete: The change may affect ___.', ['attendance', 'on attendance', 'to attendance'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “affect attendance”'],
  ['Verb patterns', 'request information', 'Request can take a direct object.', 'Complete: You can request ___.', ['information', 'for information', 'to information'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “request information”'],
  ['Verb patterns', 'respond to a request', 'Respond is followed by to.', 'Complete: Please respond ___ the request.', ['to', 'for', 'with'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “respond to a request”'],
  ['Verb patterns', 'apply for a place', 'Apply is followed by for when asking for a place or position.', 'Complete: She plans to apply ___ a place.', ['for', 'to', 'with'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “apply for a place”'],
  ['Verb patterns', 'refer to a notice', 'Refer is followed by to when mentioning a source.', 'Complete: Please refer ___ the notice.', ['to', 'at', 'with'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “refer to a notice”'],
  ['Verb patterns', 'object to paying', 'After prepositional to, use a noun or -ing form.', 'Complete: They objected to ___ an extra fee.', ['paying', 'pay', 'to pay'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “object to a proposal”; p.1 · prepositional to'],
  ['Verb patterns', 'look forward to hearing', 'After prepositional to, use a noun or -ing form.', 'Complete: I look forward to ___ from you.', ['hearing', 'hear', 'to hear'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “look forward to hearing”'],
  ['Word families', 'accurate → accuracy', 'Use the noun accuracy after the article the.', 'We need to check the ___ of the figures.', ['accuracy', 'accurate', 'accurately'], 'MBV-E03-Q01'],
  ['Word families', 'clear → clarify', 'Clarify is the verb meaning make clear.', 'Could you ___ the final requirement?', ['clarify', 'clarity', 'clear'], 'MBV-E03-Q02'],
  ['Word families', 'significant → significantly', 'Significantly is an adverb modifying increased.', 'Attendance increased ___.', ['significantly', 'significance', 'significant'], 'MBV-E03-Q03'],
  ['Word families', 'rely → reliable', 'Reliable is the adjective needed after be.', 'The information must be ___.', ['reliable', 'rely', 'reliably'], 'MBV-E03-Q04'],
  ['Word families', 'clear → clarity', 'Clarity is the noun in the listed family.', 'Choose the noun in this family: clear / clarify / ___.', ['clarity', 'clearly', 'clarified'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · clear / clarity / clarify'],
  ['Word families', 'reliable → reliability', 'Reliability is the noun in the listed family.', 'Choose the noun: reliable / reliably / ___.', ['reliability', 'reliably', 'reliable'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · reliable / reliability / reliably'],
  ['Confusing words', 'affect / effect', 'Affect is usually a verb meaning influence; effect is usually a noun meaning result.', 'Choose the verb meaning “influence”: affect or effect?', ['affect', 'effect'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · affect / effect'],
  ['Confusing words', 'advice / advise', 'Advice is a noun; advise is a verb.', 'Complete: Could you ___ me about the route?', ['advise', 'advice'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · advice / advise'],
  ['Confusing words', 'rise / raise', 'Rise has no direct object; raise takes one.', 'Complete: The centre ___ its prices.', ['raised', 'rose'], 'MBV-E02-Q05'],
  ['Confusing words', 'deposit / discount / refund', 'These all relate to payment but describe different transactions.', 'Which word means a reduction in the price before payment?', ['discount', 'deposit', 'refund'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · deposit / discount / refund'],
  ['Formal vs informal vocabulary', 'help / facilitate', 'Use does not always improve a sentence; help may be more natural in a message to a friend.', 'For a message to a friend, choose the more natural verb: “I can ___ you with the booking.”', ['help', 'facilitate'], '11_VOCABULARY_MASTERBOOK.pdf p.2 · “help” / “facilitate”'],
  ['Formal vs informal vocabulary', 'utilise / use', 'Use does not automatically become better as utilise; choose an appropriate register.', 'Choose the ordinary verb for a message to a friend: “Can I ___ your spare chair?”', ['use', 'utilise'], '11_VOCABULARY_MASTERBOOK.pdf p.2 · “use” / “utilise”'],
  ['Phrasal verbs / useful chunks', 'raise a concern', 'The Masterbook recommends learning a complete unit rather than an isolated word.', 'Which chunk means to bring a problem to someone’s attention?', ['raise a concern', 'rise a concern', 'raise prices'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “raise a concern”'],
  ['Phrasal verbs / useful chunks', 'take responsibility for', 'Store the whole chunk, including its usual preposition.', 'Complete: take responsibility ___ a mistake.', ['for', 'of', 'to'], '11_VOCABULARY_MASTERBOOK.pdf p.1 · “take responsibility for a mistake”'],
];

for (const [category, term, definition, prompt, choices, sourceRef] of masterbook) {
  const correct = choices[0];
  addUnit({ category, term, definition, example: prompt, prompt, correct, choices, source: 'masterbook', sourceRef });
}

const sourcePriority = { masterbook: 0, week: 1, mock: 2, personal: 3, extra: 4 };
units.sort((a, b) => sourcePriority[a.source] - sourcePriority[b.source] || a.id.localeCompare(b.id));

const payload = {
  schemaVersion: 1,
  title: 'Vocabulary Lab',
  sources: ['11_VOCABULARY_MASTERBOOK.pdf', '02_WEEK_1.pdf–09_WEEK_8.pdf', '13_MOCK_EXAMS.pdf', 'Error Tracker entries'],
  categories,
  units,
};
fs.writeFileSync(new URL('../data/vocabulary.json', import.meta.url), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ units: units.length, categories: categoryCounts, sources: Object.fromEntries(['masterbook', 'week', 'mock'].map(source => [source, units.filter(unit => unit.source === source).length])) }, null, 2));
