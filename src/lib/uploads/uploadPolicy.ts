/** Maximum size accepted for a plan upload (25 MiB). */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

/** MIME types accepted by the browser and upload endpoints. */
export const ALLOWED_UPLOAD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const ALLOWED_EXTENSIONS_BY_TYPE: Record<string, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
const ALLOWED_UPLOAD_EXTENSIONS = new Set(
  Object.values(ALLOWED_EXTENSIONS_BY_TYPE).flat(),
);
const EXECUTABLE_EXTENSIONS = new Set([
  'app',
  'bat',
  'bash',
  'cmd',
  'command',
  'com',
  'csh',
  'dmg',
  'exe',
  'jar',
  'js',
  'jsx',
  'msi',
  'mjs',
  'ps1',
  'py',
  'rb',
  'sh',
  'vbs',
  'wsf',
]);

const SAFE_UPLOAD_NAME_MESSAGE = 'Unsafe upload filename.';
const INVALID_UPLOAD_MESSAGE = 'Upload a PNG, JPEG, WebP, or PDF up to 25 MB.';
const MAX_UPLOAD_NAME_LENGTH = 180;

function isSafeUploadName(name: string): boolean {
  if (
    name.length === 0 ||
    name.length > MAX_UPLOAD_NAME_LENGTH ||
    name.startsWith('.') ||
    name !== name.trim() ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    /\p{Cc}/u.test(name)
  ) {
    return false;
  }

  const suffixes = name.toLowerCase().split('.');
  const intermediateSuffixes = suffixes.slice(1, -1);
  return !intermediateSuffixes.some((suffix) =>
    EXECUTABLE_EXTENSIONS.has(suffix),
  );
}

function getFinalExtension(name: string): string | undefined {
  const match = /\.([^./]+)$/.exec(name);
  return match?.[1]?.toLowerCase();
}

/**
 * Validate a client-provided upload using only stable, render-safe messages.
 * The filename is intentionally never included in a failure message.
 */
export function validateUploadFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): UploadValidationResult {
  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, message: INVALID_UPLOAD_MESSAGE };
  }

  if (!isSafeUploadName(file.name)) {
    return { ok: false, message: SAFE_UPLOAD_NAME_MESSAGE };
  }

  const extension = getFinalExtension(file.name);
  if (
    !extension ||
    !ALLOWED_EXTENSIONS_BY_TYPE[file.type]?.includes(extension)
  ) {
    return { ok: false, message: INVALID_UPLOAD_MESSAGE };
  }

  return { ok: true };
}

/**
 * Validate a pathname received by a Blob callback without exposing any
 * untrusted path data. Nested upload prefixes are allowed; traversal segments
 * and an unsafe basename are rejected.
 */
export function isSafeUploadPathname(pathname: string): boolean {
  if (!pathname || /\p{Cc}/u.test(pathname)) return false;

  const segments = pathname.split(/[\\/]/);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return false;
  }

  const basename = segments.at(-1) ?? '';
  return (
    isSafeUploadName(basename) &&
    ALLOWED_UPLOAD_EXTENSIONS.has(getFinalExtension(basename) ?? '')
  );
}
