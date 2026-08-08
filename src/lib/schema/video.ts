import { PERSON_ID, schemaWarn } from './config';

export type VideoInput = {
  slug: string;
  url: string; // canonical page URL (non-trailing) for the @id base
  id: string; // YouTube video id
  title?: string;
  description?: string;
  durationIso?: string; // ISO 8601, e.g. PT16M40S
  uploadDate?: string; // ISO 8601
  thumbnail?: string | null;
};

// VideoObject (§4.2) — the highest-leverage node here. Required: name,
// thumbnailUrl, uploadDate. If the YouTube metadata isn't available (e.g. the
// feed isn't configured at build), omit the node rather than emit a partial one.
export function videoObjectNode(v: VideoInput): Record<string, unknown> | null {
  if (!v.id || !v.title || !v.uploadDate) {
    if (v.id) schemaWarn(`VideoObject omitted for "${v.slug}": missing title/uploadDate (YouTube metadata unavailable).`);
    return null;
  }
  const node: Record<string, unknown> = {
    '@type': 'VideoObject',
    '@id': `${v.url}#video`,
    name: v.title,
    description: v.description || v.title,
    thumbnailUrl: [v.thumbnail || `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`],
    uploadDate: v.uploadDate,
    embedUrl: `https://www.youtube.com/embed/${v.id}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
    publisher: { '@id': PERSON_ID },
  };
  if (v.durationIso) node.duration = v.durationIso;
  return node;
}
