#!/usr/bin/env node
// Build step: post covers are co-located with their post (content/posts/<slug>/cover.jpg,
// §2.1/§3.1). This copies each cover into /public/post-covers AND pre-generates a
// small set of responsive WebP variants (/public/post-covers/gen/<slug>-<w>.webp),
// recording both in manifest.json, which lib/posts.ts reads so ResponsiveImage can
// emit a static <picture> srcset (§3.2). Runs in `prebuild`.
//
// Why pre-generate instead of next/image at runtime: covers are already fixed-size
// static assets (1200-wide Index covers). Sending them through the runtime
// /_next/image optimizer cost ~1s of cold AVIF encoding per image on Railway's
// ephemeral disk (the image cache is wiped on every deploy/restart), landing
// straight on LCP. Encoding once at build and serving the WebP files directly
// removes the optimizer from the hot path entirely, and never upscales past the
// source width. WebP (not AVIF) keeps the build fast and covers 96%+ of browsers;
// the original file stays as the universal <img> fallback.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import matter from 'gray-matter';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const OUT_DIR = path.join(ROOT, 'public', 'post-covers');
const GEN_DIR = path.join(OUT_DIR, 'gen');
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'cover.avif'];
// Widths to pre-render. Covers display at ≤760px (hero) / ≤240px (related card);
// with 2x DPR that tops out around the source width, so we never generate above it.
const VARIANT_WIDTHS = [400, 800, 1200];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(GEN_DIR, { recursive: true });
  const manifest = {};
  const missing = [];
  let variantCount = 0;

  const slugs = fs.existsSync(POSTS_DIR)
    ? fs.readdirSync(POSTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  for (const slug of slugs) {
    const dir = path.join(POSTS_DIR, slug);
    const mdx = path.join(dir, 'index.mdx');
    if (!fs.existsSync(mdx)) continue; // not a post folder
    const coverName = COVER_NAMES.find((n) => fs.existsSync(path.join(dir, n)));
    if (!coverName) {
      // Fail-closed: every post must have a cover. Covers are generated locally
      // (`npm run gen:covers`) and committed — a missing one means that step was
      // skipped, and we must not ship a placeholder silently. A post may opt out
      // only with an explicit `cover:` in frontmatter (author supplies their own).
      const { data } = matter(fs.readFileSync(mdx, 'utf8'));
      if (!data.cover) missing.push(slug);
      continue;
    }

    const src = path.join(dir, coverName);
    const ext = path.extname(coverName);
    const outName = `${slug}${ext}`;
    fs.copyFileSync(src, path.join(OUT_DIR, outName));

    const meta = await sharp(src).metadata();
    const srcWidth = meta.width ?? 1200;

    // Pre-render WebP variants at each width up to the source width (never upscale).
    // Always include a variant at the source width so the largest slot is covered.
    const widths = [...new Set(VARIANT_WIDTHS.filter((w) => w < srcWidth).concat(srcWidth))].sort((a, b) => a - b);
    const variants = [];
    for (const w of widths) {
      const vName = `${slug}-${w}.webp`;
      await sharp(src).resize({ width: w }).webp({ quality: 78 }).toFile(path.join(GEN_DIR, vName));
      variants.push({ w, webp: `/post-covers/gen/${vName}` });
      variantCount += 1;
    }

    manifest[slug] = {
      src: `/post-covers/${outName}`,
      width: srcWidth,
      height: meta.height ?? 675,
      variants,
    };
    console.log(`cover: ${slug} -> /post-covers/${outName} (${srcWidth}x${meta.height}) +${variants.length} webp`);
  }

  if (missing.length) {
    console.error(`\nsync-covers: ${missing.length} post(s) missing a cover:\n  ${missing.join('\n  ')}\n` +
      `Run \`npm run gen:covers\` and commit the generated cover.png(s), or set an explicit \`cover:\` in frontmatter.`);
    process.exit(1);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`sync-covers: ${Object.keys(manifest).length} cover(s), ${variantCount} webp variant(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
