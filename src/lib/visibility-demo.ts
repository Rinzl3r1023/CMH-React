// Shared gate helpers for the AI Visibility Demo (§7 abuse & spend controls).
// Used by two surfaces:
//   • the RUN route (/api/visibility-demo) — Turnstile + IP-24h + monthly ceiling
//     run BEFORE the searches fire (§7.2/7.3/7.5); the ceiling emits the same
//     at_capacity state as the workspace spend cap ("one handler, two triggers").
//   • the EMAIL-GATE route (/api/visibility-demo/gate) — 1-per-email + Kit subscribe.
//
// Everything degrades gracefully when its env is absent: Turnstile fail-opens ONLY
// when no secret is configured (dev), and the Supabase checks return null (→ the
// caller skips that check) when SUPABASE_URL/SERVICE_ROLE_KEY are unset. Prod must
// set all of them — see the ⚑ env notes.

import { createHash } from 'node:crypto';

export const SITE_ID = 'demo-visibility';
export const MONTHLY_CEILING = 2000; // §7.5 / REV 1.1 — 2,000 sessions/mo
export const IP_WINDOW_HOURS = 24; // §7.3 — one free run per IP per 24h

/**
 * Read an env var, TRIMMED. A stray trailing newline or space from a dashboard
 * copy-paste (exactly how the Turnstile site key once broke) is invisible but
 * fatal — an invalid sitekey, a malformed URL, a header with an embedded newline.
 * Every env read in the demo goes through this so paste whitespace can't recur.
 */
export function envTrim(name: string): string {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

// ── client IP + salted hash (never store a raw IP) ───────────────────────────
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

const DEV_SALT_FALLBACK = 'cmh-visibility-demo-dev';
export function hashIp(ip: string): string {
  const salt = envTrim('DEMO_IP_SALT') || undefined;
  if (!salt) {
    if (process.env.NODE_ENV === 'production') {
      // Fail loud: a hardcoded salt makes hashed IPs reversible by anyone with the
      // repo. Enforced at first use (not module top-level) on purpose — `next build`
      // runs with NODE_ENV=production and no runtime secrets, so a top-level throw
      // would break the build; and the failure is scoped to the demo, not the whole
      // site. In prod, DEMO_IP_SALT MUST be set or the run endpoint 500s loudly.
      throw new Error('DEMO_IP_SALT is required in production (a hardcoded salt makes hashed IPs reversible).');
    }
    return createHash('sha256').update(`${DEV_SALT_FALLBACK}:${ip}`).digest('hex');
  }
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

// ── Cloudflare Turnstile (§7.2 — non-optional before the run in prod) ─────────
// Fail-OPEN only when no secret is set (dev/keyless). With a secret present it
// fails CLOSED on any non-success, so production (secret set) is always enforced.
export async function verifyTurnstile(token: string, ip: string): Promise<{ ok: boolean; bypassed: boolean }> {
  const secret = envTrim('TURNSTILE_SECRET_KEY');
  if (!secret) return { ok: true, bypassed: true }; // ⚑ dev only — MUST be set before launch
  if (!token) return { ok: false, bypassed: false };
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return { ok: false, bypassed: false };
    const j = (await res.json()) as { success?: boolean };
    return { ok: j.success === true, bypassed: false };
  } catch {
    return { ok: false, bypassed: false };
  }
}

// ── Supabase (PostgREST raw fetch) ───────────────────────────────────────────
// ⚑ ENV NEEDED (not in the confirmed new-env list § REV 1.1): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
export function supabaseConfigured(): boolean {
  return !!(envTrim('SUPABASE_URL') && envTrim('SUPABASE_SERVICE_ROLE_KEY'));
}

function sbAuth(svc: string): Record<string, string> {
  return { apikey: svc, authorization: `Bearer ${svc}` };
}

// Exact row count for a filter, via PostgREST count=exact + Content-Range.
// Returns null when Supabase is unconfigured so the caller can skip the check.
async function sbCount(query: string): Promise<number | null> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return null;
  try {
    const res = await fetch(`${base}/rest/v1/demo_sessions?${query}`, {
      method: 'GET',
      headers: { ...sbAuth(svc), prefer: 'count=exact', range: '0-0' },
    });
    if (!res.ok) return null;
    const cr = res.headers.get('content-range'); // e.g. "0-0/1234" or "*/0"
    if (!cr) return null;
    const total = Number(cr.split('/')[1]);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** §7.5 — sessions created this calendar month for this demo. null = unknown (skip). */
export async function countSessionsThisMonth(): Promise<number | null> {
  return sbCount(`select=id&site_id=eq.${SITE_ID}&created_at=gte.${encodeURIComponent(monthStartIso())}`);
}

/**
 * §7.3 — has this hashed IP started a run in the last 24h? null = unknown (skip).
 *
 * Fix C4: a reservation is written at run START (map_generated_at NULL). If the
 * connection drops before Call 1 finishes, that row would otherwise lock the IP
 * out for 24h having received NOTHING — a dead end on paid traffic. So an
 * ABANDONED reservation (map_generated_at IS NULL AND older than ~10 min) does
 * NOT count: the row must either have completed (map_generated_at NOT NULL) or be
 * a still-in-progress reservation (created within the last 10 min).
 */
export async function ipRunInLast24h(ipHash: string): Promise<boolean | null> {
  const since = new Date(Date.now() - IP_WINDOW_HOURS * 3600 * 1000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const n = await sbCount(
    `select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}` +
      `&or=(map_generated_at.not.is.null,created_at.gte.${encodeURIComponent(tenMinAgo)})`,
  );
  return n === null ? null : n > 0;
}

/** §7.3 — has this email already been used to gate a session? null = unknown (skip). */
export async function emailUsed(email: string): Promise<boolean | null> {
  const n = await sbCount(`select=id&email=eq.${encodeURIComponent(email)}`);
  return n === null ? null : n > 0;
}

/**
 * Record the run at its START (site_id + session_token + ip_hash), so the IP-24h
 * window is enforced even for runs that fire concurrently before any completes.
 * Best-effort: the final persistCall1() upsert merges the rest onto session_token.
 */
export async function reserveSession(sessionToken: string, ipHash: string): Promise<void> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return;
  try {
    await fetch(`${base}/rest/v1/demo_sessions?on_conflict=session_token`, {
      method: 'POST',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ site_id: SITE_ID, session_token: sessionToken, ip_hash: ipHash }),
    });
  } catch {
    /* best-effort — a persistence blip must not block the run */
  }
}

