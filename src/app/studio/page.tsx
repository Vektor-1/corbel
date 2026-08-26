'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CanvasEditor } from '@/components/2d/CanvasEditor';
import { FloorPlanRenderer } from '@/components/3d/FloorPlanRenderer';
import { useFloorPlanStore, useCurrentFloor, useSelection } from '@/lib/store/floorPlanStore';
import { StudioToolbar } from '@/components/studio/StudioToolbar';
import { RightPanel } from '@/components/studio/RightPanel';
import { TraceStatus } from '@/components/studio/TraceStatus';
import { ValidationFeedback } from '@/components/studio/ValidationFeedback';
import { TraceToLearnView } from '@/components/studio/TraceToLearnView';
import { ExportGuidanceModal, type ExportPayload } from '@/components/studio/ExportGuidanceModal';
import { createTraceFixtureFloor, traceFixtureLibrary } from '@/lib/testing/traceFixture';
import { createFloorPlanJsonExport, createReconstructionPrompt, downloadFloorPlanJsonExport, exportFileName } from '@/lib/export/floorPlanJson';
import { createEmptyTraceFloor, parseImageBaseline, type ImageBaseline } from '@/lib/trace/imageBaseline';

type ViewMode = '2d' | '3d' | 'split';

// The editor for the Canonical schema (Draft -> lift -> Canonical), fed by
// the /upload pipeline. Distinct from the legacy /editor route, which still
// runs on the older FloorPlan/designStore schema.
function StudioContent() {
  const router = useRouter();
  const params = useSearchParams();
  const isTraceMode = params.get('mode') === 'trace';
  const hasLoadedFixture = useRef(false);

  const floor = useCurrentFloor();
  const selection = useSelection();
  const ghostFloor = useFloorPlanStore((s) => s.ghostFloor);
  const loadFloor = useFloorPlanStore((s) => s.loadFloor);
  const freezeAsGhost = useFloorPlanStore((s) => s.freezeAsGhost);
  const setGhostOpacity = useFloorPlanStore((s) => s.setGhostOpacity);
  const library = useFloorPlanStore((s) => s.library);
  const validationIssues = useFloorPlanStore((s) => s.validationIssues);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [imageBaseline, setImageBaseline] = useState<ImageBaseline | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

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

  useEffect(() => {
    if (hasLoadedFixture.current || floor) return;
    hasLoadedFixture.current = true;
    loadFloor(createTraceFixtureFloor(), traceFixtureLibrary);
  }, [floor, loadFloor]);

  const createExportPayload = useCallback((): ExportPayload => {
    if (!floor) throw new Error('Cannot export without a loaded floor.');
    const exported = createFloorPlanJsonExport({ floor, library, validationIssues });
    return {
      exported,
      filename: exportFileName(floor.id),
      prompt: createReconstructionPrompt(exported),
    };
  }, [floor, library, validationIssues]);


  return (
    <main className="corbel-editor flex h-screen flex-col bg-[#f2efe7] text-[#26221a]" suppressHydrationWarning>
      <div className="flex items-center justify-between border-b border-[#d7d0c2] bg-white/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
            <ArrowLeft size={14} /> Upload
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsExportModalOpen(true)}>
            <Download size={14} /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFeedbackOpen(true)}>
            <MessageSquare size={14} /> Feedback
          </Button>
          <div className="flex items-center rounded-md border border-[#d7d0c2] p-0.5" aria-label="Viewport mode">
            {(['2d', '3d', 'split'] as const).map((mode) => (
              <Button
                aria-pressed={viewMode === mode}
                className="h-7 px-2 text-xs"
                key={mode}
                onClick={() => setViewMode(mode)}
                size="sm"
                variant={viewMode === mode ? 'secondary' : 'ghost'}
              >
                {mode === 'split' ? 'Split' : mode.toUpperCase()}
              </Button>
            ))}
          </div>
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
      {isFeedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-[#d7d0c2] bg-white p-5 shadow-lg text-sm">
            <h3 className="text-base font-semibold mb-2 text-[#26221a]">Send Beta Feedback</h3>
            <p className="text-xs text-[#6f685b] mb-4">
              Help us improve Corbel. Did the AI miss a door, or is a rule wrong?
            </p>
            <textarea
              className="w-full min-h-[100px] p-2 border border-[#d7d0c2] rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#8a6b3f] mb-4 resize-none text-[#26221a]"
              placeholder="Describe your feedback or issue..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              disabled={feedbackSubmitting}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsFeedbackOpen(false);
                  setFeedbackText("");
                }}
                disabled={feedbackSubmitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!feedbackText.trim()) return;
                  setFeedbackSubmitting(true);
                  // Telemetry Hook
                  console.log("[TELEMETRY] user_feedback_submitted", {
                    floorId: floor?.id,
                    feedback: feedbackText.trim(),
                    timestamp: new Date().toISOString(),
                  });
                  // Simulate net delay/send
                  await new Promise((resolve) => setTimeout(resolve, 600));
                  setFeedbackSubmitting(false);
                  setIsFeedbackOpen(false);
                  setFeedbackText("");
                  toast.success("Thank you for your feedback!");
                }}
                disabled={!feedbackText.trim() || feedbackSubmitting}
              >
                {feedbackSubmitting ? "Sending..." : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden" suppressHydrationWarning>
        {viewMode !== '3d' && (
          <div className="flex min-w-0 flex-1 overflow-hidden border-r border-[#d7d0c2]">
            <div className="min-w-0 flex-1 overflow-hidden">
              <CanvasEditor
                width={800}
                height={720}
                ghostImageUrl={imageBaseline?.url}
                ghostImageBlur={imageBaseline?.blur}
              />
            </div>
            {isTraceMode && ghostFloor ? (
              <TraceToLearnView
                baseline={ghostFloor}
                redesign={floor}
                onAccept={() => router.push('/projects')}
              />
            ) : (
              <RightPanel
                selectedElementId={selection.selectedElementId}
                selectedElementKind={selection.selectedElementKind}
              />
            )}
          </div>
        )}
        {viewMode !== '2d' && (
          <div data-testid="floor-plan-3d" className="flex-1 min-w-0">
            <FloorPlanRenderer />
          </div>
        )}
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
