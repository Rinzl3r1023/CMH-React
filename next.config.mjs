/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WordPress served every URL with a trailing slash (confirmed from the WXR
  // export's <link> values, e.g. https://chrismichaelharris.com/ep106/). Serving
  // the exact same paths keeps the migration invisible to Google — every indexed
  // URL lands on the page, not a redirect. Canonicals, sitemap, schema @ids/urls,
  // and internal links are all trailing-slash to match.
  trailingSlash: true,
  // Post cover images are co-located in /content and served through the
  // ResponsiveImage component, which uses next/image (backed by sharp) to
  // generate AVIF -> WebP -> JPEG variants at 400/800/1200/1600 (§3.2).
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [400, 800, 1200, 1600],
    imageSizes: [400, 800, 1200, 1600],
  },
  // The blog previously lived at WordPress-generated routes. Anything that is
  // intentionally not carried forward gets a 301 here (§1.1). Root-level post
  // slugs are served by the [slug] catch-all, NOT redirected.
  async redirects() {
    return [
      // The Show + the blog merged into one destination at /blog (labelled
      // "The Show" in the nav). Old /show 301s there so its equity carries over.
      // Explicit 301 (not Next's default 308) per the migration decision.
      { source: '/show', destination: '/blog/', statusCode: 301 },
      // Legacy /ai-services -> folded into the coaching conversation (§7 #1).
      { source: '/ai-services', destination: '/dispatch/', statusCode: 301 },
    ];
  },
};

export default nextConfig;
