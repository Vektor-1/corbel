import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { GOLD, INK, PAPER } from '@/lib/brand';

const MUTED = '#4a5561';
const CARD_BG = '#f2efe7';

export default function Standards() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: PAPER, color: INK }}>
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="mb-8 text-4xl font-bold" style={{ color: INK }}>Ghana building references</h1>

        <p className="mb-8 border-l-2 p-4 text-sm leading-relaxed" style={{ borderColor: GOLD, backgroundColor: CARD_BG, color: MUTED }}>
          This page is an educational reference list, not a reproduced code book or compliance service. Corbel implements selected classroom review prompts only; consult the current primary source and qualified professionals for a real project.
        </p>

        <div className="mb-12 border-2 p-8" style={{ borderColor: INK, backgroundColor: CARD_BG }}>
          <h2 className="mb-4 text-2xl font-bold" style={{ color: INK }}>References</h2>
          <ul className="space-y-4" style={{ color: MUTED }}>
            <li>
              <strong style={{ color: INK }}>Ghana Building Code (GS 1207:2018)</strong>
              <p>Part 7: Housing and Small Buildings</p>
            </li>
            <li>
              <strong style={{ color: INK }}>National Building Regulations 1996 (L.I. 1630)</strong>
              <p>Legal instrument governing building safety, materials, and procedures</p>
            </li>
          </ul>
        </div>

        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold" style={{ color: INK }}>Illustrative material notes</h2>

          <div className="space-y-6">
            {/* Sandcrete */}
            <div className="border-2 p-6" style={{ borderColor: INK, backgroundColor: CARD_BG }}>
              <h3 className="mb-3 text-xl font-bold" style={{ color: INK }}>Sandcrete Blocks</h3>
              <ul className="space-y-2 text-sm" style={{ color: MUTED }}>
                <li>Use the current cited source and project specification to verify strength, dimensions, and suitability.</li>
                <li>Corbel&apos;s editor exposes material, role, thickness, and height for educational review.</li>
              </ul>
            </div>

            {/* Laterite */}
            <div className="border-2 p-6" style={{ borderColor: INK, backgroundColor: CARD_BG }}>
              <h3 className="mb-3 text-xl font-bold" style={{ color: INK }}>Laterite Blocks</h3>
              <ul className="space-y-2 text-sm" style={{ color: MUTED }}>
                <li>Material performance depends on mix, manufacture, testing, and project conditions.</li>
                <li>Discuss sustainability and local availability with a qualified tutor rather than inferring structural suitability from this prototype.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold" style={{ color: INK }}>Design-review prompts</h2>
          <div className="space-y-4 border-2 p-6" style={{ borderColor: INK, backgroundColor: CARD_BG, color: MUTED }}>
            <p>
              <strong style={{ color: INK }}>Ask before approving a room:</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Is the intended activity and occupancy stated in the brief?</li>
              <li>• Are dimensions, access, ventilation, and furniture clear enough to review?</li>
              <li>• Has the applicable jurisdiction-specific requirement been checked in its current source?</li>
            </ul>

            <p className="mt-6">
              <strong style={{ color: INK }}>Corbel&apos;s current boundary:</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Room area and opening feedback are limited educational prompts.</li>
              <li>• No automated egress, fire, accessibility, ceiling-height, or structural-capacity approval is provided.</li>
            </ul>
          </div>
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
