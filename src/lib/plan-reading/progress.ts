import type { LessonStepId, PlanReadingProgress, PlanReadingStepProgress } from './types';

export const PLAN_READING_PROGRESS_KEY = 'corbel.plan-reading.two-bedroom.v1';

const stepIds = new Set<LessonStepId>(['entrance', 'bedroom', 'area', 'scale']);

export function emptyPlanReadingProgress(): PlanReadingProgress {
  return { version: 1, activeStep: 0, steps: {}, completed: false };
}

export function normalizePlanReadingProgress(value: unknown): PlanReadingProgress | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<PlanReadingProgress>;
  if (input.version !== 1 || !Number.isInteger(input.activeStep) || input.activeStep! < 0 || input.activeStep! > 3 || typeof input.completed !== 'boolean' || !input.steps || typeof input.steps !== 'object') return null;
  const steps: PlanReadingProgress['steps'] = {};
  for (const [id, candidate] of Object.entries(input.steps)) {
    if (!stepIds.has(id as LessonStepId) || !candidate || typeof candidate !== 'object') continue;
    const step = candidate as PlanReadingStepProgress;
    if (typeof step.correct !== 'boolean' && step.answer === undefined) continue;
    steps[id as LessonStepId] = {
      ...(typeof step.answer === 'string' || typeof step.answer === 'number' ? { answer: step.answer } : {}),
      ...(typeof step.correct === 'boolean' ? { correct: step.correct } : {}),
      ...(Number.isInteger(step.attempts) && step.attempts! >= 0 ? { attempts: step.attempts } : {}),
    };
  }
  return { version: 1, activeStep: input.activeStep!, steps, completed: input.completed };
}

export function loadPlanReadingProgress(storage: Pick<Storage, 'getItem'>): PlanReadingProgress {
  try {
    const raw = storage.getItem(PLAN_READING_PROGRESS_KEY);
    return raw ? normalizePlanReadingProgress(JSON.parse(raw)) ?? emptyPlanReadingProgress() : emptyPlanReadingProgress();
  } catch { return emptyPlanReadingProgress(); }
}

export function savePlanReadingProgress(storage: Pick<Storage, 'setItem'>, progress: PlanReadingProgress) {
  try { storage.setItem(PLAN_READING_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Local progress is optional. */ }
}

export function clearPlanReadingProgress(storage: Pick<Storage, 'removeItem'>) {
  try { storage.removeItem(PLAN_READING_PROGRESS_KEY); } catch { /* Local progress is optional. */ }
}
