import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ImportSource, ReconstructionResultV1 } from './types';
import { extractJson, runDetectionPipeline, submitPipelineJob, getPipelineJob, type AskFn } from './pipeline';

// Vision provider backed by the user's local Claude Code installation via the
// Agent SDK. No API key required — uses the individual's own Claude auth.
// Dev/local only: the deployed app has no local binary.

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

interface ImageData {
  mediaType: ImageMediaType;
  base64: string;
}

async function fetchImage(url: string): Promise<ImageData> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  const raw = (res.headers.get('content-type') ?? 'image/png').split(';')[0];
  const mediaType: ImageMediaType = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(raw)
    ? (raw as ImageMediaType)
    : 'image/png';
  return { mediaType, base64: Buffer.from(buffer).toString('base64') };
}

const MODEL = () => process.env.CLAUDE_AGENT_MODEL ?? 'claude-sonnet-5';

function makeAsk(image: ImageData): AskFn {
  return async (prompt: string) => {
    async function* messages(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user' as const,
        parent_tool_use_id: null,
        message: {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: prompt },
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: image.mediaType,
                data: image.base64,
              },
            },
          ],
        },
      };
    }

    let text = '';
    for await (const message of query({
      prompt: messages(),
      options: {
        model: MODEL(),
        maxTurns: 1,
        allowedTools: [],
        systemPrompt:
          'You are a floor plan analysis engine. Respond with pure JSON only — no prose, no markdown fences.',
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          throw new Error(`Claude Agent SDK call failed (${message.subtype}).`);
        }
        text = message.result;
      }
    }

    if (!text) throw new Error('Claude Agent SDK returned no result.');
    return extractJson(text);
  };
}

export async function runClaudeAgentDetection(source: ImportSource): Promise<ReconstructionResultV1> {
  const image = await fetchImage(source.url);
  return runDetectionPipeline(makeAsk(image), source, 'claude-agent');
}

export function submitClaudeAgentJob(source: ImportSource): string {
  return submitPipelineJob(source, 'claude-agent', async (src) => makeAsk(await fetchImage(src.url)));
}

export function getClaudeAgentJob(id: string) {
  return getPipelineJob(id);
}
