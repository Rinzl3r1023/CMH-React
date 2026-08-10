import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { compileMDX } from 'next-mdx-remote/rsc';
import '../post.css';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { getAllSlugs, getPost } from '@/lib/posts';
import { getVideosByIds, liveYouTubeId } from '@/lib/youtube';
import { pageMetadata } from '@/lib/metadata';
import HtmlFragment from '@/components/HtmlFragment';
import ResponsiveImage from '@/components/ResponsiveImage';
import VideoFacade from '@/components/VideoFacade';
import JsonLd from '@/components/JsonLd';
import { postGraph } from '@/lib/schema/graphs';
import DispatchInline from '@/components/DispatchInline';
import CallCTA from '@/components/CallCTA';
import AuthorBlock from '@/components/AuthorBlock';
import KeyTakeaways from '@/components/KeyTakeaways';
import FaqBlock from '@/components/FaqBlock';
import RelatedPosts from '@/components/RelatedPosts';

// Split the body so the mid-article Dispatch lands after the 3rd section (or
// ~50% down for shorter posts). Splits only on top-level h2s outside code fences.
function splitForMidCta(body: string): { before: string; after: string } {
  const lines = body.split('\n');
  let fence = false;
  const h2: number[] = [];
  lines.forEach((ln, i) => {
    if (/^\s*```/.test(ln)) fence = !fence;
    else if (!fence && /^##\s+\S/.test(ln)) h2.push(i);
  });
  if (h2.length >= 2) {
    const nth = Math.min(3, Math.ceil(h2.length / 2)); // 3rd section, or ~50% if fewer
    const cut = h2[nth] ?? h2[h2.length - 1];
    return { before: lines.slice(0, cut).join('\n'), after: lines.slice(cut).join('\n') };
  }
  // No usable heading structure: split by paragraphs at ~50% of the word count.
  const paras = body.split(/\n{2,}/);
  const totalWords = body.split(/\s+/).filter(Boolean).length;
  let acc = 0;
  let k = 0;
  for (; k < paras.length; k++) {
    acc += paras[k].split(/\s+/).filter(Boolean).length;
    if (acc >= totalWords / 2) { k++; break; }
  }
  if (k <= 0 || k >= paras.length) return { before: body, after: '' };
  return { before: paras.slice(0, k).join('\n\n'), after: paras.slice(k).join('\n\n') };
}

// Root-level post slugs (§1). Static routes (/about, /show, /dispatch, /blog)
// live in their own folders and take precedence; this dynamic segment is the
// catch-all that resolves the remaining root paths to posts. dynamicParams=true
// so an unknown root path doesn't hard-404: known legacy pages are 301'd in
// next.config, and anything else this route can't resolve to a post folds to '/'
// (see generateMetadata + the redirect in PostPage). Nothing at the root dead-ends.
export const dynamicParams = true;
// Match /blog: the VideoObject schema reads the shared YouTube Data Cache, which
// revalidates on this cadence.
// Posts change only on deploy (static MDX), so match the fully-static pages' cache
// window rather than the old 30-min ISR: this sets the HTML's s-maxage to a year,
// so once Cloudflare's Cache Rule caches a post it holds it like /about/ (deploys
// purge). The video-metadata fetch is cached a year too (youtube.ts), so it no
// longer drags the route's revalidate down to the shelf's 30 min.
export const revalidate = 31536000;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return pageMetadata({
    title: post.title,
    seoTitle: post.seoTitle,
    description: post.excerpt,
    path: `/${post.slug}`,
    type: 'article',
    image: post.cover?.src,
    noindex: post.noindex,
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  // Unknown root path that isn't a post and wasn't caught by a 301 in
  // next.config: fold to home rather than 404 (§1 — the root namespace never
  // dead-ends). Explicit 307 via redirect(); the curated legacy pages get 301s.
  if (!post) redirect('/');

  // The mid-article Dispatch renders for both cta modes; it needs content on both
  // sides of the split (skip it if the post is too short to split).
  const { before, after } = splitForMidCta(post.body);
  const showMidDispatch = after.trim().length > 0;
  const [beforeNode, afterNode] = showMidDispatch
    ? [
        (await compileMDX({ source: before, options: { parseFrontmatter: false } })).content,
        (await compileMDX({ source: after, options: { parseFrontmatter: false } })).content,
      ]
    : [(await compileMDX({ source: post.body, options: { parseFrontmatter: false } })).content, null];

  // A dead/denylisted id emits no embed and no VideoObject (fail-closed, §4.2).
  const videoId = liveYouTubeId(post.youtubeId);
  // VideoObject metadata (title/duration/uploadDate) comes from the shared
  // YouTube cache — reuses the videos.list path, no second API integration (§4.2).
  // Fails closed: no key/metadata -> no VideoObject node, no video link.
  const videoMeta = videoId ? (await getVideosByIds([videoId]))[videoId] : undefined;
  const graph = postGraph({
    slug: post.slug,
    title: post.title,
    description: post.excerpt,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    coverUrl: post.cover?.src ?? null,
    wordCount: post.wordCount,
    articleSection: post.articleSection,
    keywords: post.keywords,
    faq: post.faq,
    howto: post.howto,
    video: videoId
      ? { id: videoId, title: videoMeta?.title, description: videoMeta?.description, durationIso: videoMeta?.durationIso, uploadDate: videoMeta?.uploadDate, thumbnail: videoMeta?.thumbnail }
      : undefined,
  });

  return (
    <div className="pg-lib pg-alt" style={rootStyle('library.style.txt')}>
      <JsonLd graph={graph} />
      <HtmlFragment html={fragment('library.nav.html')} />

      <article className="postWrap reveal">
        <Link href="/blog/" className="btn backlink" style={{ color: '#F0A93C' }}>
          ← All posts
        </Link>
        <div className="label" style={{ color: '#F0A93C' }}>
          The blog
        </div>
        <h1>{post.title}</h1>
        <div className="postMeta">
          <span className="stamp" style={{ color: '#8A8378' }}>
            {post.dateStamp}
          </span>
          {post.placeholder && (
            <span className="label" style={{ color: '#8A8378' }}>
              · placeholder — full content migrates in Phase 2
            </span>
          )}
        </div>

        {/* A live video post shows the click-to-load facade (cover as poster),
            which never loads the ~1MB player until clicked. A post with no live
            video (incl. dead/denylisted ids -> videoId undefined) shows the plain
            cover hero and no embed at all. The facade's poster IS the cover, so
            video posts don't render it twice. */}
        {videoId ? (
          <VideoFacade videoId={videoId} cover={post.cover} title={post.title} />
        ) : (
          post.cover && (
            <div className="postCover">
              <ResponsiveImage
                cover={post.cover}
                alt={post.title}
                sizes="(max-width: 800px) 100vw, 760px"
                priority
              />
            </div>
          )
        )}

        <KeyTakeaways items={post.takeaways} />

        <div className="postBody">
          {beforeNode}
          {showMidDispatch && <DispatchInline />}
          {afterNode}
        </div>

        <FaqBlock items={post.faq} />
        <RelatedPosts slug={post.slug} />
        {post.cta === 'full' && <CallCTA />}
        <AuthorBlock />
      </article>

      <HtmlFragment html={fragment('library.capfoot.html')} />
    </div>
  );
}
