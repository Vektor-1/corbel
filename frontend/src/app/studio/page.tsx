import { redirect } from 'next/navigation';

/** Legacy studio URL retained for existing bookmarks. */
export default function StudioPage() {
  redirect('/editor');
}
