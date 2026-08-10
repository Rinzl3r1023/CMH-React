'use client';

import Modal from './Modal';
import CalendlyEmbed from './CalendlyEmbed';

// The modal subtree, split out so BookCallController can load it lazily. Modal and
// CalendlyEmbed each import a CSS module; when they were imported statically from
// the layout-mounted controller, those two stylesheets loaded on EVERY page and
// sat unused until (if ever) someone opened the scheduler. Isolating them here lets
// next/dynamic code-split the JS *and* CSS so they only arrive on first open.
//
// This only mounts while the modal is open (the controller renders it behind
// `open &&`), so `open` is always true here; closing unmounts it — which matches
// Modal's own behavior (it returns null when closed, so there was never an exit
// transition to preserve).
export default function BookCallModal({
  url,
  onClose,
  restoreFocus,
}: {
  url: string;
  onClose: () => void;
  restoreFocus: HTMLElement | null;
}) {
  return (
    <Modal open onClose={onClose} title="Book a strategy call" restoreFocus={restoreFocus}>
      <CalendlyEmbed url={url} />
    </Modal>
  );
}
