import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: "Chris Michael Harris — What's next in AI + marketing, for business owners",
  description:
    "I test what's next in AI and marketing inside a real business — then tell you what matters, what doesn't, and what to do next. For business owners who sell coaching, courses, or services.",
  ogTitle: "Chris Michael Harris — You're not behind.",
  path: '/',
});

export default function HomePage() {
  return (
    <div
      style={rootStyle('home.style.txt')}
      dangerouslySetInnerHTML={{ __html: fragment('home.inner.html') }}
    />
  );
}
