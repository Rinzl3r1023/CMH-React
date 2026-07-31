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

    // ── Atmosphere (mock defaults) ──────────────────────────────────────────
    // gridSpeed "still" -> grid animation paused; glowIntensity 100 -> bloom .85
    document.querySelectorAll<HTMLElement>('[data-grid]').forEach((el) => {
      el.style.animationPlayState = 'paused';
    });
    document.querySelectorAll<HTMLElement>('[data-bloom]').forEach((el) => {
      el.style.opacity = '0.85';
    });

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
        const btn = form.querySelector<HTMLElement>('[data-kit-btn]');
        const note = form.parentElement?.querySelector<HTMLElement>('p:last-of-type');
        const email = input?.value?.trim();
        if (!email) return;
        if (btn) btn.textContent = 'Sending…';
        try {
          const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
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
