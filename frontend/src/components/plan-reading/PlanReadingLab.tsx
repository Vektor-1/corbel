'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, ChevronDown, DoorOpen, Download, HelpCircle, RotateCcw, Send, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TWO_BEDROOM_LESSON } from '@/lib/plan-reading/lesson';
import { clearPlanReadingProgress, emptyPlanReadingProgress, loadPlanReadingProgress, savePlanReadingProgress } from '@/lib/plan-reading/progress';
import { parseAreaAnswer, scoreLessonAnswer } from '@/lib/plan-reading/scoring';
import type { LessonAnswer, LessonStepId, PlanReadingProgress } from '@/lib/plan-reading/types';
import { ADAPTIVE_LEARNING_STORAGE_KEY, appendLearningEvent, learningCsv, parseLearningEvents, type MisconceptionId } from '@/lib/learning/adaptiveTutor';
import { useDesignStore } from '@/store/designStore';
import { validateUploadFile } from '@/lib/uploads/uploadPolicy';
import { uploadPlanReference } from '@/lib/uploads/planUpload';
import type { TutorMessage } from '@/lib/plan-reading/types';
import { GOLD, INK, PAPER } from '@/lib/brand';
import { Skeleton } from '@/components/ui/skeleton';

const BLUE = '#2b638c';

type TutorStatus = 'checking' | 'available' | 'unavailable';

const LESSON_PLAN_ID = 'lesson:two-bedroom';
const misconceptionForStep: Record<LessonStepId, MisconceptionId> = {
  entrance: 'openings',
  bedroom: 'closed-boundaries',
  area: 'scale',
  scale: 'scale',
};

