import { describe, it, expect } from 'vitest';
import { citationForRule, RULE_CITATIONS } from '../citations';

describe('citations', () => {
  describe('RULE_CITATIONS registry', () => {
    it('contains only the one verifiable citation', () => {
      expect(Object.keys(RULE_CITATIONS)).toEqual(['wall-thickness-insufficient']);
    });

    it('stores the exact Ghana Building Code citation for wall thickness', () => {
      expect(RULE_CITATIONS['wall-thickness-insufficient']).toBe('GS 1207:2018 Part 7');
    });
  });

  describe('citationForRule', () => {
    it('returns the citation for wall-thickness-insufficient', () => {
      const citation = citationForRule('wall-thickness-insufficient');
      expect(citation).toBe('GS 1207:2018 Part 7');
    });

    it('returns undefined for uncited rules', () => {
      const rules = [
        'span-thickness-ratio-high',
        'opening-oversized',
        'room-area-small',
        'check-drawing-scale',
        'set-drawing-scale',
        'complete-traced-room',
        'opening-host-fit',
      ];

      for (const rule of rules) {
        expect(citationForRule(rule)).toBeUndefined();
      }
    });

    it('returns undefined for unknown rules', () => {
      expect(citationForRule('nonexistent-rule')).toBeUndefined();
    });

    it('never fabricates a citation', () => {
      // This test documents the promise: even for plausible-sounding rule names,
      // citationForRule only returns what's explicitly in the registry.
      expect(citationForRule('wall-thickness')).toBeUndefined();
      expect(citationForRule('wall')).toBeUndefined();
      expect(citationForRule('thickness')).toBeUndefined();
      expect(citationForRule('GS-1207-wall')).toBeUndefined();
    });
  });
});
