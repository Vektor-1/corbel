import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Corbel</h1>
            <div className="flex gap-4">
              <Link href="/about" className="text-slate-300 hover:text-white transition">
                About
              </Link>
              <Link href="/standards" className="text-slate-300 hover:text-white transition">
                Ghana Standards
              </Link>
              <Link href="/learn" className="text-slate-300 hover:text-white transition">
                Learn
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-32">
        <div className="text-center">
          <h2 className="text-5xl font-bold text-white sm:text-6xl mb-6">
            Learn Architecture by Building
          </h2>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Corbel is a free, browser-based design tool for high school and tertiary students in Ghana.
            Draw 2D floor plans, see them come alive in 3D, and get instant feedback based on Ghana Building Code.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/editor"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              Start Designing
            </Link>
            <Link
              href="/learn"
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              View Tutorials
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-slate-800/50 border-y border-slate-700 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h3 className="text-3xl font-bold text-white mb-12 text-center">Why Corbel?</h3>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="text-3xl mb-4">📐</div>
              <h4 className="text-lg font-bold text-white mb-2">Draw & Visualize</h4>
              <p className="text-slate-300">
                Intuitive 2D drawing tools with real-time 3D visualization. See your designs come alive instantly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="text-3xl mb-4">✓</div>
              <h4 className="text-lg font-bold text-white mb-2">Instant Feedback</h4>
              <p className="text-slate-300">
                Get real-time feedback based on Ghana Building Code (GS 1207:2018) and local materials like sandcrete and laterite.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-6">
              <div className="text-3xl mb-4">🎓</div>
              <h4 className="text-lg font-bold text-white mb-2">Learn & Share</h4>
              <p className="text-slate-300">
                Access guided lessons, share your work, and explore example designs from Ghanaian architecture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Ghana-Specific Section */}
      <section className="py-16 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h3 className="text-3xl font-bold text-white mb-8 text-center">Built for Ghana</h3>
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-8">
            <p className="text-slate-300 mb-4">
              Corbel is grounded in Ghana's building context. We support local materials—sandcrete, laterite, and concrete—and align with:
            </p>
            <ul className="text-slate-300 space-y-2 ml-6">
              <li>✓ National Building Regulations 1996 (L.I. 1630)</li>
              <li>✓ Ghana Building Code (GS 1207:2018)</li>
              <li>✓ Documented performance data for local materials</li>
              <li>✓ Standard Ghanaian residential dimensions and practices</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 py-8 mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center text-slate-400">
          <p>Corbel — Educational Architecture Tool</p>
          <p className="text-sm mt-2">
            Open source | MIT License | <Link href="/about" className="text-blue-400 hover:text-blue-300">Learn more</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
