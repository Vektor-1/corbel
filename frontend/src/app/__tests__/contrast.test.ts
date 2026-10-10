import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.x contrast ratio between two sRGB hex colours, computed the same way
 * a manual audit would (relative luminance per the spec formula).
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = (hex.match(/\w\w/g) ?? []).map((component) => parseInt(component, 16) / 255);
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Reads a custom property's hex value out of `globals.css` directly, rather
 * than hardcoding the value here -- so this test fails loudly if the token
 * changes, instead of silently checking a stale copy of it.
 */
function readCssVariable(css: string, name: string, withinSelector: RegExp): string {
  const block = css.match(withinSelector);
  if (!block) throw new Error(`Could not find a CSS block matching ${withinSelector}`);
  const match = block[0].match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Could not find ${name} inside the matched block`);
  return match[1];
}

const AA_NORMAL_TEXT = 4.5;

describe('editor light theme meets WCAG AA contrast', () => {
  const css = readFileSync(path.resolve(__dirname, '..', 'globals.css'), 'utf8');
  // The light theme is the unqualified `.corbel-editor { ... }` block, up to
  // the dark theme's `[data-theme="dark"]` override that follows it.
  const lightThemeBlock = /\.corbel-editor\s*\{[\s\S]*?\n\}/;

  const subtle = readCssVariable(css, '--editor-text-subtle', lightThemeBlock);
  const canvas = readCssVariable(css, '--editor-canvas', lightThemeBlock);
  const surface = readCssVariable(css, '--editor-surface', lightThemeBlock);

  it('regression: --editor-text-subtle vs --editor-canvas (was 4.09:1, failed AA)', () => {
    expect(contrastRatio(subtle, canvas)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('regression: --editor-text-subtle vs --editor-surface (was 4.47:1, failed AA)', () => {
    expect(contrastRatio(subtle, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('the shared caption colour meets WCAG AA contrast', () => {
  // #655e52 replaced #817969 in UploadPage.tsx and research/page.tsx, which
  // failed AA even against a plain white background (4.31:1).
  const caption = '#655e52';

  it('regression: caption colour vs white (was 4.31:1, failed AA)', () => {
    expect(contrastRatio(caption, '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('regression: caption colour vs the upload preview panel background (was 3.40:1, failed AA)', () => {
    expect(contrastRatio(caption, '#e9e4d9')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
