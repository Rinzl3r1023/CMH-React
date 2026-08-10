import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Legacy WordPress *page* URLs -> 301 targets. Generated from the pages export
// (migration/redirect-map.json) so the list is auditable and regeneratable, not
// hand-maintained. Retired funnels/opt-ins/thank-you pages all fold to '/';
// a handful of curated pages point at /about/, /blog/, /dispatch/, /privacy/,
// /terms/. Post slugs and real routes are excluded at generation time, so
// nothing here shadows a live page. Root-level post slugs are served by the
// [slug] route; anything it can't resolve falls through to '/' there.
const __dir = dirname(fileURLToPath(import.meta.url));
const pageRedirects = JSON.parse(readFileSync(join(__dir, 'migration/redirect-map.json'), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WordPress served every URL with a trailing slash (confirmed from the WXR
  // export's <link> values, e.g. https://chrismichaelharris.com/ep106/). Serving
  // the exact same paths keeps the migration invisible to Google — every indexed
  // URL lands on the page, not a redirect. Canonicals, sitemap, schema @ids/urls,
  // and internal links are all trailing-slash to match.
  trailingSlash: true,
  // Post covers no longer use the runtime optimizer — they're pre-rendered to
  // static WebP variants at build (scripts/sync-covers.mjs) and served directly by
  // ResponsiveImage as a <picture> (§perf). This config only governs any remaining
  // next/image use. Trimmed from the previous [400,800,1200,1600] on BOTH
  // deviceSizes and imageSizes: those identical arrays collided into duplicate
  // srcset entries, and 1600 upscaled the 1200-wide covers for nothing. WebP only
  // (AVIF's cold encode was the LCP cost we removed); widths capped at the 1200
  // source; imageSizes holds only the small in-content widths.
  images: {
    formats: ['image/webp'],
    deviceSizes: [400, 800, 1200],
    imageSizes: [256, 384],
  },
  // The blog previously lived at WordPress-generated routes. Anything that is
  // intentionally not carried forward gets a 301 here (§1.1). Root-level post
  // slugs are served by the [slug] catch-all, NOT redirected.
  async redirects() {
    // Every legacy WordPress page URL -> its 301 target, generated from the
    // pages export. Explicit 301 (not Next's default 308) per the migration
    // decision. /show and /ai-services are part of this list; the [slug] route
    // handles root-level *post* slugs and folds any unknown path to '/'.
    return pageRedirects;
  },
  async headers() {
    // Post covers (originals + build-generated WebP variants) are static files
    // that never change in place, but Next serves /public with max-age=0, so every
    // browser revisit pays a revalidation round-trip. Cache them hard: Cloudflare
    // already edge-caches the extension, this covers the CLIENT. `immutable` means
    // no revalidation at all — safe because the content is fixed for a given path.
    // (A cover redesign that reuses the same filename would need a query/version
    // bump to bust client caches; today the art is deterministic per slug.)
    return [
      {
        source: '/post-covers/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
