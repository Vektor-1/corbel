import { Suspense } from 'react';
import { PlanReadingAssessment } from '@/components/study/PlanReadingAssessment';

export default function AssessmentPage() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8">Loading assessment…</main>}>
      <PlanReadingAssessment />
    </Suspense>
  );
}
