import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogIndex from '@/components/BlogIndex';
import { pageMetadata } from '@/lib/metadata';
import { getGridPosts } from '@/lib/posts';
import { POSTS_PER_PAGE } from '@/lib/site';

// Preserves the WordPress-indexed /blog/page/N shape (§5.4). Page 1 lives at
// /blog, so this route covers 2..totalPages.
export function generateStaticParams() {
  const total = Math.max(1, Math.ceil(getGridPosts().length / POSTS_PER_PAGE));
  const params: { n: string }[] = [];
  for (let n = 2; n <= total; n++) params.push({ n: String(n) });
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  return pageMetadata({
    title: `Blog — page ${n}`,
    description:
      'Full walkthroughs and breakdowns from testing AI and marketing inside a real business.',
    ogTitle: "What I'm testing, written down.",
    path: `/blog/page/${n}`,
  });
}

export default async function BlogPaginatedPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const page = Number(n);
  if (!Number.isInteger(page) || page < 2) notFound();
  return <BlogIndex page={page} />;
}
