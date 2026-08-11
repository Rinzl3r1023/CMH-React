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
| `KIT_API_KEY` | server | Existing Kit key; demo reuses it with `KIT_DEMO_FORM_ID`. |
| `NEXT_PUBLIC_CALENDLY_URL` | public | The `at_capacity` CTA (book a call — a human conversation salvages a lead that got nothing). |

If a var is missing, that path **degrades gracefully** (Turnstile fail-opens with
no secret; Supabase checks skip; Kit skips) — so a partial config silently weakens
abuse controls. Verify all 8 are set before launch.

---

## 2. Migrations (apply order)

All four are **already applied** to `zglwfshbrrkjrkhbarfx` via the Supabase MCP.
Listed here for the record and for rebuilding another environment — apply in this
order:

1. `create_demo_sessions` — base table (29 cols), RLS on, no policies, 3 indexes.
2. `demo_sessions_guards` — `session_token` NOT NULL; `site_id` DEFAULT `'demo-visibility'`.
3. `demo_sessions_kit_synced_at` — `kit_synced_at timestamptz` (Kit-sync observability / backfill queue).
4. `demo_sessions_payoff` — `payoff jsonb` (full Call-2 output for idempotent replay).

RLS is on with **no policies** → all anon/authenticated access denied; only the
server routes (service role) read/write. Do not add policies.

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

## 4. Changelog INSERT (on deploy)

Run against `zglwfshbrrkjrkhbarfx` after the deploy is green (§11 changelog row):

```sql
insert into changelog (product, type, title, description)
values (
  'platform',          -- ⚑ confirm bucket: none of the existing products (agents,
                       --    concierge, connect, hub, platform, sparc-agents, dashboard)
                       --    map cleanly to a public CMH marketing demo. 'platform' is
                       --    the safe default; pick a dedicated value if you prefer.
  'feature-launch',
  'AI Visibility Demo live — "What does AI say about your business?"',
  'Public lead-capture demo at chrismichaelharris.com/visibility. Live Sonnet 5 + web search (3-search hard cap, own Anthropic Workspace + $300/mo cap), free mirror/absence reveal, email gate to the Kit demo form, gated two-pillar score (Clarity /25 + Presence /25 = /50; Crawlability named-not-scored). Turnstile + one run/IP/24h + monthly ceiling. noindex, unlinked.'
);
```

---

## 5. Deploy sequence

1. Set all 8 new env vars (+ confirm the 2 reused) on the Railway service.
2. Confirm the 4 migrations are applied (they are, on `zglwfshbrrkjrkhbarfx`).
3. Merge the branch → Railway builds from `main` (NEXT_PUBLIC vars must be set at build).
4. Run the §3 launch-gate smoke test. **Block on it.**
5. Insert the §4 changelog row.
