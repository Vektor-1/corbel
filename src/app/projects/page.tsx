import Link from 'next/link';

export default function Projects() {
  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-2xl font-bold text-white hover:text-blue-400">
          Corbel
        </Link>
        <Link
          href="/editor"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition"
        >
          New Project
        </Link>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold text-white mb-8">My Projects</h1>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <p className="text-slate-400 mb-4">No projects yet</p>
          <Link
            href="/editor"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition"
          >
            Create Your First Project
          </Link>
        </div>
      </main>
    </div>
  );
}
