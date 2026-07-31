import 'server-only';

// The Show pulls from YouTube (§4). Long-form only, no Shorts — achieved by
// construction: each editorial bucket maps to a hand-curated YouTube playlist
// (§4.2), so there is no duration heuristic and no isShort guessing. The API key
// lives only here, server-side; it never reaches client JS (§4.3). Same rule as Kit.

export type ShowVideo = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
};

export type ShowBucket = {
  index: string; // "01" / "02" / "03"
  title: string;
  subtitle: string;
  playlistId?: string;
  videos: ShowVideo[];
};

// The three editorial buckets and their copy, ported from the v6 Show export.
// Each pulls its own playlist; order within a playlist is manual, so position 1
// is the featured slot (§4.2).
const BUCKETS: { index: string; title: string; subtitle: string; envKey: string }[] = [
  { index: '01', title: "What's Next", subtitle: 'Opportunities coming into view.', envKey: 'YOUTUBE_PLAYLIST_WHATS_NEXT' },
  { index: '02', title: 'What It Means', subtitle: 'Decoding the tools, minus the jargon.', envKey: 'YOUTUBE_PLAYLIST_WHAT_IT_MEANS' },
  { index: '03', title: 'Field Notes', subtitle: "What I'm testing right now, live.", envKey: 'YOUTUBE_PLAYLIST_FIELD_NOTES' },
];

const MAX_PER_BUCKET = 6;

function bestThumb(thumbs: Record<string, { url: string }> | undefined): string | null {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url ||
    null
  );
}

async function fetchPlaylist(playlistId: string, apiKey: string): Promise<ShowVideo[]> {
  const url =
    'https://www.googleapis.com/youtube/v3/playlistItems' +
    `?part=snippet&maxResults=${MAX_PER_BUCKET}` +
    `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`;

  // Cache server-side with interval revalidation — never call YouTube per page
  // load (quota + latency on a page that changes twice a week, §4.3).
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        resourceId?: { videoId?: string };
        thumbnails?: Record<string, { url: string }>;
      };
    }>;
  };

  return (data.items ?? [])
    .map((it) => {
      const s = it.snippet;
      const id = s?.resourceId?.videoId;
      if (!id || !s?.title || s.title === 'Private video' || s.title === 'Deleted video') return null;
      return {
        id,
        title: s.title,
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: bestThumb(s.thumbnails),
      } satisfies ShowVideo;
    })
    .filter((v): v is ShowVideo => v !== null);
}

// Returns live buckets when configured (API key + at least one playlist id),
// otherwise null so the page can fall back to the frozen v6 placeholder layout.
// Empty buckets are dropped by the caller, never rendered as gaps (§4.3).
export async function getShowBuckets(): Promise<ShowBucket[] | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const configured = BUCKETS.filter((b) => process.env[b.envKey]);
  if (configured.length === 0) return null;

  const results = await Promise.all(
    BUCKETS.map(async (b) => {
      const playlistId = process.env[b.envKey];
      let videos: ShowVideo[] = [];
      if (playlistId) {
        try {
          videos = await fetchPlaylist(playlistId, apiKey);
        } catch {
          videos = [];
        }
      }
      return { index: b.index, title: b.title, subtitle: b.subtitle, playlistId, videos } satisfies ShowBucket;
    }),
  );

  return results;
}

export function isShowConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY) && BUCKETS.some((b) => process.env[b.envKey]);
}
