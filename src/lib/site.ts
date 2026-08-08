// Central site configuration. Values that differ between environments come from
// env vars; everything stable lives here.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://chrismichaelharris.com'
).replace(/\/$/, '');

export const SITE_NAME = 'Chris Michael Harris';

// The social share card, 1200x630 (§5.1). Lives under /public/images (§7.1).
export const OG_IMAGE_PATH = '/images/og-card.png';

// Primary navigation. Routing is fixed here (§5.2): clean paths, no .dc.html,
// no spaces, no version numbers.
export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'The Show', href: '/show' },
  { label: 'The Dispatch', href: '/dispatch' },
  { label: 'Blog', href: '/blog' },
] as const;

// How many posts per blog index page. Drives real pagination (§5.4).
export const POSTS_PER_PAGE = 9;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Canonical page URL — ALWAYS trailing-slash, to match WordPress's served URLs
// and Next's `trailingSlash: true` routing. Use this for <link rel=canonical>,
// og:url, the sitemap, and schema @id/url. Do NOT use it for asset URLs (images):
// those are files and must not gain a trailing slash — use absoluteUrl for them.
export function canonicalUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path.replace(/\/?$/, '/');
  const trimmed = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `${SITE_URL}/${trimmed}/` : `${SITE_URL}/`;
}
