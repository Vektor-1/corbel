// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import About from '../about/page';
import Standards from '../standards/page';
import Projects from '../projects/page';

/**
 * A per-route automated a11y smoke test, using axe-core (via jest-axe) against
 * a real render. This catches only what axe can detect statically -- missing
 * labels, contrast failures against DOM-visible colours, invalid ARIA, missing
 * landmarks and the like -- not genuine usability issues like "is this
 * actually operable by keyboard", which the targeted tests elsewhere in this
 * workstream cover. Scoped to the routes that render as plain components with
 * no client-only browser API calls during the initial render (fetch, canvas,
 * matchMedia, localStorage) -- the editor, upload, and other client-heavy
 * routes would need substantially more mocking to render meaningfully here
 * and are better exercised by a real browser in manual/E2E testing instead.
 */
describe('static route accessibility smoke tests', () => {
  it('/about has no automatically-detectable violations', async () => {
    const { container } = render(<About />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('/standards has no automatically-detectable violations', async () => {
    const { container } = render(<Standards />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('/projects has no automatically-detectable violations', async () => {
    const { container } = render(<Projects />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
