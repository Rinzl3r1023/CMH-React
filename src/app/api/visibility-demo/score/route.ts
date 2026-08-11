import {
  getSession,
  persistScore,
  callClaudeText,
  estCostUsd,
  CapacityError,
  supabaseConfigured,
  updateKitScoreFields,
  markKitScoreSynced,
  type DemoSessionRow,
} from '@/lib/visibility-demo';

// AI Visibility Demo — Call 2, the GATED SCORE (State 5). Reads the persisted
// call1_results ONLY, declares NO web_search tool (via callClaudeText → cannot
// search, never touches the 3-search cap), and applies the §5 rubric:
//   • Clarity  /25  (5 criteria × 1–5) — from the identity search (fix B1: the
//     comparative query is cut; the identity results already span independent sources)
//   • Presence /25  (5 criteria × 1–5) — from the buyer-intent query
// Total is /50. NEVER /75. Crawlability is NEVER scored or proxied — it is named
// once, as the reason to convert (it needs the site itself, which this never sees).
//
// Honesty (§6 carries): a subject who ranks well gets an accurate HIGH score. The
// rubric can and must return a good number — the prompt is told not to deflate.
//
// Gating: the score is only served for a session that passed the email gate
// (gated_at + email set). Idempotent — if already scored, returns the stored
// numbers without re-spending tokens.
//
// NOT here: any UI. Response is plain JSON (a single payoff, no SSE narration).

export const runtime = 'nodejs';
// Raised 60→120 (matches the run route). A verbose structured-output rubric can
// take ~30–60s to generate; a 60s ceiling risked a timeout that returns non-JSON
// and reads to the client as a generic failure. Headroom removes that class.
export const maxDuration = 120;

// Worst-case audit (10 criteria × {score+note} + 3 fixes + crawlability + JSON
// scaffolding): a verbose run reaches ~2.5k output tokens, so 3000 was thin
// headroom, not real headroom — the same truncation class the synthesis call hit
// one call over. Raised to 4000 with margin; the loud-fail below still catches
// any run that somehow exceeds it (never a silent low score).
const SCORE_MAX_TOKENS = 4000;

// A parse/validation failure is NOT a low score — it's a scoring FAILURE. Never
// fabricate a number: this routes to a loud, honest "book a call" instead.
class ScoringError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ScoringError';
  }
}

// Structured-outputs schema (durability layer) — forces schema-valid JSON so the
// model physically cannot return the malformed/preamble/truncated output that hit
// the fabricating fallback. output_config format: { type: 'json_schema', schema }.
// SCHEMA SUBSET (durability): use ONLY the keywords the synthesis schema uses —
// type / properties / required / additionalProperties / items. The numeric and
// array-length constraints that were here before (minimum/maximum, minItems/
// maxItems) are a prime suspect for the score call's first-run failure: the
// synthesis schema, which omits them, works; this one, which had them, failed.
// Every bound they enforced is ALREADY enforced in code — clampCriterion clamps
// score to 1–5, normalizeCriteria pins exactly 5 criteria, fixes.slice(0,3) caps
// fixes — so dropping the keywords loses no correctness and removes the 400 risk.
const CRITERION_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    note: { type: 'string' },
  },
  required: ['score', 'note'],
  additionalProperties: false,
};
const PILLAR_SCHEMA = {
  type: 'object',
  properties: { criteria: { type: 'array', items: CRITERION_SCHEMA } },
  required: ['criteria'],
  additionalProperties: false,
};
const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    clarity: PILLAR_SCHEMA,
    presence: PILLAR_SCHEMA,
    fixes: { type: 'array', items: { type: 'string' } },
    crawlability_note: { type: 'string' },
  },
  required: ['clarity', 'presence', 'fixes', 'crawlability_note'],
  additionalProperties: false,
};

// Robust extraction backstop (for the non-structured path / stray wrappers):
// strip markdown fences, then take the first balanced {...} object.
function extractJsonObject(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null; // unbalanced → truncated
}

