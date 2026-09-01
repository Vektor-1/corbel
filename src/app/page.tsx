import Link from 'next/link';
import { AlternatingPlanHero } from '@/components/landing/AlternatingPlanHero';
import { MaterialsScrollShowcase } from '@/components/landing/MaterialsScrollShowcase';
import { ScrollReveal } from '@/components/landing/ScrollReveal';
import { TaglineReveal } from '@/components/landing/TaglineReveal';
import { Box, Ruler, CheckCircle2, ChevronRight, Layers, ArrowUpRight } from 'lucide-react';

/**
 * Layout system measured from https://overflow.sui.io/ (Webflow, TWK Everett,
 * ink #000f1d on off-white #f7f7f7, 2px hard borders, 0 radius, docked
 * bottom tab-bar nav) and re-applied to Corbel's own content, per
 * fable-site-replication's substitution-declaration rule:
 *
 *  - Font: TWK Everett is a paid commercial face -> substituted with Space
 *    Grotesk (Google Fonts), the closest free geometric grotesk at this
 *    tight tracking / weight.
 *  - Accent color: the source's signature blue (#4da2ff) is Sui's brand
 *    color -> substituted with Corbel's own established gold (#c9a96a) to
 *    avoid brand impersonation; the *structural* pattern (one flat bold
 *    accent on ink+off-white) is kept 1:1.
 *  - Copy, logos, sponsors: fully replaced with Corbel's own content —
 *    none of the source's text or partner marks are reproduced.
 *  - The three dark "Interactive Sandbox" widgets keep their tuned dark
 *    console styling and now sit inside hard-edged ink-bordered frames,
 *    read as embedded product panels against the light shell (a legitimate
 *    adaptation, not present in the source, declared here).
 */

const INK = '#000f1d';
const PAPER = '#f7f7f7';
const PAPER_MUTED = '#efefef';
const GOLD = '#c9a96a';

const NAV_TABS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Materials', href: '#materials' },
  { label: 'Standards', href: '/standards' },
  { label: 'Learn', href: '/learn' },
];

