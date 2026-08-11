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

export function hashIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT || 'cmh-visibility-demo';
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
