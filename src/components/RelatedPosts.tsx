import Link from 'next/link';
import { getRelatedPosts } from '@/lib/posts';
import ResponsiveImage from './ResponsiveImage';

// End-of-article internal linking (§SEO): 3–4 same-topic INDEXED posts. Reinstates
// what the WordPress related-posts plugin did — the site's biggest untapped SEO
// lever. Server component; no client JS.
export default function RelatedPosts({ slug }: { slug: string }) {
  const posts = getRelatedPosts(slug, 3);
  if (posts.length === 0) return null;
  return (
    <nav className="relatedPosts" aria-label="Related posts">
      <div className="label" style={{ color: '#F0A93C', marginBottom: 18 }}>
        Keep reading
      </div>
      <div className="relatedGrid">
        {posts.map((post) => (
          <Link key={post.slug} href={`/${post.slug}/`} className="relatedCard edge">
            <div className="relatedCover">
              {post.cover ? (
                <ResponsiveImage
                  cover={post.cover}
                  alt={post.title}
                  sizes="(max-width: 760px) 100vw, 240px"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : null}
            </div>
            <span className="stamp" style={{ color: '#F0A93C' }}>
              {post.dateStamp}
            </span>
            <h3>{post.title}</h3>
          </Link>
        ))}
      </div>
    </nav>
  );
}
