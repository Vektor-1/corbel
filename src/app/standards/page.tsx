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
        <h1 className="text-4xl font-bold text-white mb-8">Ghana Building Standards</h1>

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
          <h2 className="text-2xl font-bold text-white mb-6">Material Specifications</h2>

          <div className="space-y-6">
            {/* Sandcrete */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-3">Sandcrete Blocks</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li>Compressive Strength: 2.75–2.8 MPa (min, per GS 1207:2018)</li>
                <li>Real-world averages: 1.9–2.5 MPa (Acheampong et al., 2020)</li>
                <li>Standard size: 450 × 225 × 150 mm</li>
                <li>Load-bearing wall thickness: 150 mm (single-story), 225 mm (two-story)</li>
              </ul>
            </div>

            {/* Laterite */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-3">Laterite Blocks</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li>Compressive Strength: ~3.22 MPa (with 6% cement, Donkor & Obonyo, 2016)</li>
                <li>Sustainable alternative to sandcrete</li>
                <li>Standard size: 450 × 225 × 150 mm</li>
                <li>Load-bearing wall thickness: 150 mm (single-story), 200 mm (two-story)</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Residential Design Guidance</h2>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4 text-slate-300">
            <p>
              <strong>Minimum Room Areas (per local practice):</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Bedroom: 9 m²</li>
              <li>• Living: 12 m²</li>
              <li>• Kitchen: 6 m²</li>
              <li>• Bathroom: 3 m²</li>
            </ul>

            <p className="mt-6">
              <strong>Typical Dimensions:</strong>
            </p>
            <ul className="ml-6 space-y-2 text-sm">
              <li>• Ceiling height: 2.7 m</li>
              <li>• Door width: 900 mm</li>
              <li>• Window width: 1.2 m</li>
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
