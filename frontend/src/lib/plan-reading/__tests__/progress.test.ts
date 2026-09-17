import { describe, expect, it } from 'vitest';
import { clearPlanReadingProgress, emptyPlanReadingProgress, loadPlanReadingProgress, normalizePlanReadingProgress, PLAN_READING_PROGRESS_KEY, savePlanReadingProgress } from '../progress';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe('plan-reading progress', () => {
  it('round-trips bounded lesson progress', () => {
    const storage = memoryStorage();
    const progress = { version: 1 as const, activeStep: 2, completed: false, steps: { entrance: { answer: 'entrance-door', correct: true, attempts: 1 } } };
    savePlanReadingProgress(storage, progress);
    expect(loadPlanReadingProgress(storage)).toEqual(progress);
    clearPlanReadingProgress(storage);
    expect(loadPlanReadingProgress(storage)).toEqual(emptyPlanReadingProgress());
  });
  it('rejects malformed or incompatible stored data safely', () => {
    expect(normalizePlanReadingProgress({ version: 2 })).toBeNull();
    const storage = memoryStorage();
    storage.setItem(PLAN_READING_PROGRESS_KEY, '{bad json');
    expect(loadPlanReadingProgress(storage)).toEqual(emptyPlanReadingProgress());
  });
});
