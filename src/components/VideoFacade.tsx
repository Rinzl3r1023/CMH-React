'use client';

import { useState } from 'react';
import ResponsiveImage from './ResponsiveImage';
import type { Cover } from '@/lib/posts';

// Click-to-load facade for a post's YouTube embed. Renders the post's OWN cover
// (already sharp-optimized and on-brand — no third-party thumbnail request) as
// the poster with an amber play button; the real youtube-nocookie iframe is
// mounted only on activation, so the ~1 MB player never loads on page render.
//
// - Autoplays on activation: the click/keypress is a user gesture, so the
//   browser allows unmuted autoplay when the iframe mounts in the same turn.
// - Keyboard-operable for free: it's a real <button> — focusable, and both
//   Enter and Space fire its click.
// - The dead-ID guard lives upstream (liveYouTubeId): this only ever renders
//   when the caller has already resolved a live id, so denylisted videos never
//   reach here — no poster, no facade.
export default function VideoFacade({
  videoId,
  cover,
  title,
}: {
  videoId: string;
  cover: Cover | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    // Same .ytEmbed box as before — exactly one iframe after the swap.
    return (
      <div className="ytEmbed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button type="button" className="ytFacade" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
      {cover ? (
        <ResponsiveImage cover={cover} alt="" sizes="(max-width: 800px) 100vw, 760px" priority className="ytFacade-poster" />
      ) : (
        <span className="ytFacade-poster ytFacade-blank" aria-hidden="true" />
      )}
      <span className="ytFacade-btn" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" focusable="false">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}
