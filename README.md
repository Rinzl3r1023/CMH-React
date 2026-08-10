# Chris Michael Harris — site

WordPress → React migration. Next.js (App Router) on Railway. The five v6 pages
are ported from the design exports element-for-element; the design is **frozen at
v6** (see the build handoff §9). Only routing, integrations, assets, accessibility,
and performance are in scope — no copy or layout changes.

## Stack

- **Next.js 16 / React 19**, TypeScript, App Router
- **Static generation** for pages and posts; server route handlers for the
  secret-holding integrations (Kit, YouTube)
- **sharp** for responsive post covers — pre-rendered to static WebP variants at
  400 / 800 / 1200 at build (`scripts/sync-covers.mjs`) and served directly via a
  `<picture>`, bypassing the runtime `/_next/image` optimizer (its cold AVIF encode
  was landing on LCP)
- **MDX in the repo** for blog content (`next-mdx-remote`), no CMS

## Local development

```bash
npm install
cp .env.example .env.local   # fill in as values become available
npm run dev                  # http://localhost:3000
```

## Project layout

```
src/app/                 routes
  page.tsx               /            (Home)      ported from Home v6
  about/                 /about                   ported from About v6
  dispatch/              /dispatch    (Dispatch)  ported from The Dispatch v6
  blog/                  /blog        (The Show)  the Library: Watch shelf + Read grid
  blog/page/[n]/         /blog/page/N             preserved WP pagination shape
  [slug]/                /<post-slug>             root-level post pages (MDX)
  api/subscribe/         POST → Kit (server-side, holds the key)
  sitemap.ts, robots.ts

Information architecture: the v6 "Library" page unifies video (Watch) and blog
(Read) into one destination. It lives at /blog to keep the blog's SEO equity and
is labelled "The Show" in the nav; the old /show 301s to /blog. There is no
separate Blog or Show nav item.
  globals.css            shared stylesheet, lifted verbatim from the v6 exports
  fonts.css              @font-face for the 18 self-hosted woff2 (see below)
  post.css               single-post article styling (net-new template)
src/pages-html/          cleaned static HTML fragments from the v6 exports
src/components/           Nav runtime, cards, pagination, image, YouTube shelves
src/lib/                 posts (MDX loader), youtube, metadata, site config
content/posts/<slug>/    index.mdx + cover.jpg  (co-located)
public/fonts/            18 woff2 extracted byte-for-byte from the v6 export
public/post-covers/      covers copied here at build + manifest.json (dimensions)
scripts/                 sync-covers (build step), migrate-images (one-time)
```

### Why the HTML fragments

The v6 exports are the spec, not a reference. Each page's body is ported
verbatim as a cleaned HTML fragment (`src/pages-html/*.html`) and injected
server-side, so the DOM and CSS match the design exactly. The only edits are the
punch-list ones: routing, the Kit form wiring, absolute `og:` tags, blog image
binding, and pagination. Repeated elements (blog card, show card) are React
components bound to data; once-only sections are left intact.

### Fonts

Fonts are **self-hosted** from `public/fonts` — the exact static instances
extracted from the export manifest. Pulling Fraunces from Google as a *variable*
font re-applied optical sizing and changed letter metrics, drifting text
wrapping and page height ~1.8%. Self-hosting the export's own files makes the
render pixel-match the design.

## Environment variables

See `.env.example`. Secrets are **never** committed and never reach client JS.

| var | purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | absolute origin for `og:`/canonical/sitemap |
| `KIT_API_KEY`, `KIT_FORM_ID` | Kit (ConvertKit) — server-side only |
| `YOUTUBE_API_KEY` | YouTube Data API — server-side only |
| `YOUTUBE_PLAYLIST_WHATS_NEXT` / `_WHAT_IT_MEANS` / `_FIELD_NOTES` | the three bucket playlists |

## Content workflow (blog)

1. `content/posts/<slug>/index.mdx` — frontmatter + body. `slug` **must** match
   the live URL (URL preservation, §1). Assign the next `archive_no`:
   `node scripts/assign-archive-no.mjs` (ascending by `datePublished`, frozen —
   existing numbers are never touched, the new post gets the next integer).
2. **Generate the cover — required step, do not skip:** `npm run gen:covers`.
   The "Index" cover (Direction B) is rendered from `archive_no` + the slug hash
   with headless Chromium (`playwright-core` + a local browser), so it runs
   **locally**, not in the Railway build. **Commit the generated `cover.png`
   alongside the post.** The build is fail-closed: `sync-covers` errors if any
   post lacks a cover (unless it sets an explicit `cover:` in frontmatter), so a
   skipped `gen:covers` fails the build rather than shipping a placeholder.
3. `youtube_id` in frontmatter → the video embeds in the post body. Omit it for
   text-only posts.
