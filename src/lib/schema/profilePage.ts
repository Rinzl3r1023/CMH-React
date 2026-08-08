import { WEBSITE_ID, PERSON_ID } from './config';

// ProfilePage (§3.2) — the correct type for the About page and a stronger identity
// signal than a generic WebPage. mainEntity is the Person.
export function profilePageNode(opts: {
  url: string;
  name: string;
  description?: string;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'ProfilePage',
    '@id': `${opts.url}#profilepage`,
    url: opts.url,
    name: opts.name,
    inLanguage: 'en-US',
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: { '@id': PERSON_ID },
  };
  if (opts.description) node.description = opts.description;
  return node;
}
