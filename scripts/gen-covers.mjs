#!/usr/bin/env node
// Build step: generate an on-brand title-card cover for every post from its
// frontmatter title + year (no per-post artwork to migrate). Dark→amber radial,
// Fraunces Roman title at a fixed size (line count grows, clamped at 4), a
// JetBrains-Mono year eyebrow matching the site date-stamp, and the CMH mark.
// Writes content/posts/<slug>/cover.png (gitignored, regenerated each build);
// sync-covers.mjs then co-locates it and next/image derives responsive sizes.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = process.cwd();
const POSTS = path.join(ROOT, 'content', 'posts');
const ASSETS = path.join(ROOT, 'scripts', 'cover-assets');
const roman = fs.readFileSync(path.join(ASSETS, 'fraunces-roman.ttf'));
const manrope = fs.readFileSync(path.join(ASSETS, 'manrope-600.ttf'));
const mono = fs.readFileSync(path.join(ASSETS, 'jetbrains-mono.ttf'));

const SIZE = 58; // FIXED across every card — consistency is the point
const h = (type, props, ...kids) => ({ type, props: { ...props, children: kids.length <= 1 ? kids[0] : kids } });
const titleize = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function card(title, year) {
  const primary = String(title).split('|')[0].trim();
  return h('div', { style: { position: 'relative', width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', background: 'radial-gradient(120% 92% at 50% 120%, #2a1c07 0%, #12100a 44%, #0d0b10 72%)', padding: '64px 72px', fontFamily: 'Manrope' } },
    h('div', { style: { position: 'absolute', top: 60, left: 72, display: 'flex', alignItems: 'center', gap: 13, color: '#F0A93C' } },
      h('div', { style: { width: 11, height: 11, background: '#F0A93C', boxShadow: '0 0 16px 3px rgba(240,169,60,.8)' } }),
      h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, letterSpacing: 4 } }, String(year))),
    h('div', { style: { display: 'flex', fontFamily: 'Fraunces', fontWeight: 400, fontSize: SIZE, lineHeight: 1.14, color: '#F4EFE7', letterSpacing: -0.5, maxWidth: 1010, marginTop: 16, lineClamp: 4 } }, primary),
    h('div', { style: { position: 'absolute', bottom: 58, left: 72, display: 'flex', alignItems: 'center', gap: 15 } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 50, height: 50, border: '1px solid rgba(240,169,60,.55)', color: '#F0A93C', fontFamily: 'Manrope', fontWeight: 600, fontSize: 16, letterSpacing: 1 } }, 'CMH'),
      h('div', { style: { display: 'flex', color: '#8A8378', fontFamily: 'Manrope', fontWeight: 600, fontSize: 17, letterSpacing: 3, textTransform: 'uppercase' } }, 'chrismichaelharris.com')));
}

async function render(title, year) {
  const svg = await satori(card(title, year), { width: 1200, height: 630, fonts: [
    { name: 'Fraunces', data: roman, weight: 400, style: 'normal' },
    { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' },
    { name: 'Manrope', data: manrope, weight: 600, style: 'normal' },
  ] });
  return new Resvg(svg).render().asPng();
}

async function main() {
  if (!fs.existsSync(POSTS)) return;
  const slugs = fs.readdirSync(POSTS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  let n = 0;
  for (const slug of slugs) {
    const mdx = path.join(POSTS, slug, 'index.mdx');
    if (!fs.existsSync(mdx)) continue;
    const { data } = matter(fs.readFileSync(mdx, 'utf8'));
    const title = (data.title && String(data.title).trim()) || titleize(slug);
    const raw = data.date instanceof Date ? data.date.toISOString() : String(data.date ?? '');
    const year = (raw.match(/(\d{4})/) || [])[1] || '';
    fs.writeFileSync(path.join(POSTS, slug, 'cover.png'), await render(title, year));
    n++;
  }
  console.log(`gen-covers: ${n} cover(s) generated.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
