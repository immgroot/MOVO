import type { Metadata } from 'next';
import './globals.css';
import './polish.css';
import './turn-polish.css';
import './premium.css';
import './connection.css';
import './rules-polish.css';
const origin = new URL(
  process.env.MOVO_PUBLIC_ORIGIN ?? 'http://localhost:3000',
);
export const metadata: Metadata = {
  metadataBase: origin,
  title: 'MOVO — No knock. No home.',
  description:
    'Your next game night. Roll, knock, unlock home. MOVO Knockout is a tabletop rivalry for 2–4 friends, on any screen.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'MOVO — No knock. No home.',
    description:
      'A little luck. A little strategy. A very good reason to get even.',
    type: 'website',
    images: [new URL('/og.png', origin).href],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MOVO — No knock. No home.',
    description: 'Your next game night.',
    images: [new URL('/og.png', origin).href],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
