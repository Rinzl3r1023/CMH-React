// Serializes a JSON-LD @graph into a single <script type="application/ld+json">
// (§1.2 — one script per page, a @graph, never sibling scripts). The builders
// have already dropped any partial nodes; this only serializes.
//
// Note on placement: the App Router renders this in the document body. Google,
// Bing, and the answer engines read JSON-LD anywhere in the document (this is
// Next.js's own recommended pattern), so body vs head does not affect parsing.
//
// The `<` in the JSON is escaped to < so a string value can never break out
// of the <script> element (standard JSON-LD-in-HTML hardening).
export default function JsonLd({ graph }: { graph: Array<Record<string, unknown> | null | undefined> }) {
  const nodes = graph.filter((n): n is Record<string, unknown> => Boolean(n));
  if (nodes.length === 0) return null;
  const data = { '@context': 'https://schema.org', '@graph': nodes };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
