import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import LibraryIndex from '@/components/LibraryIndex';
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
    title: `The Show — page ${n}`,
    description:
      'Full walkthroughs and breakdowns from testing AI and marketing inside a real business.',
    ogTitle: 'Everything I’m finding, as I find it.',
    path: `/blog/page/${n}`,
  });
}

export default async function BlogPaginatedPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const page = Number(n);
  const totalPages = Math.max(1, Math.ceil(getGridPosts().length / POSTS_PER_PAGE));
  // Out-of-range (below 2, non-integer, or past the last page) -> 307 to /blog/,
  // never a 404. Filtering noindex posts out of the grid SHRINKS the page range,
  // so WordPress-era /blog/page/N URLs that are now beyond the end still resolve
  // to the archive rather than dead-ending. Temporary (307): the range grows as
  // more posts migrate, so a page that's out-of-range today may be valid later.
  if (!Number.isInteger(page) || page < 2 || page > totalPages) redirect('/blog/');
  return <LibraryIndex page={page} />;
}
