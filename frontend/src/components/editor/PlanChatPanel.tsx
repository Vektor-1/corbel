'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Download, FileImage, Loader2, Maximize2, Minimize2, Plus, Sparkles, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDesignStore } from '@/store/designStore';
import { reconstructFloorPlan } from '@/lib/plan-import/reconstruct';
import { applyPlanOperationsToFloorPlan } from '@/lib/plan-chat/apply';
import { waitForHostedReconstruction } from '@/lib/services/hostedImport';
import { uploadPlanReference } from '@/lib/uploads/planUpload';
import { validateUploadFile } from '@/lib/uploads/uploadPolicy';
import type { ImportSource, ReconstructionResultV1 } from '@/lib/plan-import/types';
import type { FloorPlan } from '@/types/design';
import type { PlanChatOperation, PlanChatResponse, PlanChatSelection, PlanChatTodo } from '@/lib/plan-chat/types';

type PendingChange =
  | { kind: 'import'; floorPlan: FloorPlan; before: FloorPlan | null; message: string }
  | { kind: 'combined'; floorPlan: FloorPlan; before: FloorPlan | null; response: PlanChatResponse }
  | { kind: 'operations'; response: PlanChatResponse };

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

function planCounts(plan: FloorPlan | null) {
  return {
    walls: plan?.walls.length ?? 0,
    rooms: plan?.rooms.length ?? 0,
    doors: plan?.doors.length ?? 0,
    windows: plan?.windows.length ?? 0,
  };
}

function importDiff(before: FloorPlan | null, after: FloorPlan) {
  const previous = planCounts(before);
  const next = planCounts(after);
  return [
    'Walls: ' + previous.walls + ' → ' + next.walls,
    'Rooms: ' + previous.rooms + ' → ' + next.rooms,
    'Doors: ' + previous.doors + ' → ' + next.doors,
    'Windows: ' + previous.windows + ' → ' + next.windows,
  ];
}

function operationLabel(operation: PlanChatOperation) {
  switch (operation.type) {
    case 'update-wall': return 'Update wall ' + operation.id;
    case 'update-door': return 'Update door ' + operation.id;
    case 'update-window': return 'Update window ' + operation.id;
    case 'update-room': return 'Update room ' + operation.id;
    case 'add-wall': return 'Add wall ' + operation.wall.id;
    case 'add-door': return 'Add door ' + operation.door.id;
    case 'add-window': return 'Add window ' + operation.window.id;
    case 'set-scale': return 'Set scale to ' + operation.scale;
    case 'rename-plan': return 'Rename plan to “' + operation.name + '”';
    case 'delete-element': return 'Delete ' + operation.element + ' ' + operation.id;
  }
}

function operationKey(operation: PlanChatOperation, index: number): string {
  return index + ':' + operation.type + ':' + ('id' in operation ? operation.id : operation.type);
}

async function requestStream(
  message: string,
  context: { floorPlan: FloorPlan | null; selectedElementIds: string[]; selectedElements: PlanChatSelection[]; viewMode: '2d' | '3d' | 'split'; validationResults: ReturnType<typeof useDesignStore.getState>['validationResults']; canvasSnapshot?: string },
  onStatus: (message: string) => void,
  onToken: (token: string) => void,
): Promise<PlanChatResponse> {
  const response = await fetch('/api/editor/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'Plan change failed.');
  }
  if (!response.body) throw new Error('The AI response stream was unavailable.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const rawEvent of events) {
      const line = rawEvent.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as { type: string; message?: string; token?: string; response?: PlanChatResponse };
      if (payload.type === 'status' && payload.message) onStatus(payload.message);
      if (payload.type === 'token' && payload.token) onToken(payload.token);
      if (payload.type === 'error') throw new Error(payload.message || 'The AI plan assistant is unavailable.');
      if (payload.type === 'final' && payload.response) return payload.response;
    }
    if (chunk.done) break;
  }
  throw new Error('The AI response ended before a final result was received.');
}

function streamedReplyPreview(raw: string): string {
  const match = raw.match(/"reply"\s*:\s*"((?:\\\\.|[^"\\\\])*)/);
  if (!match) return 'Working…';
  try {
    return JSON.parse('"' + match[1] + '"');
  } catch {
    return 'Working…';
  }
}

async function createImportSource(file: File, url: string): Promise<ImportSource> {
  let width = 1;
  let height = 1;
  if (file.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  }
  return {
    kind: file.type === 'application/pdf' ? 'pdf' : 'image',
    fileName: file.name,
    url,
    width,
    height,
    page: file.type === 'application/pdf' ? 1 : undefined,
  };
}

