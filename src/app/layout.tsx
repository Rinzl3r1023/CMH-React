import type { Metadata } from 'next';
import ReactDOM from 'react-dom';
import './fonts.css';
import './globals.css';
import ClientEnhancer from '@/components/ClientEnhancer';
import BookCallController from '@/components/BookCallController';
import Analytics from '@/components/Analytics';
import { SITE_NAME, SITE_URL } from '@/lib/site';

// Site-wide metadata defaults. Individual pages override title/description/og.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s`,
  },
  applicationName: SITE_NAME,
  // RSS autodiscovery — aggregators find /feed/ from any page (§SEO).
  alternates: { types: { 'application/rss+xml': `${SITE_URL}/feed/` } },
};

// Fonts are self-hosted from /public/fonts — the exact static instances
// extracted byte-for-byte from the v6 export (see src/app/fonts.css). Serving
// Fraunces as those fixed instances (rather than Google's variable font, which
// re-applies optical sizing) keeps letter metrics identical to the design, so
// text wraps exactly as in the export.

// Preload the two above-the-fold faces — Fraunces 300 and Manrope 600, Latin
// subset only. They're declared inside CSS chunks, so without this the browser
// can't discover them until CSS parses (the 750–810ms render-blocking chain), and
// their late swap from the fallback reflows text (the homepage CLS). Preloading
// makes them ready by first paint → text renders in the real font from the start,
// which removes both the render-block AND the swap shift. Fonts are CORS-fetched,
// so the preload needs crossOrigin to match (else it double-downloads).
const PRELOAD_FONTS = [
  '/fonts/9e513b22-fd3a-490c-a9a8-b9d281672416.woff2', // Fraunces 300 normal, Latin
  '/fonts/0f74e651-3f4f-40bb-9877-31cfdbb13a26.woff2', // Manrope 600 normal, Latin
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  PRELOAD_FONTS.forEach((href) =>
    ReactDOM.preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', fetchPriority: 'high' }),
  );
  return (
    <html lang="en">
      <body>
        {children}
        <ClientEnhancer />
        <BookCallController />
        <Analytics />
      </body>
    </html>
  );
}
