import { upload } from '@vercel/blob/client';
import { validateUploadContent, validateUploadFile } from './uploadPolicy';

/** Upload a validated plan reference for use in either the import page or tutor handoff. */
export async function uploadPlanReference(file: File): Promise<string> {
  const checked = validateUploadFile(file);
  if (!checked.ok) throw new Error(checked.message);
  const content = await validateUploadContent(file);
  if (!content.ok) throw new Error(content.message);
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_BLOB_ENABLED) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/plan-import/local-upload', { method: 'POST', body: form });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) throw new Error(payload.error ?? 'Local upload failed.');
    return payload.url;
  }

  const blob = await upload(`plan-imports/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/plan-import/upload',
  });
  return blob.url;
}
