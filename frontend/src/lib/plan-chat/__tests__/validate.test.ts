import { describe, expect, it } from 'vitest';
import { parsePlanChatResponse } from '../validate';

describe('plan chat response validation', () => {
  it('accepts supported structured updates and normalizes confirmation to true', () => {
    const result = parsePlanChatResponse({
      intent: 'configure',
      reply: 'I can update the selected wall thickness.',
      requiresConfirmation: false,
      operations: [{ type: 'update-wall', id: 'w1', updates: { thickness: 300, type: 'partition' } }],
    });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.operations).toHaveLength(1);
  });

  it('rejects executable or unknown operations', () => {
    expect(() => parsePlanChatResponse({
      intent: 'edit',
      reply: 'Nope',
      operations: [{ type: 'run-code', code: 'alert(1)' }],
    })).toThrow(/unsupported|invalid/i);
  });

  it('rejects invalid scale and geometry payloads', () => {
    expect(() => parsePlanChatResponse({
      intent: 'configure',
      reply: 'Bad scale',
      operations: [{ type: 'set-scale', scale: 2 }],
    })).toThrow(/scale/i);
  });

  it('accepts a bounded task plan for reviewable work', () => {
    const result = parsePlanChatResponse({
      intent: 'edit',
      reply: 'I will review the selected wall before proposing an edit.',
      todo: [{ id: 'inspect', title: 'Inspect the selected wall', status: 'in_progress' }],
      operations: [],
    });

    expect(result.todo).toEqual([{ id: 'inspect', title: 'Inspect the selected wall', status: 'in_progress' }]);
  });
});