4. One post with `featured: true` fills the featured block; otherwise the newest.

Publish checklist: **write `index.mdx` → `assign-archive-no` → `gen:covers` →
commit (post + cover together) → push.**

Posts currently in `content/posts` are **placeholders** (`placeholder: true`),
using the real root slugs so routing/pagination are exercised. Their bodies are
replaced with real content in Phase 2.

## The Show (YouTube)

Buckets map to three hand-curated playlists — long-form only, Shorts excluded by
construction (§4.2). Until `YOUTUBE_API_KEY` and the playlist IDs are set, the
page renders the frozen v6 placeholder layout. The key stays server-side; results
are cached with 30-minute revalidation.

## Image migration (one-time, Phase 2)

```bash
node scripts/migrate-images.mjs --base https://chrismichaelharris.com \
     --slugs-file slugs.txt
```

Pulls **originals** (not WordPress crops), verifies every image resolves, and
exits non-zero if any fail. **Do not decommission WordPress until it passes** —
otherwise every `/wp-content/uploads/` reference 404s (§3.3).

## Deploy (Railway)

`npm run build` then `npm start` (binds `$PORT`). Set the env vars as Railway
service variables.

---

## Status — what's done vs. blocked

**Built (Phase 1):** all five pages ported; routing fixed; absolute `og:` +
`twitter:card` everywhere; MDX pipeline + root-slug routing; blog image binding +
real pagination; sharp images; server-side Kit and YouTube endpoints; sitemap /
robots; migration + cover scripts.

**Structured data (JSON-LD, replaces Yoast).** Hand-written `@graph` per page from
pure builders in `src/lib/schema/` (Person, Organization, WebSite, WebPage,
ProfilePage, CollectionPage, BlogPosting, VideoObject, FAQPage, HowTo,
BreadcrumbList), serialized by `components/JsonLd.tsx`. `@id`/`url` match the
site's non-trailing canonical exactly; `datePublished` comes from the post's
frontmatter (the WP export), never file mtime. VideoObject reuses the cached
`videos.list` path (no second API call) and fires for posts with a `youtube_id`.
FAQPage/HowTo are built but dormant — they emit only when a post's visible content
carries real `faq:`/`howto:` frontmatter. `npm run build` runs a `postbuild`
validator (`scripts/validate-schema.mjs`) that fails the build on invalid JSON,
duplicate `@id`, or a node missing required fields.

The July audit batch is applied: nav CTA → "Book a 20-min call"; Home/About/
Dispatch/The Show copy + structure revisions; "Library" retired to "The Show";
Dispatch got the standard nav; The Show uses "Load more" (sitemap carries crawl
discovery); proof cards lost their photos; the Home coaching CTA is now
"Learn more" (page-qualifies, not application). Images live under `/public/images`.

**Resolved (final values wired):** Calendly (`chris-chrismichaelharris/30min`, on
Chris's account) and the TBL coaching URL are baked as env-overridable defaults, so
the CTAs are live; labels updated to 30-min. Proof-card titles filled — Katy M. =
Financial Expert, Clint W. = Crypto Founder. No `[title needed]` placeholders remain.

**Blocked on inputs (owner) — rendered as visible placeholders:**

- **Images:** Home hero portrait ✅ (`chris-portrait.jpg`, 1122×1402) and About
  "I don't coach alone" ✅ (`about-coaching.jpg`) are in and wired through the
  sharp variant pipeline. Note: the coaching source arrived downscaled to
  2000×1250 (the 3238×2023 original was capped in transit) — ample for its ~520px
  slot, but drop the full-res original into `public/images/about-coaching.jpg` to
  upgrade the archival. The About full-width hero (`about-hero.jpg`) is also in and
  wired; the source arrived capped at 2000px (crown clips on 4K only — a better
  source is a drop-in replacement).
- **Content** real post bodies + image originals + the keep/rewrite/kill 301 map,
  from the WP export + Search Console inventory (§10, Phase 2). 10 placeholders
  stand in.

**Live (resolved):**

- **Kit** — `KIT_API_KEY` + `KIT_FORM_ID` set in Railway; launch gate closed (a
  real submission on the deployed site created a subscriber, and the Kit
  automation applied the CMH tag + enrolled the welcome sequence).
  `KIT_WELCOME_SEQUENCE_ID` is deliberately unused — onboarding is owned by that
  Kit automation, not `/api/subscribe` (see `.env.example`).
- **YouTube** — `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID` (`@HeyCMH`) set. The Watch
  shelf and the Home "CMH Show" block share one channel-driven, duration-filtered
  feed (long-form only, ≤3-min Shorts dropped).
- **Assets:** `public/images/og-card.png` (1200×630) is an on-brand placeholder.
