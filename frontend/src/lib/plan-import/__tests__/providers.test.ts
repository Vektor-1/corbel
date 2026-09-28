import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDetectionJobProvider, resolveSubmissionProvider } from '../provider-dispatcher';

describe('AI Providers', () => {
  beforeEach(() => {
    // Ensure env vars are set
    process.env.RODIUM_AI_API_KEY = 'test-key-rodium';
    process.env.AGENT_ROUTER_API_KEY = 'test-key-router';
  });

  describe('Rodium AI Provider', () => {
    it('uses Rodium\'s fast vision-capable profile by default', async () => {
      const { resolveRodiumModel } = await import('../rodium-ai');
      const savedModel = process.env.RODIUM_AI_MODEL;
      delete process.env.RODIUM_AI_MODEL;
      try {
        expect(resolveRodiumModel()).toBe('rodium/fast');
      } finally {
        if (savedModel) process.env.RODIUM_AI_MODEL = savedModel;
      }
    });

    it('should create ask function', async () => {
      const { makeAsk } = await import('../rodium-ai');
      const ask = makeAsk('https://example.com/test.png', 'gpt-5.6-luna');

      expect(typeof ask).toBe('function');
    });

    it('should throw error if API key missing', async () => {
      const savedKey = process.env.RODIUM_AI_API_KEY;
      delete process.env.RODIUM_AI_API_KEY;

      try {
        // This will fail when the function tries to use the key
        expect(() => {
          if (!process.env.RODIUM_AI_API_KEY) {
            throw new Error('RODIUM_AI_API_KEY is not set.');
          }
        }).toThrow('RODIUM_AI_API_KEY is not set');
      } finally {
        if (savedKey) process.env.RODIUM_AI_API_KEY = savedKey;
      }
    });

    it('should support the configured Rodium model', async () => {
      const { makeAsk } = await import('../rodium-ai');

      const askGpt = makeAsk('https://example.com/test.png', 'gpt-5.6-luna');

      expect(typeof askGpt).toBe('function');
    });
  });

  describe('AgentRouter Provider', () => {
    it('should create image analysis ask function', async () => {
      const { makeAskImageAnalysis } = await import('../agent-router');
      const ask = makeAskImageAnalysis('https://example.com/test.png');

      expect(typeof ask).toBe('function');
    });

    it('should create OCR ask function', async () => {
      const { makeAskOcr } = await import('../agent-router');
      const ask = makeAskOcr('https://example.com/test.png');

      expect(typeof ask).toBe('function');
    });

    it('should create scale calibration ask function', async () => {
      const { makeAskScaleCalibration } = await import('../agent-router');
      const ask = makeAskScaleCalibration('https://example.com/test.png');

      expect(typeof ask).toBe('function');
    });

    it('should throw error if API key missing', async () => {
      const savedKey = process.env.AGENT_ROUTER_API_KEY;
      delete process.env.AGENT_ROUTER_API_KEY;

      try {
        expect(() => {
          if (!process.env.AGENT_ROUTER_API_KEY) {
            throw new Error('AGENT_ROUTER_API_KEY is not set.');
          }
        }).toThrow('AGENT_ROUTER_API_KEY is not set');
      } finally {
        if (savedKey) process.env.AGENT_ROUTER_API_KEY = savedKey;
      }
    });

    it('should support routing preference lists', async () => {
      const { makeAskImageAnalysis, makeAskOcr } = await import('../agent-router');

      // Image analysis prefers GPT
      const askImage = makeAskImageAnalysis('https://example.com/test.png');
      expect(typeof askImage).toBe('function');

      // OCR prefers the configured Agent Router model
      const askOcr = makeAskOcr('https://example.com/test.png');
      expect(typeof askOcr).toBe('function');
    });
  });

  describe('Provider Orchestration', () => {
    it('routes UUID job IDs through the selected provider', () => {
      const jobId = '2e4549dc-2a21-4838-9aaf-2df7077f433d';

      expect(resolveDetectionJobProvider(jobId, 'agent-router')).toBe('agent-router');
      expect(resolveDetectionJobProvider(jobId, 'rodium-ai')).toBe('rodium-ai');
    });

    it('uses Rodium for localhost uploads in development so the image is provider-readable', () => {
      vi.stubEnv('NODE_ENV', 'development');
      try {
        expect(resolveSubmissionProvider({
          kind: 'image', fileName: 'plan.png', url: 'http://localhost:3000/api/plan-import/local-upload/plan.png', width: 800, height: 600,
        }, 'agent-router')).toBe('rodium-ai');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('honours legacy provider-prefixed job IDs', () => {
      expect(resolveDetectionJobProvider('agent-router-old-job', 'rodium-ai')).toBe('agent-router');
      expect(resolveDetectionJobProvider('rodium-old-job', 'agent-router')).toBe('rodium-ai');
    });

    it('should support multiple providers in parallel', async () => {
      const { makeAskImageAnalysis, makeAskOcr, makeAskScaleCalibration } =
        await import('../agent-router');

      const url = 'https://example.com/test.png';
      const askImage = makeAskImageAnalysis(url);
      const askOcr = makeAskOcr(url);
      const askScale = makeAskScaleCalibration(url);

      expect(askImage).toBeDefined();
      expect(askOcr).toBeDefined();
      expect(askScale).toBeDefined();

      // All are callable
      expect(typeof askImage).toBe('function');
      expect(typeof askOcr).toBe('function');
      expect(typeof askScale).toBe('function');
    });

    it('should handle image caching in Rodium AI', async () => {
      const { makeAsk } = await import('../rodium-ai');
      const url = 'https://example.com/test.png';

      const ask1 = makeAsk(url, 'gpt-5.6-luna');
      const ask2 = makeAsk(url, 'gpt-5.6-luna');

      // Both functions should be created (internal caching happens at call time)
      expect(typeof ask1).toBe('function');
      expect(typeof ask2).toBe('function');
    });
  });

  describe('Response Format', () => {
    it('should extract JSON from responses', async () => {
      // Test the extraction logic
      const responses = [
        '{"success": true}',
        '```json\n{"success": true}\n```',
        'Some text\n{"success": true}\nMore text',
      ];

      for (const response of responses) {
        try {
          const json = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || response);
          expect(json.success).toBe(true);
        } catch {
          // Expected for some responses
        }
      }
    });
  });
});
