import type { NextRequest } from 'next/server';

// AI Visibility Demo — Call 1 (free), STUBBED so it compiles/runs without the
// live ANTHROPIC_API_KEY or Supabase creds. Scope of THIS piece (per build plan):
//   1. Query construction from the 5 inputs + §4 category template.
//   2. The 3-search loop, with the hard cap enforced IN CODE (a for-loop over a
//      fixed queries array + max_uses:1 per call) — NOT tool_choice, NOT a prompt
//      instruction. The model physically cannot search a 4th time.
//   3. Persistence of raw results to demo_sessions.call1_results.
//   4. Real SSE scaffolding — one event per search as it returns.
//
// EXPLICITLY NOT in this piece: mirror/absence copy generation, the email gate,
// Turnstile verification, Call 2 (scoring). Those land as later pieces.
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

// Anthropic Messages API (raw fetch — no SDK installed; matches the dependency-
// free approach used by /api/subscribe).
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
// Dynamic-filtering web search (available on Sonnet 5). Basic variant is
// web_search_20250305 if a fallback is ever needed.
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
  usage: { input_tokens: number; output_tokens: number };
  stubbed: boolean;
}

interface AnthropicContentBlock {
  type: string;
  content?: unknown[];
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function searchWeb(query: string): Promise<{ results: unknown[]; usage: { input_tokens: number; output_tokens: number }; stubbed: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY;

  // STUB: no key → deterministic mock shaped like real web_search_result blocks,
  // so query construction, persistence, and SSE all run end-to-end keyless.
  if (!key) {
    return {
      results: [
        { type: 'web_search_result', title: `[stub] result for: ${query}`, url: 'https://example.com/', page_age: null },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
      stubbed: true,
    };
  }

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      // Hard cap layer 2: THIS call may perform at most one web search. Combined
      // with the ≤3-iteration loop, total searches can never exceed 3 — and the
      // model has no way to opt into more (not via tool_choice, not via prompt).
      tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: `Run a single web search for: ${query}` }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const results: unknown[] = [];
  for (const block of data.content ?? []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      results.push(...block.content);
    }
  }
  return {
    results,
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
    stubbed: false,
  };
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
      map_generated_at: new Date().toISOString(),
    }),
  });
  return res.ok;
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

  const queries = buildQueries(name, category, what, who);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
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
          const { results, usage, stubbed } = await searchWeb(q.text);
          searchesRun += 1;
          inputTokens += usage.input_tokens;
          outputTokens += usage.output_tokens;
          call1Results.push({
            step: q.step,
            kind: q.kind,
            query: q.text,
            provisional: q.provisional,
            results,
            usage,
            stubbed,
          });
          send({ type: 'search_complete', step: q.step, kind: q.kind, count: results.length });
        }

        const persisted = await persistCall1({
          sessionToken,
          name,
          url,
          category,
          queries,
          call1Results,
          inputTokens,
          outputTokens,
        });

        send({
          type: 'call1_complete',
          searches: searchesRun,
          persisted,
          session_token: sessionToken,
        });
        controller.close();
      } catch {
        send({ type: 'error', message: 'The visibility check could not complete.' });
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
