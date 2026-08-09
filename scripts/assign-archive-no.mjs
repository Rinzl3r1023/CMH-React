#!/usr/bin/env node
// Assign a stable archive number to every post, frozen in frontmatter.
// Ordering: datePublished ASCENDING — the oldest post is 001, newest is highest;
// zero-padding to 3 digits happens at render (gen-covers), the stored value is an
// integer. Numbers are assigned ONCE and never renumbered: a post that already has
// archive_no keeps it, and posts without one are appended after the current max
// (still date-ascending among themselves). So a new publish becomes 211, 212, …
// regardless of its date — a descending scheme would churn all 210 images each time.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const POSTS = path.join(process.cwd(), 'content', 'posts');
const slugs = fs.readdirSync(POSTS).filter((s) => fs.existsSync(path.join(POSTS, s, 'index.mdx')));

const entries = slugs.map((slug) => {
  const raw = fs.readFileSync(path.join(POSTS, slug, 'index.mdx'), 'utf8');
  const { data } = matter(raw);
  const d = data.date instanceof Date ? data.date.toISOString() : String(data.date ?? '');
  return { slug, raw, date: d, existing: Number.isInteger(data.archive_no) ? data.archive_no : null };
});

let max = entries.reduce((m, e) => (e.existing != null && e.existing > m ? e.existing : m), 0);
// unassigned, oldest first (slug as a deterministic tiebreak on identical timestamps)
const unassigned = entries
  .filter((e) => e.existing == null)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slug < b.slug ? -1 : 1));
for (const e of unassigned) e.assign = ++max;

let written = 0;
for (const e of entries) {
  if (e.existing != null) continue; // frozen — never renumber
  // insert `archive_no: N` right after the slug: line (or after title: as fallback)
  const lines = e.raw.split('\n');
  const fmEnd = lines.indexOf('---', 1);
  let at = lines.findIndex((l, i) => i > 0 && i < fmEnd && /^slug:/.test(l));
  if (at < 0) at = lines.findIndex((l, i) => i > 0 && i < fmEnd && /^title:/.test(l));
  lines.splice(at + 1, 0, `archive_no: ${e.assign}`);
  fs.writeFileSync(path.join(POSTS, e.slug, 'index.mdx'), lines.join('\n'));
  written++;
}

const all = entries.map((e) => ({ slug: e.slug, no: e.existing ?? e.assign, date: e.date })).sort((a, b) => a.no - b.no);
console.log(`assign-archive-no: ${written} newly numbered, ${entries.length} total, max=${max}`);
console.log(`  001 = ${all[0].slug} (${all[0].date.slice(0, 10)})`);
console.log(`  ${String(max).padStart(3, '0')} = ${all[all.length - 1].slug} (${all[all.length - 1].date.slice(0, 10)})`);