export default function Home() {
  return (
    <main
      className="min-h-screen font-sans antialiased pb-20 sm:pb-16"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      {/* Split top bar — wordmark left, ink meta cell right (measured pattern) */}
      <header className="sticky top-0 z-50 flex items-stretch border-b-2" style={{ borderColor: INK, backgroundColor: PAPER }}>
        <div className="flex-1 flex items-center gap-2.5 px-4 sm:px-6 py-3">
          <Box className="w-5 h-5" style={{ color: GOLD }} />
          <Link href="/" className="text-sm font-bold uppercase tracking-[0.08em] hover:opacity-70 transition-opacity">
            Corbel
          </Link>
        </div>
        <div
          className="flex items-center gap-2 px-4 sm:px-6 text-[11px] font-mono uppercase tracking-widest"
          style={{ backgroundColor: INK, color: PAPER }}
        >
          <span style={{ color: GOLD }}>&lt;standard&gt;</span>
          <span className="hidden sm:inline">GS 1207:2018</span>
          <span className="sm:hidden">GS 1207</span>
          <span style={{ color: GOLD }}>&lt;/standard&gt;</span>
        </div>
      </header>

      {/* Hero */}
      <section id="overview" className="relative overflow-hidden border-b-2" style={{ borderColor: INK }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Giant wordmark + value prop, measured tracking/weight pattern */}
            <div className="lg:col-span-7">
              <h1
                className="font-[family-name:var(--font-brutal)] font-medium leading-[0.92] uppercase mb-6"
                style={{ fontSize: 'clamp(3rem, 9vw, 7rem)', letterSpacing: '-0.035em', color: INK }}
              >
                Corbel
              </h1>
              <p className="text-xl sm:text-2xl font-semibold mb-3 max-w-lg leading-snug text-balance">
                See your floor plan in 2D and 3D.
              </p>
              <p className="text-sm sm:text-base mb-6 leading-relaxed max-w-lg text-pretty" style={{ color: '#4a5561' }}>
                Corbel is a free browser studio for architecture and engineering students.
                Draw a plan, examine its spatial form, and learn from selected design checks as you work.
              </p>

              <div className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold" style={{ color: '#4a5561' }}>
                <span>Free to use</span>
                <span aria-hidden="true" style={{ color: GOLD }}>•</span>
                <span>Runs in your browser</span>
                <span aria-hidden="true" style={{ color: GOLD }}>•</span>
                <span>No installation</span>
              </div>

              <div className="flex flex-wrap gap-0">
                <Link
                  href="/editor"
                  className="group inline-flex items-stretch active:scale-[0.98] transition-transform font-semibold text-sm"
                >
                  <span
                    className="inline-flex items-center px-6 py-3.5 border-2"
                    style={{ backgroundColor: INK, color: PAPER, borderColor: INK }}
                  >
                    Open Editor
                  </span>
                  <span
                    className="inline-flex items-center justify-center px-3.5 border-2 border-l-0 group-hover:brightness-95 transition-[filter]"
                    style={{ backgroundColor: GOLD, borderColor: INK }}
                  >
                    <ArrowUpRight className="w-4 h-4" style={{ color: INK }} />
                  </span>
                </Link>
                <Link href="/learn" className="inline-flex items-center px-4 py-3.5 text-sm font-semibold underline decoration-2 underline-offset-4 hover:opacity-70" style={{ color: INK }}>Read the tutorials</Link>
              </div>
            </div>

            {/* Boxed illustration — grid backdrop + ink frame, measured pattern */}
            <div className="lg:col-span-5">
              <div
                className="relative border-2 p-4 sm:p-6"
                style={{
                  borderColor: INK,
                  backgroundColor: PAPER_MUTED,
                  backgroundImage: `linear-gradient(${GOLD}33 1px, transparent 1px), linear-gradient(90deg, ${GOLD}33 1px, transparent 1px)`,
                  backgroundSize: '28px 28px',
                }}
              >
                <AlternatingPlanHero />
              </div>
            </div>
          </div>
        </div>
      </section>

      <TaglineReveal lines={["Move from technical lines", "to spatial decisions you can explain."]} />

      {/* Docked bottom tab-bar nav — measured pattern (fixed, segmented, hard borders) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 hidden sm:flex border-t-2 text-xs font-semibold uppercase tracking-wide"
        style={{ borderColor: INK, backgroundColor: PAPER }}
        aria-label="Section navigation"
      >
        {NAV_TABS.map((tab, i) => (
          <Link
            key={tab.label}
            href={tab.href}
            className="flex-1 flex items-center justify-center py-4 border-r-2 hover:bg-black/5 transition-colors"
            style={{
              borderColor: INK,
              backgroundColor: i === 0 ? GOLD : 'transparent',
              color: INK,
            }}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href="/editor"
          className="flex items-center gap-2 px-6 py-4 hover:brightness-110 transition-[filter]"
          style={{ backgroundColor: INK, color: PAPER }}
        >
          Open Editor
          <ArrowUpRight className="w-3.5 h-3.5" style={{ color: GOLD }} />
        </Link>
      </nav>

      {/* Core Capabilities */}
      <section id="capabilities" className="py-20 sm:py-24 border-b-2" style={{ borderColor: INK }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl mb-16">
            <h2 className="font-[family-name:var(--font-brutal)] font-medium uppercase text-3xl sm:text-4xl mb-4" style={{ letterSpacing: '-0.02em' }}>
              Why Corbel?
            </h2>
            <p className="text-sm sm:text-base text-pretty" style={{ color: '#4a5561' }}>
              Build understanding through drawing, visual comparison, and clear next steps for selected design checks.
            </p>
          </div>

          {/* Borderless numbered index — deliberately unlike the boxed-grid
              pattern used elsewhere, so no two sections share a silhouette */}
          <div className="flex flex-col">
            {[
              { n: '01', icon: Ruler, title: 'Draw and visualize', body: 'Draft walls, rooms, doors, and windows in 2D, then inspect the same plan in a spatial 3D view.' },
              { n: '02', icon: CheckCircle2, title: 'Review each decision', body: 'Corbel flags selected wall, opening, and room conditions, explains what was detected, and suggests a next step.' },
              { n: '03', icon: Layers, title: 'Compare and improve', body: 'Use a reference baseline to review a redesign, explain changes, export a portable plan, and continue later.' },
            ].map((f, i) => (
              <ScrollReveal key={f.title} delay={i * 0.1}>
                <div
                  className={`grid grid-cols-12 items-center gap-6 sm:gap-10 py-10 border-t-2 ${i === 2 ? 'border-b-2' : ''} group`}
                  style={{ borderColor: INK }}
                >
                  <span
                    className="col-span-3 sm:col-span-2 font-[family-name:var(--font-brutal)] font-medium leading-none group-hover:text-[var(--gold)] transition-colors"
                    style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: '#dfdfdf', ['--gold' as string]: GOLD }}
                  >
                    {f.n}
                  </span>
                  <div className="col-span-2 sm:col-span-1 flex justify-center">
                    <div className="w-11 h-11 flex items-center justify-center border-2" style={{ borderColor: INK, backgroundColor: GOLD }}>
                      <f.icon className="w-5 h-5" style={{ color: INK }} />
                    </div>
                  </div>
                  <div className="col-span-7 sm:col-span-5">
                    <h3 className="text-base sm:text-lg font-bold uppercase tracking-wide">{f.title}</h3>
                  </div>
                  <p className="hidden sm:block col-span-4 text-xs leading-relaxed" style={{ color: '#4a5561' }}>{f.body}</p>
                  <p className="col-span-12 sm:hidden text-xs leading-relaxed pl-[calc(25%+0.5rem)]" style={{ color: '#4a5561' }}>{f.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Local Materials & Standards — scroll-choreographed, not a static
          grid: GSAP ScrollTrigger pins the index while three live heerich
          panels scroll past, anime.js drives the active-step transition. */}
      <MaterialsScrollShowcase />

      {/* Trust ticker — one continuous inline-flowing line, no boxes/grid,
          so its silhouette reads nothing like the capabilities list or the
          numbered console section above it */}
      <section className="py-8 border-b-2 overflow-hidden" style={{ borderColor: INK, backgroundColor: GOLD }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2 text-center">
          {[
            ['GS 1207:2018', 'Code-Referenced Checks'],
            ['100%', 'Free & Open Source'],
            ['0', 'Installs Required'],
            ['MIT', 'Licensed, Forkable'],
          ].flatMap(([stat, label], i, arr) => {
            const item = (
              <span key={stat} className="whitespace-nowrap">
                <span className="font-[family-name:var(--font-brutal)] text-lg sm:text-xl font-medium" style={{ color: INK }}>{stat}</span>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest ml-2" style={{ color: '#3a2e14' }}>{label}</span>
              </span>
            );
            return i < arr.length - 1
              ? [item, <span key={`${stat}-sep`} aria-hidden="true" style={{ color: INK }} className="opacity-40">/</span>]
              : [item];
          })}
        </div>
      </section>

      <section className="border-b-2 px-4 py-20 sm:px-6 sm:py-24" style={{ borderColor: INK }}>
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <h2 className="font-[family-name:var(--font-brutal)] text-3xl font-medium uppercase sm:text-4xl" style={{ letterSpacing: '-0.02em' }}>Before you start</h2>
            <p className="mt-4 text-sm leading-relaxed text-pretty" style={{ color: '#4a5561' }}>Corbel is a learning tool. These answers explain what the current prototype supports and where professional review is still needed.</p>
          </div>
          <div className="lg:col-span-8">
            {[
              ['Is Corbel free to use?', 'Yes. The prototype runs in the browser and does not require a software installation.'],
              ['Can I start without an account?', 'Yes. You can open the editor and begin drawing directly in the browser.'],
              ['Can I bring in an existing plan?', 'Yes. You can upload a plan for reconstruction when an AI provider is configured, or open a saved Corbel design file.'],
              ['Where is my work kept?', 'You can save a local browser snapshot and download a portable plan file to keep a copy outside the browser.'],
              ['What do the design checks mean?', 'They are educational prompts for selected conditions. They help you inspect a decision but do not certify building code compliance.'],
              ['Can Corbel replace an architect or engineer?', 'No. Use it to practise and discuss design choices. Qualified professionals remain responsible for construction decisions and approvals.'],
            ].map(([question, answer], index) => (
              <details key={question} className="group border-t-2 py-4" style={{ borderColor: INK }} open={index === 0}>
                <summary className="cursor-pointer list-none pr-8 text-base font-semibold marker:content-none" style={{ color: INK }}>
                  <span className="flex items-center justify-between gap-4">{question}<ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" /></span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty" style={{ color: '#4a5561' }}>{answer}</p>
              </details>
            ))}
            <div className="border-t-2" style={{ borderColor: INK }} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-20 sm:py-24 px-4 sm:px-6 border-b-2" style={{ borderColor: INK, backgroundColor: INK }}>
        <div className="relative mx-auto max-w-3xl text-center">
          <h2
            className="font-[family-name:var(--font-brutal)] font-medium uppercase leading-[0.95] mb-6"
            style={{ fontSize: 'clamp(2rem, 6vw, 4rem)', letterSpacing: '-0.02em', color: PAPER }}
          >
            Start learning <span style={{ color: GOLD }}>by building</span>
          </h2>
          <p className="text-sm sm:text-base mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: '#a3adba' }}>
            Draw a floor plan, watch it extrude into 3D, and see it checked against
            the Ghana Building Code in real time — free, in your browser, right now.
          </p>
          <Link
            href="/editor"
            className="inline-flex items-stretch active:scale-[0.98] transition-transform font-semibold text-sm"
          >
            <span className="inline-flex items-center px-8 py-3.5 border-2" style={{ backgroundColor: GOLD, color: INK, borderColor: GOLD }}>
              Open Editor
            </span>
            <span className="inline-flex items-center justify-center px-3.5 border-2 border-l-0" style={{ backgroundColor: PAPER, borderColor: GOLD }}>
              <ArrowUpRight className="w-4 h-4" style={{ color: INK }} />
            </span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10" style={{ backgroundColor: PAPER, color: '#4a5561' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4" style={{ color: GOLD }} />
            <span className="font-semibold text-xs uppercase tracking-[0.08em]" style={{ color: INK }}>Corbel</span>
            <span className="text-[10px]">© 2026</span>
          </div>

          <div className="flex gap-6 text-[10px] font-semibold uppercase tracking-wider">
            <Link href="/about" className="hover:opacity-70 transition-opacity" style={{ color: INK }}>About</Link>
            <Link href="/standards" className="hover:opacity-70 transition-opacity" style={{ color: INK }}>Standards</Link>
            <Link href="/learn" className="hover:opacity-70 transition-opacity" style={{ color: INK }}>Tutorials</Link>
          </div>

          <div className="text-[10px] font-mono">Open Source | MIT License</div>
        </div>
      </footer>
    </main>
  );
}
