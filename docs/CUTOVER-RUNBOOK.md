# DNS Cutover Runbook — chrismichaelharris.com

WordPress on **SiteGround** → Next.js on **Railway** (`us-west2`, single region), DNS on **Cloudflare**.

**Cutover = one change:** repoint the apex `A`/root and `www` from SiteGround to Railway. Everything else (email, the two subdomain sites, all other DNS records) stays exactly as it is. Do the pre-flight in full before touching a single record.

Legend: **→ VERIFY** = a gate; do not proceed until it passes. **⛔ ROLLBACK POINT** marks where reverting is clean.

---

## 0. Pre-flight checks (do all before changing anything)

### 0.1 — Snapshot the current DNS zone (rollback baseline)
- Cloudflare → your domain → **DNS → Records → Export**. Save the zone file. This is your source of truth for what to revert to.
- Also screenshot the record list. Note the **current apex `A` record value** (SiteGround's IP) — this exact value is what rollback restores.

### 0.2 — Confirm email is untouched (your concern #1)
Email runs through SiteGround and **must not break**. The apex `A` change does **not** touch email, because mail is delivered by **`MX` records**, which are a different record type resolved independently of `A`. Confirm and leave alone:
- **`MX` records** for the apex (e.g. pointing to SiteGround mail, often `mailN.chrismichaelharris.com` or a SiteGround mail host). **Do not edit or delete.**
- Any **`A` record for the mail host** the MX points to (e.g. `mail.chrismichaelharris.com`) — leave it on SiteGround's IP.
- **`TXT` records for email auth:** `SPF` (`v=spf1 …`), `DKIM` (`default._domainkey` or SiteGround selector), `DMARC` (`_dmarc`). **Leave all untouched** — changing the apex `A` doesn't touch them, and deleting them silently breaks deliverability.
- **→ VERIFY (record it now, re-check after cutover):**
  ```
  dig +short MX chrismichaelharris.com
  dig +short TXT chrismichaelharris.com          # SPF
  dig +short TXT _dmarc.chrismichaelharris.com    # DMARC
  ```
  Save this output. After cutover it must be **identical**.
- ⚠️ **Flag / the one real risk:** the apex `A` record and MX are independent, BUT if any MX host is written as `@` / the apex itself (i.e. mail delivered to the apex A record's IP — rare, "implicit MX"), then changing the apex A *would* move mail. Check `dig MX` above: if it returns a **named mail host** (not the bare domain), you're safe. If it returns nothing / the apex, **stop and set an explicit MX to SiteGround's mail host before cutover.**

### 0.3 — Confirm the two subdomain sites are independent (your concern #2)
`programs.chrismichaelharris.com` and `courses.chrismichaelharris.com` are separate WordPress multisite installs on SiteGround. They must be unaffected.
- In Cloudflare DNS, confirm each has its **own explicit record** (an `A` to SiteGround's IP, or a `CNAME`):
  ```
  dig +short programs.chrismichaelharris.com
  dig +short courses.chrismichaelharris.com
  ```
  Each should resolve to **SiteGround** independently of the apex.
- **→ VERIFY:** both have their own `A`/`CNAME` rows in the zone. Because they're explicit subdomain records, changing the apex `A` **cannot** affect them — subdomains don't inherit the apex A. If either is *missing* an explicit record and only works via a wildcard `*` record, note it: a wildcard could shift with other changes. (It won't be touched by the apex edit, but confirm no wildcard is in play.)
- **Do not** touch these two rows during cutover.
- **Note:** both subdomain sites are **dead / unused** — the verification here is purely to confirm the apex change doesn't disturb them unexpectedly, not because they need to keep working. They can be **decommissioned after the 30-day rollback window closes** (delete the records + the multisite installs then, not now — leave the whole SiteGround state frozen during the window, see 4.3).

### 0.4 — Get a way to reach WordPress after DNS moves (your concern #3, rollback window)
Once DNS points at Railway, `chrismichaelharris.com` no longer reaches WordPress — but you need WP reachable for the **30-day rollback window** (and to pull anything you missed). Get **one** of these now and confirm it loads the WP admin/site:
- **SiteGround temporary domain** — Site Tools → **Websites → (your site) → the temporary URL** (SiteGround assigns a `*.siteground.site`-style temp domain), **or** Site Tools → **Site → Temporary Domain**. Load `wp-admin` on it and confirm login works.
- **Fallback — hosts-file access:** get the SiteGround server IP (Site Tools → **Site Information → Server IP**), then on your machine add to `/etc/hosts`:
  ```
  <siteground-server-ip>   chrismichaelharris.com www.chrismichaelharris.com
  ```
  This makes *your* machine resolve the domain to SiteGround regardless of public DNS — useful for verifying WP still serves and for emergency admin. Remove the line when done.
- **→ VERIFY:** you can load WordPress admin via the temp URL (or hosts file) **right now**, before cutover. Write the temp URL down.

### 0.5 — Lower DNS TTL (fast rollback)
- 24–48h before cutover, set the **apex `A` and `www`** records' TTL to **5 min (300s)**. On Cloudflare, DNS-only (grey) records honor the set TTL; proxied (orange) records are effectively ~300s already. Low TTL means a rollback propagates in minutes, not hours.
- **→ VERIFY:** `dig +noall +answer chrismichaelharris.com` shows TTL ≤ 300 as it counts down.

### 0.6 — Add the custom domain in Railway (step one, no DNS change yet)
- Railway → your service (`CMH-React`) → **Settings → Networking → Custom Domain**. Add **both**:
  - `chrismichaelharris.com` (apex)
  - `www.chrismichaelharris.com`
- Railway shows a **CNAME target** for each (e.g. `xxxx.up.railway.app`). **Copy both targets** — you'll point DNS at these.
- Apex note: Railway apex domains rely on **CNAME flattening**, which Cloudflare does at the root automatically. So the apex becomes a `CNAME → <target>.up.railway.app` and Cloudflare serves it as an `A` transparently. (No manual A record needed.)
- **→ VERIFY:** both custom domains appear in Railway, showing "waiting for DNS" (expected — DNS not changed yet).

### 0.7 — Confirm the app is healthy on the Railway URL
- Load `https://cmh-react-production.up.railway.app/` and spot-check: home, `/blog/`, one post, `/feed/`, `/sitemap.xml`, `/robots.txt`. All 200, covers render, one video embed per post.
- **→ VERIFY:** GA4 + Ads env vars are live (they are), and the latest deploy is green.

### 0.8 — Verify `NEXT_PUBLIC_SITE_URL` in Railway (do this before the DNS change, then rebuild)
`SITE_URL` is the origin for **every canonical, the sitemap, the RSS feed, and every schema `@id`/`url`**. It's a `NEXT_PUBLIC_*` var, so it's **inlined at build time** — it cannot be fixed by just resolving DNS; the app has to be **rebuilt** with the right value. If it's currently set to the Railway URL, then the moment the real domain resolves, every canonical and schema node ships pointing at `*.up.railway.app` — an active SEO problem (self-referencing canonicals to the wrong host, split signals), not cosmetic.
- Railway → service → **Variables**. Check `NEXT_PUBLIC_SITE_URL`:
  - **Correct:** either **unset** (the code defaults to `https://chrismichaelharris.com`) **or** explicitly `https://chrismichaelharris.com` (no trailing slash, `https`, apex/no-www).
  - **Wrong:** anything containing `up.railway.app` or `http://`.
- If wrong/missing-and-you-want-it-explicit: set it to `https://chrismichaelharris.com`, then **trigger a fresh deploy** so it's inlined.
- **→ VERIFY on the Railway URL, before touching DNS:**
  ```
  curl -s https://cmh-react-production.up.railway.app/sitemap.xml | grep -m1 "<loc>"
  curl -s https://cmh-react-production.up.railway.app/feed/ | grep -m1 "<link>"
  curl -s https://cmh-react-production.up.railway.app/ | grep -o 'rel="canonical" href="[^"]*"' | head -1
  ```
  All three must print **`https://chrismichaelharris.com/...`**, NOT the railway host. If they show the railway host, fix the var + redeploy and re-check — **do not start the DNS change until this passes.**

### 0.9 — Pre-stage Cloudflare SSL mode (prevents the redirect loop)
- Cloudflare → **SSL/TLS → Overview → set encryption mode to `Full (strict)`.** Do this **now**, before proxying.
- Why: with mode **Flexible**, Cloudflare talks to the origin over HTTP while the origin (Railway) forces HTTPS → **infinite redirect loop**, the classic Cloudflare-in-front-of-a-host failure. `Full (strict)` makes Cloudflare↔Railway HTTPS end-to-end and validates Railway's cert. This is the proxy caveat resolved.

---

## 1. Custom domain add — DONE in 0.6.
Nothing further here; it's a pre-flight step so Railway is ready to validate the instant DNS points at it.

---

## 2. DNS change (the cutover)

Do apex and www together. **Proxy OFF (grey cloud / DNS-only) for now** — Railway must see the ACME challenge directly to issue its certificate.

1. **Apex** — edit the `chrismichaelharris.com` record:
   - Change from the SiteGround `A` → **`CNAME`, value `<apex-target>.up.railway.app`** (from step 0.6).
   - **Proxy status: DNS only (grey cloud).**
2. **www** — edit/create `www`:
   - **`CNAME`, value `<www-target>.up.railway.app`**, **DNS only (grey cloud).**
3. **Leave every other record exactly as-is** — MX, mail A, SPF/DKIM/DMARC TXT, `programs`, `courses`, and anything else.

⛔ **ROLLBACK POINT A** — up to here, reverting is instant: change the apex/www records back to the **SiteGround `A` value** from step 0.1. Nothing else moved.

- **→ VERIFY (propagation):** from a machine *not* using the hosts-file override:
  ```
  dig +short chrismichaelharris.com          # → resolves toward railway
  dig +short www.chrismichaelharris.com
  ```
  Give it a few minutes (TTL is 300s). Use `https://dnschecker.org` for a global view.

---

## 3. Verification gates (in order)

### 3.1 — Railway issues the certificate
- Watch Railway → Custom Domain: status flips from "waiting for DNS" → **"issued / active."** This needs grey-cloud (step 2) so Let's Encrypt's challenge reaches Railway.
- **→ VERIFY:** Railway shows both domains active with a valid cert. `curl -sI https://chrismichaelharris.com/` returns `200` and a Railway/Let's-Encrypt cert. If it stays "waiting" >15 min, re-check the CNAME values and that proxy is grey.

### 3.2 — Site serves correctly on the real domain (still grey)
- **→ VERIFY** each, over HTTPS on `chrismichaelharris.com`:
  - `/` , `/about/`, `/blog/`, one post (e.g. `/3-layer-ai-architecture/`) → all `200`.
  - A **legacy WordPress URL that should 301** (from the redirect map) → `curl -sI https://chrismichaelharris.com/<old-slug>/` returns `301` to its new target.
  - `/feed/` → RSS XML, `/sitemap.xml` → 84 URLs, `/robots.txt` → points at sitemap.
  - `www.chrismichaelharris.com` → **301 to apex** (the site's canonical is apex, no-www). If www doesn't redirect, add a Cloudflare **Redirect Rule**: `www.chrismichaelharris.com/*` → `https://chrismichaelharris.com/$1` (301).
  - One post shows **exactly one** video embed; covers render.

### 3.3 — Turn the Cloudflare proxy ON (your item #4)
Grey-cloud was only for cert issuance. Now enable the CDN/WAF/DDoS/caching — a real gain given Railway is single-region `us-west2`.
- Cloudflare DNS → toggle **apex and www to Proxied (orange cloud).**
- Confirm **SSL/TLS mode is `Full (strict)`** (set in 0.9).
- Recommended while you're there: **Always Use HTTPS = On**; **Auto Minify off** (Next already optimizes); caching leave default (Next sets cache headers; don't "Cache Everything" the HTML or you'll serve stale pages — the default "Standard" respects origin headers).
- **→ VERIFY (this is the loop check):**
  ```
  curl -sIL https://chrismichaelharris.com/ | grep -iE "HTTP/|server|cf-ray"
  ```
  Expect a single `200` (at most one 301 http→https), a `cf-ray` header (proxy active), **no redirect loop**. Re-check `/blog/`, a post, and a legacy 301. If you see `ERR_TOO_MANY_REDIRECTS`, SSL mode is not `Full (strict)` — fix that, don't revert DNS.

⛔ **ROLLBACK POINT B** — if anything in 3.2/3.3 is wrong and unfixable quickly: set apex/www back to **grey cloud**, then to the **SiteGround `A`**. You're back on WordPress within one TTL (~5 min). SiteGround is still live and reachable via the temp URL.

### 3.4 — Re-confirm email + subdomains survived
- **→ VERIFY:** re-run the 0.2 and 0.3 `dig` commands. `MX`, SPF, DMARC output must be **byte-identical** to the pre-flight capture. `programs.` and `courses.` still resolve to SiteGround and load.
- Send a test email to the domain and confirm it arrives.

---

## 4. Post-cutover

### 4.1 — Search Console
- In [Google Search Console](https://search.google.com/search-console), the property for `chrismichaelharris.com` (Domain property preferred — covers http/https/www).
- **Sitemaps → add `https://chrismichaelharris.com/sitemap.xml` → Submit.**
- **URL Inspection** on 3–4 key URLs (home, top post, `/blog/`) → **Request indexing**.
- Confirm the **old→new 301s** are seen: inspect a legacy URL; it should report the redirect target.
- If you have a **Bing Webmaster** account, submit the sitemap there too.

### 4.2 — Analytics / Ads
- Confirm GA4 realtime shows traffic on the live domain; confirm the Google Ads conversion tag fires (test a Calendly-modal open / form submit).

### 4.3 — Keep WordPress alive **and frozen** for 30 days
- Do **not** cancel SiteGround or delete the WP install during the rollback window. Keep the temp URL working. After ~30 days of stable rankings/traffic, decommission (and delete the now-dead `programs.`/`courses.` records + installs then).
- ⚠️ **Do NOT migrate SiteGround accounts/servers during the window.** A new SiteGround account is planned — **hold it.** Rollback works by pointing DNS back at the SiteGround server that hosts WordPress *right now* (the IP captured in 0.1). If WordPress moves to a new server mid-window, that IP changes and **your rollback target moves out from under you** — the captured baseline would point at the old, now-empty server. Correct order:
  1. **Cut over** (this runbook).
  2. **Hold the current SiteGround as-is for 30 days** — same account, same server, temp URL live.
  3. **After** the window closes and the new site is proven, **then** migrate/close SiteGround.
- If the account move is truly unavoidable mid-window: it invalidates the rollback plan, so first re-capture the new server IP, confirm WP serves there via a fresh temp URL, and update 0.1's baseline — treat it as re-doing pre-flight. Cleaner to just wait.

---

## 5. What to watch (first two weeks)

- **Search Console → Coverage/Pages:** watch for a spike in **404s** (a legacy URL with no 301) or **"Redirect error."** Any 404 that used to rank → add it to `migration/redirect-map.json` and ship. Expect indexed-page count to dip briefly then recover.
- **Search Console → Performance:** impressions/clicks will wobble for ~1–2 weeks (normal migration turbulence). Watch for a **sustained** drop, not day-to-day noise. Compare 2-week-after vs 2-week-before.
- **Crawl stats:** Google recrawling the 301s — that's how equity transfers. `programs.`/`courses.` should be untouched.
- **The noindex archive (139 posts):** confirm they stay **out** of the index (they're `noindex` + not in the sitemap) but remain reachable — no "Submitted URL marked noindex" *errors* (they're not submitted, so this should be clean).
- **Core Web Vitals / uptime:** with the proxy on, Cloudflare caching should improve TTFB outside us-west2. Watch Railway metrics for origin load.
- **Email deliverability:** send/receive a few real emails over the first days; check nothing landed in spam (SPF/DKIM/DMARC unchanged, so it shouldn't — but verify).
- **Broken internal links:** the related-posts block + in-body links now all resolve on-domain; spot-check a few.

---

## Quick rollback (any time in the window)
1. Cloudflare DNS → apex + www → **grey cloud (DNS only)**.
2. Set apex `A` back to the **SiteGround IP** (from 0.1); set `www` back to its prior value.
3. Within ~5 min (TTL 300) the domain serves WordPress again.
4. MX/email and the two subdomains were never changed, so nothing to restore there.
