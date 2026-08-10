'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Lazy: the modal + Calendly (and their two CSS modules) are code-split out of the
// always-mounted controller, so they load on first open instead of on every page.
const BookCallModal = dynamic(() => import('./BookCallModal'), { ssr: false });

// Final public URL (§9), baked as the default so the CTA works on every deploy;
// Railway can override via env. Empty string forces the fail-closed (hidden)
// state, matching ClientEnhancer — no modal, no wiring.
const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ?? 'https://calendly.com/chris-chrismichaelharris/30min';

// Mounted once for the whole app. Intercepts every [data-book-call] click (nav
// desktop, nav mobile, end-of-post call block — current and future) via one
// delegated listener, and opens the scheduler in our own on-brand Modal instead
// of a new tab. ClientEnhancer still sets each button's href + target=_blank, so
// if this controller never mounts (JS off/broken) the CTA degrades to a plain
// new-tab link rather than a dead button.
export default function BookCallController() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!CALENDLY_URL) return; // fail-closed: no URL -> no modal behavior at all
    const onClick = (e: MouseEvent) => {
      // Ignore modified clicks so cmd/ctrl-click still opens the raw href in a tab.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest<HTMLElement>('[data-book-call]');
      if (!trigger) return;
      e.preventDefault();
      triggerRef.current = trigger;
      setOpen(true);
    };
    document.addEventListener('click', onClick, true); // capture: beat native nav
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!CALENDLY_URL) return null;

  // Mount the modal subtree only while open — that's what defers its chunk (JS+CSS)
  // to first open. Modal has no exit transition (it renders null when closed), so
  // unmounting on close is equivalent to passing open={false}.
  return open ? (
    <BookCallModal url={CALENDLY_URL} onClose={() => setOpen(false)} restoreFocus={triggerRef.current} />
  ) : null;
}
