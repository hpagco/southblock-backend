// Quick end-to-end check of a running API.  Usage: npm run smoke -- http://localhost:8787
const base = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '');
let fail = 0;
async function check(name, fn) {
  try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '->', e.message); }
}
const get = async (p) => { const r = await fetch(base + p); return { r, j: await r.json() }; };
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { r, j: await r.json() }; };
const must = (c, m) => { if (!c) throw new Error(m); };

await check('health', async () => { const { r, j } = await get('/api/health'); must(r.ok && j.ok, 'not ok'); });
await check('menu: 17 categories, 146 menu items (+1 home-carousel-only = 147)', async () => {
  const { j } = await get('/api/menu'); must(j.categories.length === 17, 'categories ' + j.categories.length);
  const ids = new Set(j.categories.flatMap((c) => c.items.map((i) => i.id))); must(ids.size === 146, 'menu items ' + ids.size);
  const h = (await get('/api/home')).j;
  const all = new Set([...ids, ...h.categories.flatMap((c) => c.items.map((i) => i.id))]); must(all.size === 147, 'total ' + all.size);
});
await check('category sections (build-your-own)', async () => {
  const { j } = await get('/api/categories/build-your-own'); must(j.items.length === 29 && j.items[0].section.startsWith('01'), 'bad sections');
});
await check('home chips (6, 3+ items each)', async () => {
  const { j } = await get('/api/home'); must(j.categories.length === 6 && j.categories.every((c) => c.items.length >= 3 && c.icon), 'bad home');
});
await check('search', async () => { const { j } = await get('/api/search?q=pumpkin'); must(j.items.length >= 3, 'few results'); });
await check('wrap photoName suffix', async () => {
  const { j } = await get('/api/categories/wraps'); must(j.items[0].photoName === 'Tandoori Chicken wrap', j.items[0].photoName);
});
await check('testimonials / locations / content', async () => {
  must((await get('/api/testimonials')).j.testimonials.length === 7, 'testimonials');
  must((await get('/api/locations')).j.locations.length >= 1, 'locations');
  must((await get('/api/content')).j['hero.words'].length === 3, 'content');
});
await check('unknown category -> 404', async () => { must((await get('/api/categories/nope')).r.status === 404, 'status'); });
await check('contact validation -> 422 with field errors', async () => {
  const { r, j } = await post('/api/contact', { name: 'A', email: 'bad', message: 'hi' });
  must(r.status === 422 && j.errors.name && j.errors.email && j.errors.message, JSON.stringify(j));
});
await check('catering rejects 5 guests', async () => {
  const { r, j } = await post('/api/catering', { name: 'Test User', email: 't@example.com', guests: 5 });
  must(r.status === 422 && j.errors.guests, JSON.stringify(j));
});
await check('catering accepts valid request', async () => {
  const { r } = await post('/api/catering', { name: 'Test User', email: 't@example.com', guests: 40, message: 'Smoke test' }); must(r.status === 201, 'status ' + r.status);
});
await check('honeypot is silently accepted', async () => {
  const { r } = await post('/api/contact', { name: 'Bot', email: 'b@example.com', message: 'spam spam', website: 'http://spam' }); must(r.status === 201, 'status ' + r.status);
});
await check('admin without token -> 401/503', async () => { const r = await fetch(base + '/api/admin/submissions?type=catering'); must([401, 503].includes(r.status), 'status ' + r.status); });
const token = process.env.ADMIN_TOKEN;
if (token) {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  await check('admin: wrong token -> 401', async () => { const r = await fetch(base + '/api/admin/submissions?type=catering', { headers: { Authorization: 'Bearer nope' } }); must(r.status === 401, 'status ' + r.status); });
  await check('admin: lists the catering request from above', async () => {
    const r = await fetch(base + '/api/admin/submissions?type=catering', { headers: auth }); const j = await r.json();
    must(r.ok && j.rows.length >= 1 && !('ip_hash' in j.rows[0]), JSON.stringify(j).slice(0, 200));
  });
  await check('admin: set a price, then read it back', async () => {
    const r = await fetch(base + '/api/admin/items/warrior-bowl', { method: 'PATCH', headers: auth, body: JSON.stringify({ priceCents: 1150, calories: 520 }) });
    must(r.ok, 'patch status ' + r.status);
    const it = (await get('/api/search?q=Warrior Bowl')).j.items.find((i) => i.id === 'warrior-bowl'); must(it.priceCents === 1150 && it.calories === 520, JSON.stringify(it));
  });
  await check('admin: bad price -> 422, unknown item -> 404', async () => {
    const a = await fetch(base + '/api/admin/items/warrior-bowl', { method: 'PATCH', headers: auth, body: JSON.stringify({ priceCents: -5 }) }); must(a.status === 422, 'bad price ' + a.status);
    const b = await fetch(base + '/api/admin/items/nope', { method: 'PATCH', headers: auth, body: JSON.stringify({ priceCents: 100 }) }); must(b.status === 404, 'unknown ' + b.status);
  });
  await check('rate limit: 6th rapid submission -> 429', async () => {
    let last = 0; for (let i = 0; i < 8; i++) last = (await post('/api/rewards/signup', { email: `rl${i}@example.com` })).r.status; must(last === 429, 'last status ' + last);
  });
}
console.log(fail ? `\n${fail} check(s) failed` : '\nAll checks passed');
process.exit(fail ? 1 : 0);
