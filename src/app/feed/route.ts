import { getAllPosts } from '@/lib/posts';
import { SITE_URL, SITE_NAME, canonicalUrl } from '@/lib/site';

// RSS 2.0 at /feed/ — the exact path WordPress served, so existing subscribers and
// aggregators keep working after the cutover. INDEXED posts only (never the noindex
// archive), newest first, capped at 20. Statically generated, revalidated hourly.
export const dynamic = 'force-static';
export const revalidate = 3600;

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const posts = getAllPosts()
    .filter((p) => !p.noindex)
    .slice(0, 20);

  const built = posts[0] ? new Date(posts[0].datePublished || posts[0].date) : new Date(0);
  const items = posts
    .map((p) => {
      const url = canonicalUrl(`/${p.slug}`);
      const pub = new Date(p.datePublished || p.date);
      return [
        '    <item>',
        `      <title>${esc(p.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        Number.isNaN(pub.getTime()) ? '' : `      <pubDate>${pub.toUTCString()}</pubDate>`,
        p.articleSection ? `      <category>${esc(p.articleSection)}</category>` : '',
        `      <description>${esc(p.excerpt)}</description>`,
        '    </item>',
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${SITE_URL}/blog/</link>
    <atom:link href="${SITE_URL}/feed/" rel="self" type="application/rss+xml"/>
    <description>Marketing + AI, tested live inside a real business.</description>
    <language>en-US</language>
    <lastBuildDate>${Number.isNaN(built.getTime()) ? new Date(0).toUTCString() : built.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
