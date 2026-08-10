import { getAllPosts } from '@/lib/posts';
import { SITE_URL, SITE_NAME, canonicalUrl } from '@/lib/site';

// llms.txt (llmstxt.org) — a curated markdown index for LLMs / answer engines.
// Built from getAllPosts() filtered to indexed posts, the SAME source the sitemap
// uses, so the two can never drift. Statically generated, revalidated hourly.
export const dynamic = 'force-static';
export const revalidate = 3600;

// Collapse an excerpt to a single clean line for the list entry.
const oneLine = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim();

export async function GET() {
  const posts = getAllPosts().filter((p) => !p.noindex); // indexed only — matches the sitemap

  const pageLines = [
    `- [About](${canonicalUrl('/about')}): Chris Michael Harris — Marketing + AI strategist. Who he is, how he works, and what he believes.`,
    `- [About Chris Michael Harris (AI & marketing)](${canonicalUrl('/ai')}): Who he helps, his services, the Content to Customers Method, results, and full credentials — the AI-answer profile.`,
    `- [The Content to Customers Method](${canonicalUrl('/content-to-customers')}): The framework for turning content into customers — business phase × funnel temperature. Developed by Kim Jimenez at The Business Lounge.`,
    `- [The Dispatch](${canonicalUrl('/dispatch')}): The weekly email — what's coming, what's working now, and what you can safely ignore.`,
    `- [Work with me — coaching](${SITE_URL}/#work-with-me): Two ways to go deeper inside The Business Lounge — the self-serve community, or hands-on coaching alongside Kim.`,
    `- [The Show](${canonicalUrl('/blog')}): Every post and video — Marketing + AI, tested live inside a real business.`,
  ].join('\n');

  const postLines = posts
    .map((p) => {
      const note = oneLine(p.excerpt);
      return `- [${p.title}](${canonicalUrl(`/${p.slug}`)})${note ? `: ${note}` : ''}`;
    })
    .join('\n');

  const body = `# ${SITE_NAME}

> Marketing + AI, tested live inside a real business. Practical guidance for business owners who'd rather move forward than chase every new thing.

Chris Michael Harris keeps up with AI and marketing so business owners don't have to. This file indexes the site's key pages and every indexed article for language models and answer engines.

## Pages

${pageLines}

## Posts

${postLines}
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
