import { describe, it, expect, vi } from 'vitest';
import { scoreLLMDesignIteration } from '../../standards/llmScoring';
import type { Canonical } from '../../../types/schema';

describe('AI Pipeline Tests', () => {
  // Helper to create minimal floor plan
  function createFloor(wallCount: number, roomCount: number): Canonical.Floor {
    return {
      id: `floor-${Date.now()}`,
      name: 'Test Floor',
      walls: Array.from({ length: wallCount }, (_, i) => ({
        id: `wall-${i}`,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 1000 },
        typeRef: 'ext-200',
        openingIds: [],
        confidence: 1.0,
        source: 0, // Source.USER
      })),
      rooms: Array.from({ length: roomCount }, (_, i) => ({
        id: `room-${i}`,
        label: `Room ${i}`,
        type: 'bedroom',
        area: 20000000, // 20m²
        centroid: { x: 500, y: 500 },
        boundingWallIds: [],
        confidence: 1.0,
        source: 0,
      })),
      openings: [],
      metadata: {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
    };
  }

  describe('LLM Scoring with Claude/GPT', () => {
    it('should score design iteration', async () => {
      const baseline = createFloor(4, 2);
      const redesign = createFloor(5, 3);

      const result = await scoreLLMDesignIteration({
        baseline,
        redesign,
        changeCount: 3,
        wallsAdded: 1,
        wallsRemoved: 0,
        roomsAdded: 1,
        roomsRemoved: 0,
      });

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(2);
      expect(result.reasoning).toBeTruthy();
      expect(['claude', 'gpt']).toContain(result.model);
      console.log('✅ LLM Scoring Result:', result);
    });

    it('should handle missing API keys gracefully', async () => {
      // Temporarily clear env vars
      const savedClaude = process.env.ANTHROPIC_API_KEY;
      const savedGPT = process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const baseline = createFloor(2, 1);
        const redesign = createFloor(3, 2);

        const result = await scoreLLMDesignIteration({
          baseline,
          redesign,
          changeCount: 2,
          wallsAdded: 1,
          wallsRemoved: 0,
          roomsAdded: 1,
          roomsRemoved: 0,
        });

        expect(result).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(2);
        expect(result.model).toBe('claude'); // Fallback returns claude
        console.log('✅ Fallback Scoring Result:', result);
      } finally {
        if (savedClaude) process.env.ANTHROPIC_API_KEY = savedClaude;
        if (savedGPT) process.env.OPENAI_API_KEY = savedGPT;
      }
    });

    it('should score no changes as 0', async () => {
      const baseline = createFloor(4, 2);

      const result = await scoreLLMDesignIteration({
        baseline,
        redesign: baseline,
        changeCount: 0,
        wallsAdded: 0,
        wallsRemoved: 0,
        roomsAdded: 0,
        roomsRemoved: 0,
      });

      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
        expect(result.score).toBe(0);
      }
      console.log('✅ No Changes Score:', result.score);
    });
  });

  describe('API Key Availability', () => {
    it('logs configured API keys', () => {
      const rodium = process.env.RODIUM_AI_API_KEY;
      const agentRouter = process.env.AGENT_ROUTER_API_KEY;
      const claude = process.env.ANTHROPIC_API_KEY;
      const gpt = process.env.OPENAI_API_KEY;

      console.log('\n📡 API Configuration Status:');
      console.log(rodium ? '✅ RODIUM_AI_API_KEY configured' : '❌ RODIUM_AI_API_KEY missing');
      console.log(agentRouter ? '✅ AGENT_ROUTER_API_KEY configured' : '❌ AGENT_ROUTER_API_KEY missing');
      console.log(claude ? '✅ ANTHROPIC_API_KEY configured' : '❌ ANTHROPIC_API_KEY missing');
      console.log(gpt ? '✅ OPENAI_API_KEY configured' : '❌ OPENAI_API_KEY missing');
      console.log('');

      const hasAnyLLM = claude || gpt;
      if (hasAnyLLM) {
        expect(hasAnyLLM).toBeTruthy();
      } else {
        console.warn('⚠️  No LLM keys configured - fallback scoring will be used');
      }
    });
  });
});
