import type { ShowBucket, ShowVideo } from '@/lib/youtube';

const CHANNEL = 'https://www.youtube.com/@HeyCMH';

// Fallback dataset: the exact placeholder cards from the v6 Show export. Rendered
// verbatim until the three playlist ids are supplied (§7 #2), so the page looks
// designed in the meantime instead of empty.
export const PLACEHOLDER_BUCKETS: ShowBucket[] = [
  {
    index: '01',
    title: "What's Next",
    subtitle: 'Opportunities coming into view.',
    videos: [
      'The shift in search that quietly changes how clients find you',
      'Where coaching goes when everyone has the same tools',
      'The one skill that gets more valuable, not less',
    ].map((t) => ({ id: '', title: t, url: CHANNEL, thumbnail: null })),
  },
  {
    index: '02',
    title: 'What It Means',
    subtitle: 'Decoding the tools, minus the jargon.',
    videos: [
      'The one automation worth setting up first',
      '"Prompting" without the intimidating word for it',
      'What "it gets better the more you use it" really means for you',
    ].map((t) => ({ id: '', title: t, url: CHANNEL, thumbnail: null })),
  },
  {
    index: '03',
    title: 'Field Notes',
    subtitle: "What I'm testing right now, live.",
    videos: [
      'I tested six content tools this month. Here’s the keeper.',
      'A week of running my content by voice from my phone',
      'The campaign I almost didn’t run — and what it beat',
    ].map((t) => ({ id: '', title: t, url: CHANNEL, thumbnail: null })),
  },
];

// One video card. Ported verbatim from the v6 Show export's repeated card; the
// only change is binding the thumbnail when a real video provides one (otherwise
// the design's grid-pattern placeholder box is kept).
function ShowCard({ video }: { video: ShowVideo }) {
  return (
    <a
      href={video.url}
      className="edge"
      style={{ display: 'block', color: '#EDEAE4', border: '1px solid rgba(237,234,228,.13)', paddingBottom: 26 }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/10',
          background:
            'linear-gradient(150deg, rgba(240,169,60,.10), transparent 65%), repeating-linear-gradient(90deg, rgba(240,169,60,.10) 0 1px, transparent 1px 34px), repeating-linear-gradient(180deg, rgba(240,169,60,.10) 0 1px, transparent 1px 34px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(237,234,228,.13)',
          overflow: 'hidden',
        }}
      >
        {video.thumbnail && (
          // YouTube-hosted thumbnail (external, already optimised) — plain img,
          // not the sharp pipeline, which is reserved for our own post covers.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <span
          className="play"
          style={{
            position: 'relative',
            width: 50,
            height: 50,
            border: '1px solid rgba(240,169,60,.7)',
            color: '#F0A93C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            boxShadow: '0 0 30px -6px rgba(240,169,60,.8)',
            background: video.thumbnail ? 'rgba(6,6,10,.55)' : undefined,
          }}
        >
          ▶
        </span>
      </div>
      <h4
        style={{
          fontFamily: "'Fraunces',serif",
          fontWeight: 400,
          fontSize: 20,
          lineHeight: 1.26,
          margin: '24px 26px 0',
        }}
      >
        {video.title}
      </h4>
    </a>
  );
}

export default function ShowBuckets({ buckets }: { buckets: ShowBucket[] }) {
  // Empty buckets hide, not render as gaps (§4.3).
  const visible = buckets.filter((b) => b.videos.length > 0);
  return (
    <>
      {visible.map((bucket, i) => {
        const isLast = i === visible.length - 1;
        return (
          <section
            key={bucket.index}
            className="reveal"
            style={{
              maxWidth: 1180,
              margin: '0 auto',
              padding: `${i === 0 ? 90 : 80}px 44px ${isLast ? 110 : 0}px`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 14 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: '.14em', color: '#F0A93C' }}>
                {bucket.index}
              </span>
              <h3
                style={{
                  fontFamily: "'Manrope',sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: '.2em',
                  textTransform: 'uppercase',
                  margin: 0,
                  color: '#EDEAE4',
                }}
              >
                {bucket.title}
              </h3>
            </div>
            <p style={{ fontSize: 16, color: '#8A8378', margin: '0 0 36px' }}>{bucket.subtitle}</p>
            <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
              {bucket.videos.map((v, idx) => (
                <ShowCard key={v.id || idx} video={v} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
