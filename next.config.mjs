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
  // Post cover images are co-located in /content and served through the
  // ResponsiveImage component, which uses next/image (backed by sharp) to
  // generate AVIF -> WebP -> JPEG variants at 400/800/1200/1600 (§3.2).
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [400, 800, 1200, 1600],
    imageSizes: [400, 800, 1200, 1600],
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
};

export default nextConfig;
