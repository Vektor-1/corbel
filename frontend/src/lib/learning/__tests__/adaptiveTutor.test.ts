import { describe, expect, it } from 'vitest';
import { correctionSucceeded, interventionForResult, learningCsv, parseLearningEvents, recordLearningEvent, serialiseLearningEvents } from '../adaptiveTutor';
import type { ValidationResult } from '@/types/design';

const scaleIssue: ValidationResult = { id: 'scale', type: 'warning', targetId: 'wall-1', rule: 'check-drawing-scale', message: 'Scale may be incorrect.', evidence: 'Rooms are implausibly small.' };

describe('adaptive misconception tutor', () => {
  it('maps an observed rule to an explainable corrective intervention', () => {
    const intervention = interventionForResult(scaleIssue, []);
    expect(intervention).toMatchObject({ targetId: 'wall-1', diagnosisCount: 1, mode: 'first-notice', definition: { id: 'scale' } });
    expect(intervention?.definition.microtask.choices).toHaveLength(3);
  });

  it('escalates feedback when the same misconception recurs', () => {
    const prior = [recordLearningEvent({ planId: 'p1', misconceptionId: 'scale', kind: 'diagnosed', rule: 'check-drawing-scale', targetId: 'wall-1' })];
    expect(interventionForResult(scaleIssue, prior)).toMatchObject({ diagnosisCount: 2, mode: 'repeat-pattern' });
  });

  it('verifies correction from current geometry feedback rather than a self-report', () => {
    expect(correctionSucceeded('check-drawing-scale', [])).toBe(true);
    expect(correctionSucceeded('check-drawing-scale', [scaleIssue])).toBe(false);
  });

  it('round-trips portable research events and creates a CSV audit trail', () => {
    const event = recordLearningEvent({ planId: 'p1', misconceptionId: 'scale', kind: 'microtask-answered', answerId: 'labelled-wall', correct: true });
    expect(parseLearningEvents(serialiseLearningEvents([event]))).toEqual([event]);
    expect(learningCsv([event])).toContain('microtask-answered');
  });

  it('resolves citations for interventions from the citation registry', () => {
    const wallThicknessResult: ValidationResult = {
      id: 'thickness',
      type: 'error',
      targetId: 'wall-1',
      rule: 'wall-thickness-insufficient',
      message: 'Wall is too thin.',
      evidence: 'Thickness is 150 mm; minimum is 225 mm.',
    };
    const intervention = interventionForResult(wallThicknessResult, []);
    expect(intervention?.citation).toBe('GS 1207:2018 Part 7');
  });

  it('returns undefined citation for uncited rules', () => {
    const intervention = interventionForResult(scaleIssue, []);
    expect(intervention?.citation).toBeUndefined();
  });

  it('includes condition in learning events when provided', () => {
    const event = recordLearningEvent({
      planId: 'p1',
      misconceptionId: 'scale',
      kind: 'diagnosed',
      rule: 'check-drawing-scale',
      targetId: 'wall-1',
      condition: 'comparison',
    });
    expect(event.condition).toBe('comparison');
  });
});
