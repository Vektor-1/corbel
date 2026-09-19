import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { GOLD, INK, PAPER } from '@/lib/brand';

const MUTED = '#4a5561';

export default function About() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: PAPER, color: INK }}>
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="mb-8 text-4xl font-bold" style={{ color: INK }}>About Corbel</h1>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold" style={{ color: INK }}>Vision</h2>
          <p className="mb-4" style={{ color: MUTED }}>
            Corbel is an open-source educational platform designed to improve architectural spatial literacy
            and code awareness among high school and tertiary students in Ghana.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold" style={{ color: INK }}>Built for Ghana</h2>
          <p className="mb-4" style={{ color: MUTED }}>
            Corbel uses selected educational references to Ghana Building Code (GS 1207:2018) and National Building Regulations (L.I. 1630).
            Its current checks cover only the rules made visible in the editor; they are prompts for learning and review, not a complete code implementation or approval service.
          </p>
        </section>

        <p className="border-l-2 p-4 text-sm leading-relaxed" style={{ borderColor: GOLD, backgroundColor: '#f2efe7', color: MUTED }}>
          Corbel does not replace an architect, engineer, statutory authority, or qualified tutor. Verify any construction decision against the applicable current source and professional advice.
        </p>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold" style={{ color: INK }}>Open Source</h2>
          <p style={{ color: MUTED }}>
            Corbel is MIT licensed and welcomes contributions. Visit the GitHub repository to contribute.
          </p>
        </section>

        <div className="mt-16 border-t pt-8" style={{ borderColor: INK }}>
          <Link href="/" className="font-semibold hover:opacity-70" style={{ color: GOLD }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
