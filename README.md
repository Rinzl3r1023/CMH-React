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
  show/                  /show        (The Show)  ported + live YouTube buckets
  dispatch/              /dispatch    (Dispatch)  ported from The Dispatch v6
  blog/                  /blog                    index (featured + grid + pagination)
  blog/page/[n]/         /blog/page/N             preserved WP pagination shape
  [slug]/                /<post-slug>             root-level post pages (MDX)
  api/subscribe/         POST → Kit (server-side, holds the key)
  sitemap.ts, robots.ts
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

**Blocked on inputs (owner):**

- **Kit** `KIT_API_KEY` + `KIT_FORM_ID` — launch gate: nobody goes live until a
  real submission lands in Kit (§6.2).
- **YouTube** API key + three playlist IDs; and the long-form video count —
  three buckets vs. start-flat (§4.2/§7 #2–3).
- **Content** real post bodies + image originals, from the WP export + Search
  Console inventory (§1.1, Phase 2). The 10 placeholders stand in for now.
- **§7 open decisions:** SPARC / AI-Services nav + 301s; Privacy / Terms pages;
  the `[role needed]` ×2 and `[X]` years placeholders; Matt's & Clint's sign-off.
- **Assets:** confirm `public/og-card.png` exists at 1200×630 (§5.1).
