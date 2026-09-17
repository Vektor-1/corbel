import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPoints, matchLines, matchBoxes } from './plan-comparison-metrics.mjs';
test('one-to-one localization cannot double count a reference', () => {
  assert.deepEqual([matchPoints([[0, 0], [1, 0]], [[0, 0]], 2).tp, matchPoints([[0, 0], [1, 0]], [[0, 0]], 2).fp], [1, 1]);
});
test('localization finds the maximum matching when nearest-first is ambiguous', () => {
  assert.equal(matchPoints([[1, 0], [0, 0]], [[0, 0], [2, 0]], 1).tp, 2);
});
test('splitting a line does not reduce geometric coverage', () => {
  assert.equal(matchLines([[0, 0, 10, 0]], [[0, 0, 5, 0], [5, 0, 10, 0]], 0.01).f1, 1);
});
test('missing geometry and displaced geometry get zero recall', () => {
  assert.equal(matchLines([], [[0, 0, 10, 0]], 1).recall, 0);
  assert.equal(matchLines([[0, 10, 10, 10]], [[0, 0, 10, 0]], 1).f1, 0);
});
test('box matching counts duplicates as false positives', () => {
  const b = { x0: 0, y0: 0, x1: 10, y1: 10, confidence: 1 };
  assert.equal(matchBoxes([b, b], [b]).fp, 1);
});
