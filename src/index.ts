import type { Env } from './types';
import { HttpError, corsHeaders, json } from './http';
import * as menu from './routes/menu';
import * as forms from './routes/submissions';
import * as admin from './routes/admin';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const res = await route(req, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      let res: Response;
      if (e instanceof HttpError) res = json({ error: e.message, ...(e.details ? (e.details as object) : {}) }, e.status);
      else { console.error('Unhandled error', e); res = json({ error: 'Internal server error' }, 500); }
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  const seg = (re: RegExp) => path.match(re);

  if (m === 'GET') {
    if (path === '/' || path === '/api/health') return json({ ok: true, service: 'southblock-api' });
    if (path === '/api/menu') return menu.getMenu(env);
    if (path === '/api/home') return menu.getHome(env);
    if (path === '/api/categories') return menu.listCategories(env);
    let g = seg(/^\/api\/categories\/([a-z0-9-]+)$/);
    if (g) return menu.getCategory(env, g[1]);
    if (path === '/api/search') return menu.search(env, url.searchParams.get('q') ?? '');
    if (path === '/api/testimonials') return menu.getTestimonials(env);
    if (path === '/api/locations') return menu.getLocations(env);
    if (path === '/api/content') return menu.getContent(env);
    if (path === '/api/admin/submissions') return admin.listSubmissions(req, env);
  }
  if (m === 'POST') {
    if (path === '/api/catering') return forms.postCatering(req, env);
    if (path === '/api/careers/apply') return forms.postApplication(req, env);
    if (path === '/api/contact') return forms.postContact(req, env);
    if (path === '/api/rewards/signup') return forms.postRewardsSignup(req, env);
  }
  if (m === 'PATCH') {
    const g = seg(/^\/api\/admin\/items\/([a-z0-9-]+)$/);
    if (g) return admin.patchItem(req, env, g[1]);
  }
  throw new HttpError(404, 'Not found');
}
