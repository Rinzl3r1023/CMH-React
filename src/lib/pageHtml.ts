import fs from 'node:fs';
import path from 'node:path';

// Static markup for the frozen v6 pages lives as pre-cleaned HTML fragments under
// src/pages-html (extracted from the design exports per §6.1, with routing fixed
// and design-tool directives removed). Read at build time on the server.
const DIR = path.join(process.cwd(), 'src', 'pages-html');

const cache = new Map<string, string>();

export function fragment(name: string): string {
  if (cache.has(name)) return cache.get(name)!;
  const html = fs.readFileSync(path.join(DIR, name), 'utf-8');
  cache.set(name, html);
  return html;
}

// Parse a saved root-div style string ("a:b; c:d") into a React style object.
export function rootStyle(name: string): React.CSSProperties {
  const raw = fs.readFileSync(path.join(DIR, name), 'utf-8').trim();
  const out: Record<string, string> = {};
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  }
  return out as React.CSSProperties;
}
