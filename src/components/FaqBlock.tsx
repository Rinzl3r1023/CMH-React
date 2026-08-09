import type { FaqItem } from '@/lib/posts';

// Visible FAQ block at the end of a post. Dormant until frontmatter provides
// `faq:`. This is the on-page content that the FAQPage JSON-LD (already built)
// describes — both read the same post.faq, so schema never claims Q&A that isn't
// visible. The most directly parseable structure for answer engines.
export default function FaqBlock({ items }: { items?: FaqItem[] }) {
  const list = (items ?? []).filter((x) => x && typeof x.q === 'string' && x.q.trim() && typeof x.a === 'string' && x.a.trim());
  if (list.length === 0) return null;
  return (
    <section className="postFaq" aria-label="Frequently asked questions">
      <h2>Frequently asked questions</h2>
      <dl>
        {list.map((x, i) => (
          <div className="postFaq-item" key={i}>
            <dt>{x.q}</dt>
            <dd>{x.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
