#!/usr/bin/env node
// Generate the "Index" cover (Direction B, exactly as Claude Design mocked it) for
// every post. The cover is: generated abstract art deterministically hashed off the
// slug (8 CSS-gradient treatments — horizon, rings, grid floor, arc, bars, wedge,
// orbit, scan), the archive numeral (top-right, Fraunces 300, amber .30), and the
// small CMH mark (bottom-left). No title, no year, no category — the card UI already
// prints title + date. A post with a real `cover:` in frontmatter overrides.
//
// The treatments use calc()/repeating-radial-gradient, which satori can't render, so
// covers are rendered with the real CSS in headless Chromium (playwright-core, using
// the environment's pre-installed browser). Because the build host has no browser,
// this runs LOCALLY (`npm run gen:covers`) and the PNGs are committed; sync-covers +
// next/image do the rest at build. Re-run it whenever a post is added.
//
// Numbering note: the mock numbered `total - i` (descending, 71 posts). Per the
// explicit revision it's replaced by frontmatter `archive_no` — ascending by
// datePublished across all 210, frozen (see scripts/assign-archive-no.mjs).

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const ROOT = process.cwd();
const POSTS = path.join(ROOT, 'content', 'posts');
const FONTS = path.join(ROOT, 'public', 'fonts');
const CHROME = process.env.PW_CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));

const b64 = (f) => fs.readFileSync(path.join(FONTS, f)).toString('base64');
const FRAUNCES_300 = b64('9e513b22-fd3a-490c-a9a8-b9d281672416.woff2'); // normal 300, Latin
const MANROPE_600 = b64('0f74e651-3f4f-40bb-9877-31cfdbb13a26.woff2'); // normal 600, Latin

// The 8 treatments, verbatim from the mock's Component.ART.
const ART = [
  'background:radial-gradient(ellipse 60% 82% at 50% 106%, rgba(232,163,61,.45), transparent 68%), linear-gradient(0deg, transparent calc(32% - 1px), rgba(232,163,61,.55) 32%, transparent calc(32% + 1px)), #05050A;',
  'background:repeating-radial-gradient(circle at 80% 120%, rgba(232,163,61,.20) 0 1px, transparent 1px 32px), radial-gradient(circle at 80% 120%, rgba(232,163,61,.26), transparent 62%), #05050A;',
  'background:repeating-linear-gradient(90deg, rgba(232,163,61,.13) 0 1px, transparent 1px 42px), repeating-linear-gradient(180deg, rgba(232,163,61,.09) 0 1px, transparent 1px 42px), radial-gradient(ellipse 78% 62% at 50% 104%, rgba(232,163,61,.24), transparent 70%), #05050A;',
  'background:radial-gradient(circle at 108% 50%, transparent 0 40%, rgba(232,163,61,.45) 40% calc(40% + 2px), transparent calc(40% + 2px)), radial-gradient(circle at 108% 50%, rgba(232,163,61,.16), transparent 58%), #05050A;',
  'background:repeating-linear-gradient(90deg, rgba(232,163,61,.10) 0 1px, transparent 1px 24px), linear-gradient(90deg, rgba(232,163,61,.28), transparent 26%), #05050A;',
  'background:linear-gradient(135deg, rgba(232,163,61,.34), transparent 44%), linear-gradient(315deg, rgba(232,163,61,.10), transparent 40%), #05050A;',
  'background:radial-gradient(circle at 28% 42%, rgba(232,163,61,.85) 0 4px, transparent 4px), radial-gradient(circle at 28% 42%, transparent 0 42px, rgba(232,163,61,.34) 42px calc(42px + 1px), transparent calc(42px + 1px)), radial-gradient(circle at 28% 42%, rgba(232,163,61,.15), transparent 60%), #05050A;',
  'background:repeating-linear-gradient(180deg, rgba(232,163,61,.08) 0 2px, transparent 2px 11px), linear-gradient(180deg, rgba(232,163,61,.24), transparent 58%), #05050A;',
];

// mock hash: h = (h*31 + charCode) >>> 0
function hash(slug) { let h = 0; for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0; return h; }

const REF_W = 349; // mock card-cover width (1180px container, 44px pad, 3 cols, 22px gap)

function pageHtml(num, artCss) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Fraunces';font-style:normal;font-weight:300;src:url(data:font/woff2;base64,${FRAUNCES_300}) format('woff2');}
    @font-face{font-family:'Manrope';font-style:normal;font-weight:600;src:url(data:font/woff2;base64,${MANROPE_600}) format('woff2');}
    *{margin:0;box-sizing:border-box;}
    html,body{background:transparent;}
    .cover{position:relative;width:${REF_W}px;aspect-ratio:16/9;overflow:hidden;}
    .art{position:absolute;inset:0;${artCss}}
    .num{position:absolute;z-index:2;right:16px;top:10px;font-family:'Fraunces',serif;font-weight:300;font-size:64px;line-height:1;color:rgba(232,163,61,.30);}
    .mark{position:absolute;left:14px;bottom:12px;display:flex;align-items:center;gap:7px;z-index:2;}
    .markbox{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;border:1px solid rgba(232,163,61,.55);color:#E8A33D;font-family:'Manrope',sans-serif;font-weight:600;font-size:8.5px;letter-spacing:.04em;}
  </style></head><body>
    <div class="cover"><div class="art"></div><span class="num">${num}</span><div class="mark"><span class="markbox">CMH</span></div></div>
  </body></html>`;
}

async function main() {
  if (!fs.existsSync(POSTS)) return;
  if (!CHROME) { console.error('gen-covers: no chromium binary found (set PW_CHROME).'); process.exit(1); }
  const slugs = fs.readdirSync(POSTS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: REF_W, height: Math.round((REF_W * 9) / 16) }, deviceScaleFactor: 1200 / REF_W });
  if (process.env.PREVIEW) { // render one sample per treatment for eyeballing
    for (let t = 0; t < ART.length; t++) {
      const num = String([1, 7, 42, 108, 150, 176, 199, 210][t]).padStart(3, '0');
      await page.setContent(pageHtml(num, ART[t]), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await (await page.$('.cover')).screenshot({ path: path.join(process.env.PREVIEW, `prev-${t}.png`), omitBackground: true });
    }
    await browser.close(); console.log('preview: wrote prev-0..7.png'); return;
  }
  let n = 0, skipped = 0, missing = 0;
  for (const slug of slugs) {
    const mdx = path.join(POSTS, slug, 'index.mdx');
    if (!fs.existsSync(mdx)) continue;
    const { data } = matter(fs.readFileSync(mdx, 'utf8'));
    if (data.cover) { skipped++; continue; }
    if (!Number.isInteger(data.archive_no)) { missing++; console.warn(`gen-covers: ${slug} has no archive_no — skipped`); continue; }
    const num = String(data.archive_no).padStart(3, '0');
    await page.setContent(pageHtml(num, ART[hash(slug) % ART.length]), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('.cover');
    const shot = await el.screenshot({ omitBackground: true });
    // re-compress losslessly (level 9) — the raw screenshot PNG is ~3.5x larger
    await sharp(shot).png({ compressionLevel: 9, effort: 10 }).toFile(path.join(POSTS, slug, 'cover.png'));
    n++;
  }
  await browser.close();
  console.log(`gen-covers: ${n} cover(s) rendered${skipped ? `, ${skipped} overridden by frontmatter cover` : ''}${missing ? `, ${missing} MISSING archive_no` : ''}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
