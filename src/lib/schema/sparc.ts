import { SPARC, SPARC_ID, PERSON_ID, ORG_ID } from './config';

// SPARC Marketing (§3B) — its own resolvable SoftwareApplication entity rather
// than only appearing as prose. creator → the Person, publisher → the Org, so the
// founder relationship resolves in both directions via @id. Name is "SPARC
// Marketing" (not "Marketer") everywhere from here forward.
export function sparcNode(): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    '@id': SPARC_ID,
    name: SPARC.name,
    url: SPARC.url,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: SPARC.description,
    creator: { '@id': PERSON_ID },
    publisher: { '@id': ORG_ID },
  };
}
