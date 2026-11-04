// SEO at build time. The site is a single-page app, so crawlers and link previews (which do not run JavaScript)
// would all see the home page's tags. This writes the home tags into index.html, one real HTML file per game
// (dist/play/<id>/index.html, which Vercel serves before the SPA rewrite), plus sitemap.xml and robots.txt.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const START = '<!--seo-->'; const END = '<!--/seo-->'; const BSTART = '<!--seo-body-->'; const BEND = '<!--/seo-body-->';
const li = (g) => `<li><a href="/play/${g.id}">${esc(g.title)}</a>: ${esc(g.tagline)}</li>`;

export default function seo(site) {
  const url = (p) => site + p;
  const tags = ({ title, desc, path: p, image, type = 'website', json = [] }) => `${START}
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url(p)}" />
    <meta property="og:site_name" content="Techomato Games" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url(p)}" />
    <meta property="og:image" content="${url(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${url(image)}" />
    ${json.map(ld).join('\n    ')}
    ${END}`;
  const load = async () => {
    const mod = (f) => import(pathToFileURL(path.join(process.cwd(), f)).href);
    const [{ games }, s, { SITE_NAME }] = await Promise.all([mod('src/games/registry.js'), mod('src/seo.js'), mod('src/config.js')]);
    return { games, s, SITE_NAME };
  };
  const home = ({ games, s, SITE_NAME }) => tags({
    title: s.HOME_TITLE, desc: s.HOME_DESC, path: '/', image: '/og.jpg',
    json: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: url('/'), description: s.HOME_DESC, inLanguage: 'en' },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Techomato', url: 'https://techomato.com', logo: url('/apple-touch-icon.png') },
      { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: games.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/play/${g.id}`), name: g.title })) },
    ],
  });
  const game = ({ s, SITE_NAME }, g) => tags({
    title: s.gameTitle(g), desc: s.gameDesc(g), path: `/play/${g.id}`, image: `/og/${g.id}.jpg`,
    json: [
      {
        '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, description: g.tagline, url: url(`/play/${g.id}`), image: url(`/og/${g.id}.jpg`),
        genre: g.genre, applicationCategory: 'Game', operatingSystem: 'Any (web browser)', inLanguage: 'en', gamePlatform: 'Web browser',
        playMode: g.badges.includes('Online') ? ['SinglePlayer', 'MultiPlayer'] : 'SinglePlayer',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }, publisher: { '@type': 'Organization', name: 'Techomato' },
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: url('/') }, { '@type': 'ListItem', position: 2, name: g.title, item: url(`/play/${g.id}`) }],
      },
    ],
  });
  // plain-HTML content for readers that do not run scripts; React replaces it when the app starts
  const body = (h) => `${BSTART}<div class="seo">${h}</div>${BEND}`;
  const homeBody = ({ games, s }) => body(`<h1>${esc(s.HOME_TITLE)}</h1><p>${esc(s.HOME_DESC)}</p><ul>${games.map(li).join('')}</ul><p><a href="/leaderboard">Leaderboard</a></p>`);
  const gameBody = ({ s }, g) => body(`<h1>${esc(g.title)}: free ${esc(g.genre)} game</h1><p>${esc(s.gameDesc(g))}</p><ul>${g.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p><a href="/">More free browser games</a></p>`);
  const board = { title: 'Leaderboard – Top Players | Techomato Games', desc: 'Weekly and all-time top players across every Techomato game. Play free in your browser and climb the ranks.', path: '/leaderboard', image: '/og.jpg' };
  let ctx;
  return {
    name: 'seo',
    async transformIndexHtml(html) { ctx ||= await load(); return html.replace(START, home(ctx)).replace(BSTART, homeBody(ctx)); },
    async closeBundle() {
      const out = path.join(process.cwd(), 'dist'); if (!fs.existsSync(path.join(out, 'index.html'))) return;
      ctx ||= await load();
      const page = fs.readFileSync(path.join(out, 'index.html'), 'utf8'); const block = new RegExp(`${START}[\\s\\S]*?${END}`);
      const bblock = new RegExp(`${BSTART}[\\s\\S]*?${BEND}`);
      for (const g of ctx.games) {
        fs.mkdirSync(path.join(out, 'play', g.id), { recursive: true });
        fs.writeFileSync(path.join(out, 'play', g.id, 'index.html'), page.replace(block, () => game(ctx, g)).replace(bblock, () => gameBody(ctx, g)));
      }
      fs.mkdirSync(path.join(out, 'leaderboard'), { recursive: true });
      fs.writeFileSync(path.join(out, 'leaderboard', 'index.html'), page.replace(block, () => tags(board)).replace(bblock, () => body('<h1>Leaderboard: top players</h1><p><a href="/">Play free browser games</a></p>')));
      const urls = [['/', 1], ['/leaderboard', 0.5], ...ctx.games.map((g) => [`/play/${g.id}`, 0.9])];
      fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr]) => `  <url><loc>${url(p)}</loc><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
      fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /profile\nDisallow: /friends\n\nSitemap: ${url('/sitemap.xml')}\n`);
    },
  };
}
