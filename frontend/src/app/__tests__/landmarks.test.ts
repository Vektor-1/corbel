import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the skip link and the editor's landmark/heading.
 *
 * `EditorWithCanvas` can't be meaningfully mounted under jsdom for a real
 * render test -- it depends on Konva/`react-konva` canvas rendering and a
 * live `useDesignStore` instance, neither of which jsdom provides. Verified
 * instead by reading the source directly, the same way the contrast
 * regression test reads `globals.css` rather than hardcoding a colour.
 * Cross-checked once against the actual server-rendered HTML for both routes
 * before this test was written.
 */
const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');

describe('skip link', () => {
  const layout = read('app/layout.tsx');

  it('exists and points at #main-content', () => {
    expect(layout).toMatch(/href="#main-content"/);
  });

  it('is visually hidden until focused', () => {
    // Regression target for the skip link's own accessibility: present in
    // the DOM but off-screen by default, so it doesn't show a stray link
    // above every page for sighted users, and reveals itself on Tab focus.
    expect(layout).toMatch(/sr-only[^"]*focus:not-sr-only/);
  });
});

describe('the editor route has a landmark and a heading', () => {
  const editor = read('components/editor/EditorWithCanvas.tsx');

  it('has exactly one <main id="main-content">', () => {
    const mainMatches = editor.match(/<main\b/g) ?? [];
    expect(mainMatches).toHaveLength(1);
    expect(editor).toMatch(/<main\s+id="main-content"/);
  });

  it('has exactly one <h1>, naming the page', () => {
    const h1Matches = editor.match(/<h1\b/g) ?? [];
    expect(h1Matches).toHaveLength(1);
    expect(editor).toMatch(/<h1[^>]*>Corbel floor plan editor<\/h1>/);
  });
});
