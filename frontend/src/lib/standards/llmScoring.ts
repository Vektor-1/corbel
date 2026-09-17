/**
 * LLM-based scoring for design iteration and innovation.
 * Evaluates design changes using Claude or GPT.
 */

import { Canonical } from '@/types/schema';

export interface LLMScoringRequest {
  baseline: Canonical.Floor;
  redesign: Canonical.Floor;
  changeCount: number; // number of edits made
  wallsAdded: number;
  wallsRemoved: number;
  roomsAdded: number;
  roomsRemoved: number;
}

export interface LLMScoringResult {
  score: number; // 0, 1, or 2
  reasoning: string;
  model: 'claude' | 'gpt';
  timestamp: number;
}

/**
 * Score design iteration using Claude.
 */
export async function scoreLLMDesignIteration(
  request: LLMScoringRequest
): Promise<LLMScoringResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback to rule-based scoring
    return fallbackScoring(request);
  }

  const prompt = buildScoringPrompt(request);

  try {
    // Try Claude first
    if (process.env.ANTHROPIC_API_KEY) {
      return await scoreWithClaude(prompt, request);
    }
    // Fall back to GPT
    if (process.env.OPENAI_API_KEY) {
      return await scoreWithGPT(prompt, request);
    }
  } catch (error) {
    console.warn('LLM scoring failed, using fallback:', error);
    return fallbackScoring(request);
  }

  return fallbackScoring(request);
}

function buildScoringPrompt(request: LLMScoringRequest): string {
  const baselineArea = request.baseline.rooms.reduce((sum, r) => sum + r.area, 0) / 1e6;
  const redesignArea = request.redesign.rooms.reduce((sum, r) => sum + r.area, 0) / 1e6;

  return `
Evaluate the design iteration quality of an architectural redesign.

Baseline floor plan:
- Rooms: ${request.baseline.rooms.length}
- Walls: ${request.baseline.walls.length}
- Total area: ${baselineArea.toFixed(1)}m²

Redesigned floor plan:
- Rooms: ${request.redesign.rooms.length}
- Walls: ${request.redesign.walls.length}
- Total area: ${redesignArea.toFixed(1)}m²

Changes made:
- Total edits: ${request.changeCount}
- Walls added: ${request.wallsAdded}, removed: ${request.wallsRemoved}
- Rooms added: ${request.roomsAdded}, removed: ${request.roomsRemoved}

On a scale of 0-2, rate the design iteration:
- 0: No changes from baseline (direct copy)
- 1: Minor iterative changes (< 3 modifications)
- 2: Significant design improvements (3+ thoughtful modifications)

Respond with ONLY: {"score": 0|1|2, "reasoning": "brief explanation"}
`;
}

async function scoreWithClaude(prompt: string, request: LLMScoringRequest): Promise<LLMScoringResult> {
  const Anthropic = require('@anthropic-ai/sdk').default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = parseScoreResponse(text);

  return {
    ...parsed,
    model: 'claude',
    timestamp: Date.now(),
  };
}

async function scoreWithGPT(prompt: string, request: LLMScoringRequest): Promise<LLMScoringResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`GPT API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content || '';
  const parsed = parseScoreResponse(text);

  return {
    ...parsed,
    model: 'gpt',
    timestamp: Date.now(),
  };
}

function parseScoreResponse(text: string): { score: number; reasoning: string } {
  try {
    const json = JSON.parse(text);
    return {
      score: Math.min(2, Math.max(0, json.score ?? 1)),
      reasoning: json.reasoning || 'Score based on iteration quality',
    };
  } catch {
    return {
      score: 1,
      reasoning: 'Unable to parse LLM response',
    };
  }
}

function fallbackScoring(request: LLMScoringRequest): LLMScoringResult {
  const totalChanges = request.wallsAdded + request.wallsRemoved + request.roomsAdded + request.roomsRemoved;

  let score = 0;
  if (request.changeCount === 0) {
    score = 0;
  } else if (totalChanges < 3) {
    score = 1;
  } else {
    score = 2;
  }

  return {
    score,
    reasoning: `${totalChanges} changes detected`,
    model: 'claude',
    timestamp: Date.now(),
  };
}
