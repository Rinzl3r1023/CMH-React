import type { Metadata } from 'next';
import './globals.css';
import ClientEnhancer from '@/components/ClientEnhancer';
import { SITE_NAME, SITE_URL } from '@/lib/site';

// Site-wide metadata defaults. Individual pages override title/description/og.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s`,
  },
  applicationName: SITE_NAME,
};

// Fonts load from Google Fonts so the literal family names used throughout the
// frozen v6 markup ('Fraunces' / 'Manrope' / 'JetBrains Mono') resolve unchanged.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2' +
  '?family=Fraunces:ital,wght@0,300;0,400;0,500;1,300' +
  '&family=Manrope:wght@400;500;600;700' +
  '&family=JetBrains+Mono:wght@400' +
  '&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body>
        {children}
        <ClientEnhancer />
      </body>
    </html>
  );
}
