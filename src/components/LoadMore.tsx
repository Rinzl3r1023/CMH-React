'use client';

import { useState, type ReactNode } from 'react';

// "Load more" replaces pagination on The Show (§4.4). It renders the first batch
// and appends the next on click — no URL change. Crawl discovery does not depend
// on this button: the sitemap carries every post slug, and /blog/page/N stays
// live as a crawlable ladder. The button hides when nothing remains.
export default function LoadMore({
  items,
  initial = 6,
  step = 6,
  gridClassName = 'cardGrid',
  label = 'Load more',
}: {
  items: ReactNode[];
  initial?: number;
  step?: number;
  gridClassName?: string;
  label?: string;
}) {
  const [count, setCount] = useState(Math.min(initial, items.length));
  const hasMore = count < items.length;
  return (
    <>
      <div className={gridClassName}>{items.slice(0, count)}</div>
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 'clamp(40px,5vw,56px)' }}>
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(c + step, items.length))}
            className="btn edge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '15px 32px',
              border: '1px solid rgba(240,169,60,.5)',
              color: '#F0A93C',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        </div>
      )}
    </>
  );
}
