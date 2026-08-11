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
  envTrim,
  estCostUsd,
  callClaudeText,
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
const CAP_LOCATION = 60;

// ── §7.4 hard cap: never more than 3 searches per run, enforced in code ──────
const MAX_SEARCHES = 3;

// Dynamic-filtering web search (available on Sonnet 5). Basic variant is
// web_search_20250305 if a fallback is ever needed. Search-path-specific → local.
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209';

// ── buyer-intent query ───────────────────────────────────────────────────────
// NO injected category nouns (fix A). Two shapes, now selected by the visitor's
// SERVICE AREA (not inferred from business type — service area isn't derivable
// from what someone does; a coach can be local, a chiropractor telehealth):
//   online / anywhere      → "best [what] for [who]"
//   city / region / country → "best [what] in [location]"
// Only visitor-supplied free text ([what]/[who]/[location]) ever enters the query,
// so a pill label can never be inserted. All fields optional — dangling connectors
// are trimmed ("both blank" → "best [what]").
type ServiceArea = 'online' | 'city' | 'region' | 'country';
function usesLocation(area: string): area is 'city' | 'region' | 'country' {
  return area === 'city' || area === 'region' || area === 'country';
}
function buyerIntentQuery(what: string, who: string, serviceArea: string, location: string): string {
  if (usesLocation(serviceArea) && location) return `best ${what} in ${location}`;
  if (who) return `best ${what} for ${who}`;
  return `best ${what}`;
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

function buildQueries(name: string, what: string, who: string, serviceArea: string, location: string): DemoQuery[] {
  const queries: DemoQuery[] = [
    // §4 identity template — confirmed.
    { step: 1, kind: 'identity', text: `What is ${name}?` },
    // Buyer-intent — noun-free, service-area-shaped. "The moment" (§1).
    { step: 2, kind: 'buyer_intent', text: buyerIntentQuery(what, who, serviceArea, location) },
    // Fix B1: the comparative query is CUT. It was ~30k tokens (a third of the run)
    // and only added fidelity to one Clarity criterion; the spike found the punch
    // lands in these two. The identity search's own results already span independent
    // sources, so Clarity still scores from search 1 (see the score route).
  ];
  // Hard cap layer 1: the loop can never see more than MAX_SEARCHES queries. The
  // cap stays 3 as HEADROOM (fix B1 — do not lower it); we simply run 2.
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
  const key = envTrim(ANTHROPIC_KEY_ENV);

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
  serviceArea: string;
  queries: DemoQuery[];
  call1Results: RawSearch[];
  inputTokens: number;
  outputTokens: number;
  searches: number;
  mirrorVerdict: string;
  appearedInBuyerQuery: boolean;
  ipHash: string;
}

async function persistCall1(p: PersistInput): Promise<boolean> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
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
      service_area: p.serviceArea || null,
      queries_run: p.queries,
      call1_results: p.call1Results,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      // fix B3 — Call-1 spend so far (searches + synthesis). Call 2 adds to this.
      est_cost_usd: estCostUsd(p.inputTokens, p.outputTokens, p.searches),
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

// Each reveal section is now a three-layer read (items 3+4): a one-line verdict,
// up to 3 scannable bullets, and a collapsed `detail` for anyone who wants the
// full prose. Copy density restructure — the page stops being a wall of text.
interface RevealSection {
  verdict: string; // one line, <=15 words
  bullets: string[]; // up to 3 short factual points
  detail: string; // 2-3 sentences, collapsed in the UI
}

interface Synthesis {
  // `accurate` (fix C1) is a CODE signal, not model output: whether AI's identity
  // results point at the subject's own domain/name. Drives the ✅/⚠️ on State 2.
  // `collision` (model-owned, guarded) is the OTHER amber trigger: a distinct
  // named organization sharing the name. It's the one section-verdict field the
  // model owns — allowed only because flagging a collision makes the finding
  // WORSE (the model has no incentive to invent one), and code still guards it:
  // collision=true requires a NAMED entity in the prose or we force it false.
  // `appeared` stays PURELY code-anchored (never model-returned) — the model has
  // an incentive to get that one wrong, so collision's exception is NOT a
  // precedent for it.
  mirror: RevealSection & { accurate: boolean; collision: boolean };
  absence: RevealSection & { appeared: boolean; query: string; recommended: string[] };
  // "The opportunity" (item 4) — one honest paragraph teasing the SHAPE of the
  // gap the full report would close, branched on whether they already appear.
  opportunity: string;
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

// Flatten a given search's result blocks into {title,url} for matching.
function resultsOfKind(call1Results: RawSearch[], kind: QueryKind): WebResult[] {
  const r = call1Results.find((x) => x.kind === kind);
  if (!r) return [];
  const out: WebResult[] = [];
  for (const block of r.results) {
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

// Three sections × (verdict + up to 3 bullets + detail) + an opportunity
// paragraph fit comfortably here; bumped from 1200 for the extra structure.
const SYNTHESIS_MAX_TOKENS = 1600;

// Structured-outputs schema — forces schema-valid JSON so a public page can
// never render malformed model output. NOTE what is deliberately ABSENT:
//   • no `appeared` field — appearance is code-anchored (appearanceSignal), never
//     model-returned. The model has an incentive to misreport it; we don't ask.
//   • `collision` + `collision_entity` ARE model-owned, but guarded in code: a
//     true collision must name the distinct entity or it's forced back to false.
const SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mirror', 'absence', 'opportunity', 'opportunity_anchor'],
  properties: {
    mirror: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'bullets', 'detail', 'collision', 'collision_entity'],
      properties: {
        verdict: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
        detail: { type: 'string' },
        collision: { type: 'boolean' },
        collision_entity: { type: 'string' },
      },
    },
    absence: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'bullets', 'detail', 'recommended'],
      properties: {
        verdict: { type: 'string' },
        bullets: { type: 'array', items: { type: 'string' } },
        detail: { type: 'string' },
        recommended: { type: 'array', items: { type: 'string' } },
      },
    },
    opportunity: { type: 'string' },
    // Specificity guard (same pattern as collision_entity): which concrete
    // finding from THIS run the opportunity is built on — the collision entity,
    // a named competitor from recommended, the rank position, or the query. Code
    // asserts it non-empty; an unanchored opportunity is generic filler and is
    // replaced with a deterministic, finding-referencing fallback.
    opportunity_anchor: { type: 'string' },
  },
} as const;

