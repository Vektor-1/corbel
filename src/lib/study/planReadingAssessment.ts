import type { MisconceptionId } from '@/lib/learning/adaptiveTutor';
import type { StudyCondition } from './condition';

export type AssessmentPhase = 'pre' | 'post';

export interface AssessmentQuestion {
  id: string;
  misconceptionId: MisconceptionId;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
  correctChoiceId: string;
}

export const PLAN_READING_ASSESSMENTS: Record<AssessmentPhase, AssessmentQuestion[]> = {
  pre: [
    { id: 'opening-boundary-a', misconceptionId: 'openings', prompt: 'Which observation is the strongest evidence that a door is an entrance?', choices: [{ id: 'outer', label: 'It crosses the exterior boundary into an internal space.' }, { id: 'wide', label: 'It is the widest door on the drawing.' }, { id: 'near', label: 'It is nearest to a kitchen.' }], correctChoiceId: 'outer' },
    { id: 'scale-reference-a', misconceptionId: 'scale', prompt: 'What is the best feature to use when calibrating a plan image?', choices: [{ id: 'labelled', label: 'A wall with a stated or independently known length.' }, { id: 'door', label: 'Any door, using a typical assumed width.' }, { id: 'room', label: 'The largest room boundary.' }], correctChoiceId: 'labelled' },
    { id: 'closed-boundary-a', misconceptionId: 'closed-boundaries', prompt: 'Before a traced enclosure can define a room area, what must be true?', choices: [{ id: 'loop', label: 'The wall endpoints form one continuous closed loop.' }, { id: 'four', label: 'It has exactly four walls.' }, { id: 'label', label: 'It has a room label.' }], correctChoiceId: 'loop' },
    { id: 'wall-role-a', misconceptionId: 'wall-role-thickness', prompt: 'What should you establish before changing a flagged wall thickness?', choices: [{ id: 'role', label: 'The wall’s intended role and material.' }, { id: 'quiet', label: 'Which role clears the warning quickest.' }, { id: 'copy', label: 'The thickness of the nearest wall.' }], correctChoiceId: 'role' },
  ],
  post: [
    { id: 'opening-boundary-b', misconceptionId: 'openings', prompt: 'A doorway lies on an outer perimeter wall. What further observation confirms it is an entrance?', choices: [{ id: 'outside', label: 'One side leads outside and the other enters an internal space.' }, { id: 'swing', label: 'Its swing arc is larger than another door.' }, { id: 'centre', label: 'It is centred on its wall.' }], correctChoiceId: 'outside' },
    { id: 'scale-reference-b', misconceptionId: 'scale', prompt: 'Which measurement is defensible for setting scale from a floor-plan image?', choices: [{ id: 'stated', label: 'A visible dimension tied to the wall being measured.' }, { id: 'standard', label: 'A presumed standard door width.' }, { id: 'guess', label: 'An estimate based on room size.' }], correctChoiceId: 'stated' },
    { id: 'closed-boundary-b', misconceptionId: 'closed-boundaries', prompt: 'A room outline has three joined walls and a small gap. What is the key correction?', choices: [{ id: 'join', label: 'Join the endpoints so the boundary is continuous.' }, { id: 'name', label: 'Add a room name.' }, { id: 'thicken', label: 'Make every wall thicker.' }], correctChoiceId: 'join' },
    { id: 'wall-role-b', misconceptionId: 'wall-role-thickness', prompt: 'A wall seems too thin for its proposed use. What is the sound next step?', choices: [{ id: 'brief', label: 'Check its intended role and material against the design brief.' }, { id: 'toggle', label: 'Toggle its role until the validation clears.' }, { id: 'equal', label: 'Make it match every other wall.' }], correctChoiceId: 'brief' },
  ],
};

export interface AssessmentResponse {
  id: string;
  phase: AssessmentPhase;
  condition: StudyCondition;
  questionId: string;
  misconceptionId: MisconceptionId;
  answerId: string;
  correct: boolean;
  at: string;
}

export function assessmentStorageKey(phase: AssessmentPhase) {
  return `corbel.plan-reading-assessment.${phase}.v1`;
}

export function parseAssessmentResponses(raw: string | null, phase: AssessmentPhase): AssessmentResponse[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const questions = new Map(PLAN_READING_ASSESSMENTS[phase].map((question) => [question.id, question]));
    return parsed.filter((candidate): candidate is AssessmentResponse => {
      if (!candidate || typeof candidate !== 'object') return false;
      const response = candidate as Partial<AssessmentResponse>;
      const question = typeof response.questionId === 'string' ? questions.get(response.questionId) : undefined;
      return response.phase === phase && typeof response.id === 'string' && Boolean(question) && response.misconceptionId === question?.misconceptionId && typeof response.answerId === 'string' && typeof response.correct === 'boolean' && typeof response.at === 'string';
    }).slice(0, PLAN_READING_ASSESSMENTS[phase].length);
  } catch {
    return [];
  }
}

export function assessmentResponse(phase: AssessmentPhase, condition: StudyCondition, question: AssessmentQuestion, answerId: string): AssessmentResponse {
  return { id: `assessment-${crypto.randomUUID()}`, phase, condition, questionId: question.id, misconceptionId: question.misconceptionId, answerId, correct: answerId === question.correctChoiceId, at: new Date().toISOString() };
}

export function assessmentCsv(responses: AssessmentResponse[]) {
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['response_id,phase,condition,question_id,misconception,answer,correct,timestamp', ...responses.map((response) => [response.id, response.phase, response.condition, response.questionId, response.misconceptionId, response.answerId, response.correct, response.at].map(quote).join(','))].join('\n');
}
