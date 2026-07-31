import type { Metadata } from 'next';
import './fonts.css';
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

// Fonts are self-hosted from /public/fonts — the exact static instances
// extracted byte-for-byte from the v6 export (see src/app/fonts.css). Serving
// Fraunces as those fixed instances (rather than Google's variable font, which
// re-applies optical sizing) keeps letter metrics identical to the design, so
// text wraps exactly as in the export.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientEnhancer />
      </body>
    </html>
  );
}
