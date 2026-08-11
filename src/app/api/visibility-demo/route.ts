import type { NextRequest } from 'next/server';
import {
  clientIp,
  hashIp,
  verifyTurnstile,
  countSessionsThisMonth,
  ipRunInLast24h,
  reserveSession,
  MONTHLY_CEILING,
  // Unified capacity classifier + Anthropic constants — single source of truth in
  // the lib (shared with Call 2). Only the 429-retry logic below stays local: it
  // is search-path-specific and belongs with the search call.
  CapacityError,
  classifyFailure,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  ANTHROPIC_MODEL,
  ANTHROPIC_KEY_ENV,
} from '@/lib/visibility-demo';

// AI Visibility Demo — the RUN route (/api/visibility-demo). STUBBED so it
// compiles/runs without the live ANTHROPIC_API_KEY_DEMO, Turnstile, or Supabase
// creds. Responsibilities now in this route:
//   0. Pre-run gate (§7): Turnstile → IP-24h → monthly ceiling, BEFORE any spend.
//      The ceiling emits the same at_capacity event as the workspace spend cap.
//   1. Query construction from the 5 inputs + §4 category template.
//   2. The 3-search loop, hard-capped IN CODE (fixed queries array + max_uses:1 +
//      a counter) — NOT tool_choice, NOT a prompt. No 4th search is reachable.
//   3. Mirror + absence synthesis (State 2/3) with the code-anchored §6 honesty
//      branch; persistence of raw results + verdict to demo_sessions.
//   4. Real SSE — one event per search, then mirror + absence.
//
// EXPLICITLY NOT in this route: the email capture + Kit subscribe (that's the
// /api/visibility-demo/gate route) and Call 2 (scoring).
//
// SPEC GAP flagged in this file (see COMPARATIVE_QUERY below): §4 defines the
// identity template and the buyer-intent category templates, but NOT the
// comparative (query #3) template — even though the CLARITY rubric (§5) scores
// over "identity + comparative queries". The comparative query here is a clearly
// marked PROVISIONAL, not a silently-invented template. Do not treat it as final.

export const runtime = 'nodejs';
// 3 web searches + synthesis targets ~30–45s (§1). Give the stream headroom.
export const maxDuration = 120;

// ── §4 input caps (chars) ────────────────────────────────────────────────────
const CAP_NAME = 80;
const CAP_WHAT = 40;
const CAP_WHO = 60;

// ── §7.4 hard cap: never more than 3 searches per run, enforced in code ──────
const MAX_SEARCHES = 3;

// Dynamic-filtering web search (available on Sonnet 5). Basic variant is
// web_search_20250305 if a fallback is ever needed. Search-path-specific → local.
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209';

// ── §4 category pills → buyer-intent query template ──────────────────────────
// The free-text fields ([what]/[who]) carry the query; the pill only selects a
// template. The "service provider" pill label is NEVER inserted into a query
// (§4 rationale) — its template uses the same [what]/[who] fields as any other,
// so "best service provider for X" can never be constructed from the pill.
type CategoryKey =
  | 'coaching'
  | 'marketing'
  | 'health'
  | 'course'
  | 'professional'
  | 'local'
  | 'real_estate'
  | 'other';

function buyerIntentQuery(category: string, what: string, who: string): string {
  switch (category) {
    case 'coaching':
      return `best ${what} coach for ${who}`;
    case 'marketing':
      return `best ${what} agency for ${who}`;
    case 'health':
      return `best ${what} coach online for ${who}`;
    case 'course':
      return `best ${what} course 2026`; // §4: this template intentionally omits [who]
    case 'professional':
      return `best ${what} for ${who}`;
    case 'local':
      return `best ${what} in ${who}`; // [who] is a city here
    case 'real_estate':
      return `best realtor in ${who}`; // [who] is an area here
    case 'other':
    default:
      // "Service provider — something else": NEVER the literal pill label.
      return `best ${what} for ${who}`;
  }
}

// ── input sanitization (§7.6 — these strings go into live search queries) ────
function clean(v: unknown, cap: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // strip control chars
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, cap);
}

type QueryKind = 'identity' | 'buyer_intent' | 'comparative';
interface DemoQuery {
  step: number;
  kind: QueryKind;
  text: string;
  provisional?: boolean;
}

