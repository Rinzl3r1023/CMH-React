'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CalendlyEmbed.module.css';

declare global {
  interface Window {
    Calendly?: { initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void };
  }
}

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
    u.searchParams.set('hide_gdpr_banner', '1');
    u.searchParams.set('background_color', '06060A');
    u.searchParams.set('text_color', 'EDEAE4');
    u.searchParams.set('primary_color', 'E8A33D');
    return u.toString();
  } catch {
    return base;
  }
}

export default function CalendlyEmbed({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    loadCalendly()
      .then(() => {
        if (cancelled) return;
        const host = hostRef.current;
        if (window.Calendly && host) {
          host.innerHTML = '';
          window.Calendly.initInlineWidget({ url: brandedUrl(url), parentElement: host });
          setStatus('ready');
        } else {
          throw new Error('calendly unavailable');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        // Fall back to the scheduler in a new tab. Best-effort (a popup blocker may
        // stop the auto-open) — the visible link below is the guaranteed path, so
        // the CTA is never a dead end.
        try {
          window.open(url, '_blank', 'noopener');
        } catch {
          /* link below covers it */
        }
      });
    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [url]);

  return (
    <div className={styles.wrap}>
      <div ref={hostRef} className={styles.host} />
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
