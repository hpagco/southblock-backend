import type { Env } from '../types';
import { HttpError, cached, json } from '../http';

interface ItemRow {
  id: string; name: string; description: string; kind: string; color_a: string; color_b: string; tag: string;
  price_cents: number | null; calories: number | null; image_url: string | null;
}
interface LinkRow extends ItemRow { category_id: string; section: string; sort_order: number }

/** Same rule as the Flutter app's Item.photoName, so photo lookups match. */
function photoName(name: string, kind: string): string {
  if (kind === 'wrap') return `${name} wrap`;
  if (kind === 'ibowl') return `${name} indian bowl`;
  if (kind === 'mini') return name.toLowerCase().endsWith('mini') ? name : `${name} mini`;
  return name;
}

function toItem(r: ItemRow, section = '') {
  return {
    id: r.id, // equals Flutter Item.imageKey
    name: r.name, description: r.description, kind: r.kind,
    colorA: r.color_a, colorB: r.color_b, tag: r.tag, section,
    priceCents: r.price_cents, calories: r.calories, imageUrl: r.image_url,
    photoName: photoName(r.name, r.kind),
  };
}

const ITEM_COLS = 'i.id, i.name, i.description, i.kind, i.color_a, i.color_b, i.tag, i.price_cents, i.calories, i.image_url';

async function loadCategories(env: Env) {
  const { results } = await env.DB
    .prepare('SELECT id, label, color, dark_text, divider_before, intro FROM categories WHERE is_active = 1 ORDER BY sort_order')
    .all<{ id: string; label: string; color: string; dark_text: number; divider_before: number; intro: string }>();
  return results;
}

async function loadLinks(env: Env, categoryId?: string): Promise<LinkRow[]> {
  const sql = `SELECT ci.category_id, ci.section, ci.sort_order, ${ITEM_COLS}
    FROM category_items ci JOIN items i ON i.id = ci.item_id
    WHERE i.is_active = 1 ${categoryId ? 'AND ci.category_id = ?' : ''}
    ORDER BY ci.category_id, ci.sort_order`;
  const stmt = env.DB.prepare(sql);
  const { results } = await (categoryId ? stmt.bind(categoryId) : stmt).all<LinkRow>();
  return results;
}

const catJson = (c: Awaited<ReturnType<typeof loadCategories>>[number]) => ({
  id: c.id, label: c.label, color: c.color, darkText: !!c.dark_text, dividerBefore: !!c.divider_before, intro: c.intro,
});

/** GET /api/menu: every category with its items in one request (what the app loads at startup). */
export async function getMenu(env: Env): Promise<Response> {
  const [cats, links] = await Promise.all([loadCategories(env), loadLinks(env)]);
  const by = new Map<string, ReturnType<typeof toItem>[]>();
  for (const l of links) {
    if (!by.has(l.category_id)) by.set(l.category_id, []);
    by.get(l.category_id)!.push(toItem(l, l.section));
  }
  return json({ categories: cats.map((c) => ({ ...catJson(c), items: by.get(c.id) ?? [] })) }, 200, cached);
}

/** GET /api/categories */
export async function listCategories(env: Env): Promise<Response> {
  const [cats, links] = await Promise.all([loadCategories(env), loadLinks(env)]);
  const count = new Map<string, number>();
  for (const l of links) count.set(l.category_id, (count.get(l.category_id) ?? 0) + 1);
  return json({ categories: cats.map((c) => ({ ...catJson(c), itemCount: count.get(c.id) ?? 0 })) }, 200, cached);
}

/** GET /api/categories/:id */
export async function getCategory(env: Env, id: string): Promise<Response> {
  const cat = (await loadCategories(env)).find((c) => c.id === id);
  if (!cat) throw new HttpError(404, 'Category not found');
  const links = await loadLinks(env, id);
  return json({ ...catJson(cat), items: links.map((l) => toItem(l, l.section)) }, 200, cached);
}

/** GET /api/home: the home-page chips, each with the items its carousel pages through. */
export async function getHome(env: Env): Promise<Response> {
  const chips = await env.DB
    .prepare('SELECT id, label, link_category_id, icon_item_id FROM home_categories ORDER BY sort_order')
    .all<{ id: string; label: string; link_category_id: string; icon_item_id: string }>();
  const rows = await env.DB
    .prepare(`SELECT h.home_category_id, ${ITEM_COLS} FROM home_category_items h JOIN items i ON i.id = h.item_id
              WHERE i.is_active = 1 ORDER BY h.home_category_id, h.sort_order`)
    .all<ItemRow & { home_category_id: string }>();
  const byChip = new Map<string, ItemRow[]>();
  for (const r of rows.results) {
    if (!byChip.has(r.home_category_id)) byChip.set(r.home_category_id, []);
    byChip.get(r.home_category_id)!.push(r);
  }
  const out = chips.results.map((c) => {
    const items = (byChip.get(c.id) ?? []).map((r) => toItem(r));
    return { id: c.id, label: c.label, link: c.link_category_id, icon: items.find((i) => i.id === c.icon_item_id) ?? items[0] ?? null, items };
  });
  return json({ categories: out }, 200, cached);
}

/** GET /api/search?q=warrior */
export async function search(env: Env, q: string): Promise<Response> {
  const term = q.trim();
  if (term.length < 2 || term.length > 50) throw new HttpError(400, 'q must be 2 to 50 characters');
  const like = `%${term.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const { results } = await env.DB
    .prepare(`SELECT ${ITEM_COLS} FROM items i WHERE i.is_active = 1 AND (i.name LIKE ?1 ESCAPE '\\' OR i.description LIKE ?1 ESCAPE '\\')
              ORDER BY i.name LIMIT 30`)
    .bind(like)
    .all<ItemRow>();
  return json({ query: term, items: results.map((r) => toItem(r)) });
}

/** GET /api/testimonials */
export async function getTestimonials(env: Env): Promise<Response> {
  const { results } = await env.DB
    .prepare('SELECT text, author FROM testimonials WHERE is_active = 1 ORDER BY sort_order, id')
    .all<{ text: string; author: string }>();
  return json({ testimonials: results }, 200, cached);
}

/** GET /api/locations */
export async function getLocations(env: Env): Promise<Response> {
  const { results } = await env.DB
    .prepare('SELECT id, name, address, city, state, phone, hours, lat, lng FROM locations WHERE is_active = 1 ORDER BY sort_order, name')
    .all();
  return json({ locations: results }, 200, cached);
}

/** GET /api/content: page copy and settings (hero words, promo text, perks, values...). */
export async function getContent(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT key, value FROM site_content').all<{ key: string; value: string }>();
  const out: Record<string, unknown> = {};
  for (const r of results) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return json(out, 200, cached);
}
