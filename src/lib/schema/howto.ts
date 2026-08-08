import { schemaWarn } from './config';

// HowTo (§4.4) — built but DORMANT: no post carries `howto:` frontmatter yet.
// Only for posts with real, ordered, discrete steps in the VISIBLE content; never
// retrofit narrative posts into this shape. Accepts the raw (unknown) frontmatter
// value and narrows defensively; returns null when there's nothing real to emit.
export function howToNode(url: string, howto: unknown, slug = ''): Record<string, unknown> | null {
  if (!howto) return null;

  let name: string | undefined;
  let raw: unknown;
  if (Array.isArray(howto)) {
    raw = howto;
  } else if (typeof howto === 'object') {
    const h = howto as { name?: unknown; steps?: unknown };
    name = typeof h.name === 'string' ? h.name : undefined;
    raw = h.steps;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const steps = raw
    .map((s) => (typeof s === 'string' ? { text: s } : s && typeof s === 'object' ? (s as { name?: string; text?: string }) : { text: undefined }))
    .filter((s): s is { name?: string; text: string } => Boolean(s && typeof s.text === 'string' && s.text.trim()));
  if (steps.length === 0) {
    schemaWarn(`HowTo omitted for "${slug}": steps missing text.`);
    return null;
  }

  const node: Record<string, unknown> = {
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name || `Step ${i + 1}`,
      text: s.text,
    })),
  };
  if (name) node.name = name;
  return node;
}
