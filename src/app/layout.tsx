import type { Metadata } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'Corbel - Architectural Design for Ghana',
  description:
    'Free, browser-based 2D/3D architectural design tool for Ghanaian students, with Ghana Building Code feedback',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
