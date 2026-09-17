import type { LessonAnswer, LessonStepId, ScoreResult } from './types';

const correctAnswers: Record<LessonStepId, string | number> = {
  entrance: 'entrance-door',
  bedroom: 'bedroom-one',
  area: 12,
  scale: 'known-wall',
};

export function scoreLessonAnswer(stepId: LessonStepId, answer: LessonAnswer): ScoreResult {
  const expected = correctAnswers[stepId];
  const correct = stepId === 'area'
    ? typeof answer === 'number' && typeof expected === 'number' && Math.abs(answer - expected) <= 0.1
    : answer === expected;

  return correct
    ? { correct: true, feedback: 'Correct. You can continue.' }
    : { correct: false, feedback: 'Not quite. Recheck the plan and try again.' };
}

export function parseAreaAnswer(value: string): number | null {
  const normalized = value.trim().replace(',', '.').replace(/m²|m2/gi, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
