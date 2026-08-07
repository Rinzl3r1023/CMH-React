import { NextResponse } from 'next/server';

// Kit (ConvertKit) capture endpoint. The browser posts here; this route holds
// the API key and calls Kit (§6.2). The key NEVER reaches client JS. This is a
// public, unauthenticated endpoint that writes to a real list, so it carries:
//   • a honeypot field (bots fill it; humans never see it) — silent success
//   • per-IP rate limiting
//   • idempotent already-subscribed handling (Kit's form-subscribe is a no-op on
//     an existing email and returns 200, so the UI still says "You're in")
//   • an optional welcome sequence, so new subscribers get an email instead of
//     silence after "first dispatch arrives this week"
//
// Until KIT_API_KEY + KIT_FORM_ID are set this returns 503 rather than a silent
// success, so nothing is "live" until a real subscriber can be created (§6.2).

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Rate limit: fixed window, in-memory ──────────────────────────────────────
// Per-instance only. Railway runs one instance here; if this ever scales
// horizontally, move this to a shared store (Redis/Upstash). Enough to blunt
// casual abuse of a public write endpoint.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return rec.count > MAX_PER_WINDOW;
}

function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  let email = '';
  let honeypot = '';
  try {
    const body = (await request.json()) as { email?: unknown; company?: unknown };
    email = typeof body.email === 'string' ? body.email.trim() : '';
    honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot: a real user never fills the hidden "company" field. Pretend success
  // so bots get no signal, but never touch Kit.
  if (honeypot) {
    return NextResponse.json({ ok: true });
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Please try again shortly.' }, { status: 429 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 });
  }

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) {
    return NextResponse.json({ ok: false, error: 'Subscriptions are not enabled yet.' }, { status: 503 });
  }

  try {
    // Form subscribe is idempotent: an already-subscribed email returns 200, so
    // the already-subscribed case is a success, not an error.
    const res = await fetch(`https://api.convertkit.com/v3/forms/${encodeURIComponent(formId)}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, email }),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Subscription failed.' }, { status: 502 });
    }

    // Optional: also enroll in a welcome sequence so a real email fires. Failure
    // here must not fail the whole request — they're already subscribed.
    const welcomeSeq = process.env.KIT_WELCOME_SEQUENCE_ID;
    if (welcomeSeq) {
      try {
        await fetch(`https://api.convertkit.com/v3/sequences/${encodeURIComponent(welcomeSeq)}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, email }),
        });
      } catch {
        // swallow — subscription already succeeded
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Subscription failed.' }, { status: 502 });
  }
}
