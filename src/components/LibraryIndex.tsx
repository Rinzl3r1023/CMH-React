import { notFound } from 'next/navigation';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { getFeaturedPost, getGridPosts } from '@/lib/posts';
import { getShowVideos } from '@/lib/youtube';
import { POSTS_PER_PAGE } from '@/lib/site';
import HtmlFragment from './HtmlFragment';
import FeaturedPost from './FeaturedPost';
import PostCard from './PostCard';
import Pagination from './Pagination';
import WatchShelf, { PLACEHOLDER_VIDEOS } from './WatchShelf';

// The Library (v6) lives at /blog to keep the blog's SEO equity, labelled
// "The Show" in the nav (/show 301s here). It combines a flat Watch shelf and
// the Read grid. Static chrome (nav, hero, capture, footer) are the ported v6
// fragments; Watch, the featured post, the grid, and pagination are the data
// islands. Page 1 shows everything; deeper pages show just the Read grid.
export default async function LibraryIndex({ page }: { page: number }) {
  const featured = getFeaturedPost();
  const grid = getGridPosts();
  const totalPages = Math.max(1, Math.ceil(grid.length / POSTS_PER_PAGE));
  if (page < 1 || page > totalPages) notFound();

  const start = (page - 1) * POSTS_PER_PAGE;
  const pagePosts = grid.slice(start, start + POSTS_PER_PAGE);

  const liveVideos = page === 1 ? await getShowVideos() : null;
  const videos = liveVideos ?? PLACEHOLDER_VIDEOS;

  return (
    <div style={rootStyle('library.style.txt')}>
      <HtmlFragment html={fragment('library.nav.html')} />

      {page === 1 && <HtmlFragment html={fragment('library.hero.html')} />}

      {/* ── Watch (flat shelf) — page 1 only ── */}
      {page === 1 && (
        <section
          id="watch"
          className="reveal"
          style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(40px,5vw,60px) clamp(18px,4vw,44px) clamp(60px,7vw,86px)' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 'clamp(26px,3.4vw,36px)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 240 }}>
              <h2 className="eyebrow" style={{ color: '#EDEAE4', margin: 0 }}>
                Watch
              </h2>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,169,60,.28), transparent)' }} />
            </div>
            <a href="https://www.youtube.com/@HeyCMH" className="navlink" style={{ whiteSpace: 'nowrap' }}>
              Subscribe on YouTube →
            </a>
          </div>
          <WatchShelf videos={videos} />
        </section>
      )}

      {/* ── Read (blog grid + pagination) ── */}
      <section
        id="read"
        className="reveal"
        style={{
          position: 'relative',
          padding: 'clamp(60px,8vw,96px) clamp(18px,4vw,44px) clamp(70px,9vw,110px)',
          borderTop: '1px solid rgba(240,169,60,.14)',
          background: 'linear-gradient(180deg, rgba(240,169,60,.035), transparent 40%)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 'clamp(10px,1.6vw,14px)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 240 }}>
              <h2 className="eyebrow" style={{ color: '#EDEAE4', margin: 0 }}>
                Read
              </h2>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,169,60,.28), transparent)' }} />
            </div>
          </div>
          <p style={{ fontSize: 'clamp(15px,1.8vw,16px)', lineHeight: 1.6, color: '#8A8378', margin: '0 0 clamp(26px,3.4vw,36px)', maxWidth: 560 }}>
            The longer pieces — full walkthroughs, step by step. Want the short version instead?{' '}
            <a href="/dispatch" style={{ fontWeight: 600 }}>
              The Dispatch
            </a>{' '}
            lands once a week. →
          </p>

          {page === 1 && featured && (
            <div style={{ marginBottom: 22 }}>
              <FeaturedPost post={featured} />
            </div>
          )}

          {pagePosts.length > 0 ? (
            <div className="cardGrid">
              {pagePosts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          ) : (
            <p style={{ color: '#8A8378', fontSize: 15.5 }}>No posts yet. New breakdowns land here as they publish.</p>
          )}

          <Pagination currentPage={page} totalPages={totalPages} />
        </div>
      </section>

      <HtmlFragment html={fragment('library.capfoot.html')} />
    </div>
  );
}
