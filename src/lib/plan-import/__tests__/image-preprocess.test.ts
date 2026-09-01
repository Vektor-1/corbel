import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { enhancePlanPixels } from '../image-preprocess';

test('enhances a faint line without mutating the original pixels or alpha channel', () => {
  // 3 × 3 off-white scan with a faint grey vertical line in the centre.
  const source = new Uint8ClampedArray([
    250, 250, 250, 255, 220, 220, 220, 180, 250, 250, 250, 255,
    250, 250, 250, 255, 220, 220, 220, 180, 250, 250, 250, 255,
    250, 250, 250, 255, 220, 220, 220, 180, 250, 250, 250, 255,
  ]);
  const original = new Uint8ClampedArray(source);

  const enhanced = enhancePlanPixels(source, 3, 3);

  assert.deepEqual(source, original, 'preprocessing must not mutate the uploaded-image buffer');
  assert.equal(enhanced[7], 180, 'alpha must be retained');
  assert.ok(enhanced[4] < source[4], 'the faint line should become darker');
  assert.ok(enhanced[0] >= source[0], 'paper background should remain bright');
});

test('returns a copy for an image with no recoverable contrast range', () => {
  const source = new Uint8ClampedArray([128, 128, 128, 90, 128, 128, 128, 90]);
  const enhanced = enhancePlanPixels(source, 2, 1);
  assert.deepEqual(enhanced, source);
  assert.notEqual(enhanced, source);
});
