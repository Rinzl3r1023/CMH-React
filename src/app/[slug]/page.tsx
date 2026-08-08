import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { compileMDX } from 'next-mdx-remote/rsc';
import '../post.css';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { getAllSlugs, getPost } from '@/lib/posts';
import { getVideosByIds } from '@/lib/youtube';
import { pageMetadata } from '@/lib/metadata';
import HtmlFragment from '@/components/HtmlFragment';
import ResponsiveImage from '@/components/ResponsiveImage';
import JsonLd from '@/components/JsonLd';
import { postGraph } from '@/lib/schema/graphs';

// Root-level post slugs (§1). Static routes (/about, /show, /dispatch, /blog)
// live in their own folders and take precedence; this dynamic segment is the
// catch-all that resolves the remaining root paths to posts. dynamicParams=false
// means only known post slugs render — anything else 404s, so the root namespace
// stays honest (the cost of root slugs, accepted in §1).
export const dynamicParams = false;
// Match /blog: the VideoObject schema reads the shared YouTube Data Cache, which
// revalidates on this cadence.
export const revalidate = 1800;

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
    description: post.excerpt,
    path: `/${post.slug}`,
    type: 'article',
    image: post.cover?.src,
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.body,
    options: { parseFrontmatter: false },
  });

  // VideoObject metadata (title/duration/uploadDate) comes from the shared
  // YouTube cache — reuses the videos.list path, no second API integration (§4.2).
  // Fails closed: no key/metadata -> no VideoObject node, no video link.
  const videoMeta = post.youtubeId ? (await getVideosByIds([post.youtubeId]))[post.youtubeId] : undefined;
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
    video: post.youtubeId
      ? { id: post.youtubeId, title: videoMeta?.title, description: videoMeta?.description, durationIso: videoMeta?.durationIso, uploadDate: videoMeta?.uploadDate, thumbnail: videoMeta?.thumbnail }
      : undefined,
  });

  return (
    <div className="pg-lib pg-alt" style={rootStyle('library.style.txt')}>
      <JsonLd graph={graph} />
      <HtmlFragment html={fragment('library.nav.html')} />

      <article className="postWrap reveal">
        <Link href="/blog" className="btn backlink" style={{ color: '#F0A93C' }}>
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

        {post.cover && (
          <div className="postCover">
            <ResponsiveImage
              cover={post.cover}
              alt={post.title}
              sizes="(max-width: 800px) 100vw, 760px"
              priority
            />
          </div>
        )}

        {/* youtube_id present -> embed renders in the post body (§2.2) */}
        {post.youtubeId && (
          <div className="ytEmbed">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${post.youtubeId}`}
              title={post.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}

        <div className="postBody">{content}</div>
      </article>

      <HtmlFragment html={fragment('library.capfoot.html')} />
    </div>
  );
}
