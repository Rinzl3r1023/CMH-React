#!/usr/bin/env node
// Build-time JSON-LD validation (§6.1). Runs as `postbuild`, after `next build`
// has written the prerendered HTML. For every prerendered page it:
//   1. extracts each <script type="application/ld+json"> block,
//   2. asserts it parses as valid JSON,
//   3. asserts one @graph per page and no duplicate @id within it,
//   4. asserts no node is missing its required fields (§1.2).
// Any failure prints the offending page + reason and exits non-zero, which fails
// `npm run build`. A clean run prints a one-line summary.

import fs from 'node:fs';
import path from 'node:path';

const APP_DIR = path.join(process.cwd(), '.next', 'server', 'app');

// Required fields per @type. A node missing any of these is a hard error.
const REQUIRED = {
  Person: ['name'],
  Organization: ['name'],
  WebSite: ['url'],
  WebPage: ['url'],
  ProfilePage: ['url', 'mainEntity'],
  CollectionPage: ['url'],
  BlogPosting: ['headline', 'datePublished', 'author', 'publisher'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  FAQPage: ['mainEntity'],
  HowTo: ['step'],
  BreadcrumbList: ['itemListElement'],
};

function walkHtml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function extractLdJson(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

const errors = [];
let pagesWithSchema = 0;
let nodeCount = 0;

for (const file of walkHtml(APP_DIR)) {
  const rel = path.relative(APP_DIR, file);
  const html = fs.readFileSync(file, 'utf-8');
  const blocks = extractLdJson(html);
  if (blocks.length === 0) continue;
  if (blocks.length > 1) {
    errors.push(`${rel}: ${blocks.length} ld+json scripts (expected one @graph per page).`);
  }
  pagesWithSchema += 1;

  for (const raw of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push(`${rel}: invalid JSON in ld+json — ${e.message}`);
      continue;
    }
    const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
    const ids = new Set();
    for (const node of graph) {
      nodeCount += 1;
      const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
      const id = node['@id'];
      if (id) {
        if (ids.has(id)) errors.push(`${rel}: duplicate @id "${id}".`);
        ids.add(id);
      }
      const req = REQUIRED[type];
      if (req) {
        for (const field of req) {
          const v = node[field];
          const missing = v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === '';
          if (missing) errors.push(`${rel}: ${type} missing required field "${field}".`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('\n✗ JSON-LD validation failed:\n');
  for (const e of errors) console.error('  - ' + e);
  console.error(`\n${errors.length} error(s). Failing the build.\n`);
  process.exit(1);
}

console.log(`✓ JSON-LD valid: ${nodeCount} node(s) across ${pagesWithSchema} page(s), no duplicate @id, no missing required fields.`);