function PlanReadingTask() {
  const [progress, setProgress] = useState<PlanReadingProgress>(emptyPlanReadingProgress);
  const [ready, setReady] = useState(false);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setProgress(loadPlanReadingProgress(window.localStorage));
    setReady(true);
  }, []);

  const step = TWO_BEDROOM_LESSON[progress.activeStep];
  const complete = progress.completed;

  function commit(next: PlanReadingProgress) {
    setProgress(next);
    savePlanReadingProgress(window.localStorage, next);
  }

  function submit(rawAnswer: LessonAnswer) {
    if (!step || !ready) return;
    const result = scoreLessonAnswer(step.id, rawAnswer);
    const previous = progress.steps[step.id];
    const nextStep = result.correct ? Math.min(progress.activeStep + 1, TWO_BEDROOM_LESSON.length - 1) : progress.activeStep;
    const next: PlanReadingProgress = {
      version: 1,
      activeStep: nextStep,
      completed: result.correct && progress.activeStep === TWO_BEDROOM_LESSON.length - 1,
      steps: {
        ...progress.steps,
        [step.id]: { answer: rawAnswer, correct: result.correct, attempts: (previous?.attempts ?? 0) + 1 },
      },
    };
    commit(next);
    appendLearningEvent(window.localStorage, {
      planId: LESSON_PLAN_ID,
      misconceptionId: misconceptionForStep[step.id],
      kind: 'plan-reading-answered',
      rule: `plan-reading-${step.id}`,
      targetId: step.id,
      answerId: String(rawAnswer),
      correct: result.correct,
    });
    setFeedback(result.correct ? `${result.feedback} ${step.nextAction}` : `${result.feedback} ${step.remediation}`);
    setAnswer('');
  }

  function reset() {
    clearPlanReadingProgress(window.localStorage);
    setProgress(emptyPlanReadingProgress());
    setFeedback(null);
    setAnswer('');
  }

  function exportLessonRecord() {
    const rows = parseLearningEvents(window.localStorage.getItem(ADAPTIVE_LEARNING_STORAGE_KEY))
      .filter((event) => event.planId === LESSON_PLAN_ID);
    const blob = new Blob([learningCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'corbel-plan-reading-record.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) {
    // Mirrors the loaded task card's shape (label + heading + progress marker on
    // the right) so the page doesn't jump once localStorage progress resolves.
    return (
      <div className="border-2 p-4 sm:p-5" style={{ borderColor: INK }} aria-label="Loading your practice activity">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="mt-4 h-4 w-3/4" />
      </div>
    );
  }

  return (
    <section aria-labelledby="plan-task-heading" className="border-2 p-4 sm:p-5" style={{ borderColor: INK, backgroundColor: '#f2efe7' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: '#795b20' }}>Interpretation practice</p>
          <h2 id="plan-task-heading" className="mt-1 text-lg font-bold">Read the study plan before you draw</h2>
        </div>
        <span className="font-mono text-xs" style={{ color: '#44515b' }}>
          {complete ? '4 / 4 complete' : `${progress.activeStep + 1} / ${TWO_BEDROOM_LESSON.length}`}
        </span>
      </div>

      {complete ? (
        <div className="mt-4 border-2 p-4" style={{ borderColor: '#24613a', backgroundColor: '#e7f3e8' }}>
          <div className="flex gap-2"><CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: '#24613a' }} /><div>
            <p className="font-semibold">Plan-reading sequence complete.</p>
            <p className="mt-1 text-sm leading-relaxed">You identified an entrance, interpreted a room label, calculated area, and selected a known length. Upload a plan next and calibrate it before retracing.</p>
          </div></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/upload?mode=trace&lesson=two-bedroom-plan-reading" className="border-2 px-3 py-2 text-xs font-semibold" style={{ backgroundColor: INK, color: PAPER, borderColor: INK }}>Upload a plan to retrace</Link>
            <button type="button" onClick={exportLessonRecord} className="inline-flex items-center gap-1 border-2 px-3 py-2 text-xs font-semibold" style={{ borderColor: INK }}><Download className="size-3.5" />Export lesson record</button>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 border-2 px-3 py-2 text-xs font-semibold" style={{ borderColor: INK }}><RotateCcw className="size-3.5" />Practise again</button>
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: '#59616a' }}>The CSV contains only this lesson&apos;s anonymous event IDs, answers, correctness, and timestamps. Add any participant code outside Corbel with approved consent.</p>
        </div>
      ) : step && (
        <div className="mt-4">
          <p className="font-semibold">{step.number}. {step.prompt}</p>
          {step.kind === 'numeric' ? (
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const value = parseAreaAnswer(answer); if (value === null) { setFeedback('Enter a number, for example 12 m².'); return; } submit(value); }}>
              <Input aria-label="Bedroom 1 area in square metres" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="e.g. 12 m²" className="max-w-xs border-2" style={{ borderColor: INK }} />
              <button type="submit" className="border-2 px-3 py-2 text-xs font-semibold" style={{ backgroundColor: INK, color: PAPER, borderColor: INK }}>Check answer</button>
            </form>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label={`Choices for ${step.title}`}>
              {step.id === 'entrance' && [
                ['entrance-door', 'The external door at the bottom edge'],
                ['bedroom-door', 'The internal Bedroom 1 door'],
                ['kitchen-opening', 'The kitchen doorway'],
              ].map(([value, label]) => <button key={value} type="button" onClick={() => submit(value)} className="border-2 p-3 text-left text-xs font-medium hover:bg-white" style={{ borderColor: INK }}>{label}</button>)}
              {step.id === 'bedroom' && step.choices?.map((choice) => <button key={String(choice.value)} type="button" onClick={() => submit(choice.value)} className="border-2 p-3 text-left text-xs font-medium hover:bg-white" style={{ borderColor: INK }}>{choice.label}</button>)}
              {step.id === 'scale' && [
                ['known-wall', 'The top wall marked 3 m'],
                ['bedroom-label', 'The “Bedroom 1” label'],
                ['room-edge', 'Any unlabelled room boundary'],
              ].map(([value, label]) => <button key={value} type="button" onClick={() => submit(value)} className="border-2 p-3 text-left text-xs font-medium hover:bg-white" style={{ borderColor: INK }}>{label}</button>)}
            </div>
          )}
          {feedback && <p role="status" className="mt-3 border-l-4 px-3 py-2 text-sm leading-relaxed" style={{ borderColor: feedback.startsWith('Correct') ? '#24613a' : '#b45309', backgroundColor: '#fffaf0' }}>{feedback}</p>}
        </div>
      )}
    </section>
  );
}

function PlanDiagram() {
  return (
    <div className="relative overflow-hidden border-2 p-3 sm:p-6" style={{ borderColor: INK, backgroundColor: '#f2efe7', backgroundImage: `linear-gradient(${GOLD}22 1px, transparent 1px), linear-gradient(90deg, ${GOLD}22 1px, transparent 1px)`, backgroundSize: '24px 24px' }}>
      <div className="absolute left-3 top-3 z-10 bg-[#000f1d] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f7f7f7]">Study plan · not to scale</div>
      <svg viewBox="0 0 700 480" className="mt-7 h-auto w-full" role="group" aria-label="Simple two-bedroom floor plan with labelled rooms and an entrance at the bottom">
        <rect x="80" y="40" width="540" height="365" fill={PAPER} stroke={INK} strokeWidth="10" />
        <path d="M80 235H620M300 40V405M475 40V235M475 320V405" fill="none" stroke={INK} strokeWidth="8" />
        <path d="M80 405H160" fill="none" stroke={PAPER} strokeWidth="14" />
        <path d="M160 405 A80 80 0 0 1 80 325" fill="none" stroke={INK} strokeWidth="3" />
        <path d="M300 125H370M300 320H370M475 235H545" fill="none" stroke={PAPER} strokeWidth="12" />
        <path d="M300 125 A70 70 0 0 1 370 195M300 320 A70 70 0 0 0 370 250M475 235 A70 70 0 0 1 545 305" fill="none" stroke={INK} strokeWidth="3" />
        <path d="M170 40V58M410 40V58" stroke={GOLD} strokeWidth="4" />
        <path d="M170 55H410" stroke={GOLD} strokeWidth="3" />
        <text x="289" y="78" textAnchor="middle" fill={INK} fontSize="18" fontFamily="monospace" fontWeight="700">3 m</text>
        <g fill={INK} fontFamily="sans-serif" textAnchor="middle"><text x="188" y="160" fontSize="25" fontWeight="700">Bedroom 1</text><text x="188" y="190" fontSize="14">3 m × 4 m</text><text x="388" y="160" fontSize="24" fontWeight="700">Bedroom 2</text><text x="548" y="150" fontSize="23" fontWeight="700">Kitchen</text><text x="385" y="355" fontSize="26" fontWeight="700">Living room</text></g>
      </svg>
    </div>
  );
}

