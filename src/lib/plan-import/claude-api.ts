import Anthropic from '@anthropic-ai/sdk';
import type { ImportSource, ReconstructionResultV1, RawLabel, ScaleResult } from './types';
import { extractJson, runDetectionPipeline, runOcrAndScale, submitPipelineJob, getPipelineJob, type AskFn } from './pipeline';

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic({ apiKey: key });
}

const MODEL = () => process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  const mediaType = (res.headers.get('content-type') ?? 'image/png').split(';')[0] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  return {
    data: Buffer.from(buffer).toString('base64'),
    mediaType,
  };
}

export function makeAsk(imageData: { data: string; mediaType: string }): AskFn {
  return async (prompt: string) => {
    const anthropic = client();
    const message = await anthropic.messages.create({
      model: MODEL(),
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: imageData.data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      system:
        'You are a floor plan analysis engine. Respond with pure JSON only — no prose, no markdown code blocks, no fenced code blocks.',
    });

    let text = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        text = block.text;
        break;
      }
    }
    if (!text) throw new Error('Claude API returned no text response.');
    return extractJson(text);
  };
}

export async function runClaudeApiDetection(source: ImportSource): Promise<ReconstructionResultV1> {
  const imageData = await fetchImageAsBase64(source.url);
  return runDetectionPipeline(makeAsk(imageData), source, 'claude-api');
}

export function submitClaudeApiJob(source: ImportSource): string {
  return submitPipelineJob(source, 'claude-api', async (src) => makeAsk(await fetchImageAsBase64(src.url)));
}

export function getClaudeApiJob(id: string) {
  return getPipelineJob(id);
}

export async function runClaudeApiOcrAndScale(
  source: ImportSource
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const imageData = await fetchImageAsBase64(source.url);
  return runOcrAndScale(makeAsk(imageData), source, 'claude-api-ocr');
}
