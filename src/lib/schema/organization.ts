import { ORGANIZATION, ORG_ID, PERSON_ID } from './config';

// Organization (§2.2). Chris and Kim are co-founders: Chris references the site's
// Person by @id; Kim is an inline Person (she has no node on this personal-brand
// site — her identity lives on the TBL site).
export function organizationNode(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    founder: [{ '@id': PERSON_ID }, { '@type': 'Person', name: ORGANIZATION.coFounderName }],
  };
}
