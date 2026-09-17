import type { ImportSource, ReconstructionResultV1 } from './types';
import { existsSync, readFileSync } from 'node:fs';
import { extractJson, runDetectionPipeline, runOcrAndScale, submitPipelineJob, getPipelineJob, type AskFn, type RawLabel, type ScaleResult } from './pipeline';

function client() {
  const key = process.env.RODIUM_AI_API_KEY;
  if (!key) throw new Error('RODIUM_AI_API_KEY is not set.');
  const baseUrl = process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1';
  return { apiKey: key, baseUrl };
}

/** Use Rodium's fast vision-capable profile unless a catalog model is configured. */
export function resolveRodiumModel(): string {
  return process.env.RODIUM_AI_MODEL?.trim() || 'rodium/fast';
}

interface RodiumAIRequest {
  model: string;
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
    signal: AbortSignal.timeout(45_000),
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

export function makeAsk(imageUrl: string, model = resolveRodiumModel()): AskFn {
  let cachedBase64: string | null = null;
  
  // Hardcoded Gold Standard for Few-Shot Visual Anchoring
  // Generated from a clean 500x500 2-room layout.
  const goldStandard = existsSync('gold_standard.json')
    ? JSON.parse(readFileSync('gold_standard.json', 'utf8'))
    : null;
  const goldStandardImageBase64 = goldStandard?.imageBase64;
  const goldStandardSvg = goldStandard?.svg;

  return async (prompt, format = 'json') => {
    if (!cachedBase64) {
      cachedBase64 = await fetchImageAsBase64(imageUrl);
    }
    
    // Construct Few-Shot messages array
    const messages: any[] = [];
    
    // If this is a wall-detection prompt, inject the Few-Shot context
    if (format === 'svg' && goldStandardImageBase64 && goldStandardSvg) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${goldStandardImageBase64}` } }
        ]
      });
      messages.push({
        role: 'assistant',
        content: [
          { type: 'text', text: `<reasoning>\nThe image shows a simple rectangular building envelope (500x500). There is a single internal partition wall splitting it vertically down the middle at X=250.\n</reasoning>\n${goldStandardSvg}` }
        ]
      });
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Excellent. Now apply those exact same trace rules to this new image:' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${cachedBase64}` } }
        ]
      });
    } else {
      // Standard zero-shot for OCR/Scale
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${cachedBase64}` } },
        ],
      });
    }

    const responseText = await makeRodiumRequest({
      model,
      messages,
    });
    if (format === 'svg') {
      return responseText;
    }
    return extractJson(responseText);
  };
}

export async function runRodiumDetection(
  source: ImportSource,
  model = resolveRodiumModel()
): Promise<ReconstructionResultV1> {
  const ask = makeAsk(source.url, model);
  return runDetectionPipeline(ask, source, `rodium-${model}`);
}

export function submitRodiumJob(
  source: ImportSource,
  model = resolveRodiumModel()
): string {
  return submitPipelineJob(source, `rodium-${model}`, async () => makeAsk(source.url, model));
}

export function getRodiumJob(id: string) {
  return getPipelineJob(id);
}

export async function runRodiumOcrAndScale(
  source: ImportSource,
  model = resolveRodiumModel()
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const ask = makeAsk(source.url, model);
  return runOcrAndScale(ask, source, `rodium-ocr-${model}`);
}
