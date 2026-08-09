// End-of-article call CTA (full block, standard site treatment). Renders only for
// posts with `cta: full`. The link is [data-book-call]: hidden by default
// (globals.css) and revealed with the Calendly href by the global ClientEnhancer
// — fail-closed, so it never shows a dead button. 30 minutes, not 20.
export default function CallCTA() {
  return (
    <aside className="callCta" aria-label="Book a strategy call">
      <span className="callCta-eyebrow">Work with me</span>
      <h2 className="callCta-title">Want a second set of eyes on your marketing?</h2>
      <p className="callCta-body">
        Book a 30-minute strategy call. We&rsquo;ll look at what you&rsquo;re doing, what&rsquo;s actually worth your
        time, and what to do next. No pitch — if it&rsquo;s a fit, it&rsquo;s a fit.
      </p>
      <a href="#" data-book-call="" className="callCta-btn btn">
        Book a 30-min strategy call
      </a>
    </aside>
  );
}