// Coerce a schema section into a RevealSection. Even with structured outputs we
// stay defensive (empty verdict/detail get a safe, non-manufacturing fallback)
// and cap bullets at 3 in code so a chatty model can't blow the density budget.
function toRevealSection(raw: unknown, fallbackVerdict: string, fallbackDetail: string): RevealSection {
  const r = (raw && typeof raw === 'object' ? raw : {}) as {
    verdict?: unknown;
    bullets?: unknown;
    detail?: unknown;
  };
  const verdict = typeof r.verdict === 'string' && r.verdict.trim() ? r.verdict.trim() : fallbackVerdict;
  const bullets = Array.isArray(r.bullets)
    ? (r.bullets as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 3)
    : [];
  const detail = typeof r.detail === 'string' && r.detail.trim() ? r.detail.trim() : fallbackDetail;
  return { verdict, bullets, detail };
}

async function synthesizeCall1(
  subject: { name: string; url: string },
  buyerQuery: string,
  call1Results: RawSearch[],
): Promise<Synthesis> {
  const subjectHost = extractHost(subject.url);
  const signal = appearanceSignal(resultsOfKind(call1Results, 'buyer_intent'), subject.name, subjectHost);
  // APPEARANCE IS CODE-ANCHORED. `appeared` is decided here, from the results —
  // never from the model. A domain match or a name match in the buyer-intent
  // results is the whole signal; the model never gets to claim or deny it.
  const appeared = signal.domainMatch || signal.nameMatch;

  // fix C1: mirror accuracy from the IDENTITY results — if AI's "what is X?" points
  // at the subject's own domain/name, it identifies them correctly (✅); otherwise
  // it's stale/colliding/wrong (⚠️). Code-anchored, no model output.
  const idSignal = appearanceSignal(resultsOfKind(call1Results, 'identity'), subject.name, subjectHost);
  const accurate = idSignal.domainMatch || idSignal.nameMatch;

  const key = envTrim(ANTHROPIC_KEY_ENV);

  // STUB: no key → deterministic copy in the new shape, so both branches are
  // exercisable without a live key. (The stub search injects no subject match, so
  // the keyless path demonstrates the ABSENCE branch; the APPEARS branch is proven
  // with a live key + a subject known to rank.)
  if (!key) {
    return {
      mirror: {
        verdict: `[stub] What AI says about ${subject.name}.`,
        bullets: ['[stub] point one', '[stub] point two'],
        detail: `[stub] Run with a live key for the real reading of ${subject.name}.`,
        accurate,
        collision: false,
      },
      absence: appeared
        ? {
            verdict: `[stub] ${subject.name} appears for "${buyerQuery}".`,
            bullets: ['[stub] the live copy pivots to where and how they rank'],
            detail: `[stub] appears — the full report covers rank and description.`,
            appeared: true,
            query: buyerQuery,
            recommended: [],
          }
        : {
            verdict: `[stub] ${subject.name} is missing for "${buyerQuery}".`,
            bullets: ['[stub] the live copy names who the buyer finds instead'],
            detail: `[stub] For "${buyerQuery}", ${subject.name} did not appear in the stub results.`,
            appeared: false,
            query: buyerQuery,
            recommended: [],
          },
      opportunity: appeared
        ? `[stub] The full report would score how strongly and accurately ${subject.name} shows up. Run with a live key.`
        : `[stub] The full report would show what's missing so ${subject.name} becomes findable. Run with a live key.`,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  const digest = resultsDigest(call1Results);
  const codeNote = signal.domainMatch
    ? `A code check found ${subject.name}'s OWN domain (${subjectHost}) among the buyer-intent results — they DO appear.`
    : signal.nameMatch
      ? `A code check found ${subject.name}'s name among the buyer-intent results — they appear.`
      : `A code check did NOT find ${subject.name} in the buyer-intent results — treat them as not appearing for that query.`;

  // Opportunity branch is chosen in CODE from the code-anchored `appeared`, then
  // the model writes the prose for that branch only. Tease the SHAPE of the gap,
  // never the specific fixes; no hype, no urgency, no deadlines.
  const opportunityGuidance = appeared
    ? `${subject.name} already appears for the buyer-intent search, so the opportunity is about how STRONGLY and ACCURATELY they're positioned — not whether they show up. Tease that the full report scores the strength and accuracy of that presence and where it can be sharpened. Describe the shape of the gap, not the fixes.`
    : `${subject.name} does NOT appear for the buyer-intent search, so the opportunity is about becoming FINDABLE. Tease that the full report shows what's missing between them and the buyer without listing the specific fixes. Describe the shape of the gap, not the fixes.`;

  const prompt = [
    `You are analyzing live web-search results to tell ${subject.name}${subject.url ? ` (${subject.url})` : ''} what AI currently says about them. Use ONLY the results below — never invent competitors, rankings, descriptions, or organizations.`,
    ``,
    `SEARCH RESULTS:`,
    digest,
    ``,
    `CODE SIGNAL: ${codeNote}`,
    ``,
    `Produce three parts, honestly (this is a diagnostic — never manufacture a problem). Each section is a scannable three-layer read: a one-line verdict, up to 3 short bullets, and a short detail paragraph.`,
    ``,
    `1) MIRROR — who AI currently thinks ${subject.name} is, from the identity/comparative results.`,
    `   • verdict: one line, at most 15 words, plain language.`,
    `   • bullets: up to 3 short factual points about what AI associates them with (drawn only from the results).`,
    `   • detail: 2-3 sentences of nuance. Where AI's answer is stale or wrong, say so directly.`,
    `   • collision: set true ONLY if a DISTINCT, DIFFERENT organization that shares the name appears in the identity results and could be mistaken for ${subject.name}. If true, you MUST name that other organization in collision_entity (e.g. "Harris & Co Accounting, Leeds"). A vague "there may be similar businesses" is NOT a collision — set collision false and leave collision_entity empty. Never invent an entity to fill this field.`,
    ``,
    `2) ABSENCE — for the buyer-intent query "${buyerQuery}", what actually came back.`,
    `   • verdict: one line, at most 15 words.`,
    `   • bullets: up to 3 short points on who or what the results surface.`,
    `   • detail: 2-3 sentences.`,
    `   • recommended: the names actually returned by that query (who a buyer would find). Empty array if none.`,
    `   Do NOT state whether ${subject.name} appeared — that is decided separately in code. Just report what the results contain.`,
    ``,
    `3) OPPORTUNITY — one short paragraph. ${opportunityGuidance}`,
    `   • opportunity_anchor: name the ONE concrete finding from THIS run that the paragraph is built on — the colliding entity, a specific competitor from the buyer-intent results, the rank position, or the query "${buyerQuery}" itself. It must be something that actually appeared in the results above. A generic "improvements are available" is NOT anchored — if you cannot tie it to a concrete finding, leave opportunity_anchor empty.`,
  ].join('\n');

  const { text, usage } = await callClaudeText(prompt, SYNTHESIS_MAX_TOKENS, {
    format: { type: 'json_schema', schema: SYNTHESIS_SCHEMA },
  });

  // Structured outputs guarantee schema-valid JSON, but we still parse defensively
  // (balanced-brace slice) so a public page never shows a raw model string.
  let parsed: {
    mirror?: { verdict?: unknown; bullets?: unknown; detail?: unknown; collision?: unknown; collision_entity?: unknown };
    absence?: { verdict?: unknown; bullets?: unknown; detail?: unknown; recommended?: unknown };
    opportunity?: unknown;
    opportunity_anchor?: unknown;
  } = {};
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    /* fall through to safe fallbacks below */
  }

  const mirrorSection = toRevealSection(
    parsed.mirror,
    `Here's what AI currently surfaces about ${subject.name}.`,
    `Here's the current reading of how AI describes ${subject.name}.`,
  );

  // COLLISION GUARD (code): a collision is only real if the model NAMED the
  // distinct entity. collision=true with an empty/blank collision_entity is
  // treated as false — the model doesn't get to manufacture a problem it can't
  // name. This exception is scoped to collision ONLY; it is NOT a precedent for
  // `appeared`, which stays purely code-anchored above.
  const collisionEntity =
    typeof parsed.mirror?.collision_entity === 'string' ? parsed.mirror.collision_entity.trim() : '';
  const collision = parsed.mirror?.collision === true && collisionEntity.length > 0;

  const absenceSection = toRevealSection(
    parsed.absence,
    appeared
      ? `For "${buyerQuery}", ${subject.name} appears in the results.`
      : `For "${buyerQuery}", here's who the results surface.`,
    appeared
      ? `For "${buyerQuery}", ${subject.name} does appear — the full report covers where they rank and how they're described.`
      : `For "${buyerQuery}", here's who the results surface instead.`,
  );
  const recommended = Array.isArray(parsed.absence?.recommended)
    ? (parsed.absence!.recommended as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  // OPPORTUNITY SPECIFICITY GUARD (code): the model's paragraph is only used if it
  // named the concrete finding it's built on (opportunity_anchor non-empty). An
  // unanchored paragraph is generic filler ("improvements are available") and is
  // replaced with a deterministic fallback that references THIS run's query — so
  // the opportunity can never be manipulative-vague. Same pattern as the collision
  // named-entity guard; not a precedent for `appeared`.
  const opportunityAnchor =
    typeof parsed.opportunity_anchor === 'string' ? parsed.opportunity_anchor.trim() : '';
  const modelOpportunity = typeof parsed.opportunity === 'string' ? parsed.opportunity.trim() : '';
  const opportunity =
    modelOpportunity && opportunityAnchor.length > 0
      ? modelOpportunity
      : appeared
        ? `The full report scores how strongly and accurately ${subject.name} shows up for "${buyerQuery}", and where that presence can be sharpened.`
        : `For "${buyerQuery}", the full report shows what's missing between ${subject.name} and the buyers searching — the gap to close to become findable.`;

  return {
    mirror: { ...mirrorSection, accurate, collision },
    absence: { ...absenceSection, appeared, query: buyerQuery, recommended },
    opportunity,
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
  // Service area drives the query shape (online → "for [who]", else "in [location]").
  const serviceArea = typeof body.serviceArea === 'string' ? body.serviceArea : '';
  const location = clean(body.location, CAP_LOCATION);

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

  const queries = buildQueries(name, what, who, serviceArea, location);

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
          buyerIntentQuery(what, who, serviceArea, location),
          call1Results,
        );
        inputTokens += synthesis.usage.input_tokens;
        outputTokens += synthesis.usage.output_tokens;

        // MIRROR (State 2) — verdict + bullets + collapsed detail. `accurate` and
        // `collision` are the two amber triggers the UI reads for the ✅/⚠️ icon.
        send({
          type: 'mirror',
          verdict: synthesis.mirror.verdict,
          bullets: synthesis.mirror.bullets,
          detail: synthesis.mirror.detail,
          accurate: synthesis.mirror.accurate,
          collision: synthesis.mirror.collision,
        });
        // ABSENCE (State 3) — `appeared` is code-anchored inside synthesis.
        send({
          type: 'absence',
          verdict: synthesis.absence.verdict,
          bullets: synthesis.absence.bullets,
          detail: synthesis.absence.detail,
          appeared: synthesis.absence.appeared,
          query: synthesis.absence.query,
          recommended: synthesis.absence.recommended,
        });
        // OPPORTUNITY (item 4) — teases the shape of the gap the full report closes.
        send({ type: 'opportunity', text: synthesis.opportunity });

        const persisted = await persistCall1({
          sessionToken,
          name,
          url,
          category,
          serviceArea,
          queries,
          call1Results,
          inputTokens,
          outputTokens,
          searches: searchesRun,
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
