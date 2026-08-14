import { describe, expect, it } from 'vitest';

import { parseImageBaseline } from '../imageBaseline';

describe('parseImageBaseline', () => {
  it('parses a ghost image URL and blur flag', () => {
    expect(
      parseImageBaseline(
        new URLSearchParams('ghostUrl=https%3A%2F%2Fexample.test%2Fplan.png&blur=true'),
      ),
    ).toEqual({ url: 'https://example.test/plan.png', blur: true });
  });

  it('returns null when no ghost image URL is present', () => {
    expect(parseImageBaseline(new URLSearchParams('blur=true'))).toBeNull();
  });
});
