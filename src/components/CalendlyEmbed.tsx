'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CalendlyEmbed.module.css';

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: {
        url: string;
        parentElement: HTMLElement;
        // Removes the "Powered by Calendly" ribbon on paid plans. Toggling
        // branding off in account settings does NOT remove it from an inline
        // embed — only this param does.
        branding?: boolean;
      }) => void;
    };
  }
}

// If Calendly hasn't signalled a render within this window, stop spinning and
// offer the new-tab fallback instead. Covers a slow script load AND a widget
// that inits but never paints.
const READY_TIMEOUT_MS = 10000;

const WIDGET_SRC = 'https://assets.calendly.com/assets/external/widget.js';

// Lazy-load Calendly's widget script exactly once, on first modal open — never on
// page render. Retries on the next open if a load fails (promise cleared on reject).
let loader: Promise<void> | null = null;
function loadCalendly(): Promise<void> {
  if (typeof window !== 'undefined' && window.Calendly) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-calendly]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('calendly script error')));
      return;
    }
    const s = document.createElement('script');
    s.src = WIDGET_SRC;
    s.async = true;
    s.dataset.calendly = '1';
    const timeout = window.setTimeout(() => reject(new Error('calendly timeout')), 9000);
    s.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    s.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('calendly script error'));
    };
    document.head.appendChild(s);
  });
  loader.catch(() => {
    loader = null;
  });
  return loader;
}

// Brand the inline widget to the dark page: without these it's a white rectangle
// inside a dark amber frame. Params appended in code so the base URL (from
// NEXT_PUBLIC_CALENDLY_URL) stays swappable. hide_gdpr_banner kills one overlay.
function brandedUrl(base: string): string {
  try {
    const u = new URL(base);
    // Exact param set from Calendly's builder (Chris-confirmed).
    u.searchParams.set('background_color', '06060A');
    u.searchParams.set('text_color', 'ffffff');
    u.searchParams.set('primary_color', 'e8a33d');
    u.searchParams.set('hide_gdpr_banner', '1');
    // The modal header already says "Book a Strategy Call" — drop Calendly's own
    // event-details block so the calendar starts at the top of the panel.
    u.searchParams.set('hide_event_type_details', '1');
    return u.toString();
  } catch {
    return base;
  }
}

export default function CalendlyEmbed({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
    let settled = false; // ready OR error has fired — whichever comes first wins

    const toError = () => {
      if (settled) return;
      settled = true;
      setStatus('error');
      // Fall back to the scheduler in a new tab. Best-effort (a popup blocker may
      // stop the auto-open) — the visible link below is the guaranteed path, so
      // the CTA is never a dead end.
      try {
        window.open(url, '_blank', 'noopener');
      } catch {
        /* link below covers it */
      }
    };

    // Calendly posts window messages once the inline widget has rendered. Two
    // things ride on them:
    //   1. The first `calendly.*` event (e.g. event_type_viewed) clears the
    //      spinner — clearing on initInlineWidget() alone leaves the panel blank
    //      for the seconds the iframe takes to paint, which reads as broken.
    //   2. `calendly.page_height` carries the content height — we size the iframe
    //      to it (auto-resize) so it never scrolls internally. That removes the
    //      white iframe scrollbar; our own scroll container (hidden bar) handles
    //      any overflow instead, and shorter content leaves a seamless dark gap.
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { event?: unknown; payload?: { height?: unknown } } | null;
      const ev = data?.event;
      if (typeof ev !== 'string' || ev.indexOf('calendly.') !== 0) return;
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        setStatus('ready');
      }
      if (ev === 'calendly.page_height' && typeof data?.payload?.height === 'string') {
        const iframe = hostRef.current?.querySelector('iframe');
        if (iframe) iframe.style.height = data.payload.height;
      }
    };
    window.addEventListener('message', onMessage);

    // Never spin forever: if no render within the window, show the fallback.
    const timer = window.setTimeout(toError, READY_TIMEOUT_MS);

    loadCalendly()
      .then(() => {
        if (settled) return;
        const host = hostRef.current;
        if (window.Calendly && host) {
          host.innerHTML = '';
          // branding:false removes the "Powered by Calendly" ribbon (paid plans).
          window.Calendly.initInlineWidget({ url: brandedUrl(url), parentElement: host, branding: false });
          // Stay in 'loading' — the message listener (or the timeout) resolves it.
        } else {
          toError();
        }
      })
      .catch(toError);

    return () => {
      settled = true; // stop late listeners/timers from flipping state after unmount
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [url]);

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <div ref={hostRef} className={styles.host} />
      </div>
      {status === 'loading' ? (
        <div className={styles.state}>
          <div className={styles.spinner} aria-hidden="true" />
          <span>Loading the scheduler…</span>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className={styles.state} role="alert">
          <span>The scheduler couldn’t load here.</span>
          <a className={styles.fallbackLink} href={url} target="_blank" rel="noopener noreferrer">
            Open the scheduler in a new tab →
          </a>
        </div>
      ) : null}
    </div>
  );
}
