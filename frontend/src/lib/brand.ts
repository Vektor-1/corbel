/**
 * Corbel's marketing/teaching-surface brand palette: the ink/paper/gold system
 * used on the landing page and its offshoots (`/learn`, `/assessment`).
 *
 * This is a plain constants module, not CSS custom properties. Every current
 * consumer needs a real hex string rather than a `var(--x)` reference --
 * `MaterialsScrollShowcase.tsx` hands `GOLD` to animejs's `animate()`, which
 * interpolates colour numerically and cannot resolve a CSS variable; several
 * call sites also append an alpha suffix (`` `${GOLD}33` ``), which only works
 * on a literal hex value. A shared module gives the same single-source-of-truth
 * benefit without changing how any of that code consumes the colour.
 *
 * This is distinct from the editor's own `.corbel-editor` token system in
 * globals.css, which is CSS-variable-based and already single-sourced. Do not
 * merge the two: they are deliberately different visual languages for
 * deliberately different surfaces (marketing/teaching vs. the drafting tool).
 */
export const INK = '#000f1d';
export const PAPER = '#f7f7f7';
export const GOLD = '#c9a96a';
