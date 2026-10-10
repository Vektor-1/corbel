// Vitest setup for DOM-rendering tests (opted into per-file via
// `// @vitest-environment jsdom`). Registers Testing Library's automatic
// unmount-and-clear-the-DOM step after every test -- without it, each
// `render()` call in a file leaks into the next test's `document.body`,
// which produces misleading failures (e.g. axe reporting two <main>
// landmarks because two tests' output is sitting in the DOM at once).
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
