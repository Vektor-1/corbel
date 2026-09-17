'use client';

import { useEffect, useState } from 'react';
import { RotateCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

const QUERY = '(max-width: 767px) and (orientation: portrait)';

/**
 * Full-screen prompt nudging phone-sized portrait viewports to rotate to
 * landscape, where the editor's mobile layout (bottom-sheet inspector +
 * bottom-center tool dock) has room to work. Dismissal is per-session
 * (plain state, not persisted) so it re-prompts on a fresh load or after
 * rotating away and back -- a one-time nudge, not a permanent lockout.
 */
export function PortraitLockOverlay() {
  const [isPortraitPhone, setIsPortraitPhone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setIsPortraitPhone(mql.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsPortraitPhone(event.matches);
      if (event.matches) setDismissed(false);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  if (!isPortraitPhone || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--editor-bg)] px-8 text-center"
      role="dialog"
      aria-label="Rotate your device"
    >
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]">
        <Smartphone className="h-8 w-8 rotate-90" />
        <RotateCw className="absolute -right-2 -top-2 h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-[var(--editor-text)]">Rotate your device</h2>
      <p className="max-w-xs text-sm text-[var(--editor-text-muted)]">
        Corbel works best in landscape — rotate your device to continue comfortably.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setDismissed(true)}>
        Got it, continue anyway
      </Button>
    </div>
  );
}
