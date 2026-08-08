import { schemaWarn } from './config';

export type FaqItem = { q?: string; a?: string };

// FAQPage (§4.3) — built but DORMANT: no post carries `faq:` frontmatter yet.
// Only emit where a genuine Q&A exists in the VISIBLE content; schema describes
// the page, it never adds to it. Returns null when there's nothing real to emit.
export function faqPageNode(url: string, faq: FaqItem[] | undefined, slug = ''): Record<string, unknown> | null {
  if (!Array.isArray(faq) || faq.length === 0) return null;
  const valid = faq.filter((x) => x && typeof x.q === 'string' && x.q.trim() && typeof x.a === 'string' && x.a.trim());
  if (valid.length === 0) {
    if (faq.length) schemaWarn(`FAQPage omitted for "${slug}": faq entries missing q/a.`);
    return null;
  }
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: valid.map((x) => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}
