'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './PromoBar.module.css';

// ── Deny-list ────────────────────────────────────────────────────────────────
// THE RULE: a path belongs here if the page has its OWN primary conversion CTA
// (a booking, an email capture, a specific offer) — the bar would compete with a
// stronger, page-specific ask — OR it's the demo the bar points to, or legal.
//
// The bar shows on EVERYTHING ELSE by default: all ~212 posts, the homepage, and
// the blog index. So a NEW landing page with its own CTA is NOT opted out
// automatically — add its path here. Matched with trailing slashes normalized
// (the site runs trailingSlash: true).
export const PROMO_BAR_DENY: readonly string[] = [
  '/visibility', // the demo the bar routes to
  '/dispatch', // Dispatch email-capture page — two asks on one page underperform
  '/ai', // coaching AEO landing — its own conversion
  '/content-to-customers', // "Method" landing — its own conversion
  '/about', // the trust-building read; wrong moment to interrupt with an offer
  '/privacy',
  '/terms',
];

const STORAGE_KEY = 'cmh_promobar_dismissed_at';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Fade the bar out when the page's own FOOTER CTA (the end-of-post book-a-call
// block) enters view — its reader is at higher intent than the bar serves, so the
// page's own CTA wins. Scoped to the footer block, NOT the mid-article Dispatch
// form (observing that would fade the bar every time a reader scrolled past it).
const CTA_SELECTOR = '.callCta';

const HEADLINE = 'Your buyers are asking AI for recommendations. Are you in the answer?';
const HEADLINE_SHORT = "Are you in AI's answer?";
const BUTTON = 'Get your AI visibility score';

function normalize(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}
function utmContentFor(path: string): string {
  return path === '/' ? 'home' : path.replace(/^\//, '');
}

export default function PromoBar() {
  const pathname = usePathname();
  const path = normalize(pathname || '/');
  const excluded = PROMO_BAR_DENY.includes(path);

  const [armed, setArmed] = useState(false); // engagement sentinel reached
  const [dismissed, setDismissed] = useState(true); // default hidden until storage is read (no flash)
  const [nearCta, setNearCta] = useState(false); // a page CTA is in view

  // Sentinels for arming. Watching for an element to appear has NO scroll-origin
  // assumption to violate — unlike a scrollY/scrollHeight ratio, it is immune to a
  // corrupted scroll position at mount and to lazy-load height growth (the prod
  // failure). `top` fires ~1.5 screens down (engaged, not instant); `bottom` sits
  // at the document end as the floor so a page shorter than the top sentinel still
  // arms rather than never (every current included page is ≥ ~3170px, well past
  // the top sentinel, so it never extends the page).
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 30-day dismissal (client-only). Default dismissed=true means SSR/first paint
  // renders hidden; this reveals it only when not recently dismissed.
  useEffect(() => {
    if (excluded) return;
    let hidden = false;
    try {
      const at = Number(localStorage.getItem(STORAGE_KEY) || '0');
      hidden = at > 0 && Date.now() - at < DISMISS_MS;
    } catch {
      /* storage blocked → treat as not dismissed */
    }
    setDismissed(hidden);
  }, [excluded]);

  // Arm when either sentinel enters the viewport. IntersectionObserver, not a
  // scroll-position calc — structural immunity to the scroll-restoration / CLS
  // quirk that broke the ratio approach in production.
  useEffect(() => {
    if (excluded) return;
    const targets = [topRef.current, bottomRef.current].filter((t): t is HTMLDivElement => t !== null);
    if (targets.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      // Arm when a sentinel is in view OR already scrolled PAST (bottom above the
      // viewport top → boundingClientRect.bottom < 0). The "past" case matters if
      // the page mounts already deep (a restored/corrected scroll position): the
      // reader is engaged, so the bar should arm rather than wait for a re-entry
      // that never comes.
      if (entries.some((e) => e.isIntersecting || e.boundingClientRect.bottom < 0)) {
        setArmed(true);
        io.disconnect();
      }
    });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [excluded]);

  // Fade near the page's own CTA. Re-runs per path so a client nav re-observes.
  useEffect(() => {
    if (excluded) return;
    const els = Array.from(document.querySelectorAll(CTA_SELECTOR));
    if (els.length === 0) {
      setNearCta(false);
      return;
    }
    const io = new IntersectionObserver((entries) => setNearCta(entries.some((e) => e.isIntersecting)));
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [excluded, path]);

  if (excluded) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* storage blocked — bar just reappears next load */
    }
    setDismissed(true);
  };

  const onCtaClick = () => {
    // Reuse the already-loaded gtag if analytics is configured; no new dependency.
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 'promobar_click', {
      page_slug: utmContentFor(path),
    });
    dismiss(); // someone who clicked through shouldn't be asked again
  };

  const href = `/visibility?utm_source=cmh&utm_medium=promobar&utm_campaign=ai-visibility&utm_content=${encodeURIComponent(
    utmContentFor(path),
  )}`;
  const show = armed && !dismissed && !nearCta;

  return (
    <>
      {/* Engagement sentinels (see ref comment). Zero-size, non-interactive. */}
      <div ref={topRef} aria-hidden="true" className={styles.sentinelTop} />
      <div ref={bottomRef} aria-hidden="true" className={styles.sentinelBottom} />
      <div
        role="region"
        aria-label="AI visibility check offer"
        className={styles.bar}
        data-show={show ? 'true' : 'false'}
        aria-hidden={show ? undefined : 'true'}
      >
        <div className={styles.inner}>
          <p className={styles.headline}>
            <span className={styles.full}>{HEADLINE}</span>
            <span className={styles.short}>{HEADLINE_SHORT}</span>
          </p>
          <a className={styles.cta} href={href} onClick={onCtaClick}>
            {BUTTON}
          </a>
          <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </>
  );
}
