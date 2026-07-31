import { NextResponse } from 'next/server';

// Kit (ConvertKit) capture endpoint. The browser posts here; this route holds
// the API key and calls Kit (§6.2). The key NEVER reaches client JS — same proxy
// rule as the YouTube key. Until KIT_API_KEY + KIT_FORM_ID are set this returns a
// 503 rather than silently succeeding, so nothing is "live" until a real
// subscriber record can actually be created (the §6.2 go/no-go).

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim() : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 });
  }

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) {
    // Not configured yet — do not pretend success. The form will show a retry
    // state; launch stays gated until this path returns real subscribers.
    return NextResponse.json(
      { ok: false, error: 'Subscriptions are not enabled yet.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`https://api.convertkit.com/v3/forms/${encodeURIComponent(formId)}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, email }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Subscription failed.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Subscription failed.' }, { status: 502 });
  }
}
