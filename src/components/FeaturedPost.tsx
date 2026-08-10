import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import ResponsiveImage from './ResponsiveImage';

// The featured block at the top of the Blog index. Ported verbatim from the v6
// export; only the image placeholder is bound to the post cover with alt (§5.3).
export default function FeaturedPost({ post }: { post: PostMeta }) {
  return (
    <Link
      href={`/${post.slug}/`}
      className="edge"
      style={{
        position: 'relative',
        display: 'block',
        border: '1px solid rgba(240,169,60,.3)',
        color: '#EDEAE4',
        background: 'linear-gradient(160deg, rgba(240,169,60,.07), transparent 70%)',
      }}
    >
      <span className="brk" style={{ top: -1, left: -1, borderTop: '1px solid', borderLeft: '1px solid' }} />
      <span className="brk" style={{ top: -1, right: -1, borderTop: '1px solid', borderRight: '1px solid' }} />
      <span className="brk" style={{ bottom: -1, left: -1, borderBottom: '1px solid', borderLeft: '1px solid' }} />
      <span className="brk" style={{ bottom: -1, right: -1, borderBottom: '1px solid', borderRight: '1px solid' }} />
      <div className="featSplit">
        <div
          style={{
            aspectRatio: '16/9',
            background: post.cover
              ? undefined
              : 'repeating-linear-gradient(90deg, rgba(240,169,60,.09) 0 1px, transparent 1px 40px), repeating-linear-gradient(180deg, rgba(240,169,60,.09) 0 1px, transparent 1px 40px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            padding: post.cover ? 0 : 20,
            borderRight: '1px solid rgba(240,169,60,.2)',
            overflow: 'hidden',
          }}
        >
          {post.cover ? (
            <ResponsiveImage
              cover={post.cover}
              alt={post.title}
              sizes="(max-width: 900px) 100vw, 55vw"
              priority
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span className="label" style={{ color: '#8A8378' }}>
              [ featured_image ]
            </span>
          )}
        </div>
        <div
          style={{
            padding: 'clamp(30px,4vw,46px) clamp(26px,3.4vw,40px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <span className="label" style={{ color: '#F0A93C', marginBottom: 16 }}>
            Featured
          </span>
          <h2
            style={{
              fontFamily: "'Fraunces','Fraunces Fallback',Georgia,serif",
              fontWeight: 400,
              fontSize: 'clamp(24px,3.2vw,31px)',
              lineHeight: 1.18,
              margin: '0 0 14px',
            }}
          >
            {post.title}
          </h2>
          <p style={{ fontSize: 'clamp(15.5px,1.9vw,16.5px)', lineHeight: 1.6, color: '#A8A199', margin: '0 0 22px' }}>
            {post.excerpt}
          </p>
          <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className="btn" style={{ color: '#F0A93C' }}>
              Read the full breakdown →
            </span>
            <span className="stamp" style={{ color: '#8A8378' }}>
              {post.dateStamp}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
