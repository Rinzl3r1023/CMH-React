import { PERSON_ID, WEBSITE_ID, schemaWarn } from './config';
import { absoluteUrl } from '../site';

const HEADLINE_MAX = 110; // Google guideline; longer can invalidate the node (§4.1)

export type ArticleInput = {
  slug: string;
  url: string; // canonical page URL (non-trailing), used for @id + mainEntityOfPage
  title: string;
  description?: string;
  datePublished?: string; // ISO 8601; from the WP export, NEVER file mtime (§5)
  dateModified?: string; // ISO 8601; updates on rewrite, unlike datePublished (§4.1)
  coverUrl?: string | null; // absolute or root-relative; absolutised here
  wordCount?: number;
  articleSection?: string;
  keywords?: string[];
  hasVideo?: boolean; // true -> link the sibling VideoObject by @id
};

// BlogPosting (§4.1). Required for a meaningful node: headline, datePublished,
// author, publisher, mainEntityOfPage. Missing datePublished -> omit the node
// entirely (a dateless Article is worse than none, §1.2/§5) and warn.
export function blogPostingNode(post: ArticleInput): Record<string, unknown> | null {
  if (!post.datePublished) {
    schemaWarn(`BlogPosting omitted for "${post.slug}": no datePublished (would use today's date — never do that, §5).`);
    return null;
  }
  if (!post.title) {
    schemaWarn(`BlogPosting omitted for "${post.slug}": no title/headline.`);
    return null;
  }

  let headline = post.title;
  if (headline.length > HEADLINE_MAX) {
    schemaWarn(`headline truncated to ${HEADLINE_MAX} chars for "${post.slug}".`);
    headline = headline.slice(0, HEADLINE_MAX).trimEnd();
  }

  const node: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': `${post.url}#article`,
    headline,
    datePublished: post.datePublished,
    dateModified: post.dateModified || post.datePublished,
    author: { '@id': PERSON_ID },
    publisher: { '@id': PERSON_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.url },
    isPartOf: { '@id': WEBSITE_ID },
    inLanguage: 'en-US',
  };
  if (post.description) node.description = post.description;
  if (post.coverUrl) node.image = { '@type': 'ImageObject', url: absoluteUrl(post.coverUrl) };
  if (typeof post.wordCount === 'number' && post.wordCount > 0) node.wordCount = post.wordCount;
  if (post.articleSection) node.articleSection = post.articleSection;
  if (post.keywords && post.keywords.length) node.keywords = post.keywords;
  if (post.hasVideo) node.video = { '@id': `${post.url}#video` };

  return node;
}
