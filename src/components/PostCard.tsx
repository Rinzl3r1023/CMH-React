import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import ResponsiveImage from './ResponsiveImage';

// One blog grid card. Ported verbatim from the v6 Blog export's repeated card;
// componentised because it appears nine times. The only change from the mock is
// the punch-list one: the static "[ featured_image ]" placeholder box now binds
// to the post cover with alt text (§5.3). Posts without a cover keep the design's
// placeholder box unchanged.
export default function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link
      href={`/${post.slug}/`}
      className="edge"
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(237,234,228,.13)',
        color: '#EDEAE4',
        paddingBottom: 26,
      }}
    >
      <div
        style={{
          aspectRatio: '16/10',
          background: post.cover
            ? undefined
            : 'repeating-linear-gradient(90deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px), repeating-linear-gradient(180deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: post.cover ? 0 : 14,
          borderBottom: '1px solid rgba(237,234,228,.13)',
          overflow: 'hidden',
        }}
      >
        {post.cover ? (
          <ResponsiveImage
            cover={post.cover}
            alt={post.title}
            sizes="(max-width: 660px) 100vw, (max-width: 1040px) 50vw, 33vw"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span className="label" style={{ color: '#8A8378', fontSize: 9.5 }}>
            [ featured_image ]
          </span>
        )}
      </div>
      <span
        className="stamp"
        style={{ display: 'block', margin: '22px clamp(20px,2.4vw,26px) 0', color: '#F0A93C' }}
      >
        {post.dateStamp}
      </span>
      <h3
        style={{
          fontFamily: "'Fraunces',serif",
          fontWeight: 400,
          fontSize: 'clamp(19px,2.3vw,21px)',
          lineHeight: 1.25,
          margin: '10px clamp(20px,2.4vw,26px) 0',
        }}
      >
        {post.title}
      </h3>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: '#A8A199',
          margin: '12px clamp(20px,2.4vw,26px) 0',
        }}
      >
        {post.excerpt}
      </p>
    </Link>
  );
}
