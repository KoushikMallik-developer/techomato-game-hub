// Runs after `vite build`: every built page must carry its own title, canonical link, body heading and valid JSON-LD.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { games } from './src/games/registry.js';

const pages = [['index.html', '/', 'Techomato Games'], ['leaderboard/index.html', '/leaderboard', 'Leaderboard'], ...games.map((g) => [`play/${g.id}/index.html`, `/play/${g.id}`, g.title])];
const titles = new Set();
for (const [file, route, name] of pages) {
  const h = fs.readFileSync(`dist/${file}`, 'utf8');
  const one = (re, what) => assert.equal((h.match(re) || []).length, 1, `${file}: exactly one ${what}`);
  one(/<title>/g, 'title'); one(/rel="canonical"/g, 'canonical'); one(/name="description"/g, 'description'); one(/<h1>/g, 'h1');
  assert.match(h, new RegExp(`rel="canonical" href="[^"]*${route === '/' ? '/' : route}"`), `${file}: canonical is ${route}`);
  assert.ok(h.match(/<h1>(.*?)<\/h1>/)[1].includes(name), `${file}: h1 names ${name}`);
  for (const m of h.matchAll(/ld\+json">(.*?)<\/script>/g)) JSON.parse(m[1]);
  titles.add(h.match(/<title>(.*?)<\/title>/)[1]);
}
assert.equal(titles.size, pages.length, 'every page has its own title');
for (const f of ['sitemap.xml', 'robots.txt', 'og.jpg']) assert.ok(fs.existsSync(`dist/${f}`), f);
console.log('seo ok');
