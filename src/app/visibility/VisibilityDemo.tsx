'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './visibility.module.css';

// AI Visibility Demo — the /visibility UI (client). Drives the §5 state machine:
//   0 form → 1 running (SSE) → 2 mirror → 3 absence → 4 email gate → 5 score
//   + terminal states at_capacity / rate_limited / error.
//
// BEACON (§9): every headline and label here says "business owner" or behavior —
// never coach / consultant / service provider. The category PILLS may name a
// profession: that's self-identification AFTER the click, which is allowed.

// §4 category pills. `key` matches the server template map exactly; `label` is the
// visitor-facing bucket (professions allowed here — post-click self-ID).
const PILLS: { key: string; label: string }[] = [
  { key: 'coaching', label: 'Coaching or consulting' },
  { key: 'marketing', label: 'Marketing or creative services' },
  { key: 'health', label: 'Health, wellness, or fitness' },
  { key: 'course', label: 'Course, membership, or community' },
  { key: 'professional', label: 'Financial, legal, or professional services' },
  { key: 'local', label: 'Home or local service business' },
  { key: 'real_estate', label: 'Real estate' },
  { key: 'other', label: 'Service provider — something else' },
];

// Pills where location is expected (fix B4a) — the placeholder invites a city.
// Every other pill reads "Optional" and can be skipped without a decision.
const LOCAL_PILLS = new Set(['local', 'real_estate', 'health']);

// §1 running narration, keyed by the search kind the server streams.
const NARRATION: Record<string, string> = {
  identity: 'Asking what AI thinks your business is…',
  buyer_intent: 'Checking what comes up when someone searches for what you sell…',
  comparative: "Comparing you to who's showing up instead…",
};
const STEP_ORDER = ['identity', 'buyer_intent', 'comparative'];

type Phase = 'form' | 'running' | 'reveal' | 'gate' | 'scoring' | 'score' | 'at_capacity' | 'rate_limited' | 'error';

interface Mirror {
  verdict?: string;
  body: string;
  accurate: boolean; // code signal (C1): ✅ accurate vs ⚠️ stale/colliding/wrong
}
interface Absence {
  appeared: boolean;
  query: string;
  recommended: string[];
  body: string;
}
interface Criterion {
  name: string;
  score: number;
  note: string;
}
interface Payoff {
  score: { clarity: number; presence: number; total: number; outOf: number };
  pillars: { clarity: { criteria: Criterion[] }; presence: { criteria: Criterion[] } };
  fixes: string[];
  crawlability: string;
}

// .trim() guards against a stray newline/space from a dashboard copy-paste — a
// trailing newline on the site key once made Turnstile reject it as invalid.
const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();
const COMMUNITY_URL = (process.env.NEXT_PUBLIC_COMMUNITY_URL || '').trim() || '#';
const CALENDLY_URL = (process.env.NEXT_PUBLIC_CALENDLY_URL || '').trim() || '#';

declare global {
  interface Window {
    onTurnstileLoad?: () => void;
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void; theme?: string }) => string;
      reset: (id?: string) => void;
    };
  }
}

