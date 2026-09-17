'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloorPlan, ValidationResult } from '@/types/design';

export interface SpotlightItem {
  issue: ValidationResult;
  /** Placement-time feedback (not derived from validationResults); cleared on dismiss. */
  transient?: boolean;
}

export interface ValidationSpotlightState {
  items: SpotlightItem[];
  index: number;
  visible: boolean;
  /** Issue the user chose to fix; we keep it in the queue and watch for resolution. */
  reviewingId: string | null;
  /** Issue that just resolved (drives the success flash before auto-advance). */
  resolvedId: string | null;
}

interface ValidationSpotlightOptions {
  /** Review callback — selects the offending element (and/or switches tool). */
  onReview: (issue: ValidationResult) => void;
}

const SEVERITY_RANK: Record<ValidationResult['type'], number> = { error: 0, warning: 1, info: 2 };

const severityOf = (issue: ValidationResult) => SEVERITY_RANK[issue.type] ?? 2;

/** Errors first, then warnings; stable within a severity. */
function sortItems(items: SpotlightItem[]): SpotlightItem[] {
  return [...items].sort((a, b) => severityOf(a.issue) - severityOf(b.issue));
}

/**
 * Coach-mark queue over validation results.
 * - Covers errors AND warnings (info stays in the ValidationPanel).
 * - Queue is sorted severity-first and deduped by id.
 * - `deliveredIdsRef` is REPLACED each pass (like the legacy toast logic), so an
 *   issue that resolves and later reappears triggers the spotlight again.
 * - `review` enters a fix-verify state: the issue stays in the queue while the
 *   student edits; when it drops out of validationResults we set `resolvedId`
 *   (drives a success flash), then auto-advance removes it.
 * - `pushTransient` surfaces one-shot placement feedback (e.g. door too close
 *   to a corner) without touching the validation-derived queue.
 */
export function useValidationSpotlight(
  floorPlan: FloorPlan | null,
  validationResults: ValidationResult[],
  options: ValidationSpotlightOptions
) {
  const { onReview } = options;
  const [state, setState] = useState<ValidationSpotlightState>({
    items: [],
    index: 0,
    visible: false,
    reviewingId: null,
    resolvedId: null,
  });
  const deliveredIdsRef = useRef<Set<string>>(new Set());

  // Sync the queue with validation results (errors + warnings).
  useEffect(() => {
    const relevant = validationResults.filter((r) => r.type === 'error' || r.type === 'warning');
    const currentIds = new Set(relevant.map((r) => r.id));
    const fresh = relevant.filter((r) => !deliveredIdsRef.current.has(r.id));

    setState((prev) => {
      // Drop resolved issues, but keep transients and the issue under review
      // (the review target stays in the queue until it resolves or is skipped).
      const remaining = prev.items.filter(
        (item) => item.transient || currentIds.has(item.issue.id) || item.issue.id === prev.reviewingId
      );

      // If the reviewed issue just left validationResults, flag it as resolved.
      const resolvedId =
        prev.reviewingId && !currentIds.has(prev.reviewingId) ? prev.reviewingId : prev.resolvedId;

      const existingIds = new Set(remaining.map((item) => item.issue.id));
      const additions = fresh.filter((issue) => !existingIds.has(issue.id));
      let items = remaining;
      if (additions.length > 0) {
        items = sortItems([...remaining, ...additions.map((issue) => ({ issue }))]);
      }

      let index = Math.min(prev.index, Math.max(0, items.length - 1));
      let visible = prev.visible;
      if (additions.length > 0) {
        const firstNew = items.findIndex((item) => additions.some((a) => a.id === item.issue.id));
        if (firstNew >= 0) index = firstNew;
        visible = true;
      }
      if (items.length === 0) visible = false;

      return { items, index, visible, reviewingId: prev.reviewingId, resolvedId };
    });

    // Replace (not union): resolved-then-reappeared issues re-trigger the tour.
    deliveredIdsRef.current = currentIds;
  }, [validationResults]);

  // Auto-advance shortly after an issue resolves (success flash lives in the card).
  useEffect(() => {
    if (!state.resolvedId) return;
    const timer = setTimeout(() => {
      setState((prev) => {
        const remaining = prev.items.filter((item) => item.issue.id !== prev.resolvedId);
        if (remaining.length === 0) {
          return { items: [], index: 0, visible: false, reviewingId: null, resolvedId: null };
        }
        return {
          items: remaining,
          index: Math.min(prev.index, Math.max(0, remaining.length - 1)),
          visible: true,
          reviewingId: null,
          resolvedId: null,
        };
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [state.resolvedId]);

  const next = useCallback(() => {
    setState((prev) => {
      if (prev.items.length === 0) return prev;
      return { ...prev, index: (prev.index + 1) % prev.items.length };
    });
  }, []);

  const prev = useCallback(() => {
    setState((prev) => {
      if (prev.items.length === 0) return prev;
      return { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length };
    });
  }, []);

  const dismiss = useCallback(() => {
    setState((prev) => ({
      ...prev,
      visible: false,
      // Placement-time feedback is one-shot: dismissing clears it.
      items: prev.items.filter((item) => !item.transient),
      reviewingId: null,
    }));
  }, []);

  /** Select the element and enter the fix-verify loop; the issue stays queued. */
  const review = useCallback(
    (issue: ValidationResult) => {
      onReview(issue);
      setState((prev) => ({ ...prev, reviewingId: issue.id }));
    },
    [onReview]
  );

  /** Surface one-shot placement feedback through the same spotlight overlay. */
  const pushTransient = useCallback((issue: ValidationResult) => {
    setState((prev) => {
      const items = [
        ...prev.items.filter((item) => item.issue.id !== issue.id),
        { issue, transient: true },
      ];
      return { items, index: items.length - 1, visible: true, reviewingId: null, resolvedId: null };
    });
  }, []);

  const active = state.visible && state.items.length > 0 ? state.items[state.index] : null;
  const activeIssue = active?.issue ?? null;

  const similar = activeIssue
    ? state.items.filter((item) => item.issue.rule === activeIssue.rule && item.issue.type === activeIssue.type)
    : [];
  const similarIndex = activeIssue ? similar.findIndex((item) => item.issue.id === activeIssue.id) + 1 : 0;

  return {
    activeIssue,
    index: state.index,
    totalCount: state.items.length,
    visible: state.visible,
    reviewing: state.reviewingId !== null && activeIssue?.id === state.reviewingId,
    resolved: state.resolvedId !== null && activeIssue?.id === state.resolvedId,
    similarCount: similar.length,
    similarIndex,
    next,
    prev,
    dismiss,
    review,
    pushTransient,
    floorPlan,
  };
}
