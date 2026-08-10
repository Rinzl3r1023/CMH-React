import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// AI / answer-engine crawlers we explicitly welcome (GEO). A wildcard `*` already
// allows everything, but naming them makes the intent unambiguous and future-
// proofs against any tightening of the default — for these bots, "no rule" and
// "explicitly allowed" should never diverge. Covers OpenAI (training + search +
// user-fetch), Anthropic (crawl + search + legacy), Perplexity (crawl + user),
// Google's AI-training opt-in, and Bing (which feeds Copilot).
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bingbot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