function operationTargetsExistingPlan(operations: PlanChatOperation[], plan: FloorPlan | null): boolean {
  if (!plan) return false;
  const ids = new Set([
    ...plan.walls.map((item) => item.id),
    ...plan.rooms.map((item) => item.id),
    ...plan.doors.map((item) => item.id),
    ...plan.windows.map((item) => item.id),
  ]);
  return operations.every((operation) => {
    switch (operation.type) {
      case 'update-wall':
      case 'update-door':
      case 'update-window':
      case 'update-room':
      case 'delete-element':
        return ids.has(operation.id);
      case 'add-door':
        return plan.walls.some((wall) => wall.id === operation.door.wallId);
      case 'add-window':
        return plan.walls.some((wall) => wall.id === operation.window.wallId);
      default:
        return true;
    }
  });
}

function progressTodos(status: string): PlanChatTodo[] {
  const value = status.toLowerCase();
  const phase = value.includes('upload') || value.includes('reconstruct') || value.includes('read') ? 0
    : value.includes('inspect') || value.includes('analy') || value.includes('selection') ? 1
      : value.includes('valid') || value.includes('review') || value.includes('prepar') ? 3 : 2;
  const titles = ['Read the plan context', 'Inspect the selected geometry', 'Draft structured plan changes', 'Validate a reviewable proposal'];
  return titles.map((title, index) => ({
    id: 'live-' + index,
    title,
    status: index < phase ? 'completed' : index === phase ? 'in_progress' : 'pending',
  }));
}

