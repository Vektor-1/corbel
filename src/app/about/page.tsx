import Link from 'next/link';

export default function About() {
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
        <h1 className="text-4xl font-bold text-white mb-8">About Corbel</h1>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Vision</h2>
          <p className="text-slate-300 mb-4">
            Corbel is an open-source educational platform designed to improve architectural spatial literacy
            and code awareness among high school and tertiary students in Ghana.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Built for Ghana</h2>
          <p className="text-slate-300 mb-4">
            Corbel uses selected educational references to Ghana Building Code (GS 1207:2018) and National Building Regulations (L.I. 1630).
            Its current checks cover only the rules made visible in the editor; they are prompts for learning and review, not a complete code implementation or approval service.
          </p>
        </section>

        <p className="border-l-2 border-amber-400 bg-slate-800 p-4 text-sm leading-relaxed text-slate-300">
          Corbel does not replace an architect, engineer, statutory authority, or qualified tutor. Verify any construction decision against the applicable current source and professional advice.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Open Source</h2>
          <p className="text-slate-300">
            Corbel is MIT licensed and welcomes contributions. Visit the GitHub repository to contribute.
          </p>
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
