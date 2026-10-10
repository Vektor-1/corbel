import { cn } from '@/lib/utils';

/**
 * A layout-preserving loading placeholder. Compose a few of these into the
 * approximate shape of what's loading (a title bar, a couple of text lines)
 * instead of a single "Loading…" string, so the page doesn't jump when real
 * content arrives. `prefers-reduced-motion` is already handled globally in
 * globals.css (it collapses every animation's duration to 1ms), so this
 * component doesn't need its own reduced-motion branch.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      role="presentation"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-black/10', className)}
      {...props}
    />
  );
}
