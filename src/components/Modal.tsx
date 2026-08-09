'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Short uppercase label shown in the panel header (also the a11y name). */
  title: string;
  /** Element to return focus to on close (the trigger). Falls back to whatever
   *  was focused when the modal opened. */
  restoreFocus?: HTMLElement | null;
  children: React.ReactNode;
};

// Reusable modal primitive. Presentation + behavior only; the caller supplies the
// content. Used for the Calendly scheduler now, and the SPARC Concierge panel next
// — one component, two uses.
export default function Modal({ open, onClose, title, restoreFocus, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Body scroll lock. iOS Safari won't honor overflow:hidden alone, so we pin the
  // body with position:fixed and restore the exact scroll offset on close — done
  // precisely, this avoids the scroll-jump the naive version causes. (Verify on a
  // real iOS device; narrow-viewport desktop can't reproduce Safari's quirks.)
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const { body } = document;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, y);
    };
  }, [open]);

  // Remember the opener, move focus into the panel, restore focus on close.
  useEffect(() => {
    if (!open) return;
    openerRef.current = restoreFocus ?? (document.activeElement as HTMLElement | null);
    const panel = panelRef.current;
    // Focus the first real control (the close button) so keyboard users land in-panel.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open, restoreFocus]);

  // Escape to close + Tab focus trap. Once focus enters the Calendly iframe the
  // browser handles internal tabbing; tabbing back out lands on our controls.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el.tagName === 'IFRAME',
      );
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    },
    [onClose],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        // Click-outside: only when the press starts on the backdrop itself, so a
        // drag that ends outside (e.g. selecting text) doesn't close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <p className={styles.title}>
            <span aria-hidden="true" />
            {title}
          </p>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
