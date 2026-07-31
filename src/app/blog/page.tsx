import type { Metadata } from 'next';
import BlogIndex from '@/components/BlogIndex';
import { pageMetadata } from '@/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: "Blog — what I'm testing in AI + marketing",
  description:
    'Full walkthroughs and breakdowns from testing AI and marketing inside a real business. No theory, no hype — just what\'s actually working.',
  ogTitle: "What I'm testing, written down.",
  path: '/blog',
});

export default function BlogPage() {
  return <BlogIndex page={1} />;
}
