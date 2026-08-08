import { WEBSITE_ID } from './config';

// CollectionPage for The Show / blog index (§3.3). The ItemList enumerates ONLY
// the posts actually rendered on the page — never the ones hidden behind "Load
// more" (declaring content that isn't there is a guideline violation).
export function collectionPageNode(opts: {
  url: string;
  name: string;
  description?: string;
  items: Array<{ url: string; name: string }>;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'CollectionPage',
    '@id': `${opts.url}#collectionpage`,
    url: opts.url,
    name: opts.name,
    inLanguage: 'en-US',
    isPartOf: { '@id': WEBSITE_ID },
  };
  if (opts.description) node.description = opts.description;
  if (opts.items.length > 0) {
    node.mainEntity = {
      '@type': 'ItemList',
      itemListElement: opts.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: it.url,
        name: it.name,
      })),
    };
  }
  return node;
}
