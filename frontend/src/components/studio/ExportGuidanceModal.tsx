"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CheckCircle2, Clipboard, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CorbelFloorPlanJsonExport } from "@/lib/export/floorPlanJson";

type ExportStage = "preparing" | "validating" | "creating" | "ready";

const stages: Array<{ id: ExportStage; label: string; progress: number }> = [
  { id: "preparing", label: "Preparing plan", progress: 25 },
  { id: "validating", label: "Validating export", progress: 50 },
  { id: "creating", label: "Creating download", progress: 75 },
  { id: "ready", label: "Ready", progress: 100 },
];

export interface ExportPayload {
  exported: CorbelFloorPlanJsonExport;
  filename: string;
  prompt: string;
}

interface ExportGuidanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createPayload: () => ExportPayload;
  download: (exported: CorbelFloorPlanJsonExport, filename: string) => void;
}

const pause = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

/** One accessible dialog for export progress, download, and AI reconstruction guidance. */
export function ExportGuidanceModal({ open, onOpenChange, createPayload, download }: ExportGuidanceModalProps) {
  const [stage, setStage] = useState<ExportStage>("preparing");
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const processing = stage !== "ready";
  const currentStage = stages.find((item) => item.id === stage) ?? stages[0];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const runExport = async () => {
      setStage("preparing");
      setPayload(null);
      await pause(300);
      if (cancelled) return;

      const nextPayload = createPayload();
      setStage("validating");
      await pause(300);
      if (cancelled) return;

      setStage("creating");
      download(nextPayload.exported, nextPayload.filename);
      await pause(300);
      if (cancelled) return;

      setPayload(nextPayload);
      setStage("ready");
    };

    void runExport();
    return () => { cancelled = true; };
  }, [createPayload, download, open]);

  const copyPrompt = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.prompt);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Could not copy the prompt. Select the text and copy it manually.");
    }
  };

  return (
    <Dialog.Root
      open={open}
      modal
      disablePointerDismissal={processing}
      onOpenChange={(nextOpen) => {
        if (!processing) onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup className="w-full max-w-2xl rounded-xl border border-[#d7d0c2] bg-white p-6 shadow-2xl outline-none">
            <Dialog.Title className="text-lg font-semibold text-[#26221a]">
              {processing ? "Exporting your plan" : "Your plan is ready to reconstruct"}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-[#6f685b]">
              {processing
                ? "Corbel is preparing a portable, AI-ready floor-plan export."
                : "Attach the downloaded JSON and copy this prompt into another AI tool."}
            </Dialog.Description>

            {processing ? (
              <div className="mt-6" aria-live="polite">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-[#26221a]"><LoaderCircle className="size-4 animate-spin" /> {currentStage.label}</span>
                  <span>{currentStage.progress}%</span>
                </div>
                <div
                  aria-label="Export progress"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={currentStage.progress}
                  aria-valuetext={currentStage.label}
                  className="h-2 overflow-hidden rounded-full bg-[#eee8dd]"
                  role="progressbar"
                >
                  <div className="h-full bg-[#255f85] transition-all duration-300" style={{ width: `${currentStage.progress}%` }} />
                </div>
                <ol className="mt-4 space-y-2 text-sm text-[#6f685b]">
                  {stages.map((item) => {
                    const complete = stages.findIndex((candidate) => candidate.id === item.id) < stages.findIndex((candidate) => candidate.id === stage);
                    const active = item.id === stage;
                    return <li key={item.id} className={active ? "font-medium text-[#26221a]" : ""}>{complete ? "✓" : "○"} {item.label}</li>;
                  })}
                </ol>
              </div>
            ) : payload ? (
              <div className="mt-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" /> Download started: {payload.filename}</div>
                <label htmlFor="reconstruction-prompt" className="text-sm font-medium text-[#26221a]">Prompt for another AI tool</label>
                <textarea
                  id="reconstruction-prompt"
                  readOnly
                  value={payload.prompt}
                  className="mt-2 h-56 w-full resize-y rounded-lg border border-[#d7d0c2] bg-[#faf8f3] p-3 font-mono text-xs leading-5 text-[#26221a]"
                />
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => download(payload.exported, payload.filename)}><Download /> Download again</Button>
                  <Button autoFocus onClick={() => void copyPrompt()}><Clipboard /> Copy prompt</Button>
                  <Dialog.Close render={<Button variant="outline">Done</Button>} />
                </div>
              </div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
