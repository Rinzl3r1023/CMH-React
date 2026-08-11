# Deploying the AI Visibility Demo

The demo (`/visibility` + `/api/visibility-demo`, `/gate`, `/score`) is built and
merged to the branch but **not live**. It runs fully stubbed without keys; going
to production needs the env vars below. **No deploy until keys are in and the
launch-gate smoke test passes.**

---

## 1. Required environment variables

Set these on the Railway service (project `c912ffe4-2c5d-4b64-8e31-010d3e229846`,
service `4f896d36-107d-4f07-bf4e-8a23caa131ea`, prod env `62b703e4-…`).

**⚠️ `NEXT_PUBLIC_*` vars are inlined into the client bundle at BUILD time** — they
must be present when `next build` runs, not just at runtime. Set them before the
build, then redeploy.

### New — all 8 must be set

| Var | Scope | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY_DEMO` | server (secret) | Demo's **own** Anthropic Workspace key, separate from SPARC, with its own $300/mo spend cap (§7.1). A runaway here can never starve the production SPARC agents. |
| `TURNSTILE_SECRET_KEY` | server (secret) | Cloudflare Turnstile server-side verification (§7.2). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **public** | Turnstile widget site key (safe to expose). Renamed from the spec's `TURNSTILE_SITE_KEY` — Next only ships `NEXT_PUBLIC_`-prefixed vars to the browser. |
| `KIT_DEMO_FORM_ID` | server | Kit form for demo leads — **separate** from the main form so demo leads don't pool with the main audience (§1). |
| `SUPABASE_URL` | server | Supabase REST base (project `zglwfshbrrkjrkhbarfx`). |
| `SUPABASE_SERVICE_ROLE_KEY` | server (secret) | Service-role key for `demo_sessions` writes. **Server-only — never expose.** |
| `DEMO_IP_SALT` | server (secret) | Salt for hashed IPs. **Required in production** — `hashIp` throws if `NODE_ENV=production` and this is unset (a hardcoded salt would make hashed IPs reversible). |
| `NEXT_PUBLIC_COMMUNITY_URL` | **public** | Community destination for the score CTA and the `rate_limited` CTA. |

### Reused — already on the service (confirm present)

| Var | Scope | Used by |
|---|---|---|
| `KIT_API_KEY` | server | Existing Kit key; demo reuses it for the form subscribe + `ai_business_name` (Kit write 1). |
| `KIT_API_SECRET` | server (secret) | Kit **secret** key. `PUT /v3/subscribers/{id}` (score write 2 — `ai_score*`, `ai_appeared`) authenticates with `api_secret`, NOT `api_key`. Read through `envTrim`. Missing → write 2 skips, `kit_score_synced_at` left null (backfill). |
| `NEXT_PUBLIC_CALENDLY_URL` | public | The `at_capacity` CTA (book a call — a human conversation salvages a lead that got nothing). |

If a var is missing, that path **degrades gracefully** (Turnstile fail-opens with
no secret; Supabase checks skip; Kit skips) — so a partial config silently weakens
abuse controls. Verify all 8 are set before launch.

---

## 2. Migrations (apply order)

All are **already applied** to `zglwfshbrrkjrkhbarfx` via the Supabase MCP.
Listed here for the record and for rebuilding another environment — apply in this
order:

1. `create_demo_sessions` — base table (29 cols), RLS on, no policies, 3 indexes.
2. `demo_sessions_guards` — `session_token` NOT NULL; `site_id` DEFAULT `'demo-visibility'`.
3. `demo_sessions_kit_synced_at` — `kit_synced_at timestamptz` (Kit write-1 observability / backfill queue).
4. `demo_sessions_payoff` — `payoff jsonb` (full Call-2 output for idempotent replay).
5. `demo_sessions_kit_subscriber_fields` — `subscriber_id text` (Kit id from write 1) + `kit_score_synced_at timestamptz` (Kit write-2 observability / backfill queue).

RLS is on with **no policies** → all anon/authenticated access denied; only the
server routes (service role) read/write. Do not add policies.

**Kit backfill queues** (best-effort writes leave a null timestamp on failure, never silent loss):

```sql
-- Write 1 failed (lead not on the Kit form):
select session_token, email from demo_sessions
where email is not null and kit_synced_at is null;

