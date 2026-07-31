#!/usr/bin/env node
// One-time migration: pull post images from the live WordPress site into the repo
// (§3.3). Crawls each post URL, extracts every /wp-content/uploads/ reference,
// resolves the ORIGINAL (strips WordPress dimension crops like -400x250, falls
// back to -scaled then the raw filename), downloads into content/posts/<slug>/,
// and reports any that fail to resolve. Migrating the crops instead of originals
// locks every generated size to a thumbnail forever — so this pulls originals.
//
// Usage:
//   node scripts/migrate-images.mjs --base https://chrismichaelharris.com \
//        --slugs 3-layer-ai-architecture,ai-lead-follow-up,...
//   (or --slugs-file path/to/slugs.txt, one slug per line)
//
// The authoritative slug inventory comes from Search Console + the WP export
// (§1.1) — do NOT rely on the 10 slugs currently scaffolded as placeholders.
//
// GATE: this must resolve every image before WordPress is decommissioned.
// Decommissioning with /wp-content/uploads/ still referenced 404s every image on
// every post (§3.3). The script exits non-zero if any image fails.

import fs from 'node:fs';
import path from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const BASE = arg('base');
const slugsArg = arg('slugs');
const slugsFile = arg('slugs-file');

if (!BASE || (!slugsArg && !slugsFile)) {
  console.error('Required: --base <site-url> and --slugs a,b,c (or --slugs-file file)');
  process.exit(2);
}

const slugs = (slugsFile ? fs.readFileSync(slugsFile, 'utf-8').split('\n') : slugsArg.split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'content', 'posts');

// Strip a trailing WordPress dimension suffix: foo-400x250.jpg -> foo.jpg
function stripDimensions(url) {
  return url.replace(/-\d+x\d+(\.[a-zA-Z0-9]+)(?:\?.*)?$/, '$1');
}
function withScaled(url) {
  return url.replace(/(\.[a-zA-Z0-9]+)$/, '-scaled$1');
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveOriginal(url) {
  // Preference order: original (no crop) -> -scaled -> the raw url as referenced.
  const original = stripDimensions(url);
  if (await head(original)) return original;
  const scaled = withScaled(original);
  if (await head(scaled)) return scaled;
  if (await head(url)) return url;
  return null;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function migratePost(slug) {
  const postUrl = `${BASE.replace(/\/$/, '')}/${slug}/`;
  const failures = [];
  let res;
  try {
    res = await fetch(postUrl);
  } catch (e) {
    return { slug, ok: false, failures: [`fetch ${postUrl}: ${e.message}`], images: [] };
  }
  if (!res.ok) return { slug, ok: false, failures: [`fetch ${postUrl}: ${res.status}`], images: [] };
  const html = await res.text();

  const uploads = [...new Set([...html.matchAll(/https?:\/\/[^"'\s)]+\/wp-content\/uploads\/[^"'\s)]+/g)].map((m) => m[0]))];
  const dir = path.join(POSTS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });

  const images = [];
  for (const ref of uploads) {
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(ref)) continue;
    const original = await resolveOriginal(ref);
    if (!original) {
      failures.push(ref);
      continue;
    }
    const filename = path.basename(new URL(original).pathname);
    const dest = path.join(dir, filename);
    try {
      await download(original, dest);
      images.push({ ref, original, filename });
    } catch (e) {
      failures.push(`${original}: ${e.message}`);
    }
  }
  return { slug, ok: failures.length === 0, failures, images };
}

async function main() {
  console.log(`Migrating images for ${slugs.length} post(s) from ${BASE}\n`);
  const results = [];
  for (const slug of slugs) {
    const r = await migratePost(slug);
    results.push(r);
    console.log(`${r.ok ? '✓' : '✗'} ${slug}: ${r.images.length} image(s)${r.failures.length ? `, ${r.failures.length} FAILED` : ''}`);
    r.failures.forEach((f) => console.log(`    ! ${f}`));
  }

  const failed = results.filter((r) => !r.ok);
  const totalImages = results.reduce((n, r) => n + r.images.length, 0);
  console.log(`\nDone: ${totalImages} image(s) across ${slugs.length} post(s).`);

  if (failed.length) {
    console.error(`\n${failed.length} post(s) had unresolved images. Do NOT decommission WordPress until every image resolves (§3.3).`);
    process.exit(1);
  }
  console.log('All images resolved. Remember to rewrite in-body references to the local filenames, then run sync-covers.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
