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
import { useRouter, useSearchParams } from 'next/navigation';
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
import { fromBackendGeometry, type OcrScaleResult } from '@/lib/plan-import/fromBackendGeometry';
import type { ImportSource } from '@/lib/plan-import/types';
import { waitForHostedReconstruction } from '@/lib/services/hostedImport';
import { uploadToMlBackend, waitForMlBackendGeometry } from '@/lib/services/mlBackendImport';
import { useFeatureFlag } from '@/lib/flags';
import { validateUploadFile } from '@/lib/uploads/uploadPolicy';
import { uploadPlanReference } from '@/lib/uploads/planUpload';
import {
  notifyReconstructionFailure,
  notifyReconstructionReady,
  notifyUploadRejected,
} from './uploadNotifications';

type Mode = 'reconstruct' | 'trace';
type Phase = 'idle' | 'uploading' | 'processing' | 'review' | 'failed';
type ProviderProgress = { status: string; progress: number };

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
  const searchParams = useSearchParams();
  const beginImportedEdit = useDesignStore((s) => s.beginImportedEdit);
  const beginImageTrace = useDesignStore((s) => s.beginImageTrace);
  const setLastImportJobId = useDesignStore((s) => s.setLastImportJobId);
  const traceToLearnEnabled = useFeatureFlag('traceToLearn');
  const mlBackendEnabled = useFeatureFlag('mlBackend');

  const lessonTrace = searchParams.get('mode') === 'trace' && searchParams.get('lesson') === 'two-bedroom-plan-reading';
  const [mode, setMode] = useState<Mode>(lessonTrace ? 'trace' : 'reconstruct');
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

  // Strategy 1: Add semantic grid overlay to improve AI spatial drift
  const addGridToImage = async (original: File): Promise<File> => {
    if (!original.type.startsWith('image/')) return original;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(original);
        
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.font = '12px Arial';
        ctx.lineWidth = 1;

        const step = 100;
        for (let x = 0; x < canvas.width; x += step) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
          ctx.fillText(`X:${x}`, x + 2, 12);
        }
        for (let y = 0; y < canvas.height; y += step) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
          ctx.fillText(`Y:${y}`, 2, y - 2);
        }

        canvas.toBlob(blob => {
          if (blob) resolve(new File([blob], original.name, { type: original.type }));
          else resolve(original);
        }, original.type);
      };
      img.onerror = () => resolve(original);
      img.src = URL.createObjectURL(original);
    });
  };

  const runReconstruct = useCallback(async () => {
    if (!file) return;
    setError(null);
    setProviderProgress(null);
    setPhase('uploading');
    try {
      const processedFile = await addGridToImage(file);
      const imageUrl = await uploadPlanReference(processedFile);

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

  // Self-hosted GPU backend path: reuses the same OCR/scale call and the
  // same reconstructFloorPlan()/beginImportedEdit() as the hosted-LLM path
  // above -- only wall/opening detection comes from a different source.
  const runBackendReconstruct = useCallback(async () => {
    if (!file) return;
    setError(null);
    setProviderProgress(null);
    setPhase('uploading');
    try {
      setProviderProgress({ status: 'uploading', progress: 5 });
      // Two independent uploads of the same file: the backend's own MinIO
      // storage (for inference) and Corbel's existing blob/local storage
      // (so the already-working OCR route has a URL it can fetch from).
      const [uploadId, imageUrl] = await Promise.all([uploadToMlBackend(file), uploadPlanReference(file)]);
      const source = await createImportSource(file, imageUrl);

      setPhase('processing');
      setProviderProgress({ status: 'running GPU inference', progress: 20 });
      const [{ jobId, geometry }, ocrResponse] = await Promise.all([
        waitForMlBackendGeometry(uploadId, {
          onStatus: (status, progress) => setProviderProgress({ status, progress: Math.max(20, progress) }),
        }),
        fetch('/api/plan-import/ocr-scale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        }).then(async (r) => {
          const body = (await r.json()) as OcrScaleResult & { error?: string };
          if (!r.ok) throw new Error(body.error ?? 'OCR/scale calibration failed.');
          return body;
        }),
      ]);

      const synthetic = fromBackendGeometry(source, geometry, ocrResponse);
      const imported = reconstructFloorPlan(synthetic);
      const blockingDiagnostic = imported.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
      if (blockingDiagnostic) throw new Error(blockingDiagnostic.message);
      beginImportedEdit(imported.floorPlan);
      setLastImportJobId(jobId);
      notifyReconstructionReady(toast);
      router.push('/editor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Backend reconstruction failed.');
      setPhase('failed');
      notifyReconstructionFailure(toast);
    }
  }, [beginImportedEdit, file, router, setLastImportJobId]);

  const runTrace = useCallback(async () => {
    if (!file) return;
    setError(null);
    setProviderProgress(null);
    setPhase('uploading');
    try {
      const imageUrl = await uploadPlanReference(file);
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

        {lessonTrace && (
          <div className="mb-6 border border-[#b89a5a] bg-[#fbf4df] px-4 py-3 text-sm text-[#55431c]" role="status">
            <strong>Continue your plan-reading practice.</strong> In Image retrace, use a visible known-length wall to calibrate your drawing. This lesson has not calibrated your uploaded image automatically.
          </div>
        )}

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
                  {mode === 'reconstruct' && mlBackendEnabled && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!file}
                      onClick={runBackendReconstruct}
                    >
                      <UploadIcon /> Reconstruct with self-hosted GPU backend
                    </Button>
                  )}
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
