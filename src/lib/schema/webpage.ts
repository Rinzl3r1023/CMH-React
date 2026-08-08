import { WEBSITE_ID, PERSON_ID } from './config';

// Generic WebPage (§3.1 Home, §3.4 Dispatch). `about` links the page to the
// Person (used on Home); omit it for a plain landing page (Dispatch).
export function webPageNode(opts: {
  url: string;
  name: string;
  description?: string;
  about?: boolean;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${opts.url}#webpage`,
    url: opts.url,
    name: opts.name,
    inLanguage: 'en-US',
    isPartOf: { '@id': WEBSITE_ID },
  };
  if (opts.description) node.description = opts.description;
  if (opts.about) node.about = { '@id': PERSON_ID };
  return node;
}
