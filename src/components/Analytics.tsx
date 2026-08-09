import Script from 'next/script';
import { GoogleAnalytics } from '@next/third-parties/google';

// Google tags, fail-closed like Calendly/Kit: nothing loads unless the matching
// env var is set, so preview/local builds ship no tags and can't leak hits.
// NEXT_PUBLIC_* values are inlined at build time — Railway must have them set at
// build for the tags to appear in production.
//
// GA4 goes through Next's official @next/third-parties integration. The Google
// Ads conversion tag (AW-…) has no first-party component, so it rides the same
// gtag.js: when GA is present, gtag.js is already loaded and we only push its
// config; when GA is absent, we load gtag.js ourselves for Ads. Both share the
// one `dataLayer`, which gtag.js drains on load — so execution order is moot.
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
  if (!gaId && !gadsId) return null;

  return (
    <>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
      {gadsId ? (
        <>
          {gaId ? null : (
            <Script
              id="_gads-lib"
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gadsId}`}
            />
          )}
          <Script id="_gads-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}${
              gaId ? '' : "gtag('js', new Date());"
            }gtag('config', '${gadsId}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}
