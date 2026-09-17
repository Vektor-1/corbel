'use client';

import { useCallback, useEffect, useState } from 'react';
import { ADAPTIVE_LEARNING_STORAGE_KEY, correctionSucceeded, interventionForResult, parseLearningEvents, recordLearningEvent, serialiseLearningEvents, type ActiveIntervention, type LearningEvent } from '@/lib/learning/adaptiveTutor';
import type { ValidationResult } from '@/types/design';
import type { StudyCondition } from '@/lib/study/condition';

export function useAdaptiveLearning(planId: string | undefined, results: ValidationResult[], enabled = true, condition: StudyCondition = 'adaptive') {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [active, setActive] = useState<ActiveIntervention | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { setEvents(parseLearningEvents(window.localStorage.getItem(ADAPTIVE_LEARNING_STORAGE_KEY))); setReady(true); }, []);
  useEffect(() => { if (ready) window.localStorage.setItem(ADAPTIVE_LEARNING_STORAGE_KEY, serialiseLearningEvents(events)); }, [events, ready]);

  const add = useCallback((event: Omit<LearningEvent, 'id' | 'at'>) => {
    if (!enabled) return;
    setEvents((current) => [...current, recordLearningEvent({ ...event, condition })]);
  }, [enabled, condition]);

  useEffect(() => {
    if (!ready || !planId) return;
    const issue = results.find((result) => {
      const intervention = interventionForResult(result, events);
      if (!intervention) return false;
      return !events.some((event) => event.planId === planId && event.kind === 'diagnosed' && event.rule === result.rule && event.targetId === result.targetId);
    });
    if (!issue) return;
    const intervention = interventionForResult(issue, events);
    if (!intervention) return;
    add({ planId, misconceptionId: intervention.definition.id, kind: 'diagnosed', rule: issue.rule, targetId: issue.targetId });
    if (condition === 'adaptive') setActive(intervention);
  }, [add, condition, events, planId, ready, results]);

  // The comparison condition has no guided retry UI, but it must still yield
  // comparable correction outcomes when a previously observed rule clears (silent retry-verification).
  useEffect(() => {
    if (!enabled || condition !== 'comparison' || !ready || !planId) return;
    const unresolved = events.filter((event) => event.planId === planId && event.kind === 'diagnosed' && !events.some((candidate) => candidate.planId === planId && candidate.kind === 'retry-verified' && candidate.rule === event.rule && candidate.targetId === event.targetId));
    for (const event of unresolved) {
      const stillPresent = results.some((result) => result.rule === event.rule && result.targetId === event.targetId);
      if (!stillPresent) add({ planId, misconceptionId: event.misconceptionId, kind: 'retry-verified', rule: event.rule, targetId: event.targetId, correct: true });
    }
  }, [add, condition, enabled, events, planId, ready, results]);

  const start = useCallback(() => {
    if (!active || !planId) return;
    add({ planId, misconceptionId: active.definition.id, kind: 'microtask-started', rule: active.rule, targetId: active.targetId });
  }, [active, add, planId]);
  const answer = useCallback((answerId: string) => {
    if (!active || !planId) return false;
    const correct = answerId === active.definition.microtask.correctChoiceId;
    add({ planId, misconceptionId: active.definition.id, kind: 'microtask-answered', rule: active.rule, targetId: active.targetId, answerId, correct });
    return correct;
  }, [active, add, planId]);
  const verifyRetry = useCallback(() => {
    if (!active || !planId) return false;
    const alreadyVerified = events.some((event) => event.planId === planId && event.kind === 'retry-verified' && event.rule === active.rule && event.targetId === active.targetId && event.correct === true);
    if (alreadyVerified) return true;
    const correct = correctionSucceeded(active.rule, results, active.targetId);
    add({ planId, misconceptionId: active.definition.id, kind: 'retry-verified', rule: active.rule, targetId: active.targetId, correct });
    return correct;
  }, [active, add, events, planId, results]);
  const dismiss = useCallback(() => setActive(null), []);
  const exportEvents = useCallback(() => events.filter((event) => event.planId === planId), [events, planId]);

  return { active, start, answer, verifyRetry, dismiss, exportEvents };
}
