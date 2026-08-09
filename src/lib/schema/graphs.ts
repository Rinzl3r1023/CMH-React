// Page-graph composers. Each returns the @graph array for one page: the three
// site-wide nodes (Person, Organization, WebSite) plus the page-specific nodes.
// Builders are pure; nulls (omitted partial nodes) are filtered here so the
// JsonLd component only serializes.

import { personNode } from './person';
import { organizationNode } from './organization';
import { websiteNode } from './website';
import { webPageNode } from './webpage';
import { profilePageNode } from './profilePage';
import { collectionPageNode } from './collectionPage';
import { blogPostingNode } from './article';
import { videoObjectNode } from './video';
import { faqPageNode, type FaqItem } from './faq';
import { howToNode } from './howto';
import { breadcrumbNode } from './breadcrumb';
import { HOME_URL, pageUrl, postUrl } from './config';

type Node = Record<string, unknown>;

function siteNodes(): Node[] {
  return [personNode(), organizationNode(), websiteNode()];
}

function clean(nodes: Array<Node | null | undefined>): Node[] {
  return nodes.filter((n): n is Node => Boolean(n));
}

export function homeGraph(opts: { name: string; description?: string }): Node[] {
  return clean([...siteNodes(), webPageNode({ url: HOME_URL, name: opts.name, description: opts.description, about: true })]);
}

export function aboutGraph(opts: { name: string; description?: string }): Node[] {
  return clean([...siteNodes(), profilePageNode({ url: pageUrl('/about'), name: opts.name, description: opts.description })]);
}

export function dispatchGraph(opts: { name: string; description?: string }): Node[] {
  return clean([...siteNodes(), webPageNode({ url: pageUrl('/dispatch'), name: opts.name, description: opts.description })]);
}

export function legalGraph(opts: { path: '/privacy' | '/terms'; name: string; description?: string }): Node[] {
  return clean([...siteNodes(), webPageNode({ url: pageUrl(opts.path), name: opts.name, description: opts.description })]);
}

export function blogGraph(opts: {
  page: number;
  name: string;
  description?: string;
  items: Array<{ url: string; name: string }>;
}): Node[] {
  const url = opts.page <= 1 ? pageUrl('/blog') : pageUrl(`/blog/page/${opts.page}`);
  return clean([...siteNodes(), collectionPageNode({ url, name: opts.name, description: opts.description, items: opts.items })]);
}

export type PostSchemaInput = {
  slug: string;
  title: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  coverUrl?: string | null;
  wordCount?: number;
  articleSection?: string;
  keywords?: string[];
  faq?: FaqItem[];
  howto?: unknown;
  video?: { id: string; title?: string; description?: string; durationIso?: string; uploadDate?: string; thumbnail?: string | null };
};

export function postGraph(post: PostSchemaInput): Node[] {
  const url = postUrl(post.slug);

  const video = post.video
    ? videoObjectNode({ slug: post.slug, url, id: post.video.id, title: post.video.title, description: post.video.description, durationIso: post.video.durationIso, uploadDate: post.video.uploadDate, thumbnail: post.video.thumbnail })
    : null;

  const article = blogPostingNode({
    slug: post.slug,
    url,
    title: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    coverUrl: post.coverUrl,
    wordCount: post.wordCount,
    articleSection: post.articleSection,
    keywords: post.keywords,
    hasVideo: Boolean(video),
  });

  const breadcrumb = breadcrumbNode(url, [
    { name: 'Home', url: HOME_URL },
    { name: 'The Show', url: pageUrl('/blog') },
    { name: post.title, url },
  ]);

  const faq = faqPageNode(url, post.faq, post.slug);
  const howto = howToNode(url, post.howto, post.slug);

  return clean([...siteNodes(), article, video, breadcrumb, faq, howto]);
}
