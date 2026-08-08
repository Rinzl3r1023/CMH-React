import type { MetadataRoute } from 'next';
import { POSTS_PER_PAGE, canonicalUrl } from '@/lib/site';
import { getAllPosts, getGridPosts } from '@/lib/posts';

// Sitemap covering every canonical URL: static routes, blog index + its real
// pagination, and every post at its root-level slug (§1.1). Submit this to
// Search Console at cutover.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Trailing-slash canonical URLs (match the served paths).
  const staticRoutes = ['/', '/about', '/dispatch', '/blog'].map((p) => ({
    url: canonicalUrl(p),
    lastModified: now,
  }));

  const totalPages = Math.max(1, Math.ceil(getGridPosts().length / POSTS_PER_PAGE));
  const blogPages = [];
  for (let n = 2; n <= totalPages; n++) {
    blogPages.push({ url: canonicalUrl(`/blog/page/${n}`), lastModified: now });
  }

  const posts = getAllPosts().map((post) => ({
    url: canonicalUrl(`/${post.slug}`),
    lastModified: post.date ? new Date(post.date) : now,
  }));

  return [...staticRoutes, ...blogPages, ...posts];
}
