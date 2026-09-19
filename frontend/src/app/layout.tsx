import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corbel | Learn architecture by building',
  description:
    'A free browser based 2D and 3D design studio for architecture and engineering students, with educational feedback on selected design checks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Visually hidden until focused (first Tab press on any page). Every
            route's <main> carries id="main-content" as the landing target,
            including the editor (see EditorWithCanvas.tsx), which previously
            had no landmark at all to jump to. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
