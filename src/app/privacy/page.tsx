import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import JsonLd from '@/components/JsonLd';
import { legalGraph } from '@/lib/schema/graphs';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy — Chris Michael Harris',
  description:
    'What this site collects, why, and the services that touch it. I collect as little as I can and I don’t sell it.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        graph={legalGraph({
          path: '/privacy',
          name: 'Privacy Policy',
          description: 'What chrismichaelharris.com collects, why, and the services that touch it.',
        })}
      />
      <div
        className="pg-alt"
        style={rootStyle('dispatch.style.txt')}
        dangerouslySetInnerHTML={{ __html: fragment('privacy.inner.html') }}
      />
    </>
  );
}
