import Link from 'next/link';

export default function Learn() {
  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <Link href="/" className="text-2xl font-bold text-white hover:text-blue-400">
            Corbel
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold text-white mb-8">Tutorials & Learning</h1>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition cursor-pointer">
            <h3 className="text-xl font-bold text-white mb-3">Getting Started</h3>
            <p className="text-slate-300 mb-4">Learn the basics of Corbel in 5 minutes.</p>
            <button className="text-blue-400 hover:text-blue-300 font-medium">Start Lesson →</button>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition cursor-pointer">
            <h3 className="text-xl font-bold text-white mb-3">Drawing Basics</h3>
            <p className="text-slate-300 mb-4">Master walls, doors, and windows.</p>
            <button className="text-blue-400 hover:text-blue-300 font-medium">Start Lesson →</button>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition cursor-pointer">
            <h3 className="text-xl font-bold text-white mb-3">Understanding 3D</h3>
            <p className="text-slate-300 mb-4">Learn to visualize your designs in 3D.</p>
            <button className="text-blue-400 hover:text-blue-300 font-medium">Start Lesson →</button>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 transition cursor-pointer">
            <h3 className="text-xl font-bold text-white mb-3">Ghana Standards</h3>
            <p className="text-slate-300 mb-4">Design buildings that comply with local codes.</p>
            <button className="text-blue-400 hover:text-blue-300 font-medium">Start Lesson →</button>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-700">
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
