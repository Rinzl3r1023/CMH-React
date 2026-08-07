import 'server-only';

// The Library's Watch shelf pulls from YouTube (§4). Long-form only, no Shorts —
// achieved by construction: videos come from hand-curated playlists (§4.2), so
// there is no duration heuristic and no isShort guessing. The v6 Library dropped
// the three editorial buckets in favour of one flat, reverse-chronological shelf
// (the "start flat until there's volume" option, §4.3). The API key lives only
// here, server-side; it never reaches client JS (§4.3). Same rule as Kit.

export type ShowVideo = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  dateStamp: string;
  thumbnail: string | null;
};

// Playlists to flatten into the shelf. Any that are set contribute; the rest are
// ignored. Add YOUTUBE_PLAYLIST_LIBRARY for a single dedicated long-form playlist,
// or reuse the three bucket playlists — all are merged, newest first.
const PLAYLIST_ENVS = [
  'YOUTUBE_PLAYLIST_LIBRARY',
  'YOUTUBE_PLAYLIST_WHATS_NEXT',
  'YOUTUBE_PLAYLIST_WHAT_IT_MEANS',
  'YOUTUBE_PLAYLIST_FIELD_NOTES',
];

const SHELF_LIMIT = 7; // 1 featured + 6 in the grid

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

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

type RawItem = {
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    resourceId?: { videoId?: string };
    thumbnails?: Record<string, { url: string }>;
  };
};

async function fetchPlaylist(playlistId: string, apiKey: string): Promise<Array<ShowVideo & { published: string }>> {
  const url =
    'https://www.googleapis.com/youtube/v3/playlistItems' +
    `?part=snippet&maxResults=${SHELF_LIMIT + 3}` +
    `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`;

  // Cache server-side with interval revalidation — never call YouTube per page
  // load (quota + latency on a page that changes twice a week, §4.3).
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  const data = (await res.json()) as { items?: RawItem[] };

  return (data.items ?? [])
    .map((it) => {
      const s = it.snippet;
      const id = s?.resourceId?.videoId;
      if (!id || !s?.title || s.title === 'Private video' || s.title === 'Deleted video') return null;
      const published = s.publishedAt ?? '';
      const desc = (s.description ?? '').split('\n')[0].slice(0, 160);
      return {
        id,
        title: s.title,
        url: `https://www.youtube.com/watch?v=${id}`,
        excerpt: desc,
        dateStamp: stamp(published),
        thumbnail: bestThumb(s.thumbnails),
        published,
      };
    })
    .filter((v): v is ShowVideo & { published: string } => v !== null);
}

// Flat, reverse-chronological long-form shelf. Returns null when YouTube is not
// configured (no API key or no playlist), so the page falls back to the frozen
// v6 placeholder layout.
export async function getShowVideos(): Promise<ShowVideo[] | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;
  const playlistIds = PLAYLIST_ENVS.map((k) => process.env[k]).filter((v): v is string => Boolean(v));
  if (playlistIds.length === 0) return null;

  const batches = await Promise.all(
    playlistIds.map(async (pid) => {
      try {
        return await fetchPlaylist(pid, apiKey);
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  const merged = batches
    .flat()
    .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
    .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0))
    .slice(0, SHELF_LIMIT)
    .map(({ published: _published, ...v }) => v);

  return merged.length ? merged : null;
}
