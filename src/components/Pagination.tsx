import Link from 'next/link';

// Real pagination driven by the total post count (§5.4). Page 1 is /blog; page N
// is /blog/page/N — the WordPress-indexed shape, preserved so nothing 404s.
// Ported from the v6 export's static pagination row (which hardcoded "1 2 Next").

const cell: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  height: 44,
};

function pageHref(n: number): string {
  return n <= 1 ? '/blog' : `/blog/page/${n}`;
}

export default function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 'clamp(40px,5vw,56px)',
        flexWrap: 'wrap',
      }}
    >
      {prevDisabled ? (
        <span
          className="navlink"
          aria-disabled="true"
          style={{ ...cell, padding: '0 14px', border: '1px solid rgba(237,234,228,.12)', color: '#5E594F' }}
        >
          ← Prev
        </span>
      ) : (
        <Link
          href={pageHref(currentPage - 1)}
          className="navlink edge"
          rel="prev"
          style={{ ...cell, padding: '0 14px', border: '1px solid rgba(237,234,228,.13)', color: '#A8A199' }}
        >
          ← Prev
        </Link>
      )}

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => {
        const active = n === currentPage;
        return (
          <Link
            key={n}
            href={pageHref(n)}
            className="navlink edge"
            aria-current={active ? 'page' : undefined}
            style={{
              ...cell,
              border: active ? '1px solid rgba(240,169,60,.5)' : '1px solid rgba(237,234,228,.13)',
              color: active ? '#F0A93C' : '#A8A199',
            }}
          >
            {n}
          </Link>
        );
      })}

      {nextDisabled ? (
        <span
          className="navlink"
          aria-disabled="true"
          style={{ ...cell, padding: '0 14px', border: '1px solid rgba(237,234,228,.12)', color: '#5E594F' }}
        >
          Next →
        </span>
      ) : (
        <Link
          href={pageHref(currentPage + 1)}
          className="navlink edge"
          rel="next"
          style={{ ...cell, padding: '0 14px', border: '1px solid rgba(237,234,228,.13)', color: '#A8A199' }}
        >
          Next →
        </Link>
      )}
    </div>
  );
}
