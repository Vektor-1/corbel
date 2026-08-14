import { NextResponse } from 'next/server';
import { isAllowedImportUrl, submitRunpodImport } from '@/lib/plan-import/runpod';
import { submitGeminiJob } from '@/lib/plan-import/gemini';
import { submitClaudeAgentJob } from '@/lib/plan-import/claude-agent';
import { submitClaudeApiJob } from '@/lib/plan-import/claude-api';
import { resolveProvider } from '@/lib/plan-import/provider';
import { parseImportSource } from '@/lib/plan-import/validate';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as { source?: unknown };
    const source = parseImportSource(payload.source);
    if (!isAllowedImportUrl(source.url)) {
      return NextResponse.json({ error: 'The source file host is not allowed.' }, { status: 400 });
    }

    const provider = resolveProvider();

    if (provider === 'claude-api' || provider === 'claude-agent' || provider === 'gemini') {
      let id: string;
      if (provider === 'claude-api') {
        id = submitClaudeApiJob(source);
      } else if (provider === 'claude-agent') {
        id = submitClaudeAgentJob(source);
      } else {
        id = submitGeminiJob(source);
      }
      return NextResponse.json(
        { id, providerJobId: id, status: 'processing', source, progress: 20,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { status: 202 }
      );
    }

    const job = await submitRunpodImport(source);
    return NextResponse.json(
      { id: job.providerJobId, providerJobId: job.providerJobId, status: job.status,
        source, progress: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit import.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
