import type { Env } from '../types';
import { HttpError, json } from '../http';
import { Validator, readJson } from '../validate';
import { enforceRateLimit, visitorHash } from '../abuse';

const ok = () => json({ ok: true, message: 'Thanks! We received your message.' }, 201);

/** Bots fill hidden fields. Pretend success, store nothing. */
const isBot = (body: Record<string, unknown>) => typeof body.website === 'string' && body.website.trim() !== '';

async function prepare(req: Request, env: Env) {
  const body = await readJson(req);
  const ipHash = await visitorHash(req, env);
  return { body, ipHash, bot: isBot(body) };
}

const log = (env: Env, ipHash: string, kind: string) =>
  env.DB.prepare('INSERT INTO submission_log (ip_hash, kind) VALUES (?, ?)').bind(ipHash, kind);

/** POST /api/catering  { name, email, phone?, eventDate?, guests (10-1000), message? } */
export async function postCatering(req: Request, env: Env): Promise<Response> {
  const { body, ipHash, bot } = await prepare(req, env);
  if (bot) return ok();
  const v = new Validator(body);
  const name = v.str('name', { min: 2, max: 100, required: true });
  const email = v.email('email');
  const phone = v.phone('phone');
  const eventDate = v.futureDate('eventDate');
  const guests = v.int('guests', { min: 10, max: 1000, required: true });
  const message = v.str('message', { max: 1000 });
  v.done();
  await enforceRateLimit(env, ipHash);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO catering_requests (name, email, phone, event_date, guests, message, ip_hash) VALUES (?,?,?,?,?,?,?)')
      .bind(name, email, phone, eventDate || null, guests, message, ipHash),
    log(env, ipHash, 'catering'),
  ]);
  return ok();
}

/** POST /api/careers/apply  { name, email, phone?, position, locationId?, availability?, message? } */
export async function postApplication(req: Request, env: Env): Promise<Response> {
  const { body, ipHash, bot } = await prepare(req, env);
  if (bot) return ok();
  const v = new Validator(body);
  const name = v.str('name', { min: 2, max: 100, required: true });
  const email = v.email('email');
  const phone = v.phone('phone');
  const position = v.str('position', { min: 2, max: 80, required: true });
  const locationId = v.str('locationId', { max: 60 });
  const availability = v.str('availability', { max: 200 });
  const message = v.str('message', { max: 1000 });
  v.done();
  if (locationId) {
    const loc = await env.DB.prepare('SELECT id FROM locations WHERE id = ? AND is_active = 1').bind(locationId).first();
    if (!loc) throw new HttpError(422, 'Please fix the highlighted fields', { errors: { locationId: 'Unknown location' } });
  }
  await enforceRateLimit(env, ipHash);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO job_applications (name, email, phone, position, location_id, availability, message, ip_hash) VALUES (?,?,?,?,?,?,?,?)')
      .bind(name, email, phone, position, locationId || null, availability, message, ipHash),
    log(env, ipHash, 'application'),
  ]);
  return ok();
}

/** POST /api/contact  { name, email, subject?, message (5-2000) } */
export async function postContact(req: Request, env: Env): Promise<Response> {
  const { body, ipHash, bot } = await prepare(req, env);
  if (bot) return ok();
  const v = new Validator(body);
  const name = v.str('name', { min: 2, max: 100, required: true });
  const email = v.email('email');
  const subject = v.str('subject', { max: 150 });
  const message = v.str('message', { min: 5, max: 2000, required: true });
  v.done();
  await enforceRateLimit(env, ipHash);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO contact_messages (name, email, subject, message, ip_hash) VALUES (?,?,?,?,?)')
      .bind(name, email, subject, message, ipHash),
    log(env, ipHash, 'contact'),
  ]);
  return ok();
}

/** POST /api/rewards/signup  { email, name? }. Always answers ok so emails can't be probed. */
export async function postRewardsSignup(req: Request, env: Env): Promise<Response> {
  const { body, ipHash, bot } = await prepare(req, env);
  if (bot) return ok();
  const v = new Validator(body);
  const email = v.email('email');
  const name = v.str('name', { max: 100 });
  v.done();
  await enforceRateLimit(env, ipHash);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO rewards_signups (email, name, ip_hash) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').bind(email, name, ipHash),
    log(env, ipHash, 'signup'),
  ]);
  return json({ ok: true, message: "You're on the list!" }, 201);
}
