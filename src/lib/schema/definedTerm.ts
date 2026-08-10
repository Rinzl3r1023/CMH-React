import { ORGANIZATION, PERSON_ID } from './config';

// The Content to Customers Method as a DefinedTerm (Task 3) — so the methodology
// resolves as a named entity, not just prose. creator is BOTH co-founders: Chris
// (by @id → #person) and Kim Jimenez (inline — she has no node on this personal-
// brand site). The method was built by the two of them together, so single
// attribution to Kim is inaccurate. `creator` is multi-valued, so an array is
// valid. DefinedTerm is a stable schema.org type; if a validator ever rejects it,
// the page's copy still carries the topic (the page matters more than the node).
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
    creator: [
      { '@id': PERSON_ID },
      { '@type': 'Person', name: ORGANIZATION.coFounderName, jobTitle: 'Co-founder, The Business Lounge' },
    ],
  };
}
