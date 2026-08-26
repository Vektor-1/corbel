import type { ImportSource, ReconstructionResultV1 } from './types';
import { extractJson, runDetectionPipeline, runOcrAndScale, submitPipelineJob, getPipelineJob, type AskFn, type RawLabel, type ScaleResult } from './pipeline';

function client() {
  const key = process.env.RODIUM_AI_API_KEY;
  if (!key) throw new Error('RODIUM_AI_API_KEY is not set.');
  const baseUrl = process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1';
  return { apiKey: key, baseUrl };
}

interface RodiumAIRequest {
  model: 'gpt-5.6-luna' | 'gemini-3.1';
  messages: Array<{ role: 'user' | 'system'; content: string | { type: string; text?: string; image_url?: string }[] }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

interface RodiumAIResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function makeRodiumRequest(request: RodiumAIRequest): Promise<string> {
  const { apiKey, baseUrl } = client();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Rodium AI error (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as RodiumAIResponse;
  return data.choices[0]?.message?.content || '';
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

export function makeAsk(imageUrl: string, model: 'gpt-5.6-luna' | 'gemini-3.1'): AskFn {
  let cachedBase64: string | null = null;

  return async (prompt: string) => {
    if (!cachedBase64) {
      cachedBase64 = await fetchImageAsBase64(imageUrl);
    }

    const text = await makeRodiumRequest({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: `data:image/png;base64,${cachedBase64}`,
            } as any,
            {
              type: 'text',
              text: prompt,
            } as any,
          ] as any,
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    });

    return extractJson(text);
  };
}

export async function runRodiumDetection(
  source: ImportSource,
  model: 'gpt-5.6-luna' | 'gemini-3.1' = 'gpt-5.6-luna'
): Promise<ReconstructionResultV1> {
  const ask = makeAsk(source.url, model);
  return runDetectionPipeline(ask, source, `rodium-${model}`);
}

export function submitRodiumJob(
  source: ImportSource,
  model: 'gpt-5.6-luna' | 'gemini-3.1' = 'gpt-5.6-luna'
): string {
  return submitPipelineJob(source, `rodium-${model}`, async () => makeAsk(source.url, model));
}

export function getRodiumJob(id: string) {
  return getPipelineJob(id);
}

export async function runRodiumOcrAndScale(
  source: ImportSource,
  model: 'gpt-5.6-luna' | 'gemini-3.1' = 'gemini-3.1'
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const ask = makeAsk(source.url, model);
  return runOcrAndScale(ask, source, `rodium-ocr-${model}`);
}
