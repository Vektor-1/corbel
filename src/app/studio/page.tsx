'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CanvasEditor } from '@/components/2d/CanvasEditor';
import { FloorPlanRenderer } from '@/components/3d/FloorPlanRenderer';
import { useFloorPlanStore, useCurrentFloor } from '@/lib/store/floorPlanStore';
import { StudioToolbar } from '@/components/studio/StudioToolbar';
import { TraceStatus } from '@/components/studio/TraceStatus';
import { ValidationFeedback } from '@/components/studio/ValidationFeedback';
import { ExportGuidanceModal, type ExportPayload } from '@/components/studio/ExportGuidanceModal';
import { createTraceFixtureFloor, traceFixtureLibrary } from '@/lib/testing/traceFixture';
import { createFloorPlanJsonExport, createReconstructionPrompt, downloadFloorPlanJsonExport, exportFileName } from '@/lib/export/floorPlanJson';
import { createEmptyTraceFloor, parseImageBaseline, type ImageBaseline } from '@/lib/trace/imageBaseline';

// The editor for the Canonical schema (Draft -> lift -> Canonical), fed by
// the /upload pipeline. Distinct from the legacy /editor route, which still
// runs on the older FloorPlan/designStore schema.
function StudioContent() {
  const router = useRouter();
  const params = useSearchParams();
  const isTraceMode = params.get('mode') === 'trace';

  const floor = useCurrentFloor();
  const ghostFloor = useFloorPlanStore((s) => s.ghostFloor);
  const loadFloor = useFloorPlanStore((s) => s.loadFloor);
  const freezeAsGhost = useFloorPlanStore((s) => s.freezeAsGhost);
  const setGhostOpacity = useFloorPlanStore((s) => s.setGhostOpacity);
  const library = useFloorPlanStore((s) => s.library);
  const validationIssues = useFloorPlanStore((s) => s.validationIssues);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [imageBaseline, setImageBaseline] = useState<ImageBaseline | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_TEST_MODE !== '1' || params.get('fixture') !== 'trace-4' || floor) return;
    loadFloor(createTraceFixtureFloor(), traceFixtureLibrary);
    freezeAsGhost();
    setGhostOpacity(0.5);
  }, [floor, freezeAsGhost, loadFloor, params, setGhostOpacity]);

  useEffect(() => {
    const baseline = parseImageBaseline(params);
    setImageBaseline(baseline);
    if (floor || !baseline) return;
    loadFloor(createEmptyTraceFloor(), library);
  }, [floor, library, loadFloor, params]);

  const createExportPayload = useCallback((): ExportPayload => {
    if (!floor) throw new Error('Cannot export without a loaded floor.');
    const exported = createFloorPlanJsonExport({ floor, library, validationIssues });
    return {
      exported,
      filename: exportFileName(floor.id),
      prompt: createReconstructionPrompt(exported),
    };
  }, [floor, library, validationIssues]);

  if (!floor) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f2efe7] text-[#26221a]">
        <p className="text-sm text-[#6f685b]">No plan loaded yet.</p>
        <Button onClick={() => router.push('/upload')}>Go to upload</Button>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-[#f2efe7] text-[#26221a]">
      <div className="flex items-center justify-between border-b border-[#d7d0c2] bg-white/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
            <ArrowLeft size={14} /> Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsExportModalOpen(true)}>
            <Download size={14} /> Export
          </Button>
          <span className="text-xs font-medium">
            {isTraceMode ? 'Trace-to-Learn' : 'Studio'}
          </span>
          {isTraceMode && ghostFloor && (
            <span className="rounded-full bg-[#f3efe7] px-2 py-0.5 text-[10px] text-[#8a6b3f]">
              Redesign against the frozen baseline (shown ghosted)
            </span>
          )}
        </div>
        <StudioToolbar isTraceMode={isTraceMode && Boolean(ghostFloor)} />
      </div>
      <TraceStatus />
      <ValidationFeedback />
      <ExportGuidanceModal
        createPayload={createExportPayload}
        download={downloadFloorPlanJsonExport}
        onOpenChange={setIsExportModalOpen}
        open={isExportModalOpen}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-auto border-r border-[#d7d0c2]">
          <CanvasEditor
            width={800}
            height={800}
            ghostImageUrl={imageBaseline?.url}
            ghostImageBlur={imageBaseline?.blur}
          />
        </div>
        <div data-testid="floor-plan-3d" className="w-1/2">
          <FloorPlanRenderer />
        </div>
      </div>
    </main>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioContent />
    </Suspense>
  );
}
