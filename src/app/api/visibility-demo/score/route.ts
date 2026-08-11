import {
  getSession,
  persistScore,
  callClaudeText,
  CapacityError,
  supabaseConfigured,
  type DemoSessionRow,
} from '@/lib/visibility-demo';

// AI Visibility Demo — Call 2, the GATED SCORE (State 5). Reads the persisted
// call1_results ONLY, declares NO web_search tool (via callClaudeText → cannot
// search, never touches the 3-search cap), and applies the §5 rubric:
//   • Clarity  /25  (5 criteria × 1–5) — from the identity + comparative queries
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
export const maxDuration = 60;

const SCORE_MAX_TOKENS = 1500;

const CLARITY_CRITERIA = [
  'Own site present in results at all',
  "Own site's rank position among results",
  'Accuracy of the top-ranked description vs. what they entered',
  'Entity collision — count of distinct orgs sharing the name',
  'Consistency of description across independent sources',
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
  return [
    `You are scoring the AI visibility of ${row.subject_name ?? 'this business'}${row.subject_url ? ` (${row.subject_url})` : ''} using ONLY the live search results below. Do not invent results, rankings, or competitors.`,
    ``,
    `SEARCH RESULTS (from the free check):`,
    digest,
    ``,
    `Score two pillars, five criteria each, 1–5 per criterion.`,
    `CLARITY (from the identity + comparative queries):`,
    ...CLARITY_CRITERIA.map((c, i) => `  C${i + 1}. ${c}`),
    `PRESENCE (from the buyer-intent query):`,
    ...PRESENCE_CRITERIA.map((c, i) => `  P${i + 1}. ${c}`),
    ``,
    `Band: 5 = strong/ready · 4 = good, could sharpen · 3 = present but too vague · 2 = weak · 1 = missing entirely.`,
    `HONESTY (non-negotiable): score what the results actually show. If they rank well, give the high score — a strong subject should score near 25/25. Do NOT deflate to manufacture a problem. If a criterion cannot be assessed from these results, score it conservatively and say why in its note — never guess.`,
    `Then give the top 3 prioritized fixes, specific to what the results show.`,
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

async function scoreSession(row: DemoSessionRow): Promise<{ payload: ScorePayload; usageStubbed: boolean }> {
  const { text, stubbed } = await callClaudeText(buildScorePrompt(row), SCORE_MAX_TOKENS);
  if (stubbed || !text) {
    return { payload: stubPayload(), usageStubbed: true };
  }

  let parsed: {
    clarity?: { criteria?: unknown };
    presence?: { criteria?: unknown };
    fixes?: unknown;
    crawlability_note?: unknown;
  } = {};
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    /* fall through to conservative normalization below */
  }

  const clarity = normalizeCriteria(parsed.clarity?.criteria, CLARITY_CRITERIA);
  const presence = normalizeCriteria(parsed.presence?.criteria, PRESENCE_CRITERIA);
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
    usageStubbed: false,
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

  // Idempotent — already scored → return stored numbers, no re-spend. (The full
  // per-criterion breakdown is generated once at unlock; scores persist, the
  // prose does not — there is no column for it, and none was requested.)
  if (row.score_clarity != null && row.score_presence != null) {
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
    const { payload } = await scoreSession(row);
    await persistScore(sessionToken, payload.score.clarity, payload.score.presence);
    return Response.json({ ok: true, ...payload });
  } catch (err) {
    // Same capacity discipline — never surface a raw provider error on a public page.
    if (err instanceof CapacityError) {
      return Response.json({ ok: false, at_capacity: true }, { status: 503 });
    }
    console.error('[visibility-demo] score synthesis failed', err);
    return Response.json({ ok: false, error: 'Scoring could not complete.' }, { status: 502 });
  }
}