/**
 * Email gate (State 4): set email + gated_at on the existing session row. Returns
 * false when Supabase is unconfigured OR no row matched the token (invalid token).
 */
// Returns { ok, subjectName }. `ok` is false when the token matches no row
// (invalid/unknown) or Supabase is unconfigured. subjectName is pulled from the
// representation this PATCH already returns, so write 1 gets ai_business_name
// without a second query.
export async function markGated(
  sessionToken: string,
  email: string,
): Promise<{ ok: boolean; subjectName: string | null }> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return { ok: false, subjectName: null };
  try {
    const res = await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ email, gated_at: new Date().toISOString() }),
    });
    if (!res.ok) return { ok: false, subjectName: null };
    const rows = (await res.json()) as Array<{ subject_name?: string | null }>;
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, subjectName: null }; // unknown token
    return { ok: true, subjectName: typeof rows[0].subject_name === 'string' ? rows[0].subject_name : null };
  } catch {
    return { ok: false, subjectName: null };
  }
}

// ── Kit (ConvertKit) — demo leads go to KIT_DEMO_FORM_ID, NOT the main form ───
// Mirrors the /api/subscribe pattern (v3 form-subscribe; idempotent). Demo leads
// must NOT pool with the main audience (§1) — hence the separate form.
// Write 1: subscribe the lead to the demo form, optionally sending custom fields
// (ai_business_name), and capture the Kit subscriber id from the response so
// write 2 (the score PUT) needs no lookup. v3 form-subscribe returns
// { subscription: { subscriber: { id } } }.
export async function subscribeDemoLead(
  email: string,
  fields?: Record<string, string>,
): Promise<{ status: 'ok' | 'unconfigured' | 'failed'; subscriberId: string | null }> {
  const apiKey = envTrim('KIT_API_KEY');
  const formId = envTrim('KIT_DEMO_FORM_ID');
  if (!apiKey || !formId) return { status: 'unconfigured', subscriberId: null };
  try {
    const res = await fetch(`https://api.convertkit.com/v3/forms/${encodeURIComponent(formId)}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, email, ...(fields ? { fields } : {}) }),
    });
    if (!res.ok) return { status: 'failed', subscriberId: null };
    let subscriberId: string | null = null;
    try {
      const j = (await res.json()) as { subscription?: { subscriber?: { id?: unknown } } };
      const id = j.subscription?.subscriber?.id;
      if (typeof id === 'number' || typeof id === 'string') subscriberId = String(id);
    } catch {
      /* subscribed OK but body unparseable → id stays null (backfill handles it) */
    }
    return { status: 'ok', subscriberId };
  } catch {
    return { status: 'failed', subscriberId: null };
  }
}

// Write 2: update the subscriber's score fields. PUT /v3/subscribers/{id} — note
// this endpoint authenticates with api_SECRET, not api_key (KIT_API_SECRET, read
// through envTrim like every other env). Best-effort; never blocks the score.
export async function updateKitScoreFields(
  subscriberId: string,
  fields: Record<string, string>,
): Promise<'ok' | 'unconfigured' | 'failed'> {
  const apiSecret = envTrim('KIT_API_SECRET');
  if (!apiSecret) return 'unconfigured';
  try {
    const res = await fetch(`https://api.convertkit.com/v3/subscribers/${encodeURIComponent(subscriberId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_secret: apiSecret, fields }),
    });
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

// Persist the Kit subscriber id onto the run row (best-effort). Enables write 2
// with no lookup; a null id after a successful gate is the backfill signal.
export async function persistSubscriberId(sessionToken: string, subscriberId: string): Promise<void> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return;
  try {
    await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ subscriber_id: subscriberId }),
    });
  } catch {
    /* best-effort */
  }
}

