import Link from 'next/link';
import { Box } from 'lucide-react';
import { GOLD, INK, PAPER } from '@/lib/brand';

export interface SiteHeaderAction {
  href: string;
  label: string;
}

/**
 * The shared header for content pages that sit outside the landing page and
 * the editor -- currently `/about`, `/standards`, and `/projects`. Each of
 * those pages previously hand-rolled a near-identical nav bar in a generic
 * Tailwind slate/blue palette unrelated to either the landing page's
 * ink/paper/gold system or the editor's own tokens; this both de-duplicates
 * that markup and brings those pages into the same brand as the rest of the
 * site. The wordmark treatment (Box icon + tracked uppercase "Corbel") is
 * copied from the landing page's own header for visual continuity.
 *
 * `action` renders an optional right-aligned link (`/projects` uses it for
 * "New Project"); pages with nothing to add there simply omit it.
 */
export function SiteHeader({ action }: { action?: SiteHeaderAction }) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b-2 px-4 py-3 sm:px-6"
      style={{ borderColor: INK, backgroundColor: PAPER }}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.08em] transition-opacity hover:opacity-70"
        style={{ color: INK }}
      >
        <Box className="h-5 w-5" style={{ color: GOLD }} />
        Corbel
      </Link>

      {action && (
        <Link
          href={action.href}
          className="border-2 px-4 py-2 text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80"
          style={{ borderColor: INK, backgroundColor: INK, color: PAPER }}
        >
          {action.label}
        </Link>
      )}
    </header>
  );
}