// All five score from SEARCH 1 (identity) only — the comparative query is cut
// (fix B1/B2). The identity search returns multiple independent sources, so
// criterion 5 (consistency) is still assessable without a separate comparative
// query. No criterion references a search that no longer runs.
const CLARITY_CRITERIA = [
  'Own site present in the identity results at all',
  "Own site's rank position among the identity results",
  'Accuracy of the top-ranked description vs. what they entered',
  'Entity collision — count of distinct orgs sharing the name',
  'Consistency of the description across the independent sources in the identity results',
];
const PRESENCE_CRITERIA = [
  'Appear in the buyer-intent results at all',
  'Rank position in the buyer-intent results',
  'Named as a recommendation vs. incidental mention',
  'Source independence — third-party vs. their own property',
  'Category-page saturation — how many slots are aggregator listicles',
];

interface StoredSearch {
  kind?: string;
  query?: string;
  summary?: string;
  results?: unknown[];
}

function scoringDigest(call1Results: unknown): string {
  if (!Array.isArray(call1Results) || call1Results.length === 0) return '(no results retrieved)';
  return (call1Results as StoredSearch[])
    .map((r) => {
      const kind = r?.kind ?? '?';
      const query = r?.query ?? '';
      const reading = r?.summary ? `\n  reading: ${r.summary}` : '';
      const items = Array.isArray(r?.results)
        ? r.results
            .map((b, i) => {
              const block = b as { title?: unknown; url?: unknown; page_age?: unknown };
              const title = typeof block?.title === 'string' ? block.title : '(no title)';
              const u = typeof block?.url === 'string' ? block.url : '';
              const age = typeof block?.page_age === 'string' ? ` [${block.page_age}]` : '';
              return `    ${i + 1}. ${title} — ${u}${age}`;
            })
            .join('\n')
        : '';
      return `[${kind}] query: ${query}${reading}\n  results:\n${items || '    (none)'}`;
    })
    .join('\n\n');
}

function clampCriterion(n: unknown): number {
  const v = typeof n === 'number' ? Math.round(n) : Number(n);
  if (!Number.isFinite(v)) return 2; // unscoreable → conservative (band: 2 = weak)
  return Math.min(5, Math.max(1, v));
}

interface Criterion {
  name: string;
  score: number;
  note: string;
}

// Sum up to 5 criteria (each 1–5), clamp the pillar total to [5, 25].
function pillarTotal(criteria: Criterion[]): number {
  const sum = criteria.slice(0, 5).reduce((acc, c) => acc + c.score, 0);
  return Math.min(25, Math.max(5, sum));
}

function normalizeCriteria(raw: unknown, names: string[]): Criterion[] {
  const arr = Array.isArray(raw) ? raw : [];
  return names.map((name, i) => {
    const c = (arr[i] ?? {}) as { score?: unknown; note?: unknown };
    return {
      name,
      score: clampCriterion(c.score),
      note: typeof c.note === 'string' ? c.note : '',
    };
  });
}

interface ScorePayload {
  score: { clarity: number; presence: number; total: number; outOf: 50 };
  pillars: {
    clarity: { criteria: Criterion[] };
    presence: { criteria: Criterion[] };
  };
  fixes: string[];
  crawlability: string;
}

const CRAWLABILITY_DEFAULT =
  'Whether AI can actually crawl and read your site is the third piece — it needs the site itself, which the free check never looks at. That assessment, and the fixes, are behind the wall.';

