import type { Metadata } from 'next';
import VisibilityDemo from './VisibilityDemo';

// Standalone lead-capture demo. noindex (§ REV 1.1: route standalone, no nav,
// noindex). No nav/footer chrome — the root layout injects none, so rendering
// only the demo keeps this page clean. Not linked from anywhere on the site.
export const metadata: Metadata = {
  title: 'What Does AI Say About Your Business?',
  robots: { index: false, follow: false },
};

export default function VisibilityPage() {
  return <VisibilityDemo />;
}
