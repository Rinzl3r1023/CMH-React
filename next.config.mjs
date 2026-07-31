/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      // /blog/ index is preserved by a real route, so no redirect needed.
      // Legacy /ai-services -> folded into the coaching conversation (§7 #1).
      { source: '/ai-services', destination: '/dispatch', permanent: true },
    ];
  },
};

export default nextConfig;
