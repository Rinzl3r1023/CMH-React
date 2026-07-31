import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import { getShowBuckets } from '@/lib/youtube';
import HtmlFragment from '@/components/HtmlFragment';
import ShowBuckets, { PLACEHOLDER_BUCKETS } from '@/components/ShowBuckets';

export const metadata: Metadata = pageMetadata({
  title: "The CMH Show — what's next in AI + marketing, on camera",
  description:
    "Short videos on what's coming in AI and marketing, what it actually means, and what you can safely ignore. No jargon.",
  ogTitle: 'What I found up ahead. On camera.',
  path: '/show',
});

// Revalidate the whole page on the same cadence as the playlist cache (§4.3).
export const revalidate = 1800;

export default async function ShowPage() {
  // Live buckets when YouTube is configured (§4.2); otherwise the frozen v6
  // placeholder layout so the page still looks designed pre-launch.
  const live = await getShowBuckets();
  const buckets = live ?? PLACEHOLDER_BUCKETS;

  return (
    <div style={rootStyle('show.style.txt')}>
      <HtmlFragment html={fragment('show.top.html')} />
      <ShowBuckets buckets={buckets} />
      <HtmlFragment html={fragment('show.bottom.html')} />
    </div>
  );
}
