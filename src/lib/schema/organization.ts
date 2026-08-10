import { ORGANIZATION, ORG_ID, PERSON_ID } from './config';

// Organization (§2.2 / §3). Chris and Kim are co-founders: Chris references the
// site's Person by @id; Kim is an inline Person (she has no node on this personal-
// brand site — her identity lives on the TBL site). `logo` is intentionally
// absent until the tbl-logo.png asset is committed (§3.1: a broken logo URL is
// worse than none); `legalName` stays off until LLC reinstatement (§3.2).
export function organizationNode(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ORGANIZATION.name,
    url: ORGANIZATION.url,
    description: ORGANIZATION.description,
    foundingDate: ORGANIZATION.foundingDate,
    areaServed: { '@type': 'Country', name: ORGANIZATION.areaServedName },
    numberOfEmployees: {
      '@type': 'QuantitativeValue',
      minValue: ORGANIZATION.employeesMin,
      maxValue: ORGANIZATION.employeesMax,
    },
    award: ORGANIZATION.award,
    email: ORGANIZATION.email,
    knowsAbout: ORGANIZATION.knowsAbout,
    sameAs: ORGANIZATION.sameAs,
    founder: [{ '@id': PERSON_ID }, { '@type': 'Person', name: ORGANIZATION.coFounderName }],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: ORGANIZATION.services.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.name, description: s.description },
      })),
    },
  };
}
