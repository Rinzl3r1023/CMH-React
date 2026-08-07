import type { ShowVideo } from '@/lib/youtube';
import LoadMore from './LoadMore';

const CHANNEL = 'https://www.youtube.com/@HeyCMH';

// Flat placeholder shelf: rendered until the YouTube API key + a playlist id are
// supplied (§7 #2). Ported from the v6 placeholder cards so the page looks
// designed in the meantime. The featured slot is first.
export const PLACEHOLDER_VIDEOS: ShowVideo[] = [
  {
    id: '',
    title: 'What the new AI models actually change for coaches',
    excerpt:
      'The headlines are loud. The real change is small, specific, and genuinely good news for you. Here’s what to pay attention to — and what you can ignore.',
    url: CHANNEL,
    dateStamp: '',
    thumbnail: null,
  },
  { id: '', title: 'The shift in search that quietly changes how clients find you', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
  { id: '', title: 'Where coaching goes when everyone has the same tools', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
  { id: '', title: 'The one automation worth setting up first', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
  { id: '', title: '“Prompting” without the intimidating word for it', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
  { id: '', title: 'I tested six content tools this month. Here’s the keeper.', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
  { id: '', title: 'A week of running my content by voice from my phone', excerpt: '', url: CHANNEL, dateStamp: '', thumbnail: null },
];

function FeaturedVideo({ video }: { video: ShowVideo }) {
  return (
    <a
      href={video.url}
      className="edge"
      style={{
        position: 'relative',
        display: 'block',
        border: '1px solid rgba(240,169,60,.3)',
        color: '#EDEAE4',
        background: 'linear-gradient(160deg, rgba(240,169,60,.07), transparent 70%)',
        marginBottom: 22,
      }}
    >
      <span className="brk" style={{ top: -1, left: -1, borderTop: '1px solid', borderLeft: '1px solid' }} />
      <span className="brk" style={{ top: -1, right: -1, borderTop: '1px solid', borderRight: '1px solid' }} />
      <span className="brk" style={{ bottom: -1, left: -1, borderBottom: '1px solid', borderLeft: '1px solid' }} />
      <span className="brk" style={{ bottom: -1, right: -1, borderBottom: '1px solid', borderRight: '1px solid' }} />
      <div className="featSplit">
        <div
          style={{
            position: 'relative',
            aspectRatio: '16/9',
            background: video.thumbnail
              ? undefined
              : 'repeating-linear-gradient(90deg, rgba(240,169,60,.09) 0 1px, transparent 1px 40px), repeating-linear-gradient(180deg, rgba(240,169,60,.09) 0 1px, transparent 1px 40px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: '1px solid rgba(240,169,60,.2)',
            overflow: 'hidden',
          }}
        >
          {video.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.thumbnail} alt={video.title} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <span
            className="play"
            style={{
              position: 'relative',
              width: 70,
              height: 70,
              border: '1px solid rgba(240,169,60,.75)',
              color: '#F0A93C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              boxShadow: '0 0 40px -8px rgba(240,169,60,.9)',
              background: video.thumbnail ? 'rgba(6,6,10,.55)' : undefined,
            }}
          >
            ▶
          </span>
        </div>
        <div style={{ padding: 'clamp(30px,4vw,46px) clamp(26px,3.4vw,40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="label" style={{ color: '#F0A93C', marginBottom: 16 }}>
            Latest episode
          </span>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontWeight: 400, fontSize: 'clamp(24px,3.2vw,31px)', lineHeight: 1.18, margin: '0 0 14px' }}>
            {video.title}
          </h3>
          {video.excerpt && (
            <p style={{ fontSize: 'clamp(15.5px,1.9vw,16.5px)', lineHeight: 1.6, color: '#A8A199', margin: '0 0 22px' }}>{video.excerpt}</p>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className="btn" style={{ color: '#F0A93C' }}>
              Watch now →
            </span>
            {video.dateStamp && (
              <span className="stamp" style={{ color: '#8A8378' }}>
                {video.dateStamp}
              </span>
            )}
          </span>
        </div>
      </div>
    </a>
  );
}

function VideoCard({ video }: { video: ShowVideo }) {
  return (
    <a
      href={video.url}
      className="edge"
      style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(237,234,228,.13)', color: '#EDEAE4', paddingBottom: 26 }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '16/10',
          background: video.thumbnail
            ? undefined
            : 'repeating-linear-gradient(90deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px), repeating-linear-gradient(180deg, rgba(240,169,60,.08) 0 1px, transparent 1px 34px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(237,234,228,.13)',
          overflow: 'hidden',
        }}
      >
        {video.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail} alt={video.title} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
      {video.dateStamp && (
        <span className="stamp" style={{ display: 'block', margin: '22px clamp(20px,2.4vw,26px) 0', color: '#F0A93C' }}>
          {video.dateStamp}
        </span>
      )}
      <h3 style={{ fontFamily: "'Fraunces',serif", fontWeight: 400, fontSize: 'clamp(19px,2.3vw,21px)', lineHeight: 1.25, margin: `${video.dateStamp ? '10px' : '22px'} clamp(20px,2.4vw,26px) 0` }}>
        {video.title}
      </h3>
    </a>
  );
}

export default function WatchShelf({ videos }: { videos: ShowVideo[] }) {
  if (videos.length === 0) return null;
  const [featured, ...rest] = videos;
  return (
    <>
      <FeaturedVideo video={featured} />
      {rest.length > 0 && (
        <LoadMore
          gridClassName="cardGrid"
          initial={6}
          step={6}
          label="Load more videos"
          items={rest.map((v, i) => <VideoCard key={v.id || i} video={v} />)}
        />
      )}
    </>
  );
}
