import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type { ImportSource, ReconstructionResultV1 } from './types';
import { extractJson, runDetectionPipeline, runOcrAndScale, submitPipelineJob, getPipelineJob, type AskFn, type RawLabel, type ScaleResult } from './pipeline';

function client() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set.');
  return new GoogleGenerativeAI(key);
}

const MODEL = () => process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite';

export async function fetchImagePart(url: string): Promise<Part> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  const mimeType = (res.headers.get('content-type') ?? 'image/png').split(';')[0] as string;
  return { inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } };
}

export function makeAsk(imagePart: Part): AskFn {
  return async (prompt: string) => {
    const ai = client();
    const model = ai.getGenerativeModel({ model: MODEL() });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
    return extractJson(result.response.text());
  };
}

export async function runGeminiDetection(source: ImportSource): Promise<ReconstructionResultV1> {
  const imagePart = await fetchImagePart(source.url);
  return runDetectionPipeline(makeAsk(imagePart), source, 'gemini');
}

export function submitGeminiJob(source: ImportSource): string {
  return submitPipelineJob(source, 'gemini', async (src) => makeAsk(await fetchImagePart(src.url)));
}

export function getGeminiJob(id: string) {
  return getPipelineJob(id);
}

export async function runGeminiOcrAndScale(
  source: ImportSource
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const imagePart = await fetchImagePart(source.url);
  return runOcrAndScale(makeAsk(imagePart), source, 'gemini-ocr');
}