export default function VisibilityDemo() {
  const [phase, setPhase] = useState<Phase>('form');

  // Inputs (§4).
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [what, setWhat] = useState('');
  const [who, setWho] = useState('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState('');
  // Re-entry guards (C2): a double-click must never fire a duplicate run — that
  // one costs real money (search fees + a Call), not just a conversion.
  const runningRef = useRef(false);
  const gatingRef = useRef(false);

  // Turnstile.
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileRendered = useRef(false);
  const gotToken = useRef(false);

  // Run outputs.
  const [sessionToken, setSessionToken] = useState('');
  const [activeSteps, setActiveSteps] = useState<Record<string, 'active' | 'done'>>({});
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [absence, setAbsence] = useState<Absence | null>(null);

  // Gate.
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [gateError, setGateError] = useState('');
  const [gateBusy, setGateBusy] = useState(false);

  // Score.
  const [payoff, setPayoff] = useState<Payoff | null>(null);

  // Terminal.
  const [terminalMsg, setTerminalMsg] = useState('');
  const [terminalCta, setTerminalCta] = useState<'community' | 'calendly' | null>(null);

  // Load + render Turnstile once, only when a site key is configured.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || turnstileRendered.current) return;

    const doRender = () => {
      if (turnstileRendered.current || !turnstileRef.current || !window.turnstile) return;
      turnstileRendered.current = true;
      window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (t) => {
          gotToken.current = true;
          setTurnstileToken(t);
          setTurnstileFailed(false);
        },
        'error-callback': () => {
          setTurnstileToken('');
          setTurnstileFailed(true);
        },
      });
    };

    // Explicit-render + onload path. turnstile.ready() is INCOMPATIBLE with an
    // async/defer script tag (the API rejects it), and a blocking script on a
    // paid-traffic landing page is the wrong trade — so keep async/defer and load
    // `api.js?render=explicit&onload=onTurnstileLoad`. The global MUST be defined
    // BEFORE the tag is injected so the callback exists when the API fires it.
    window.onTurnstileLoad = doRender;

    // Never-dead-end: if no token has been produced within the window (script
    // blocked, failed to load, or silently no-op'd), surface an honest failure
    // state instead of a working-looking page with an unclickable button. A late
    // token still clears the flag via the callback above.
    const failTimer = setTimeout(() => {
      if (!gotToken.current) setTurnstileFailed(true);
    }, 8000);

    if (window.turnstile) {
      // API already present (e.g. client-side nav back to the form) — render now.
      doRender();
    } else if (!document.querySelector('script[data-turnstile]')) {
      // Inject EXACTLY once: the data-turnstile marker guards against a second
      // tag on re-render/remount (the query survives new component instances).
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '');
      s.onerror = () => setTurnstileFailed(true);
      document.head.appendChild(s);
    }

    return () => clearTimeout(failTimer);
  }, []);

  function toTerminal(kind: 'at_capacity' | 'rate_limited' | 'error', msg: string, cta: 'community' | 'calendly' | null) {
    setTerminalMsg(msg);
    setTerminalCta(cta);
    setPhase(kind);
  }

  // ── Submit the form → open the SSE run ──────────────────────────────────────
  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Enter your business or brand name.');
      return;
    }
    if (!category) {
      setFormError('Pick the closest category.');
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setFormError('Please complete the verification.');
      return;
    }
    // Double-click guard (C2): a second click in the same tick would fire a second
    // paid run before React unmounts the form. The ref blocks it synchronously.
    if (runningRef.current) return;
    runningRef.current = true;

    setPhase('running');
    setActiveSteps({});
    setMirror(null);
    setAbsence(null);

    try {
      const res = await fetch('/api/visibility-demo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, url, category, what, who, location, turnstileToken }),
      });
      if (!res.ok || !res.body) {
        toTerminal('error', 'Something went wrong starting your check. Please try again.', null);
        return;
      }
      await consumeSse(res.body);
    } catch {
      toTerminal('error', 'Something went wrong. Please try again.', null);
    }
  }

  // Parse the SSE stream and drive state as events arrive (real streamed narration).
  async function consumeSse(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        handleEvent(evt);
      }
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case 'session':
        if (typeof evt.session_token === 'string') setSessionToken(evt.session_token);
        break;
      case 'search_started':
        if (typeof evt.kind === 'string') setActiveSteps((s) => ({ ...s, [evt.kind as string]: 'active' }));
        break;
      case 'search_complete':
        if (typeof evt.kind === 'string') setActiveSteps((s) => ({ ...s, [evt.kind as string]: 'done' }));
        break;
      case 'mirror':
        setMirror({ verdict: evt.verdict as string | undefined, body: String(evt.body ?? ''), accurate: evt.accurate === true });
        setPhase('reveal');
        break;
      case 'absence':
        setAbsence({
          appeared: evt.appeared === true,
          query: String(evt.query ?? ''),
          recommended: Array.isArray(evt.recommended) ? (evt.recommended as string[]) : [],
          body: String(evt.body ?? ''),
        });
        setPhase('reveal');
        break;
      case 'call1_complete':
        setPhase('gate');
        break;
      case 'at_capacity':
        toTerminal(
          'at_capacity',
          "We're at capacity right now. Rather than leave you with nothing — grab a slot and I'll walk you through your visibility personally.",
          'calendly',
        );
        break;
      case 'rate_limited':
        toTerminal(
          'rate_limited',
          typeof evt.message === 'string' ? evt.message : "You've already run this today. Want the full framework instead?",
          'community',
        );
        break;
      case 'error':
        toTerminal('error', typeof evt.message === 'string' ? evt.message : 'The check could not complete. Please try again.', null);
        break;
    }
  }

  // ── Email gate → subscribe → fetch the gated score ──────────────────────────
  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    setGateError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGateError('Please enter a valid email.');
      return;
    }
    // Double-click guard (C2): Call 2 spends tokens; a duplicate submit before the
    // first persists would double-charge. Block re-entry synchronously.
    if (gatingRef.current) return;
    gatingRef.current = true;
    setGateBusy(true);
    try {
      const g = await fetch('/api/visibility-demo/gate/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, company, session_token: sessionToken }),
      });
      const gj = (await g.json()) as { ok?: boolean; error?: string };
      if (!g.ok || !gj.ok) {
        setGateError(gj.error || 'Could not unlock. Please try again.');
        setGateBusy(false);
        gatingRef.current = false; // allow a genuine retry
        return;
      }
      setPhase('scoring');
      const s = await fetch('/api/visibility-demo/score/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken }),
      });
      const sj = (await s.json()) as (Payoff & { ok?: boolean; at_capacity?: boolean }) | { ok: false; at_capacity?: boolean };
      if (s.status === 503 || (sj as { at_capacity?: boolean }).at_capacity) {
        toTerminal(
          'at_capacity',
          "We're at capacity right now. Rather than leave you with nothing — grab a slot and I'll walk you through your visibility personally.",
          'calendly',
        );
        return;
      }
      if (!s.ok || !(sj as { score?: unknown }).score) {
        toTerminal('error', 'Your score could not be generated. Please try again.', null);
        return;
      }
      setPayoff(sj as Payoff);
      setPhase('score');
    } catch {
      setGateError('Could not unlock. Please try again.');
      setGateBusy(false);
      gatingRef.current = false; // allow a genuine retry
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {/* Terminal states */}
        {(phase === 'at_capacity' || phase === 'rate_limited' || phase === 'error') && (
          <div className={styles.terminal}>
            <p className={styles.terminalMsg}>{terminalMsg}</p>
            {terminalCta === 'calendly' ? (
              // at_capacity: they got nothing — a human conversation salvages the
              // lead. A $199 ask here would read as tone-deaf (§ at_capacity ≠ rate_limited).
              <a className={styles.button} href={CALENDLY_URL} style={{ display: 'inline-block', width: 'auto', padding: '0.9rem 1.6rem' }}>
                Grab a slot
              </a>
            ) : terminalCta === 'community' ? (
              // rate_limited: they already ran the check → the discount is earned.
              // Name it, don't drop them on a generic button to a promo page.
              <a className={styles.button} href={COMMUNITY_URL} style={{ display: 'inline-block', width: 'auto', padding: '0.9rem 1.6rem' }}>
                Claim 50% off your first month
              </a>
            ) : (
              <button
                className={styles.buttonGhost}
                style={{ width: 'auto', padding: '0.9rem 1.6rem' }}
                onClick={() => {
                  runningRef.current = false; // allow a fresh run after an error
                  gatingRef.current = false;
                  setPhase('form');
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* State 0 — form */}
        {phase === 'form' && (
          <form onSubmit={runCheck}>
            <p className={styles.eyebrow}>AI Visibility Check</p>
            <h1 className={styles.h1}>What does AI say about your business?</h1>
            <p className={styles.lede}>Your buyers are asking ChatGPT for recommendations. Find out what it tells them.</p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vd-name">
                Business or personal brand name
              </label>
              <input id="vd-name" className={styles.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vd-url">
                Website URL <span className={styles.hint}>— used only to tell you apart from others</span>
              </label>
              <input id="vd-url" className={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="yourbusiness.com" />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Which is closest?</span>
              <div className={styles.pills}>
                {PILLS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    className={category === p.key ? `${styles.pill} ${styles.pillActive}` : styles.pill}
                    onClick={() => setCategory(p.key)}
                    aria-pressed={category === p.key}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location follows the pill while that context is fresh (fix B4b). The
                pill the visitor just tapped answers "are you location-based?" — so
                the placeholder, not a static hint, sets the expectation: local
                pills invite a city, everything else reads "Optional" and is skipped
                without a decision. Always optional (a mobile/virtual practice must
                never hit a wall on a lead magnet). */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vd-location">
                Where are you based?
              </label>
              <input
                id="vd-location"
                className={styles.input}
                value={location}
                maxLength={60}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={LOCAL_PILLS.has(category) ? 'City or region' : 'Optional — city or region'}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vd-what">
                What do you do? <span className={styles.count}>{what.length}/40</span>
              </label>
              <input id="vd-what" className={styles.input} value={what} maxLength={40} onChange={(e) => setWhat(e.target.value)} placeholder="fractional CFO work" />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="vd-who">
                Who do you serve? <span className={styles.count}>{who.length}/60</span>
              </label>
              <input id="vd-who" className={styles.input} value={who} maxLength={60} onChange={(e) => setWho(e.target.value)} placeholder="e-commerce brands" />
            </div>

            {TURNSTILE_SITE_KEY && <div className={styles.turnstile} ref={turnstileRef} />}

            {/* Never-dead-end: a missing/blocked widget must not leave a working-
                looking form with an unclickable button. Offer an honest out. */}
            {turnstileFailed && (
              <p className={styles.error}>
                Verification didn&rsquo;t load. Refresh to try again, or{' '}
                <a href={CALENDLY_URL} style={{ color: 'var(--vd-amber)', textDecoration: 'underline' }}>
                  book a call
                </a>{' '}
                and we&rsquo;ll run your check with you.
              </p>
            )}

            <button className={styles.button} type="submit">
              Check my visibility
            </button>
            {/* Pre-click time expectation (C2) — under-promise; early feels fast. */}
            <p className={styles.timeHint}>Takes about 30 seconds — we run live searches.</p>
            {formError && <p className={styles.error}>{formError}</p>}
          </form>
        )}

        {/* State 1 — running */}
        {phase === 'running' && (
          <div>
            <p className={styles.eyebrow}>Running your check</p>
            <h1 className={styles.h1}>Asking AI about {name || 'your business'}…</h1>
            <p className={styles.lede}>This takes about 30–45 seconds. We run it live.</p>
            <ul className={styles.steps}>
              {STEP_ORDER.map((k) => {
                const st = activeSteps[k];
                const cls = st === 'done' ? `${styles.step} ${styles.stepDone}` : st === 'active' ? `${styles.step} ${styles.stepActive}` : styles.step;
                return (
                  <li key={k} className={cls}>
                    <span className={styles.dot} />
                    <span>{NARRATION[k]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* States 2/3/4 — reveal + gate */}
        {(phase === 'reveal' || phase === 'gate' || phase === 'scoring') && (
          <div>
            <p className={styles.eyebrow}>What AI says about {name || 'you'}</p>

            {/* Section 1 — label follows the finding (C1): ✅ accurate / ⚠️ not. */}
            {mirror && (
              <div className={styles.card}>
                <p className={styles.cardLabel}>
                  <span className={styles.findingIcon} aria-hidden="true">
                    {mirror.accurate ? '✅' : '⚠️'}
                  </span>
                  What AI says about you
                </p>
                <p className={styles.cardBody}>{mirror.body}</p>
              </div>
            )}

            {/* Section 2 — ✅ they appear / ❌ absent (C1). */}
            {absence && (
              <div className={styles.card}>
                <p className={styles.cardLabel}>
                  <span className={styles.findingIcon} aria-hidden="true">
                    {absence.appeared ? '✅' : '❌'}
                  </span>
                  When your buyers search
                </p>
                {absence.query && <p className={styles.queryLine}>&ldquo;{absence.query}&rdquo;</p>}
                <p className={styles.cardBody}>{absence.body}</p>
                {absence.recommended.length > 0 && (
                  <ul className={styles.recList}>
                    {absence.recommended.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* State 4 — gate */}
            {(phase === 'gate' || phase === 'scoring') && (
              <form className={styles.gate} onSubmit={submitGate}>
                <p className={styles.cardLabel}>Your full score</p>
                <p className={styles.cardBody} style={{ marginBottom: '1rem' }}>
                  Want your full visibility score and the top fixes? Enter your email and we&rsquo;ll build the report.
                </p>
                <div className={styles.honeypot} aria-hidden="true">
                  <label>
                    Company
                    <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </label>
                </div>
                <div className={styles.field}>
                  <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    autoComplete="email"
                    disabled={gateBusy}
                  />
                </div>
                <button className={styles.button} type="submit" disabled={gateBusy}>
                  {phase === 'scoring' ? (
                    <span className={styles.btnBusy}>
                      <span className={styles.btnSpinner} aria-hidden="true" />
                      Scoring your visibility…
                    </span>
                  ) : (
                    'Unlock my score'
                  )}
                </button>
                {/* Pre-click time expectation (C2). Silence at this click = the most
                    expensive abandonment in the funnel; the spinner above kills it. */}
                {phase !== 'scoring' && <p className={styles.timeHint}>Takes a few seconds.</p>}
                {gateError && <p className={styles.error}>{gateError}</p>}
              </form>
            )}
          </div>
        )}

        {/* State 5 — score */}
        {phase === 'score' && payoff && (
          <div>
            <p className={styles.eyebrow}>Your AI visibility score</p>
            <div className={styles.scoreHead}>
              <span className={styles.scoreBig}>{payoff.score.total}</span>
              <span className={styles.scoreOf}>/ {payoff.score.outOf}</span>
            </div>

            <div className={styles.pillars}>
              <ScorePillar name="Clarity" score={payoff.score.clarity} criteria={payoff.pillars?.clarity?.criteria ?? []} />
              <ScorePillar name="Presence" score={payoff.score.presence} criteria={payoff.pillars?.presence?.criteria ?? []} />
            </div>

            {payoff.fixes?.length > 0 && (
              <div className={styles.card}>
                <p className={styles.cardLabel}>Top fixes</p>
                <ol className={styles.fixes}>
                  {payoff.fixes.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* "What this means" (C3) — a RECEIPT, not a prediction. Variant chosen
                by the code-anchored appeared_in_buyer_query signal, never the model.
                HARD CONSTRAINT: no comparative/percentile claim — there's no
                benchmark yet, and that clause is the first thing a skeptic breaks. */}
            {absence && (
              <div className={styles.meaning}>
                <p className={styles.meaningLabel}>What this means</p>
                <p className={styles.meaningBody}>
                  {absence.appeared
                    ? "When someone asks AI for a recommendation in your category, you're in the set it draws from. That's the position most businesses in your category haven't reached yet."
                    : "When someone asks AI for a recommendation in your category, it pulls from sources like the ones above. You weren't in them. That doesn't mean AI has never heard of you — it means you're not in the set it draws from when a buyer is deciding."}
                </p>
              </div>
            )}

            <div className={styles.wall}>
              {payoff.crawlability && <p className={styles.crawlNote}>{payoff.crawlability}</p>}
              <p className={styles.cardBody} style={{ marginBottom: '0.9rem' }}>
                The full framework builds the fix — the canonical entity page, structured credentials, the AEO rewrites. Indexing takes 60–90 days
                and no asset shortens it, so the sooner it&rsquo;s built, the sooner it lands. It&rsquo;s inside the community.
              </p>
              {/* The community page is a 50%-off offer. Naming the discount as EARNED
                  (you ran the check) is what keeps a standing promo an honest scale
                  rather than a generic button onto a discount page. */}
              <p className={styles.earnedLine}>You ran the check — here&rsquo;s 50% off your first month.</p>
              <a className={styles.button} href={COMMUNITY_URL} style={{ display: 'inline-block', width: 'auto', padding: '0.9rem 1.6rem' }}>
                Claim 50% off your first month
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ScorePillar({ name, score, criteria }: { name: string; score: number; criteria: Criterion[] }) {
  return (
    <div className={styles.pillarBox}>
      <p className={styles.pillarName}>{name}</p>
      <p className={styles.pillarScore}>
        {score}
        <span className={styles.scoreOf}> / 25</span>
      </p>
      {criteria.length > 0 && (
        <ul className={styles.criteria}>
          {criteria.map((c, i) => (
            <li key={i} className={styles.criterion}>
              <span>{c.name}</span>
              <span className={styles.critScore}>{c.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
