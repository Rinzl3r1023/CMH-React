import { notFound } from 'next/navigation';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { getFeaturedPost, getGridPosts } from '@/lib/posts';
import { POSTS_PER_PAGE } from '@/lib/site';
import HtmlFragment from './HtmlFragment';
import FeaturedPost from './FeaturedPost';
import PostCard from './PostCard';
import Pagination from './Pagination';

// Shared Blog index used by /blog (page 1) and /blog/page/[n]. Static nav+header
// and capture+footer are the ported v6 fragments; the featured block, post grid,
// and pagination are the React data islands (§5.3, §5.4).
export default function BlogIndex({ page }: { page: number }) {
  const featured = getFeaturedPost();
  const grid = getGridPosts();
  const totalPages = Math.max(1, Math.ceil(grid.length / POSTS_PER_PAGE));

  if (page < 1 || page > totalPages) notFound();

  const start = (page - 1) * POSTS_PER_PAGE;
  const pagePosts = grid.slice(start, start + POSTS_PER_PAGE);

  return (
    <div style={rootStyle('blog.style.txt')}>
      <HtmlFragment html={fragment('blog.top.html')} />

      {/* Featured block — only on the first page */}
      {page === 1 && featured && (
        <section
          className="reveal"
          style={{
            position: 'relative',
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0 clamp(18px,4vw,44px) clamp(60px,7vw,90px)',
          }}
        >
          <FeaturedPost post={featured} />
        </section>
      )}

      {/* Latest posts grid + real pagination */}
      <section
        className="reveal"
        style={{
          position: 'relative',
          maxWidth: 1180,
          margin: '0 auto',
          padding: '0 clamp(18px,4vw,44px) clamp(70px,9vw,110px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'clamp(26px,3.4vw,38px)' }}>
          <h2 className="eyebrow" style={{ color: '#EDEAE4', margin: 0 }}>
            Latest posts
          </h2>
          <span
            style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,169,60,.28), transparent)' }}
          />
        </div>

        {pagePosts.length > 0 ? (
          <div className="postGrid">
            {pagePosts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p style={{ color: '#8A8378', fontSize: 15.5 }}>
            No posts yet. New breakdowns land here as they publish.
          </p>
        )}

        <Pagination currentPage={page} totalPages={totalPages} />
      </section>

      <HtmlFragment html={fragment('blog.bottom.html')} />
    </div>
  );
}
