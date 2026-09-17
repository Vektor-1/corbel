import type { ValidationResult } from '@/types/design';
import { citationForRule } from '@/lib/standards/citations';

export const ADAPTIVE_LEARNING_STORAGE_KEY = 'corbel.adaptive-learning.v1';

export type MisconceptionId = 'openings' | 'scale' | 'closed-boundaries' | 'wall-role-thickness';
export type LearningEventKind = 'diagnosed' | 'microtask-started' | 'microtask-answered' | 'retry-verified' | 'plan-reading-answered';

export interface CorrectiveMicrotask {
  prompt: string;
  choices: Array<{ id: string; label: string }>;
  correctChoiceId: string;
  retryInstruction: string;
}

export interface MisconceptionDefinition {
  id: MisconceptionId;
  title: string;
  explanation: string;
  ruleIds: string[];
  microtask: CorrectiveMicrotask;
}

export interface LearningEvent {
  id: string;
  planId: string;
  misconceptionId: MisconceptionId;
  kind: LearningEventKind;
  at: string;
  rule?: string;
  targetId?: string;
  answerId?: string;
  correct?: boolean;
  /** Assigned study arm; optional so historical local records remain readable. */
  condition?: 'adaptive' | 'comparison';
}

export interface ActiveIntervention {
  definition: MisconceptionDefinition;
  /** The precise rule that produced this intervention. */
  rule: string;
  targetId: string;
  diagnosisCount: number;
  evidence: string;
  citation?: string;
  mode: 'first-notice' | 'repeat-pattern';
}

export const MISCONCEPTIONS: Record<MisconceptionId, MisconceptionDefinition> = {
  openings: {
    id: 'openings', title: 'Exterior and internal openings',
    explanation: 'An entry opening crosses the outer boundary of the plan. An internal door only connects spaces inside that boundary.',
    ruleIds: ['opening-host-fit'],
    microtask: {
      prompt: 'Before moving this opening, which observation best identifies an entrance?',
      choices: [
        { id: 'outer-boundary', label: 'It crosses the outside boundary into an internal space.' },
        { id: 'largest-opening', label: 'It is the widest opening on the plan.' },
        { id: 'near-kitchen', label: 'It is closest to the kitchen.' },
      ],
      correctChoiceId: 'outer-boundary',
      retryInstruction: 'Now inspect the highlighted opening: place it fully on its host wall, then check the feedback again.',
    },
  },
  scale: {
    id: 'scale', title: 'Drawing scale calibration',
    explanation: 'Image pixels are not measurements. A visible, known wall length must be confirmed before room sizes can be interpreted.',
    ruleIds: ['set-drawing-scale', 'check-drawing-scale'],
    microtask: {
      prompt: 'Which source feature is appropriate for calibrating a retraced plan?',
      choices: [
        { id: 'labelled-wall', label: 'A wall with a visible or independently known length.' },
        { id: 'door-assumption', label: 'Any door, assuming a typical width.' },
        { id: 'largest-room', label: 'The largest room in the image.' },
      ],
      correctChoiceId: 'labelled-wall',
      retryInstruction: 'Select the traced known-length wall, enter its stated length, then review the recalculated feedback.',
    },
  },
  'closed-boundaries': {
    id: 'closed-boundaries', title: 'Closed room boundaries',
    explanation: 'A room needs a continuous wall boundary. A small gap prevents the plan from defining an enclosed space and its area.',
    ruleIds: ['complete-traced-room'],
    microtask: {
      prompt: 'What must be true before Corbel can treat traced walls as one room?',
      choices: [
        { id: 'continuous-loop', label: 'Their endpoints form one continuous closed loop.' },
        { id: 'four-walls', label: 'There are exactly four walls.' },
        { id: 'room-label', label: 'A room label has been added.' },
      ],
      correctChoiceId: 'continuous-loop',
      retryInstruction: 'Join the nearby highlighted wall endpoints to complete one closed room, then check the feedback again.',
    },
  },
  'wall-role-thickness': {
    id: 'wall-role-thickness', title: 'Wall role and thickness',
    explanation: 'Wall thickness is interpreted together with structural role and material. A load-bearing wall needs evidence-based dimensions; do not relabel a wall just to silence a warning.',
    ruleIds: ['wall-thickness-insufficient', 'span-thickness-ratio-high'],
    microtask: {
      prompt: 'Before changing a flagged wall, what should you establish first?',
      choices: [
        { id: 'role-and-material', label: 'Its structural role and material in the design brief.' },
        { id: 'remove-warning', label: 'Which role removes the warning fastest.' },
        { id: 'copy-neighbour', label: 'The thickness of the nearest wall.' },
      ],
      correctChoiceId: 'role-and-material',
      retryInstruction: 'Confirm the wall role and material, then adjust its thickness or geometry and check the feedback again.',
    },
  },
};

