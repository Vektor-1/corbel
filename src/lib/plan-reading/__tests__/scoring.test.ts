import { describe, expect, it } from 'vitest';
import { parseAreaAnswer, scoreLessonAnswer } from '../scoring';
import { TWO_BEDROOM_LESSON } from '../lesson';

describe('plan-reading scoring', () => {
  it('scores plan targets and bedroom selection deterministically', () => {
    expect(scoreLessonAnswer('entrance', 'entrance-door').correct).toBe(true);
    expect(scoreLessonAnswer('bedroom', 'living').correct).toBe(false);
    expect(scoreLessonAnswer('scale', 'known-wall').correct).toBe(true);
  });
  it('accepts tolerant numeric area answers', () => {
    expect(parseAreaAnswer('12 m²')).toBe(12);
    expect(scoreLessonAnswer('area', 12.05).correct).toBe(true);
    expect(scoreLessonAnswer('area', 11.7).correct).toBe(false);
    expect(parseAreaAnswer('twelve')).toBeNull();
  });
  it('provides a specific observation and next inspection for each remediation', () => {
    expect(TWO_BEDROOM_LESSON).toHaveLength(4);
    TWO_BEDROOM_LESSON.forEach((step) => {
      expect(step.remediation.length).toBeGreaterThan(30);
      expect(step.remediation).toMatch(/Observe|Inspect|Write|Look/);
    });
  });
});
