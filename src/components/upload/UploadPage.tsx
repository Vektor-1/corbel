'use client';

/**
 * Upload page for Week 4: a single redesigned entry point covering both
 * upload flows.
 *
 * Reconstruct  — photo of a plan → editable Canonical.Floor loaded live.
 * Trace-to-Learn — photo of a baseline → frozen ghost, then the editor opens
 *                  in trace mode so the user redesigns against it.
 *
 * Both flows share the same P1–P6 pipeline (see importPipeline.ts); only what
 * happens after Accept differs (loadFloor vs. loadFloor + freezeAsGhost).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import {
  ArrowLeft,
  Check,
  FileImage,
  Loader2,
  Route as TraceIcon,
  Sparkles,
  Upload as UploadIcon,
  WandSparkles,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useFloorPlanStore } from '@/lib/store/floorPlanStore';
import { Draft } from '@/types/schema';
import {
  applyDraftOverrides,
  runImportPipeline,
  STAGE_DEFS,
  WALL_CONFIDENCE_THRESHOLD,
  OPENING_CONFIDENCE_THRESHOLD,
  type StageProgress,
} from '@/lib/services/importPipeline';
import { liftFloorPlan } from '@/lib/refinement/lift';

type Mode = 'reconstruct' | 'trace';
type Phase = 'idle' | 'uploading' | 'processing' | 'review' | 'failed';

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

const confidenceTone = (confidence: number, lowThreshold: number) =>
  confidence < lowThreshold * 0.7
    ? 'text-red-600'
    : confidence < lowThreshold
      ? 'text-orange-500'
      : 'text-emerald-600';

const confidenceBg = (confidence: number, lowThreshold: number) =>
  confidence < lowThreshold * 0.7
    ? 'bg-red-50 border-red-200'
    : confidence < lowThreshold
      ? 'bg-orange-50 border-orange-200'
      : 'bg-[#f6f2eb] border-transparent';

type Selection = { kind: 'wall' | 'opening'; id: string } | null;

export default function UploadPage() {
  const router = useRouter();
  const loadFloor = useFloorPlanStore((s) => s.loadFloor);
  const freezeAsGhost = useFloorPlanStore((s) => s.freezeAsGhost);
  const library = useFloorPlanStore((s) => s.library);

  const [mode, setMode] = useState<Mode>('reconstruct');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState<StageProgress>(STAGE_DEFS[0]);
  const [draft, setDraft] = useState<Draft.FloorPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [accepted, setAccepted] = useState(false);
  const dropRef = useRef<HTMLLabelElement | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl(null);
    setPhase('idle');
    setDraft(null);
    setWarnings([]);
    setError(null);
    setSelection(null);
    setAccepted(false);
    setStage(STAGE_DEFS[0]);
  }, []);

  const pickFile = useCallback((picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setPhase('idle');
    setDraft(null);
    setError(null);
    setAccepted(false);
  }, []);

  const run = useCallback(async () => {
    if (!file) return;
    setError(null);
    setPhase('uploading');
    try {
      let imageUrl: string | undefined;
      try {
        imageUrl = await uploadImage(file);
      } catch {
        // Non-fatal: pipeline degrades to a default scale without OCR.
        imageUrl = undefined;
      }

      setPhase('processing');
      const result = await runImportPipeline(
        file,
        { imageUrl, useOcr: true },
        (progress) => setStage(progress)
      );
      setDraft(result.draft);
      setWarnings(result.warnings);
      setPhase('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reconstruction failed.');
      setPhase('failed');
    }
  }, [file]);

  const lowConfidenceWalls = useMemo(
    () => (draft ? draft.walls.filter((w) => w.confidence < WALL_CONFIDENCE_THRESHOLD) : []),
    [draft]
  );
  const lowConfidenceOpenings = useMemo(
    () => (draft ? draft.openings.filter((o) => o.confidence < OPENING_CONFIDENCE_THRESHOLD) : []),
    [draft]
  );

  const selectedWall = useMemo(
    () => (selection?.kind === 'wall' ? draft?.walls.find((w) => w.id === selection.id) ?? null : null),
    [draft, selection]
  );
  const selectedOpening = useMemo(
    () => (selection?.kind === 'opening' ? draft?.openings.find((o) => o.id === selection.id) ?? null : null),
    [draft, selection]
  );

  const updateWallOverride = useCallback((wallId: string, thickness: number) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        walls: current.walls.map((w) => (w.id === wallId ? { ...w, overrideThickness: thickness } : w)),
      };
    });
  }, []);

  const updateOpeningOverride = useCallback(
    (openingId: string, field: 'overrideWidth' | 'overrideHeight', value: number) => {
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          openings: current.openings.map((o) => (o.id === openingId ? { ...o, [field]: value } : o)),
        };
      });
    },
    []
  );

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

  const accept = useCallback(() => {
    if (!draft) return;
    try {
      const finalDraft = applyDraftOverrides(draft);
      const canonical = liftFloorPlan(finalDraft);
      if (canonical.rooms.length === 0 && canonical.walls.length > 0) {
        setWarnings((w) => [...w, 'No enclosed rooms detected after corrections — check wall connectivity in the editor.']);
      }
      loadFloor(canonical, library);
      if (mode === 'trace') {
        freezeAsGhost();
      }
      setAccepted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to apply corrections.');
    }
  }, [draft, library, loadFloor, freezeAsGhost, mode]);

  const openEditor = useCallback(() => {
    router.push(mode === 'trace' ? '/studio?mode=trace' : '/studio');
  }, [router, mode]);

  return (
    <main className="min-h-screen bg-[#f2efe7] px-6 py-8 text-[#26221a]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a806e]">Corbel Import</p>
            <h1 className="mt-2 font-display text-3xl">Upload a floor plan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f685b]">
              Reconstruct a photo into an editable plan, or bring in a baseline to trace against.
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
              { id: 'reconstruct' as const, label: 'Reconstruct', icon: Sparkles, desc: 'Turn a hand-drawn or printed plan into an editable model.' },
              { id: 'trace' as const, label: 'Trace-to-Learn', icon: TraceIcon, desc: 'Import a reference plan, freeze it, then redesign against it.' },
            ]
          ).map(({ id, label, icon: Icon, desc }) => (
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
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Source + preview */}
          <section className="overflow-hidden rounded-2xl border border-[#d7d0c2] bg-white/80 shadow-sm">
            <div className="border-b border-[#e3ddd2] px-5 py-4">
              <h2 className="text-sm font-semibold">Source photo</h2>
              <p className="mt-1 text-xs text-[#817969]">
                {mode === 'reconstruct'
                  ? 'A hand-drawn or printed floor plan to detect and rebuild.'
                  : 'A reference/baseline plan the editor will trace against.'}
              </p>
            </div>
            <div className="flex min-h-[520px] items-center justify-center bg-[#e9e4d9] p-5">
              {previewUrl ? (
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
              ) : (
                <label
                  ref={dropRef}
                  {...dropZoneProps}
                  className="flex w-full max-w-lg cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#bdb3a2] bg-white/55 px-8 py-16 text-center transition hover:bg-white/80"
                >
                  <FileImage className="h-8 w-8 text-[#8a6b3f]" />
                  <span className="mt-4 text-sm font-medium">Drag and drop, or click to choose a file</span>
                  <span className="mt-1 text-xs text-[#817969]">PNG, JPEG, or WebP</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          </section>

          {/* Pipeline / review / correction */}
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#d7d0c2] bg-white/80 p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Reconstruction pipeline</h2>

              {phase === 'idle' && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-[#f3efe7] px-3 py-3 text-xs text-[#6f685b]">
                    {file ? file.name : 'Select a source file to begin.'}
                  </div>
                  <Button className="w-full" disabled={!file} onClick={run}>
                    <UploadIcon /> Upload and reconstruct
                  </Button>
                </div>
              )}

              {(phase === 'uploading' || phase === 'processing') && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    {phase === 'uploading' ? 'Uploading image…' : stage.label}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6dfd2]">
                    <div
                      className="h-full bg-[#8a6b3f] transition-all"
                      style={{ width: `${phase === 'uploading' ? 4 : stage.percent}%` }}
                    />
                  </div>
                  <ol className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                    {STAGE_DEFS.map((s) => (
                      <li
                        key={s.stage}
                        className={`rounded-full px-2 py-0.5 ${
                          phase === 'processing' && stage.percent >= s.percent
                            ? 'bg-[#8a6b3f] text-white'
                            : 'bg-[#f3efe7] text-[#a39a89]'
                        }`}
                      >
                        {s.stage}
                      </li>
                    ))}
                  </ol>
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

              {phase === 'review' && draft && !accepted && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-[#edf4ea] px-3 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-medium text-[#47633c]">
                      <Check size={14} /> Ready for review
                    </span>
                    <span className="font-mono text-xs text-[#47633c]">{Math.round(draft.overallConfidence * 100)}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-[#f3efe7] px-2 py-2">
                      <div className="font-mono text-sm">{draft.walls.length}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[#817969]">walls</div>
                    </div>
                    <div className="rounded-lg bg-[#f3efe7] px-2 py-2">
                      <div className="font-mono text-sm">{draft.openings.length}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[#817969]">openings</div>
                    </div>
                    <div className="rounded-lg bg-[#f3efe7] px-2 py-2">
                      <div className="font-mono text-sm">{draft.labels.length}</div>
                      <div className="text-[9px] uppercase tracking-wide text-[#817969]">labels</div>
                    </div>
                  </div>

                  {(lowConfidenceWalls.length > 0 || lowConfidenceOpenings.length > 0) && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
                      {lowConfidenceWalls.length} wall(s) below {Math.round(WALL_CONFIDENCE_THRESHOLD * 100)}% and{' '}
                      {lowConfidenceOpenings.length} opening(s) below {Math.round(OPENING_CONFIDENCE_THRESHOLD * 100)}% confidence
                      — review below before accepting.
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-[#a06a2e]">
                      {warnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}

                  <Button className="w-full" onClick={accept}>
                    <WandSparkles /> {mode === 'trace' ? 'Accept and freeze as baseline' : 'Accept reconstruction'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={reset}>
                    Reject and start over
                  </Button>
                </div>
              )}

              {accepted && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg bg-[#edf4ea] px-3 py-2.5 text-xs font-medium text-[#47633c]">
                    {mode === 'trace'
                      ? 'Baseline frozen as ghost. Now redesign against it.'
                      : 'Loaded into the editor store.'}
                  </div>
                  <Button className="w-full" onClick={openEditor}>
                    {mode === 'trace' ? 'Open editor in Trace-to-Learn mode' : 'Open editor'}
                  </Button>
                </div>
              )}
            </section>

            {/* Manual correction panel */}
            {phase === 'review' && draft && !accepted && (
              <section className="rounded-2xl border border-[#d7d0c2] bg-white/80 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Detection review</h2>
                  <span className="text-[10px] text-[#817969]">Lowest confidence first</span>
                </div>

                <div className="mt-3 max-h-64 space-y-1.5 overflow-auto pr-1">
                  {[...draft.walls]
                    .sort((a, b) => a.confidence - b.confidence)
                    .map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelection({ kind: 'wall', id: w.id })}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${confidenceBg(
                          w.confidence,
                          WALL_CONFIDENCE_THRESHOLD
                        )} ${selection?.id === w.id ? 'ring-1 ring-[#8a6b3f]' : ''}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs">Wall {w.id}</span>
                        <span className={`font-mono text-[10px] ${confidenceTone(w.confidence, WALL_CONFIDENCE_THRESHOLD)}`}>
                          {Math.round(w.confidence * 100)}%
                        </span>
                      </button>
                    ))}
                  {[...draft.openings]
                    .sort((a, b) => a.confidence - b.confidence)
                    .map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSelection({ kind: 'opening', id: o.id })}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${confidenceBg(
                          o.confidence,
                          OPENING_CONFIDENCE_THRESHOLD
                        )} ${selection?.id === o.id ? 'ring-1 ring-[#8a6b3f]' : ''}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs capitalize">{o.kind} {o.id}</span>
                        <span className={`font-mono text-[10px] ${confidenceTone(o.confidence, OPENING_CONFIDENCE_THRESHOLD)}`}>
                          {Math.round(o.confidence * 100)}%
                        </span>
                      </button>
                    ))}
                </div>

                {selectedWall && (
                  <div className="mt-4 space-y-2 rounded-lg bg-[#f6f2eb] p-3">
                    <p className="text-[11px] font-medium">Wall {selectedWall.id}</p>
                    <label className="block text-[11px]">
                      Thickness (mm)
                      <Input
                        className="mt-1"
                        type="number"
                        min={50}
                        value={selectedWall.overrideThickness ?? Math.round(selectedWall.thickness)}
                        onChange={(e) => updateWallOverride(selectedWall.id, Math.max(50, Number(e.target.value) || 50))}
                      />
                    </label>
                  </div>
                )}

                {selectedOpening && (
                  <div className="mt-4 space-y-2 rounded-lg bg-[#f6f2eb] p-3">
                    <p className="text-[11px] font-medium capitalize">{selectedOpening.kind} {selectedOpening.id}</p>
                    <label className="block text-[11px]">
                      Width (mm)
                      <Input
                        className="mt-1"
                        type="number"
                        min={300}
                        value={selectedOpening.overrideWidth ?? Math.round(selectedOpening.width)}
                        onChange={(e) => updateOpeningOverride(selectedOpening.id, 'overrideWidth', Math.max(300, Number(e.target.value) || 300))}
                      />
                    </label>
                    <label className="block text-[11px]">
                      Height (mm)
                      <Input
                        className="mt-1"
                        type="number"
                        min={300}
                        value={selectedOpening.overrideHeight ?? Math.round(selectedOpening.height)}
                        onChange={(e) => updateOpeningOverride(selectedOpening.id, 'overrideHeight', Math.max(300, Number(e.target.value) || 300))}
                      />
                    </label>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
