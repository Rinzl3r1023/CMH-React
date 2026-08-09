import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import JsonLd from '@/components/JsonLd';
import { legalGraph } from '@/lib/schema/graphs';

// NEEDS CONFIRMATION before this is treated as final: the "Which laws apply"
// section sets governing law to Texas (the CMH LLC's state). Chris is personally
// based in Arkansas and the LLC's standing is unsettled. Confirm Texas vs.
// Arkansas and update the fragment (src/pages-html/terms.inner.html, generated
// by scratchpad/gen-legal.mjs) accordingly. Kept out of the shipped HTML on
// purpose — this note stays server-side.
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
