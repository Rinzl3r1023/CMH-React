#!/usr/bin/env node
// Build step: derive responsive AVIF/WebP/JPEG variants from the committed site
// images (hero portrait, About images, §7.1). Each source under /public/images
// (top-level, e.g. chris-portrait.jpg) becomes /public/images/gen/<name>-<w>.<fmt>
// at a set of widths, never upscaled past the source. The committed q85 JPEG is
// the single source of truth; sharp derives everything else, so nothing is
// re-compressed by hand downstream. Runs in `prebuild`; no-ops if no sources.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'public', 'images');
const OUT_DIR = path.join(SRC_DIR, 'gen');
const WIDTHS = [400, 561, 800, 1122, 1600];
// Sources to skip: the OG card (fixed-size, not responsive) and anything already
// generated.
const SKIP = new Set(['og-card.png']);

async function main() {
  if (!fs.existsSync(SRC_DIR)) return;
  const sources = fs
    .readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(jpe?g|png)$/i.test(e.name) && !SKIP.has(e.name));

  if (sources.length === 0) {
    console.log('gen-site-images: no source images yet — skipping.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;

  for (const entry of sources) {
    const src = path.join(SRC_DIR, entry.name);
    const base = entry.name.replace(/\.[^.]+$/, '');
    const meta = await sharp(src).metadata();
    const maxW = meta.width ?? 0;
    // Never upscale; always include the native width so the largest variant is sharp.
    const widths = [...new Set(WIDTHS.filter((w) => w <= maxW).concat(maxW))].sort((a, b) => a - b);

    for (const w of widths) {
      const pipe = sharp(src).resize({ width: w, withoutEnlargement: true });
      await pipe.clone().avif({ quality: 55 }).toFile(path.join(OUT_DIR, `${base}-${w}.avif`));
      await pipe.clone().webp({ quality: 80 }).toFile(path.join(OUT_DIR, `${base}-${w}.webp`));
      await pipe.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT_DIR, `${base}-${w}.jpg`));
      count += 3;
    }
    console.log(`gen-site-images: ${entry.name} (${maxW}px) -> widths ${widths.join(', ')}`);
  }
  console.log(`gen-site-images: ${count} variant(s) written to /public/images/gen.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
