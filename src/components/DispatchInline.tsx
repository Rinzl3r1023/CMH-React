// Mid-article Dispatch capture (understated, inline — one line + an email field,
// not a full card). Posts to the existing /api/subscribe via the global
// ClientEnhancer, which wires every [data-kit-form]: it reads [data-kit-email],
// the [data-kit-hp] honeypot, updates [data-kit-btn], and writes the result into
// the parent's last <p> (the note below). No new endpoint.
export default function DispatchInline() {
  return (
    <aside className="dispatchInline" aria-label="Subscribe to The Dispatch">
      <span className="dispatchInline-label">The Dispatch</span>
      <p className="dispatchInline-line">One useful email a week — what&rsquo;s worth knowing in AI + marketing, in plain language.</p>
      <form data-kit-form="" className="dispatchInline-form">
        <input
          type="text"
          name="company"
          data-kit-hp=""
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
        />
        <input type="email" required placeholder="your@email.com" name="email" data-kit-email="" />
        <button type="submit">
          <span data-kit-btn="">Subscribe</span>
        </button>
      </form>
      <p className="dispatchInline-note">No hype. Unsubscribe anytime.</p>
    </aside>
  );
}
