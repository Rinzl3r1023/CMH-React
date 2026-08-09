// Key Takeaways — a short bulleted summary block near the top of a post. Dormant
// until a post's frontmatter provides `takeaways:`; renders nothing otherwise, so
// the AEO rewrite just fills it in. One of the two structures answer engines parse
// most directly (the other is the FAQ block).
export default function KeyTakeaways({ items }: { items?: string[] }) {
  const list = (items ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <aside className="keyTakeaways" aria-label="Key takeaways">
      <span className="keyTakeaways-label">Key takeaways</span>
      <ul>
        {list.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </aside>
  );
}
