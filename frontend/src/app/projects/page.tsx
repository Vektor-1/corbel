import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { INK, PAPER } from '@/lib/brand';

export default function Projects() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: PAPER, color: INK }}>
      <SiteHeader action={{ href: '/editor', label: 'New Project' }} />

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="mb-8 text-4xl font-bold" style={{ color: INK }}>My Projects</h1>

        <div className="border-2 p-12 text-center" style={{ borderColor: INK, backgroundColor: '#f2efe7' }}>
          <p className="mb-4" style={{ color: '#4a5561' }}>No projects yet</p>
          <Link
            href="/editor"
            className="inline-block border-2 px-6 py-3 text-sm font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
            style={{ borderColor: INK, backgroundColor: INK, color: PAPER }}
          >
            Create Your First Project
          </Link>
        </div>
      </main>
    </div>
  );
}