function buildScorePrompt(row: DemoSessionRow): string {
  const digest = scoringDigest(row.call1_results);
  const subjectName = row.subject_name ?? 'this business';
  // The fixes are generated from the SAME results as the reveal, so they must not
  // contradict it. The code-anchored appeared signal (never the model's) tells the
  // model whether the subject already shows up in the buyer-intent search.
  const appearedNote =
    row.appeared_in_buyer_query === true
      ? `A code check confirmed ${subjectName} DOES appear in the buyer-intent results. Fixes must NOT claim they are absent from that search, and must NOT tell them to "get listed on" any source that already includes them — frame those as improving RANK or the existing listing, not as achieving an appearance they already have.`
      : `A code check found ${subjectName} did NOT appear in the buyer-intent results. Fixes may address becoming findable there.`;
  return [
    `You are scoring the AI visibility of ${subjectName}${row.subject_url ? ` (${row.subject_url})` : ''} using ONLY the live search results below. Do not invent results, rankings, or competitors.`,
    ``,
    `SEARCH RESULTS (from the free check):`,
    digest,
    ``,
    `Score two pillars, five criteria each, 1–5 per criterion.`,
    `CLARITY (from the identity search results only):`,
    ...CLARITY_CRITERIA.map((c, i) => `  C${i + 1}. ${c}`),
    `PRESENCE (from the buyer-intent query):`,
    ...PRESENCE_CRITERIA.map((c, i) => `  P${i + 1}. ${c}`),
    ``,
    `Band: 5 = strong/ready · 4 = good, could sharpen · 3 = present but too vague · 2 = weak · 1 = missing entirely.`,
    `HONESTY (non-negotiable): score what the results actually show. If they rank well, give the high score — a strong subject should score near 25/25. Do NOT deflate to manufacture a problem. If a criterion cannot be assessed from these results, score it conservatively and say why in its note — never guess.`,
    `Then give the top 3 prioritized fixes, specific to what the results show.`,
    `FIX GROUNDING (non-negotiable): ${appearedNote} Every fix must be consistent with the results above — a fix may NOT assert absence from a source that appears in the results (e.g. do not say "you're missing from Yelp/Zocdoc" if their Yelp or Zocdoc page is in the results). "Ranked behind the listicle" and "absent from the listicle" are different claims; assert only the one the results support.`,
    `Do NOT score or estimate crawlability/indexability — that requires the site itself, which was not fetched. Provide one sentence naming it as what the free check cannot assess.`,
    ``,
    `Respond with ONLY this JSON, no prose around it:`,
    `{"clarity":{"criteria":[{"score":1-5,"note":"..."} x5]},"presence":{"criteria":[{"score":1-5,"note":"..."} x5]},"fixes":["fix 1","fix 2","fix 3"],"crawlability_note":"one sentence"}`,
  ].join('\n');
}

function stubPayload(): ScorePayload {
  const clarity = normalizeCriteria(
    CLARITY_CRITERIA.map(() => ({ score: 3, note: '[stub] run with a live key for the real reading' })),
    CLARITY_CRITERIA,
  );
  const presence = normalizeCriteria(
    PRESENCE_CRITERIA.map(() => ({ score: 2, note: '[stub] run with a live key for the real reading' })),
    PRESENCE_CRITERIA,
  );
  return {
    score: {
      clarity: pillarTotal(clarity),
      presence: pillarTotal(presence),
      total: pillarTotal(clarity) + pillarTotal(presence),
      outOf: 50,
    },
    pillars: { clarity: { criteria: clarity }, presence: { criteria: presence } },
    fixes: ['[stub] fix 1', '[stub] fix 2', '[stub] fix 3'],
    crawlability: CRAWLABILITY_DEFAULT,
  };
}

type Usage = { input_tokens: number; output_tokens: number };

