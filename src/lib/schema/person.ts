import { PERSON, PERSON_ID, ORG_ID, HOME_URL } from './config';

// Person — the identity node answer engines use to establish who is being cited
// (§2.1). Required: name. Always present, so this never returns null.
export function personNode(): Record<string, unknown> {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: PERSON.name,
    url: HOME_URL,
    image: { '@type': 'ImageObject', url: PERSON.image },
    jobTitle: PERSON.jobTitle,
    description: PERSON.description,
    knowsAbout: PERSON.knowsAbout,
    sameAs: PERSON.sameAs,
    worksFor: { '@id': ORG_ID },
  };
}
