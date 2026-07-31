import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL, OG_IMAGE_PATH, absoluteUrl } from './site';

type PageMetaInput = {
  title: string;
  description: string;
  /** Route path for this page, e.g. "/about". Used for canonical + og:url. */
  path: string;
  /** og:title override; falls back to title. */
  ogTitle?: string;
  /** og:description override; falls back to description. */
  ogDescription?: string;
  /** Absolute or root-relative image path. Defaults to the site OG card. */
  image?: string;
  /** "website" (default) or "article" for posts. */
  type?: 'website' | 'article';
};

// Builds a complete, correct Metadata object for a page. This is the single
// place that guarantees the v6-audit fixes hold everywhere (§5.1):
//   • og:image is ABSOLUTE (was relative "og-card.png" — failed on every share)
//   • og:url is absolute and per-page
//   • twitter:card is present on every page (was Blog-only)
export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absoluteUrl(input.path);
  const image = absoluteUrl(input.image || OG_IMAGE_PATH);
  return {
    metadataBase: new URL(SITE_URL),
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.ogTitle || input.title,
      description: input.ogDescription || input.description,
      url,
      siteName: SITE_NAME,
      type: input.type || 'website',
      images: [{ url: image, width: 1200, height: 630, alt: input.ogTitle || input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.ogTitle || input.title,
      description: input.ogDescription || input.description,
      images: [image],
    },
  };
}
