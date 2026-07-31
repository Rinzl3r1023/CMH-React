import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { compileMDX } from 'next-mdx-remote/rsc';
import '../post.css';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { getAllSlugs, getPost } from '@/lib/posts';
import { pageMetadata } from '@/lib/metadata';
import HtmlFragment from '@/components/HtmlFragment';
import ResponsiveImage from '@/components/ResponsiveImage';

// Root-level post slugs (§1). Static routes (/about, /show, /dispatch, /blog)
// live in their own folders and take precedence; this dynamic segment is the
// catch-all that resolves the remaining root paths to posts. dynamicParams=false
// means only known post slugs render — anything else 404s, so the root namespace
// stays honest (the cost of root slugs, accepted in §1).
export const dynamicParams = false;

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

  return (
    <div style={rootStyle('blog.style.txt')}>
      <HtmlFragment html={fragment('blog.nav.html')} />

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

      <HtmlFragment html={fragment('blog.bottom.html')} />
    </div>
  );
}
