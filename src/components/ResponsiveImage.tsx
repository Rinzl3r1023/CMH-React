import Image from 'next/image';
import type { Cover } from '@/lib/posts';

// Responsive image built on next/image, which is backed by sharp. With the
// deviceSizes configured in next.config.mjs (400/800/1200/1600) and
// formats AVIF -> WebP, this generates the srcset + modern formats automatically
// (§3.2). Sizes are never hand-managed.
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
  return (
    <Image
      src={cover.src}
      width={cover.width}
      height={cover.height}
      alt={alt}
      sizes={sizes}
      className={className}
      style={style}
      // Below-the-fold images stay lazy; the featured hero can opt into priority.
      priority={priority}
      loading={priority ? undefined : 'lazy'}
    />
  );
}
