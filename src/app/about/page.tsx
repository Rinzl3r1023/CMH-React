import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import JsonLd from '@/components/JsonLd';
import { aboutGraph } from '@/lib/schema/graphs';

export const metadata: Metadata = pageMetadata({
  title: 'About Chris Michael Harris — keeping up with AI + marketing so you don\'t have to',
  description:
    'I test what\'s next in AI and marketing inside a real business, then bring back the few things that matter — in plain language.',
  ogTitle: 'You were never the problem.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        graph={aboutGraph({
          name: 'About Chris Michael Harris',
          description:
            "I test what's next in AI and marketing inside a real business, then bring back the few things that matter — in plain language.",
        })}
      />
      <div
        className="pg-alt"
        style={rootStyle('about.style.txt')}
        dangerouslySetInnerHTML={{ __html: fragment('about.inner.html') }}
      />
    </>
  );
}
