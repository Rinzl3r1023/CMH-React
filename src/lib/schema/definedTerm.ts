import { ORGANIZATION } from './config';

// The Content to Customers Method as a DefinedTerm (Task 3) — so the methodology
// resolves as a named entity, not just prose. creator is Kim Jimenez (the method
// is hers); she has no #person node on this personal-brand site, so she's inline.
// DefinedTerm is a stable schema.org type; if a validator ever rejects it, the
// page's Article-with-`about` still carries the topic (the page matters more than
// the node type).
export function contentMethodNode(url: string): Record<string, unknown> {
  return {
    '@type': 'DefinedTerm',
    '@id': `${url}#method`,
    name: 'Content to Customers Method',
    description:
      'A framework for turning content into customers built on two dimensions: business phase (Capture, Monetize, Scale) and funnel temperature (Attract, Connect, Convert). Every piece of marketing has a position on both, and the common failure — content that gets attention but not customers — is producing only Attract-layer material.',
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'The Business Lounge Methodology',
      url: ORGANIZATION.url,
    },
    creator: { '@type': 'Person', name: ORGANIZATION.coFounderName },
  };
}
