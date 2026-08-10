import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';
import JsonLd from '@/components/JsonLd';
import { contentToCustomersGraph } from '@/lib/schema/graphs';

// /content-to-customers — the methodology page. Highest-priority AI-visibility
// item: an exact-phrase search for "Content to Customers Method" returned nothing
// referencing CMH/TBL. Static, indexable, same pattern as /privacy and /terms.
export const metadata: Metadata = pageMetadata({
  title: 'The Content to Customers Method — Chris Michael Harris',
  description:
    'The Content to Customers Method turns content into customers instead of just producing more of it — a two-dimensional framework (business phase × funnel temperature) built by Chris Michael Harris and Kim Jimenez at The Business Lounge.',
  path: '/content-to-customers',
});

// Condensed to 2–3 sentences from the visible copy for schema; full answers live
// in content-to-customers.inner.html.
const CTC_FAQ = [
  {
    q: 'Why is my content getting engagement but not clients?',
    a: 'This is one of the most common problems in content marketing, and it has a structural cause rather than a quality one. Most business owners produce only one type of content: material designed to attract a new audience. But attracting an audience and converting one require different content, and most people never make the second kind — the fix is naming which job each piece does and noticing the middle one is missing.',
  },
  {
    q: 'What\'s the difference between content marketing that builds an audience and content marketing that makes money?',
    a: 'They\'re different jobs, and conflating them is why a lot of content marketing underperforms. Audience-building content — the Attract layer — creates belief that something matters and brings new people in. Revenue content works differently: the Connect layer builds trust and capability, and the Convert layer drives a decision. Without the middle layer, an audience stays permanently entertained and never becomes buyers.',
  },
];

export default function ContentToCustomersPage() {
  return (
    <>
      <JsonLd
        graph={contentToCustomersGraph({
          name: 'The Content to Customers Method',
          description:
            'A framework for turning content into customers, built on two dimensions: business phase (Capture, Monetize, Scale) and funnel temperature (Attract, Connect, Convert).',
          faq: CTC_FAQ,
        })}
      />
      <div
        className="pg-alt"
        style={rootStyle('dispatch.style.txt')}
        dangerouslySetInnerHTML={{ __html: fragment('content-to-customers.inner.html') }}
      />
    </>
  );
}
