import { describe, expect, it } from 'vitest';
import { getStudioRedirectPath } from '../editorRedirect';

describe('getStudioRedirectPath', () => {
  it('redirects an editor visit without a query to Studio', () => {
    expect(getStudioRedirectPath({})).toBe('/studio');
  });

  it('preserves a single trace-mode query value', () => {
    expect(getStudioRedirectPath({ mode: 'trace' })).toBe('/studio?mode=trace');
  });

  it('preserves repeated query values and their insertion order', () => {
    expect(getStudioRedirectPath({ mode: ['trace', 'other'], fixture: 'trace-4' })).toBe(
      '/studio?mode=trace&mode=other&fixture=trace-4'
    );
  });
});
