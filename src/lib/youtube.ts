import 'server-only';

// The Show's Watch shelf pulls long-form videos from YouTube (§4). The source is
// the channel's own uploads, resolved from YOUTUBE_CHANNEL_ID (a UC… id → its
// UU… uploads playlist), with Shorts removed by DURATION: anything ≤3:00 is
// dropped (YouTube Shorts are capped at three minutes), so the shelf is long-form
// by construction — no curated-playlist dependency and no isShort guessing.
// Explicit curated playlists (YOUTUBE_PLAYLIST_*) may still be merged in.
//
// Quota: two cheap calls per source — playlistItems.list (1 unit) to list the
// candidate video ids, then videos.list (1 unit per 50) to read their durations
// and metadata. NEVER search.list (100 units under the June-2026 granular quota).
// Results are cached server-side (30-min revalidate), so a page load never calls
// YouTube. The key lives only here, server-side; it never reaches client JS
// (§4.3). Same rule as Kit.

export type ShowVideo = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  dateStamp: string;
  thumbnail: string | null;
};

const MIN_LONGFORM_SECONDS = 180; // > 3:00 is long-form; ≤3:00 is a Short (§4.2)
const SHELF_LIMIT = 25; // featured + up to 24; the flat shelf pages the rest via "Load more"
const CANDIDATES_PER_SOURCE = 50; // one playlistItems page — ample to fill the shelf after filtering

// Optional curated playlists, merged with the channel feed (all deduped, newest
// first, same duration filter). Any that are set contribute; the rest are ignored.
const PLAYLIST_ENVS = [
  'YOUTUBE_PLAYLIST_LIBRARY',
  'YOUTUBE_PLAYLIST_WHATS_NEXT',
  'YOUTUBE_PLAYLIST_WHAT_IT_MEANS',
  'YOUTUBE_PLAYLIST_FIELD_NOTES',
];

// A channel's uploads playlist is its id with the leading "UC" swapped to "UU" —
// deterministic, so no extra API call is needed to resolve it.
function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

// The set of playlist ids to flatten into the shelf: the channel's uploads (if a
// channel id is set) plus any explicitly-configured curated playlists.
function sourcePlaylistIds(): string[] {
  const ids = new Set<string>();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (channelId) {
    const up = uploadsPlaylistId(channelId);
    if (up) ids.add(up);
  }
  for (const k of PLAYLIST_ENVS) {
    const v = process.env[k]?.trim();
    if (v) ids.add(v);
  }
  return [...ids];
}

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

// ISO-8601 duration (e.g. "PT12M30S", "PT1H2M") → seconds.
function parseDurationSeconds(iso: string): number {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [d, h, mi, s] = [m[1], m[2], m[3], m[4]].map((x) => Number(x || 0));
  return ((d * 24 + h) * 60 + mi) * 60 + s;
}

// List the candidate video ids from a playlist (uploads or curated). One page.
async function fetchPlaylistVideoIds(playlistId: string, apiKey: string): Promise<string[]> {
  const url =
    'https://www.googleapis.com/youtube/v3/playlistItems' +
    `?part=contentDetails&maxResults=${CANDIDATES_PER_SOURCE}` +
    `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`YouTube playlistItems ${res.status}`);
  const data = (await res.json()) as { items?: Array<{ contentDetails?: { videoId?: string } }> };
  return (data.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((v): v is string => Boolean(v));
}

type FullVideo = ShowVideo & { published: string; seconds: number };

// Read snippet + duration for a set of video ids (batched by 50).
async function fetchVideos(ids: string[], apiKey: string): Promise<FullVideo[]> {
  const out: FullVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      'https://www.googleapis.com/youtube/v3/videos' +
      `?part=snippet,contentDetails&id=${batch.map(encodeURIComponent).join(',')}` +
      `&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`YouTube videos ${res.status}`);
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url: string }>;
        };
        contentDetails?: { duration?: string };
      }>;
    };
    for (const it of data.items ?? []) {
      const s = it.snippet;
      const id = it.id;
      if (!id || !s?.title || s.title === 'Private video' || s.title === 'Deleted video') continue;
      const published = s.publishedAt ?? '';
      out.push({
        id,
        title: s.title,
        url: `https://www.youtube.com/watch?v=${id}`,
        excerpt: (s.description ?? '').split('\n')[0].slice(0, 160),
        dateStamp: stamp(published),
        thumbnail: bestThumb(s.thumbnails),
        published,
        seconds: parseDurationSeconds(it.contentDetails?.duration ?? ''),
      });
    }
  }
  return out;
}

// Flat, reverse-chronological long-form shelf. Returns null when YouTube is not
// configured (no API key, or no channel/playlist), so the page falls back to the
// frozen v6 placeholder layout.
export async function getShowVideos(): Promise<ShowVideo[] | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;
  const playlistIds = sourcePlaylistIds();
  if (playlistIds.length === 0) return null;

  let ids: string[];
  try {
    const batches = await Promise.all(
      playlistIds.map((pid) => fetchPlaylistVideoIds(pid, apiKey).catch(() => [])),
    );
    ids = [...new Set(batches.flat())];
  } catch {
    return null;
  }
  if (ids.length === 0) return null;

  let videos: FullVideo[];
  try {
    videos = await fetchVideos(ids, apiKey);
  } catch {
    return null;
  }

  const longform = videos
    .filter((v) => v.seconds > MIN_LONGFORM_SECONDS) // drop Shorts by duration (§4.2)
    .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0))
    .slice(0, SHELF_LIMIT)
    .map(({ published: _published, seconds: _seconds, ...v }) => v);

  return longform.length ? longform : null;
}
