# Chris Michael Harris — site

WordPress → React migration. Next.js (App Router) on Railway. The five v6 pages
are ported from the design exports element-for-element; the design is **frozen at
v6** (see the build handoff §9). Only routing, integrations, assets, accessibility,
and performance are in scope — no copy or layout changes.

## Stack

- **Next.js 16 / React 19**, TypeScript, App Router
- **Static generation** for pages and posts; server route handlers for the
  secret-holding integrations (Kit, YouTube)
- **sharp** (via `next/image`) for responsive post images — AVIF → WebP → JPEG at
  400 / 800 / 1200 / 1600
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
   the live URL (URL preservation, §1).
2. Drop `cover.jpg` in the same folder. `npm run build` runs `sync-covers`
   automatically; `ResponsiveImage` handles the rest.
3. `youtube_id` in frontmatter → the video embeds in the post body. Omit it for
   text-only posts.
4. One post with `featured: true` fills the featured block; otherwise the newest.

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

The July audit batch is applied: nav CTA → "Book a 20-min call"; Home/About/
Dispatch/The Show copy + structure revisions; "Library" retired to "The Show";
Dispatch got the standard nav; The Show uses "Load more" (sitemap carries crawl
discovery); proof cards lost their photos; the Home coaching CTA is now
"Learn more" (page-qualifies, not application). Images live under `/public/images`.

**Blocked on inputs (owner) — rendered as visible placeholders:**

- **Chris's Calendly link** → `NEXT_PUBLIC_CALENDLY_URL`. The nav "Book a 20-min
  call" CTA falls back to the on-page `#capture` form until set. Must be an event
  on **Chris's** account, not Kim's (bookings currently default to hers).
- **TBL coaching page URL** → `NEXT_PUBLIC_COACHING_URL` (Home "Learn more" CTA;
  same `#capture` fallback).
- **Proof-card titles:** Katy M. and Clint W. render `[title needed]` (Katy:
  financial advisor vs bookkeeping expert; Clint: crypto key recovery / Founder).
- **Kit** — the account (The Business Lounge) has **no dedicated "The Dispatch"
  form or welcome sequence** yet. Create a Dispatch form → `KIT_FORM_ID`, and
  optionally a welcome sequence → `KIT_WELCOME_SEQUENCE_ID`. Launch gate: nobody
  goes live until a real submission lands in Kit (§6.2). The endpoint handles
  honeypot, IP rate-limiting, and the already-subscribed case.
- **YouTube** API key → `YOUTUBE_API_KEY` + a playlist id; and the long-form
  count (start-flat vs load-more on first paint). The Watch shelf is flat.
- **Three images:** Home hero portrait, About full-width hero, About "I don't
  coach alone" — all render placeholder boxes; drop files into `/public/images`
  or co-locate post covers, commit, deploy.
- **Belief #2 / "scout" retirement:** applied per Tarvis's recommendation
  (pending Chris's confirm).
- **Content** real post bodies + image originals + the keep/rewrite/kill 301 map,
  from the WP export + Search Console inventory (§10, Phase 2). 10 placeholders
  stand in.
- **Assets:** `public/images/og-card.png` (1200×630) is an on-brand placeholder.