// Observability for write 2: stamp kit_score_synced_at on a successful score PUT.
// Left null on failure so "gated + scored, kit_score_synced_at null" is a
// recoverable backfill queue (mirrors kit_synced_at for write 1). Best-effort.
export async function markKitScoreSynced(sessionToken: string): Promise<void> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return;
  try {
    await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ kit_score_synced_at: new Date().toISOString() }),
    });
  } catch {
    /* best-effort — the null timestamp is the backfill signal */
  }
}

/**
 * Observability for the Kit sync (§ this piece): stamp kit_synced_at on a
 * successful subscribe. Left NULL on failure so
 *   WHERE email IS NOT NULL AND kit_synced_at IS NULL
 * is a recoverable backfill queue, not silent lead loss. Best-effort.
 */
export async function markKitSynced(sessionToken: string): Promise<void> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return;
  try {
    await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ kit_synced_at: new Date().toISOString() }),
    });
  } catch {
    /* best-effort — the null timestamp is the backfill signal */
  }
}

// ── Call 2 (gated score) support ─────────────────────────────────────────────

// ── per-session spend estimate (fix B3) ──────────────────────────────────────
// Summed across EVERY call in the session (incl. Call 2). web_search at $0.01/search.
//
// COST NOTE — STANDARD rates, overstates until 2026-08-31. These are Sonnet 5's
// STANDARD prices ($3/1M input, $15/1M output). Through 2026-08-31 Sonnet 5 bills
// at INTRO rates ($2/1M in, $10/1M out), so est_cost_usd currently OVERSTATES real
// spend by ~50% — deliberately. For a spend estimate, over- is the safe direction
// to err; calculating at intro rates would under-report and then surprise us when
// intro ends. On 2026-09-01 intro pricing lapses and STANDARD becomes the actual
// rate, at which point this estimate becomes accurate with NO code change. If
// Sonnet 5 pricing changes again, edit the two RATE_* constants below — one line
// each, no inline numbers to hunt. (Intro reference, if ever needed: 2 / 10.)
const RATE_INPUT_PER_1M = 3; // claude-sonnet-5 STANDARD, $/1M input tokens
const RATE_OUTPUT_PER_1M = 15; // claude-sonnet-5 STANDARD, $/1M output tokens
const SEARCH_COST_USD = 0.01; // web_search server tool, per search
export function estCostUsd(inputTokens: number, outputTokens: number, searches: number): number {
  const c =
    (inputTokens / 1_000_000) * RATE_INPUT_PER_1M +
    (outputTokens / 1_000_000) * RATE_OUTPUT_PER_1M +
    searches * SEARCH_COST_USD;
  return Math.round(c * 10_000) / 10_000; // numeric(10,4)
}