function TutorChat() {
  const router = useRouter();
  const beginImageTrace = useDesignStore((state) => state.beginImageTrace);
  const [status, setStatus] = useState<TutorStatus>('checking');
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedPlan, setAttachedPlan] = useState<File | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  const planInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/plan-reading/tutor').then((r) => r.json()).then((d) => setStatus(d.available ? 'available' : 'unavailable')).catch(() => setStatus('unavailable'));
  }, []);

  async function ask(question: string) {
    if (!question.trim() || sending) return;
    const next = [...messages, { role: 'user' as const, content: question.trim() }].slice(-6);
    setMessages(next);
    setDraft('');
    setSending(true);
    try {
      const response = await fetch('/api/plan-reading/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || 'Unavailable');
      setMessages((current) => [...current, { role: 'assistant' as const, content: data.answer! }].slice(-6));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The AI Tutor is unavailable right now.');
      setStatus('unavailable');
    } finally {
      setSending(false);
    }
  }

  function choosePlan(file: File | null) {
    if (!file) return;
    const checked = validateUploadFile(file);
    if (!checked.ok) {
      toast.error(checked.message);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.message('Use an image plan here. PDF plans can still be uploaded from the full import page.');
      return;
    }
    setAttachedPlan(file);
    setMessages((current) => [...current, { role: 'assistant' as const, content: `Plan "${file.name}" is ready to open in the editor. This tutor discusses the visible study plan; it does not analyze your uploaded image.` }].slice(-6));
  }

  async function openPlanInEditor() {
    if (!attachedPlan || openingEditor) return;
    setOpeningEditor(true);
    try {
      const url = await uploadPlanReference(attachedPlan);
      beginImageTrace(url, attachedPlan.name);
      toast.success('Plan added to editor. Calibrate a known wall before trusting dimensions.');
      router.push('/editor');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open plan in editor.');
      setOpeningEditor(false);
    }
  }

  const starterPrompts = [
    'What should I look for first in a plan?',
    'How do I tell an entrance from an internal door?',
    'What is drawing scale and why does it matter?',
    'How do I calculate a room\'s area?',
  ];

  return (
    <div id="ai-tutor" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="size-5" style={{ color: GOLD }} />
          <h1 className="text-2xl font-bold">Plan Reading Tutor</h1>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider px-2 py-1 rounded" style={{
          color: status === 'available' ? '#24613a' : '#795b20',
          backgroundColor: status === 'available' ? '#e1eee2' : '#fef3e2',
        }}>
          {status === 'checking' ? 'Checking…' : status === 'available' ? 'Online' : 'Offline'}
        </span>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: '#44515b' }}>
        {status === 'available'
          ? 'Ask me about plan reading, drawing scale, or how to interpret spaces. I explain concepts to help you observe more carefully.'
          : 'The tutor is offline, but you can still explore and learn on your own.'}
      </p>

      {messages.length === 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#59616a' }}>Try one of these</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                disabled={status !== 'available' || sending}
                onClick={() => ask(prompt)}
                className="border-2 p-3 text-left text-xs font-medium hover:bg-[#f2efe7] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: INK }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex-1 space-y-3 rounded border-2 p-4 min-h-64"
        style={{ backgroundColor: '#f2efe7', borderColor: INK }}
      >
        {messages.length > 0 ? (
          <>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="animate-in fade-in duration-300">
                <p
                  className="text-sm leading-relaxed px-3 py-2 rounded"
                  style={{
                    backgroundColor: message.role === 'assistant' ? PAPER : BLUE,
                    color: message.role === 'assistant' ? INK : PAPER,
                    marginLeft: message.role === 'assistant' ? '0' : '1.5rem',
                    marginRight: message.role === 'user' ? '0' : '1.5rem',
                  }}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {sending && (
              <div className="text-sm italic" style={{ color: '#59616a' }}>
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center" style={{ color: '#a6a098' }}>
            <p className="text-sm">Start a conversation by choosing a prompt above or typing your own question.</p>
          </div>
        )}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); ask(draft); }} className="flex gap-2">
        <Input
          value={draft}
          maxLength={600}
          disabled={status !== 'available' || sending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about plan reading…"
          className="border-2"
          style={{ borderColor: INK }}
        />
        <Button
          type="submit"
          disabled={status !== 'available' || sending || !draft.trim()}
          style={{ backgroundColor: INK, color: PAPER }}
        >
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>

      <div className="border-t-2 pt-3" style={{ borderColor: '#a6a098' }}>
        <p className="text-xs font-semibold">Bring your own plan</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: '#59616a' }}>
          Attach a PNG, JPEG, or WebP to discuss it as a reference. It opens in the editor as an image trace guide.
        </p>
        <input ref={planInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => choosePlan(event.target.files?.[0] ?? null)} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => planInputRef.current?.click()}
            className="inline-flex items-center gap-1 border-2 px-3 py-2 text-xs font-semibold hover:bg-[#f2efe7] transition-colors"
            style={{ borderColor: INK }}
          >
            <Upload className="size-3.5" />
            {attachedPlan ? 'Replace plan' : 'Attach plan'}
          </button>
          {attachedPlan && (
            <button
              type="button"
              onClick={openPlanInEditor}
              disabled={openingEditor}
              className="inline-flex items-center gap-1 border-2 px-3 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
              style={{ backgroundColor: INK, color: PAPER, borderColor: INK }}
            >
              {openingEditor ? 'Opening…' : 'Open in editor'}
            </button>
          )}
        </div>
        {attachedPlan && <p className="mt-2 text-xs" style={{ color: '#44515b' }}>Attached: {attachedPlan.name}</p>}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: '#59616a' }}>
        Learning support only. Not professional, structural, or building-code approval.
      </p>
    </div>
  );
}

