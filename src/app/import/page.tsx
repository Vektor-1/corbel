import { redirect } from 'next/navigation';

/** Legacy import URL retained for existing bookmarks. */
export default function ImportPage() {
  redirect('/upload');
}
