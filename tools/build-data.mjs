// Turns crawled content (artifacts/content, artifacts/content-full) into src/data/*.json.
// Run: node tools/build-data.mjs  (re-run after re-crawling). All facts come from sunrooof.com; nothing is invented.
import fs from 'node:fs';
import path from 'node:path';

const C = 'artifacts/content', F = 'artifacts/content-full', OUT = 'src/data';
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const txt = f => fs.readFileSync(path.join(F, f), 'utf8');
const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);
const CDN = 'https://cdn.shopify.com/s/files/1/0693/8270/1216/files/';
export const cdn = u => (u || '').replace(/^https?:\/\/sunrooof\.com\/cdn\/shop\/files\//, CDN).replace(/^\/\//, 'https://').split('?')[0];
const articleCdn = u => (u || '').replace('https://sunrooof.com/cdn/shop/articles/', CDN.slice(0, -6) + 'articles/').split('?')[0];
const slug = u => (new URL(u).pathname.replace(/^\/|\/$/g, '') || 'home').replace(/[^a-z0-9]+/gi, '_').slice(0, 90);
fs.mkdirSync(OUT, { recursive: true });
const write = (n, d) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify(d, null, 1));

/* ---------- products ---------- */
const kindOf = h => (/remote|keypad/.test(h) ? 'accessory' : /window/.test(h) ? 'window' : 'skylight');
const familyOf = h => h.split('-')[0] === 'white' || h.includes('remote') ? 'accessories' : /window/.test(h) ? h.replace(/-white$/, '') : h.split('-')[0];
const products = [];
for (const f of fs.readdirSync(C).filter(f => f.startsWith('products_'))) {
  const d = rd(path.join(C, f));
  const s = d.shopify;
  if (!s) continue;
  const handle = new URL(d.url).pathname.split('/').pop();
  const t = lines(txt('_' + f.replace('.json', '.txt').replace('products_', 'products_')));
  const i0 = t.findIndex(l => /^SUNLIGHT IN ANY ROOM/.test(l));
  const description = /remote|keypad/.test(handle) ? '' : (t[i0 + 2] || '');
  const bookMatch = t.join(' ').match(/Book with\s*₹\s*([\d,]+)/);
  const minBilling = (t.find(l => /^Minimum Billing/.test(l)) || '');
  const raw = t.join('\n');
  const frames = {};
  for (const m of raw.matchAll(/Grid Size\s*:\s*(\d+) consoles? wide by (\d+) consoles? long\s*Frame Width\s*:\s*(\d+) mm\s*Frame (?:Length|Height)(?: \(mm\))?\s*:\s*(\d+) mm\s*Frame Depth\s*:\s*(\d+) mm(?:\s*Frame Rafter Width\s*:\s*(\d+) mm)?/g))
    frames[`${m[1]}X${m[2]}`] = { w: +m[3], l: +m[4], d: +m[5], rafter: m[6] ? +m[6] : null };
  const consoleSpec = (raw.match(/Console Size:[^\n]+/) || [''])[0];
  const remoteSpec = (raw.match(/Dimensions:[^\n]+/) || [''])[0];
  const frameMaterial = ((raw.match(/Material:\s*([^\n]*?)\s*Grid Size/) || [])[1] || '').trim();
  const fi = t.findIndex(l => /^What if it Doesn/.test(l));
  const fit = fi >= 0 ? (t[fi + 1] || '') : '';
  const guarantee = (raw.match(/SUNROOOF Offers:[^\n]+/) || [''])[0].replace('SUNROOOF Offers:', '').replace(/\.(?=\d)/g, '. ');
  const variants = s.variants.map((v, pos) => {
    const g = /^\d+X\d+$/i.test(v.title) ? v.title.toUpperCase() : null;
    const [cols, rows] = g ? g.split('X').map(Number) : [null, null];
    return { id: v.id, title: v.title, cols, rows, isDefault: pos === 0, price: v.price / 100, available: v.available, frame: g ? frames[g] || null : null };
  }).sort((a, b) => (a.cols || 0) * (a.rows || 0) - (b.cols || 0) * (b.rows || 0) || a.price - b.price);
  products.push({
    handle, title: s.title, kind: kindOf(handle), family: familyOf(handle),
    finish: (s.title.match(/(White|Wooden|Bronze|Titanium Grey|Black)/) || [''])[0],
    description, from: Math.min(...variants.map(v => v.price)), booking: bookMatch ? +bookMatch[1].replace(/,/g, '') : null,
    minBilling, guarantee, consoleSpec, remoteSpec, frameMaterial, fit,
    images: s.images.map(u => cdn(u)), variants,
    optionName: s.options[0]?.name?.replace(/^Choose /, '') || '',
    sourceUrl: d.url,
  });
}
products.sort((a, b) => a.family.localeCompare(b.family) || a.title.localeCompare(b.title));
write('products', products);

