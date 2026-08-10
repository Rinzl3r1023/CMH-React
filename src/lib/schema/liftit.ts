import { LIFTIT, LIFTIT_ID, PERSON_ID } from './config';

// Lift It Moving and Storage (§2.1b) — the company Chris founded and scaled before
// this one, as its own resolvable entity. Modeled the canonical way: an
// Organization with `founder → #person` (schema.org has no `Person.founderOf`, so
// the founder edge lives on the Organization). This is a DIFFERENT entity from the
// TBL #organization — distinct @id, not a duplicate.
export function liftItNode(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': LIFTIT_ID,
    name: LIFTIT.name,
    foundingDate: LIFTIT.foundingDate,
    description: LIFTIT.description,
    founder: { '@id': PERSON_ID },
  };
}