const byRule = new Map(Object.values(MISCONCEPTIONS).flatMap((definition) => definition.ruleIds.map((rule) => [rule, definition] as const)));

export function interventionForResult(result: ValidationResult, priorEvents: LearningEvent[]): ActiveIntervention | null {
  const definition = byRule.get(result.rule);
  if (!definition) return null;
  const diagnosisCount = priorEvents.filter((event) => event.kind === 'diagnosed' && event.misconceptionId === definition.id).length + 1;
  return {
    definition,
    rule: result.rule,
    targetId: result.targetId,
    diagnosisCount,
    evidence: diagnosisCount > 1
      ? `${result.evidence ?? result.message} This pattern has appeared ${diagnosisCount} times in this learning record, so Corbel is asking for a deliberate check before another retry.`
      : result.evidence ?? result.message,
    citation: citationForRule(result.rule),
    mode: diagnosisCount > 1 ? 'repeat-pattern' : 'first-notice',
  };
}

export function recordLearningEvent(event: Omit<LearningEvent, 'id' | 'at'>): LearningEvent {
  return { ...event, id: `${event.planId}-${event.misconceptionId}-${event.kind}-${crypto.randomUUID()}`, at: new Date().toISOString() };
}

/**
 * A retry clears only when the exact rule on the exact diagnosed target has
 * cleared. Other warnings in the same misconception family remain useful
 * feedback, but must not change this study outcome.
 */
export function correctionSucceeded(rule: string, results: ValidationResult[], targetId?: string) {
  return !results.some((result) =>
    result.rule === rule && (targetId === undefined || result.targetId === targetId)
  );
}

export function serialiseLearningEvents(events: LearningEvent[]) {
  return JSON.stringify({ version: 1, events });
}

export function parseLearningEvents(raw: string | null): LearningEvent[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { version?: unknown; events?: unknown };
    if (value.version !== 1 || !Array.isArray(value.events)) return [];
    return value.events.filter((event): event is LearningEvent => Boolean(event) && typeof event === 'object' && typeof (event as LearningEvent).id === 'string' && typeof (event as LearningEvent).planId === 'string' && typeof (event as LearningEvent).misconceptionId === 'string' && typeof (event as LearningEvent).kind === 'string' && typeof (event as LearningEvent).at === 'string');
  } catch { return []; }
}

/** Append a privacy-preserving event to browser storage. The caller owns consent and participant linkage. */
export function appendLearningEvent(storage: Pick<Storage, 'getItem' | 'setItem'>, event: Omit<LearningEvent, 'id' | 'at'>) {
  const events = [...parseLearningEvents(storage.getItem(ADAPTIVE_LEARNING_STORAGE_KEY)), recordLearningEvent(event)];
  storage.setItem(ADAPTIVE_LEARNING_STORAGE_KEY, serialiseLearningEvents(events));
  return events;
}

export function learningCsv(events: LearningEvent[]) {
  const heading = 'event_id,plan_id,condition,misconception,event,timestamp,rule,target_id,answer,correct';
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [heading, ...events.map((event) => [event.id, event.planId, event.condition, event.misconceptionId, event.kind, event.at, event.rule, event.targetId, event.answerId, event.correct].map(quote).join(','))].join('\n');
}
