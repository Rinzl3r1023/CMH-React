// Author block at the foot of every post — a micro bio only (the longer,
// third-person authority bios are the wrong tone here and would clash with the
// site's first-person voice). Reinforces the Person entity for AI/answer engines
// and links the methodology. Renders on all posts, next to the CallCTA.
export default function AuthorBlock() {
  return (
    <aside className="authorBlock" aria-label="About the author">
      {/* eslint-disable-next-line @next/next/no-img-element -- static committed asset */}
      <img
        className="authorBlock-avatar"
        src="/images/chris-portrait.jpg"
        alt="Chris Michael Harris"
        width={60}
        height={60}
        loading="lazy"
        decoding="async"
      />
      <p className="authorBlock-bio">
        <span className="authorBlock-name">Chris Michael Harris</span> — Marketing + AI strategist.
        Co-founder of The Business Lounge. Helps business owners turn content into customers using the{' '}
        <a href="/content-to-customers/">Content to Customers Method</a>.{' '}
        <a href="/">chrismichaelharris.com</a>
      </p>
    </aside>
  );
}
