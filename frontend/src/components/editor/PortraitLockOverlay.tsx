'use client';

import { useEffect, useRef, useState } from 'react';
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
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const open = isPortraitPhone && !dismissed;

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

  // This visually blocks the whole editor, but until focus is actually moved
  // in and kept here, Tab still reaches the (invisible-behind-it) editor
  // controls underneath -- a real trap for a keyboard user, not just a visual
  // one. There's exactly one focusable element, so both halves of the fix are
  // simple: focus it on open, and re-focus it if Tab/Shift+Tab ever tries to
  // leave (which, with one element, is every Tab press).
  useEffect(() => {
    if (open) dismissButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--editor-bg)] px-8 text-center"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate your device"
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          dismissButtonRef.current?.focus();
        }
      }}
    >
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]">
        <Smartphone className="h-8 w-8 rotate-90" />
        <RotateCw className="absolute -right-2 -top-2 h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold text-[var(--editor-text)]">Rotate your device</h2>
      <p className="max-w-xs text-sm text-[var(--editor-text-muted)]">
        Corbel works best in landscape — rotate your device to continue comfortably.
      </p>
      <Button ref={dismissButtonRef} variant="secondary" size="sm" onClick={() => setDismissed(true)}>
        Got it, continue anyway
      </Button>
    </div>
  );
}
