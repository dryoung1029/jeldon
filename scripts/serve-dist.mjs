#!/usr/bin/env node
/**
 * Minimal static server for a built Astro `dist/` (trailingSlash: 'always'
 * layout: /pricing/ → dist/pricing/index.html). For local benchmark runs.
 *   node scripts/serve-dist.mjs <dist-dir> [port]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4321);
const types = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  let file = join(dir, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  else if (!existsSync(file) && existsSync(join(dir, p, 'index.html'))) file = join(dir, p, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const nf = join(dir, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(existsSync(nf) ? readFileSync(nf) : 'Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
