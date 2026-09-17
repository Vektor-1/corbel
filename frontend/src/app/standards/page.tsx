import Link from 'next/link';

export default function Standards() {
  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-blue-400">
            Corbel
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold text-white mb-8">Ghana building references</h1>

        <p className="mb-8 border-l-2 border-amber-400 bg-slate-800 p-4 text-sm leading-relaxed text-slate-300">
          This page is an educational reference list, not a reproduced code book or compliance service. Corbel implements selected classroom review prompts only; consult the current primary source and qualified professionals for a real project.
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">References</h2>
          <ul className="space-y-4 text-slate-300">
            <li>
              <strong>Ghana Building Code (GS 1207:2018)</strong>
              <p>Part 7: Housing and Small Buildings</p>
            </li>
            <li>
              <strong>National Building Regulations 1996 (L.I. 1630)</strong>
              <p>Legal instrument governing building safety, materials, and procedures</p>
            </li>
          </ul>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Illustrative material notes</h2>

          <div className="space-y-6">
            {/* Sandcrete */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-3">Sandcrete Blocks</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li>Use the current cited source and project specification to verify strength, dimensions, and suitability.</li>
                <li>Corbel&apos;s editor exposes material, role, thickness, and height for educational review.</li>
              </ul>
            </div>

            {/* Laterite */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-3">Laterite Blocks</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li>Material performance depends on mix, manufacture, testing, and project conditions.</li>
                <li>Discuss sustainability and local availability with a qualified tutor rather than inferring structural suitability from this prototype.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Design-review prompts</h2>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4 text-slate-300">
            <p>
              <strong>Ask before approving a room:</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Is the intended activity and occupancy stated in the brief?</li>
              <li>• Are dimensions, access, ventilation, and furniture clear enough to review?</li>
              <li>• Has the applicable jurisdiction-specific requirement been checked in its current source?</li>
            </ul>

            <p className="mt-6">
              <strong>Corbel&apos;s current boundary:</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Room area and opening feedback are limited educational prompts.</li>
              <li>• No automated egress, fire, accessibility, ceiling-height, or structural-capacity approval is provided.</li>
            </ul>
          </div>
        </section>

        <div className="mt-16 pt-8 border-t border-slate-700">
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
