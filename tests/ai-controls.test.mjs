import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAIFeedback, installAIFeedback, aiControlsHTML} from '../src/ai-feedback.js';

test('Speaking scope survives account refresh and clears when switching users', () => {
  const listeners = new Map();
  const previous = globalThis.document;
  globalThis.document = {addEventListener: (name, fn) => listeners.set(name, fn), querySelector: () => null};
  try {
    const q = {id: 'W1D3-E03-Q01', part: 'Part 1', prompt: '1. First question?\n2. Second question?'};
    configureAIFeedback({}, 'student-a');
    installAIFeedback({});
    listeners.get('change')({target: {dataset: {aiTarget: q.id}, value: '1'}});
    configureAIFeedback({}, 'student-a');
    assert.match(aiControlsHTML('speaking', q), /value="1" selected/);
    listeners.get('change')({target: {dataset: {aiTarget: q.id}, value: 'all'}});
    assert.doesNotMatch(aiControlsHTML('speaking', q), /value="1" selected/);
    listeners.get('change')({target: {dataset: {aiTarget: q.id}, value: '2'}});
    configureAIFeedback({}, 'student-b');
    assert.doesNotMatch(aiControlsHTML('speaking', q), /value="2" selected/);
  } finally {globalThis.document = previous;}
});
