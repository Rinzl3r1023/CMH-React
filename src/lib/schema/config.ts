// Structured-data configuration (§2, §7). One place for the entity constants and
// the stable @id URLs. Values marked ⚑ still need Chris's confirmation (§7) but
// carry safe provisional defaults from the spec, so the layer ships today.
//
// URL contract (§1.3 / §5): every @id/url must match the site's CANONICAL exactly
// or entity resolution fails silently. This app has no `trailingSlash` config, so
// canonicals are NON-trailing (/about, /<slug>) except the site root, which is "/".
// These helpers encode that — do not hand-append slashes elsewhere.

import { SITE_URL, SITE_NAME, absoluteUrl, canonicalUrl } from '../site';

export { SITE_NAME };

// URL contract (§1.3 / §5): every @id/url matches the site's canonical exactly.
// With `trailingSlash: true`, canonicals are TRAILING-slash (WordPress served the
// same, so migrated URLs land on the page, not a redirect). canonicalUrl() is the
// single source of truth for that format.
export const HOME_URL = canonicalUrl('/');

export const PERSON_ID = `${HOME_URL}#person`;
export const ORG_ID = `${HOME_URL}#organization`;
export const WEBSITE_ID = `${HOME_URL}#website`;

/** Canonical URL for a page path (trailing-slash), matching pageMetadata()/sitemap. */
export function pageUrl(path: string): string {
  return canonicalUrl(path);
}

/** Canonical URL for a root-level post slug (trailing-slash). */
export function postUrl(slug: string): string {
  return canonicalUrl(`/${slug}`);
}

// ⚑ NEEDS FROM CHRIS (§7). Provisional values from the spec — safe to ship, and
// this is the single place to update as the real ones land.
export const PERSON = {
  name: SITE_NAME,
  // §7 #3 — confirmed.
  jobTitle: 'Marketing + AI Strategist',
  description:
    "I keep up with AI and marketing inside a real business, then report back on what matters, what doesn't, and what to do next.",
  image: absoluteUrl('/images/chris-portrait.jpg'),
  // §7 #4 — confirmed. Machine-readable topical-authority terms (not visible copy,
  // so the beacon rule doesn't apply here).
  knowsAbout: [
    'AI for business owners',
    'AI workflow design',
    'Marketing automation',
    'AI-assisted client management',
    'Content marketing',
    'Marketing operations',
  ],
  // §7 #1 — final (seven, Person-only). chrismichaelharris.com is omitted (it's
  // already the Person's url); the TBL co-hosted podcast belongs on the TBL
  // Organization node and resolves through worksFor.
  sameAs: [
    'https://www.youtube.com/@HeyCMH',
    'https://www.linkedin.com/in/heycmh',
    'https://www.instagram.com/heycmh/',
    'https://x.com/heycmh',
    'https://www.facebook.com/HeyCMH/',
    'https://podcasts.apple.com/us/podcast/the-chris-michael-harris-podcast/id1062072161',
    'https://open.spotify.com/show/3eTs0otPEHk9KsLTrLKIbx',
  ],
};

// §7 #2 — confirmed. TBL is the org Chris founded and worksFor; the personal-brand
// site's publisher is the Person. Chris + Kim are co-founders.
export const ORGANIZATION = {
  name: 'The Business Lounge',
  url: 'https://thebusinesslounge.co/',
  coFounderName: 'Kim Jimenez',
};

/** Build-time warning for an omitted/partial node (§1.2). */
export function schemaWarn(msg: string): void {
  console.warn(`[schema] ${msg}`);
}
