#!/usr/bin/env node
// Build step: post covers are co-located with their post (content/posts/<slug>/cover.jpg,
// §2.1/§3.1), but next/image serves from /public. This copies each cover into
// /public/post-covers and records its dimensions in manifest.json, which lib/posts.ts
// reads so ResponsiveImage can emit correct srcset/sizes (§3.2). Runs in `prebuild`.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const OUT_DIR = path.join(ROOT, 'public', 'post-covers');
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'cover.avif'];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};

  const slugs = fs.existsSync(POSTS_DIR)
    ? fs.readdirSync(POSTS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  for (const slug of slugs) {
    const dir = path.join(POSTS_DIR, slug);
    const coverName = COVER_NAMES.find((n) => fs.existsSync(path.join(dir, n)));
    if (!coverName) continue;

    const src = path.join(dir, coverName);
    const ext = path.extname(coverName);
    const outName = `${slug}${ext}`;
    fs.copyFileSync(src, path.join(OUT_DIR, outName));

    const meta = await sharp(src).metadata();
    manifest[slug] = {
      src: `/post-covers/${outName}`,
      width: meta.width ?? 1200,
      height: meta.height ?? 675,
    };
    console.log(`cover: ${slug} -> /post-covers/${outName} (${meta.width}x${meta.height})`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`sync-covers: ${Object.keys(manifest).length} cover(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
