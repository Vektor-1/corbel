import { redirect } from 'next/navigation';
import { getStudioRedirectPath } from '@/lib/routing/editorRedirect';

type EditorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  redirect(getStudioRedirectPath(await searchParams));
}
