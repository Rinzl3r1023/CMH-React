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

// ── client IP + salted hash (never store a raw IP) ───────────────────────────
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

const DEV_SALT_FALLBACK = 'cmh-visibility-demo-dev';
export function hashIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT;
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
  const secret = process.env.TURNSTILE_SECRET_KEY;
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
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function sbAuth(svc: string): Record<string, string> {
  return { apikey: svc, authorization: `Bearer ${svc}` };
}

// Exact row count for a filter, via PostgREST count=exact + Content-Range.
// Returns null when Supabase is unconfigured so the caller can skip the check.
async function sbCount(query: string): Promise<number | null> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

/** §7.3 — has this hashed IP started a run in the last 24h? null = unknown (skip). */
export async function ipRunInLast24h(ipHash: string): Promise<boolean | null> {
  const since = new Date(Date.now() - IP_WINDOW_HOURS * 3600 * 1000).toISOString();
  const n = await sbCount(`select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}`);
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
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
export async function markGated(sessionToken: string, email: string): Promise<boolean> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !svc) return false;
  try {
    const res = await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ email, gated_at: new Date().toISOString() }),
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0; // no row = invalid/unknown token
  } catch {
    return false;
  }
}

// ── Kit (ConvertKit) — demo leads go to KIT_DEMO_FORM_ID, NOT the main form ───
// Mirrors the /api/subscribe pattern (v3 form-subscribe; idempotent). Demo leads
// must NOT pool with the main audience (§1) — hence the separate form.
export async function subscribeDemoLead(email: string): Promise<'ok' | 'unconfigured' | 'failed'> {
  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_DEMO_FORM_ID;
  if (!apiKey || !formId) return 'unconfigured';
  try {
    const res = await fetch(`https://api.convertkit.com/v3/forms/${encodeURIComponent(formId)}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, email }),
    });
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Observability for the Kit sync (§ this piece): stamp kit_synced_at on a
 * successful subscribe. Left NULL on failure so
 *   WHERE email IS NOT NULL AND kit_synced_at IS NULL
 * is a recoverable backfill queue, not silent lead loss. Best-effort.
 */
export async function markKitSynced(sessionToken: string): Promise<void> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
}

/** Fetch a session row by token for Call 2. null = not found / unconfigured. */
export async function getSession(sessionToken: string): Promise<DemoSessionRow | null> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !svc) return null;
  const cols = 'session_token,subject_name,subject_url,category,gated_at,email,call1_results,score_clarity,score_presence,payoff';
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
): Promise<boolean> {
  const base = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !svc) return false;
  try {
    const res = await fetch(`${base}/rest/v1/demo_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
      method: 'PATCH',
      headers: { ...sbAuth(svc), 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        score_clarity: clarity,
        score_presence: presence,
        payoff,
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
}

export async function callClaudeText(
  prompt: string,
  maxTokens: number,
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number }; stubbed: boolean }> {
  const key = process.env[ANTHROPIC_KEY_ENV];
  if (!key) return { text: '', usage: { input_tokens: 0, output_tokens: 0 }, stubbed: true };

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    // NO tools → this call physically cannot issue a web search.
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
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
    throw new Error(`anthropic ${res.status}`);
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
  };
}
