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
export const SPARC_ID = `${HOME_URL}#sparc`;
export const LIFTIT_ID = `${HOME_URL}#liftit`;

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
  // §7 #4 — confirmed. Machine-readable topical-authority terms for entity
  // matching (not human-facing copy). The audience-label guardrail governs
  // hooks/ad callouts, NOT schema topic tags — so these stay specific on purpose:
  // "AI for coaches and service providers" matches its target queries better than
  // a vaguer phrasing would. Second group added for the AI-visibility Answer Pack.
  knowsAbout: [
    'AI for business owners',
    'AI workflow design',
    'Marketing automation',
    'AI-assisted client management',
    'Content marketing',
    'Marketing operations',
    'Content marketing strategy',
    'AI for coaches and service providers',
    'Meta advertising',
    'Sales funnels and offer construction',
    'Email marketing automation',
    'Business coaching',
  ],
  // §2.1 — certifications are a documented AI-citation input. Only Chris's own
  // credential belongs here; the SamCart award was earned by the Org (see award).
  hasCredential: [
    {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'certification',
      name: 'Certified ClickUp Power User',
    },
  ],
  // §2.2 — Founder Institute (Entrepreneur in Residence).
  alumniOf: {
    '@type': 'Organization',
    name: 'Founder Institute',
    description:
      'Silicon Valley-based startup accelerator. Chris Michael Harris served as Entrepreneur in Residence.',
  },
  // §2.5 — the show as a connected entity. PodcastSeries is a stable schema.org
  // type (a CreativeWorkSeries), which subjectOf accepts.
  subjectOf: {
    '@type': 'PodcastSeries',
    name: 'The CMH Show',
    url: 'https://www.buzzsprout.com/2597359',
    description: 'Marketing and AI for business owners. Running since 2015.',
  },
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
    // §2.4 — Buzzsprout show page after the Libsyn→Buzzsprout migration. Apple/
    // Spotify listings persist across a host change (only the RSS host moved), so
    // they stay. NOTE: none of these could be reachability-checked from the build
    // sandbox (egress-restricted) — confirm they resolve before/at ship.
    'https://www.buzzsprout.com/2597359',
  ],
};

// §7 #2 — confirmed. TBL is the org Chris founded and worksFor; the personal-brand
// site's publisher is the Person. Chris + Kim are co-founders.
export const ORGANIZATION = {
  name: 'The Business Lounge',
  url: 'https://thebusinesslounge.co/',
  coFounderName: 'Kim Jimenez',
  // §3 additions. Description uses the sanctioned "business owners" label (master
  // guardrail §7) rather than the spec's "coaches and service-based business
  // owners". Email uses chris@ per §3.3 (support@kimberlyannjimenez.com is TBL's
  // shared address, not for the personal site). `logo` is deliberately still
  // OMITTED — the tbl-logo.png asset hasn't been delivered, and a broken logo URL
  // is worse than none (§3.1). `legalName` stays off until LLC reinstatement (§3.2).
  description:
    'The Business Lounge helps business owners turn their content into customers using the Content to Customers Method. Founded in 2016 by Chris Michael Harris and Kim Jimenez.',
  foundingDate: '2016',
  email: 'chris@chrismichaelharris.com',
  award: 'SamCart Top 40 Seller',
  areaServedName: 'United States',
  employeesMin: 1,
  employeesMax: 5,
  sameAs: [
    'https://www.youtube.com/@thebusinessloungepod',
    'https://www.instagram.com/thebusinessloungeco',
  ],
  knowsAbout: [
    'Content marketing',
    'Content to Customers Method',
    'Sales funnels',
    'Meta advertising',
    'AI marketing systems',
  ],
  // §7 guardrail: no tier names, no prices. Externally SPARC is only "built on the
  // Content to Customers Method" / "gets more useful the more it's used".
  services: [
    {
      name: 'The Business Lounge Community',
      description:
        'A paid membership for business owners building content systems that produce customers. Live trainings, a full workshop library, and the AI tools built and tested inside the business.',
    },
    {
      name: 'Coaching',
      description:
        'Hands-on work with Chris Michael Harris and Kim Jimenez, built around where a business actually is. Starts with a conversation rather than a purchase.',
    },
    {
      name: 'SPARC Marketing',
      description:
        'An AI marketing system built on the Content to Customers Method, for turning content into revenue rather than producing more of it.',
    },
  ],
};

// §3B — SPARC Marketing as its own resolvable entity. NAME IS "SPARC Marketing"
// (not "Marketer") everywhere from here forward. `owns` on the Person is skipped:
// SoftwareApplication is a CreativeWork, not a Product, so it's out of range for
// Person.owns — the creator/publisher @id refs below carry the relationship.
export const SPARC = {
  name: 'SPARC Marketing',
  url: 'https://sparcmarketing.ai',
  description:
    'An AI marketing system built on the Content to Customers Method. Used by business owners to plan, produce, and repurpose marketing that converts rather than just accumulates. It gets more useful the more it is used.',
};

// §2.1b — Lift It as a separate Organization entity (the canonical modeling;
// `founderOf` on Person is not a real schema.org property). founder → #person.
export const LIFTIT = {
  name: 'Lift It Moving and Storage',
  foundingDate: '2011',
  description:
    "Moving and storage company founded and bootstrapped by Chris Michael Harris at age 25, scaled from $50,000 to $1.2 million in revenue in a little over two years. Served national furniture manufacturers including University Loft Company, Foliot Furniture, and Blue Furniture, and was one of Dickson Furniture's preferred installers in the country.",
};

/** Build-time warning for an omitted/partial node (§1.2). */
export function schemaWarn(msg: string): void {
  console.warn(`[schema] ${msg}`);
}
