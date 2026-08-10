'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';

async function uploadFile(file: File): Promise<string> {
  // In dev without a Blob token, use the local upload route instead.
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_BLOB_ENABLED) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/plan-import/local-upload', { method: 'POST', body: form });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? 'Local upload failed.');
    return payload.url;
  }
  const blob = await upload(`plan-imports/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/plan-import/upload',
  });
  return blob.url;
}
import { ArrowLeft, Check, Cpu, FileImage, Loader2, ScanText, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { reconstructFloorPlan } from '@/lib/plan-import';
import type { ImportJobStatus, PlanDetection, ReconstructionResultV1 } from '@/lib/plan-import';
import { detectLocalMl, type RawBox } from '@/lib/plan-import/local-ml';
import { refineWalls, reattachOpenings } from '@/lib/plan-import/refine';
import { useDesignStore } from '@/store/designStore';

// Client-side YOLO detections have no OCR/scale calibration — walls default
// to a nominal thickness and the scale must be confirmed manually in review.
// Raw boxes are passed through the domain-specific refinement module first:
// axis snapping, junction closing, and overlap collapse produce a clean wall
// graph before openings are reattached and the result is assembled.
function localMlToReconstruction(
  boxes: RawBox[],
  source: { fileName: string; url: string; width: number; height: number },
  ocr?: { labels: { id: string; text: string; x: number; y: number; role: string }[]; scale: { pixelsPerMeter: number; confidence: number; method: 'dimension-ocr' | 'scale-bar' | 'manual' } }
): ReconstructionResultV1 {
  const refinedWalls = refineWalls(boxes);
  const openings = reattachOpenings(boxes, refinedWalls);

  const walls = refinedWalls.map((w) => ({
    id: w.id,
    kind: 'wall' as const,
    confidence: w.confidence,
    start: { x: w.startX, y: w.startY },
    end: { x: w.endX, y: w.endY },
    thicknessMm: w.thicknessMm,
    role: w.role,
  }));

  const doorsAndWindows = openings.map((o) => ({
    id: o.id,
    kind: o.kind,
    confidence: o.confidence,
    wallId: o.wallId,
    offsetRatio: o.offsetRatio,
    widthMm: o.widthMm,
  }));

  const roomLabels = (ocr?.labels ?? [])
    .filter((l) => l.role === 'room-name')
    .map((l) => ({
      id: l.id,
      kind: 'label' as const,
      confidence: 0.85,
      text: l.text,
      position: { x: l.x, y: l.y },
      role: 'room-name' as const,
    }));

  const confidences = boxes.map((b) => b.confidence);
  const overallConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : 0;

  return {
    schemaVersion: 1,
    source: { kind: 'image', fileName: source.fileName, url: source.url, width: source.width, height: source.height },
    scale: ocr?.scale ?? { pixelsPerMeter: 100, confidence: 0.3, method: 'manual' },
    detections: [...walls, ...doorsAndWindows, ...roomLabels],
    overallConfidence,
    warnings: ocr
      ? ['Detected locally (YOLOv8n + refinement); OCR and scale via Gemini.']
      : ['Detected locally (YOLOv8n + refinement) — confirm scale manually; OCR was not run.'],
  };
}

type DetectionSource = 'vlm' | 'local-ml' | 'local-ml-ocr';

interface SubmittedJob {
  id: string;
  status: ImportJobStatus;
  progress: number;
  result?: ReconstructionResultV1;
  error?: string;
  detectionSource?: DetectionSource;
}

const sourceLabel: Record<DetectionSource, string> = {
  vlm: 'Vision-language model',
  'local-ml': 'Local YOLOv8n',
  'local-ml-ocr': 'Local YOLOv8n + Gemini OCR',
};

async function readImageSize(file: File) {
  if (!file.type.startsWith('image/')) return { width: 1, height: 1 };
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

const stageLabel = (progress: number): string => {
  if (progress < 20) return 'Uploading image…';
  if (progress < 30) return 'Analysing floor plan…';
  if (progress < 48) return 'Detecting walls…';
  if (progress < 65) return 'Locating openings and scanning text…';
  if (progress < 80) return 'Calibrating scale…';
  if (progress < 93) return 'Validating reconstruction…';
  return 'Finalising…';
};

const confidenceTone = (confidence: number) =>
  confidence >= 0.85
    ? 'text-[var(--editor-success)]'
    : confidence >= 0.65
      ? 'text-[var(--editor-warning)]'
      : 'text-[var(--editor-danger)]';

export default function PlanImportPage() {
  const router = useRouter();
  const beginRedesign = useDesignStore((state) => state.beginRedesign);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [job, setJob] = useState<SubmittedJob | null>(null);
  const [scale, setScale] = useState(100);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLocalMl, setUseLocalMl] = useState(false);
  const [useOcr, setUseOcr] = useState(true);

  useEffect(() => {
    if (!job || job.status === 'review' || job.status === 'failed' || job.status === 'completed') return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/plan-import/jobs/${job.id}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Unable to read import job.');
        setJob((current) => ({ ...payload, detectionSource: current?.detectionSource ?? 'vlm' }));
        if (payload.result) {
          setScale(payload.result.scale.pixelsPerMeter);
          setAccepted(Object.fromEntries(payload.result.detections.map((item: PlanDetection) => [item.id, item.accepted !== false])));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to read import job.');
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [job]);

  const detectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const detection of job?.result?.detections ?? []) counts[detection.kind] = (counts[detection.kind] ?? 0) + 1;
    return counts;
  }, [job?.result]);

  const reviewDetections = useMemo(
    () => [...(job?.result?.detections ?? [])].sort((a, b) => a.confidence - b.confidence),
    [job?.result]
  );

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dimensions = await readImageSize(file);
      const blobUrl = await uploadFile(file);
      setSourceUrl(blobUrl);

      if (useLocalMl) {
        const { boxes } = await detectLocalMl(file);
        const source = { kind: 'image' as const, fileName: file.name, url: blobUrl, ...dimensions };

        let ocr: { labels: { id: string; text: string; x: number; y: number; role: string }[]; scale: { pixelsPerMeter: number; confidence: number; method: 'dimension-ocr' | 'scale-bar' | 'manual' } } | undefined;
        if (useOcr) {
          try {
            const ocrRes = await fetch('/api/plan-import/ocr-scale', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source }),
            });
            const ocrPayload = await ocrRes.json();
            if (ocrRes.ok) ocr = ocrPayload;
          } catch {
            // OCR is best-effort for the local-ml path; fall back to manual scale.
          }
        }

        const result = localMlToReconstruction(boxes, source, ocr);
        setJob({
          id: crypto.randomUUID(),
          status: 'review',
          progress: 100,
          result,
          detectionSource: ocr ? 'local-ml-ocr' : 'local-ml',
        });
        setScale(result.scale.pixelsPerMeter);
        setAccepted(Object.fromEntries(result.detections.map((item) => [item.id, item.accepted !== false])));
        return;
      }

      const response = await fetch('/api/plan-import/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: {
            kind: file.type === 'application/pdf' ? 'pdf' : 'image',
            fileName: file.name,
            url: blobUrl,
            page: file.type === 'application/pdf' ? 1 : undefined,
            ...dimensions,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to begin reconstruction.');
      setJob({ ...payload, detectionSource: 'vlm' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!job?.result) return;
    try {
      const reviewed: ReconstructionResultV1 = {
        ...job.result,
        scale: { ...job.result.scale, pixelsPerMeter: scale, method: 'manual' },
        detections: job.result.detections.map((detection) => ({
          ...detection,
          accepted: accepted[detection.id] ?? detection.accepted !== false,
        })),
      };
      const imported = reconstructFloorPlan(reviewed);
      if (imported.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        throw new Error(imported.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message);
      }
      beginRedesign(imported.floorPlan);
      router.push('/editor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to apply reconstruction.');
    }
  };

  return (
    <main className="min-h-screen bg-[#f2efe7] px-6 py-8 text-[#26221a]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a806e]">Corbel Trace</p>
            <h1 className="mt-2 font-display text-3xl">Reconstruct a floor plan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f685b]">
              Upload a plan, review uncertain geometry, confirm its scale, then open an editable reconstruction in Corbel.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/editor')}><ArrowLeft /> Editor</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-2xl border border-[#d7d0c2] bg-white/80 shadow-sm">
            <div className="border-b border-[#e3ddd2] px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Source plan</h2>
                  <p className="mt-1 text-xs text-[#817969]">PNG, JPEG, WebP or PDF up to 50 MB</p>
                </div>
                <div className="flex shrink-0 rounded-full border border-[#d7d0c2] bg-[#f3efe7] p-0.5 text-xs">
                  <button
                    type="button"
                    disabled={busy || !!job}
                    onClick={() => setUseLocalMl(false)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      !useLocalMl ? 'bg-white text-[#26221a] shadow-sm' : 'text-[#817969]'
                    }`}
                  >
                    <Sparkles size={12} /> Cloud VLM
                  </button>
                  <button
                    type="button"
                    disabled={busy || !!job}
                    onClick={() => setUseLocalMl(true)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      useLocalMl ? 'bg-white text-[#26221a] shadow-sm' : 'text-[#817969]'
                    }`}
                  >
                    <Cpu size={12} /> Local YOLO
                  </button>
                </div>
              </div>

              {useLocalMl ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#f3efe7] px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-[#6f685b]">
                    <input
                      type="checkbox"
                      checked={useOcr}
                      disabled={busy || !!job}
                      onChange={(e) => setUseOcr(e.target.checked)}
                      className="accent-[#8a6b3f]"
                    />
                    <ScanText size={12} className="text-[#8a6b3f]" />
                    Run OCR + scale calibration (Gemini)
                  </label>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[#a39a89]">
                  Runs the full 6-stage detection pipeline server-side via the configured VLM provider.
                </p>
              )}
            </div>
            <div className="flex min-h-[520px] items-center justify-center bg-[#e9e4d9] p-5">
              {sourceUrl ? (
                file?.type === 'application/pdf' ? (
                  <object data={sourceUrl} type="application/pdf" className="h-[480px] w-full rounded-lg bg-white" />
                ) : (
                  <img src={sourceUrl} alt="Uploaded floor plan" className="max-h-[480px] max-w-full rounded-lg object-contain shadow-sm" />
                )
              ) : (
                <label className="flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#bdb3a2] bg-white/55 px-8 py-16 text-center transition hover:bg-white/80">
                  <FileImage className="h-8 w-8 text-[#8a6b3f]" />
                  <span className="mt-4 text-sm font-medium">Choose a floor-plan file</span>
                  <span className="mt-1 text-xs text-[#817969]">The original remains visible during review.</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setJob(null);
                      setSourceUrl(null);
                      setError(null);
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#d7d0c2] bg-white/80 p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Reconstruction</h2>
              {!job ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-[#f3efe7] px-3 py-3 text-xs text-[#6f685b]">
                    {file ? file.name : 'Select a source file to begin.'}
                  </div>
                  <Button className="w-full" disabled={!file || busy} onClick={submit}>
                    {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                    Upload and reconstruct
                  </Button>
                </div>
              ) : !job.result ? (
                <div className="mt-5">
                  <div className="flex items-center gap-2 text-sm"><Loader2 className="animate-spin" /> {stageLabel(job.progress)}</div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6dfd2]">
                    <div className="h-full bg-[#8a6b3f] transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[#817969]">Processing your floor plan through 6 detection stages.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-[#edf4ea] px-3 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-medium text-[#47633c]"><Check size={14} /> Ready for review</span>
                    <span className={`font-mono text-xs ${confidenceTone(job.result.overallConfidence)}`}>{Math.round(job.result.overallConfidence * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#a39a89]">
                    {job.detectionSource === 'vlm' ? <Sparkles size={11} /> : <Cpu size={11} />}
                    {sourceLabel[job.detectionSource ?? 'vlm']}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(detectionCounts).map(([kind, count]) => (
                      <div key={kind} className="rounded-lg bg-[#f3efe7] px-2 py-2 text-center">
                        <div className="font-mono text-sm">{count}</div>
                        <div className="text-[9px] uppercase tracking-wide text-[#817969]">{kind}</div>
                      </div>
                    ))}
                  </div>
                  <label className="block text-xs font-medium">
                    Scale calibration
                    <span className="ml-1 font-normal text-[#817969]">pixels per metre</span>
                    <Input className="mt-1.5" type="number" min={1} value={scale} onChange={(event) => setScale(Math.max(1, Number(event.target.value) || 1))} />
                    {job.result.scale.method === 'manual' && job.result.scale.confidence < 0.5 && (
                      <span className="mt-1.5 block text-[10px] font-normal text-[var(--editor-warning)]">
                        Not calibrated automatically — adjust this to match a known dimension on the plan.
                      </span>
                    )}
                  </label>
                </div>
              )}
            </section>

            {job?.result && (
              <section className="rounded-2xl border border-[#d7d0c2] bg-white/80 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Detection review</h2>
                  <span className="text-[10px] text-[#817969]">Lowest confidence first</span>
                </div>
                <div className="mt-3 max-h-64 space-y-1.5 overflow-auto pr-1">
                  {reviewDetections.map((detection) => (
                    <label key={detection.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-[#f6f2eb] px-3 py-2">
                      <input
                        type="checkbox"
                        checked={accepted[detection.id] ?? true}
                        onChange={(event) => setAccepted((current) => ({ ...current, [detection.id]: event.target.checked }))}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs capitalize">{detection.kind}</span>
                      <span className={`font-mono text-[10px] ${confidenceTone(detection.confidence)}`}>{Math.round(detection.confidence * 100)}%</span>
                    </label>
                  ))}
                </div>
                <Button className="mt-4 w-full" onClick={apply}><WandSparkles /> Start redesign</Button>
              </section>
            )}

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
          </aside>
        </div>
      </div>
    </main>
  );
}
