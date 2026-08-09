import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// Blog content lives as MDX co-located with its cover image, one folder per post
// (§2.1):  /content/posts/<slug>/index.mdx  +  cover.jpg
// This matches the stated workflow — Claude writes a file, commits, Railway
// deploys — with no CMS and no admin UI (§2).
const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');
const COVER_MANIFEST = path.join(process.cwd(), 'public', 'post-covers', 'manifest.json');

export type Cover = { src: string; width: number; height: number };

export type FaqItem = { q?: string; a?: string };

export type PostMeta = {
  slug: string;
  title: string;
  date: string; // ISO yyyy-mm-dd — used for sorting/display
  /** Full ISO 8601 publish date from the WP export, for schema. NEVER file mtime (§5). */
  datePublished: string;
  /** Full ISO 8601; from `date_modified` frontmatter, else = datePublished (§4.1). */
  dateModified: string;
  dateStamp: string; // formatted for the .stamp element, e.g. 2026.04.03
  excerpt: string;
  youtubeId?: string;
  featured: boolean;
  cover: Cover | null;
  /** Schema-only frontmatter (optional). */
  keywords?: string[];
  articleSection?: string;
  /** Which post-template CTAs render: 'full' = mid-article Dispatch + end call;
   *  'dispatch-only' = just the mid-article Dispatch (off-positioning posts).
   *  Defaults to 'full'. */
  cta: 'full' | 'dispatch-only';
  /** True for migration placeholders that still need real body content (Phase 2). */
  placeholder: boolean;
  /** `noindex: true` in frontmatter -> emits <meta name="robots" content="noindex">
   *  AND excludes the post from sitemap.xml (a noindexed URL in the sitemap is a
   *  mixed signal). Defaults to false = indexed. */
  noindex: boolean;
};

export type Post = PostMeta & {
  body: string;
  wordCount: number;
  /** Dormant content blocks — rendered only when frontmatter provides them, so the
   *  AEO rewrite just fills them in. faq also feeds the FAQPage schema (§4.3). */
  takeaways?: string[];
  faq?: FaqItem[];
  howto?: unknown;
};

function readCoverManifest(): Record<string, Cover> {
  try {
    return JSON.parse(fs.readFileSync(COVER_MANIFEST, 'utf-8'));
  } catch {
    // No covers synced yet — cards fall back to the design's placeholder box.
    return {};
  }
}

function formatStamp(dateStr: string): string {
  // Render dates in the monospace .stamp style used across the design.
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function slugDirs(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function loadRaw(slug: string): { data: Record<string, unknown>; body: string } | null {
  const file = path.join(POSTS_DIR, slug, 'index.mdx');
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, 'utf-8'));
  return { data, body: content };
}

function toMeta(slug: string, data: Record<string, unknown>, covers: Record<string, Cover>): PostMeta {
  // Frontmatter slug MUST match the existing live URL (§2.2, §1). The folder
  // name is authoritative; a mismatched frontmatter slug is a migration error.
  const fmSlug = (data.slug as string) || slug;
  // gray-matter parses an unquoted YAML date (date: 2026-05-06) into a JS Date.
  // Normalise to an ISO yyyy-mm-dd string so sorting compares dates, not the
  // weekday-name form of Date.toString().
  const rawDate = data.date;
  const date =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate ?? '');
  // Preserve the full timestamp for schema (§5): when the WP export carries a
  // time-of-day it survives here; a date-only value becomes UTC midnight. The
  // publish date is NEVER derived from file mtime.
  const datePublished =
    rawDate instanceof Date ? rawDate.toISOString() : rawDate ? String(rawDate) : '';
  const rawMod = data.date_modified;
  const dateModified =
    rawMod instanceof Date ? rawMod.toISOString() : rawMod ? String(rawMod) : datePublished;
  const keywords = Array.isArray(data.keywords)
    ? data.keywords.map((k) => String(k)).filter(Boolean)
    : undefined;
  const articleSection = data.category
    ? String(data.category)
    : data.section
      ? String(data.section)
      : undefined;
  return {
    slug: fmSlug,
    title: String(data.title ?? slug),
    date,
    datePublished,
    dateModified,
    dateStamp: formatStamp(date),
    excerpt: String(data.excerpt ?? ''),
    youtubeId: data.youtube_id ? String(data.youtube_id) : undefined,
    featured: Boolean(data.featured),
    cover: covers[fmSlug] ?? null,
    keywords,
    articleSection,
    cta: data.cta === 'dispatch-only' ? 'dispatch-only' : 'full',
    placeholder: Boolean(data.placeholder),
    noindex: Boolean(data.noindex),
  };
}

let _cache: PostMeta[] | null = null;

export function getAllPosts(): PostMeta[] {
  if (_cache) return _cache;
  const covers = readCoverManifest();
  const posts = slugDirs()
    .map((slug) => {
      const raw = loadRaw(slug);
      return raw ? toMeta(slug, raw.data, covers) : null;
    })
    .filter((p): p is PostMeta => p !== null)
    // Newest first.
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  _cache = posts;
  return posts;
}

export function getPost(slug: string): Post | null {
  const raw = loadRaw(slug);
  if (!raw) return null;
  const covers = readCoverManifest();
  const wordCount = raw.body.trim() ? raw.body.trim().split(/\s+/).filter(Boolean).length : 0;
  const takeaways = Array.isArray(raw.data.takeaways) ? raw.data.takeaways.map((t) => String(t)).filter(Boolean) : undefined;
  const faq = Array.isArray(raw.data.faq) ? (raw.data.faq as FaqItem[]) : undefined;
  const howto = raw.data.howto;
  return { ...toMeta(slug, raw.data, covers), body: raw.body, wordCount, takeaways, faq, howto };
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}

// The one post marked featured:true, else the newest (§2.2).
export function getFeaturedPost(): PostMeta | null {
  const all = getAllPosts();
  // The hero must be an indexed post — never surface a noindexed one as the lead.
  return all.find((p) => p.featured && !p.noindex) ?? all.find((p) => !p.noindex) ?? all[0] ?? null;
}

// Posts for the grid: exclude the featured (hero) post AND noindexed posts.
// noindexed posts are reachable at their URL but not promoted in browse — so the
// on-site archive matches what search indexes (§ noindex pass). This is the single
// source the grid, Load more (counts items.length), /blog/page/N, and the sitemap
// all derive from, so the filtered count stays consistent everywhere.
export function getGridPosts(): PostMeta[] {
  const featured = getFeaturedPost();
  return getAllPosts().filter((p) => p.slug !== featured?.slug && !p.noindex);
}
