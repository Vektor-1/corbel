import { describe, expect, it } from 'vitest';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  isSafeUploadPathname,
  validateUploadFile,
} from '../uploadPolicy';

describe('upload policy', () => {
  it('accepts the maximum size', () => {
    expect(
      validateUploadFile({
        name: 'plan.pdf',
        type: 'application/pdf',
        size: MAX_UPLOAD_SIZE_BYTES,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects empty and oversized files with the stable type message', () => {
    const expected = {
      ok: false,
      message: 'Upload a PNG, JPEG, WebP, or PDF up to 25 MB.',
    } as const;
    expect(validateUploadFile({ name: 'plan.pdf', type: 'application/pdf', size: 0 })).toEqual(expected);
    expect(validateUploadFile({ name: 'plan.pdf', type: 'application/pdf', size: MAX_UPLOAD_SIZE_BYTES + 1 })).toEqual(expected);
  });

  it('accepts every allowed MIME and extension pair', () => {
    const valid = [
      ['image/png', 'plan.png'],
      ['image/jpeg', 'plan.jpg'],
      ['image/jpeg', 'plan.jpeg'],
      ['image/webp', 'plan.webp'],
      ['application/pdf', 'plan.pdf'],
    ] as const;
    expect(ALLOWED_UPLOAD_TYPES).toHaveLength(4);
    for (const [type, name] of valid) {
      expect(validateUploadFile({ name, type, size: 1 })).toEqual({ ok: true });
    }
  });

  it.each([
    '../plan.pdf',
    'plan.pdf.exe',
    '.hidden.pdf',
    `plan\u0000.pdf`,
    'a'.repeat(181) + '.pdf',
  ])('rejects unsafe filename %j without echoing it', (name) => {
    const result = validateUploadFile({ name, type: 'application/pdf', size: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain(name);
  });

  it('rejects mismatched and unknown MIME/extension pairs', () => {
    expect(validateUploadFile({ name: 'plan.pdf', type: 'image/png', size: 1 }).ok).toBe(false);
    expect(validateUploadFile({ name: 'plan.png', type: 'application/pdf', size: 1 }).ok).toBe(false);
    expect(validateUploadFile({ name: 'plan.gif', type: 'image/gif', size: 1 }).ok).toBe(false);
  });

  it('validates blob pathnames by their safe basename', () => {
    expect(isSafeUploadPathname('/uploads/plan.pdf')).toBe(true);
    expect(isSafeUploadPathname('../plan.pdf')).toBe(false);
    expect(isSafeUploadPathname('/uploads/.hidden.pdf')).toBe(false);
    expect(isSafeUploadPathname('/uploads/plan.pdf.exe')).toBe(false);
  });
});
