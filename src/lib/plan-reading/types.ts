export type LessonStepId = 'entrance' | 'bedroom' | 'area' | 'scale';

export type LessonAnswer = string | number;

export interface LessonStep {
  id: LessonStepId;
  number: number;
  title: string;
  prompt: string;
  explanation: string;
  nextAction: string;
  remediation: string;
  kind: 'plan-click' | 'multiple-choice' | 'numeric';
  choices?: Array<{ value: string; label: string }>;
}

export interface ScoreResult {
  correct: boolean;
  feedback: string;
}

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorContext {
  misconceptionTitle?: string;
  misconceptionExplanation?: string;
  citation?: string;
  evidence?: string;
}

export interface PlanReadingStepProgress {
  answer?: LessonAnswer;
  correct?: boolean;
  attempts?: number;
}

export interface PlanReadingProgress {
  version: 1;
  activeStep: number;
  steps: Partial<Record<LessonStepId, PlanReadingStepProgress>>;
  completed: boolean;
}