/* ---------- faqs ---------- */
{
  const t = lines(txt('_pages_faqs.txt'));
  const start = t.indexOf('Installation') + 1;
  const tabs = ['All', 'Console', 'Installation'];
  const groups = {}; let cur = 'All'; const seen = new Set();
  for (let i = start; i < t.length; i++) {
    if (tabs.includes(t[i]) && !t[i + 1]?.endsWith('?') === false) { cur = t[i]; continue; }
    if (t[i].endsWith('?') && t[i + 1] && !t[i + 1].endsWith('?')) {
      (groups[cur] ||= []); if (!groups[cur].some(q => q.q === t[i])) groups[cur].push({ q: t[i], a: t[i + 1] }); i++;
    }
  }
  const all = [], byQ = new Map();
  for (const [g, qs] of Object.entries(groups)) for (const q of qs) { const e = byQ.get(q.q) || { ...q, groups: [] }; if (!byQ.has(q.q)) { byQ.set(q.q, e); all.push(e); } e.groups.push(g); }
  write('faqs', all);
}

/* ---------- projects (delivered sites) ---------- */
// City / space / type are read from the published photo filenames (e.g. "Achyut_-_Guwahati_-_Foyer.jpg"); blank when the name doesn't say.
const CITIES = ['Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Noida', 'Gurgaon', 'Gurugram', 'Ghaziabad', 'Gaziabad', 'Coimbatore', 'Ahmedabad', 'Nagpur', 'Mohali', 'Surat', 'Kochi', 'Guwahati', 'Bhopal', 'Bareilly', 'Hapur', 'Tirupur', 'Belagavi', 'Mudhol', 'Haldwani', 'Chikhli', 'Hanumangarh', 'Mujjafarnagar'];
const CITY_FIX = { Gurgaon: 'Gurugram', Gaziabad: 'Ghaziabad', Bangalore: 'Bengaluru' };
const SPACES = [['Kitchen', 'Kitchen'], ['Living', 'Living room'], ['Drawing', 'Drawing room'], ['Bedroom', 'Bedroom'], ['Passage', 'Passage'], ['Corridor', 'Corridor'], ['Foyer', 'Foyer'], ['Entrance|Enterance|Entry', 'Entrance'], ['Staircase|Stairwell', 'Staircase'], ['Lobby', 'Lobby'], ['Conference', 'Conference room'], ['Office|MD room|Desk', 'Office'], ['Retail', 'Retail store'], ['Wardrobe|Dresser', 'Dressing area'], ['Bathroom|Powder', 'Bathroom'], ['Pooja|Mandir', 'Pooja room'], ['Nursery', 'Nursery'], ['Swimming', 'Swimming pool'], ['Study', 'Study room'], ['Lawn', 'Lawn']];
const COMMERCIAL = /commercial|commerical|office|retail|conference|hospitality|hospital|swimming/i;
const RESIDENTIAL = /home|kitchen|living|drawing|bedroom|bathroom|powder|pooja|mandir|nursery|wardrobe|dresser|passage|foyer|staircase|corridor|entrance|enterance/i;
const projects = [];
for (const f of fs.readdirSync(C).filter(f => f.startsWith('blogs_delivered_sites_'))) {
  const d = rd(path.join(C, f));
  const img = d.images.find(i => i.includes('/cdn/shop/articles/'));
  if (!img) continue;
  const file = decodeURIComponent(img.split('/').pop()).replace(/\.\w+$/, '').replace(/_[0-9a-f]{8}-.*$/, '');
  const words = file.replace(/[_-]+/g, ' ');
  const city = CITIES.find(c => new RegExp('\\b' + c + '\\b', 'i').test(words)) || '';
  const space = (SPACES.find(([k]) => new RegExp(k, 'i').test(words)) || ['', ''])[1];
  const type = COMMERCIAL.test(words) ? 'Commercial' : RESIDENTIAL.test(words) ? 'Residential' : '';
  projects.push({
    handle: new URL(d.url).pathname.split('/').pop(),
    title: (d.outline.find(o => o.startsWith('H1 ')) || '').slice(3),
    image: articleCdn(img), city: CITY_FIX[city] || city, space, type,
  });
}
projects.sort((a, b) => a.title.localeCompare(b.title));
write('projects', projects);

