import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import JsonLd from '@/components/JsonLd';
import { legalGraph } from '@/lib/schema/graphs';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Use — Chris Michael Harris',
  description:
    'The ground rules for using this site and its content, including how results and testimonials should be read.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      <JsonLd
        graph={legalGraph({
          path: '/terms',
          name: 'Terms of Use',
          description: 'The ground rules for using chrismichaelharris.com and its content.',
        })}
      />
      <div
        className="pg-alt"
        style={rootStyle('dispatch.style.txt')}
        dangerouslySetInnerHTML={{ __html: fragment('terms.inner.html') }}
      />
    </>
  );
}