export interface DemoSessionRow {
  session_token: string;
  subject_name: string | null;
  subject_url: string | null;
  category: string | null;
  gated_at: string | null;
  email: string | null;
  call1_results: unknown;
  score_clarity: number | null;
  score_presence: number | null;
  payoff: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  est_cost_usd: number | string | null; // PostgREST may serialize numeric as string
  appeared_in_buyer_query: boolean | null; // code-anchored truth for the Call-2 invariant
  subscriber_id: string | null; // Kit subscriber id, captured at the gate (write 1)
  kit_score_synced_at: string | null; // write-2 stamp; null after a gated score = backfill
}

/** Fetch a session row by token for Call 2. null = not found / unconfigured. */
export async function getSession(sessionToken: string): Promise<DemoSessionRow | null> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return null;
  const cols =
    'session_token,subject_name,subject_url,category,gated_at,email,call1_results,score_clarity,score_presence,payoff,input_tokens,output_tokens,est_cost_usd,appeared_in_buyer_query,subscriber_id,kit_score_synced_at';
  try {
    const res = await fetch(
      `${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}&select=${cols}&limit=1`,
      { method: 'GET', headers: { ...sbAuth(svc) } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as DemoSessionRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Persist the Call-2 result: the two /25 scores AND the full payoff (per-criterion
 * breakdown + top-3 fixes + crawlability line + /50 score), so idempotent replay
 * returns the complete paid payoff, not bare numbers.
 */
export async function persistScore(
  sessionToken: string,
  clarity: number,
  presence: number,
  payoff: unknown,
  // Session-cumulative totals AFTER Call 2, so est_cost_usd covers every call (B3).
  totals: { inputTokens: number; outputTokens: number; estCostUsd: number },
): Promise<boolean> {
  const base = envTrim('SUPABASE_URL');
  const svc = envTrim('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !svc) return false;
  try {
    const res = await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        score_clarity: clarity,
        score_presence: presence,
        payoff,
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        est_cost_usd: totals.estCostUsd,
        payoff_generated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Anthropic text call (no tools) — used by Call 2 scoring ──────────────────
// NOTE: the RUN route (/api/visibility-demo/route.ts) keeps its own local
// CapacityError + classifyFailure for the SEARCH path (with the 429 retry). This
// pair mirrors them for the no-search scoring path; capacity detection is kept
// identical on purpose. callClaudeText declares NO web_search tool, so Call 2 can
// never issue a search and never touches the 3-search cap.
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_MODEL = 'claude-sonnet-5';
export const ANTHROPIC_KEY_ENV = 'ANTHROPIC_API_KEY_DEMO';

export class CapacityError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'CapacityError';
  }
}

export function classifyFailure(status: number, errType: string, errMsg: string): 'capacity' | 'ratelimit' | 'error' {
  const text = `${errType} ${errMsg}`;
  if (status === 402 || /credit|billing|spend|budget|quota|payment|balance/i.test(text)) return 'capacity';
  if (status === 429) return 'ratelimit';
  return 'error';
}

interface ClaudeTextResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string | null;
}

export async function callClaudeText(
  prompt: string,
  maxTokens: number,
  // Optional structured-outputs config, e.g. { format: { type: 'json_schema',
  // schema } } — forces schema-valid JSON so the response can't be malformed.
  outputConfig?: unknown,
): Promise<{
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  stubbed: boolean;
  // Diagnostics: stop_reason (e.g. 'max_tokens' when the JSON was truncated) and
  // the response content block types (to catch a structured-output block that
  // isn't 'text'). Both help distinguish truncation from a shape mismatch.
  stopReason: string | null;
  contentTypes: string[];
}> {
  const key = envTrim(ANTHROPIC_KEY_ENV);
  if (!key)
    return { text: '', usage: { input_tokens: 0, output_tokens: 0 }, stubbed: true, stopReason: null, contentTypes: [] };

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    // NO tools → this call physically cannot issue a web search.
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      ...(outputConfig ? { output_config: outputConfig } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
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
    // Include the API error type + message so a rejected output_config schema
    // (400) is visible in logs instead of a bare status. This was lost before —
    // the score call's first live failure had no recoverable reason in the log.
    throw new Error(`anthropic ${res.status} ${errType} ${errMsg}`.trim());
  }

  const data = (await res.json()) as ClaudeTextResponse;
  let text = '';
  for (const block of data.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text;
  }
  return {
    text,
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
    stubbed: false,
    stopReason: data.stop_reason ?? null,
    contentTypes: (data.content ?? []).map((b) => b.type),
  };
}
