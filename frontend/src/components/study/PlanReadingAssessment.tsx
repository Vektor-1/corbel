'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, FileCheck2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assessmentCsv, assessmentResponse, assessmentStorageKey, parseAssessmentResponses, PLAN_READING_ASSESSMENTS, type AssessmentPhase, type AssessmentResponse } from '@/lib/study/planReadingAssessment';
import { useStudyCondition } from '@/lib/study/condition';
import { GOLD, INK, PAPER } from '@/lib/brand';

export function PlanReadingAssessment() {
  const searchParams = useSearchParams();
  const phase: AssessmentPhase = searchParams.get('phase') === 'post' ? 'post' : 'pre';
  const condition = useStudyCondition();
  const questions = PLAN_READING_ASSESSMENTS[phase];
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<AssessmentResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const question = questions[index];
  const complete = index >= questions.length;

  useEffect(() => {
    const recovered = parseAssessmentResponses(window.localStorage.getItem(assessmentStorageKey(phase)), phase);
    setResponses(recovered);
    setIndex(Math.min(recovered.length, questions.length));
    setSelected(null);
    setReady(true);
  }, [phase, questions.length]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(assessmentStorageKey(phase), JSON.stringify(responses));
  }, [phase, ready, responses]);

  function submit() {
    if (!question || !selected) return;
    setResponses((current) => [...current, assessmentResponse(phase, condition, question, selected)]);
    setSelected(null);
    setIndex((current) => current + 1);
  }

  function download() {
    const blob = new Blob([assessmentCsv(responses)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `corbel-${phase}-assessment.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function startOver() {
    window.localStorage.removeItem(assessmentStorageKey(phase));
    setResponses([]);
    setIndex(0);
    setSelected(null);
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: PAPER, color: INK }}>
      <section className="mx-auto max-w-2xl border-2 p-5 sm:p-7" style={{ borderColor: INK, background: '#f2efe7' }}>
        <p className="font-mono text-xs uppercase tracking-[0.14em]" style={{ color: '#795b20' }}>{phase === 'pre' ? 'Pre-task assessment' : 'Post-task assessment'}</p>
        <h1 className="mt-2 text-3xl font-bold">Plan-reading check</h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: '#44515b' }}>Answer from your current understanding. This check gives no hints or correctness feedback. It is a learning-study instrument, not a design or building-code approval.</p>
        <p className="mt-3 text-xs" style={{ color: '#59616a' }}>Assigned condition: {condition}. Do not enter your name or student ID; export the anonymous record only when instructed by the researcher.</p>

        {!ready ? <p className="mt-7 text-sm">Loading saved assessment state…</p> : !complete && question ? <div className="mt-7">
          <p className="font-mono text-xs" style={{ color: '#59616a' }}>Question {index + 1} of {questions.length}</p>
          <fieldset className="mt-3">
            <legend className="font-semibold leading-relaxed">{question.prompt}</legend>
            <div className="mt-4 grid gap-2">
              {question.choices.map((choice) => <label key={choice.id} className="flex cursor-pointer gap-3 border-2 p-3 text-sm hover:bg-white" style={{ borderColor: selected === choice.id ? GOLD : INK }}>
                <input type="radio" name={question.id} value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} />
                <span>{choice.label}</span>
              </label>)}
            </div>
          </fieldset>
          <button type="button" disabled={!selected} onClick={submit} className="mt-5 border-2 px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: INK, color: PAPER, borderColor: INK }}>Record answer</button>
        </div> : <div className="mt-7 border-2 p-4" style={{ borderColor: '#24613a', background: '#e7f3e8' }}>
          <div className="flex gap-2"><FileCheck2 className="mt-0.5 size-5 shrink-0" style={{ color: '#24613a' }} /><div><p className="font-semibold">Assessment responses recorded.</p><p className="mt-1 text-sm leading-relaxed">Export the anonymous CSV for the researcher. Corbel does not display a score or correct answers here.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={download} className="inline-flex items-center gap-1 border-2 px-3 py-2 text-xs font-semibold" style={{ background: INK, color: PAPER, borderColor: INK }}><Download className="size-3.5" />Export assessment record</button>
            <button type="button" onClick={startOver} className="border-2 px-3 py-2 text-xs font-semibold" style={{ borderColor: INK }}>Start this form again</button>
            {phase === 'pre' ? <Link href={`/editor?condition=${condition}`} className="border-2 px-3 py-2 text-xs font-semibold" style={{ borderColor: INK }}>Continue to drawing task</Link> : <Link href="/learn" className="border-2 px-3 py-2 text-xs font-semibold" style={{ borderColor: INK }}>Return to learning lab</Link>}
          </div>
          <p className="mt-3 text-xs" style={{ color: '#59616a' }}>Responses are stored only in this browser until export or reset. Do not continue a previous participant&apos;s form.</p>
        </div>}
      </section>
    </main>
  );
}