/* ---------- articles (news) ---------- */
const articles = [];
for (const f of fs.readdirSync(C).filter(f => f.startsWith('blogs_news_'))) {
  const d = rd(path.join(C, f));
  const body = d.text.split('\n').map(l => l.trim());
  const date = (d.text.match(/\n([A-Z][a-z]+ \d{1,2}, \d{4})\n/) || [])[1] || '';
  const h1 = (d.outline.find(o => o.startsWith('H1 ')) || '').slice(3);
  const iStart = body.findIndex(l => l === h1);
  const iEnd = body.findIndex(l => /^Crystal Clear/.test(l));
  articles.push({
    handle: new URL(d.url).pathname.split('/').pop(), title: h1 || d.title, description: d.description, date,
    image: cdn(d.ogImage) || articleCdn(d.images.find(i => /articles/.test(i))),
    body: body.slice(iStart + 1, iEnd > 0 ? iEnd : undefined).filter(Boolean),
    headings: d.outline.filter(o => /^H[23] /.test(o)).map(o => o.slice(3)),
  });
}
articles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
write('articles', articles);

/* ---------- policies ---------- */
write('policies', ['privacy-policy', 'refund-policy', 'shipping-policy', 'terms-of-service'].map(h => {
  const d = rd(path.join(C, `policies_${h.replace(/-/g, '_')}.json`));
  return { handle: h, title: d.title.replace(/ – SUNROOOF$/, ''), paragraphs: d.text.split('\n').map(l => l.trim()).filter(Boolean) };
}));

/* ---------- misc: reviews, terms ---------- */
{
  const t = lines(txt('_pages_clients.txt'));
  const reviews = [];
  for (let i = 0; i < t.length; i++) if (t[i] === 'Google' && /^—/.test(t[i + 2] || t[i + 3] || '')) { /* handled below */ }
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== 'Google') continue;
    const j = t.findIndex((l, k) => k > i && /^—\s/.test(l));
    if (j < 0) continue;
    const quote = t.slice(i + 1, j).filter(l => !/^The design and installation teams were very efficient and cooperative\.$/.test(l) || j - i === 2).join(' ');
    const name = t[j].replace(/^—\s*/, '');
    if (!reviews.some(r => r.name === name && r.quote === quote)) reviews.push({ name, quote: quote || t[i + 1] });
  }
  write('reviews', reviews);
  write('terms', lines(txt('_pages_terms_and_conditions.txt')));
}
console.log({ products: products.length, projects: projects.length, articles: articles.length });

/* ---------- downloads (size guides, catalogue, patent) ---------- */
{
  const guides = {};
  for (const [fam, f] of [['minimalist', 'pages_size_chart'], ['classical', 'pages_classical_sunrooof_size_guide'], ['modern', 'pages_modern_sunrooof_size_guide'], ['french-window', 'pages_french_window_sunrooof_size_guide'], ['arch-window', 'pages_arch_window_sunrooof_size_guide'], ['louvered-window', 'pages_louvered_window_sunrooof_size_guide']]) {
    const d = rd(path.join(C, f + '.json'));
    const get = k => (d.links.find(l => l.startsWith(`Download ${k} =>`)) || '').split('=> ')[1]?.split('?')[0];
    guides[fam] = { page: new URL(d.url).pathname, title: d.title.replace(' – SUNROOOF', ''), pdf: get('PDF'), cad: get('CAD') };
  }
  const m = rd(path.join(C, 'products_modern_white.json'));
  const pick = k => (m.links.find(l => l.startsWith(k)) || '').split('=> ')[1]?.split('?')[0];
  write('downloads', { guides, catalogue: pick('Download Our Catalog'), patent: pick('Download The Patent') });
}
