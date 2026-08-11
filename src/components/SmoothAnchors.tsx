'use client';

import { useEffect } from 'react';

// Smooth scrolling scoped to in-page anchor links only.
//
// The global `html { scroll-behavior: smooth }` was removed (globals.css) because
// it also animates the browser/Next scroll-to-top on load and route changes — read
// as "the page opens partway down, then scrolls up." Load/nav corrections are now
// instant. This restores the smooth feel for genuine same-page anchor jumps
// (#capture, #read, #watch, #contact) via a single delegated handler, so nothing
// that relied on smooth anchors regresses.
export default function SmoothAnchors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Leave modified clicks and already-handled events alone.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href*="#"]');
      if (!a || a.hasAttribute('data-book-call')) return; // book-call is the modal's, not an anchor
      const href = a.getAttribute('href') || '';
      const id = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
      if (!id) return; // bare "#" or no fragment
      // Same-page only: a link to /other#x should navigate, not smooth-scroll here.
      if (a.pathname !== window.location.pathname) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', `#${id}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