function buildQueries(name: string, category: string, what: string, who: string): DemoQuery[] {
  const queries: DemoQuery[] = [
    // §4 identity template — confirmed.
    { step: 1, kind: 'identity', text: `What is ${name}?` },
    // §4 buyer-intent template — confirmed. This is "the moment" (§1).
    { step: 2, kind: 'buyer_intent', text: buyerIntentQuery(category, what, who) },
    // ⚑ SPEC GAP: §4 defines no comparative template. PROVISIONAL — surfaces
    // third-party descriptions for CLARITY criteria 3/5 (accuracy + consistency
    // across independent sources). Do not treat as final; pending §4 sign-off.
    { step: 3, kind: 'comparative', text: `${name} reviews and alternatives`, provisional: true },
  ];
  // Hard cap layer 1: the loop can never see more than MAX_SEARCHES queries.
  return queries.slice(0, MAX_SEARCHES);
}

// ── web search: one Anthropic call = at most ONE search (max_uses:1) ─────────
// Returns the raw web_search_result blocks so Call 2 can score over them later
// without issuing new searches (§ REV 1.1 "two calls").
interface RawSearch {
  step: number;
  kind: QueryKind;
  query: string;
  provisional?: boolean;
  results: unknown[]; // raw web_search_result blocks (or stub equivalents)
  summary: string; // the model's plaintext reading of the results (feeds synthesis)
  usage: { input_tokens: number; output_tokens: number };
  stubbed: boolean;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  content?: unknown[];
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ── retry helpers (one retry on a bare 429, honoring Retry-After) ────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A single retry must not blow the 30–45s run budget (§1), so the wait is capped.
const RETRY_CAP_MS = 5000;
function retryAfterMs(header: string | null): number {
  const DEFAULT = 1000;
  if (!header) return DEFAULT;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, RETRY_CAP_MS);
  const when = Date.parse(header); // HTTP-date form
  if (!Number.isNaN(when)) return Math.min(Math.max(when - Date.now(), 0), RETRY_CAP_MS);
  return DEFAULT;
}

async function searchWeb(
  query: string,
): Promise<{ results: unknown[]; summary: string; usage: { input_tokens: number; output_tokens: number }; stubbed: boolean }> {
  const key = process.env[ANTHROPIC_KEY_ENV];

  // STUB: no key → deterministic mock shaped like real web_search_result blocks,
  // so query construction, persistence, and SSE all run end-to-end keyless.
  if (!key) {
    return {
      results: [
        { type: 'web_search_result', title: `[stub] result for: ${query}`, url: 'https://example.com/', page_age: null },
      ],
      summary: `[stub] no live search ran for "${query}".`,
      usage: { input_tokens: 0, output_tokens: 0 },
      stubbed: true,
    };
  }

  const requestBody = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    // Hard cap layer 2: THIS call may perform at most one web search. Combined
    // with the ≤3-iteration loop, total searches can never exceed 3 — and the
    // model has no way to opt into more (not via tool_choice, not via prompt).
    tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search', max_uses: 1 }],
    messages: [{ role: 'user', content: `Run a single web search for: ${query}` }],
  });

  // Up to two HTTP attempts for ONE search. This retry does NOT consume a search
  // from the 3-search cap: the cap counts searches ISSUED (one per query
  // iteration in the caller), not HTTP attempts. A 429 is rejected before any
  // search runs, so a retried call bills no extra search either.
  let retried = false;
  for (;;) {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: requestBody,
    });

    if (res.ok) {
      const data = (await res.json()) as AnthropicResponse;
      const results: unknown[] = [];
      let summary = '';
      for (const block of data.content ?? []) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          results.push(...block.content);
        } else if (block.type === 'text' && typeof block.text === 'string') {
          summary += block.text;
        }
      }
      return {
        results,
        summary: summary.trim(),
        usage: {
          input_tokens: data.usage?.input_tokens ?? 0,
          output_tokens: data.usage?.output_tokens ?? 0,
        },
        stubbed: false,
      };
    }

    // Non-OK. Read the error body once, classify, and keep raw provider errors
    // off the public page — capacity routes to the shared "at capacity" state.
    let errType = '';
    let errMsg = '';
    try {
      const j = (await res.json()) as { error?: { type?: string; message?: string } };
      errType = j.error?.type ?? '';
      errMsg = j.error?.message ?? '';
    } catch {
      /* non-JSON error body — status-based classification only */
    }
    const cls = classifyFailure(res.status, errType, errMsg);

    if (cls === 'capacity') {
      throw new CapacityError(`anthropic capacity ${res.status}`);
    }
    if (cls === 'ratelimit' && !retried) {
      // One retry on a bare 429, honoring Retry-After (capped). Does not touch
      // the search cap (see note above).
      retried = true;
      await sleep(retryAfterMs(res.headers.get('retry-after')));
      continue;
    }
    if (cls === 'ratelimit') {
      // Retry also rate-limited → treat as capacity (§ "if the retry also 429s").
      throw new CapacityError('anthropic capacity 429 (after retry)');
    }
    throw new Error(`anthropic ${res.status}`);
  }
}

