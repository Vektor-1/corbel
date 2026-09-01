'use client';

/**
 * Upload page for Week 4: a single redesigned entry point covering both
 * upload flows.
 *
 * AI reconstruction — photo of a plan → editable FloorPlan loaded in /editor.
 * Image retrace     — reference image → blank 2D editor with a configurable
 *                     underlay; no AI geometry is produced.
 *
 * Reconstruction uses the configured hosted provider (AgentRouter or Rodium).
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileImage,
  Loader2,
  Route as TraceIcon,
  Sparkles,
  Upload as UploadIcon,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDesignStore } from '@/store/designStore';
import { reconstructFloorPlan } from '@/lib/plan-import/reconstruct';
import type { ImportSource } from '@/lib/plan-import/types';
import { waitForHostedReconstruction } from '@/lib/services/hostedImport';
import { useFeatureFlag } from '@/lib/flags';
import { validateUploadFile } from '@/lib/uploads/uploadPolicy';
import {
  notifyReconstructionFailure,
  notifyReconstructionReady,
  notifyUploadRejected,
} from './uploadNotifications';

type Mode = 'reconstruct' | 'trace';
type Phase = 'idle' | 'uploading' | 'processing' | 'review' | 'failed';
type ProviderProgress = { status: string; progress: number };

async function uploadImage(file: File): Promise<string> {
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_BLOB_ENABLED) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/plan-import/local-upload', { method: 'POST', body: form });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? 'Local upload failed.');
    return payload.url as string;
  }
  const blob = await upload(`plan-imports/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/plan-import/upload',
  });
  return blob.url;
}

async function readImageSize(file: File) {
  if (!file.type.startsWith('image/')) return { width: 1, height: 1 };
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

async function createImportSource(file: File, url: string): Promise<ImportSource> {
  const dimensions = await readImageSize(file);
  return {
    kind: file.type === 'application/pdf' ? 'pdf' : 'image',
    fileName: file.name,
    url,
    page: file.type === 'application/pdf' ? 1 : undefined,
    ...dimensions,
  };
}

export default function UploadPage() {
  const router = useRouter();
  const beginImportedEdit = useDesignStore((s) => s.beginImportedEdit);
  const beginImageTrace = useDesignStore((s) => s.beginImageTrace);
  const traceToLearnEnabled = useFeatureFlag('traceToLearn');

  const [mode, setMode] = useState<Mode>('reconstruct');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [providerProgress, setProviderProgress] = useState<ProviderProgress | null>(null);
  const dropRef = useRef<HTMLLabelElement | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
    setPhase('idle');
    setError(null);
    setProviderProgress(null);
  }, []);

  const pickFile = useCallback((picked: File | null) => {
    if (!picked) return;

    const result = validateUploadFile(picked);
    if (!result.ok) {
      setFile(null);
      setPreviewUrl(null);
      setPhase('idle');
      setError(result.message);
      notifyUploadRejected(toast, result.message);
      return;
    }

    setFile(picked);
    const localUrl = URL.createObjectURL(picked);
    setPreviewUrl(localUrl);
    setPhase('idle');
    setError(null);
    setProviderProgress(null);
  }, []);

  const runReconstruct = useCallback(async () => {
    if (!file) return;
    setError(null);
    setProviderProgress(null);
    setPhase('uploading');
    try {
      const imageUrl = await uploadImage(file);

      setPhase('processing');
      const result = await waitForHostedReconstruction(await createImportSource(file, imageUrl), {
        onStatus: (status, progress) => setProviderProgress({ status, progress }),
      });
      const imported = reconstructFloorPlan(result);
      const blockingDiagnostic = imported.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
      if (blockingDiagnostic) throw new Error(blockingDiagnostic.message);
      beginImportedEdit(imported.floorPlan);
      notifyReconstructionReady(toast);
      router.push('/editor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reconstruction failed.');
      setPhase('failed');
      notifyReconstructionFailure(toast);
    }
  }, [beginImportedEdit, file, router]);

  const runTrace = useCallback(async () => {
    if (!file) return;
    setError(null);
    setProviderProgress(null);
    setPhase('uploading');
    try {
      const imageUrl = await uploadImage(file);
      beginImageTrace(imageUrl, file.name);
      toast.success('Reference plan added to the 2D editor. Adjust its scale and blur before tracing.');
      router.push('/editor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the image retrace workspace.');
      setPhase('failed');
      notifyReconstructionFailure(toast);
    }
  }, [beginImageTrace, file, router]);

  const dropZoneProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      dropRef.current?.classList.add('bg-white/90');
    },
    onDragLeave: () => dropRef.current?.classList.remove('bg-white/90'),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropRef.current?.classList.remove('bg-white/90');
      const dropped = e.dataTransfer.files?.[0] ?? null;
      pickFile(dropped);
    },
  };

  return (
    <main className="min-h-screen bg-[#f2efe7] px-6 py-8 text-[#26221a]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a806e]">Corbel Import</p>
            <h1 className="mt-2 font-display text-3xl">Upload a floor plan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f685b]">
              Choose whether to reconstruct an editable plan with AI, or retrace directly over a 2D reference image.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/')}>
            <ArrowLeft /> Home
          </Button>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex gap-2">
          {(
            [
              { id: 'reconstruct' as const, label: 'AI reconstruction', icon: Sparkles, desc: 'Use the configured AI provider to turn a plan image into editable walls, rooms, and openings.' },
              { id: 'trace' as const, label: 'Image retrace', icon: TraceIcon, desc: 'Open a plan as a blurred 2D guide, then redraw it yourself. No AI reconstruction is used.' },
            ]
          ).map(({ id, label, icon: Icon, desc }) => {
            if (id === 'trace' && !traceToLearnEnabled) return null;
            return (
              <button
                key={id}
                type="button"
                disabled={phase === 'processing' || phase === 'uploading'}
                onClick={() => setMode(id)}
                className={`flex-1 rounded-2xl border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === id
                    ? 'border-[#8a6b3f] bg-white shadow-sm'
                    : 'border-[#d7d0c2] bg-white/50 hover:bg-white/80'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={16} className={mode === id ? 'text-[#8a6b3f]' : 'text-[#a39a89]'} />
                  {label}
                </div>
                <p className="mt-1 text-xs text-[#817969]">{desc}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Source + preview */}
          <section className="overflow-hidden rounded-2xl border border-[#d7d0c2] bg-white/80 shadow-sm">
            <div className="border-b border-[#e3ddd2] px-5 py-4">
              <h2 className="text-sm font-semibold">Source photo</h2>
              <p className="mt-1 text-xs text-[#817969]">
                {mode === 'reconstruct'
                  ? 'A hand-drawn or printed floor plan for AI detection and editable reconstruction.'
                  : 'An image reference to place beneath the 2D canvas while you redraw it manually.'}
              </p>
            </div>
            <div className="flex min-h-[520px] items-center justify-center bg-[#e9e4d9] p-5">
              {previewUrl && file?.type !== 'application/pdf' ? (
                <div className="relative max-h-[480px] max-w-full">
                  <img src={previewUrl} alt="Uploaded floor plan" className="max-h-[480px] max-w-full rounded-lg object-contain shadow-sm" />
                  {phase === 'idle' && (
                    <button
                      type="button"
                      onClick={reset}
                      className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow"
                      aria-label="Remove file"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : file?.type === 'application/pdf' ? (
                <div className="relative flex max-w-lg flex-col items-center rounded-xl border border-[#d7d0c2] bg-white px-8 py-16 text-center shadow-sm">
                  <FileImage className="h-8 w-8 text-[#8a6b3f]" />
                  <span className="mt-4 text-sm font-medium">PDF plan ready for AI reconstruction</span>
                  <span className="mt-1 text-xs text-[#817969]">{file.name}</span>
                  {phase === 'idle' && (
                    <button
                      type="button"
                      onClick={reset}
                      className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow"
                      aria-label="Remove file"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <label
                  ref={dropRef}
                  {...dropZoneProps}
                  className="flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#bdb3a2] bg-white/55 px-8 py-16 text-center transition hover:bg-white/80"
                >
                  <FileImage className="h-8 w-8 text-[#8a6b3f]" />
                  <span className="mt-4 text-sm font-medium">Drag and drop, or click to choose a file</span>
                  <span className="mt-1 text-xs text-[#817969]">{mode === 'trace' ? 'PNG, JPEG, or WebP' : 'PNG, JPEG, WebP, or PDF'} — up to 25 MB</span>
                  <input
                    type="file"
                    accept={mode === 'trace' ? 'image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp,application/pdf'}
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          </section>

          {/* AI reconstruction or image retrace entry point */}
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#d7d0c2] bg-white/80 p-5 shadow-sm">
              <h2 className="text-sm font-semibold">{mode === 'trace' ? 'Image retrace' : 'AI reconstruction'}</h2>

              {phase === 'idle' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-[#f3efe7] px-3 py-3 text-xs text-[#6f685b]">
                    {file ? file.name : 'Select a source file to begin.'}
                  </div>
                  <Button className="w-full" disabled={!file || (mode === 'trace' && file?.type === 'application/pdf')} onClick={mode === 'trace' ? runTrace : runReconstruct}>
                    <UploadIcon /> {mode === 'trace' ? 'Open image retrace in 2D' : 'Reconstruct with AI'}
                  </Button>
                  {mode === 'trace' && file?.type === 'application/pdf' && <p className="text-xs text-[#9c3c31]">Image retrace supports PNG, JPEG, and WebP files. Choose AI reconstruction for a PDF.</p>}
                </div>
              )}

              {(phase === 'uploading' || phase === 'processing') && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    {phase === 'uploading'
                      ? 'Uploading image…'
                      : providerProgress
                        ? `AI provider: ${providerProgress.status} (${providerProgress.progress}%)`
                        : 'Submitting reconstruction to the configured AI provider…'}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6dfd2]">
                    <div
                      className="h-full bg-[#8a6b3f] transition-all"
                      style={{ width: `${phase === 'uploading' ? 15 : Math.max(20, Math.min(95, providerProgress?.progress ?? 20))}%` }}
                    />
                  </div>
                </div>
              )}

              {phase === 'failed' && error && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
                  <Button variant="outline" className="w-full" onClick={reset}>
                    Try again
                  </Button>
                </div>
              )}

            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
