import {
  emailUsed,
  markGated,
  markKitSynced,
  subscribeDemoLead,
  supabaseConfigured,
} from '@/lib/visibility-demo';

// AI Visibility Demo — the EMAIL GATE (State 4). Fires AFTER the free mirror +
// absence have streamed, BEFORE the gated score (Call 2, a later piece). It:
//   • validates the email (+ honeypot),
//   • enforces one gate per email (§7.3) against demo_sessions,
//   • subscribes the lead to KIT_DEMO_FORM_ID — a SEPARATE form so demo leads do
//     NOT pool with the main audience (§1),
//   • stamps email + gated_at onto the run's session row (invalid token → 400).
//
// Turnstile is NOT re-checked here: §7.2 requires it before the RUN (already done
// in /api/visibility-demo), and by State 4 the spend has already happened. The
// per-email limit + the honeypot are the abuse controls on this write.
//
// STUBBED-friendly: with Supabase unconfigured the email/token checks are skipped
// (dev); with Kit unconfigured the subscribe is skipped but the gate still opens.
// ⚑ ENV: KIT_DEMO_FORM_ID (+ existing KIT_API_KEY), SUPABASE_URL/SERVICE_ROLE_KEY.

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = '';
  let honeypot = '';
  let sessionToken = '';
  try {
    const body = (await request.json()) as { email?: unknown; company?: unknown; session_token?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    honeypot = typeof body.company === 'string' ? body.company.trim() : '';
    sessionToken = typeof body.session_token === 'string' ? body.session_token : '';
  } catch {
    return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot: a real visitor never fills the hidden "company" field. Pretend
  // success so bots get no signal, but touch nothing.
  if (honeypot) {
    return Response.json({ ok: true, unlocked: true });
  }

  if (!EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 });
  }
  if (sessionToken.length < 8) {
    return Response.json({ ok: false, error: 'Missing or invalid session.' }, { status: 400 });
  }

  // §7.3 — one gate per email. null = Supabase unconfigured (dev) → skip the check.
  if ((await emailUsed(email)) === true) {
    return Response.json(
      { ok: false, error: 'This email has already unlocked a report.', scope: 'email' },
      { status: 429 },
    );
  }

  // Stamp email + gated_at onto the run's row. false when the token matches no row
  // (invalid/unknown) OR Supabase is unconfigured; only the invalid-token case is
  // an error — in dev (unconfigured) we let the gate open so the flow is testable.
  const gated = await markGated(sessionToken, email);
  if (!gated && supabaseConfigured()) {
    return Response.json({ ok: false, error: 'Session not found. Please re-run the check.' }, { status: 400 });
  }

  // Lead capture to the separate demo form. Best-effort: a Kit hiccup must not
  // cost the visitor the score they just unlocked — but the outcome IS recorded.
  // On success we stamp kit_synced_at; on failure we log and leave it NULL, which
  // makes "email set, kit_synced_at null" a recoverable backfill queue.
  const kit = await subscribeDemoLead(email);
  if (kit === 'ok') {
    await markKitSynced(sessionToken);
  } else if (kit === 'failed') {
    console.error(`[visibility-demo] Kit sync failed for gated session ${sessionToken} (email captured, kit_synced_at left null for backfill)`);
  }

  return Response.json({ ok: true, unlocked: true, kit });
}