-- Write 2 failed (scored, but score fields never reached Kit):
select session_token, email, subscriber_id, score_clarity, score_presence
from demo_sessions
where score_clarity is not null and gated_at is not null and kit_score_synced_at is null;
```

---

## 3. Launch gate — "appears" branch smoke test (blocking)

**Nothing goes to production until this passes.** The §6 honesty branch is verified
in code, but the keyless stub only exercises the *absence* branch. With the live key
set, run these against the deployed demo:

1. **A subject known to RANK in its category** (a real, well-indexed business).
   Confirm:
   - the mirror renders a real reading (not the stub line);
   - the absence card flips to **"Where you show up"** and the copy pivots to *where*
     they rank / *how* they're described — it does **NOT** manufacture an absence;
   - the code-anchored override does **not** misfire (no false "you appear" when they don't);
   - the gated score renders **/50** (never /75), Clarity + Presence each /25, and a
     strong subject scores **high** — the rubric returns an honest good number.
2. **A subject that does NOT rank.** Confirm the absence branch reads correctly
   ("The absence", who's recommended instead, "you're not on it").
3. Spot-check the terminal states copy (`rate_limited` come-back CTA → community;
   `at_capacity` → Calendly).

---

## 4. Deploy sequence

1. Set all 8 new env vars (+ confirm the 2 reused) on the Railway service.
2. Confirm the 4 migrations are applied (they are, on `zglwfshbrrkjrkhbarfx`).
3. Merge the branch → Railway builds from `main` (NEXT_PUBLIC vars must be set at build).
4. Run the §3 launch-gate smoke test. **Block on it.**

> No changelog row. The `changelog` table is **public SPARC release notes** for
> SPARC buyers — this is a CMH marketing page, not a SPARC deployment, so a row
> there would be a false record (and a new bucket would pollute the enum for a
> one-off). Git history is the record. Same call applies to Kim's repurposing demo.

---

## 5. Paths that are UNTESTED until production (verify these first, every deploy)

Every external dependency **stubs out when its env var is absent**, which is what
lets the demo build and run keyless in dev. The flip side: **anything gated on a
production-only env var runs for the first time in production.** The keyless build
passing proves nothing about these paths. The Turnstile widget bug (site key only
present in prod, so the render path never executed locally) is exactly this class.

Exercise each of these on the deployed site, not just in a green build:

| Path | Gated on (prod-only) | Never runs in dev because… |
|---|---|---|
| Turnstile **widget render** + token | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no site key → widget branch is skipped entirely |
| Turnstile **server verify** | `TURNSTILE_SECRET_KEY` | unset → fail-open (verification skipped) |
| Live search + **mirror/absence** synthesis, incl. the §6 **appears** branch | `ANTHROPIC_API_KEY_DEMO` | unset → deterministic stub returns the absence branch only |
| Call-2 **rubric scoring** + JSON parse of live model output | `ANTHROPIC_API_KEY_DEMO` | unset → stub payoff, real rubric never runs |
| **Supabase** persistence, IP-24h + ceiling counts, `markGated` PATCH | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | unset → checks return null / writes no-op |
| **Kit write 1** — form subscribe + `ai_business_name`, capture `subscriber_id`, `kit_synced_at` | `KIT_API_KEY` / `KIT_DEMO_FORM_ID` | unset → subscribe skipped |
| **Kit write 2** — score PUT (`ai_score`, `ai_score_clarity`, `ai_score_presence`, `ai_appeared`) + `kit_score_synced_at`, FRESH score only | `KIT_API_SECRET` (+ a captured `subscriber_id`) | unset → PUT skipped; runs only after a real gated score, never on replay or a scoring failure |

The §3 launch-gate smoke test is what actually exercises the live model paths;
the widget + a real submit exercise Turnstile + Supabase. **Run a full flow on the
deployed URL after every deploy — a passing build is not coverage for any row above.**
