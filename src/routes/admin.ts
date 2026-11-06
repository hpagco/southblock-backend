import type { Env } from '../types';
import { HttpError, json } from '../http';
import { Validator, readJson } from '../validate';
import { safeEqual } from '../abuse';

async function requireAdmin(req: Request, env: Env): Promise<void> {
  if (!env.ADMIN_TOKEN) throw new HttpError(503, 'Admin API is disabled (ADMIN_TOKEN is not set)');
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !(await safeEqual(given, env.ADMIN_TOKEN))) throw new HttpError(401, 'Unauthorized');
}

const TABLES: Record<string, string> = {
  catering: 'catering_requests',
  applications: 'job_applications',
  contact: 'contact_messages',
  signups: 'rewards_signups',
};

/** GET /api/admin/submissions?type=catering|applications|contact|signups&limit=50 */
export async function listSubmissions(req: Request, env: Env): Promise<Response> {
  await requireAdmin(req, env);
  const url = new URL(req.url);
  const table = TABLES[url.searchParams.get('type') ?? ''];
  if (!table) throw new HttpError(400, `type must be one of: ${Object.keys(TABLES).join(', ')}`);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200);
  const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return json({ type: url.searchParams.get('type'), rows: results.map(({ ip_hash: _h, ...rest }) => rest) });
}

/** PATCH /api/admin/items/:id  { priceCents?, calories?, imageUrl?, description?, isActive? }  (null clears a field) */
export async function patchItem(req: Request, env: Env, id: string): Promise<Response> {
  await requireAdmin(req, env);
  const body = await readJson(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const errors: Record<string, string> = {};

  if ('priceCents' in body) {
    const n = body.priceCents;
    if (n === null) { sets.push('price_cents = NULL'); }
    else if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100000) { sets.push('price_cents = ?'); vals.push(n); }
    else errors.priceCents = 'Whole number of cents (0 to 100000) or null';
  }
  if ('calories' in body) {
    const n = body.calories;
    if (n === null) { sets.push('calories = NULL'); }
    else if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5000) { sets.push('calories = ?'); vals.push(n); }
    else errors.calories = 'Whole number (0 to 5000) or null';
  }
  if ('imageUrl' in body) {
    const u = body.imageUrl;
    if (u === null) { sets.push('image_url = NULL'); }
    else if (typeof u === 'string' && /^https:\/\/[^\s]{4,500}$/.test(u)) { sets.push('image_url = ?'); vals.push(u); }
    else errors.imageUrl = 'An https:// URL or null';
  }
  if ('description' in body) {
    const d = new Validator({ description: body.description }).str('description', { max: 600 });
    if (typeof body.description !== 'string') errors.description = 'Must be text';
    else { sets.push('description = ?'); vals.push(d); }
  }
  if ('isActive' in body) {
    if (typeof body.isActive === 'boolean') { sets.push('is_active = ?'); vals.push(body.isActive ? 1 : 0); }
    else errors.isActive = 'true or false';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Invalid fields', { errors });
  if (!sets.length) throw new HttpError(400, 'Nothing to update');

  const res = await env.DB.prepare(`UPDATE items SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...vals, id).run();
  if (!res.meta.changes) throw new HttpError(404, 'Item not found');
  return json({ ok: true, id });
}
