import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import { getShowVideos } from '@/lib/youtube';
import HtmlFragment from '@/components/HtmlFragment';
import HomeShow from '@/components/HomeShow';
import JsonLd from '@/components/JsonLd';
import { homeGraph } from '@/lib/schema/graphs';

export const metadata: Metadata = pageMetadata({
  title: "Chris Michael Harris — What's next in AI + marketing, for business owners",
  description:
    "I test what's next in AI and marketing inside a real business — then tell you what matters, what doesn't, and what to do next. For business owners who sell coaching or services.",
  ogTitle: "Chris Michael Harris — You're not behind.",
  path: '/',
});

// The Home "CMH Show" block is bound to the same channel-driven feed as The Show
// (§4). getShowVideos' fetch carries next.revalidate, so its result lives in the
// Next Data Cache keyed by URL — Home and /blog share that one cached fetch, so
// wiring Home here adds no second YouTube call. Revalidate on the same cadence.
export const revalidate = 1800;

export default async function HomePage() {
  // Latest 3 long-form videos, same 3-min filter and cache as the Watch shelf.
  const videos = await getShowVideos();
  const showVideos = videos ? videos.slice(0, 3) : null;

  return (
    <div style={rootStyle('home.style.txt')}>
      <JsonLd
        graph={homeGraph({
          name: 'Chris Michael Harris',
          description:
            "I test what's next in AI and marketing inside a real business — then tell you what matters, what doesn't, and what to do next.",
        })}
      />
      <HtmlFragment html={fragment('home.top.html')} />
      {/* Fail-safe: when the feed is unavailable the block is omitted entirely,
          rather than rendering an empty section. */}
      {showVideos && showVideos.length > 0 && <HomeShow videos={showVideos} />}
      <HtmlFragment html={fragment('home.bottom.html')} />
    </div>
  );
}
