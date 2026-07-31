import type { MetadataRoute } from 'next';
import { SITE_URL, POSTS_PER_PAGE } from '@/lib/site';
import { getAllPosts, getGridPosts } from '@/lib/posts';

// Sitemap covering every canonical URL: static routes, blog index + its real
// pagination, and every post at its root-level slug (§1.1). Submit this to
// Search Console at cutover.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = ['', '/about', '/show', '/dispatch', '/blog'].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
  }));

  const totalPages = Math.max(1, Math.ceil(getGridPosts().length / POSTS_PER_PAGE));
  const blogPages = [];
  for (let n = 2; n <= totalPages; n++) {
    blogPages.push({ url: `${SITE_URL}/blog/page/${n}`, lastModified: now });
  }

  const posts = getAllPosts().map((post) => ({
    url: `${SITE_URL}/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : now,
  }));

  return [...staticRoutes, ...blogPages, ...posts];
}
