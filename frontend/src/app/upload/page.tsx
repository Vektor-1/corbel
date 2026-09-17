import UploadPage from '@/components/upload/UploadPage';
import { Suspense } from 'react';

export default function Page() {
  return <Suspense fallback={null}><UploadPage /></Suspense>;
}
