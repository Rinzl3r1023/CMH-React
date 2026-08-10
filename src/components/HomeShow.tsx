import type { ShowVideo } from '@/lib/youtube';

// Home's "The CMH Show" block. Ported verbatim from the v6 Home export (the
// `.glass .cut` 3-card grid), now bound to the live feed instead of the old
// hardcoded bucket cards. The bucket labels (What's Next / What It Means / Field
// Notes) were retired when the feed went flat, so they're dropped — there's no
// data to populate them. Home's card markup differs from The Show's `.edge`
// VideoCard (glass vs edge chrome), so per the wiring note we keep Home's markup
// and only bind data — reusing The Show's card here would be a visible design
// change. The whole section is a React island so the fail-safe can omit it
// entirely when the feed is unavailable (the parent renders nothing).

const THUMB_GRID =
  'repeating-linear-gradient(90deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px), repeating-linear-gradient(180deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px)';

function ShowCard({ video }: { video: ShowVideo }) {
  return (
    <a href={video.url} className="glass cut" style={{ display: 'block', color: '#EDEAE4', paddingBottom: 26 }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/9', // YouTube thumbnails are 16:9 — match to avoid clipping text-heavy frames
          background: video.thumbnail ? undefined : THUMB_GRID,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          overflow: 'hidden',
        }}
      >
        {video.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <span
          style={{
            position: 'relative',
            width: 50,
            height: 50,
            border: '1px solid rgba(240,169,60,.65)',
            color: '#F0A93C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            boxShadow: '0 0 30px -6px rgba(240,169,60,.75)',
            background: video.thumbnail ? 'rgba(6,6,10,.55)' : undefined,
          }}
        >
          ▶
        </span>
      </div>
      {/* Bucket label intentionally removed; the title takes the label's top margin. */}
      <h3
        style={{
          fontFamily: "'Fraunces','Fraunces Fallback',Georgia,serif",
          fontWeight: 400,
          fontSize: 'clamp(19px,2.3vw,21px)',
          lineHeight: 1.25,
          margin: '22px clamp(20px,2.4vw,26px) 0',
        }}
      >
        {video.title}
      </h3>
    </a>
  );
}

// Renders nothing when there are no videos, so the parent never shows an empty
// block (same fail-safe posture as the Watch shelf).
export default function HomeShow({ videos }: { videos: ShowVideo[] }) {
  if (!videos || videos.length === 0) return null;
  return (
    <section
      className="reveal"
      style={{ position: 'relative', maxWidth: 1260, margin: '0 auto', padding: 'clamp(70px,9vw,110px) clamp(18px,4vw,44px)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 'clamp(34px,4.6vw,52px)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'clamp(18px,2.4vw,26px)' }}>
            <span className="eyebrow" style={{ color: '#F0A93C' }}>
              The CMH Show
            </span>
            <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,169,60,.35), transparent)' }} />
          </div>
          <h2 style={{ fontFamily: "'Fraunces','Fraunces Fallback',Georgia,serif", fontWeight: 300, fontSize: 'clamp(29px,4.6vw,48px)', lineHeight: 1.1, letterSpacing: '-.025em', margin: 0, maxWidth: 580 }}>
            Where I show you what I found.
          </h2>
        </div>
        <a href="/blog/" className="navlink" style={{ whiteSpace: 'nowrap' }}>
          Subscribe on YouTube →
        </a>
      </div>
      <div className="g3">
        {videos.slice(0, 3).map((v, i) => (
          <ShowCard key={v.id || i} video={v} />
        ))}
      </div>
    </section>
  );
}