async function scoreSession(row: DemoSessionRow): Promise<{ payload: ScorePayload; usage: Usage }> {
  const { text, usage, stubbed, stopReason, contentTypes } = await callClaudeText(
    buildScorePrompt(row),
    SCORE_MAX_TOKENS,
    { format: { type: 'json_schema', schema: SCORE_SCHEMA } },
  );
  // Dev-only stub (no key). In PRODUCTION (key present) a failure must NEVER stub
  // or fall back — that fabricates a number. It fails loudly below instead.
  if (stubbed) return { payload: stubPayload(), usage };

  // Parse. Structured outputs makes `text` clean schema-valid JSON; the balanced
  // extractor is a backstop for any stray wrapper.
  let parsed: {
    clarity?: { criteria?: unknown };
    presence?: { criteria?: unknown };
    fixes?: unknown;
    crawlability_note?: unknown;
  } | null = null;
  const jsonStr = extractJsonObject(text);
  if (jsonStr) {
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      /* parsed stays null → loud fail below */
    }
  }

  // A wholesale missing / unparseable rubric is a FAILURE, not a low score. Require
  // both pillars to be present as 5-item arrays (structure). A single unassessable
  // criterion WITHIN a valid rubric still scores conservatively via clampCriterion.
  const validPillar = (a: unknown): boolean => Array.isArray(a) && a.length >= 5;
  if (!parsed || !validPillar(parsed.clarity?.criteria) || !validPillar(parsed.presence?.criteria)) {
    // Distinguish the two failure classes — they need different fixes and look
    // identical otherwise: stop_reason=max_tokens ⇒ TRUNCATED (raise the cap);
    // anything else ⇒ MALFORMED (a real bad-output/schema problem). Log stop_reason,
    // content block types, token usage, and the full raw text.
    const failure = stopReason === 'max_tokens' ? 'truncated' : 'malformed';
    console.error(
      `[visibility-demo] Call-2 scoring FAILED (${failure}) session=${row.session_token} ` +
        `stopReason=${JSON.stringify(stopReason)} contentTypes=${JSON.stringify(contentTypes)} ` +
        `outTok=${usage.output_tokens} maxTok=${SCORE_MAX_TOKENS} len=${text.length} raw=${JSON.stringify(text)}`,
    );
    throw new ScoringError(`${failure} rubric`);
  }

  const clarity = normalizeCriteria(parsed.clarity?.criteria, CLARITY_CRITERIA);
  const presence = normalizeCriteria(parsed.presence?.criteria, PRESENCE_CRITERIA);

  // Invariant tripwire (the cheap check that would have caught this bug): the
  // code-anchored appeared signal and the rubric must not contradict. If the code
  // proved they appear, "Appear in the buyer-intent results at all" cannot score
  // ≤2 — a contradiction means the rubric is untrustworthy → fail loudly.
  if (row.appeared_in_buyer_query === true && presence[0].score <= 2) {
    console.error(
      `[visibility-demo] Call-2 INVARIANT violated (appeared=true, presence#1=${presence[0].score}) session=${row.session_token} raw=${text.slice(0, 2000)}`,
    );
    throw new ScoringError('rubric contradicts code-anchored appeared signal');
  }

  const fixes = Array.isArray(parsed.fixes)
    ? (parsed.fixes as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 3)
    : [];
  const crawlability =
    typeof parsed.crawlability_note === 'string' && parsed.crawlability_note.trim()
      ? parsed.crawlability_note.trim()
      : CRAWLABILITY_DEFAULT;

  const cTotal = pillarTotal(clarity);
  const pTotal = pillarTotal(presence);
  return {
    payload: {
      score: { clarity: cTotal, presence: pTotal, total: cTotal + pTotal, outOf: 50 },
      pillars: { clarity: { criteria: clarity }, presence: { criteria: presence } },
      fixes,
      crawlability,
    },
    usage,
  };
}

