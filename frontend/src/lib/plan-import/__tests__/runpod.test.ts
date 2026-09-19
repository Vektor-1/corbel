import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAllowedImportUrl } from '../runpod';

/**
 * `isAllowedImportUrl` is a server-side security boundary, not an ordinary
 * validator: `app/api/plan-import/jobs/route.ts` uses it to decide whether the
 * server is allowed to `fetch()` a user-supplied URL before handing it to the
 * vision provider. A permissive bug here is a server-side request forgery
 * (SSRF) hole -- the server becomes a proxy an attacker can point at internal
 * infrastructure. Every case below is written from that threat model, not from
 * "does this look like a URL".
 */

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  setEnv({ NODE_ENV: 'production', PLAN_IMPORT_ALLOWED_HOSTS: undefined });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isAllowedImportUrl — protocol', () => {
  it('rejects plain http in production, even to an allowed host', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'example.com' });
    expect(isAllowedImportUrl('http://example.com/plan.png')).toBe(false);
  });

  it('accepts https to an allowed host', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'example.com' });
    expect(isAllowedImportUrl('https://example.com/plan.png')).toBe(true);
  });

  it('rejects a non-http(s) scheme that could reach local resources', () => {
    // file:// and other schemes are how an SSRF check that only looks at
    // hostname gets bypassed entirely; this must fail before hostname is ever read.
    expect(isAllowedImportUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedImportUrl('ftp://example.com/plan.png')).toBe(false);
  });

  it('rejects an unparseable string instead of throwing', () => {
    expect(isAllowedImportUrl('not a url')).toBe(false);
    expect(isAllowedImportUrl('')).toBe(false);
  });
});

describe('isAllowedImportUrl — the Vercel blob host', () => {
  it('accepts any subdomain of the trusted blob storage suffix', () => {
    expect(isAllowedImportUrl('https://abc123.public.blob.vercel-storage.com/x.png')).toBe(true);
  });

  it('rejects a host that merely contains the trusted suffix as a substring', () => {
    // The classic allowlist bypass: a hostname engineered so the trusted string
    // appears, but not as the actual domain suffix.
    expect(isAllowedImportUrl('https://blob.vercel-storage.com.evil.example/x.png')).toBe(false);
  });

  it('rejects a host that only resembles the trusted suffix', () => {
    expect(isAllowedImportUrl('https://notblob.vercel-storage.com.attacker.net/x')).toBe(false);
  });
});

describe('isAllowedImportUrl — the configured allowlist', () => {
  it('rejects every host when nothing is configured', () => {
    expect(isAllowedImportUrl('https://example.com/plan.png')).toBe(false);
  });

  it('accepts a host present in PLAN_IMPORT_ALLOWED_HOSTS', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'trusted.example.com' });
    expect(isAllowedImportUrl('https://trusted.example.com/plan.png')).toBe(true);
  });

  it('rejects a host not present in the configured list', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'trusted.example.com' });
    expect(isAllowedImportUrl('https://untrusted.example.com/plan.png')).toBe(false);
  });

  it('matches case-insensitively on both sides', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'Trusted.Example.COM' });
    expect(isAllowedImportUrl('https://TRUSTED.EXAMPLE.com/plan.png')).toBe(true);
  });

  it('parses a comma-separated list and trims whitespace', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: ' a.example.com , b.example.com ' });
    expect(isAllowedImportUrl('https://a.example.com/x')).toBe(true);
    expect(isAllowedImportUrl('https://b.example.com/x')).toBe(true);
    expect(isAllowedImportUrl('https://c.example.com/x')).toBe(false);
  });

  it('does not treat the allowlist as a suffix match, only exact hostnames', () => {
    // If this matched by suffix, an attacker could register evil-example.com.
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'example.com' });
    expect(isAllowedImportUrl('https://evil-example.com/x')).toBe(false);
    expect(isAllowedImportUrl('https://example.com.evil.net/x')).toBe(false);
  });

  it('ignores empty entries produced by a trailing comma', () => {
    setEnv({ PLAN_IMPORT_ALLOWED_HOSTS: 'example.com,' });
    expect(isAllowedImportUrl('https://example.com/x')).toBe(true);
    expect(isAllowedImportUrl('https:///x')).toBe(false); // no host at all
  });
});

describe('isAllowedImportUrl — the localhost/development exception', () => {
  it('never allows localhost outside development, regardless of the allowlist', () => {
    setEnv({ NODE_ENV: 'production' });
    expect(isAllowedImportUrl('https://localhost/plan.png')).toBe(false);
    expect(isAllowedImportUrl('http://localhost/plan.png')).toBe(false);
  });

  it('allows plain http to localhost only in development', () => {
    setEnv({ NODE_ENV: 'development' });
    expect(isAllowedImportUrl('http://localhost/plan.png')).toBe(true);
  });

  it('does not extend the development exception to other local-sounding hosts', () => {
    // 127.0.0.1 and *.localhost are common attempts to reach local services;
    // the check is an exact hostname match against the literal string "localhost".
    setEnv({ NODE_ENV: 'development' });
    expect(isAllowedImportUrl('http://127.0.0.1/plan.png')).toBe(false);
    expect(isAllowedImportUrl('http://internal.localhost/plan.png')).toBe(false);
  });

  it('still requires https for a non-localhost host even in development', () => {
    setEnv({ NODE_ENV: 'development', PLAN_IMPORT_ALLOWED_HOSTS: 'example.com' });
    expect(isAllowedImportUrl('http://example.com/plan.png')).toBe(false);
  });
});
