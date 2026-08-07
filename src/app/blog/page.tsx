import type { Metadata } from 'next';
import LibraryIndex from '@/components/LibraryIndex';
import { pageMetadata } from '@/lib/metadata';

// The Library lives at /blog (SEO equity preserved); nav labels it "The Show".
export const metadata: Metadata = pageMetadata({
  title: 'Library — everything I’ve found up ahead',
  description:
    'Videos and written breakdowns from testing AI and marketing inside a real business. Watch the short version or read the full walkthrough.',
  ogTitle: 'Everything I’ve found up ahead.',
  path: '/blog',
});

// The Watch shelf revalidates on the YouTube cache cadence (§4.3).
export const revalidate = 1800;

export default function BlogPage() {
  return <LibraryIndex page={1} />;
}
