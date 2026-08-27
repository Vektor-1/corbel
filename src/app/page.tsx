import Link from 'next/link';
import { AlternatingPlanHero } from '@/components/landing/AlternatingPlanHero';
import { VoxelBlockInspector } from '@/components/landing/VoxelBlockInspector';
import { WallThicknessWarning } from '@/components/landing/WallThicknessWarning';
import { Box, Ruler, CheckCircle2, ChevronRight, BookOpen, Layers } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#12110e] text-[#ece7da] font-sans antialiased selection:bg-[#c9a96a]/20 selection:text-[#ece7da]">
      {/* Premium Glassmorphic Header */}
      <header className="sticky top-0 z-50 bg-[#12110e]/80 backdrop-blur border-b border-[#2c2921]">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#ece7da] hover:text-[#c9a96a] transition-colors font-display">
            <Box className="w-6 h-6 text-[#c9a96a]" />
            <span>Corbel</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/about" className="text-sm font-medium text-[#c4bda9] hover:text-[#c9a96a] transition-colors">
              About
            </Link>
            <Link href="/standards" className="text-sm font-medium text-[#c4bda9] hover:text-[#c9a96a] transition-colors">
              Standards
            </Link>
            <Link href="/learn" className="text-sm font-medium text-[#c4bda9] hover:text-[#c9a96a] transition-colors">
              Learn
            </Link>
          </nav>

          <div>
            <Link
              href="/editor"
              className="inline-flex items-center justify-center bg-[#c9a96a] hover:bg-[#dbbd80] text-[#12110e] px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 shadow-md shadow-[#c9a96a]/5"
            >
              Start Designing
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[#2c2921]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Hero Text */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#c9a96a]/10 text-[#c9a96a] border border-[#c9a96a]/20 mb-6 w-fit uppercase tracking-wider">
                Ghana Building Code Studio
              </div>
              <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-[#ece7da] leading-[1.1] mb-6">
                Learn Architecture <br className="hidden sm:inline" />
                by <span className="text-[#c9a96a]">Building</span>
              </h1>
              <p className="text-lg text-[#c4bda9] mb-8 leading-relaxed max-w-xl">
                Corbel is a free, browser-based design tool for high school and tertiary students.
                Draw 2D floor plans, extrude them to 3D voxel models, and receive instant feedback based on local building regulations and structural practices.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/editor"
                  className="inline-flex items-center justify-center gap-2 bg-[#c9a96a] hover:bg-[#dbbd80] text-[#12110e] font-semibold py-3 px-8 rounded-xl transition-all duration-300 shadow-lg shadow-[#c9a96a]/5 hover:shadow-[#c9a96a]/10 hover:-translate-y-0.5"
                >
                  <span>Open Editor</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/learn"
                  className="inline-flex items-center justify-center gap-2 bg-transparent hover:bg-[#1d1b16] text-[#ece7da] border border-[#2c2921] hover:border-[#4d4839] font-semibold py-3 px-8 rounded-xl transition-all duration-300"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>View Tutorials</span>
                </Link>
              </div>
            </div>

            {/* Alternating 2D/3D Hero Graphics */}
            <div className="lg:col-span-5 flex items-center justify-center">
              <div className="w-full">
                <AlternatingPlanHero />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Section */}
      <section className="bg-[#161511]/60 py-20 border-b border-[#2c2921]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#ece7da] mb-4">Why Corbel?</h2>
            <p className="text-[#c4bda9]">
              An interactive visual studio designed to make structural learning intuitive and compliant.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-[#1d1b16]/40 border border-[#2c2921] rounded-xl p-8 hover:border-[#4d4839] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-lg bg-[#c9a96a]/10 flex items-center justify-center text-[#c9a96a] mb-6 group-hover:bg-[#c9a96a]/20 transition-colors">
                <Ruler className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#ece7da] mb-3">Draw & Visualize</h3>
              <p className="text-sm text-[#c4bda9] leading-relaxed">
                Intuitive 2D drafting with real-time 3D voxel visualization. Bridge the gap between technical lines and volumetric space instantly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-[#1d1b16]/40 border border-[#2c2921] rounded-xl p-8 hover:border-[#4d4839] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-lg bg-[#c9a96a]/10 flex items-center justify-center text-[#c9a96a] mb-6 group-hover:bg-[#c9a96a]/20 transition-colors">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#ece7da] mb-3">Instant Feedback</h3>
              <p className="text-sm text-[#c4bda9] leading-relaxed">
                Receive visual warnings if wall baselines violate height restrictions or if lintels lack support. Validate designs against standards during the creative flow.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-[#1d1b16]/40 border border-[#2c2921] rounded-xl p-8 hover:border-[#4d4839] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-lg bg-[#c9a96a]/10 flex items-center justify-center text-[#c9a96a] mb-6 group-hover:bg-[#c9a96a]/20 transition-colors">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#ece7da] mb-3">Learn & Share</h3>
              <p className="text-sm text-[#c4bda9] leading-relaxed">
                Navigate standard layout practices, export vector drawings, and review physical details of bricks, aggregates, and sandcrete mixes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Local Materials & Standards Section */}
      <section className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#ece7da] mb-4">Local Materials & Standards</h2>
            <p className="text-[#c4bda9] leading-relaxed">
              Corbel anchors structural principles in physical construction standards. Analyze material attributes, density distributions, and load-bearing requirements.
            </p>
          </div>

          <div className="flex flex-col gap-12">
            {/* Widget 1: Material Inspector */}
            <div className="bg-[#161511]/80 border border-[#2c2921] rounded-2xl p-6 sm:p-8">
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#c9a96a] tracking-wider uppercase">Interactive Sandbox // 01</span>
                <h3 className="text-xl font-bold text-[#ece7da] mt-1 mb-2">Voxel Block Inspector</h3>
                <p className="text-sm text-[#c4bda9]">
                  Select common structural materials and hover over coordinates to observe block strength, density, and standards compliance (e.g. GS 1207:2018).
                </p>
              </div>
              <VoxelBlockInspector />
            </div>

            {/* Widget 2: Thickness Warning */}
            <div className="bg-[#161511]/80 border border-[#2c2921] rounded-2xl p-6 sm:p-8">
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#c9a96a] tracking-wider uppercase">Interactive Sandbox // 02</span>
                <h3 className="text-xl font-bold text-[#ece7da] mt-1 mb-2">Load-Bearing Wall Compliance</h3>
                <p className="text-sm text-[#c4bda9]">
                  Toggle structural heights and storey layouts. Review how building rules flag thin walls (e.g. 150mm) under high structural load.
                </p>
              </div>
              <WallThicknessWarning />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2c2921] bg-[#12110e] py-12 mt-16 text-[#8b8471]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-[#c9a96a]/70" />
            <span className="font-semibold text-[#ece7da]/90 tracking-tight">Corbel</span>
            <span className="text-xs text-[#8b8471]/60">© 2026</span>
          </div>

          <div className="flex gap-6 text-sm">
            <Link href="/about" className="hover:text-[#c9a96a] transition-colors">About</Link>
            <Link href="/standards" className="hover:text-[#c9a96a] transition-colors">Standards</Link>
            <Link href="/learn" className="hover:text-[#c9a96a] transition-colors">Tutorials</Link>
          </div>

          <div className="text-xs text-right md:text-left text-[#8b8471]/60">
            Open Source | MIT License
          </div>
        </div>
      </footer>
    </main>
  );
}