export async function POST(request: Request) {
  let sessionToken = '';
  try {
    const body = (await request.json()) as { session_token?: unknown };
    sessionToken = typeof body.session_token === 'string' ? body.session_token : '';
  } catch {
    return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  if (sessionToken.length < 8) {
    return Response.json({ ok: false, error: 'Missing or invalid session.' }, { status: 400 });
  }

  // Dev path: no Supabase → no persisted call1_results to read. Return the stub
  // score so the payoff shape is exercisable keyless.
  if (!supabaseConfigured()) {
    return Response.json({ ok: true, dev_stub: true, ...stubPayload() });
  }

  const row = await getSession(sessionToken);
  if (!row) {
    return Response.json({ ok: false, error: 'Session not found. Please re-run the check.' }, { status: 404 });
  }
  // The score is gated: it is only served after the email gate opened.
  if (!row.gated_at || !row.email) {
    return Response.json({ ok: false, error: 'Unlock required.' }, { status: 403 });
  }

  // Idempotent — already scored → return the STORED full payoff, no re-spend. The
  // score is the paid payoff, so replay returns the complete breakdown + fixes,
  // not bare numbers. (Fallback to numbers only for rows scored before the payoff
  // column existed.)
  if (row.score_clarity != null && row.score_presence != null) {
    if (row.payoff && typeof row.payoff === 'object') {
      return Response.json({ ok: true, cached: true, ...(row.payoff as Record<string, unknown>) });
    }
    return Response.json({
      ok: true,
      cached: true,
      score: {
        clarity: row.score_clarity,
        presence: row.score_presence,
        total: row.score_clarity + row.score_presence,
        outOf: 50,
      },
      crawlability: CRAWLABILITY_DEFAULT,
    });
  }

  try {
    const { payload, usage } = await scoreSession(row);
    // fix B3 — accumulate Call-2 spend onto the Call-1 totals so est_cost_usd
    // covers every call in the session. Call 2 issues no searches.
    const totalIn = Number(row.input_tokens ?? 0) + usage.input_tokens;
    const totalOut = Number(row.output_tokens ?? 0) + usage.output_tokens;
    const totalEst =
      Math.round((Number(row.est_cost_usd ?? 0) + estCostUsd(usage.input_tokens, usage.output_tokens, 0)) * 10_000) /
      10_000;
    await persistScore(sessionToken, payload.score.clarity, payload.score.presence, payload, {
      inputTokens: totalIn,
      outputTokens: totalOut,
      estCostUsd: totalEst,
    });

    // WRITE 2 (Kit score fields) — best-effort. This runs ONLY on a FRESH score:
    // the idempotent cached-replay path returned above, and any scoring failure
    // throws to the catch below BEFORE this line, so a fabricated/absent number can
    // never reach Kit. If write 1 never captured a subscriber_id, log and leave
    // kit_score_synced_at null for the backfill queue — NO lookup-by-email fallback.
    if (row.subscriber_id) {
      const kit = await updateKitScoreFields(row.subscriber_id, {
        ai_score: String(payload.score.total),
        ai_score_clarity: String(payload.score.clarity),
        ai_score_presence: String(payload.score.presence),
        ai_appeared: row.appeared_in_buyer_query === true ? 'yes' : 'no',
      });
      if (kit === 'ok') {
        await markKitScoreSynced(sessionToken);
      } else if (kit === 'failed') {
        console.error(
          `[visibility-demo] Kit score write failed for session ${sessionToken} (score persisted, kit_score_synced_at left null for backfill)`,
        );
      }
    } else {
      console.error(
        `[visibility-demo] no subscriber_id for session ${sessionToken} (write 1 didn't capture one) — leaving kit_score_synced_at null for backfill`,
      );
    }

    return Response.json({ ok: true, ...payload });
  } catch (err) {
    // Capacity → the shared "at capacity" state (book a call).
    if (err instanceof CapacityError) {
      return Response.json({ ok: false, at_capacity: true }, { status: 503 });
    }
    // ANY other failure — unparseable/incomplete rubric (ScoringError), invariant
    // violation, or a provider error — FAILS LOUDLY. We persisted NO score (so a
    // fabricated number never reaches the DB or the visitor), and route to a book-a-
    // call. Replay re-attempts a real score rather than serving a cached lie.
    console.error('[visibility-demo] score FAILED (no number shown) session=%s', sessionToken, err);
    return Response.json({ ok: false, scoring_failed: true }, { status: 502 });
  }
}
