import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'About Chris Michael Harris — going first on AI + marketing',
  description:
    'I test what\'s next in AI and marketing inside a real business, then bring back the few things that matter — in plain language.',
  ogTitle: 'You were never the problem.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div
      style={rootStyle('about.style.txt')}
      dangerouslySetInnerHTML={{ __html: fragment('about.inner.html') }}
    />
  );
}