// ── persistence: upsert the Call-1 payload into demo_sessions ────────────────
// PostgREST raw fetch (no @supabase/supabase-js installed). Guarded: without the
// service-role creds it no-ops and reports persisted:false, so the demo runs
// keyless in dev. ⚑ ENV NEEDED (not in the confirmed new-env list § REV 1.1):
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
interface PersistInput {
  sessionToken: string;
  name: string;
  url: string;
  category: string;
  queries: DemoQuery[];
  call1Results: RawSearch[];
  inputTokens: number;
  outputTokens: number;
  mirrorVerdict: string;
  appearedInBuyerQuery: boolean;
  ipHash: string;
}

async function persistCall1(p: PersistInput): Promise<boolean> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !svc) return false;

  const res = await fetch(`${base}/rest/v1/demo_sessions?on_conflict=session_token`, {
    method: 'POST',
    headers: {
      apikey: svc,
      authorization: `Bearer ${svc}`,
      'content-type': 'application/json',
      // Upsert on the unique session_token; don't echo the row back.
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      site_id: 'demo-visibility',
      session_token: p.sessionToken,
      subject_name: p.name,
      subject_url: p.url || null,
      category: p.category,
      queries_run: p.queries,
      call1_results: p.call1Results,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      ip_hash: p.ipHash,
      // §8 — mirror_verdict (short text) + appeared_in_buyer_query (the single
      // most valuable analytics field, §8) come out of the synthesis step.
      mirror_verdict: p.mirrorVerdict || null,
      appeared_in_buyer_query: p.appearedInBuyerQuery,
      map_generated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
}

// ── State 2 + State 3 synthesis (mirror + absence), with the §6 honesty branch ─
// A pure text call (NO web_search tool → cannot search, never touches the cap)
// that reads the already-retrieved Call-1 results and composes:
//   • MIRROR   (State 2): who AI currently thinks the subject is; where the
//     answer is stale/wrong or collides with another entity, said plainly (§ State 2).
//   • ABSENCE  (State 3): the buyer-intent query verbatim + what came back.
//
// The honesty branch (§6, the failure mode most likely to be written wrong):
// if the subject DOES appear in the buyer-intent results, the copy must pivot to
// WHERE and HOW they're described — it must NOT manufacture an absence. We anchor
// that decision in code, not model whim: extractHost()/appearanceSignal() detect
// the subject's own domain / name in the buyer-intent results. A domain match is
// proof of appearance; if the model still returns an absence there, we override
// it (never surface a false absence). The model writes the prose for the branch
// the evidence supports.

interface Synthesis {
  mirror: { verdict: string; body: string };
  absence: { appeared: boolean; query: string; recommended: string[]; body: string };
  usage: { input_tokens: number; output_tokens: number };
}

function extractHost(url: string): string {
  if (!url) return '';
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

interface WebResult {
  title?: string;
  url?: string;
}

// Flatten the buyer-intent search's result blocks into {title,url} for matching.
function buyerIntentResults(call1Results: RawSearch[]): WebResult[] {
  const buyer = call1Results.find((r) => r.kind === 'buyer_intent');
  if (!buyer) return [];
  const out: WebResult[] = [];
  for (const block of buyer.results) {
    if (block && typeof block === 'object') {
      const b = block as { title?: unknown; url?: unknown };
      out.push({
        title: typeof b.title === 'string' ? b.title : undefined,
        url: typeof b.url === 'string' ? b.url : undefined,
      });
    }
  }
  return out;
}

// Code-anchored appearance detection over the buyer-intent results.
// domainMatch (subject's own host in a result URL) is high-confidence proof of
// appearance; nameMatch (subject name in a title/url) is a softer signal.
function appearanceSignal(
  results: WebResult[],
  subjectName: string,
  subjectHost: string,
): { domainMatch: boolean; nameMatch: boolean } {
  const nameNorm = subjectName.trim().toLowerCase();
  let domainMatch = false;
  let nameMatch = false;
  for (const r of results) {
    const host = extractHost(r.url ?? '');
    if (subjectHost && host && (host === subjectHost || host.endsWith(`.${subjectHost}`))) {
      domainMatch = true;
    }
    const hay = `${r.title ?? ''} ${r.url ?? ''}`.toLowerCase();
    if (nameNorm.length >= 3 && hay.includes(nameNorm)) {
      nameMatch = true;
    }
  }
  return { domainMatch, nameMatch };
}

// Compact, plaintext digest of the retrieved results for the synthesis prompt.
function resultsDigest(call1Results: RawSearch[]): string {
  return call1Results
    .map((r) => {
      const items = (r.results as Array<{ title?: unknown; url?: unknown; page_age?: unknown }>)
        .map((b, i) => {
          const title = typeof b?.title === 'string' ? b.title : '(no title)';
          const u = typeof b?.url === 'string' ? b.url : '';
          const age = typeof b?.page_age === 'string' ? ` [${b.page_age}]` : '';
          return `    ${i + 1}. ${title} — ${u}${age}`;
        })
        .join('\n');
      const obs = r.summary ? `\n  reading: ${r.summary}` : '';
      return `[${r.kind}] query: ${r.query}${obs}\n  results:\n${items || '    (none)'}`;
    })
    .join('\n\n');
}

const SYNTHESIS_MAX_TOKENS = 1200;

async function synthesizeCall1(
  subject: { name: string; url: string },
  buyerQuery: string,
  call1Results: RawSearch[],
): Promise<Synthesis> {
  const subjectHost = extractHost(subject.url);
  const signal = appearanceSignal(buyerIntentResults(call1Results), subject.name, subjectHost);
  // Bias against a false absence: any code signal of appearance flips the default.
  const codeSuggestsAppeared = signal.domainMatch || signal.nameMatch;

  const key = process.env[ANTHROPIC_KEY_ENV];

  // STUB: no key → deterministic copy derived from the code signal, so both
  // branches are exercisable without a live key. (The stub search injects no
  // subject match, so the keyless path demonstrates the ABSENCE branch; the
  // APPEARS branch is proven with a live key + a subject known to rank.)
  if (!key) {
    if (codeSuggestsAppeared) {
      return {
        mirror: {
          verdict: 'stub',
          body: `[stub] Mirror for ${subject.name}. Run with a live key for the real reading.`,
        },
        absence: {
          appeared: true,
          query: buyerQuery,
          recommended: [],
          body: `[stub] ${subject.name} appears in "${buyerQuery}". The live copy pivots to where and how they're described.`,
        },
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }
    return {
      mirror: {
        verdict: 'stub',
        body: `[stub] Mirror for ${subject.name}. Run with a live key for the real reading.`,
      },
      absence: {
        appeared: false,
        query: buyerQuery,
        recommended: [],
        body: `[stub] For "${buyerQuery}", ${subject.name} did not appear in the stub results.`,
      },
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const digest = resultsDigest(call1Results);
  const codeNote = signal.domainMatch
    ? `A code check found ${subject.name}'s OWN domain (${subjectHost}) among the buyer-intent results — they DO appear. Do not write an absence.`
    : signal.nameMatch
      ? `A code check found ${subject.name}'s name among the buyer-intent results — they likely appear. Look closely before writing any absence.`
      : `A code check did NOT find ${subject.name} in the buyer-intent results. If the actual results below still show them in any form, trust the results, not this note.`;

  const prompt = [
    `You are analyzing live web-search results to tell ${subject.name}${subject.url ? ` (${subject.url})` : ''} what AI currently says about them. Use ONLY the results below — never invent competitors, rankings, or descriptions.`,
    ``,
    `SEARCH RESULTS:`,
    digest,
    ``,
    `CODE SIGNAL: ${codeNote}`,
    ``,
    `Write two things, honestly (this is a diagnostic — never manufacture a problem):`,
    `1) MIRROR: In plain language, who does AI currently think ${subject.name} is, based on the identity and comparative results? Where the answer is stale, wrong, or collides with a DIFFERENT organization sharing the name, say so directly — no hedging. If it's actually accurate, say that.`,
    `2) ABSENCE: For the buyer-intent query "${buyerQuery}", report what actually came back. If ${subject.name} is NOT among the results, name who is recommended instead and state plainly that they're not on the list. If ${subject.name} IS present in any form, set appeared=true and pivot to WHERE they rank and HOW they're described — do NOT claim an absence. Only claim absence when they are genuinely missing.`,
    ``,
    `Respond with ONLY a JSON object, no prose around it:`,
    `{"mirror":{"verdict":"<=10 word summary","body":"2-4 sentences"},"absence":{"appeared":true|false,"recommended":["names actually returned"],"body":"2-4 sentences"}}`,
  ].join('\n');

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    // NO tools → this call physically cannot issue a web search.
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: SYNTHESIS_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    // Same capacity/error discipline as searchWeb; no retry needed on synthesis
    // (no search billed), but capacity still routes to "at capacity".
    let errType = '';
    let errMsg = '';
    try {
      const j = (await res.json()) as { error?: { type?: string; message?: string } };
      errType = j.error?.type ?? '';
      errMsg = j.error?.message ?? '';
    } catch {
      /* non-JSON */
    }
    if (classifyFailure(res.status, errType, errMsg) === 'capacity') {
      throw new CapacityError(`anthropic capacity ${res.status}`);
    }
    throw new Error(`anthropic ${res.status}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  let text = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text;
  }

  // Defensive parse — a public page must never show malformed model output.
  let parsed: {
    mirror?: { verdict?: unknown; body?: unknown };
    absence?: { appeared?: unknown; recommended?: unknown; body?: unknown };
  } = {};
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    /* fall through to safe fallback below */
  }

  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };

  const mirrorVerdict = typeof parsed.mirror?.verdict === 'string' ? parsed.mirror.verdict : '';
  const mirrorBody =
    typeof parsed.mirror?.body === 'string' && parsed.mirror.body.trim()
      ? parsed.mirror.body.trim()
      : `Here's what AI currently surfaces about ${subject.name}.`;

  let appeared = parsed.absence?.appeared === true;
  // Honesty override: a domain match is proof of appearance. Never let a model
  // false-absence reach the page — if the evidence says they appear, they appear.
  if (signal.domainMatch && !appeared) {
    appeared = true;
  }
  const recommended = Array.isArray(parsed.absence?.recommended)
    ? (parsed.absence!.recommended as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  let absenceBody =
    typeof parsed.absence?.body === 'string' && parsed.absence.body.trim() ? parsed.absence.body.trim() : '';
  if (!absenceBody || (signal.domainMatch && parsed.absence?.appeared !== true)) {
    // Safe, non-manufacturing fallback when copy is missing or the model tried to
    // claim an absence the evidence contradicts.
    absenceBody = appeared
      ? `For "${buyerQuery}", ${subject.name} does appear in the results — the full report covers where they rank and how they're described.`
      : `For "${buyerQuery}", here's who the results surface.`;
  }

  return {
    mirror: { verdict: mirrorVerdict, body: mirrorBody },
    absence: { appeared, query: buyerQuery, recommended, body: absenceBody },
    usage,
  };
}

// ── route ────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const name = clean(body.name, CAP_NAME);
  const url = clean(body.url, 300);
  const category = typeof body.category === 'string' ? body.category : 'other';
  const what = clean(body.what, CAP_WHAT);
  const who = clean(body.who, CAP_WHO);

  if (!name) {
    return new Response(JSON.stringify({ ok: false, error: 'A business or brand name is required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Session token keys Call-1 results for the gated Call 2. Accept a client token
  // or mint one; echo it back on the stream so the gate/Call 2 can reference it.
  const sessionToken =
    typeof body.session_token === 'string' && body.session_token.length >= 8
      ? body.session_token
      : crypto.randomUUID();

  // §7 gate inputs — resolved before the stream so guards run before any spend.
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  const ip = clientIp(request);
  const ipHash = hashIp(ip);

  const queries = buildQueries(name, category, what, who);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        // ── Pre-run gate (§7), BEFORE any search spends money ────────────────
        // 1. Turnstile (§7.2) — fail-closed in prod (secret set), fail-open only
        //    in dev when no secret is configured.
        const ts = await verifyTurnstile(turnstileToken, ip);
        if (!ts.ok) {
          send({ type: 'error', message: 'Verification failed. Please try again.' });
          controller.close();
          return;
        }
        // 2. One free run per IP per 24h (§7.3). Not a dead-end error — someone
        //    who came back is interested; point them at the full framework.
        if ((await ipRunInLast24h(ipHash)) === true) {
          send({
            type: 'rate_limited',
            scope: 'ip',
            message: "You've already run your check today — so here's what you earned: 50% off your first month of the full framework.",
            cta: 'community',
          });
          controller.close();
          return;
        }
        // 3. Monthly session ceiling (§7.5) — SAME at_capacity state as the
        //    workspace spend cap. One handler, two triggers.
        const monthly = await countSessionsThisMonth();
        if (monthly !== null && monthly >= MONTHLY_CEILING) {
          send({ type: 'at_capacity' });
          controller.close();
          return;
        }
        // Record the run now so the IP window holds even for concurrent runs.
        await reserveSession(sessionToken, ipHash);

        send({ type: 'session', session_token: sessionToken });

        const call1Results: RawSearch[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        let searchesRun = 0;

        for (const q of queries) {
          // Hard cap, third layer: refuse to exceed MAX_SEARCHES even if the
          // queries array were somehow longer. Belt and suspenders.
          if (searchesRun >= MAX_SEARCHES) break;

          send({ type: 'search_started', step: q.step, kind: q.kind });
          const { results, summary, usage, stubbed } = await searchWeb(q.text);
          searchesRun += 1;
          inputTokens += usage.input_tokens;
          outputTokens += usage.output_tokens;
          call1Results.push({
            step: q.step,
            kind: q.kind,
            query: q.text,
            provisional: q.provisional,
            results,
            summary,
            usage,
            stubbed,
          });
          send({ type: 'search_complete', step: q.step, kind: q.kind, count: results.length });
        }

        // ── State 2 + State 3: synthesize the mirror and the absence ──────────
        // A pure text call over the already-retrieved results. It declares NO
        // web_search tool, so it cannot search and NEVER touches the 3-search cap.
        const synthesis = await synthesizeCall1(
          { name, url },
          buyerIntentQuery(category, what, who),
          call1Results,
        );
        inputTokens += synthesis.usage.input_tokens;
        outputTokens += synthesis.usage.output_tokens;

        // MIRROR (State 2) — who AI thinks they are, stale/wrong/collision said plainly.
        send({ type: 'mirror', verdict: synthesis.mirror.verdict, body: synthesis.mirror.body });
        // ABSENCE (State 3) — §6 honesty branch already resolved inside synthesis.
        send({
          type: 'absence',
          appeared: synthesis.absence.appeared,
          query: synthesis.absence.query,
          recommended: synthesis.absence.recommended,
          body: synthesis.absence.body,
        });

        const persisted = await persistCall1({
          sessionToken,
          name,
          url,
          category,
          queries,
          call1Results,
          inputTokens,
          outputTokens,
          mirrorVerdict: synthesis.mirror.verdict,
          appearedInBuyerQuery: synthesis.absence.appeared,
          ipHash,
        });

        send({
          type: 'call1_complete',
          searches: searchesRun,
          persisted,
          session_token: sessionToken,
        });
        controller.close();
      } catch (err) {
        // Shared "at capacity" handler — two triggers: the Anthropic Workspace
        // $300 cap (here) and, later, the monthly session ceiling (§7.5). Both
        // send the same event so the client shows one "book a call" state.
        if (err instanceof CapacityError) {
          send({ type: 'at_capacity' });
        } else {
          send({ type: 'error', message: 'The visibility check could not complete.' });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
