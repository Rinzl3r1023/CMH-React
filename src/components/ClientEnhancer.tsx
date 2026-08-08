'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Reproduces the vanilla runtime baked into the v6 mocks, operating on the
// server-rendered DOM (the static pages are injected as HTML). One mount for
// the whole app; re-runs on route change.
//
//   • .reveal      -> armed, then IntersectionObserver adds `.in` (scroll reveal)
//   • [data-par]   -> parallax translate on scroll
//   • [data-grid]  -> perspective grid paused by default (mock default gridSpeed "still")
//   • [data-bloom] -> horizon bloom opacity (mock default glowIntensity 100)
//   • [data-nav-toggle]/[data-mobile-menu] -> mobile menu open/close
//   • [data-kit-form] -> posts the email to /api/subscribe (server holds the key, §6.2)
//
// All of it respects prefers-reduced-motion.
export default function ClientEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Scroll reveal ────────────────────────────────────────────────────────
    let io: IntersectionObserver | undefined;
    let safety: ReturnType<typeof setTimeout> | undefined;
    const reveals = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if ('IntersectionObserver' in window && reveals.length) {
      reveals.forEach((el) => el.classList.add('armed'));
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.remove('armed');
              e.target.classList.add('in');
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
      );
      reveals.forEach((el) => io!.observe(el));
      // Failsafe: never leave content hidden if the observer never fires.
      safety = setTimeout(
        () => reveals.forEach((el) => { el.classList.remove('armed'); el.classList.add('in'); }),
        2500,
      );
    }

    // ── Parallax ─────────────────────────────────────────────────────────────
    let onScroll: (() => void) | undefined;
    let raf = 0;
    if (!reduced) {
      const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-par]'));
      onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const y = window.scrollY || 0;
          layers.forEach((el) => {
            const k = parseFloat(el.getAttribute('data-par') || '0') || 0;
            el.style.transform = `translate3d(0,${(y * k).toFixed(2)}px,0)`;
          });
          raf = 0;
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ── Date stamp ───────────────────────────────────────────────────────────
    // Computed client-side, never baked at build: a frozen "YYYY.MM" is accurate
    // on deploy day and wrong the next month. Mirrors the mock's renderVals().
    {
      const d = new Date();
      const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
      document
        .querySelectorAll<HTMLElement>('[data-stamp]')
        .forEach((el) => { el.textContent = stamp; });
    }

    // ── Atmosphere (mock defaults) ──────────────────────────────────────────
    // gridSpeed "still" -> grid animation paused; glowIntensity 100 -> bloom .85
    document.querySelectorAll<HTMLElement>('[data-grid]').forEach((el) => {
      el.style.animationPlayState = 'paused';
    });
    document.querySelectorAll<HTMLElement>('[data-bloom]').forEach((el) => {
      el.style.opacity = '0.85';
    });

    // ── External CTA links (env-configured, §1.1 / §2.10 / §9) ───────────────
    // The nav "book a call" CTA and the Home coaching "Learn more" CTA route to
    // URLs supplied via env. They are hidden by default (globals.css) and revealed
    // ONLY when their URL is set — fail-closed, like the Kit 503. An unset URL
    // ships nothing rather than a button that scrolls to the wrong place.
    // Final public URLs (§9). Baked as defaults so the CTAs work on every deploy;
    // Railway can override via env. Set an env var to an empty string to force the
    // fail-closed (hidden) state again.
    const calendly =
      process.env.NEXT_PUBLIC_CALENDLY_URL ?? 'https://calendly.com/chris-chrismichaelharris/30min';
    if (calendly) {
      document.querySelectorAll<HTMLAnchorElement>('[data-book-call]').forEach((a) => {
        a.href = calendly;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.setProperty('display', 'inline-flex', 'important');
      });
    }
    const coaching = process.env.NEXT_PUBLIC_COACHING_URL ?? 'https://thebusinesslounge.co/coaching/';
    if (coaching) {
      document.querySelectorAll<HTMLAnchorElement>('[data-coaching-link]').forEach((a) => {
        a.href = coaching;
        a.style.setProperty('display', 'inline-flex', 'important');
      });
    }

    // ── Mobile menu ──────────────────────────────────────────────────────────
    const toggle = document.querySelector<HTMLElement>('[data-nav-toggle]');
    const menu = document.querySelector<HTMLElement>('[data-mobile-menu]');
    const onToggle = () => {
      if (!menu) return;
      const open = menu.classList.toggle('open');
      toggle?.setAttribute('aria-expanded', String(open));
    };
    const onClose = () => {
      menu?.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    toggle?.addEventListener('click', onToggle);
    const closers = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-close]'));
    closers.forEach((el) => el.addEventListener('click', onClose));

    // ── Kit capture forms ────────────────────────────────────────────────────
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('[data-kit-form]'));
    const formHandlers: Array<[HTMLFormElement, (e: Event) => void]> = [];
    forms.forEach((form) => {
      const handler = async (e: Event) => {
        e.preventDefault();
        const input = form.querySelector<HTMLInputElement>('[data-kit-email]');
        const hp = form.querySelector<HTMLInputElement>('[data-kit-hp]');
        const btn = form.querySelector<HTMLElement>('[data-kit-btn]');
        const note = form.parentElement?.querySelector<HTMLElement>('p:last-of-type');
        const email = input?.value?.trim();
        if (!email) return;
        if (btn) btn.textContent = 'Sending…';
        try {
          const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, company: hp?.value || '' }),
          });
          if (!res.ok) throw new Error(String(res.status));
          if (btn) btn.textContent = "You're in ✓";
          if (input) input.value = '';
          if (note) note.textContent = "You're in. First dispatch arrives this week.";
        } catch {
          if (btn) btn.textContent = 'Try again';
          if (note) note.textContent = 'Something went wrong. Please try again in a moment.';
        }
      };
      form.addEventListener('submit', handler);
      formHandlers.push([form, handler]);
    });

    return () => {
      io?.disconnect();
      if (safety) clearTimeout(safety);
      if (onScroll) window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      toggle?.removeEventListener('click', onToggle);
      closers.forEach((el) => el.removeEventListener('click', onClose));
      formHandlers.forEach(([form, handler]) => form.removeEventListener('submit', handler));
    };
  }, [pathname]);

  return null;
}
