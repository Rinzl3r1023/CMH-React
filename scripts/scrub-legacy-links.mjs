#!/usr/bin/env node
// One-time migration transform (auditable/regeneratable, not hand-maintained):
// scrubs legacy WordPress cruft and re-targets in-body links across every migrated
// post so nothing dead-ends when the old site goes dark. Applied once after Phase 2;
// kept in-tree as the record of exactly what was removed/rewritten and why.
//
// Rules (per the migration decisions):
//   • Retired lead-magnet button labels (plain-text Divi buttons) -> removed.
//   • Orphaned decorative-image "Photo by … on …" credit lines      -> removed.
//   • Broken promo sentences left after a link was stripped mid-line -> removed.
//   • Cross-brand (kimberlyannjimenez.com) CTA lines                 -> removed.
//   • Retired-product CTAs (/startupu /elite /thevip /business-startup) -> removed;
//     /lounge (live Business Lounge via old shortlink)               -> repointed.
//   • calendly.com in-body links                                    -> de-linked
//     (anchor text kept; the themed end-of-post CallCTA owns booking).
//   • Cross-post links to MIGRATED posts   -> rewritten to relative /slug/.
//   • Cross-post links to NON-migrated posts + active affiliate shortlinks
//     (/shopify /99designs /Belay /itunes /pandora /va /onlinejobs)  -> de-linked.
//   • Any residual chrismichaelharris.com link                      -> de-linked.
//   • Dated promo-tag suffixes in title/seoTitle ([Canva Tutorial 2020],
//     [FREE TEMPLATE]) + their iframe-title echoes                  -> removed.
// Idempotent: re-running is a no-op once applied.
import fs from 'node:fs';
import path from 'node:path';

const POSTS = path.join(process.cwd(), 'content', 'posts');

// migrated cross-post targets: old CMH path (first segment) -> new relative URL
const XPOST = {
  'top-3-reasons-you-arent-getting-more-clients-and-customers': '/top-3-reasons-you-arent-getting-more-clients-and-customers/',
  'the-biggest-ai-mistake-business-owners-are-making-and-what-to-do-instead': '/3-layer-ai-architecture/',
  'claude-ai-executive-coach': '/claude-ai-executive-coach/',
  'hiring-a-virtual-assistant-outsourcing': '/hiring-a-virtual-assistant-outsourcing/',
  'market-sophistication-levels': '/market-sophistication-levels/',
  'how-to-differentiate-your-offer': '/how-to-differentiate-your-offer/',
  'ai-lead-follow-up': '/ai-lead-follow-up/',
};
const ACTIVE = ['shopify', '99designs', 'belay', 'itunes', 'pandora', 'va', 'onlinejobs'];
const DEAD404 = ['the-garmin-vivosmart-5-compares-to-the-vivosmart-4-and-venu-sq', 'why-i-sold-my-ooler', 'garmin-venu-sq-review-unboxing-track-health-and-fitness', 'voxer-walkie-talkie-app-review-2022', 'ep79'];
const RETIRED_BLOCK = ['startupu', 'elite', 'thevip'];

const stats = {};
const bump = (k) => (stats[k] = (stats[k] || 0) + 1);

function delinkLinks(md, urlRe, tag) {
  return md.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (m, text, url) => (urlRe.test(url) ? (bump(tag), text) : m));
}
function rewriteLinks(md, map, tag) {
  return md.replace(/\[([^\]]*)\]\(https?:\/\/(?:www\.)?chrismichaelharris\.com\/([^/)?#]+)\/?[^)]*\)/gi, (m, text, seg) => {
    for (const k of Object.keys(map)) if (k.toLowerCase() === seg.toLowerCase()) return (bump(tag), `[${text}](${map[k]})`);
    return m;
  });
}

function cleanBody(md) {
  md = md.replace(/^#{0,6}\s*(?:join\s+the\s+7-day\s+reading\s+challenge!?|grab\s+my\s+biohacking\s+playbook|get\s+my\s+2020\s+must\s+read\s+list|snag\s+my\s+ultimate\s+startup\s+checklist)\s*$/gim, () => (bump('promo-label'), ''));
  md = md.replace(/^\s*\**\s*Photo by\b.*$/gim, () => (bump('photo-credit'), ''));
  md = md.replace(/^[^\n]*\b(?:download|grab|snag)\b[^\n]*\s{2,}[^\n]*\b(?:startup|checklist|playbook|pdf|program|must[- ]?have)\b[^\n]*$/gim, () => (bump('orphan-promo-sentence'), ''));
  md = md.replace(/^[^\n]*\b(?:download|grab|snag|check out|consider)\s+(?:my|your|the)\s*[.,][^\n]*$/gim, () => (bump('orphan-promo-sentence'), ''));
  md = md.replace(/^.*\]\(https?:\/\/(?:www\.)?kimberlyannjimenez\.com[^)]*\).*$/gim, () => (bump('kaj-line'), ''));
  {
    const re = new RegExp(String.raw`chrismichaelharris\.com\/(?:${RETIRED_BLOCK.join('|')})\b`, 'i');
    md = md.split(/\n{2,}/).filter((blk) => (re.test(blk) ? (bump('retired-block'), false) : true)).join('\n\n');
  }
  md = md.replace(/\s*\[[^\]]*\]\(https?:\/\/(?:www\.)?chrismichaelharris\.com\/business-startup\/?\)\./gi, () => (bump('retired-sentence'), ''));
  md = md.replace(/\(https?:\/\/(?:www\.)?chrismichaelharris\.com\/lounge\)/gi, () => (bump('lounge-repoint'), '(https://thebusinesslounge.co/)'));
  md = delinkLinks(md, /(?:www\.)?calendly\.com/i, 'calendly-delink');
  md = rewriteLinks(md, XPOST, 'xpost-rewrite');
  md = delinkLinks(md, new RegExp(String.raw`(?:www\.)?chrismichaelharris\.com\/(?:${DEAD404.join('|')})\b`, 'i'), 'xpost-404-delink');
  md = delinkLinks(md, new RegExp(String.raw`(?:www\.)?chrismichaelharris\.com\/(?:${ACTIVE.join('|')}|consultation)\b`, 'i'), 'affiliate-delink');
  md = delinkLinks(md, /(?:www\.)?chrismichaelharris\.com/i, 'residual-cmh-delink');
  md = md.replace(/^##\s*\(CANVA Tutorial 2020\)\s*$/gim, () => (bump('stray-heading'), ''));
  md = md.replace(/\[\s*\]\([^)]*\)/g, '').replace(/^\s*[>*-]\s*$/gm, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return md.trim() + '\n';
}

function cleanFrontmatter(fm) {
  return fm
    .replace(/(^title:\s*.*?)\s*\[Canva Tutorial 2020\]/im, (m, a) => (bump('title-bracket'), a))
    .replace(/(^seoTitle:\s*.*?)\s*\[FREE TEMPLATE\]/im, (m, a) => (bump('title-bracket'), a));
}

let changed = 0;
for (const slug of fs.readdirSync(POSTS)) {
  const file = path.join(POSTS, slug, 'index.mdx');
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) continue;
  const fm = cleanFrontmatter(m[1]);
  let body = m[2].replace(/ \[Canva Tutorial 2020\]/g, '').replace(/ \[FREE TEMPLATE\]/g, '');
  body = cleanBody(body);
  const out = `---\n${fm}\n---\n\n${body}`;
  if (out !== raw) { fs.writeFileSync(file, out); changed++; }
}
console.log('scrub-legacy-links: files changed', changed);
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