export function PlanChatPanel({ getCanvasSnapshot }: { getCanvasSnapshot?: () => string | undefined }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [canUndoChat, setCanUndoChat] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [liveTodos, setLiveTodos] = useState<PlanChatTodo[]>([]);
  const [approvedOperationKeys, setApprovedOperationKeys] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floorPlan = useDesignStore((state) => state.floorPlan);
  const selectedElementIds = useDesignStore((state) => state.selectedElementIds);
  const viewMode = useDesignStore((state) => state.viewMode);
  const validationResults = useDesignStore((state) => state.validationResults);
  const beginImportedEdit = useDesignStore((state) => state.beginImportedEdit);
  const applyPlanOperations = useDesignStore((state) => state.applyPlanOperations);
  const setAiPreviewFloorPlan = useDesignStore((state) => state.setAiPreviewFloorPlan);
  const selectedElements = useMemo<PlanChatSelection[]>(() => {
    if (!floorPlan || selectedElementIds.length === 0) return [];
    const sources: PlanChatSelection[] = [
      ...floorPlan.walls.map((data) => ({ id: data.id, element: 'wall' as const, data })),
      ...floorPlan.doors.map((data) => ({ id: data.id, element: 'door' as const, data })),
      ...floorPlan.windows.map((data) => ({ id: data.id, element: 'window' as const, data })),
      ...floorPlan.rooms.map((data) => ({ id: data.id, element: 'room' as const, data })),
      ...floorPlan.objects.map((data) => ({ id: data.id, element: 'object' as const, data })),
    ];
    const selected = new Set(selectedElementIds);
    return sources.filter((item) => selected.has(item.id));
  }, [floorPlan, selectedElementIds]);

  useEffect(() => {
    fetch('/api/editor/generate')
      .then((response) => response.json())
      .then((data) => setAvailable(data.available === true))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handleIntent = (event: Event) => {
      const prompt = (event as CustomEvent<unknown>).detail;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      setOpen(true);
      setPrompt(prompt);
    };
    window.addEventListener('corbel:chat-intent', handleIntent);
    return () => window.removeEventListener('corbel:chat-intent', handleIntent);
  }, []);

  const selectFile = (candidate: File | null) => {
    if (!candidate) return;
    const result = validateUploadFile(candidate);
    if (!result.ok) {
      setFile(null);
      setStatus(result.message);
      toast.error(result.message);
      return;
    }
    setFile(candidate);
    setPlusMenuOpen(false);
    setStatus(candidate.name + ' ready to analyze.');
  };

  const addMessage = (role: ChatMessage['role'], text: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, text }]);
  };

  const submitPrompt = async () => {
    const message = prompt.trim();
    if (!message && !file) {
      setStatus('Describe a plan or attach a plan first.');
      return;
    }
    const requestMessage = message || 'Analyze this uploaded floor plan and summarize the detected geometry and uncertainty.';
    addMessage('user', file ? requestMessage + ' [' + file.name + ']' : requestMessage);
    setGenerating(true);
    setStreamingText('');
    setLiveTodos(progressTodos('Preparing a reviewable plan change…'));
    setStatus('Preparing a reviewable plan change…');
    try {
      let workingPlan = floorPlan;
      if (file) {
        setStatus('Uploading plan…');
        setLiveTodos(progressTodos('Uploading plan…'));
        const url = await uploadPlanReference(file);
        const source = await createImportSource(file, url);
        const result: ReconstructionResultV1 = await waitForHostedReconstruction(source, {
          onStatus: (providerStatus, progress) => {
            setStatus(providerStatus + ' (' + progress + '%)');
            setLiveTodos(progressTodos(providerStatus));
          },
        });
        const imported = reconstructFloorPlan(result);
        const blockingDiagnostic = imported.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
        if (blockingDiagnostic) throw new Error(blockingDiagnostic.message);
        workingPlan = imported.floorPlan;
      }

      if (!workingPlan) {
        const response = await fetch('/api/editor/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: requestMessage }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Plan generation failed.');
        const imported = reconstructFloorPlan(body as ReconstructionResultV1);
        setPending({ kind: 'import', floorPlan: imported.floorPlan, before: floorPlan, message: 'New plan generated and ready to review.' });
        setApprovedOperationKeys([]);
        setAiPreviewFloorPlan(imported.floorPlan);
        setStreamingText(null);
        setLiveTodos(progressTodos('Preparing a reviewable response…').map((item) => ({ ...item, status: 'completed' })));
      } else {
        if (!file && /^(undo|undo that|undo the last change|restore the previous change)[.!]?$/i.test(message) && canUndoChat) {
          (useDesignStore as any).temporal.getState().undo();
          setCanUndoChat(false);
          setStatus('Undid the last AI-applied change.');
          addMessage('assistant', 'Undid the last AI-applied change.');
          setPrompt('');
          return;
        }
        const result = await requestStream(requestMessage, {
          floorPlan: workingPlan,
          selectedElementIds,
          selectedElements,
          viewMode,
          validationResults,
          canvasSnapshot: getCanvasSnapshot?.(),
        }, (message) => {
          setStatus(message);
          setLiveTodos(progressTodos(message));
        }, (token) => {
          setStreamingText((current) => streamedReplyPreview((current ?? '') + token));
          setLiveTodos((current) => current.length > 0 ? current.map((item, index) => index === 2 ? { ...item, status: 'in_progress' } : item) : progressTodos('Drafting structured changes'));
        });
        if (result.operations.length > 0 && !operationTargetsExistingPlan(result.operations, workingPlan)) {
          throw new Error('The AI proposed an element that is not present in the current plan.');
        }
        setApprovedOperationKeys(result.operations.map(operationKey));
        setPending(file
          ? { kind: 'combined', floorPlan: workingPlan, before: floorPlan, response: result }
          : { kind: 'operations', response: result });
        setAiPreviewFloorPlan(
          file
            ? applyPlanOperationsToFloorPlan(workingPlan, result.operations)
            : applyPlanOperationsToFloorPlan(workingPlan, result.operations)
        );
        setStatus(result.reply);
        addMessage('assistant', result.reply);
        setLiveTodos(result.todo.length > 0 ? result.todo : progressTodos('Preparing a reviewable response…').map((item) => ({ ...item, status: 'completed' })));
        setStreamingText(null);
      }
      setPrompt('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The AI plan assistant is unavailable.';
      setStatus(message);
      toast.error(message);
      setStreamingText(null);
      setLiveTodos([]);
    } finally {
      setGenerating(false);
    }
  };

  const applyPending = () => {
    if (!pending) return;
    const operations = pending.kind === 'import'
      ? []
      : pending.response.operations.filter((operation, index) => approvedOperationKeys.includes(operationKey(operation, index)));
    if (pending.kind === 'import') {
      beginImportedEdit(pending.floorPlan);
      toast.success('Plan applied to the 2D editor.');
    } else if (pending.kind === 'combined') {
      beginImportedEdit(pending.floorPlan);
      applyPlanOperations(operations);
      toast.success(operations.length > 0 ? 'Uploaded plan and selected changes applied.' : 'Uploaded plan applied.');
    } else {
      applyPlanOperations(operations);
      toast.success('Selected AI plan changes applied.');
    }
    setPending(null);
    setAiPreviewFloorPlan(null);
    setFile(null);
    setLiveTodos([]);
    setApprovedOperationKeys([]);
    setCanUndoChat(true);
    setStatus('Change applied. You can undo it from the editor.');
  };

  const discardPending = () => {
    setPending(null);
    setAiPreviewFloorPlan(null);
    setApprovedOperationKeys([]);
    setStatus('Preview discarded.');
  };

  const toggleOperation = (index: number) => {
    if (!pending || pending.kind === 'import') return;
    const operation = pending.response.operations[index];
    const key = operationKey(operation, index);
    const nextKeys = approvedOperationKeys.includes(key)
      ? approvedOperationKeys.filter((item) => item !== key)
      : [...approvedOperationKeys, key];
    setApprovedOperationKeys(nextKeys);
    const basePlan = pending.kind === 'combined' ? pending.floorPlan : floorPlan;
    if (basePlan) {
      setAiPreviewFloorPlan(applyPlanOperationsToFloorPlan(
        basePlan,
        pending.response.operations.filter((item, itemIndex) => nextKeys.includes(operationKey(item, itemIndex))),
      ));
    }
  };

  const exportComplianceReport = async (format: 'markdown' | 'json' | 'csv' | 'html') => {
    if (!floorPlan) {
      setStatus('Create or upload a plan before exporting a report.');
      return;
    }
    try {
      setStatus('Preparing compliance report…');
      const response = await fetch('/api/editor/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorPlan, validationResults, format }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || 'Report export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (format === 'html') {
        const reportWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (!reportWindow) {
          const fallback = document.createElement('a');
          fallback.href = url;
          fallback.download = 'corbel-compliance-report.html';
          fallback.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setPlusMenuOpen(false);
        setStatus('Print-ready report opened. Use Print → Save as PDF.');
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      const extension = format === 'markdown' ? 'md' : format;
      anchor.download = (floorPlan.name || 'corbel-plan').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() + '-compliance-report.' + extension;
      anchor.click();
      URL.revokeObjectURL(url);
      setPlusMenuOpen(false);
      setStatus('Compliance report downloaded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report export failed.';
      setStatus(message);
      toast.error(message);
    }
  };

  if (!available) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="editor-chat-panel editor-island absolute bottom-14 left-4 z-20 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[11px] text-[var(--editor-text-subtle)] hover:bg-[var(--editor-surface-muted)]"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        AI plan assistant
      </button>
    );
  }

  return (
    <div className={'editor-chat-panel absolute bottom-14 left-4 z-20 flex flex-col transition-[width] duration-200 ' + (expanded ? 'w-[min(36rem,calc(100vw-2rem))]' : 'w-[min(26rem,calc(100vw-2rem))]')}>
      <div className="editor-island overflow-hidden rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-surface)] shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--editor-border)] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--editor-text)]">Corbel AI</p>
              <p className="truncate text-[10px] text-[var(--editor-text-subtle)]">{floorPlan ? floorPlan.name : 'Start a new floor plan'}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-md p-1.5 text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]" aria-label={expanded ? 'Collapse chat panel' : 'Expand chat panel'}>
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]" aria-label="Close chat panel">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className={(expanded ? 'max-h-80' : 'max-h-48') + ' overflow-y-auto px-3 py-3'}>
          {messages.length === 0 && !pending ? (
            <div className="py-3">
              <p className="text-sm font-medium text-[var(--editor-text)]">What would you like to change?</p>
              <p className="mt-1 text-[11px] leading-4 text-[var(--editor-text-subtle)]">Ask Corbel to create, inspect, or adjust the plan in the 2D editor.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(floorPlan ? (selectedElements.length > 0 ? ['Improve this selection', 'Make this selection more accessible', 'Explain this selection'] : ['Improve circulation', 'Create a room beside this area', 'Check current standards']) : ['Create a 3-bedroom plan', 'Create a compact studio', 'Upload a reference plan']).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      if (suggestion === 'Upload a reference plan') fileInputRef.current?.click();
                      else setPrompt(suggestion === 'Improve this selection' ? 'Improve the selected elements while preserving their role and nearby openings.' : suggestion === 'Make this selection more accessible' ? 'Review the selected elements for accessibility and propose only necessary changes.' : suggestion === 'Explain this selection' ? 'Explain the selected geometry, its dimensions, and any current validation findings. Do not apply changes.' : suggestion);
                    }}
                    className="rounded-full border border-[var(--editor-border)] px-2.5 py-1.5 text-[10px] text-[var(--editor-text-subtle)] hover:border-[var(--editor-accent)] hover:text-[var(--editor-text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.slice(-8).map((message) => (
                <div key={message.id} className={message.role === 'user' ? 'ml-8' : 'mr-8'}>
                  <div className={message.role === 'user' ? 'rounded-2xl rounded-br-md bg-[var(--editor-accent)] px-3 py-2 text-[11px] text-[var(--editor-canvas)]' : 'rounded-2xl rounded-bl-md bg-[var(--editor-surface-muted)] px-3 py-2 text-[11px] leading-4 text-[var(--editor-text)]'}>
                    {message.text}
                  </div>
                </div>
              ))}
              {streamingText && (
                <div className="mr-8">
                  <div className="rounded-2xl rounded-bl-md bg-[var(--editor-surface-muted)] px-3 py-2 text-[11px] leading-4 text-[var(--editor-text)]">
                    {streamingText}
                    <span className="ml-1 inline-block animate-pulse text-[var(--editor-accent-text)]">▍</span>
                  </div>
                </div>
              )}
              {generating && liveTodos.length > 0 && (
                <div className="mr-8 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-surface-muted)]/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--editor-text-muted)]">Working through the task</p>
                  <div className="mt-1.5 space-y-1">
                    {liveTodos.map((item) => (
                      <div key={item.id} className="flex items-start gap-1.5 text-[10px] text-[var(--editor-text-subtle)]">
                        <span className={item.status === 'completed' ? 'text-[var(--editor-success)]' : item.status === 'in_progress' ? 'text-[var(--editor-accent-text)]' : 'text-[var(--editor-text-muted)]'}>
                          {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'}
                        </span>
                        <span>{item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {pending && (
          <div className="border-t border-[var(--editor-border)] bg-[var(--editor-accent-soft)] px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 rounded-md bg-[var(--editor-accent)]/15 p-1.5 text-[var(--editor-accent-text)]"><Sparkles className="size-3.5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[var(--editor-text)]">{pending.kind === 'operations' ? 'Proposed plan changes' : 'Proposed imported plan'}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-[var(--editor-text-subtle)]">{pending.kind === 'import' ? pending.message : pending.response.reply}</p>
              </div>
            </div>
            <div className="mt-2 grid gap-1 text-[10px] text-[var(--editor-text-subtle)]">
              {(pending.kind === 'import'
                ? importDiff(pending.before, pending.floorPlan)
                : pending.kind === 'combined'
                  ? [...importDiff(pending.before, pending.floorPlan), ...pending.response.operations.map(operationLabel)]
                  : pending.response.operations.map(operationLabel)
              ).map((line) => <p key={line}>• {line}</p>)}
            </div>
            {pending.kind !== 'import' && pending.response.operations.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)]/50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--editor-text-muted)]">Review operations</p>
                  <p className="text-[10px] text-[var(--editor-text-subtle)]">{approvedOperationKeys.length}/{pending.response.operations.length} selected</p>
                </div>
                <div className="mt-1.5 space-y-1">
                  {pending.response.operations.map((operation, index) => {
                    const selected = approvedOperationKeys.includes(operationKey(operation, index));
                    return (
                      <button
                        key={operationKey(operation, index)}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleOperation(index)}
                        className={'flex min-h-8 w-full items-start gap-2 rounded-md px-2 text-left text-[10px] ' + (selected ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-text)]' : 'text-[var(--editor-text-muted)] line-through opacity-70')}
                      >
                        <span className={'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border text-[9px] ' + (selected ? 'border-[var(--editor-accent)] bg-[var(--editor-accent)] text-[var(--editor-canvas)]' : 'border-[var(--editor-border)]')}>
                          {selected ? '✓' : ''}
                        </span>
                        <span>{operationLabel(operation)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {pending.kind !== 'import' && pending.response.todo.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)]/50 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--editor-text-muted)]">Task plan</p>
                <div className="mt-1.5 space-y-1">
                  {pending.response.todo.map((item) => (
                    <div key={item.id} className="flex items-start gap-1.5 text-[10px] text-[var(--editor-text-subtle)]">
                      <span className={item.status === 'completed' ? 'text-[var(--editor-success)]' : item.status === 'in_progress' ? 'text-[var(--editor-accent-text)]' : 'text-[var(--editor-text-muted)]'}>
                        {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'}
                      </span>
                      <span>{item.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {(pending.kind === 'import' || pending.kind === 'combined' || approvedOperationKeys.length > 0) && (
                <button type="button" onClick={applyPending} className="min-h-9 flex-1 rounded-lg bg-[var(--editor-accent)] px-2 text-[10px] font-semibold text-[var(--editor-canvas)] hover:bg-[var(--editor-accent-hover)]">{pending.kind === 'import' || (pending.kind === 'combined' && approvedOperationKeys.length === 0) ? 'Apply plan' : approvedOperationKeys.length === pending.response.operations.length ? 'Apply changes' : 'Apply selected'}</button>
              )}
              <button type="button" onClick={discardPending} className="min-h-9 flex-1 rounded-lg border border-[var(--editor-border)] px-2 text-[10px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">Cancel</button>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--editor-border)] px-3 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[var(--editor-text-subtle)]">
            <span className="rounded-full bg-[var(--editor-surface-muted)] px-2 py-1">{selectedElements.length ? selectedElements.length + ' selected' : 'Whole plan'}</span>
            {selectedElements.length > 0 && <span className="truncate text-[var(--editor-accent-text)]">Selection context included</span>}
            <span className="truncate">{viewMode === '2d' ? '2D canvas' : viewMode + ' view'}</span>
            {canUndoChat && (
              <button type="button" onClick={() => { (useDesignStore as any).temporal.getState().undo(); setCanUndoChat(false); setStatus('Undid the last AI-applied change.'); addMessage('assistant', 'Undid the last AI-applied change.'); }} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]">
                <Undo2 className="size-3" /> Undo
              </button>
            )}
          </div>

          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-canvas)] px-2.5 py-2">
              <FileImage className="size-4 shrink-0 text-[var(--editor-accent-text)]" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--editor-text)]">{file.name}</span>
              <span className="rounded-md px-2 py-1 text-[10px] text-[var(--editor-text-subtle)]">Attached</span>
              <button type="button" onClick={() => setFile(null)} className="rounded p-1 text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)]" aria-label="Remove attachment"><X className="size-3" /></button>
            </div>
          )}

          <div className="relative">
            {plusMenuOpen && (
              <div className="absolute bottom-12 left-0 z-30 w-52 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-menu-surface)] p-1.5 shadow-xl">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <FileImage className="size-4 text-[var(--editor-accent-text)]" /> Upload floor plan
                </button>
                <button type="button" onClick={() => { setPrompt('Review the selected elements and suggest improvements.'); setPlusMenuOpen(false); textareaRef.current?.focus(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Sparkles className="size-4 text-[var(--editor-accent-text)]" /> Review selection
                </button>
                <button type="button" onClick={() => { setPrompt('Review this plan for standards, accessibility, circulation, room areas, and opening issues. Do not apply changes.'); setPlusMenuOpen(false); textareaRef.current?.focus(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Sparkles className="size-4 text-[var(--editor-accent-text)]" /> Review entire plan
                </button>
                <button type="button" onClick={() => void exportComplianceReport('markdown')} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Download className="size-4 text-[var(--editor-accent-text)]" /> Export Markdown report
                </button>
                <button type="button" onClick={() => void exportComplianceReport('json')} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Download className="size-4 text-[var(--editor-accent-text)]" /> Export JSON report
                </button>
                <button type="button" onClick={() => void exportComplianceReport('csv')} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Download className="size-4 text-[var(--editor-accent-text)]" /> Export CSV report
                </button>
                <button type="button" onClick={() => void exportComplianceReport('html')} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)]">
                  <Download className="size-4 text-[var(--editor-accent-text)]" /> Print / save PDF
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            <div className="flex items-end gap-1.5 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-canvas)] p-1.5 shadow-inner focus-within:border-[var(--editor-accent)]">
              <button type="button" onClick={() => setPlusMenuOpen((value) => !value)} className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]" aria-label="Add attachment or tool">
                <Plus className="size-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submitPrompt();
                  }
                }}
                placeholder={floorPlan ? 'Ask about or change your plan…' : 'Describe a floor plan…'}
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-[11px] leading-4 text-[var(--editor-text)] placeholder-[var(--editor-text-subtle)] focus:outline-none"
                rows={1}
                disabled={generating}
                aria-label="Ask Corbel AI"
              />
              <button type="button" onClick={() => void submitPrompt()} disabled={generating || (!prompt.trim() && !file)} className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--editor-accent)] text-[var(--editor-canvas)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
                {generating ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
          </div>
          <p aria-live="polite" className="mt-1.5 px-1 text-[10px] leading-4 text-[var(--editor-text-subtle)]">{status ?? 'AI changes are previewed before they affect the editor.'}</p>
        </div>
      </div>
    </div>
  );
}
