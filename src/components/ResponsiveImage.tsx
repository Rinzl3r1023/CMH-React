import ReactDOM from 'react-dom';
import type { Cover } from '@/lib/posts';

// Responsive cover image served from BUILD-TIME assets — deliberately NOT
// next/image. Covers are fixed-size static files, so scripts/sync-covers.mjs
// pre-renders their WebP variants at build; here we emit a plain <picture> with a
// static srcset over those variants and the original file as the universal <img>
// fallback. This keeps covers off the runtime /_next/image optimizer, whose cold
// AVIF encode (~1s/image on Railway's ephemeral cache) was landing on LCP (§perf).
//
// width/height are always set (from the manifest) so the box is reserved and CLS
// stays ~0. `priority` marks the LCP hero: eager + high fetchpriority; everything
// else lazy-loads.
export default function ResponsiveImage({
  cover,
  alt,
  sizes,
  className,
  style,
  priority = false,
}: {
  cover: Cover;
  alt: string;
  sizes: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}) {
  const loading = priority ? 'eager' : 'lazy';
  const fetchPriority = priority ? 'high' : undefined;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- static pre-generated asset, optimizer bypassed by design
    <img
      src={cover.src}
      width={cover.width}
      height={cover.height}
      alt={alt}
      sizes={sizes}
      className={className}
      style={style}
      decoding="async"
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );

  // No pre-generated variants (older manifest / opt-out cover): serve the original.
  if (!cover.variants || cover.variants.length === 0) return img;

  const webpSrcSet = cover.variants
    .slice()
    .sort((a, b) => a.w - b.w)
    .map((v) => `${v.webp} ${v.w}w`)
    .join(', ');

  // Restore the LCP preload that next/image used to inject for the priority hero.
  // React hoists this to <head> so the browser starts the (responsive) fetch before
  // it reaches the <img> in the body. No-op for lazy images.
  if (priority) {
    ReactDOM.preload(cover.src, {
      as: 'image',
      imageSrcSet: webpSrcSet,
      imageSizes: sizes,
      fetchPriority: 'high',
    });
  }

  return (
    <picture>
      <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
      {img}
    </picture>
  );
}