function LessonGuide() {
  const [expanded, setExpanded] = useState<string | null>('entrance');

  return (
    <aside className="border-2 overflow-hidden flex flex-col" style={{ borderColor: INK, backgroundColor: '#ece7db' }}>
      <header className="border-b-2 px-4 py-3 flex items-center gap-2" style={{ borderColor: INK }}>
        <HelpCircle className="size-4" />
        <h2 className="font-semibold">Plan Reading Guide</h2>
      </header>
      <div className="flex-1 overflow-y-auto">
        {TWO_BEDROOM_LESSON.map((step) => (
          <div key={step.id} className="border-b" style={{ borderColor: '#d1ccc4' }}>
            <button
              onClick={() => setExpanded(expanded === step.id ? null : step.id)}
              className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-[#e6e0d8] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-center" style={{ color: GOLD, minWidth: '1.5rem' }}>
                  {step.number}
                </span>
                <span className="text-sm font-semibold">{step.title}</span>
              </div>
              <ChevronDown
                className="size-4 transition-transform"
                style={{ transform: expanded === step.id ? 'rotate(180deg)' : 'rotate(0)' }}
              />
            </button>
            {expanded === step.id && (
              <div className="px-4 py-3 bg-[#f9f7f3] text-xs leading-relaxed border-t" style={{ borderColor: '#d1ccc4', color: '#44515b' }}>
                <p className="font-semibold mb-2">{step.explanation}</p>
                <p className="mb-2">{step.remediation}</p>
                <p className="text-[11px]" style={{ color: '#59616a' }}>
                  <strong>Next:</strong> {step.nextAction}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

export function PlanReadingLab() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: PAPER, color: INK }}>
      <header className="border-b-2" style={{ borderColor: INK }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em]">
            <DoorOpen className="size-4" style={{ color: GOLD }} />
            Corbel
          </Link>
          <Link href="/editor" className="text-sm font-semibold underline underline-offset-4">
            Go to editor
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#795b20' }}>
            Plan Reading
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Learn to read architectural plans
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: '#44515b' }}>
            Ask questions about the two-bedroom floor plan below. The guide on the right explains key concepts: entrances, rooms, area, and scale.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <TutorChat />
          </div>
          <div className="min-h-96">
            <LessonGuide />
          </div>
        </div>

        <div className="mt-6 border-t-2 pt-6" style={{ borderColor: INK }}>
          <h2 className="text-lg font-semibold mb-3">The Study Plan</h2>
          <PlanDiagram />
          <p className="mt-4 text-sm leading-relaxed" style={{ color: '#44515b' }}>
            This two-bedroom floor plan shows how to interpret rooms, dimensions, and scale. Use it as a reference while discussing plan-reading with the tutor.
          </p>
          <div className="mt-4">
            <PlanReadingTask />
          </div>
        </div>
      </section>
    </main>
  );
}
